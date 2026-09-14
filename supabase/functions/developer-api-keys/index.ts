// supabase/functions/developer-api-keys/index.ts
//
// In-app management of Interactive Meetings API keys. Requires a real
// Supabase user session (gateway JWT verification stays ON — see
// config.toml) — this is the "log in to the app, generate a key" side.
// The key itself is then used against the separate `meetings-api` function,
// which is public (verify_jwt = false) and authenticates via the key.
//
// ── Deploy ────────────────────────────────────────────────────────────────
//   1. Edge Functions → deploy as: developer-api-keys
//   2. Run migrations 0338_developer_api_meetings.sql, then
//      0347_developer_api_billing.sql, in order.
//   3. Project-wide SUPABASE_* secrets, plus (for 'enable-billing' only —
//      every other action works fine without these): STRIPE_SECRET_KEY,
//      DEVELOPER_METERED_PRICE_ID (a metered recurring Price's id, created
//      once via the Stripe dashboard — Checkout can't create a metered
//      price inline like ministry-checkout's price_data fallback does for
//      flat prices, Stripe requires a pre-created Price for usage_type:
//      metered). Also deploy developer-billing-webhook and register it as
//      its own Stripe webhook endpoint (STRIPE_WEBHOOK_SECRET, a DIFFERENT
//      one from ministry-billing-webhook's).
//
// ── Actions (POST JSON body) ─────────────────────────────────────────────
//   { action: 'create', label? }  → { id, label, key, keyPrefix, createdAt }
//     `key` is the ONLY time the plaintext is returned — store it now.
//   { action: 'list' }            → { keys: [{ id, label, keyPrefix, lastUsedAt, requestCount, revokedAt, createdAt }] }
//   { action: 'revoke', id }      → { success: true }
//   { action: 'account', companyName? }
//     → { plan, companyName, monthlyMinutesUsed, monthlyMinutesLimit,
//          monthlyParticipantMinutes, billingEnabled, estimatedCostUsd, createdAt }
//     Lazily creates the caller's developer_accounts row (plan='free') on
//     first call — the standalone developer portal calls this right after
//     signup, and again on every dashboard load to refresh usage numbers.
//     `companyName`, if passed, updates the stored value (e.g. edited later).
//     monthlyMinutesUsed/Limit is the FREE plan's own booking-budget check
//     (unchanged from v1, see meetings-api's FREE_TIER header comment).
//     monthlyParticipantMinutes is real measured usage (migration 0347) —
//     what pay-as-you-go billing actually runs on. estimatedCostUsd is only
//     populated once billingEnabled is true, and is a live estimate of the
//     current month's Stripe usage-record total so far (the cron that
//     actually reports it to Stripe runs periodically, not on every read).
//   { action: 'enable-billing', back }
//     → { url }  Stripe Checkout Session URL for a no-monthly-fee metered
//     subscription (migration 0347's "Option B" pay-as-you-go plan) — `back`
//     is the portal URL to return to; ?billing=success/cancelled is appended.
//     Errors if billing is already enabled, or if DEVELOPER_METERED_PRICE_ID
//     isn't configured yet (the one manual one-time Stripe dashboard step —
//     see this repo's Live Translation billing docs for the same pattern).
//     developer-billing-webhook flips plan to 'pay_as_you_go' and stores
//     stripe_subscription_item_id once the checkout actually completes.
// ────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Mirrors meetings-api's FREE_TIER.monthlyHours — kept in sync manually
// (no shared module between these two Edge Functions).
const FREE_TIER_MONTHLY_HOURS = 10;

// Mirrors meetings-api's PAY_AS_YOU_GO.perParticipantMinuteCents — see that
// file's comment for the LiveKit Cloud cost-basis this is priced against.
const PAY_AS_YOU_GO_RATE_CENTS_PER_MINUTE = 0.35;

const form = (obj: Record<string, string>) =>
  Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

function startOfMonthIso(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

const KEY_PREFIX = 'rkm_live_';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

function generateKey(): string {
  return KEY_PREFIX + toHex(crypto.getRandomValues(new Uint8Array(24))); // 48 hex chars
}

interface RequestBody {
  action?: 'create' | 'list' | 'revoke' | 'account' | 'enable-billing';
  label?: string;
  id?: string;
  companyName?: string;
  back?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Server configuration missing' }, 500);
    }

    // Real user session required for every action here (key management, not key use).
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const action = body.action ?? 'list';

    if (action === 'create') {
      const label = (body.label || 'API Key').slice(0, 100);
      const key = generateKey();
      const keyHash = await sha256Hex(key);
      const keyPrefix = key.slice(0, KEY_PREFIX.length + 8);

      const { data, error } = await admin
        .from('developer_api_keys')
        .insert({ owner_user_id: user.id, label, key_prefix: keyPrefix, key_hash: keyHash })
        .select('id, label, key_prefix, created_at')
        .single();
      if (error) throw error;

      return json({
        id: data.id,
        label: data.label,
        key,                       // shown once — the caller must copy it now
        keyPrefix: data.key_prefix,
        createdAt: data.created_at,
      });
    }

    if (action === 'list') {
      const { data, error } = await admin
        .from('developer_api_keys')
        .select('id, label, key_prefix, last_used_at, request_count, revoked_at, created_at')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return json({
        keys: (data ?? []).map((k) => ({
          id: k.id,
          label: k.label,
          keyPrefix: k.key_prefix,
          lastUsedAt: k.last_used_at,
          requestCount: k.request_count,
          revokedAt: k.revoked_at,
          createdAt: k.created_at,
        })),
      });
    }

    if (action === 'revoke') {
      if (!body.id) return json({ error: 'id is required' }, 400);
      const { error } = await admin
        .from('developer_api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', body.id)
        .eq('owner_user_id', user.id); // can only revoke your own key
      if (error) throw error;
      return json({ success: true });
    }

    if (action === 'account') {
      const patch: Record<string, unknown> = { owner_user_id: user.id };
      if (body.companyName !== undefined) patch.company_name = body.companyName.trim() || null;

      const { data: account, error } = await admin
        .from('developer_accounts')
        .upsert(patch, { onConflict: 'owner_user_id' })
        .select('plan, company_name, stripe_subscription_item_id, created_at')
        .single();
      if (error) throw error;

      const { data: monthlyRows } = await admin
        .from('api_meetings')
        .select('duration_minutes')
        .eq('owner_user_id', user.id)
        .gte('created_at', startOfMonthIso());
      const monthlyMinutesUsed = (monthlyRows ?? []).reduce(
        (sum: number, r: { duration_minutes?: number }) => sum + (r.duration_minutes ?? 0), 0,
      );

      const billingEnabled = account.plan === 'pay_as_you_go' && !!account.stripe_subscription_item_id;

      // Real measured usage (migration 0347) — separate from monthlyMinutesUsed
      // above, which is the free plan's own booking-budget estimate. Always
      // computed, not just when billingEnabled, so a free-plan account can see
      // what pay-as-you-go WOULD have cost them before switching over.
      const { data: participantMinutesRaw } = await admin.rpc('get_developer_participant_minutes', {
        p_owner_user_id: user.id,
      });
      const monthlyParticipantMinutes = Number(participantMinutesRaw ?? 0);
      const billableMinutes = Math.max(0, monthlyParticipantMinutes - FREE_TIER_MONTHLY_HOURS * 60);
      const estimatedCostUsd = Math.round(billableMinutes * PAY_AS_YOU_GO_RATE_CENTS_PER_MINUTE) / 100;

      return json({
        plan: account.plan,
        companyName: account.company_name,
        monthlyMinutesUsed,
        monthlyMinutesLimit: FREE_TIER_MONTHLY_HOURS * 60,
        billingEnabled,
        monthlyParticipantMinutes,
        estimatedCostUsd,
        createdAt: account.created_at,
      });
    }

    if (action === 'enable-billing') {
      const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
      const METERED_PRICE_ID = Deno.env.get('DEVELOPER_METERED_PRICE_ID');
      if (!STRIPE_KEY || !METERED_PRICE_ID) {
        return json({ error: 'Pay-as-you-go billing is not configured yet — contact support.' }, 500);
      }
      if (!body.back) return json({ error: 'back is required' }, 400);

      const { data: existing } = await admin
        .from('developer_accounts')
        .select('stripe_subscription_item_id')
        .eq('owner_user_id', user.id)
        .maybeSingle();
      if ((existing as { stripe_subscription_item_id?: string } | null)?.stripe_subscription_item_id) {
        return json({ error: 'Pay-as-you-go billing is already enabled for this account.' }, 400);
      }

      // Metered recurring price, mode 'subscription', no quantity — Stripe
      // reports usage via usage records (developer-api-usage-report, a
      // separate cron), not a fixed line-item quantity. Always a NEW
      // customer+subscription in one step (unlike ministry-checkout's
      // purchase-addon, which attaches to an EXISTING subscription) since a
      // developer account never has a base subscription to attach to.
      const params: Record<string, string> = {
        mode: 'subscription',
        'line_items[0][price]': METERED_PRICE_ID,
        success_url: `${body.back}?billing=success`,
        cancel_url: `${body.back}?billing=cancelled`,
        'metadata[developer_account]': 'true',
        'metadata[owner_user_id]': user.id,
        'subscription_data[metadata][developer_account]': 'true',
        'subscription_data[metadata][owner_user_id]': user.id,
      };
      if (user.email) params['customer_email'] = user.email;

      const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form(params),
      });
      const j = await r.json();
      if (!r.ok) return json({ error: j?.error?.message || 'Stripe checkout error' }, 502);
      return json({ url: j.url });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error('developer-api-keys error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
