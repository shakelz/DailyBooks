import {
  buildSalesmanShadowEmail,
  corsHeaders,
  createAdminClient,
  jsonResponse,
  requireAdminFunctionSecret,
} from '../_shared/utils.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const secretCheck = requireAdminFunctionSecret(req)
    if (!secretCheck.ok) {
      return secretCheck.response
    }

    const body = await req.json()
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
    const supabaseAdmin = createAdminClient()
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: shadowEmail,
      password: pin,
      email_confirm: true,
      user_metadata: {
        role: 'salesman',
        shop_id: shopId,
        name,
        pin,
      },
    })

    if (error || !data.user) {
      return jsonResponse({ error: error?.message || 'Failed to create salesman account.' }, 400)
    }

    return jsonResponse({
      userId: data.user.id,
      email: data.user.email,
      shopId,
    })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error.' }, 500)
  }
})
