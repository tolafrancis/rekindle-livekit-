import React, { useEffect, useState } from 'react';
import { supabase } from '@rekindle/supabase';

/**
 * Live Scripture (phase 1): the verse the operator put on screen for a
 * translation session (in the listener's language too when there's an edition
 * for it, migration 0374), shown above the captions on the listener display
 * (/display/:sessionId) and the OBS caption overlay (/obs-captions/:sessionId).
 *
 * Reads translation_scripture_events (migration 0373) on its own realtime
 * channel, separate from the captions' one, and renders inside its own error
 * boundary: if anything here fails, it shows nothing and the captions next
 * to it carry on untouched.
 */

export interface ScriptureEvent {
  id: string;
  status: 'shown' | 'cleared';
  reference: string | null;
  version: string | null;
  text: string | null;
  attribution: string | null;
  /** The same passage in the listener's language (migration 0374), when the app has an edition for it. */
  listener_text?: string | null;
  listener_version?: string | null;
  display_seconds: number;
  created_at: string;
}

/** The verse currently on screen for a session, or null. */
export function useCurrentScripture(sessionId: string | undefined): ScriptureEvent | null {
  const [latest, setLatest] = useState<ScriptureEvent | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const take = (row: ScriptureEvent) =>
      setLatest(prev => (prev && new Date(prev.created_at) > new Date(row.created_at) ? prev : row));

    supabase
      .from('translation_scripture_events')
      .select('id, status, reference, version, text, attribution, listener_text, listener_version, display_seconds, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!cancelled && data?.[0]) take(data[0] as ScriptureEvent);
      }, () => { /* no verse: nothing to show */ });

    const channel = supabase
      .channel(`scripture-${sessionId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'translation_scripture_events', filter: `session_id=eq.${sessionId}` },
        (payload) => take(payload.new as ScriptureEvent))
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [sessionId]);

  // Hide a verse once its display time is up (display_seconds = 0 keeps it
  // until the operator replaces or clears it).
  useEffect(() => {
    setExpired(false);
    if (!latest || latest.status !== 'shown' || latest.display_seconds <= 0) return;
    const remaining = new Date(latest.created_at).getTime() + latest.display_seconds * 1000 - Date.now();
    if (remaining <= 0) { setExpired(true); return; }
    const timer = setTimeout(() => setExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [latest]);

  if (!latest || latest.status !== 'shown' || !latest.text || expired) return null;
  return latest;
}

class ScriptureBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn('[ScripturePanel] hidden after error:', err); }
  render() { return this.state.failed ? null : this.props.children; }
}

interface ScripturePanelProps {
  sessionId: string | undefined;
  /** display: the listener page's dark card. overlay: OBS Browser Source text. */
  variant: 'display' | 'overlay';
  /** Overlay font size in px (the reference line is scaled from it). */
  size?: number;
  /** Overlay background style, matching the captions' own. */
  overlayStyle?: 'box' | 'outline';
}

const Inner: React.FC<ScripturePanelProps> = ({ sessionId, variant, size = 36, overlayStyle = 'box' }) => {
  const verse = useCurrentScripture(sessionId);
  if (!verse) return null;

  if (variant === 'display') {
    return (
      <section
        aria-live="polite"
        className="w-full max-w-3xl mx-auto mt-4 px-4"
      >
        <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
            {verse.reference} · {verse.listener_text ? `${verse.listener_version} / ${verse.version}` : verse.version}
          </p>
          {verse.listener_text && (
            <p className="mt-1.5 text-lg sm:text-xl leading-snug text-white">{verse.listener_text}</p>
          )}
          <p className={verse.listener_text
            ? 'mt-2 text-sm sm:text-base leading-snug text-white/60'
            : 'mt-1.5 text-lg sm:text-xl leading-snug text-white'}>{verse.text}</p>
          {verse.attribution && <p className="mt-2 text-[10px] leading-tight text-white/40">{verse.attribution}</p>}
        </div>
      </section>
    );
  }

  const outline = '0 0 4px #000, 0 0 4px #000, 2px 2px 2px #000, -2px -2px 2px #000';
  return (
    <div
      style={{
        maxWidth: '80vw',
        textAlign: 'center',
        color: '#fff',
        ...(overlayStyle === 'outline'
          ? { textShadow: outline }
          : { background: 'rgba(20,16,48,0.82)', padding: '0.5em 0.9em', borderRadius: 12, border: '1px solid rgba(167,139,250,0.45)' }),
      }}
    >
      <div style={{ fontSize: Math.round(size * 0.55), fontWeight: 700, letterSpacing: '0.06em', color: '#c4b5fd', textTransform: 'uppercase' }}>
        {verse.reference} · {verse.listener_text ? `${verse.listener_version} / ${verse.version}` : verse.version}
      </div>
      {verse.listener_text && (
        <div style={{ fontSize: size, lineHeight: 1.3, fontWeight: 600, marginTop: '0.2em' }}>{verse.listener_text}</div>
      )}
      <div style={verse.listener_text
        ? { fontSize: Math.round(size * 0.7), lineHeight: 1.3, fontWeight: 500, marginTop: '0.35em', opacity: 0.8 }
        : { fontSize: size, lineHeight: 1.3, fontWeight: 600, marginTop: '0.2em' }}>{verse.text}</div>
      {verse.attribution && (
        <div style={{ fontSize: Math.max(10, Math.round(size * 0.3)), opacity: 0.6, marginTop: '0.35em' }}>{verse.attribution}</div>
      )}
    </div>
  );
};

export const ScripturePanel: React.FC<ScripturePanelProps> = (props) => (
  <ScriptureBoundary>
    <Inner {...props} />
  </ScriptureBoundary>
);

export default ScripturePanel;
