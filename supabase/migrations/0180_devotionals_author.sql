-- supabase/migrations/0180_devotionals_author.sql
-- The admin devotional form has always had an "Author" field, but `devotionals`
-- had no matching column — so whatever was typed there was silently discarded on
-- save (and, before the payload whitelist, it caused a "could not find the
-- 'author' column" 400 on create).
--
-- Add the column for real so the credited author persists and can be displayed.
-- Deliberately NOT added to `translations`: personal/ministry names are not
-- translated (see 0179 for the translatable-content pattern).
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

alter table public.devotionals
  add column if not exists author text;

comment on column public.devotionals.author is
  'Credited author of the devotional (free text, e.g. "Pastor Jane Doe"). Optional.';

commit;
