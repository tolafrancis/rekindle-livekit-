import { supabase } from '@/lib/supabase';

export type PrayerContentKind = 'topic' | 'series_day' | 'watch';

export interface GeneratedPrayerPoint {
  title: string;
  content: string;
  scripture: string;
  scriptureText: string;
  duration: number;
}

export interface GeneratedPrayerContent {
  description: string;
  scripture_reference: string;
  scripture_text: string;
  scriptures: { reference: string; text: string }[];
  prayer_points: GeneratedPrayerPoint[];
}

async function fetchScriptureText(reference: string): Promise<string> {
  if (!reference.trim()) return '';
  try {
    const res = await fetch(`https://bible-api.com/${encodeURIComponent(reference)}`);
    if (!res.ok) return '';
    const data = await res.json();
    return data.text || data.verses?.[0]?.text || '';
  } catch {
    return '';
  }
}

/**
 * Calls the generate-prayer-content Edge Function for a title, then fills in
 * real scripture text from bible-api.com for every reference the model
 * proposed — the model itself only ever proposes references, never verse
 * wording, so scripture is never hallucinated.
 */
export async function generatePrayerContent(
  title: string,
  kind: PrayerContentKind,
  context?: string,
  pointCount?: number,
): Promise<GeneratedPrayerContent> {
  const { data, error } = await supabase.functions.invoke('generate-prayer-content', {
    body: { title, kind, context, pointCount },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  const additionalRefs: string[] = Array.isArray(data.additional_scriptures) ? data.additional_scriptures : [];
  const rawPoints: any[] = Array.isArray(data.prayer_points) ? data.prayer_points : [];

  const [scriptureText, scriptures, prayerPoints] = await Promise.all([
    fetchScriptureText(data.scripture_reference || ''),
    Promise.all(additionalRefs.map(async (reference) => ({ reference, text: await fetchScriptureText(reference) }))),
    Promise.all(
      rawPoints.map(async (p): Promise<GeneratedPrayerPoint> => ({
        title: '',
        content: p.content || '',
        scripture: p.scripture || '',
        scriptureText: p.scripture ? await fetchScriptureText(p.scripture) : '',
        duration: p.duration || 60,
      })),
    ),
  ]);

  return {
    description: data.description || '',
    scripture_reference: data.scripture_reference || '',
    scripture_text: scriptureText,
    scriptures,
    prayer_points: prayerPoints,
  };
}
