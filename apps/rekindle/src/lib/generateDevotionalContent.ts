import { supabase } from '@/lib/supabase';

// Client-side wrappers for the generate-devotional-series / generate-devotional-day
// edge functions. Neither function ever returns actual Scripture verse text —
// only references — so every call here that touches scripture_references
// resolves real wording from bible-api.com itself, matching the pattern in
// generatePrayerContent.ts. Scripture is never hallucinated.

export interface DevotionalOutlineDay {
  day_number: number;
  title: string;
  focus: string;
}

export interface DevotionalOutlineResult {
  subtitle: string;
  description: string;
  category_id: string | null;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  target_audience: string;
  tags: string[];
  keywords: string[];
  days: DevotionalOutlineDay[];
}

export interface DevotionalScriptureRef {
  reference: string;
  text: string;
  version: string;
  is_primary: boolean;
}

export interface GeneratedDevotionalDay {
  title: string;
  subtitle: string;
  scripture_references: DevotionalScriptureRef[];
  introduction: string;
  main_content: string;
  reflection_questions: string[];
  guided_prayer: string;
  action_steps: string[];
  additional_thoughts: string;
  estimated_reading_time: number;
}

async function fetchScriptureText(reference: string): Promise<string> {
  if (!reference.trim()) return '';
  try {
    const res = await fetch(`https://bible-api.com/${encodeURIComponent(reference)}`);
    if (!res.ok) return '';
    const data = await res.json();
    return data.text?.trim() || data.verses?.[0]?.text?.trim() || '';
  } catch {
    return '';
  }
}

async function resolveScriptureRefs(
  refs: { reference: string; is_primary: boolean }[],
): Promise<DevotionalScriptureRef[]> {
  return Promise.all(
    refs.map(async (r) => ({
      reference: r.reference,
      text: await fetchScriptureText(r.reference),
      version: 'KJV',
      is_primary: r.is_primary,
    })),
  );
}

/**
 * Generates (or regenerates) a devotional series' metadata plus a short
 * day-by-day outline. Does not write any daily content — that's a separate
 * call per day via generateDevotionalDay, so a single day can always be
 * regenerated without disturbing the rest of the series.
 */
export async function generateDevotionalOutline(params: {
  title: string;
  total_days: number;
  categories: { id: string; name: string }[];
  language?: string;
  existing_description?: string;
  regenerate?: boolean;
}): Promise<DevotionalOutlineResult> {
  const { data, error } = await supabase.functions.invoke('generate-devotional-series', {
    body: {
      mode: params.regenerate ? 'regenerate_series' : 'outline',
      title: params.title,
      total_days: params.total_days,
      categories: params.categories,
      language: params.language,
      existing_description: params.existing_description,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as DevotionalOutlineResult;
}

/** Regenerates a single series-metadata field: description, subtitle, tags, or keywords. */
export async function regenerateSeriesField(params: {
  field: 'description' | 'subtitle' | 'tags' | 'keywords';
  title: string;
  subtitle?: string;
  description?: string;
}): Promise<{ field: string; value: string | string[] }> {
  const { data, error } = await supabase.functions.invoke('generate-devotional-series', {
    body: { mode: 'regenerate_field', ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Writes a brand-new day's full content from the series outline + prior-day
 * context, so the series reads as one coherent, progressively-developing
 * journey. Resolves real Scripture text for every reference the model
 * proposes before returning.
 */
export async function generateDevotionalDay(params: {
  series_title: string;
  series_description?: string;
  day_number: number;
  total_days: number;
  day_outline?: { title: string; focus: string };
  previous_day_title?: string;
  previous_day_takeaway?: string;
  target_audience?: string;
  difficulty_level?: string;
  language?: string;
}): Promise<GeneratedDevotionalDay> {
  const { data, error } = await supabase.functions.invoke('generate-devotional-day', {
    body: { mode: 'generate', ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return {
    ...data,
    scripture_references: await resolveScriptureRefs(data.scripture_references || []),
  };
}

/**
 * Transforms one existing day's content per instruction (improve / shorter /
 * more practical / more Bible-study focused). Scripture references are never
 * altered by a rewrite — the caller's existing references are echoed back
 * with their already-resolved text, untouched.
 */
export async function rewriteDevotionalDay(params: {
  instruction: 'improve' | 'shorter' | 'more_practical' | 'more_bible_study';
  day: {
    title: string;
    subtitle?: string;
    introduction?: string;
    main_content: string;
    reflection_questions?: string[];
    guided_prayer?: string;
    action_steps?: string[];
    additional_thoughts?: string;
    scripture_references?: DevotionalScriptureRef[];
    estimated_reading_time?: number;
  };
}): Promise<GeneratedDevotionalDay> {
  const { data, error } = await supabase.functions.invoke('generate-devotional-day', {
    body: { mode: 'rewrite', instruction: params.instruction, day: params.day },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return {
    ...data,
    // The function already echoes the original refs back unchanged; keep the
    // caller's resolved text/version rather than re-fetching.
    scripture_references: params.day.scripture_references || [],
  };
}
