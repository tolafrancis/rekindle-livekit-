-- 0408_meeting_short_codes.sql
-- =====================================================================
-- Short, Google Meet style meeting links: https://<app>/m/abc-defg-hij
-- instead of /ministry/<uuid>/meeting/<uuid>.
--
-- Every ministry and channel meeting gets a short_code (3-4-3 lowercase
-- letters). Codes are unique across BOTH meeting tables, so /m/:code
-- resolves to exactly one meeting. Both tables already allow public SELECT,
-- so the client looks the code up directly; no RPC needed.
-- Idempotent.
-- =====================================================================

begin;

create or replace function public.gen_meeting_short_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'abcdefghijkmnopqrstuvwxyz'; -- no "l" (reads as 1/I)
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..10 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    code := substr(code, 1, 3) || '-' || substr(code, 4, 4) || '-' || substr(code, 8, 3);
    exit when not exists (select 1 from public.ministry_video_meetings where short_code = code)
          and not exists (select 1 from public.live_channel_video_meetings where short_code = code);
  end loop;
  return code;
end;
$$;

alter table public.ministry_video_meetings add column if not exists short_code text;
alter table public.live_channel_video_meetings add column if not exists short_code text;

update public.ministry_video_meetings set short_code = public.gen_meeting_short_code() where short_code is null;
update public.live_channel_video_meetings set short_code = public.gen_meeting_short_code() where short_code is null;

alter table public.ministry_video_meetings alter column short_code set default public.gen_meeting_short_code();
alter table public.live_channel_video_meetings alter column short_code set default public.gen_meeting_short_code();

create unique index if not exists ministry_video_meetings_short_code_key
  on public.ministry_video_meetings (short_code);
create unique index if not exists live_channel_video_meetings_short_code_key
  on public.live_channel_video_meetings (short_code);

commit;
