import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function readFirstEnv(keys: string[]) {
  for (const key of keys) {
    const value = Deno.env.get(key)
    if (value && String(value).trim()) {
      return String(value).trim()
    }
  }
  return ''
}

function getProjectUrl() {
  return readFirstEnv(['PROJECT_URL', 'SUPABASE_URL'])
}

function getServiceRoleKey() {
  return readFirstEnv(['SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])
}

function getAdminFunctionSecret() {
  return readFirstEnv(['ADMIN_FUNCTION_SECRET'])
}

function requireAdminFunctionSecret(req: Request, bodySecret: unknown = '') {
  const expectedSecret = getAdminFunctionSecret()
  const authorizationHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? ''
  const headerSecret = authorizationHeader.toLowerCase().startsWith('bearer ')
    ? authorizationHeader.slice(7).trim()
    : authorizationHeader.trim()
  const providedSecret = String(bodySecret ?? '').trim() || headerSecret

  if (!expectedSecret) {
    return {
      ok: false,
      response: jsonResponse({ error: 'ADMIN_FUNCTION_SECRET is not configured.' }, 500),
    }
  }

  if (providedSecret !== expectedSecret) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Unauthorized' }, 401),
    }
  }

  return { ok: true, response: null }
}

function createAdminClient() {
  const supabaseUrl = getProjectUrl()
  const serviceRoleKey = getServiceRoleKey()

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing PROJECT_URL/SUPABASE_URL or SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function sleep(ms = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForProfileByUserId(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  userId: unknown,
  shopId: unknown = '',
  attempts = 8,
  delayMs = 250,
) {
  const uid = String(userId ?? '').trim()
  const sid = String(shopId ?? '').trim()
  if (!uid) return null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let query = supabaseAdmin.from('profiles').select('*').eq('user_id', uid)
    if (sid) {
      query = query.eq('shop_id', sid)
    }
    const { data, error } = await query.maybeSingle()
    if (!error && data) {
      return data
    }
    if (attempt < attempts - 1) {
      await sleep(delayMs)
    }
  }

  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!String(serviceRoleKey).trim()) {
      return jsonResponse({ error: 'SUPABASE_SERVICE_ROLE_KEY secret is not configured.' }, 500)
    }

    const projectUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL') ?? ''
    if (!String(projectUrl).trim()) {
      return jsonResponse({ error: 'PROJECT_URL/SUPABASE_URL is not set.' }, 500)
    }

    const body = await req.json()
    const secretCheck = requireAdminFunctionSecret(req, body?._adminSecret)
    if (!secretCheck.ok) {
      return secretCheck.response
    }

    const ownerName = String(body?.ownerName ?? '').trim()
    const ownerEmail = String(body?.ownerEmail ?? '').trim().toLowerCase()
    const ownerPassword = String(body?.ownerPassword ?? '').trim()
    const shopId = String(body?.shopId ?? body?.newShopId ?? '').trim()

    if (!ownerEmail || !ownerPassword || !ownerName || !shopId) {
      return jsonResponse(
        {
          error: 'Missing required fields.',
          missing: {
            ownerEmail: !ownerEmail,
            ownerPassword: !ownerPassword,
            ownerName: !ownerName,
            shopId: !shopId,
          },
        },
        400,
      )
    }

    const supabaseAdmin = createAdminClient()
    const { data: shopRow, error: shopLookupError } = await supabaseAdmin
      .from('shops')
      .select('shop_id')
      .eq('shop_id', shopId)
      .maybeSingle()

    if (shopLookupError) {
      return jsonResponse(
        {
          error: 'Failed to validate shop before owner creation.',
          details: shopLookupError.message || 'Unknown shop lookup error.',
          shopId,
        },
        500,
      )
    }

    if (!shopRow) {
      return jsonResponse({ error: 'shopId does not exist in shops table.', shopId }, 400)
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: {
        role: 'owner',
        shop_id: shopId,
        name: ownerName,
        full_name: ownerName,
      },
    })

    if (error || !data.user) {
      return jsonResponse(
        {
          error: error?.message || 'Failed to create owner account.',
          details: String(error?.message || error || 'Unknown createUser failure.'),
        },
        400,
      )
    }

    const profile = await waitForProfileByUserId(supabaseAdmin, data.user.id, shopId, 10, 300)

    return jsonResponse({
      success: true,
      userId: data.user.id,
      email: data.user.email,
      shopId,
      profile,
    })
  } catch (err) {
    return jsonResponse(
      {
        error: err instanceof Error ? err.message : 'Unknown error',
        details: String(err),
      },
      500,
    )
  }
})
