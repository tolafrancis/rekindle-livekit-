import { useEffect } from 'react';
import { supabase } from '@rekindle/supabase';
import { ScriptureDetector, formatReference, sameReference, type ScriptureReference } from '@rekindle/features/scripture/parser';
import { fetchListenerPassage, fetchPassage } from '@rekindle/features/scripture/providers';

/**
 * Live Scripture on the speaker link (/speak/:sessionId): while the speaker
 * is live, watch this session's captions for Bible references and put each
 * confirmed one on the listener display and OBS overlay automatically (in
 * the preferred version plus the listener's language when the app has a
 * public-domain edition for it), so a
 * speaker-link service shows verses without anyone keeping the dashboard
 * open.
 *
 * The page has no signed-in user, so it reads the ministry's settings and
 * writes the verse through the speaker-token functions from migration 0374,
 * which also skip it unless auto-detect and auto-show are on. Chapter-only
 * references ("Psalm 23") are never shown automatically.
 *
 * Runs on its own realtime channel and swallows every error: the captions
 * and audio on this page never depend on it.
 */
export function useSpeakerScripture(sessionId: string | undefined, speakerToken: string | null, live: boolean) {
  useEffect(() => {
    if (!live || !sessionId || !speakerToken) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const detector = new ScriptureDetector();
    let lastShown: ScriptureReference | null = null;
    let queue: Promise<void> = Promise.resolve();

    const showVerse = async (reference: ScriptureReference, version: string, versionLabel: string, targetLanguage: string) => {
      const [passage, listener] = await Promise.all([
        fetchPassage(version, { sessionId, speakerToken }, reference),
        // The second language is a bonus: without it the verse still goes up.
        fetchListenerPassage(targetLanguage, reference).catch(() => null),
      ]);
      if (cancelled) return;
      const { error } = await supabase.rpc('speaker_show_scripture', {
        p_session_id: sessionId,
        p_speaker_token: speakerToken,
        p_reference: formatReference(reference),
        p_version: version === 'KJV' ? 'KJV' : versionLabel || passage.versionLabel,
        p_text: passage.text,
        p_attribution: passage.attribution ?? null,
        p_is_licensed: version !== 'KJV',
        p_listener_text: listener?.text ?? null,
        p_listener_version: listener?.versionLabel ?? null,
        p_listener_language: listener?.language ?? null,
      });
      if (error) throw error;
      lastShown = reference;
    };

    (async () => {
      try {
        const { data: settings, error } = await supabase.rpc('speaker_scripture_settings', {
          p_session_id: sessionId,
          p_speaker_token: speakerToken,
        });
        if (cancelled || error || !settings || !settings.auto_detect || !settings.auto_show) return;

        channel = supabase
          .channel(`speaker-scripture-${sessionId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'translation_logs', filter: `session_id=eq.${sessionId}` },
            (payload) => {
              try {
                const row = payload.new as { source_text?: string; translated_text?: string };
                const found = detector.scan(row.source_text || '', row.translated_text);
                const latest = [...found].reverse().find(d => d.status === 'confirmed');
                if (!latest || sameReference(latest.reference, lastShown)) return;
                // One at a time, in speaking order.
                queue = queue
                  .then(() => showVerse(latest.reference, settings.preferred_version, settings.preferred_version_label, settings.target_language))
                  .catch(err => console.warn('[SpeakerPage] Live Scripture skipped a verse:', err));
              } catch (err) {
                console.warn('[SpeakerPage] Live Scripture skipped a line:', err);
              }
            },
          )
          .subscribe();
      } catch (err) {
        console.warn('[SpeakerPage] Live Scripture unavailable:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [sessionId, speakerToken, live]);
}
