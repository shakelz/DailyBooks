import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

function createAdminClient() {
  const supabaseUrl = readFirstEnv(['PROJECT_URL', 'SUPABASE_URL'])
  const serviceRoleKey = readFirstEnv(['SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createAdminClient()
    const { data, error } = await supabaseAdmin
      .from('shops')
      .select('*')

    if (error) {
      return jsonResponse(
        {
          error: 'Failed to load terminal shops.',
          details: error.message || 'Unknown shops query error.',
        },
        500,
      )
    }

    const shops = (Array.isArray(data) ? data : [])
      .map((shop) => {
        const id = String(shop?.shop_id ?? shop?.id ?? '').trim()
        if (!id) return null
        const name = String(shop?.shop_name ?? shop?.name ?? 'Shop').trim() || 'Shop'
        const address = String(shop?.address ?? shop?.location ?? '').trim()
        return {
          id,
          name,
          address,
        }
      })
      .filter(Boolean)
      .sort((left, right) => String(left?.name ?? '').localeCompare(String(right?.name ?? '')))

    return jsonResponse({ shops })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unexpected error.' },
      500,
    )
  }
})
