import { corsHeaders, createAdminClient, getCallerContext, jsonResponse } from '../_shared/utils.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user: caller, role: callerRole, error: callerError } = await getCallerContext(req)
    if (callerError || !caller) {
      return jsonResponse({ error: callerError || 'Unauthorized.' }, 401)
    }

    if (callerRole !== 'super_admin') {
      return jsonResponse({ error: 'Only super_admin can create owner accounts.' }, 403)
    }

    const body = await req.json()
    const ownerName = String(body?.ownerName ?? '').trim()
    const ownerEmail = String(body?.ownerEmail ?? '').trim().toLowerCase()
    const ownerPassword = String(body?.ownerPassword ?? '').trim()
    const newShopId = String(body?.newShopId ?? '').trim()

    if (!ownerName) {
      return jsonResponse({ error: 'ownerName is required.' }, 400)
    }
    if (!ownerEmail) {
      return jsonResponse({ error: 'ownerEmail is required.' }, 400)
    }
    if (!ownerPassword) {
      return jsonResponse({ error: 'ownerPassword is required.' }, 400)
    }
    if (!newShopId) {
      return jsonResponse({ error: 'newShopId is required.' }, 400)
    }

    const supabaseAdmin = createAdminClient()
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: {
        role: 'owner',
        shop_id: newShopId,
        name: ownerName,
      },
    })

    if (error || !data.user) {
      return jsonResponse({ error: error?.message || 'Failed to create owner account.' }, 400)
    }

    return jsonResponse({
      userId: data.user.id,
      email: data.user.email,
      shopId: newShopId,
    })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error.' }, 500)
  }
})
