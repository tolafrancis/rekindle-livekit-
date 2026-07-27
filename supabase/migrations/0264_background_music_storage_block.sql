-- 0264_background_music_storage_block.sql
-- =====================================================================
-- Blocks new personal music uploads for a ministry that bought a storage
-- pack and has used all of it (get_ministry_storage_status.is_full — only
-- ever true for an add-on ministry; bundled/free ministries are never
-- capacity-blocked here, per the Phase 4 enforcement design). Runs BEFORE
-- the existing metering trigger (0261) so a rejected insert never gets
-- counted.
--
-- Raises a plain exception — saveMusicTrack() in musicStorage.ts already
-- surfaces a Postgrest error's .message as { success:false, error } to the
-- caller, so no client changes needed for this to reach the uploader as a
-- readable failure instead of a generic 500.
-- =====================================================================

begin;

create or replace function public.background_music_check_storage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status record;
begin
  if new.ministry_id is not null then
    select * into v_status from public.get_ministry_storage_status(new.ministry_id);
    if v_status.is_full then
      raise exception 'Storage full — this ministry has used its full storage allotment. Buy more storage or delete old content to upload new tracks.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_background_music_check_storage on public.background_music;
create trigger trg_background_music_check_storage
  before insert on public.background_music
  for each row execute function public.background_music_check_storage();

commit;
