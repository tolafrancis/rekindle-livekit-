// Supabase Edge Function: ministry-intro-rollover
// =====================================================================
// Launch offer (0417), Paystack only. Paystack subscriptions can't take a
// coupon or change plan, so a ministry on the launch offer pays through a
// separate intro plan. Once its intro period is nearly over, this function
// starts a subscription on the normal plan with the same saved card,
// beginning on the intro subscription's next payment date, then disables
// the intro subscription so it never takes another intro payment.
// (Stripe needs nothing here: its coupon simply stops after 3 months.)
//
// Runs daily from pg_cron with the service-role key (see 0417). A platform
// admin can also call it, with { dryRun: true } to see what it would do.
//
// A failure is logged and reported to Sentry, and the row is left for the
// next run, so a Naira ministry is never silently left on the intro price.
//
// Secrets: PAYSTACK_SECRET_KEY.
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as Sentry from 'npm:@sentry/deno@^10';

Sentry.init({ dsn: Deno.env.get('SENTRY_DSN'), defaultIntegrations: false, tracesSampleRate: 0 });
Sentry.setTag('function', 'ministry-intro-rollover');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Roll over this many days before the intro period ends, so the intro
// subscription is disabled before it can take one more intro payment.
const LEAD_DAYS = 2;

function jwtRole(authHeader: string | null): string | null {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
    return JSON.parse(decoded)?.role ?? null;
  } catch {
    return null;
  }
}

interface DueRow {
  id: string;
  ministry_id: string;
  plan_type: string;
  intro_ends_at: string;
  paystack_subscription_code: string | null;
  paystack_customer_code: string | null;
  paystack_authorization_code: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Cron (service-role JWT, verified at the gateway) or a platform admin.
  const authHeader = req.headers.get('Authorization');
  if (jwtRole(authHeader) !== 'service_role') {
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const { data: profile } = await db.from('user_profiles').select('role').eq('user_id', user.id).maybeSingle();
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) return json({ error: 'Admin access required.' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;

  const PAYSTACK_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!PAYSTACK_KEY) return json({ error: 'Paystack not configured' }, 500);
  const paystack = async (path: string, init?: { method?: string; body?: unknown }) => {
    const r = await fetch(`https://api.paystack.co${path}`, {
      method: init?.method ?? 'GET',
      headers: { Authorization: `Bearer ${PAYSTACK_KEY}`, 'Content-Type': 'application/json' },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.status) throw new Error(`Paystack ${path}: ${j?.message ?? r.status}`);
    return j.data;
  };

  const cutoff = new Date(Date.now() + LEAD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: due, error } = await db
    .from('ministry_subscriptions')
    .select('id, ministry_id, plan_type, intro_ends_at, paystack_subscription_code, paystack_customer_code, paystack_authorization_code')
    .eq('payment_provider', 'paystack')
    .eq('intro_offer_applied', true)
    .eq('status', 'active')
    .is('intro_rolled_over_at', null)
    .lte('intro_ends_at', cutoff);
  if (error) return json({ error: error.message }, 500);

  const results: Array<{ ministryId: string; ok: boolean; detail: string }> = [];

  for (const row of (due ?? []) as DueRow[]) {
    try {
      if (!row.paystack_subscription_code || !row.paystack_customer_code || !row.paystack_authorization_code) {
        throw new Error('missing Paystack subscription, customer or card authorization');
      }
      const { data: plan } = await db
        .from('ministry_partner_plans').select('paystack_plan_code').eq('slug', row.plan_type).maybeSingle();
      const normalPlan = (plan as { paystack_plan_code: string | null } | null)?.paystack_plan_code;
      if (!normalPlan) throw new Error(`plan ${row.plan_type} has no Paystack plan code`);

      const old = await paystack(`/subscription/${row.paystack_subscription_code}`);
      const startDate: string = old?.next_payment_date ?? row.intro_ends_at;

      if (dryRun) {
        results.push({ ministryId: row.ministry_id, ok: true, detail: `would start ${normalPlan} on ${startDate}` });
        continue;
      }

      const created = await paystack('/subscription', {
        method: 'POST',
        body: {
          customer: row.paystack_customer_code,
          plan: normalPlan,
          authorization: row.paystack_authorization_code,
          start_date: startDate,
        },
      });

      // Point the ministry at the new subscription before disabling the old
      // one, so the webhook treats the old one's disable event as superseded.
      const { error: upErr } = await db.from('ministry_subscriptions').update({
        paystack_subscription_code: created.subscription_code,
        intro_rolled_over_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      if (upErr) throw new Error(`saved new subscription ${created.subscription_code} at Paystack but not in the database: ${upErr.message}`);

      try {
        await paystack('/subscription/disable', {
          method: 'POST',
          body: { code: row.paystack_subscription_code, token: old.email_token },
        });
      } catch (e) {
        // Not retried (the new subscription already exists), so this needs a
        // person: disable the intro subscription in the Paystack dashboard.
        throw new Error(`started ${created.subscription_code} but could not disable intro subscription ${row.paystack_subscription_code}; disable it in Paystack by hand (${e instanceof Error ? e.message : e})`);
      }

      results.push({ ministryId: row.ministry_id, ok: true, detail: `moved to ${normalPlan} from ${startDate}` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ministry-intro-rollover] failed:', row.ministry_id, msg);
      Sentry.captureMessage(`ministry-intro-rollover: ${row.ministry_id} — ${msg}`, 'error');
      results.push({ ministryId: row.ministry_id, ok: false, detail: msg });
    }
  }

  await Sentry.flush(2000);
  return json({ dryRun, processed: results.length, results });
});
