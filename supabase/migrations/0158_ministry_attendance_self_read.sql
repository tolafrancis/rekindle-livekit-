-- 0158_ministry_attendance_self_read.sql
-- =====================================================================
-- Let a member read their OWN attendance rows (e.g. kiosk check-ins) so the
-- ministry home can show "my check-ins this month". Leaders/admins already have
-- a broad read policy (ministry_attendance_read); this adds a self-scoped one.
-- =====================================================================

begin;

drop policy if exists ministry_attendance_self_read on public.ministry_attendance;
create policy ministry_attendance_self_read on public.ministry_attendance
  for select to authenticated
  using (
    profile_id in (
      select id from public.ministry_member_profiles where user_id = auth.uid()
    )
  );

commit;
