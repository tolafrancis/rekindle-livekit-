// Supabase Edge Function: ministry-connect-onboarding
// =====================================================================
// Stripe Connect (Express) onboarding for ministries accepting donations.
// Caller must be a leader/admin/owner of ministryId (same is_group_admin
// check as ministry-checkout).
//
// Requests (POST):
//   { action:'start',   ministryId, returnUrl, country } -> { url }   (redirect admin to Stripe;
//                                                                      country is a 2-letter ISO
//                                                                      code, must match the
//                                                                      ministry's real bank
//                                                                      account's country — Stripe
//                                                                      locks it in permanently)
//   { action:'refresh', ministryId, returnUrl } -> { url }   (stale/expired Account Link)
//   { action:'status',  ministryId }             -> { connected, chargesEnabled,
//                                                      payoutsEnabled, detailsSubmitted,
//                                                      disabledReason, currentlyDue }
//
// Secrets: STRIPE_SECRET_KEY (same platform key used by ministry-checkout /
// stripe-subscription — Connect accounts are created UNDER whichever key
// makes the POST /v1/accounts call).
//
// account.updated events (Connect account status changes) are handled by
// ministry-donation-webhook, not here — this function only drives the
// synchronous onboarding UI flow and an on-demand status refresh.
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function flattenForStripe(obj: Record<string, any>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenForStripe(v, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'object') Object.assign(result, flattenForStripe(item, `${key}[${i}]`));
        else result[`${key}[${i}]`] = String(item);
      });
    } else {
      result[key] = String(v);
    }
  }
  return result;
}

async function stripeCall(method: string, path: string, secretKey: string, body?: Record<string, any>): Promise<any> {
  const init: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
  };
  if (body) init.body = new URLSearchParams(flattenForStripe(body)).toString();
  const res = await fetch(`https://api.stripe.com/v1${path}`, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe error ${res.status}`);
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, ministryId, returnUrl, country } = await req.json();
    if (!action || !ministryId) return json({ error: 'action and ministryId are required' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_KEY) return json({ error: 'Stripe is not configured' }, 500);

    // Authorize: caller must administer this ministry.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: isAdmin } = await admin.rpc('is_group_admin', { p_ministry_id: ministryId, p_user_id: user.id });
    if (!isAdmin) return json({ error: 'Not authorized to manage payment settings for this ministry' }, 403);

    const { data: existing } = await admin
      .from('ministry_stripe_connect').select('*').eq('ministry_id', ministryId).maybeSingle();

    // ── Status: server-authoritative refresh from Stripe ─────────────────
    if (action === 'status') {
      if (!existing) return json({ connected: false });

      const acct = await stripeCall('GET', `/accounts/${existing.stripe_account_id}`, STRIPE_KEY);
      const chargesEnabled = !!acct.charges_enabled;
      const payoutsEnabled = !!acct.payouts_enabled;
      const detailsSubmitted = !!acct.details_submitted;
      const disabledReason = acct.requirements?.disabled_reason ?? null;
      const currentlyDue = acct.requirements?.currently_due ?? [];

      await admin.from('ministry_stripe_connect').update({
        charges_enabled: chargesEnabled,
        payouts_enabled: payoutsEnabled,
        details_submitted: detailsSubmitted,
        disabled_reason: disabledReason,
        currently_due: currentlyDue,
        ...(chargesEnabled && payoutsEnabled && !existing.onboarding_completed_at
          ? { onboarding_completed_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      }).eq('ministry_id', ministryId);

      return json({
        connected: true,
        chargesEnabled, payoutsEnabled, detailsSubmitted,
        disabledReason, currentlyDue,
      });
    }

    // ── Start / refresh: create (if needed) + link ────────────────────────
    if (action === 'start' || action === 'refresh') {
      if (!returnUrl) return json({ error: 'returnUrl is required' }, 400);

      let accountId = existing?.stripe_account_id;

      if (!accountId) {
        if (action === 'refresh') return json({ error: 'No Stripe Connect account started yet — use action "start" first.' }, 400);

        // Country is picked by the admin in the onboarding UI (matching the
        // ministry's real bank account) and passed in at 'start' — Stripe
        // Express requires the account's country to match where the bank
        // account actually is, and Stripe locks it in permanently once set
        // (can't be changed later without creating a new account).
        const accountCountry = /^[A-Z]{2}$/.test(country || '') ? country : 'US';

        const account = await stripeCall('POST', '/accounts', STRIPE_KEY, {
          type: 'express',
          country: accountCountry,
          business_type: 'non_profit',
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          metadata: { ministry_id: ministryId },
        });
        accountId = account.id;

        await admin.from('ministry_stripe_connect').insert({
          ministry_id: ministryId,
          stripe_account_id: accountId,
          onboarding_started_at: new Date().toISOString(),
        });
      }

      const link = await stripeCall('POST', '/account_links', STRIPE_KEY, {
        account: accountId,
        refresh_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}connect=refresh`,
        return_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}connect=return`,
        type: 'account_onboarding',
      });

      return json({ url: link.url });
    }

    return json({ error: "Invalid action. Use 'start', 'refresh', or 'status'" }, 400);

  } catch (error: any) {
    console.error('Ministry Connect onboarding error:', error);
    return json({ error: error.message || 'An unexpected error occurred' }, 500);
  }
});
