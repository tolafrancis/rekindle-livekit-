import { supabase } from '@rekindle/supabase';
import { useCurrentMinistry } from './CurrentMinistryContext';

// =============================================================================
// Phase 3, step 4 — content-source model + merged resolver.
//
// A church sees GLOBAL content (yours, visible to all) merged with its OWN
// content, with an optional "our content only" switch. The live schema uses
// THREE source patterns (confirmed via DB introspection, 2026-07):
//
//   1. ministry_id column  — one table; NULL row = global, set = ministry-owned.
//                            (declarations, devotional_series, prayer_series)
//   2. paired tables       — a global table + a separate ministry_* table.
//                            (devotionals ↔ ministry_devotionals,
//                             prayer_library ↔ ministry_prayer_library)
//   3. global-only         — no ministry ownership at all.
//                            (affirmations, book_summaries, prayer_points, prayer_topics)
//
//   + devotionals additionally resolve by STREAM: a church can point its homepage
//     at a global-catalog stream via ministry_devotional_settings.daily_devotional_stream_id
//     (devotionals.stream_id). Stream-first, else own, else global.
// =============================================================================

export type ContentMode = 'blended' | 'own-only';
export type SourcePattern = 'ministry_id' | 'paired' | 'global_only';

export interface ContentSource {
  pattern: SourcePattern;
  globalTable: string;
  ministryTable?: string; // paired only
  streamLinked?: boolean; // devotionals
}

export const CONTENT_SOURCES: Record<string, ContentSource> = {
  devotionals: {
    pattern: 'paired',
    globalTable: 'devotionals',
    ministryTable: 'ministry_devotionals',
    streamLinked: true,
  },
  prayer_library: {
    pattern: 'paired',
    globalTable: 'prayer_library',
    ministryTable: 'ministry_prayer_library',
  },
  devotional_series: { pattern: 'ministry_id', globalTable: 'devotional_series' },
  prayer_series: { pattern: 'ministry_id', globalTable: 'prayer_series' },
  declarations: { pattern: 'ministry_id', globalTable: 'declarations' },
  affirmations: { pattern: 'global_only', globalTable: 'affirmations' },
  book_summaries: { pattern: 'global_only', globalTable: 'book_summaries' },
  prayer_points: { pattern: 'global_only', globalTable: 'prayer_points' },
  prayer_topics: { pattern: 'global_only', globalTable: 'prayer_topics' },
};

export type SourcedRow = Record<string, any> & { __source?: 'global' | 'ministry' | 'stream' };

/**
 * Apply the ministry-scope filter to a `ministry_id`-column query.
 * blended  → global (NULL) OR this ministry; own-only → this ministry only.
 */
export function scopeByMinistry(query: any, ministryId: string | null, mode: ContentMode): any {
  if (mode === 'own-only') {
    // No ministry ⇒ no owned content.
    return query.eq('ministry_id', ministryId ?? '00000000-0000-0000-0000-000000000000');
  }
  return ministryId
    ? query.or(`ministry_id.is.null,ministry_id.eq.${ministryId}`)
    : query.is('ministry_id', null);
}

/**
 * Fetch a content type as the merged global + ministry-owned set, honoring the
 * source pattern and content mode. Rows are tagged with `__source`.
 */
export async function fetchContent(
  type: keyof typeof CONTENT_SOURCES | string,
  opts: { ministryId: string | null; mode: ContentMode; select?: string },
): Promise<SourcedRow[]> {
  const src = CONTENT_SOURCES[type];
  if (!src) throw new Error(`[contentSource] unknown content type: ${type}`);
  const select = opts.select ?? '*';

  if (src.pattern === 'global_only') {
    // No ministry-owned variant — "our content only" yields nothing for these.
    if (opts.mode === 'own-only') return [];
    const { data } = await supabase.from(src.globalTable).select(select);
    return (data ?? []).map((r: any) => ({ ...r, __source: 'global' }));
  }

  if (src.pattern === 'ministry_id') {
    const { data } = await scopeByMinistry(
      supabase.from(src.globalTable).select(select),
      opts.ministryId,
      opts.mode,
    );
    return (data ?? []).map((r: any) => ({
      ...r,
      __source: r.ministry_id ? 'ministry' : 'global',
    }));
  }

  // paired
  const rows: SourcedRow[] = [];
  if (opts.mode === 'blended') {
    const { data: g } = await supabase.from(src.globalTable).select(select);
    rows.push(...(g ?? []).map((r: any) => ({ ...r, __source: 'global' as const })));
  }
  if (opts.ministryId && src.ministryTable) {
    const { data: m } = await supabase
      .from(src.ministryTable)
      .select(select)
      .eq('ministry_id', opts.ministryId);
    rows.push(...(m ?? []).map((r: any) => ({ ...r, __source: 'ministry' as const })));
  }
  return rows;
}

/** The devotional stream a ministry points its homepage at (null if none). */
export async function resolveMinistryDevotionalStream(ministryId: string): Promise<string | null> {
  const { data } = await supabase
    .from('ministry_devotional_settings')
    .select('daily_devotional_stream_id')
    .eq('ministry_id', ministryId)
    .maybeSingle();
  return data?.daily_devotional_stream_id ?? null;
}

/**
 * Devotionals for a ministry: STREAM-first (ministry_devotional_settings →
 * devotionals.stream_id), else the ministry's own + global per content mode.
 * Mirrors the shipped MinistrySpace resolution order.
 */
export async function fetchMinistryDevotionals(
  ministryId: string | null,
  mode: ContentMode,
  select = '*',
): Promise<SourcedRow[]> {
  if (ministryId) {
    const streamId = await resolveMinistryDevotionalStream(ministryId);
    if (streamId) {
      const { data } = await supabase.from('devotionals').select(select).eq('stream_id', streamId);
      if (data?.length) return data.map((r: any) => ({ ...r, __source: 'stream' as const }));
    }
  }
  return fetchContent('devotionals', { ministryId, mode, select });
}

/** Persist the "our content only" switch to ministry_groups.settings.content_mode. */
export async function setMinistryContentMode(ministryId: string, mode: ContentMode): Promise<void> {
  const { data } = await supabase
    .from('ministry_groups')
    .select('settings')
    .eq('id', ministryId)
    .maybeSingle();
  const settings = (data?.settings && typeof data.settings === 'object' ? data.settings : {}) as Record<
    string,
    any
  >;
  await supabase
    .from('ministry_groups')
    .update({ settings: { ...settings, content_mode: mode } })
    .eq('id', ministryId);
}

/** Current content mode for the active ministry. */
export function useContentMode(): ContentMode {
  const { currentMinistry } = useCurrentMinistry();
  return currentMinistry?.contentMode ?? 'blended';
}

/**
 * Content-source helpers bound to the current ministry + mode. Ministry surfaces
 * call `fetch('declarations')` / `fetchDevotionals()` and get the merged set.
 */
export function useContentSource() {
  const { currentMinistryId } = useCurrentMinistry();
  const mode = useContentMode();
  return {
    currentMinistryId,
    mode,
    fetch: (type: string, select?: string) =>
      fetchContent(type, { ministryId: currentMinistryId, mode, select }),
    fetchDevotionals: (select?: string) =>
      fetchMinistryDevotionals(currentMinistryId, mode, select),
  };
}
