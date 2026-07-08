-- supabase/migrations/0144_notifications_relax_type.sql
-- The notifications.type CHECK constraint only allowed a fixed legacy set of
-- values, which rejected newer types ('broadcast', 'test', 'prayer_reminder',
-- 'reading_reminder', 'book_reminder', 'memory_reminder', 'devotional_reminder',
-- etc.) with: new row ... violates check constraint "notifications_type_check".
--
-- The app treats `type` as free-form (NotificationFeed falls back gracefully for
-- unknown types), so drop the rigid constraint rather than chase every value.

alter table public.notifications drop constraint if exists notifications_type_check;
