-- 0433: Ministries create their own prayer challenges.
--
-- enhanced_prayer_challenges already has a ministry_id column (unused until
-- now). Ministry leaders/admins can now create, edit and delete challenges for
-- their own ministry; the ministry Challenges tab shows only those, and the
-- Rekindle app shows only Rekindle-wide ones (ministry_id is null).
--
-- Also fixes creation, which was failing for everyone:
--   * instrumental_id was uuid but the app stores track ids like '1'.
--   * the app writes live_session_date / live_session_duration, which didn't exist.
-- No DROP statements (they hang through the Supabase connector).

begin;

alter table public.enhanced_prayer_challenges
  alter column instrumental_id type text using instrumental_id::text;

alter table public.enhanced_prayer_challenges
  add column if not exists live_session_date timestamptz,
  add column if not exists live_session_duration integer;

create index if not exists enhanced_prayer_challenges_ministry_id_idx
  on public.enhanced_prayer_challenges (ministry_id);

-- INSERT: all permissive insert policies must refuse a ministry_id the caller
-- doesn't manage (policies are OR'd, so each one needs the check).
alter policy insert_enhanced_challenges on public.enhanced_prayer_challenges
  with check (
    (creator_id = auth.uid() or created_by = auth.uid())
    and (ministry_id is null or public.is_ministry_manager(ministry_id, auth.uid()))
  );

alter policy "Users create challenges" on public.enhanced_prayer_challenges
  with check (
    auth.uid() = creator_id
    and (ministry_id is null or public.is_ministry_manager(ministry_id, auth.uid()))
  );

alter policy "Premium/Ministry users can create challenges" on public.enhanced_prayer_challenges
  with check (
    exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and s.plan = any (array['premium'::text, 'ministry'::text])
        and s.status = 'active'::text
    )
    and (ministry_id is null or public.is_ministry_manager(ministry_id, auth.uid()))
  );

-- UPDATE: creator, platform staff, or a manager of the challenge's ministry.
alter policy update_enhanced_challenges on public.enhanced_prayer_challenges
  using (
    created_by = auth.uid() or creator_id = auth.uid()
    or public.is_platform_staff(auth.uid())
    or (ministry_id is not null and public.is_ministry_manager(ministry_id, auth.uid()))
  )
  with check (
    public.is_platform_staff(auth.uid())
    or (
      (created_by = auth.uid() or creator_id = auth.uid()
        or (ministry_id is not null and public.is_ministry_manager(ministry_id, auth.uid())))
      and (ministry_id is null or public.is_ministry_manager(ministry_id, auth.uid()))
    )
  );

alter policy "Creators can update their own challenges" on public.enhanced_prayer_challenges
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and (ministry_id is null or public.is_ministry_manager(ministry_id, auth.uid()))
  );

-- DELETE: creator, platform staff, or a manager of the challenge's ministry.
alter policy "Creators can delete their own challenges" on public.enhanced_prayer_challenges
  using (
    created_by = auth.uid() or creator_id = auth.uid()
    or public.is_platform_staff(auth.uid())
    or (ministry_id is not null and public.is_ministry_manager(ministry_id, auth.uid()))
  );

commit;
