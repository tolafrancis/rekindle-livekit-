-- supabase/migrations/0113_gift_aid_regulator_fields.sql
-- Gift Aid — charity regulator fields for the R68 v2 <Regulator> element.
-- HMRC requires the charity's regulator (CCEW/CCNI/OSCR) or an explicit
-- "not registered" / "other", UNLESS the HMRC reference starts with CH/CF.
--
-- Idempotent: safe to re-run. If your gift-aid schema is dashboard-managed
-- rather than migration-managed, run the ALTERs below directly in the SQL Editor.

do $$
begin
  if to_regclass('public.ministry_gift_aid_settings') is not null then
    alter table public.ministry_gift_aid_settings
      add column if not exists regulator_type text not null default 'CCEW',
      add column if not exists regulator_number text,
      add column if not exists regulator_other_name text;

    -- Constrain regulator_type to the known set (drop-then-add for idempotency).
    if exists (
      select 1 from pg_constraint
      where conname = 'ministry_gift_aid_settings_regulator_type_check'
    ) then
      alter table public.ministry_gift_aid_settings
        drop constraint ministry_gift_aid_settings_regulator_type_check;
    end if;

    alter table public.ministry_gift_aid_settings
      add constraint ministry_gift_aid_settings_regulator_type_check
      check (regulator_type in ('CCEW', 'CCNI', 'OSCR', 'none', 'other'));
  end if;
end $$;
