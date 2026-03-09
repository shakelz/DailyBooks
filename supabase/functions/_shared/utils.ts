import { createClient } from 'jsr:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

export function normalizeRole(value: unknown) {
  const role = String(value ?? '').trim().toLowerCase()
  if (role === 'superadmin' || role === 'superuser') return 'super_admin'
  return role
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

export function buildSalesmanShadowEmail(name: unknown, pin: unknown) {
  return `${normalizeShadowEmailName(name)}_${String(pin ?? '').trim()}@carefone.de`
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

function getAnonKey() {
  return readFirstEnv(['ANON_KEY', 'SUPABASE_ANON_KEY', 'PUBLIC_ANON_KEY'])
}

export function getAdminFunctionSecret() {
  return readFirstEnv(['ADMIN_FUNCTION_SECRET'])
}

export function requireAdminFunctionSecret(req: Request) {
  const expectedSecret = getAdminFunctionSecret()
  const providedSecret = req.headers.get('x-admin-secret') ?? ''

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

export function createAdminClient() {
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

export async function getCallerUser(req: Request) {
  const supabaseUrl = getProjectUrl()
  const anonKey = getAnonKey() || getServiceRoleKey()
  const authHeader = req.headers.get('Authorization') ?? ''

  if (!supabaseUrl || !anonKey) {
    return { user: null, error: 'Missing PROJECT_URL/SUPABASE_URL and ANON_KEY/SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY).' }
  }

  if (!authHeader) {
    return { user: null, error: 'Missing authorization header.' }
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { data, error } = await supabase.auth.getUser()
  return {
    user: data.user ?? null,
    error: error?.message ?? '',
  }
}

export function resolveUserRole(user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> } | null, profile: { role?: unknown } | null = null) {
  return normalizeRole(user?.user_metadata?.role ?? user?.app_metadata?.role ?? profile?.role)
}

export function resolveUserShopId(
  user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> } | null,
  profile: { shop_id?: unknown } | null = null,
) {
  return String(user?.user_metadata?.shop_id ?? user?.app_metadata?.shop_id ?? profile?.shop_id ?? '').trim()
}

export async function getCallerContext(req: Request) {
  const { user, error } = await getCallerUser(req)
  if (error || !user) {
    return {
      user: null,
      profile: null,
      role: '',
      shopId: '',
      error: error || 'Unauthorized.',
    }
  }

  let profile: { role?: unknown; shop_id?: unknown } | null = null
  try {
    const supabaseAdmin = createAdminClient()
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('role, shop_id')
      .eq('user_id', user.id)
      .maybeSingle()
    profile = data ?? null
  } catch {
    profile = null
  }

  return {
    user,
    profile,
    role: resolveUserRole(user, profile),
    shopId: resolveUserShopId(user, profile),
    error: '',
  }
}
