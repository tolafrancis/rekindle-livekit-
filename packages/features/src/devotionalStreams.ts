// Daily-devotional streams (migration 0149). Admin-authored named feeds of the
// main-app `devotionals` table. A ministry or user picks one; the widget/homepage
// then scopes "today's devotional" to that stream. Streams are never authored by
// ministries — they only consume.

import { supabase } from '@rekindle/supabase';

export interface DevotionalStream {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  is_public: boolean;
  is_default: boolean;
  sort_order: number;
  /** Machine translations written by process-translation-queue (migration 0179),
   *  shaped {"fr": {"name": "...", "description": "..."}}. */
  translations?: Record<string, { name?: string; description?: string }> | null;
}

/**
 * Swap in the translated name/description for `language`, falling back to the
 * authored English per-field. Mirrors how DevotionalSeriesViewer localizes a
 * series/day — there is no shared helper for the `translations` JSONB.
 */
export function localizeStream(stream: DevotionalStream, language?: string): DevotionalStream {
  if (!language || language === 'en') return stream;
  const t = stream.translations?.[language];
  if (!t) return stream;
  return {
    ...stream,
    name: t.name || stream.name,
    description: t.description || stream.description,
  };
}

let defaultStreamIdCache: string | null | undefined;

/** The id of the default ("ReKindle BC") stream, cached for the session. */
export async function getDefaultStreamId(): Promise<string | null> {
  if (defaultStreamIdCache !== undefined) return defaultStreamIdCache;
  const { data } = await supabase
    .from('devotional_streams')
    .select('id')
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();
  defaultStreamIdCache = data?.id ?? null;
  return defaultStreamIdCache;
}

/**
 * Public streams for pickers, default first, then sort_order.
 * Pass the reader's language to get translated names/blurbs; omitting it
 * returns the authored English, so existing callers are unaffected.
 */
export async function listPublicStreams(language?: string): Promise<DevotionalStream[]> {
  const { data } = await supabase
    .from('devotional_streams')
    .select('*')
    .eq('is_public', true)
    .order('is_default', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  // Ordering stays on the authored name — sorting by the translated value would
  // reshuffle the picker per language and move the default stream off the top.
  return ((data as DevotionalStream[]) ?? []).map((s) => localizeStream(s, language));
}

/** The stream a ministry chose for its homepage, or null if it writes its own. */
export async function getMinistryStreamId(ministryId: string): Promise<string | null> {
  const { data } = await supabase
    .from('ministry_devotional_settings')
    .select('daily_devotional_stream_id')
    .eq('ministry_id', ministryId)
    .maybeSingle();
  return data?.daily_devotional_stream_id ?? null;
}
