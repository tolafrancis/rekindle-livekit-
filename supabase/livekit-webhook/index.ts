// supabase/livekit-webhook/index.ts
//
// Phase 5 (§12) — LiveKit server → Supabase webhook receiver. Egress completes
// ASYNCHRONOUSLY (the SFU keeps compositing after stop-recording returns), so the
// livekit_recordings row sits at 'processing' until the SFU fires `egress_ended`.
// This function verifies that signed event and flips the row to
// 'completed'/'failed' + fills duration. Without it, VOD entries never mark done.
//
// ⚠️ Deploy with JWT VERIFICATION OFF — LiveKit does not send a Supabase JWT; the
//    request is authenticated by the LiveKit webhook signature instead.
//
// ── Deploy (Supabase dashboard) ──────────────────────────────────────────────
//   1. Edge Functions → "Deploy a new function" → name it exactly: livekit-webhook
//   2. Paste this file. Then TURN OFF "Verify JWT" for this function
//      (Function settings → "Verify JWT with legacy secret" → disabled), or deploy
//      via CLI with `--no-verify-jwt`.
//   3. Secrets: LIVEKIT_API_KEY / LIVEKIT_API_SECRET / SUPABASE_URL /
//      SUPABASE_SERVICE_ROLE_KEY (all already set for the other livekit fns).
//   4. Point the SFU at it: in livekit/config/livekit.yaml set
//        webhook:
//          api_key: <LIVEKIT_API_KEY>
//          urls: [ https://<project-ref>.supabase.co/functions/v1/livekit-webhook ]
//      then restart the livekit container.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { WebhookReceiver, EgressStatus } from 'https://esm.sh/livekit-server-sdk@2';

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const KEY = Deno.env.get('LIVEKIT_API_KEY');
    const SECRET = Deno.env.get('LIVEKIT_API_SECRET');
    const SB_URL = Deno.env.get('SUPABASE_URL');
    const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!KEY || !SECRET) return new Response('LiveKit secrets not configured', { status: 500 });

    // Verify the LiveKit signature over the RAW body.
    const receiver = new WebhookReceiver(KEY, SECRET);
    const raw = await req.text();
    const event = await receiver.receive(raw, req.headers.get('Authorization') ?? undefined);

    // We only care about egress lifecycle here.
    if (event.event === 'egress_ended' || event.event === 'egress_updated') {
      const info = event.egressInfo;
      if (info?.egressId) {
        const admin = createClient(SB_URL!, SB_SERVICE!);
        const startNs = Number(info.startedAt ?? 0);
        const endNs = Number(info.endedAt ?? 0);
        const duration = startNs && endNs ? Math.max(0, Math.round((endNs - startNs) / 1e9)) : null;

        const ended = event.event === 'egress_ended';
        const failed = info.status === EgressStatus.EGRESS_FAILED || !!info.error;

        const patch: Record<string, unknown> = {
          status: ended ? (failed ? 'failed' : 'completed') : 'processing',
        };
        if (ended) patch.ended_at = new Date().toISOString();
        if (duration) patch.duration_seconds = duration;

        const { data: rows } = await admin
          .from('livekit_recordings')
          .update(patch)
          .eq('egress_id', info.egressId)
          .select('meeting_table, meeting_id, playback_url');
        const rec = (rows ?? [])[0] as
          { meeting_table?: string; meeting_id?: string; playback_url?: string } | undefined;

        // Meeting VOD: on successful completion, write the playback URL back onto the
        // meeting row so RecordingManager / meeting recording viewers show it
        // (they read recording_url + recording_status='completed'). Best-effort —
        // columns may vary per table.
        if (ended && !failed && rec?.meeting_table && rec.meeting_id) {
          await admin.from(rec.meeting_table).update({
            recording_url: rec.playback_url,
            recording_status: 'completed',
            recording_duration_seconds: duration,
            recording_ended_at: new Date().toISOString(),
          }).eq('id', rec.meeting_id);
        }
      }
    }

    return new Response('ok', { status: 200 });
  } catch (error) {
    // A verification failure (bad/absent signature) lands here → 401.
    console.error('livekit-webhook error:', error);
    return new Response('unauthorized', { status: 401 });
  }
});
