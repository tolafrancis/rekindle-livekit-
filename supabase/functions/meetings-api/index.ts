// supabase/functions/meetings-api/index.ts
//
// Public "Interactive Meetings" API — lets ANY third-party integration
// (not just ministries, not limited to signed-in app sessions) create and
// run LiveKit video meetings against a developer API key instead of a
// Supabase user session. Keys are minted in-app via the developer-api-keys
// function (Profile → Developer → API Keys).
//
// 🔒 Auth model differs from every other LiveKit function in this repo:
//    those authenticate the caller via a Supabase user JWT; this one is
//    called by servers that have no Supabase account of their own, so the
//    gateway's JWT check is OFF (verify_jwt = false in config.toml) and
//    auth happens here instead, against developer_api_keys.key_hash.
//
// ── Deploy ────────────────────────────────────────────────────────────────
//   1. Edge Functions → deploy as: meetings-api, then set verify_jwt=false.
//   2. Run migration 0338_developer_api_meetings.sql first.
//   3. Secrets: LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET (already
//      configured for livekit-token/livekit-egress) + project-wide SUPABASE_*.
//
// ── Auth ─────────────────────────────────────────────────────────────────
//   Authorization: Bearer rkm_live_...
//
// ── Actions (POST JSON body) ────────────────────────────────────────────
//   { action:'create', title, description?, duration_minutes?, max_participants?,
//     enable_recording?, metadata? }
//     → { id, roomName, title, durationMinutes, maxParticipants, createdAt }
//   { action:'get', meetingId } → meeting status incl. live participant count
//   { action:'list', limit?, before? } → { meetings: [...] }
//   { action:'join-token', meetingId, participantName, role? }  // role: 'host'|'attendee'|'viewer', default 'attendee'
//     → { url, token, role }
//   { action:'end', meetingId } → { success: true }
//
// NOTE (v1 scope): webinar/HLS mode is not exposed here — API-created
// meetings are plain multi-party rooms. Every account is on the single free
// plan (see FREE_TIER below) — there is no paid tier yet, and this API is
// deliberately decoupled from the ministry/consumer subscription_tiers
// system (0339_developer_accounts.sql): an outside company signing up here
// has no ministry plan and never will, so gating on one would lock every
// such signup out. Recording is disabled on the free plan.
// ─────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessToken, RoomServiceClient } from 'https://esm.sh/livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

const httpUrl = (wsUrl: string) => wsUrl.replace(/^ws/, 'http');

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

// "Free Ministry Meetings" — the same free plan offered in-app (consumer +
// ministry apps, see packages/auth/src/subscriptionEnforcement.ts's
// FREE_TIER_MEETING_LIMITS) and here via the API — one allowance, two front
// doors. Tune freely, but keep all three copies in sync (also referenced by
// developer-api-keys' 'account' action for display) — there's no shared
// module between them.
const FREE_TIER = {
  monthlyMeetings: 4,
  maxConcurrentActive: 2,
  maxDurationMinutes: 60,
  maxParticipants: 10,
};

function startOfMonthIso(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Enforces the free-plan quota: a monthly cap on meetings created, and a cap
 *  on how many can be active (is_active) at once. Both computed on the fly
 *  from api_meetings — no counters to keep in sync. */
async function checkFreeTierQuota(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const { count: monthlyCount } = await admin
    .from('api_meetings')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerId)
    .gte('created_at', startOfMonthIso());
  if ((monthlyCount ?? 0) >= FREE_TIER.monthlyMeetings) {
    return { allowed: false, reason: `Free plan limit reached: ${FREE_TIER.monthlyMeetings} meetings/month.` };
  }

  const { count: activeCount } = await admin
    .from('api_meetings')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerId)
    .eq('is_active', true);
  if ((activeCount ?? 0) >= FREE_TIER.maxConcurrentActive) {
    return { allowed: false, reason: `Free plan limit reached: ${FREE_TIER.maxConcurrentActive} active meetings at once. End one before starting another.` };
  }

  return { allowed: true };
}

interface ApiKeyRow {
  id: string;
  owner_user_id: string;
}

/** Authenticates the bearer key against developer_api_keys and records usage.
 *  Returns null (caller should respond 401) if missing/invalid/revoked. */
async function authenticateKey(admin: ReturnType<typeof createClient>, req: Request): Promise<ApiKeyRow | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const key = match?.[1]?.trim();
  if (!key || !key.startsWith('rkm_live_')) return null;

  const keyHash = await sha256Hex(key);
  const { data, error } = await admin
    .from('developer_api_keys')
    .select('id, owner_user_id, revoked_at, request_count')
    .eq('key_hash', keyHash)
    .maybeSingle();
  if (error || !data || data.revoked_at) return null;

  // Best-effort usage bookkeeping — never blocks the request on failure.
  admin
    .from('developer_api_keys')
    .update({ last_used_at: new Date().toISOString(), request_count: (data.request_count ?? 0) + 1 })
    .eq('id', data.id)
    .then(() => {}, () => {});

  return { id: data.id, owner_user_id: data.owner_user_id };
}

function grantFor(role: 'host' | 'attendee' | 'viewer', room: string) {
  const base = { room, roomJoin: true, canSubscribe: true, canPublishData: true };
  if (role === 'viewer') return { ...base, canPublish: false };
  if (role === 'host') return { ...base, canPublish: true, roomAdmin: true };
  return { ...base, canPublish: true };
}

interface RequestBody {
  action?: 'create' | 'get' | 'list' | 'join-token' | 'end';
  title?: string;
  description?: string;
  duration_minutes?: number;
  max_participants?: number;
  enable_recording?: boolean;
  metadata?: Record<string, unknown>;
  meetingId?: string;
  participantName?: string;
  role?: 'host' | 'attendee' | 'viewer';
  limit?: number;
  before?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  try {
    const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL');
    const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY');
    const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Server configuration missing' }, 500);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const apiKey = await authenticateKey(admin, req);
    if (!apiKey) return json({ error: 'Unauthorized — missing or invalid API key' }, 401);

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const action = body.action ?? 'create';
    const svc = new RoomServiceClient(httpUrl(LIVEKIT_URL), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    // Every action below operates only on meetings owned by this key's account —
    // an API key can never see or touch another account's meetings.
    const ownerId = apiKey.owner_user_id;

    if (action === 'create') {
      if (!body.title || !body.title.trim()) return json({ error: 'title is required' }, 400);

      const quota = await checkFreeTierQuota(admin, ownerId);
      if (!quota.allowed) {
        return json({ error: 'quota_exceeded', reason: quota.reason }, 403);
      }

      const durationMinutes = Math.max(5, Math.min(body.duration_minutes ?? FREE_TIER.maxDurationMinutes, FREE_TIER.maxDurationMinutes));
      const maxParticipants = Math.max(2, Math.min(body.max_participants ?? FREE_TIER.maxParticipants, FREE_TIER.maxParticipants));
      // Recording isn't offered on the free plan yet — silently ignored rather
      // than erroring, same spirit as the in-app modal downgrading it.
      const enableRecording = false;

      const roomName = `api-${ownerId.slice(0, 8)}-${Date.now()}`;
      await svc.createRoom({
        name: roomName,
        emptyTimeout: durationMinutes * 60,
        maxParticipants,
      }).catch(() => {}); // idempotent — fine if it already exists

      const { data, error } = await admin
        .from('api_meetings')
        .insert({
          owner_user_id: ownerId,
          api_key_id: apiKey.id,
          title: body.title.trim(),
          description: body.description ?? null,
          room_name: roomName,
          duration_minutes: durationMinutes,
          max_participants: maxParticipants,
          enable_recording: enableRecording,
          metadata: body.metadata ?? {},
          is_active: true,
          started_at: new Date().toISOString(),
        })
        .select('id, room_name, title, duration_minutes, max_participants, enable_recording, created_at')
        .single();
      if (error) throw error;

      return json({
        id: data.id,
        roomName: data.room_name,
        title: data.title,
        durationMinutes: data.duration_minutes,
        maxParticipants: data.max_participants,
        recordingEnabled: data.enable_recording,
        createdAt: data.created_at,
      });
    }

    if (action === 'get') {
      if (!body.meetingId) return json({ error: 'meetingId is required' }, 400);
      const { data: meeting, error } = await admin
        .from('api_meetings')
        .select('*')
        .eq('id', body.meetingId)
        .eq('owner_user_id', ownerId)
        .maybeSingle();
      if (error) throw error;
      if (!meeting) return json({ error: 'Meeting not found' }, 404);

      let participantCount = 0;
      let liveActive = meeting.is_active;
      try {
        const participants = await svc.listParticipants(meeting.room_name);
        participantCount = participants.length;
      } catch {
        // Room no longer exists on LiveKit (ended, or emptyTimeout expired) —
        // lazily reconcile the DB row instead of requiring a webhook round-trip.
        if (meeting.is_active) {
          liveActive = false;
          await admin.from('api_meetings').update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', meeting.id);
        }
      }

      return json({
        id: meeting.id,
        title: meeting.title,
        description: meeting.description,
        roomName: meeting.room_name,
        isActive: liveActive,
        participantCount,
        durationMinutes: meeting.duration_minutes,
        maxParticipants: meeting.max_participants,
        recordingEnabled: meeting.enable_recording,
        metadata: meeting.metadata,
        createdAt: meeting.created_at,
        startedAt: meeting.started_at,
        endedAt: meeting.ended_at,
      });
    }

    if (action === 'list') {
      const limit = Math.max(1, Math.min(body.limit ?? 20, 100));
      let query = admin
        .from('api_meetings')
        .select('id, title, room_name, is_active, duration_minutes, max_participants, created_at, ended_at')
        .eq('owner_user_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (body.before) query = query.lt('created_at', body.before);
      const { data, error } = await query;
      if (error) throw error;
      return json({
        meetings: (data ?? []).map((m) => ({
          id: m.id,
          title: m.title,
          roomName: m.room_name,
          isActive: m.is_active,
          durationMinutes: m.duration_minutes,
          maxParticipants: m.max_participants,
          createdAt: m.created_at,
          endedAt: m.ended_at,
        })),
      });
    }

    if (action === 'join-token') {
      if (!body.meetingId) return json({ error: 'meetingId is required' }, 400);
      if (!body.participantName?.trim()) return json({ error: 'participantName is required' }, 400);

      const { data: meeting, error } = await admin
        .from('api_meetings')
        .select('id, room_name, is_active')
        .eq('id', body.meetingId)
        .eq('owner_user_id', ownerId)
        .maybeSingle();
      if (error) throw error;
      if (!meeting) return json({ error: 'Meeting not found' }, 404);
      if (!meeting.is_active) return json({ error: 'This meeting has ended' }, 409);

      // The caller authenticated with the owning account's own API key, so it is
      // trusted to assign roles for its own end users (host/attendee/viewer) —
      // there is no separate participant roster to check against, unlike the
      // in-app tenant-membership gate in livekit-token.
      const role = body.role ?? 'attendee';
      const identity = `${meeting.id}-${crypto.randomUUID()}`;
      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity,
        name: body.participantName.trim(),
        metadata: JSON.stringify({ role, viaApi: true }),
        ttl: '2h',
      });
      at.addGrant(grantFor(role, meeting.room_name));

      return json({ url: LIVEKIT_URL, token: await at.toJwt(), role });
    }

    if (action === 'end') {
      if (!body.meetingId) return json({ error: 'meetingId is required' }, 400);
      const { data: meeting, error } = await admin
        .from('api_meetings')
        .select('id, room_name')
        .eq('id', body.meetingId)
        .eq('owner_user_id', ownerId)
        .maybeSingle();
      if (error) throw error;
      if (!meeting) return json({ error: 'Meeting not found' }, 404);

      await svc.deleteRoom(meeting.room_name).catch(() => {}); // idempotent
      await admin.from('api_meetings').update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', meeting.id);
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error('meetings-api error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
