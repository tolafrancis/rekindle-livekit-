-- 0269_ministry_recording_retention.sql
-- =====================================================================
-- Lets a ministry with an active storage_pack add-on choose how long its
-- recordings are kept (Never/30/60/90/180 days), instead of the implicit
-- "exempt from the sweep entirely" they get today. NULL keeps today's
-- behavior (never delete) for any storage_pack ministry that hasn't set a
-- preference yet — upgrading must not surprise anyone with new deletions.
--
-- recording_retention_updated_at anchors a grace period in the sweep: when
-- a ministry tightens this setting, nothing gets deleted for that ministry
-- until at least NOTICE_DAYS_BEFORE days after the change, so a shortened
-- window can't retroactively delete something with zero warning.
--
-- Ministries without an active storage_pack ignore these columns entirely —
-- they stay on the sweep's fixed 7/30-day defaults.
-- =====================================================================

begin;

alter table public.ministry_groups
  add column if not exists recording_retention_days integer,
  add column if not exists recording_retention_updated_at timestamptz;

commit;
