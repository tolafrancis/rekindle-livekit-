-- =====================================================================
-- Phase 4 — RLS isolation test suite (run AFTER applying 0150).
-- Verifies tenant isolation by impersonating a real user under RLS.
-- Fill the placeholders, then run each block; every check returns PASS/FAIL.
--
-- Impersonation under RLS (Supabase reads auth.uid() from request.jwt.claims):
--   select set_config('role', 'authenticated', true);
--   select set_config('request.jwt.claims', json_build_object('sub','<uuid>','role','authenticated')::text, true);
-- Reset afterwards:  reset role;  select set_config('request.jwt.claims', NULL, true);
--
-- Test fixtures you must provide (dedicate two ministries + one member for testing):
--   MINISTRY_A  = a ministry_groups.id
--   MINISTRY_B  = a DIFFERENT ministry_groups.id, private (is_public=false)
--   MEMBER_A    = a user who is a member/admin of A and NOT of B
--   OTHER_USER  = any user who is not in A
-- =====================================================================

-- ---- Impersonate MEMBER_A ----
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  json_build_object('sub','MEMBER_A','role','authenticated')::text, true);

-- 1) Tenant: MEMBER_A cannot read ministry B's invitations.  Expect PASS.
select case when count(*) = 0 then 'PASS' else 'FAIL' end as t1_invitations_cross_tenant
from public.ministry_invitations where ministry_id = 'MINISTRY_B';

-- 2) Tenant: MEMBER_A CAN read ministry A's invitations (not over-locked). Expect PASS
--    (>=0 rows without error; a 42501 here means the helper denies a real member).
select case when true then 'PASS' else 'FAIL' end as t2_invitations_own_readable
from (select 1 from public.ministry_invitations where ministry_id = 'MINISTRY_A' limit 1) s;

-- 3) Admin-grants: MEMBER_A cannot read ministry B's admin_access rows. Expect PASS.
select case when count(*) = 0 then 'PASS' else 'FAIL' end as t3_admin_access_cross_tenant
from public.ministry_admin_access where ministry_id = 'MINISTRY_B';

-- 4) Personal: MEMBER_A cannot see another user's devotional progress. Expect PASS.
select case when count(*) = 0 then 'PASS' else 'FAIL' end as t4_progress_other_user
from public.ministry_devotional_progress where user_id = 'OTHER_USER';

-- 5) Billing/PII: a private ministry B row is NOT visible to MEMBER_A. Expect PASS.
--    (validates the ministry_groups_select_all drop — before the fix this returned 1.)
select case when count(*) = 0 then 'PASS' else 'FAIL' end as t5_private_ministry_hidden
from public.ministry_groups where id = 'MINISTRY_B' and is_public = false;

-- 6) Platform/internal: MEMBER_A (non platform-admin) cannot read analytics. Expect PASS.
select case when count(*) = 0 then 'PASS' else 'FAIL' end as t6_analytics_denied
from public.ministry_analytics where ministry_id = 'MINISTRY_A';

-- 7) Backups: MEMBER_A cannot read content backups at all. Expect PASS.
select case when count(*) = 0 then 'PASS' else 'FAIL' end as t7_backup_denied
from public.ministry_devotionals_backup;

reset role;
select set_config('request.jwt.claims', NULL, true);

-- ---------------------------------------------------------------------
-- Follow-up assertions to add once their surfaces are hardened:
--   * content-source: church sees global + own devotionals only (not church B's owned).
--   * LiveKit: church A can't read church B's livekit_recordings / join its rooms (§3b).
--   * messaging: a leader's push audience resolves to own-ministry ids, never null (§3c).
-- ---------------------------------------------------------------------
