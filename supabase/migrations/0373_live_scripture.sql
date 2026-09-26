-- =====================================================================
-- Live Scripture display, phase 1
--
-- While a live translation session runs, the operator's dashboard detects
-- Bible references in the caption stream (a rule-based parser in the
-- browser, packages/features/src/scripture) and, on the operator's say-so,
-- shows the verse on the listener display (/display/:sessionId) and the OBS
-- caption overlay (/obs-captions/:sessionId).
--
-- translation_scripture_events is that hand-off: the operator writes one row
-- per Show or Clear; the display surfaces subscribe to it over realtime and
-- show the newest row. It is deliberately separate from translation_logs:
-- nothing in the caption/translation pipeline reads or writes it, so a
-- problem here can never hold up captions.
--
-- Licensing: KJV is public domain and its text is kept. Text from a
-- licensed version (is_licensed, fetched through the scripture-passage edge
-- function from API.Bible) is only kept while it is on screen: the moment a
-- newer event lands for the same session, older licensed rows have their
-- text blanked (trg_translation_scripture_events_blank_licensed below).
--
-- ministry_scripture_settings holds each ministry's preferences (version,
-- auto-detect, auto-show, display duration).
-- =====================================================================

begin;

create table if not exists public.translation_scripture_events (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.translation_sessions(id) on delete cascade,
  -- Always copied from the session by the trigger below; whatever the
  -- client sends is overwritten, so the RLS check can trust it.
  ministry_id     uuid not null references public.ministry_groups(id) on delete cascade,
  status          text not null check (status in ('shown', 'cleared')),
  reference       text,
  version         text,
  text            text,
  attribution     text,
  is_licensed     boolean not null default false,
  -- How long the display surfaces keep this verse up; 0 = until replaced or cleared.
  display_seconds integer not null default 30 check (display_seconds between 0 and 3600),
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  constraint translation_scripture_events_shown_has_text
    check (status = 'cleared' or (reference is not null and version is not null))
);

create index if not exists idx_translation_scripture_events_session
  on public.translation_scripture_events (session_id, created_at desc);

create or replace function public.translation_scripture_events_set_ministry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select ministry_id into new.ministry_id
    from public.translation_sessions where id = new.session_id;
  if new.ministry_id is null then
    raise exception 'translation session % not found', new.session_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_translation_scripture_events_set_ministry on public.translation_scripture_events;
create trigger trg_translation_scripture_events_set_ministry
  before insert on public.translation_scripture_events
  for each row execute function public.translation_scripture_events_set_ministry();

create or replace function public.translation_scripture_events_blank_licensed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.translation_scripture_events
     set text = null, attribution = null
   where session_id = new.session_id
     and id <> new.id
     and is_licensed
     and text is not null;
  return null;
end;
$$;

drop trigger if exists trg_translation_scripture_events_blank_licensed on public.translation_scripture_events;
create trigger trg_translation_scripture_events_blank_licensed
  after insert on public.translation_scripture_events
  for each row execute function public.translation_scripture_events_blank_licensed();

alter table public.translation_scripture_events enable row level security;

-- Same read rules as translation_logs (0273): members always; anyone else
-- unless the ministry has made its translation private.
drop policy if exists p_translation_scripture_events_member_sel on public.translation_scripture_events;
create policy p_translation_scripture_events_member_sel on public.translation_scripture_events
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

drop policy if exists p_translation_scripture_events_public_sel on public.translation_scripture_events;
create policy p_translation_scripture_events_public_sel on public.translation_scripture_events
  for select to anon, authenticated
  using (
    not exists (
      select 1 from public.language_configs lc
      where lc.ministry_id = translation_scripture_events.ministry_id
        and lc.is_public = false
    )
  );

-- Only the ministry's admins (the people who run Live Translation) can put
-- a verse on screen. No update/delete policy: the log is append-only.
drop policy if exists p_translation_scripture_events_admin_ins on public.translation_scripture_events;
create policy p_translation_scripture_events_admin_ins on public.translation_scripture_events
  for insert to authenticated
  with check (public.is_group_admin(ministry_id, auth.uid()));

do $$
begin
  alter publication supabase_realtime add table public.translation_scripture_events;
exception when duplicate_object then null;
end $$;

create table if not exists public.ministry_scripture_settings (
  ministry_id              uuid primary key references public.ministry_groups(id) on delete cascade,
  -- 'KJV' or 'apibible:<bibleId>' (see packages/features/src/scripture/providers.ts)
  preferred_version        text not null default 'KJV',
  preferred_version_label  text not null default 'KJV',
  auto_detect              boolean not null default true,
  auto_show                boolean not null default false,
  display_seconds          integer not null default 30 check (display_seconds between 0 and 3600),
  updated_at               timestamptz not null default now()
);

alter table public.ministry_scripture_settings enable row level security;

drop policy if exists p_ministry_scripture_settings_member_sel on public.ministry_scripture_settings;
create policy p_ministry_scripture_settings_member_sel on public.ministry_scripture_settings
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

drop policy if exists p_ministry_scripture_settings_admin_all on public.ministry_scripture_settings;
create policy p_ministry_scripture_settings_admin_all on public.ministry_scripture_settings
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (public.is_group_admin(ministry_id, auth.uid()));

commit;
