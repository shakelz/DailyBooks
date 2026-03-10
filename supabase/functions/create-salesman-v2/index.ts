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

function normalizeShadowEmailName(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'user'
}

function buildSalesmanShadowEmail(name: unknown, pin: unknown) {
  return `${normalizeShadowEmailName(name)}_${String(pin ?? '').trim()}@carefone.de`
}

async function sha256Hex(value: unknown) {
  const normalized = String(value ?? '')
  const encoded = new TextEncoder().encode(normalized)
  const digestBuffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digestBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
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

function isDuplicateAuthUserError(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? '').toLowerCase()
  return message.includes('already been registered')
    || message.includes('already registered')
    || message.includes('user already exists')
    || message.includes('duplicate')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const secretCheck = requireAdminFunctionSecret(req, body?._adminSecret)
    if (!secretCheck.ok) {
      return secretCheck.response
    }

    const name = String(body?.name ?? '').trim()
    const pin = String(body?.pin ?? '').trim()
    const shopId = String(body?.shop_id ?? '').trim()

    if (!name) {
      return jsonResponse({ error: 'name is required.' }, 400)
    }
    if (!/^\d{4}$/.test(pin)) {
      return jsonResponse({ error: 'pin must be exactly 4 digits.' }, 400)
    }
    if (!shopId) {
      return jsonResponse({ error: 'shop_id is required.' }, 400)
    }

    const shadowEmail = buildSalesmanShadowEmail(name, pin)
    const pinDigest = await sha256Hex(pin)
    const supabaseAdmin = createAdminClient()
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: shadowEmail,
      password: pin,
      email_confirm: true,
      user_metadata: {
        role: 'salesman',
        shop_id: shopId,
        name,
        full_name: name,
        pin,
        pin_digest: pinDigest,
      },
    })

    if (error || !data.user) {
      if (isDuplicateAuthUserError(error)) {
        const { data: existingProfile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('shop_id', shopId)
          .eq('email', shadowEmail)
          .eq('role', 'salesman')
          .maybeSingle()

        if (!profileError && existingProfile) {
          return jsonResponse({
            userId: String(existingProfile.user_id ?? '').trim(),
            email: shadowEmail,
            shopId,
            profile: existingProfile,
            existing: true,
          })
        }
      }
      return jsonResponse({ error: error?.message || 'Failed to create salesman account.' }, 400)
    }

    const profile = await waitForProfileByUserId(supabaseAdmin, data.user.id, shopId, 10, 300)

    return jsonResponse({
      userId: data.user.id,
      email: data.user.email,
      shopId,
      profile,
    })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error.' }, 500)
  }
})
