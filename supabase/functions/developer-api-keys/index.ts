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
//   2. Run migration 0338_developer_api_meetings.sql first.
//   3. No extra secrets beyond the project-wide SUPABASE_* ones.
//
// ── Actions (POST JSON body) ─────────────────────────────────────────────
//   { action: 'create', label? }  → { id, label, key, keyPrefix, createdAt }
//     `key` is the ONLY time the plaintext is returned — store it now.
//   { action: 'list' }            → { keys: [{ id, label, keyPrefix, lastUsedAt, requestCount, revokedAt, createdAt }] }
//   { action: 'revoke', id }      → { success: true }
//   { action: 'account', companyName? }
//     → { plan, companyName, monthlyMeetingsUsed, monthlyMeetingsLimit, createdAt }
//     Lazily creates the caller's developer_accounts row (plan='free') on
//     first call — the standalone developer portal calls this right after
//     signup, and again on every dashboard load to refresh usage numbers.
//     `companyName`, if passed, updates the stored value (e.g. edited later).
// ────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Mirrors meetings-api's FREE_TIER.monthlyMeetings — kept in sync manually
// (no shared module between these two Edge Functions).
const FREE_TIER_MONTHLY_MEETINGS = 4;

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
  action?: 'create' | 'list' | 'revoke' | 'account';
  label?: string;
  id?: string;
  companyName?: string;
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
        .select('plan, company_name, created_at')
        .single();
      if (error) throw error;

      const { count: monthlyUsed } = await admin
        .from('api_meetings')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', user.id)
        .gte('created_at', startOfMonthIso());

      return json({
        plan: account.plan,
        companyName: account.company_name,
        monthlyMeetingsUsed: monthlyUsed ?? 0,
        monthlyMeetingsLimit: FREE_TIER_MONTHLY_MEETINGS,
        createdAt: account.created_at,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error('developer-api-keys error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
