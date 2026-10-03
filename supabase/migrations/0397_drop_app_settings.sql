-- 0397_drop_app_settings.sql
-- app_settings was a leftover key/value table (placeholder store links from
-- February) that nothing reads any more, with RLS policies letting anyone,
-- even signed-out visitors, write to it. Store and download links now live
-- in platform_settings under 'app_download_links' (admin-only writes).
drop table if exists public.app_settings;
