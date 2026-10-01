import { supabase } from '@/lib/supabase';

// Client-side wrappers for the generate-prayer-series edge function, mirroring
// generateDevotionalContent.ts. The function only ever proposes a Scripture
// reference; the verse text is resolved here from bible-api.com, so Scripture
// is never hallucinated.

export interface PrayerOutlineDay {
  day_number: number;
  title: string;
  focus: string;
}

export interface PrayerSeriesOutline {
  subtitle: string;
  description: string;
  category_id: string | null;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  days: PrayerOutlineDay[];
}

export interface GeneratedPrayerDay {
  title: string;
  prayer_focus: string;
  scripture_reference: string;
  scripture_text: string;
  prayer_text: string;
  prayer_points: { title: string; content: string; duration: number }[];
  duration_minutes: number;
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

/** Drafts a prayer series' details plus a day-by-day outline (no daily prayers yet). */
export async function generatePrayerSeriesOutline(params: {
  title: string;
  total_days: number;
  categories: { id: string; name: string }[];
  existing_description?: string;
  language?: string;
}): Promise<PrayerSeriesOutline> {
  const { data, error } = await supabase.functions.invoke('generate-prayer-series', {
    body: { mode: 'outline', ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as PrayerSeriesOutline;
}

/** Writes one day's full prayer content, with real Scripture text resolved for its reference. */
export async function generatePrayerSeriesDay(params: {
  series_title: string;
  series_description?: string;
  day_number: number;
  total_days: number;
  day_outline?: { title: string; focus: string };
  previous_day_title?: string;
  previous_day_focus?: string;
  difficulty_level?: string;
  language?: string;
}): Promise<GeneratedPrayerDay> {
  const { data, error } = await supabase.functions.invoke('generate-prayer-series', {
    body: { mode: 'day', ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return { ...data, scripture_text: await fetchScriptureText(data.scripture_reference || '') };
}
