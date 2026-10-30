-- 0426_audit_log_actor_types.sql
-- =====================================================================
-- ministry_audit_logs.actor_type only allowed 'user' | 'system' | 'admin',
-- but the Platform Admin screens (and admin_delete_ministry, 0424) write
-- 'platform_admin', and AuditLogsViewer filters on 'platform_admin' and
-- 'ministry_admin'. Every platform-admin audit insert was failing the
-- check: silently in the app (the inserts aren't error-checked), and as
-- a 400 from admin_delete_ministry. Allow the values the app uses.
-- =====================================================================

alter table public.ministry_audit_logs
  drop constraint if exists ministry_audit_logs_actor_type_check;

alter table public.ministry_audit_logs
  add constraint ministry_audit_logs_actor_type_check
  check (actor_type = any (array['user', 'system', 'admin', 'platform_admin', 'ministry_admin']));
