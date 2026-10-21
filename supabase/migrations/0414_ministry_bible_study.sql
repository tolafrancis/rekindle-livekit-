-- 0414_ministry_bible_study.sql
-- =====================================================================
-- Bible study page (Ministry › Bible Study): one place per study for
-- when it meets, how to join, its materials and its past recordings.
--
--   ministry_study_series     a study (e.g. "Wednesday Bible Study",
--                             "Book of John"), with its schedule in words
--                             and the Rekindle meeting members join, whose
--                             recordings become the study's past sessions.
--                             (join_url is kept but not used by the app.)
--   ministry_study_materials  links (PDFs, docs, videos) for a study,
--                             optionally tied to a session date.
--
-- Members of the ministry read; owner, leaders, admins and moderators
-- write (is_group_member / is_group_admin, 0150).
-- =====================================================================

create table if not exists public.ministry_study_series (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministry_groups (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  schedule_text text check (schedule_text is null or char_length(schedule_text) <= 160),
  join_url text check (join_url is null or join_url ~* '^https?://'), -- unused by the app; studies join through meeting_id
  meeting_id uuid references public.ministry_video_meetings (id) on delete set null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ministry_study_series_ministry on public.ministry_study_series (ministry_id, display_order);

create table if not exists public.ministry_study_materials (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.ministry_study_series (id) on delete cascade,
  ministry_id uuid not null references public.ministry_groups (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  url text not null check (url ~* '^https?://'),
  session_date date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_ministry_study_materials_series on public.ministry_study_materials (series_id, session_date desc nulls last);

alter table public.ministry_study_series enable row level security;
alter table public.ministry_study_materials enable row level security;

drop policy if exists p_study_series_read on public.ministry_study_series;
create policy p_study_series_read on public.ministry_study_series
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

drop policy if exists p_study_series_write on public.ministry_study_series;
create policy p_study_series_write on public.ministry_study_series
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (
    public.is_group_admin(ministry_id, auth.uid())
    and (meeting_id is null or exists (
      select 1 from public.ministry_video_meetings m where m.id = meeting_id and m.ministry_id = ministry_study_series.ministry_id
    ))
  );

drop policy if exists p_study_materials_read on public.ministry_study_materials;
create policy p_study_materials_read on public.ministry_study_materials
  for select to authenticated
  using (public.is_group_member(ministry_id, auth.uid()));

-- ministry_id must match the series', so a leader can't file material
-- under another ministry's study.
drop policy if exists p_study_materials_write on public.ministry_study_materials;
create policy p_study_materials_write on public.ministry_study_materials
  for all to authenticated
  using (public.is_group_admin(ministry_id, auth.uid()))
  with check (
    public.is_group_admin(ministry_id, auth.uid())
    and exists (select 1 from public.ministry_study_series s where s.id = series_id and s.ministry_id = ministry_study_materials.ministry_id)
  );

grant select, insert, update, delete on public.ministry_study_series to authenticated;
grant select, insert, update, delete on public.ministry_study_materials to authenticated;
