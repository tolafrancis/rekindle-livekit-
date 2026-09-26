import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Badge } from '@rekindle/ui/badge';
import { Switch } from '@rekindle/ui/switch';
import { Label } from '@rekindle/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { supabase } from '@rekindle/supabase';
import { BookOpen, Eye, EyeOff, Loader2, Lock, LockOpen, RotateCcw, X } from 'lucide-react';
import {
  ScriptureDetector,
  formatReference,
  parseReference,
  sameReference,
  type ScriptureDetection,
  type ScriptureReference,
} from '@rekindle/features/scripture/parser';
import { fetchPassage } from '@rekindle/features/scripture/providers';
import { useScriptureSettings } from './liveScriptureSettings';

/**
 * Live Scripture operator card (phase 1), on the Live Translation service
 * screen. Watches the chosen session's captions (translation_logs, the same
 * rows the listener display and OBS overlay read), runs the rule-based
 * reference parser in this browser, and puts verses on screen by writing
 * translation_scripture_events rows.
 *
 * It only ever reads the caption stream, on its own realtime channel, and it
 * renders inside its own error boundary: nothing here can slow down or break
 * transcription, translation or captions.
 */

export interface ScriptureSessionOption {
  id: string;
  label: string;
}

interface Detected {
  reference: ScriptureReference;
  status: ScriptureDetection['status'] | 'manual';
  at: number;
}

interface OnScreen {
  reference: ScriptureReference;
  versionLabel: string;
  /** When the display surfaces drop it by themselves (display_seconds); null = stays. */
  until: number | null;
}

const untilFor = (createdAt: number, seconds: number) => (seconds > 0 ? createdAt + seconds * 1000 : null);

const Inner: React.FC<{ ministryId: string; sessions: ScriptureSessionOption[] }> = ({ ministryId, sessions }) => {
  const { settings, save } = useScriptureSettings(ministryId);
  const [sessionId, setSessionId] = useState<string>(sessions[0]?.id ?? '');
  const [detected, setDetected] = useState<Detected | null>(null);
  const [onScreen, setOnScreen] = useState<OnScreen | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; retry: ScriptureReference | null } | null>(null);
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  // Follow the list: if the watched session ends, move to the newest one.
  useEffect(() => {
    if (!sessions.some(s => s.id === sessionId)) setSessionId(sessions[0]?.id ?? '');
  }, [sessions, sessionId]);

  // Refs so the realtime callback always sees current values without
  // resubscribing on every change.
  const live = useRef({ settings, locked, onScreen, sessionId });
  live.current = { settings, locked, onScreen, sessionId };

  const show = useCallback(async (reference: ScriptureReference) => {
    const target = live.current.sessionId;
    if (!target) return;
    const { preferred_version, preferred_version_label, display_seconds } = live.current.settings;
    setBusy(true);
    setError(null);
    try {
      const passage = await fetchPassage(preferred_version, ministryId, reference);
      const label = preferred_version === 'KJV' ? 'KJV' : preferred_version_label || passage.versionLabel;
      const { error: insertError } = await supabase.from('translation_scripture_events').insert({
        session_id: target,
        ministry_id: ministryId, // overwritten from the session by the DB trigger
        status: 'shown',
        reference: formatReference(reference),
        version: label,
        text: passage.text,
        attribution: passage.attribution ?? null,
        is_licensed: preferred_version !== 'KJV',
        display_seconds,
      });
      if (insertError) throw insertError;
      setOnScreen({ reference, versionLabel: label, until: untilFor(Date.now(), display_seconds) });
    } catch (err: any) {
      console.warn('[LiveScripture] show failed:', err);
      setError({ message: 'Scripture unavailable', retry: reference });
    } finally {
      setBusy(false);
    }
  }, [ministryId]);

  const hide = useCallback(async () => {
    const target = live.current.sessionId;
    if (!target) return;
    setBusy(true);
    try {
      const { error: insertError } = await supabase.from('translation_scripture_events').insert({
        session_id: target,
        ministry_id: ministryId,
        status: 'cleared',
      });
      if (insertError) throw insertError;
      setOnScreen(null);
    } catch (err: any) {
      console.warn('[LiveScripture] hide failed:', err);
      setError({ message: 'Could not hide the verse. Try again.', retry: null });
    } finally {
      setBusy(false);
    }
  }, [ministryId]);

  // Pick up what's already on screen for this session (e.g. after a reload).
  useEffect(() => {
    setOnScreen(null);
    if (!sessionId) return;
    let cancelled = false;
    supabase
      .from('translation_scripture_events')
      .select('status, reference, version, display_seconds, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const row = data?.[0] as { status: string; reference: string | null; version: string | null; display_seconds: number; created_at: string } | undefined;
        const reference = row?.status === 'shown' && row.reference ? parseReference(row.reference) : null;
        if (cancelled || !row || !reference) return;
        const until = untilFor(new Date(row.created_at).getTime(), row.display_seconds);
        if (until === null || until > Date.now()) setOnScreen({ reference, versionLabel: row.version || '', until });
      }, () => {});
    return () => { cancelled = true; };
  }, [sessionId]);

  // Forget the on-screen verse once the displays have timed it out.
  useEffect(() => {
    if (!onScreen?.until) return;
    const timer = setTimeout(() => setOnScreen(null), Math.max(0, onScreen.until - Date.now()));
    return () => clearTimeout(timer);
  }, [onScreen]);

  // Watch the captions of the chosen session.
  useEffect(() => {
    if (!sessionId || !settings.auto_detect) return;
    const detector = new ScriptureDetector();
    const channel = supabase
      .channel(`scripture-detect-${sessionId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'translation_logs', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          try {
            const row = payload.new as { source_text?: string; translated_text?: string };
            const found = detector.scan(row.source_text || '', row.translated_text);
            const latest = found[found.length - 1];
            if (!latest || live.current.locked) return;
            setDetected({ reference: latest.reference, status: latest.status, at: Date.now() });
            const { settings: s, onScreen: current } = live.current;
            if (s.auto_show && latest.status === 'confirmed' && !sameReference(current?.reference, latest.reference)) {
              show(latest.reference);
            }
          } catch (err) {
            console.warn('[LiveScripture] detection skipped a line:', err);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, settings.auto_detect, show]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const reference = parseReference(manual);
    if (!reference) { setManualError('Not a passage I recognise. Try "John 3:16".'); return; }
    setManualError(null);
    setManual('');
    setDetected({ reference, status: 'manual', at: Date.now() });
    show(reference);
  };

  const statusBadge = detected && (
    detected.status === 'confirmed' ? <Badge variant="success">Confirmed</Badge>
      : detected.status === 'suggest' ? <Badge variant="warning">Suggested</Badge>
        : <Badge variant="secondary">Typed</Badge>
  );
  const retryRef = error?.retry ?? null;
  const detectedIsOnScreen = !!detected && sameReference(detected.reference, onScreen?.reference);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-indigo-600" /> Live Scripture
          </CardTitle>
          <Button
            variant={locked ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setLocked(v => !v)}
            title={locked ? 'Unlock: pick up new references again' : 'Lock: ignore new references for now'}
          >
            {locked ? <Lock className="h-4 w-4 mr-1.5" /> : <LockOpen className="h-4 w-4 mr-1.5" />}
            {locked ? 'Locked' : 'Lock'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sessions.length > 1 && (
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger><SelectValue placeholder="Choose a session" /></SelectTrigger>
            <SelectContent>
              {sessions.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <div className="rounded-lg border p-3 space-y-2">
          {detected ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{formatReference(detected.reference)}</span>
              <span className="text-xs text-muted-foreground">{settings.preferred_version_label}</span>
              {statusBadge}
              {detectedIsOnScreen && <Badge variant="outline">On screen</Badge>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {settings.auto_detect ? 'Listening for Bible references in the captions…' : 'Automatic detection is off. Type a reference below.'}
            </p>
          )}
          {onScreen && !detectedIsOnScreen && (
            <p className="text-xs text-muted-foreground">On screen now: {formatReference(onScreen.reference)} ({onScreen.versionLabel})</p>
          )}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <span>{error.message}</span>
              {retryRef && (
                <Button variant="outline" size="sm" onClick={() => show(retryRef)} disabled={busy}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Retry
                </Button>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => detected && show(detected.reference)} disabled={!detected || busy || !sessionId}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Eye className="h-4 w-4 mr-1.5" />} Show
            </Button>
            <Button size="sm" variant="outline" onClick={hide} disabled={!onScreen || busy}>
              <EyeOff className="h-4 w-4 mr-1.5" /> Hide
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { if (onScreen) hide(); setDetected(null); setError(null); }}
              disabled={busy || (!detected && !onScreen && !error)}
            >
              <X className="h-4 w-4 mr-1.5" /> Clear
            </Button>
          </div>
        </div>

        <form onSubmit={submitManual} className="flex gap-2">
          <Input
            value={manual}
            onChange={(e) => { setManual(e.target.value); setManualError(null); }}
            placeholder='Type a reference, e.g. "John 3:16"'
            aria-label="Scripture reference"
          />
          <Button type="submit" variant="outline" disabled={!manual.trim() || busy || !sessionId}>Show</Button>
        </form>
        {manualError && <p className="text-xs text-destructive">{manualError}</p>}

        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
          <label className="flex items-center gap-2">
            <Switch checked={settings.auto_detect} onCheckedChange={(v) => save({ auto_detect: v }).catch(() => {})} />
            <Label className="font-normal">Auto-detect</Label>
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={settings.auto_show} onCheckedChange={(v) => save({ auto_show: v }).catch(() => {})} />
            <Label className="font-normal">Auto-show confirmed verses</Label>
          </label>
        </div>
      </CardContent>
    </Card>
  );
};

class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn('[LiveScripture] operator card hidden after error:', err); }
  render() {
    return this.state.failed
      ? <Card><CardContent className="py-3 text-sm text-muted-foreground">Live Scripture is unavailable right now. Captions are not affected.</CardContent></Card>
      : this.props.children;
  }
}

export const LiveScriptureOperatorCard: React.FC<{ ministryId: string; sessions: ScriptureSessionOption[] }> = (props) =>
  props.sessions.length ? <Boundary><Inner {...props} /></Boundary> : null;

export default LiveScriptureOperatorCard;
