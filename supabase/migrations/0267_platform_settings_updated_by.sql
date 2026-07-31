-- 0267_platform_settings_updated_by.sql
-- =====================================================================
-- 0266 used `create table if not exists platform_settings`, which silently
-- no-oped because a platform_settings table already existed in this
-- database (pre-dating 0266, with a different shape: id/key/value/
-- updated_at, no updated_by) — so the RLS policies and seed row from 0266
-- landed correctly, but the updated_by column never got added. Confirmed
-- via `select column_name from information_schema.columns where
-- table_name = 'platform_settings'` after a "Could not find 'updated_by'
-- column... in the schema cache" error on save.
-- =====================================================================

begin;

alter table public.platform_settings
  add column if not exists updated_by uuid references auth.users(id);

commit;
