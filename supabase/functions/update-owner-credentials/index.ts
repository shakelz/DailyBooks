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
      return jsonResponse({ error: 'Only super_admin can update owner credentials.' }, 403)
    }

    const body = await req.json()
    const shopId = String(body?.shopId ?? '').trim()
    const ownerEmail = String(body?.ownerEmail ?? '').trim().toLowerCase()
    const ownerPassword = String(body?.ownerPassword ?? '').trim()

    if (!shopId) {
      return jsonResponse({ error: 'shopId is required.' }, 400)
    }
    if (!ownerEmail && !ownerPassword) {
      return jsonResponse({ error: 'ownerEmail or ownerPassword is required.' }, 400)
    }

    const supabaseAdmin = createAdminClient()
    const { data: ownerProfiles, error: ownerProfileError } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .eq('shop_id', shopId)
      .in('role', ['owner', 'admin'])
      .limit(1)

    if (ownerProfileError) {
      return jsonResponse({ error: ownerProfileError.message || 'Failed to load owner profile.' }, 400)
    }

    const ownerUserId = String(ownerProfiles?.[0]?.user_id ?? '').trim()
    if (!ownerUserId) {
      return jsonResponse({ error: 'No owner profile found for this shop.' }, 404)
    }

    const updatePayload: { email?: string; password?: string; email_confirm?: boolean } = {}
    if (ownerEmail) {
      updatePayload.email = ownerEmail
      updatePayload.email_confirm = true
    }
    if (ownerPassword) {
      updatePayload.password = ownerPassword
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(ownerUserId, updatePayload)
    if (error || !data.user) {
      return jsonResponse({ error: error?.message || 'Failed to update owner credentials.' }, 400)
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
