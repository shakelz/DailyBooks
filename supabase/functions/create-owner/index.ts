import { corsHeaders, createAdminClient, getCallerContext, jsonResponse } from '../_shared/utils.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!String(serviceRoleKey).trim()) {
      console.error('create-owner error: service role key is not set')
      return jsonResponse({ error: 'SUPABASE_SERVICE_ROLE_KEY secret is not configured.' }, 500)
    }

    const projectUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL') ?? ''
    if (!String(projectUrl).trim()) {
      console.error('create-owner error: project url is not set')
      return jsonResponse({ error: 'PROJECT_URL/SUPABASE_URL is not set.' }, 500)
    }

    const { user: caller, role: callerRole, error: callerError } = await getCallerContext(req)
    if (callerError || !caller) {
      return jsonResponse({ error: callerError || 'Unauthorized.' }, 401)
    }

    if (callerRole !== 'super_admin') {
      return jsonResponse({ error: 'Only super_admin can create owner accounts.' }, 403)
    }

    let body: Record<string, unknown> | null = null
    try {
      body = await req.json()
    } catch (err) {
      console.error('create-owner error: invalid JSON body', err)
      return jsonResponse(
        {
          error: 'Invalid JSON body.',
          details: err instanceof Error ? err.message : String(err),
        },
        400,
      )
    }

    const ownerName = String(body?.ownerName ?? '').trim()
    const ownerEmail = String(body?.ownerEmail ?? '').trim().toLowerCase()
    const ownerPassword = String(body?.ownerPassword ?? '').trim()
    const shopId = String(body?.shopId ?? body?.newShopId ?? '').trim()

    if (!ownerEmail || !ownerPassword || !ownerName || !shopId) {
      console.error('create-owner error: missing required fields', {
        ownerEmail,
        ownerName,
        shopId,
      })
      return jsonResponse(
        {
          error: 'Missing required fields.',
          missing: {
            ownerEmail: !ownerEmail,
            ownerPassword: !ownerPassword,
            ownerName: !ownerName,
            shopId: !shopId,
          },
        },
        400,
      )
    }

    const supabaseAdmin = createAdminClient()
    const { data: shopRow, error: shopLookupError } = await supabaseAdmin
      .from('shops')
      .select('shop_id')
      .eq('shop_id', shopId)
      .maybeSingle()

    if (shopLookupError) {
      console.error('create-owner error: failed to validate shop', shopLookupError)
      return jsonResponse(
        {
          error: 'Failed to validate shop before owner creation.',
          details: shopLookupError.message || 'Unknown shop lookup error.',
          shopId,
        },
        500,
      )
    }

    if (!shopRow) {
      console.error('create-owner error: shop does not exist', { shopId })
      return jsonResponse(
        {
          error: 'shopId does not exist in shops table.',
          shopId,
        },
        400,
      )
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: {
        role: 'owner',
        shop_id: shopId,
        name: ownerName,
      },
    })

    if (error || !data.user) {
      console.error('create-owner error: auth.admin.createUser failed', error)
      return jsonResponse(
        {
          error: error?.message || 'Failed to create owner account.',
          details: String(error?.message || error || 'Unknown createUser failure.'),
        },
        400,
      )
    }

    return jsonResponse({
      success: true,
      userId: data.user.id,
      email: data.user.email,
      shopId,
    })
  } catch (err) {
    console.error('create-owner error:', err)
    return jsonResponse(
      {
        error: err instanceof Error ? err.message : 'Unknown error',
        details: String(err),
      },
      500,
    )
  }
})
