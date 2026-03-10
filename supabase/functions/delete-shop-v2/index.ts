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

function isMissingRelationError(error: unknown, relationName = '') {
  const message = String((error as { message?: unknown } | null)?.message ?? '').toLowerCase()
  const isMissing = message.includes('does not exist')
    || message.includes('could not find the table')
    || message.includes('in the schema cache')
  if (!isMissing) return false
  if (!relationName) return true
  return message.includes(String(relationName).toLowerCase())
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

    const shopId = String(body?.shopId ?? '').trim()
    if (!shopId) {
      return jsonResponse({ error: 'shopId is required.' }, 400)
    }

    const supabaseAdmin = createAdminClient()

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, email, role')
      .eq('shop_id', shopId)

    if (profilesError) {
      return jsonResponse({ error: profilesError.message || 'Failed to load shop profiles.' }, 400)
    }

    const userIds = Array.from(new Set((Array.isArray(profiles) ? profiles : [])
      .map((row) => String(row?.user_id ?? '').trim())
      .filter(Boolean)))

    for (const userId of userIds) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (error && !isUserMissingError(error)) {
        return jsonResponse({ error: error.message || `Failed to delete auth user ${userId}.` }, 400)
      }
    }

    const dependentTables = [
      'attendance',
      'transactions',
      'repairs',
      'categories',
      'inventory',
      'online_part_orders',
      'supplier_links',
      'kpi_profit_category_settings',
      'profiles',
    ]

    for (const tableName of dependentTables) {
      const { error } = await supabaseAdmin.from(tableName).delete().eq('shop_id', shopId)
      if (error && !isMissingRelationError(error, tableName)) {
        return jsonResponse({ error: error.message || `Failed to cleanup ${tableName}.` }, 400)
      }
    }

    const { error: shopDeleteError } = await supabaseAdmin.from('shops').delete().eq('shop_id', shopId)
    if (shopDeleteError) {
      return jsonResponse({ error: shopDeleteError.message || 'Failed to delete shop.' }, 400)
    }

    return jsonResponse({
      success: true,
      shopId,
      deletedUsers: userIds,
    })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error.' }, 500)
  }
})
