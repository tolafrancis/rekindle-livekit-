-- supabase/migrations/0179_devotional_streams_translations.sql
-- Brings devotional STREAMS (migration 0149) into the content-translation
-- pipeline. Streams are admin-authored named feeds whose `name`/`description`
-- surface in the ministry homepage picker and the user source picker — both
-- user-facing, so they were the last visible content still stuck in English.
--
-- Two parts:
--   1. Add the `translations` JSONB column + GIN index, matching every other
--      translatable content table (0029, 0051).
--   2. Replace get_translation_coverage() (0178) so devotional_stream appears
--      in the admin coverage panel alongside the other content types.
--
-- Idempotent. Paste into the Supabase SQL Editor.

begin;

-- ── 1. translations column ────────────────────────────────────────────────
-- Same shape the worker writes everywhere else:
--   {"fr": {"name": "...", "description": "..."}}
alter table public.devotional_streams
  add column if not exists translations jsonb;

create index if not exists idx_devotional_streams_translations
  on public.devotional_streams using gin (translations);

-- ── 2. coverage RPC, now including devotional_stream ──────────────────────
-- Body is unchanged from 0178 apart from the added pair; `create or replace`
-- makes re-running safe whether or not 0178 was already applied.
create or replace function public.get_translation_coverage()
returns table (
  content_type     text,
  language_code    text,
  translated_items bigint,
  total_items      bigint
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  -- content_type -> table. Mirrors CONTENT_TABLE_MAP in
  -- supabase/process-translation-queue/index.sql so the labels match what the
  -- "Queue translations" action actually enqueues.
  pairs text[][] := array[
    ['devotional',          'devotionals'],
    ['ministry_devotional', 'ministry_devotionals'],
    ['devotional_series',   'devotional_series'],
    ['devotional_entry',    'devotional_entries'],
    ['devotional_stream',   'devotional_streams'],
    ['prayer_library',      'prayer_library'],
    ['prayer_topic',        'prayer_topics'],
    ['book_summary',        'book_summaries'],
    ['affirmation',         'affirmations'],
    ['declaration',         'declarations'],
    ['prayer',              'prayer_points'],
    ['announcement',        'ministry_announcements'],
    ['prayer_series',       'prayer_series']
  ];
  i        int;
  ctype    text;
  tbl      text;
  cov_sql  text := '';
  tot_sql  text := '';
begin
  -- Same gate as ui_translations_admin_write (migration 0030). Counts only, but
  -- this is SECURITY DEFINER so it must not be callable by ordinary members.
  if not exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid()
      and up.role in ('admin', 'super_admin', 'moderator')
  ) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  for i in 1 .. array_length(pairs, 1) loop
    ctype := pairs[i][1];
    tbl   := pairs[i][2];

    -- Skip tables absent from this deployment, or present without a
    -- `translations` column, instead of erroring the whole function.
    continue when to_regclass('public.' || quote_ident(tbl)) is null;
    continue when not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name   = tbl
        and c.column_name  = 'translations'
    );

    if cov_sql <> '' then
      cov_sql := cov_sql || ' union all ';
      tot_sql := tot_sql || ' union all ';
    end if;

    cov_sql := cov_sql || format(
      'select %L::text as ctype, k::text as lang from public.%I t, '
      'lateral jsonb_object_keys(t.translations) k where t.translations is not null',
      ctype, tbl
    );
    tot_sql := tot_sql || format(
      'select %L::text as ctype, count(*)::bigint as total from public.%I',
      ctype, tbl
    );
  end loop;

  if cov_sql = '' then
    return; -- no translatable tables in this deployment
  end if;

  -- LEFT JOIN so a content type with zero translations still yields a row
  -- (language_code null) carrying its total_items denominator.
  return query execute format($q$
    with cov as (%s), tot as (%s)
    select tot.ctype, cov.lang, count(cov.lang)::bigint, tot.total
    from tot left join cov on cov.ctype = tot.ctype
    group by tot.ctype, cov.lang, tot.total
    order by tot.ctype, count(cov.lang) desc
  $q$, cov_sql, tot_sql);
end;
$fn$;

revoke all on function public.get_translation_coverage() from public;
grant execute on function public.get_translation_coverage() to authenticated;

commit;
