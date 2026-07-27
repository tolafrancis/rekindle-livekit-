// Supabase Edge Function: ministry-retention-sweep
// =====================================================================
// Enforces the free/bundled-storage retention policy: ministries with NO
// active storage_pack add-on (ministry_addons) get their meeting recordings
// auto-deleted after 7 days and their broadcast recordings + pastoral video
// messages auto-deleted after 30 days, with a "download before it's gone"
// notice 2 days before deletion. Ministries WITH an active storage_pack are
// exempt entirely — see the storage add-on architecture memo: they get
// capacity-based enforcement (storage-full blocking) instead, which isn't
// built yet (that's Phase 4, upload-time gating — this function only ever
// deletes for non-add-on ministries).
//
// Run daily on a schedule (Supabase dashboard → Edge Functions → this
// function → Cron, e.g. `0 3 * * *`, or via Database → Cron Jobs calling
// net.http_post with a service-role Authorization header — do NOT hardcode
// the service role key in a migration/SQL file; set it via the dashboard's
// cron UI or Vault, not source control).
//
// ⚠️ S3 list/delete via aws4fetch below is written against the S3 REST API
// shape but not exercised against a live bucket in this environment — if
// objects aren't actually being removed, check the ListObjectsV2 XML
// response shape and the per-key DELETE path first.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (shared with other fns),
// S3_ACCESS_KEY/S3_SECRET/S3_BUCKET/S3_REGION/S3_ENDPOINT (LiveKit egress
// bucket — same as livekit-egress), VIDEO_R2_ACCESS_KEY/VIDEO_R2_SECRET_KEY/
// VIDEO_R2_BUCKET/VIDEO_R2_REGION/VIDEO_R2_ENDPOINT (pastor video messages —
// same as the video-transcode worker).
//
// verify_jwt should stay ON (default) for this function — only a
// service-role caller (the cron job) is meant to invoke it; the role check
// below is defense in depth on top of that gateway check.
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1';

const MEETING_RETENTION_DAYS = 7;
const BROADCAST_RETENTION_DAYS = 30;
const VIDEO_MESSAGE_RETENTION_DAYS = 30;
const NOTICE_DAYS_BEFORE = 2;
const MS_PER_DAY = 86_400_000;

function decodeJwtRole(authHeader: string): string | null {
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

// Mirrors the ownership resolution in livekit-webhook (kept as a separate
// copy — each edge function here is deployed independently, no shared
// import between them in this repo).
async function resolveMinistryId(
  admin: ReturnType<typeof createClient>,
  rec: { channel_id?: string | null; meeting_table?: string | null; meeting_id?: string | null },
): Promise<string | null> {
  if (rec.channel_id) {
    const { data } = await admin.from('live_channels').select('ministry_id').eq('id', rec.channel_id).maybeSingle();
    return (data as { ministry_id?: string } | null)?.ministry_id ?? null;
  }
  if (rec.meeting_table === 'ministry_video_meetings' && rec.meeting_id) {
    const { data } = await admin.from('ministry_video_meetings').select('ministry_id').eq('id', rec.meeting_id).maybeSingle();
    return (data as { ministry_id?: string } | null)?.ministry_id ?? null;
  }
  if (rec.meeting_table === 'live_channel_video_meetings' && rec.meeting_id) {
    const { data: m } = await admin.from('live_channel_video_meetings').select('channel_id').eq('id', rec.meeting_id).maybeSingle();
    const channelId = (m as { channel_id?: string } | null)?.channel_id;
    if (!channelId) return null;
    const { data: c } = await admin.from('live_channels').select('ministry_id').eq('id', channelId).maybeSingle();
    return (c as { ministry_id?: string } | null)?.ministry_id ?? null;
  }
  return null;
}

async function getAdminUserIds(admin: ReturnType<typeof createClient>, ministryId: string): Promise<string[]> {
  const [{ data: mem }, { data: grp }] = await Promise.all([
    admin.from('ministry_group_members').select('user_id, role, is_leader').eq('group_id', ministryId),
    admin.from('ministry_groups').select('owner_id, leader_id').eq('id', ministryId).maybeSingle(),
  ]);
  const ids = new Set<string>();
  for (const m of (mem ?? []) as { user_id: string; role: string; is_leader: boolean }[]) {
    if (m.is_leader === true || ['admin', 'moderator'].includes(m.role)) ids.add(m.user_id);
  }
  const g = grp as { owner_id?: string; leader_id?: string } | null;
  if (g?.owner_id) ids.add(g.owner_id);
  if (g?.leader_id) ids.add(g.leader_id);
  return [...ids];
}

async function notifyAdmins(
  admin: ReturnType<typeof createClient>,
  ministryId: string,
  title: string,
  body: string,
  link: string,
): Promise<void> {
  const adminIds = await getAdminUserIds(admin, ministryId);
  for (const userId of adminIds) {
    await admin.functions.invoke('send-push-notification', {
      body: { title, body, userId, targetAudience: 'specific_user', push: true, inApp: true, link },
    }).catch((err) => console.error('[retention-sweep] notify failed:', err));
  }
}

interface S3Config {
  accessKey: string;
  secret: string;
  bucket: string;
  region: string;
  endpoint: string;
}

// Some deployments set *_ENDPOINT already including the bucket path (verified
// against a real deployment 2026-07-28 — S3_ENDPOINT for the LiveKit egress
// bucket is "https://<account>.r2.cloudflarestorage.com/livekit-egress" while
// S3_BUCKET is ALSO "livekit-egress"). Appending the bucket unconditionally
// double-prefixed every URL and made ListObjectsV2 404 silently. Normalize
// instead of assuming either shape.
function bucketRootUrl(cfg: S3Config): string {
  const trimmed = cfg.endpoint.replace(/\/+$/, '');
  return trimmed.endsWith(`/${cfg.bucket}`) ? trimmed : `${trimmed}/${cfg.bucket}`;
}

async function listKeys(client: AwsClient, cfg: S3Config, prefix: string): Promise<string[]> {
  const url = `${bucketRootUrl(cfg)}?list-type=2&prefix=${encodeURIComponent(prefix)}`;
  const res = await client.fetch(url);
  if (!res.ok) {
    console.error('[retention-sweep] list failed:', res.status, await res.text());
    return [];
  }
  const xml = await res.text();
  // Light scrape, not a full XML parser — our own generated keys are plain
  // alphanumeric/slash/dash, so this is safe for this constrained case.
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
}

async function deleteKey(client: AwsClient, cfg: S3Config, key: string): Promise<void> {
  const res = await client.fetch(`${bucketRootUrl(cfg)}/${key}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) console.error(`[retention-sweep] delete failed for ${key}:`, res.status);
}

async function deletePrefix(client: AwsClient, cfg: S3Config, prefix: string): Promise<void> {
  const keys = await listKeys(client, cfg, prefix);
  for (const key of keys) await deleteKey(client, cfg, key);
}

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (decodeJwtRole(authHeader) !== 'service_role') {
      return new Response('Forbidden — service role only', { status: 403 });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: addonRows } = await admin
      .from('ministry_addons').select('ministry_id')
      .eq('addon_type', 'storage_pack').eq('status', 'active');
    const exempt = new Set((addonRows ?? []).map((r: { ministry_id: string }) => r.ministry_id));

    const now = Date.now();
    let expiredCount = 0;
    let notifiedCount = 0;

    // ── LiveKit recordings (meetings + broadcasts) ──────────────────────
    const s3cfg: S3Config = {
      accessKey: Deno.env.get('S3_ACCESS_KEY') ?? '',
      secret: Deno.env.get('S3_SECRET') ?? '',
      bucket: Deno.env.get('S3_BUCKET') ?? 'livekit-egress',
      region: Deno.env.get('S3_REGION') ?? 'us-east-1',
      endpoint: Deno.env.get('S3_ENDPOINT') ?? '',
    };
    const s3 = new AwsClient({ accessKeyId: s3cfg.accessKey, secretAccessKey: s3cfg.secret, region: s3cfg.region, service: 's3' });

    const { data: recordings } = await admin
      .from('livekit_recordings')
      .select('id, kind, channel_id, meeting_table, meeting_id, ended_at, filepath, retention_notice_sent_at')
      .eq('status', 'completed')
      .not('ended_at', 'is', null)
      .not('filepath', 'is', null);

    for (const rec of (recordings ?? []) as {
      id: string; kind: string; channel_id: string | null; meeting_table: string | null;
      meeting_id: string | null; ended_at: string; filepath: string; retention_notice_sent_at: string | null;
    }[]) {
      const ministryId = await resolveMinistryId(admin, rec);
      if (!ministryId || exempt.has(ministryId)) continue; // no ministry (individual) or storage-add-on exempt

      const retentionDays = rec.kind === 'meeting' ? MEETING_RETENTION_DAYS : BROADCAST_RETENTION_DAYS;
      const ageDays = (now - new Date(rec.ended_at).getTime()) / MS_PER_DAY;

      if (ageDays >= retentionDays) {
        await deletePrefix(s3, s3cfg, rec.filepath);
        await admin.from('livekit_recordings').delete().eq('id', rec.id);
        expiredCount++;
      } else if (retentionDays - ageDays <= NOTICE_DAYS_BEFORE && !rec.retention_notice_sent_at) {
        const daysLeft = Math.max(0, Math.ceil(retentionDays - ageDays));
        await notifyAdmins(
          admin, ministryId, 'Recording expires soon',
          `A ${rec.kind === 'meeting' ? 'meeting' : 'broadcast'} recording will be deleted in ${daysLeft} day(s) — download it now if you want to keep it.`,
          '/settings/billing',
        );
        await admin.from('livekit_recordings').update({ retention_notice_sent_at: new Date().toISOString() }).eq('id', rec.id);
        notifiedCount++;
      }
    }

    // ── Pastor video messages ────────────────────────────────────────────
    const r2cfg: S3Config = {
      accessKey: Deno.env.get('VIDEO_R2_ACCESS_KEY') ?? '',
      secret: Deno.env.get('VIDEO_R2_SECRET_KEY') ?? '',
      bucket: Deno.env.get('VIDEO_R2_BUCKET') ?? '',
      region: Deno.env.get('VIDEO_R2_REGION') ?? 'auto',
      endpoint: Deno.env.get('VIDEO_R2_ENDPOINT') ?? '',
    };
    const r2 = new AwsClient({ accessKeyId: r2cfg.accessKey, secretAccessKey: r2cfg.secret, region: r2cfg.region, service: 's3' });

    const { data: videos } = await admin
      .from('ministry_video_messages')
      .select('id, ministry_id, raw_storage_key, published_at, created_at, retention_notice_sent_at')
      .eq('status', 'published');

    for (const v of (videos ?? []) as {
      id: string; ministry_id: string; raw_storage_key: string | null;
      published_at: string | null; created_at: string; retention_notice_sent_at: string | null;
    }[]) {
      if (exempt.has(v.ministry_id)) continue;
      const anchor = v.published_at ?? v.created_at;
      const ageDays = (now - new Date(anchor).getTime()) / MS_PER_DAY;

      if (ageDays >= VIDEO_MESSAGE_RETENTION_DAYS) {
        if (v.raw_storage_key) await deleteKey(r2, r2cfg, v.raw_storage_key);
        await deletePrefix(r2, r2cfg, `processed/${v.ministry_id}/${v.id}`);
        // Archive, don't hard-delete — keeps title/engagement history around
        // (status='archived' is already a valid state for this table).
        await admin.from('ministry_video_messages').update({ status: 'archived' }).eq('id', v.id);
        expiredCount++;
      } else if (VIDEO_MESSAGE_RETENTION_DAYS - ageDays <= NOTICE_DAYS_BEFORE && !v.retention_notice_sent_at) {
        const daysLeft = Math.max(0, Math.ceil(VIDEO_MESSAGE_RETENTION_DAYS - ageDays));
        await notifyAdmins(
          admin, v.ministry_id, 'Video message expires soon',
          `A pastoral video message will be removed in ${daysLeft} day(s) — download it now if you want to keep it.`,
          '/settings/billing',
        );
        await admin.from('ministry_video_messages').update({ retention_notice_sent_at: new Date().toISOString() }).eq('id', v.id);
        notifiedCount++;
      }
    }

    return new Response(JSON.stringify({ success: true, expired: expiredCount, notified: notifiedCount }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[ministry-retention-sweep] error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
