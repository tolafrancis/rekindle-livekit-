-- 0276_translation_egress_id.sql
-- =====================================================================
-- Phase 2 architecture change: rekindle-translation-bot's HLS delivery is
-- moving off a hand-rolled ffmpeg → Supabase Storage pipeline onto LiveKit
-- Egress (Track Composite Egress on the bot's own translated audio track,
-- output straight to R2 — the same EgressClient/SegmentedFileOutput/S3Upload
-- pattern already proven in supabase/functions/livekit-egress/index.ts for
-- meeting recordings and channel broadcasts). Every HLS bug found during
-- Week-1 live testing (cache-control defaults, directory cleanup on
-- restart, unbounded playlist growth, upload-interval timing) existed
-- specifically because we owned the segmenting/uploading ourselves —
-- LiveKit's managed Egress infrastructure already solves that class of
-- problem for the recording/broadcast features, so RLT adopts the same
-- approach instead of re-solving it a third time.
--
-- egress_id tracks the LiveKit Egress job so BotSession.end() (and crash
-- recovery, in a NEW process after a restart — the whole reason this needs
-- to be persisted rather than kept in memory) can call stopEgress() on the
-- right job instead of leaving it running (and billing) indefinitely.
-- =====================================================================

begin;

alter table public.translation_sessions
  add column if not exists egress_id text;

-- device_update_session gains p_egress_id as a new trailing, defaulted
-- param — existing callers that omit it are unaffected. Dropped and
-- recreated (not just `create or replace`) because changing the parameter
-- list would otherwise create a second overloaded function alongside the
-- original rather than cleanly replacing it.
drop function if exists public.device_update_session(uuid, text, text, text, text);

create or replace function public.device_update_session(
  p_session_id      uuid,
  p_status          text default null,
  p_hls_stream_url  text default null,
  p_error_message   text default null,
  p_token           text default null,
  p_egress_id       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id       uuid;
  v_device_ministry uuid;
  v_session_ministry uuid;
begin
  select ministry_id into v_session_ministry
    from public.translation_sessions where id = p_session_id;
  if v_session_ministry is null then
    raise exception 'Unknown translation session';
  end if;

  if auth.role() <> 'service_role' then
    select device_id, ministry_id into v_device_id, v_device_ministry
      from public._translation_device_from_token(p_token);
    if v_device_id is null then
      raise exception 'Invalid or expired device token';
    end if;
    if v_device_ministry <> v_session_ministry then
      raise exception 'Device is not authorized for this session';
    end if;
  end if;

  update public.translation_sessions
    set status          = coalesce(p_status, status),
        hls_stream_url  = coalesce(p_hls_stream_url, hls_stream_url),
        error_message   = coalesce(p_error_message, error_message),
        egress_id       = coalesce(p_egress_id, egress_id),
        started_at      = case when p_status = 'active' and started_at is null then now() else started_at end,
        ended_at        = case when p_status = 'ended' then now() else ended_at end
    where id = p_session_id;
end;
$$;

grant execute on function public.device_update_session(uuid, text, text, text, text, text) to anon, authenticated, service_role;

commit;
