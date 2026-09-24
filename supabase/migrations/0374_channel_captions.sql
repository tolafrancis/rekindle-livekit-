-- 0374_channel_captions.sql
-- =====================================================================
-- On-demand captions, Phase 3: Live Broadcast channels.
--
-- A channel broadcast runs in the LiveKit room "channel-<channel id>". The
-- host (and co-host speakers, and viewers on the WebRTC fallback) are in the
-- room and use the in-room path from 0372; viewers watching over HLS use the
-- heartbeat path from 0373, with a channel-scoped heartbeat function here.
--
-- Captions need an org to log usage against, so they're offered on
-- ministry-owned channels (live_channels.ministry_id set) — the same scope
-- the old translation-based "Show Captions" had.
--
-- Still nothing here touches any translation_* table, language_configs, or
-- the bot_dispatch channel. Idempotent — safe to re-run.
-- =====================================================================

begin;

-- ── 1. Per-channel caption language (STT language only) ──────────────────
alter table public.live_channels
  add column if not exists source_language text not null default 'en';

-- ── 2. Allow the 'channel' room kind ─────────────────────────────────────
alter table public.caption_sessions drop constraint if exists caption_sessions_room_kind_check;
alter table public.caption_sessions
  add constraint caption_sessions_room_kind_check
  check (room_kind in ('ministry_meeting', 'ministry_webinar', 'channel'));

-- ── 3. caption_channel_viewer_heartbeat ──────────────────────────────────
-- Channel counterpart of caption_hls_viewer_heartbeat (0373). Called by HLS
-- viewers with CC on, about every 45 seconds. A channel broadcast is public
-- to anyone watching it, so the only condition is that it's live — the same
-- condition the broadcast viewer itself goes by. Returns whether a caption
-- agent is running (false tells the client to call captions-start again).
-- It can only extend a session that already exists, never start one.
create or replace function public.caption_channel_viewer_heartbeat(p_channel_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_name text;
  v_live      boolean;
begin
  select 'channel-' || c.id::text into v_room_name
    from public.live_channels c
   where c.id = p_channel_id
     and c.ministry_id is not null
     and (coalesce(c.is_live, false) or coalesce(c.is_hls_live, false));

  if v_room_name is null then
    return false;
  end if;

  select exists (
    select 1 from public.caption_sessions
     where room_name = v_room_name and status in ('starting', 'active')
  ) into v_live;

  if v_live then
    update public.caption_sessions
       set hls_viewer_seen_at = now()
     where room_name = v_room_name
       and status in ('starting', 'active')
       and (hls_viewer_seen_at is null or hls_viewer_seen_at < now() - interval '20 seconds');
  end if;

  return v_live;
end;
$$;

revoke all on function public.caption_channel_viewer_heartbeat(uuid) from public;
grant execute on function public.caption_channel_viewer_heartbeat(uuid) to anon, authenticated;

commit;
