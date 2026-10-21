-- 0415_small_group_bible_study.sql
-- =====================================================================
-- Bible studies for small groups (builds on 0414).
--
--   ministry_study_series.small_group_id   null: a ministry-wide study (as
--                                           before). Set: the study belongs
--                                           to that small group, and only
--                                           its members see it.
--   ministry_study_series.shared_from_id   a group study that follows a
--                                           ministry-wide study ("Book of
--                                           John" in every cell): the group
--                                           also sees that study's materials.
--
-- Group leaders and assistant leaders (is_small_group_leader, 0331, which
-- also covers coordinators and ministry admins) edit their group's studies
-- and materials. Ministry-wide studies keep their 0414 rules.
-- =====================================================================

alter table public.ministry_study_series
  add column if not exists small_group_id uuid references public.small_groups (id) on delete cascade,
  add column if not exists shared_from_id uuid references public.ministry_study_series (id) on delete set null;
create index if not exists idx_ministry_study_series_small_group
  on public.ministry_study_series (small_group_id) where small_group_id is not null;

-- Who may edit a study (and so its materials). Security definer so the
-- materials policies and the series policy can look a series up without
-- running into its own row security.
create or replace function public.can_edit_study_series(p_series_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select case
      when s.small_group_id is null then public.is_group_admin(s.ministry_id, p_user_id)
      else public.is_small_group_leader(s.small_group_id, p_user_id)
    end
    from public.ministry_study_series s where s.id = p_series_id
  ), false);
$$;
grant execute on function public.can_edit_study_series(uuid, uuid) to authenticated;

-- A study a group can follow: ministry-wide and in the same ministry.
create or replace function public.is_ministry_wide_study(p_series_id uuid, p_ministry_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.ministry_study_series
    where id = p_series_id and ministry_id = p_ministry_id and small_group_id is null
  );
$$;
grant execute on function public.is_ministry_wide_study(uuid, uuid) to authenticated;

drop policy if exists p_study_series_read on public.ministry_study_series;
create policy p_study_series_read on public.ministry_study_series
  for select to authenticated
  using (
    case when small_group_id is null
      then public.is_group_member(ministry_id, auth.uid())
      else public.is_small_group_member(small_group_id, auth.uid())
    end
  );

drop policy if exists p_study_series_write on public.ministry_study_series;
create policy p_study_series_write on public.ministry_study_series
  for all to authenticated
  using (
    case when small_group_id is null
      then public.is_group_admin(ministry_id, auth.uid())
      else public.is_small_group_leader(small_group_id, auth.uid())
    end
  )
  with check (
    (case when small_group_id is null
      then public.is_group_admin(ministry_id, auth.uid())
      else public.is_small_group_leader(small_group_id, auth.uid())
    end)
    and (small_group_id is null or exists (
      select 1 from public.small_groups g where g.id = small_group_id and g.ministry_id = ministry_study_series.ministry_id
    ))
    and (meeting_id is null or exists (
      select 1 from public.ministry_video_meetings m where m.id = meeting_id and m.ministry_id = ministry_study_series.ministry_id
    ))
    and (shared_from_id is null or (
      small_group_id is not null and public.is_ministry_wide_study(shared_from_id, ministry_id)
    ))
  );

-- Materials: readable by whoever can read their study; editable by whoever
-- can edit it.
drop policy if exists p_study_materials_read on public.ministry_study_materials;
create policy p_study_materials_read on public.ministry_study_materials
  for select to authenticated
  using (exists (select 1 from public.ministry_study_series s where s.id = series_id));

drop policy if exists p_study_materials_write on public.ministry_study_materials;
create policy p_study_materials_write on public.ministry_study_materials
  for all to authenticated
  using (public.can_edit_study_series(series_id, auth.uid()))
  with check (
    public.can_edit_study_series(series_id, auth.uid())
    and exists (select 1 from public.ministry_study_series s where s.id = series_id and s.ministry_id = ministry_study_materials.ministry_id)
  );
