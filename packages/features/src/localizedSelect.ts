// Content tables (prayer_topics, prayer_series, prayer_library,
// devotional_series …) keep a `translations` JSON column holding EVERY
// language's copy of each row. Screens only ever show one language, but
// `select('*')` downloaded all of them — for prayer_topics that was ~19 MB of
// its ~20 MB response, and the main reason the Prayer tab took seconds to open.
//
// localizedSelect() asks Postgres for the base columns plus just the current
// language's entry; withCurrentTranslation() folds it back into the
// `{ translations: { [lang]: … } }` shape getLocalizedContent() reads, so the
// rendering code is unchanged.
//
// When adding a column to one of these tables that a screen needs, add it to
// that screen's column list too — columns not listed aren't fetched.

const SIMPLE_LANG = /^[a-z]{2,3}$/;

export function localizedSelect(columns: readonly string[], language: string): string {
  const base = columns.join(',');
  if (!language || language === 'en') return base; // English lives in the base columns
  // An unusual code can't be used safely in a PostgREST JSON path — fall back
  // to the whole column rather than risk dropping the translation.
  if (!SIMPLE_LANG.test(language)) return `${base},translations`;
  return `${base},tr_current:translations->${language}`;
}

export function withCurrentTranslation<T extends Record<string, any>>(rows: T[] | null | undefined, language: string): T[] {
  return (rows ?? []).map((row) => {
    if (!('tr_current' in row)) return row;
    const { tr_current, ...rest } = row as any;
    return (tr_current ? { ...rest, translations: { [language]: tr_current } } : rest) as T;
  });
}
