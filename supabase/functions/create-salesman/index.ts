import {
  buildSalesmanShadowEmail,
  corsHeaders,
  createAdminClient,
  jsonResponse,
  reconcileProfileRow,
  requireAdminFunctionSecret,
  sha256Hex,
} from '../_shared/utils.ts'

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
      return jsonResponse({ error: error?.message || 'Failed to create salesman account.' }, 400)
    }

    const profileResult = await reconcileProfileRow(supabaseAdmin, {
      userId: data.user.id,
      shopId,
      updates: {
        full_name: name,
        name,
        email: shadowEmail,
        role: 'salesman',
        shop_id: shopId,
        pin,
        pin_digest: pinDigest,
        active: true,
        is_online: false,
      },
    })

    if (profileResult.error || !profileResult.data) {
      await supabaseAdmin.auth.admin.deleteUser(data.user.id)
      return jsonResponse(
        {
          error: profileResult.error?.message || 'Failed to reconcile salesman profile after auth creation.',
        },
        500,
      )
    }

    return jsonResponse({
      userId: data.user.id,
      email: data.user.email,
      shopId,
      profile: profileResult.data,
    })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error.' }, 500)
  }
})
