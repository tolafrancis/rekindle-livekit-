-- 0257_video_transcode_job_claim.sql
-- =====================================================================
-- Lets multiple workers/video-transcode instances poll
-- ministry_video_messages concurrently without two workers grabbing the
-- same row. PostgREST (what supabase-js talks to) has no FOR UPDATE SKIP
-- LOCKED in its query builder, so the atomic claim has to happen inside
-- a SQL function the worker calls via .rpc() instead of a plain select().
--
-- claimed_at also doubles as stale-job recovery: if a worker dies mid-job,
-- the row stays claimed but stuck in 'processing' — after
-- p_stale_after_minutes another worker is allowed to re-claim it rather
-- than it being lost forever.
-- =====================================================================

begin;

alter table public.ministry_video_messages
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by text;

create or replace function public.claim_ministry_video_transcode_jobs(
  p_limit int default 3,
  p_worker_id text default 'unknown',
  p_stale_after_minutes int default 30
)
returns setof public.ministry_video_messages
language plpgsql
as $$
begin
  return query
    update public.ministry_video_messages
    set claimed_at = now(),
        claimed_by = p_worker_id
    where id in (
      select id from public.ministry_video_messages
      where status = 'processing'
        and raw_storage_key is not null
        and (claimed_at is null or claimed_at < now() - make_interval(mins => p_stale_after_minutes))
      order by created_at asc
      limit p_limit
      for update skip locked
    )
    returning *;
end;
$$;

commit;
