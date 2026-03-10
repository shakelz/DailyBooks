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

function isUserMissingError(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? '').toLowerCase()
  return message.includes('user not found') || message.includes('not found')
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

    const userId = String(body?.userId ?? '').trim()
    const shopId = String(body?.shopId ?? '').trim()

    if (!userId) {
      return jsonResponse({ error: 'userId is required.' }, 400)
    }

    const supabaseAdmin = createAdminClient()

    let profileQuery = supabaseAdmin
      .from('profiles')
      .select('user_id, shop_id, role, email')
      .eq('user_id', userId)
      .eq('role', 'salesman')

    if (shopId) {
      profileQuery = profileQuery.eq('shop_id', shopId)
    }

    const { data: profileRows, error: profileLookupError } = await profileQuery

    if (profileLookupError) {
      return jsonResponse({ error: profileLookupError.message || 'Failed to load salesman profile.' }, 400)
    }

    const salesmanProfile = Array.isArray(profileRows) ? profileRows[0] : null

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteAuthError && !isUserMissingError(deleteAuthError)) {
      return jsonResponse({ error: deleteAuthError.message || 'Failed to delete auth user.' }, 400)
    }

    let profileDeleteQuery = supabaseAdmin.from('profiles').delete().eq('user_id', userId)
    if (shopId) {
      profileDeleteQuery = profileDeleteQuery.eq('shop_id', shopId)
    }
    const { error: profileDeleteError } = await profileDeleteQuery
    if (profileDeleteError) {
      return jsonResponse({ error: profileDeleteError.message || 'Failed to delete salesman profile.' }, 400)
    }

    const { error: attendanceDeleteError } = await supabaseAdmin
      .from('attendance')
      .delete()
      .eq('user_id', userId)
      .eq('shop_id', shopId || String(salesmanProfile?.shop_id ?? '').trim())

    if (attendanceDeleteError) {
      console.warn('delete-salesman-v2 attendance cleanup failed:', attendanceDeleteError)
    }

    return jsonResponse({
      success: true,
      userId,
      shopId: shopId || String(salesmanProfile?.shop_id ?? '').trim(),
      email: String(salesmanProfile?.email ?? '').trim().toLowerCase(),
    })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error.' }, 500)
  }
})
