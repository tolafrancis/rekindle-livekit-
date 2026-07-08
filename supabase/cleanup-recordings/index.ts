// supabase/cleanup-recordings/index.ts
//
// STANDALONE edge function — auto-deletes recordings past their retention window,
// so storage (and private meeting footage) doesn't accumulate forever.
//
//   • Interactive meetings (private): 30 days
//   • Live broadcasts / sermons:      90 days
//
// Recordings are Mux VOD assets. This function lists assets and deletes any older
// than the retention window for their kind. It's meant to run once a day, invoked
// by pg_cron (see migration 0027_schedule_recording_cleanup.sql).
//
// ── Deploy (Supabase dashboard) ──────────────────────────────────────────────
//   1. Edge Functions → "Deploy a new function" → name it exactly: cleanup-recordings
//   2. Paste this whole file as its index.ts and deploy.
//   3. Secrets (reuses project-wide ones — nothing new): MUX_TOKEN_ID,
//      MUX_TOKEN_SECRET. Optionally set CLEANUP_SECRET to require a matching
//      bearer token (the cron migration passes the service-role key by default).
//   4. Run migration 0027_schedule_recording_cleanup.sql to schedule it daily.
//
// ── Per-kind retention needs asset tagging ───────────────────────────────────
// To tell a meeting (30d) from a broadcast (90d), set Mux `passthrough` when the
// asset/live-stream is created in `manage-stream-input`, e.g.
//   passthrough: JSON.stringify({ kind: 'meeting' })   // or 'broadcast'
// Until that's in place, assets with an UNKNOWN kind use the LONGER window (90d)
// so nothing is ever deleted too early. Set DRY_RUN=true to preview first.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const MUX_API = 'https://api.mux.com';
const DAY_MS = 86_400_000;

// Keep in sync with src/lib/recordingRetention.ts
const RETENTION_DAYS: Record<string, number> = { meeting: 30, broadcast: 90 };
const UNKNOWN_RETENTION_DAYS = 90; // safest: never delete an unclassified asset early

function muxAuthHeader(): string {
  const id = Deno.env.get('MUX_TOKEN_ID') ?? '';
  const secret = Deno.env.get('MUX_TOKEN_SECRET') ?? '';
  return 'Basic ' + btoa(`${id}:${secret}`);
}

interface MuxAsset {
  id: string;
  created_at: string;      // unix seconds as string
  passthrough?: string;    // optional JSON metadata set at creation
}

/** Resolve a recording's retention window (days) from its passthrough metadata. */
function retentionDaysForAsset(asset: MuxAsset): number {
  try {
    const meta = asset.passthrough ? JSON.parse(asset.passthrough) : null;
    const kind = meta?.kind as string | undefined;
    if (kind && RETENTION_DAYS[kind] != null) return RETENTION_DAYS[kind];
  } catch {
    /* passthrough not JSON — fall through to the safe default */
  }
  return UNKNOWN_RETENTION_DAYS;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Optional shared-secret gate (set CLEANUP_SECRET to enable).
  const secret = Deno.env.get('CLEANUP_SECRET');
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);
  }

  const dryRun = (Deno.env.get('DRY_RUN') || '').toLowerCase() === 'true';
  const now = Date.now();
  const authHeader = muxAuthHeader();

  const deleted: string[] = [];
  let scannedCount = 0;

  try {
    // Page through all assets (Mux caps limit at 100).
    for (let page = 1; page < 1000; page++) {
      const res = await fetch(`${MUX_API}/video/v1/assets?limit=100&page=${page}`, {
        headers: { Authorization: authHeader },
      });
      if (!res.ok) return json({ error: `mux list failed: ${res.status}` }, 502);
      const body = await res.json();
      const assets: MuxAsset[] = body?.data ?? [];
      if (assets.length === 0) break;

      for (const asset of assets) {
        scannedCount++;
        const createdMs = Number(asset.created_at) * 1000;
        if (!createdMs) continue;
        const ageDays = (now - createdMs) / DAY_MS;
        const limit = retentionDaysForAsset(asset);
        if (ageDays <= limit) continue;

        if (dryRun) {
          deleted.push(`${asset.id} (age ${Math.round(ageDays)}d > ${limit}d) [dry-run]`);
          continue;
        }
        const del = await fetch(`${MUX_API}/video/v1/assets/${asset.id}`, {
          method: 'DELETE',
          headers: { Authorization: authHeader },
        });
        if (del.ok || del.status === 404) deleted.push(asset.id);
      }
    }

    return json({ ok: true, dryRun, scanned: scannedCount, deletedCount: deleted.length, deleted });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
