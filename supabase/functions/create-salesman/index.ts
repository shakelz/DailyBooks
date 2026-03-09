import {
  buildSalesmanShadowEmail,
  corsHeaders,
  createAdminClient,
  getCallerContext,
  jsonResponse,
} from '../_shared/utils.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user: caller, role: callerRole, shopId: callerShopId, error: callerError } = await getCallerContext(req)
    if (callerError || !caller) {
      return jsonResponse({ error: callerError || 'Unauthorized.' }, 401)
    }

    if (!['super_admin', 'owner', 'admin'].includes(callerRole)) {
      return jsonResponse({ error: 'Only admin users can create salesman accounts.' }, 403)
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

    if (callerRole !== 'super_admin' && callerShopId !== shopId) {
      return jsonResponse({ error: 'You can only create salesman accounts for your own shop.' }, 403)
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
