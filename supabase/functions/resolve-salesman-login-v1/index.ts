import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

async function sha256Hex(value: unknown) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return ''

  const encoded = new TextEncoder().encode(normalized)
  const digestBuffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digestBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const rawPin = String(body?.pin ?? '').trim()
    const providedPinDigest = String(body?.pinDigest ?? body?.pin_digest ?? '').trim().toLowerCase()
    const pinDigest = /^[a-f0-9]{64}$/.test(providedPinDigest)
      ? providedPinDigest
      : await sha256Hex(rawPin)

    if (!/^[a-f0-9]{64}$/.test(pinDigest)) {
      return jsonResponse({ error: 'Invalid PIN. Try again.' }, 400)
    }

    const supabaseAdmin = createAdminClient()
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('user_id, full_name, email, shop_id, role, active')
      .eq('pin_digest', pinDigest)
      .eq('role', 'salesman')
      .eq('active', true)
      .maybeSingle()

    if (error) {
      return jsonResponse(
        {
          error: 'Failed to resolve salesman login.',
          details: error.message || 'Unknown profiles query error.',
        },
        500,
      )
    }

    if (!data) {
      return jsonResponse({ error: 'Invalid PIN. Try again.' }, 400)
    }

    return jsonResponse({
      userId: String(data.user_id ?? '').trim(),
      fullName: String(data.full_name ?? '').trim(),
      email: String(data.email ?? '').trim().toLowerCase(),
      shopId: String(data.shop_id ?? '').trim(),
      role: 'salesman',
      active: data.active !== false,
    })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unexpected error.' },
      500,
    )
  }
})
