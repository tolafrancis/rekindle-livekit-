-- 0261_background_music_ministry_usage.sql
-- =====================================================================
-- Meters personal music uploads (the flat-10-per-member cap in
-- packages/features/src/musicStorage.ts) against ministry_usage_metrics.
--
-- background_music previously had no ministry_id at all — a track only knew
-- its uploader (uploaded_by), and a user can belong to more than one
-- ministry, so there's no way to derive "which ministry this upload counts
-- against" from the row alone. ministry_id is set explicitly by the client
-- at upload time (from the active ministry the upload happened through) and
-- stays null for ReKindle-shared/consumer-app uploads, which aren't
-- ministry-billed.
--
-- Metering runs via an AFTER INSERT trigger, not a client-side RPC call —
-- increment_ministry_usage is service_role-only by design (0260), so a
-- regular authenticated insert can't call it directly; the trigger function
-- is SECURITY DEFINER and owned by the same role as increment_ministry_usage,
-- so it can call it regardless.
-- =====================================================================

begin;

alter table public.background_music
  add column if not exists ministry_id uuid references public.ministry_groups(id) on delete set null,
  add column if not exists file_size_bytes bigint;

create index if not exists idx_background_music_ministry_id
  on public.background_music (ministry_id) where ministry_id is not null;

create or replace function public.background_music_meter_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ministry_id is not null and new.file_size_bytes is not null then
    perform public.increment_ministry_usage(new.ministry_id, new.file_size_bytes, 0, 0);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_background_music_meter_usage on public.background_music;
create trigger trg_background_music_meter_usage
  after insert on public.background_music
  for each row execute function public.background_music_meter_usage();

commit;
