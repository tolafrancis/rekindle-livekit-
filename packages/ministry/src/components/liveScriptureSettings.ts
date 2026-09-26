import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { DEFAULT_BIBLE_VERSION } from '@rekindle/features/scripture/providers';

// Live Scripture preferences (ministry_scripture_settings, migration 0373),
// shared by the Settings tab card and the operator card on the Service tab.

export interface ScriptureSettings {
  preferred_version: string;
  preferred_version_label: string;
  auto_detect: boolean;
  auto_show: boolean;
  display_seconds: number;
}

export const DEFAULT_SCRIPTURE_SETTINGS: ScriptureSettings = {
  preferred_version: DEFAULT_BIBLE_VERSION,
  preferred_version_label: 'KJV',
  auto_detect: true,
  auto_show: false,
  display_seconds: 30,
};

export function useScriptureSettings(ministryId: string) {
  const [settings, setSettings] = useState<ScriptureSettings>(DEFAULT_SCRIPTURE_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const current = useRef(settings);
  current.current = settings;

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('ministry_scripture_settings')
      .select('preferred_version, preferred_version_label, auto_detect, auto_show, display_seconds')
      .eq('ministry_id', ministryId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.warn('[liveScriptureSettings] load failed, using defaults:', error.message);
        if (data) setSettings({ ...DEFAULT_SCRIPTURE_SETTINGS, ...(data as Partial<ScriptureSettings>) });
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [ministryId]);

  /** Saves a partial change and applies it locally straight away. */
  const save = useCallback(async (patch: Partial<ScriptureSettings>) => {
    const next = { ...current.current, ...patch };
    current.current = next;
    setSettings(next);
    const { error } = await supabase
      .from('ministry_scripture_settings')
      .upsert({ ministry_id: ministryId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'ministry_id' });
    if (error) throw error;
  }, [ministryId]);

  return { settings, loaded, save };
}
