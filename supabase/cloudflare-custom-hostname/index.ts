// Supabase Edge Function: cloudflare-custom-hostname
// =====================================================================
// Phase 6 (6d) — provision a church's CUSTOM DOMAIN via Cloudflare for SaaS.
//
// A ministry admin points their own domain (e.g. worship.church.org) at the product.
// This creates/checks/removes the Cloudflare "custom hostname" and mirrors its state
// onto ministry_groups.white_label_domain + domain_status
// (none -> pending -> verifying -> active | error). The hostname resolver
// (get_ministry_by_hostname, migration 0156) then maps that domain to the ministry.
//
// Requests (POST, caller must be a leader/admin/owner of ministryId):
//   { action: 'add',    ministryId, hostname }  -> create + return DNS/verification records
//   { action: 'status', ministryId }            -> refresh + return current status/records
//   { action: 'remove', ministryId }            -> delete the custom hostname, clear domain
//
// Secrets (Supabase function env):
//   CLOUDFLARE_API_TOKEN    — token with "SSL and Certificates: Edit" on the SaaS zone
//   CLOUDFLARE_ZONE_ID      — the SaaS zone that owns custom hostnames  (ADD THIS)
//   CLOUDFLARE_CUSTOMER_CODE— the CNAME target churches point their domain at
//   CLOUDFLARE_ACCOUNT_ID   — (informational)
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const CF_API = 'https://api.cloudflare.com/client/v4';

// Basic hostname sanity: a dotted FQDN, no scheme/path, not a bare apex of the product.
function isValidHostname(h: string): boolean {
  return /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/i.test(h) && h.length <= 253;
}

// Map a Cloudflare custom-hostname payload to our domain_status.
function mapStatus(ch: any): 'pending' | 'verifying' | 'active' | 'error' {
  const ssl = ch?.ssl?.status;
  const host = ch?.status;
  if (host === 'active' && ssl === 'active') return 'active';
  if (host === 'blocked' || ssl === 'validation_timed_out' || ssl === 'deleted') return 'error';
  if (ssl === 'pending_validation' || host === 'pending') return 'verifying';
  return 'pending';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, ministryId, hostname } = await req.json();
    if (!action || !ministryId) return json({ error: 'action and ministryId are required' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const CF_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN');
    const CF_ZONE = Deno.env.get('CLOUDFLARE_ZONE_ID');
    const CF_CNAME_TARGET = Deno.env.get('CLOUDFLARE_CUSTOMER_CODE') ?? '';
    if (!CF_TOKEN || !CF_ZONE) {
      return json({ error: 'Cloudflare not configured (need CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID).' }, 500);
    }

    // ── Authorize: caller must be an admin/leader/owner of this ministry ──
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isAdmin } = await admin.rpc('is_group_admin', {
      p_ministry_id: ministryId,
      p_user_id: user.id,
    });
    if (!isAdmin) return json({ error: 'Not authorized to manage this ministry’s domain' }, 403);

    const cf = (path: string, init?: RequestInit) =>
      fetch(`${CF_API}/zones/${CF_ZONE}/custom_hostnames${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${CF_TOKEN}`,
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
      });

    const setDomain = (patch: Record<string, unknown>) =>
      admin.from('ministry_groups').update(patch).eq('id', ministryId);

    // Find an existing custom hostname id for a given hostname (status/remove).
    const findId = async (host: string): Promise<string | null> => {
      const r = await cf(`?hostname=${encodeURIComponent(host)}`);
      const j = await r.json();
      return j?.result?.[0]?.id ?? null;
    };

    // ── ADD ──────────────────────────────────────────────────────────────
    if (action === 'add') {
      if (!hostname || !isValidHostname(String(hostname).toLowerCase())) {
        return json({ error: 'A valid custom hostname is required' }, 400);
      }
      const host = String(hostname).toLowerCase();

      const r = await cf('', {
        method: 'POST',
        body: JSON.stringify({ hostname: host, ssl: { method: 'txt', type: 'dv' } }),
      });
      const j = await r.json();
      if (!j?.success) {
        return json({ error: 'Cloudflare rejected the hostname', details: j?.errors }, 502);
      }

      const ch = j.result;
      await setDomain({ white_label_domain: host, domain_status: mapStatus(ch) });

      return json({
        ok: true,
        hostname: host,
        status: mapStatus(ch),
        // Records the church must add at their DNS provider:
        dns: {
          cname: { name: host, value: CF_CNAME_TARGET || `${CF_ZONE}.cdn.cloudflare.net` },
          ownership: ch?.ownership_verification ?? null, // TXT record
          ssl: ch?.ssl?.validation_records ?? null,
        },
        customHostnameId: ch?.id,
      });
    }

    // ── STATUS ───────────────────────────────────────────────────────────
    if (action === 'status') {
      const { data: mg } = await admin
        .from('ministry_groups').select('white_label_domain').eq('id', ministryId).maybeSingle();
      const host = (mg as { white_label_domain?: string } | null)?.white_label_domain;
      if (!host) return json({ ok: true, status: 'none' });

      const id = await findId(host);
      if (!id) {
        await setDomain({ domain_status: 'error' });
        return json({ ok: true, status: 'error', reason: 'not found at Cloudflare' });
      }
      const r = await cf(`/${id}`);
      const j = await r.json();
      const status = mapStatus(j?.result);
      await setDomain({ domain_status: status });
      return json({
        ok: true,
        status,
        dns: {
          cname: { name: host, value: CF_CNAME_TARGET || `${CF_ZONE}.cdn.cloudflare.net` },
          ownership: j?.result?.ownership_verification ?? null,
          ssl: j?.result?.ssl?.validation_records ?? null,
        },
      });
    }

    // ── REMOVE ───────────────────────────────────────────────────────────
    if (action === 'remove') {
      const { data: mg } = await admin
        .from('ministry_groups').select('white_label_domain').eq('id', ministryId).maybeSingle();
      const host = (mg as { white_label_domain?: string } | null)?.white_label_domain;
      if (host) {
        const id = await findId(host);
        if (id) await cf(`/${id}`, { method: 'DELETE' });
      }
      await setDomain({ white_label_domain: null, domain_status: 'none' });
      return json({ ok: true, status: 'none' });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error('cloudflare-custom-hostname error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
