// supabase/functions/developer-api-usage-report/index.ts
// =====================================================================
// Reports this month's billable participant-minutes to Stripe for every
// pay-as-you-go developer account (migration 0347's "Option B"), so
// Stripe's metered subscription actually invoices for real usage.
// Invoked periodically by pg_cron via net.http_post — see the cron
// migration this ships with for the schedule.
//
// Uses action='set' with the CUMULATIVE month-to-date total (not a delta
// since the last run) — same idempotency pattern as this repo's other
// metered-usage writeups (see [[project-live-translation-billing-phase2]]
// in memory, or ministry-checkout's add-on purchases for the general
// shape): re-running this on a partial failure, or twice in the same
// tick, just re-sets the same number rather than double-counting.
//
// NOT YET LIVE-TESTED against a real Stripe account — this repo's own
// standing rule is "must be tested fully in Stripe test mode before
// touching a real charge" (see the Live Translation billing memory).
// Test with Stripe test-mode keys + a real test subscription before
// pointing this at production keys.
//
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// verify_jwt should be OFF (called by pg_cron/net.http_post with the
// service role key as a bearer token, not a Supabase user JWT).
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Mirrors meetings-api's FREE_TIER.monthlyHours — kept in sync manually
// (no shared module between these Edge Functions).
const FREE_TIER_MONTHLY_MINUTES = 10 * 60;

interface DeveloperAccountRow {
  owner_user_id: string;
  stripe_subscription_item_id: string;
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!STRIPE_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response('Server configuration missing', { status: 500 });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: accounts, error: accountsErr } = await admin
      .from('developer_accounts')
      .select('owner_user_id, stripe_subscription_item_id')
      .eq('plan', 'pay_as_you_go')
      .not('stripe_subscription_item_id', 'is', null);
    if (accountsErr) throw accountsErr;

    const results: Array<{ ownerUserId: string; billableMinutes: number; ok: boolean; error?: string }> = [];
    const nowUnix = Math.floor(Date.now() / 1000);

    for (const account of (accounts ?? []) as DeveloperAccountRow[]) {
      try {
        const { data: minutesRaw, error: minutesErr } = await admin.rpc('get_developer_participant_minutes', {
          p_owner_user_id: account.owner_user_id,
        });
        if (minutesErr) throw minutesErr;
        const participantMinutes = Number(minutesRaw ?? 0);
        const billableMinutes = Math.max(0, Math.round(participantMinutes - FREE_TIER_MONTHLY_MINUTES));

        const r = await fetch(
          `https://api.stripe.com/v1/subscription_items/${account.stripe_subscription_item_id}/usage_records`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `quantity=${billableMinutes}&timestamp=${nowUnix}&action=set`,
          },
        );
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error?.message || `Stripe usage_records ${r.status}`);
        }
        results.push({ ownerUserId: account.owner_user_id, billableMinutes, ok: true });
      } catch (err) {
        console.error('[developer-api-usage-report] failed for', account.owner_user_id, err);
        results.push({
          ownerUserId: account.owner_user_id,
          billableMinutes: 0,
          ok: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return new Response(JSON.stringify({ reported: results.length, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('developer-api-usage-report error:', error);
    return new Response(error instanceof Error ? error.message : 'Unknown error', { status: 500 });
  }
});
