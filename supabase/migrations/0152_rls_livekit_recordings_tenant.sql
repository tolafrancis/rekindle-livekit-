-- 0152_rls_livekit_recordings_tenant.sql
-- =====================================================================
-- Phase 4 §3b — tenant dimension for LiveKit recording playback.
-- livekit_recordings has no ministry_id; recordings link to a meeting via
-- meeting_id (text -> ministry_video_meetings.id) or a channel via channel_id.
-- Existing policy: only the channel OWNER reads channel recordings; meeting
-- recordings are unreadable by clients (service_role only). This adds tenant-scoped
-- read for MEETING recordings so a ministry's members can view THEIR recordings and
-- never another church's. Additive + tenant-safe (is_group_member from 0150).
-- =====================================================================

begin;

drop policy if exists p_livekit_rec_ministry_read on public.livekit_recordings;
create policy p_livekit_rec_ministry_read on public.livekit_recordings
  for select to authenticated
  using (
    meeting_id is not null and exists (
      select 1 from public.ministry_video_meetings m
      where m.id::text = livekit_recordings.meeting_id
        and public.is_group_member(m.ministry_id, auth.uid())
    )
  );

commit;

-- Follow-ups (§3b, not here): channel_streams is channel-owner-only (ministry
-- co-leaders can't manage) — widen to is_group_admin(live_channels.ministry_id) if
-- needed. Robust room-name→tenant binding lives in the livekit-token edge function
-- (see its §3b note) + client room-naming convention.
