import React, { useEffect, useState } from 'react';
import { Pencil, Check, X, Loader2 } from 'lucide-react';
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
      setLatest(prev => (prev && (prev.id === row.id || new Date(prev.created_at) > new Date(row.created_at)) ? prev : row));

    const poll = () => supabase
      .from('translation_scripture_events')
      .select('id, status, reference, version, text, attribution, listener_text, listener_version, display_seconds, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!cancelled && data?.[0]) take(data[0] as ScriptureEvent);
      }, () => { /* no verse: nothing to show */ });
    poll();
    // Polling backstop (2026-11-11). On 2026-11-11 a meeting's realtime
    // socket hit Supabase's "Too many joins on this socket" limit, so this
    // channel never joined: Show saved the verse but nobody's screen got the
    // INSERT, not even the host's. The realtime event still makes it
    // instant when it arrives; this guarantees it shows within a few
    // seconds when it doesn't. Also re-checks on return to the tab.
    const timer = setInterval(() => { if (document.visibilityState === 'visible') poll(); }, 4000);
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVisible);

    // One channel per hook instance: a page can use this hook more than once
    // for the same session (FloatingTranslationButton reads the verse and
    // also renders ScripturePanel). supabase.channel() hands back the
    // already-subscribed channel for a repeated name, and adding callbacks
    // to it throws "cannot add postgres_changes callbacks after subscribe()".
    const channel = supabase
      .channel(`scripture-${sessionId}-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'translation_scripture_events', filter: `session_id=eq.${sessionId}` },
        (payload) => take(payload.new as ScriptureEvent))
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
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
  /** display: the listener page's dark card. overlay: OBS Browser Source text.
   *  card: the floating verse card over a meeting, stream or screen share,
   *  solid enough to read on any background (2026-11-21). */
  variant: 'display' | 'overlay' | 'card';
  /** card only: lets the host change the verse's wording in place. Saving
   *  puts the edited text on everyone's screen. Returns an error or null. */
  onEdit?: (text: string) => Promise<string | null>;
  /** Overlay font size in px (the reference line is scaled from it). */
  size?: number;
  /** Overlay background style, matching the captions' own. */
  overlayStyle?: 'box' | 'outline';
}

// Stops the drag surface around the card from grabbing the pointer, so the
// buttons and text box inside it get their own clicks, taps and selection.
const noDrag = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };

/** The floating verse card (2026-11-21): a near-opaque dark card with light
 *  text, a ring and a shadow, so the verse reads the same over a bright
 *  slide, a white screen share or a dark camera feed. The old card was a 10%
 *  indigo tint that vanished on light backgrounds. */
const VerseCard: React.FC<{ verse: ScriptureEvent; onEdit?: (text: string) => Promise<string | null> }> = ({ verse, onEdit }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A different verse arriving (auto-detect, or someone else's edit) ends an
  // edit in progress instead of saving over it.
  useEffect(() => { setEditing(false); setError(null); }, [verse.id]);

  const save = async () => {
    if (!onEdit) return;
    setSaving(true);
    setError(null);
    const err = await onEdit(draft);
    setSaving(false);
    if (err) setError(err);
    else setEditing(false);
  };

  const label = `${verse.reference} · ${verse.listener_text ? `${verse.listener_version} / ${verse.version}` : verse.version}`;
  return (
    <section
      aria-live="polite"
      className="w-full rounded-2xl bg-gray-950/90 backdrop-blur-md px-5 py-4 text-white shadow-[0_8px_32px_rgba(0,0,0,0.55)] ring-1 ring-white/15"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-amber-300">{label}</p>
        {onEdit && !editing && (
          <button
            type="button"
            {...noDrag}
            onClick={() => { setDraft(verse.text ?? ''); setError(null); setEditing(true); }}
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Edit verse text"
            title="Edit verse text"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>
      {editing ? (
        <div {...noDrag} className="mt-2 select-text">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
              if (e.key === 'Escape') setEditing(false);
            }}
            rows={4}
            autoFocus
            className="w-full resize-y rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-base sm:text-lg leading-snug text-white outline-none focus:border-amber-300/70"
            aria-label="Verse text"
          />
          {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !draft.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-gray-950 hover:bg-amber-300 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
            </button>
          </div>
        </div>
      ) : (
        <>
          {verse.listener_text && (
            <p className="mt-1.5 text-lg sm:text-xl leading-snug font-medium text-white">{verse.listener_text}</p>
          )}
          <p className={verse.listener_text
            ? 'mt-2 text-sm sm:text-base leading-snug text-white/75'
            : 'mt-1.5 text-lg sm:text-xl leading-snug font-medium text-white'}>{verse.text}</p>
        </>
      )}
      {verse.attribution && <p className="mt-2 text-[10px] leading-tight text-white/50">{verse.attribution}</p>}
    </section>
  );
};

const Inner: React.FC<ScripturePanelProps> = ({ sessionId, variant, size = 36, overlayStyle = 'box', onEdit }) => {
  const verse = useCurrentScripture(sessionId);
  if (!verse) return null;

  if (variant === 'card') return <VerseCard verse={verse} onEdit={onEdit} />;

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
