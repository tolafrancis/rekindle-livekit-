import { useEffect, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { formatReference, parseReference, type ScriptureReference } from '@rekindle/features/scripture/parser';
import { fetchListenerPassage, fetchPassage, DEFAULT_BIBLE_VERSION } from '@rekindle/features/scripture/providers';

/**
 * Live Scripture, standalone from Captions (2026-09-28) — shared by
 * FloatingTranslationButton.tsx (Meetings + Webinar host/speaker) and
 * TranslationListenerButton.tsx (Live Broadcast + Webinar viewers).
 *
 * Deliberately NOT imported from packages/ministry/src/components/
 * liveScriptureSettings.ts / LiveScriptureOperatorCard.tsx — packages/live
 * doesn't depend on packages/ministry (it's the other way around:
 * MinistryTranslationServiceManager.tsx already imports FROM
 * @rekindle/live), so that logic is duplicated here in miniature rather
 * than creating a backwards package dependency. Both copies read/write the
 * exact same ministry_scripture_settings / translation_scripture_events
 * tables (migration 0373_live_scripture.sql) — there is no data-model
 * difference, just two small client-side copies of the same handful of
 * lines.
 */

export interface ScriptureSettings {
  preferred_version: string;
  preferred_version_label: string;
  display_seconds: number;
}

export const DEFAULT_SCRIPTURE_SETTINGS: ScriptureSettings = {
  preferred_version: DEFAULT_BIBLE_VERSION,
  preferred_version_label: 'KJV',
  display_seconds: 30,
};

/** Ministry's Live Scripture preferences — read-only here (writing them is
 *  the dashboard Settings tab's job, packages/ministry/liveScriptureSettings.ts). */
export function useScriptureSettings(ministryId: string): ScriptureSettings {
  const [settings, setSettings] = useState<ScriptureSettings>(DEFAULT_SCRIPTURE_SETTINGS);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('ministry_scripture_settings')
      .select('preferred_version, preferred_version_label, display_seconds')
      .eq('ministry_id', ministryId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setSettings({ ...DEFAULT_SCRIPTURE_SETTINGS, ...(data as Partial<ScriptureSettings>) });
      });
    return () => { cancelled = true; };
  }, [ministryId]);
  return settings;
}

/** Puts a verse on screen for a session — same translation_scripture_events
 *  insert LiveScriptureOperatorCard.tsx's show() does, RLS-gated to
 *  is_group_admin the same way (migration 0373). Returns an error message
 *  on failure, or null on success. */
export async function showScriptureVerse(
  sessionId: string,
  ministryId: string,
  referenceText: string,
  settings: ScriptureSettings,
  listenerLanguage?: string | null,
): Promise<string | null> {
  const reference = parseReference(referenceText);
  if (!reference) return 'Not a passage I recognise. Try "John 3:16".';
  try {
    const [passage, listener] = await Promise.all([
      fetchPassage(settings.preferred_version, ministryId, reference),
      fetchListenerPassage(listenerLanguage, reference).catch(() => null),
    ]);
    const label = settings.preferred_version === 'KJV' ? 'KJV' : settings.preferred_version_label || passage.versionLabel;
    const { error } = await supabase.from('translation_scripture_events').insert({
      session_id: sessionId,
      ministry_id: ministryId, // overwritten from the session by the DB trigger
      status: 'shown',
      reference: formatReference(reference),
      version: label,
      text: passage.text,
      attribution: passage.attribution ?? null,
      is_licensed: settings.preferred_version !== 'KJV',
      display_seconds: settings.display_seconds,
      listener_text: listener?.text ?? null,
      listener_version: listener?.versionLabel ?? null,
      listener_language: listener?.language ?? null,
    });
    if (error) throw error;
    return null;
  } catch (err) {
    console.warn('[liveScripture] showScriptureVerse failed:', err);
    return 'Scripture unavailable — please try again.';
  }
}

/** Clears whatever verse is currently on screen for a session. */
export async function hideScriptureVerse(sessionId: string, ministryId: string): Promise<void> {
  try {
    const { error } = await supabase.from('translation_scripture_events').insert({
      session_id: sessionId,
      ministry_id: ministryId,
      status: 'cleared',
    });
    if (error) throw error;
  } catch (err) {
    console.warn('[liveScripture] hideScriptureVerse failed:', err);
  }
}

export type { ScriptureReference };
