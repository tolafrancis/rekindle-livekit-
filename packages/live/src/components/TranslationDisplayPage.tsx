import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Room, RoomEvent, type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant } from 'livekit-client';
import { supabase } from '@rekindle/supabase';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Loader2, Lock, Radio, Type, Languages, Maximize2, Minimize2, Volume2 } from 'lucide-react';

interface SessionInfo {
  id: string;
  source_language: string;
  target_language: string;
  status: string;
  service_id: string | null;
  // PostgREST embeds the FK target as an object (service_id -> id, a
  // to-one relationship), not an array — see migration 0295 for why an
  // anon /display visitor is now allowed to read this at all.
  translation_services: { name: string } | null;
}

/** translation-listener-token's 200 response. */
interface ListenerToken {
  url: string;
  token: string;
  roomName: string;
  trackName: string;
  targetLanguage: string;
}

type AudioStatus = 'idle' | 'connecting' | 'waiting-for-bot' | 'live' | 'error';

const AUDIO_ERROR_COPY: Record<string, string> = {
  not_found: 'This session is no longer available.',
  not_ready: "The translation hasn't started yet — try again in a moment.",
  ended: 'This session has ended.',
  at_capacity: "This session's listener limit is full right now — try again shortly.",
};

interface LogLine {
  id: string;
  source_text: string;
  translated_text: string;
  created_at: string;
}

type ConnStatus = 'connecting' | 'live' | 'reconnecting' | 'ended';
type FontSize = 'small' | 'large' | 'full';

const FONT_SIZE_CLASS: Record<FontSize, string> = {
  small: 'text-lg sm:text-xl',
  large: 'text-2xl sm:text-3xl',
  full: 'text-4xl sm:text-6xl',
};
const FONT_SIZE_CYCLE: FontSize[] = ['small', 'large', 'full'];

/**
 * /display/:sessionId — public, unauthenticated. Anyone with the link (or
 * who scans the QR) lands here; no ReKindle account needed.
 *
 * Phase 2 (see docs/rlt-build-checklist.md § 2.7–2.8): language label, text
 * feed, PIN gate (Phase 1), plus font-size presets, bilingual toggle,
 * presenter mode, and — per the later "WebRTC-only /display" plan — a
 * direct LiveKit connection for audio instead of an HLS pull: this page
 * mints a subscribe-only listener token (translation-listener-token Edge
 * Function), joins the session's room with autoSubscribe:false, and
 * explicitly subscribes only to the bot's "rlt-translated-{lang}" track —
 * sub-second delivery, no storage hop, and no risk of also hearing the
 * room's raw original-language mic track.
 *
 * Private-session note: after a correct PIN, this page retries the direct
 * row fetch — for a PUBLIC session that always works, but for a genuinely
 * PRIVATE one it will keep failing today, because RLS (migration 0273)
 * blocks anon reads of private sessions outright and verify_display_pin()
 * doesn't yet mint anything that changes that. Flagged in the migration's
 * header comment; shows up below as the "PIN correct, but..." screen
 * rather than a silent stall.
 */
export const TranslationDisplayPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [pinRequired, setPinRequired] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinChecking, setPinChecking] = useState(false);
  const [privateNotReady, setPrivateNotReady] = useState(false);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [connStatus, setConnStatus] = useState<ConnStatus>('connecting');
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Display preferences — local to this visitor's browser only, no account
  // to save them to.
  const [fontSize, setFontSize] = useState<FontSize>('large');
  const [bilingual, setBilingual] = useState(false);
  const [presenterMode, setPresenterMode] = useState(false);
  // Joining LiveKit needs an explicit tap — browsers block unmuted
  // autoplay, and the build plan calls for a "Listen" gesture anyway
  // (§2.8). listening = the visitor tapped; audioStatus tracks what
  // actually happened since (WebRTC-only /display plan).
  const [listening, setListening] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('idle');
  const [audioError, setAudioError] = useState<string | null>(null);
  // Real bug found live (2026-08-18): setting `autoplay` on a detached Audio()
  // element and never actually calling .play() ourselves is NOT reliable —
  // by the time the bot's track subscribes, several awaits (token fetch, room
  // connect, waiting for TrackPublished) separate this from the "Listen" tap
  // that granted the browser's user-gesture window, so autoplay silently
  // fails: captions kept updating (that path never touched audio) while
  // nothing played, with no error surfaced anywhere. Same class of bug
  // HlsPlayer.tsx already hardened against — same fix here.
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const fetchSession = async (): Promise<SessionInfo | null> => {
    const { data } = await supabase
      .from('translation_sessions')
      .select('id, source_language, target_language, status, service_id, translation_services(name)')
      .eq('id', sessionId)
      .maybeSingle();
    if (!data) return null;
    // The untyped generic SupabaseClient here infers every embedded
    // to-one relation as an array (no generated Database types for this
    // table), but PostgREST actually returns a single object at runtime
    // for a many-to-one FK like service_id -> translation_services.id —
    // normalize defensively rather than fighting the inferred type.
    const raw = data as unknown as Omit<SessionInfo, 'translation_services'> & {
      translation_services: { name: string } | { name: string }[] | null;
    };
    const svc = Array.isArray(raw.translation_services) ? (raw.translation_services[0] ?? null) : raw.translation_services;
    return { ...raw, translation_services: svc };
  };

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      setLoading(true);
      const row = await fetchSession();
      if (row) {
        setSession(row);
        setPinRequired(false);
      } else {
        // RLS returned nothing — either the session doesn't exist, or it's
        // private and no PIN has been proven yet. We deliberately can't
        // tell those apart (not leaking which private session IDs are
        // real), so both show the same PIN screen.
        setPinRequired(true);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (!session || !sessionId) return;

    let cancelled = false;
    const loadLines = async () => {
      const { data } = await supabase
        .from('translation_logs')
        .select('id, source_text, translated_text, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(3);
      if (!cancelled && data) setLines([...data].reverse() as LogLine[]);
    };
    loadLines();

    const channel = supabase
      .channel(`translation-display-${sessionId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'translation_logs', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as LogLine;
          setLines(prev => [...prev, row].slice(-3));
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'translation_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          // Realtime's payload.new is the flat table row — no
          // translation_services join like the initial fetchSession() had,
          // so merge onto what's already loaded rather than clobbering it.
          const row = payload.new as Omit<SessionInfo, 'translation_services'>;
          setSession(prev => ({ ...row, translation_services: prev?.translation_services ?? null }));
          if (row.status === 'ended') setConnStatus('ended');
        })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnStatus(prev => (prev === 'ended' ? prev : 'live'));
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnStatus('reconnecting');
      });
    channelRef.current = channel;

    // Realtime is the primary path; poll as a quiet fallback so the feed
    // still moves if the socket drops without firing CHANNEL_ERROR cleanly.
    const poll = setInterval(loadLines, 6000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [session, sessionId]);

  // WebRTC-only audio (see docs/rlt-build-checklist.md's "WebRTC-only
  // /display" plan): join the LiveKit room directly as a subscribe-only
  // listener and play the bot's "rlt-translated-{lang}" track — no HLS/
  // Egress hop. Runs once the visitor taps "Listen" (listening=true);
  // tears itself down on unmount or once the session ends.
  useEffect(() => {
    if (!listening || !sessionId) return;

    let cancelled = false;
    const teardown = () => {
      audioElRef.current?.pause();
      if (audioElRef.current) audioElRef.current.srcObject = null;
      audioElRef.current = null;
      roomRef.current?.disconnect().catch(() => {});
      roomRef.current = null;
    };

    (async () => {
      setAudioStatus('connecting');
      setAudioError(null);
      setNeedsUnlock(false);

      const { data, error } = await supabase.functions.invoke('translation-listener-token', {
        body: { sessionId },
      });
      if (cancelled) return;
      if (error || !data?.token) {
        setAudioError((data as { error?: string })?.error ?? 'connection_failed');
        setAudioStatus('error');
        return;
      }
      const { url, token, trackName } = data as ListenerToken;

      const room = new Room({ adaptiveStream: true });
      roomRef.current = room;

      // Play whichever RemoteTrack turns out to be the bot's translated
      // track, however it arrives (already published, or published after
      // we joined) — both paths funnel through here.
      const playTrack = (track: RemoteTrack) => {
        if (cancelled) return;
        const el = new Audio();
        el.autoplay = true;
        el.srcObject = new MediaStream([track.mediaStreamTrack]);
        audioElRef.current = el;
        setAudioStatus('live');
        // Explicit play() + catch, not just the `autoplay` attribute — see
        // the needsUnlock state's doc comment above for why the attribute
        // alone isn't trustworthy here.
        el.play().then(() => setNeedsUnlock(false)).catch(() => setNeedsUnlock(true));
      };

      const isBotTranslatedTrack = (pub: RemoteTrackPublication, participant: RemoteParticipant) =>
        participant.identity.startsWith('rlt-bot-') && pub.trackName === trackName;

      room.on(RoomEvent.TrackPublished, (pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (isBotTranslatedTrack(pub, participant)) pub.setSubscribed(true);
      });
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (isBotTranslatedTrack(pub, participant)) playTrack(track);
      });
      room.on(RoomEvent.Disconnected, () => {
        if (cancelled) return;
        // Unexpected drop (not our own teardown, which sets `cancelled`
        // first) — reset all the way back to idle so the "Listen" button
        // reappears and a re-tap actually re-triggers this effect (it only
        // fires on a false→true transition of `listening`).
        setAudioStatus('idle');
        setListening(false);
      });

      try {
        // autoSubscribe:false — deliberate. A translation session's room can
        // also carry the original speaker's raw mic track; auto-subscribing
        // to everything would hand a /display listener audio no one meant
        // for them. Only the matching bot track (isBotTranslatedTrack above)
        // is ever explicitly subscribed.
        await room.connect(url, token, { autoSubscribe: false });
        if (cancelled) return;

        let found = false;
        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((pub) => {
            if (isBotTranslatedTrack(pub as RemoteTrackPublication, participant)) {
              found = true;
              (pub as RemoteTrackPublication).setSubscribed(true);
            }
          });
        });
        if (!found) setAudioStatus('waiting-for-bot');
      } catch (err) {
        if (!cancelled) {
          console.error('[TranslationDisplayPage] LiveKit connect failed:', err);
          setAudioError('connection_failed');
          setAudioStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [listening, sessionId]);

  // Session ended while listening — drop the LiveKit connection instead of
  // leaving a dead room joined in the background.
  useEffect(() => {
    if (session?.status === 'ended' && roomRef.current) {
      setListening(false);
      setAudioStatus('idle');
    }
  }, [session?.status]);

  const submitPin = async () => {
    if (!sessionId || !pin.trim()) return;
    setPinChecking(true);
    setPinError(null);
    try {
      const { data: ok, error } = await supabase.rpc('verify_display_pin', { p_session_id: sessionId, p_pin: pin.trim() });
      if (error) throw error;
      if (!ok) {
        setPinError('Incorrect PIN');
        return;
      }
      const row = await fetchSession();
      if (row) {
        setSession(row);
        setPinRequired(false);
      } else {
        setPrivateNotReady(true);
      }
    } catch (err: any) {
      setPinError(err.message || 'Something went wrong');
    } finally {
      setPinChecking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      </div>
    );
  }

  // Explicit bg/text on both Cards below, not Card's own bg-background
  // default — same theme-mismatch class as the landing page's language
  // buttons (see TranslationDisplayLanding.tsx): Card's light-theme
  // background rendered as a bright box against this page's dark
  // bg-slate-950, inconsistent even where text stayed technically legible.
  if (privateNotReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <Card className="max-w-sm w-full bg-white/5 border-white/10">
          <CardContent className="py-8 text-center space-y-2">
            <Lock className="h-8 w-8 mx-auto text-amber-500" />
            <p className="text-sm font-medium text-white">PIN correct</p>
            <p className="text-sm text-white/50">
              Live viewing for private sessions isn't available yet — check back once this ministry's translation
              feature finishes rolling out.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pinRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <Card className="max-w-sm w-full bg-white/5 border-white/10">
          <CardContent className="py-8 space-y-4">
            <div className="text-center space-y-1">
              <Lock className="h-8 w-8 mx-auto text-indigo-500" />
              <p className="text-sm font-medium text-white">This translation session is private</p>
              <p className="text-xs text-white/50">Enter the PIN your ministry shared with you.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="display-pin" className="text-white/70">PIN</Label>
              <Input
                id="display-pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={e => setPin(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitPin(); }}
                autoFocus
                className="bg-white/5 border-white/20 text-white"
              />
              {pinError && <p className="text-xs text-red-500">{pinError}</p>}
            </div>
            <Button className="w-full" onClick={submitPin} disabled={pinChecking || !pin.trim()}>
              {pinChecking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              View Translation
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Ended sessions hide immediately (explicit product decision) — a link
  // that's over stops looking like a live page at all rather than sitting
  // around in the "This session has ended" chrome indefinitely.
  if (session && session.status === 'ended') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <Card className="max-w-sm w-full bg-white/5 border-white/10">
          <CardContent className="py-8 text-center space-y-2">
            <Radio className="h-8 w-8 mx-auto text-white/30" />
            <p className="text-sm font-medium text-white">This link is no longer available</p>
            <p className="text-sm text-white/50">
              This translation session has ended. Ask your ministry for a new link if there's another one starting.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusDot = connStatus === 'live' ? 'bg-emerald-500' : connStatus === 'ended' ? 'bg-slate-500' : 'bg-amber-500';
  const visibleLines = presenterMode ? lines.slice(-1) : lines;
  const iconBtn = 'flex h-8 w-8 items-center justify-center rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors';

  return (
    // FIXED height, not min-h's minimum — so flexbox actually reserves the
    // footer's space and it's always on-screen without scrolling. Real bug
    // found live (round 2): min-h-[100dvh] alone fixed the *calculation*
    // (mobile browsers' collapsing address-bar chrome otherwise makes 100vh
    // taller than the true visible area) but a MINIMUM height still lets
    // the div grow past one screen and push the footer below the fold —
    // user still had to scroll to find "Listen". Fixed height +
    // overflow-y-auto on <main> below means any content that doesn't fit
    // scrolls internally instead, and the footer stays pinned.
    //
    // Round 3 (real bug found live again): the round-2 fix used BOTH
    // `h-screen` (100vh) and `h-[100dvh]` as Tailwind classes and relied on
    // dvh "winning" by cascade order — but Tailwind's compiled stylesheet
    // doesn't order utilities by where they appear in className, and in the
    // actual production build `.h-screen{height:100vh}` landed AFTER
    // `.h-[100dvh]{...}` in the CSS file, so the 100vh rule silently won on
    // every real mobile browser and this "fix" never once took effect.
    // Inline style always outranks any class regardless of stylesheet
    // order, so it's used here instead — dvh-supporting browsers get the
    // correct height; a browser too old to parse the `dvh` unit just
    // ignores that one invalid declaration and falls back to the
    // `h-screen` class's 100vh, same graceful-degradation shape as before.
    <div className="h-screen bg-slate-950 text-white flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      {!presenterMode && (
        <header className="flex items-center gap-1 px-4 py-2.5 border-b border-white/10">
          <Radio className="h-4 w-4 text-indigo-400 shrink-0" />
          {/* Service name (migration 0295) takes the top billing when the
              session came from a named service — falls back to the old
              "{lang} Translation" title for sessions with none. */}
          <div className="mr-auto min-w-0 leading-tight">
            <p className="text-sm font-medium truncate">
              {session?.translation_services?.name || (session ? `${session.target_language.toUpperCase()} Translation` : 'Translation')}
            </p>
            {session?.translation_services?.name && (
              <p className="text-[11px] text-white/40 truncate">{session.target_language.toUpperCase()} Translation</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFontSize(prev => FONT_SIZE_CYCLE[(FONT_SIZE_CYCLE.indexOf(prev) + 1) % FONT_SIZE_CYCLE.length])}
            className={iconBtn}
            title={`Text size: ${fontSize} (tap to change)`}
          >
            <Type className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setBilingual(v => !v)}
            className={`${iconBtn} ${bilingual ? 'text-indigo-400' : ''}`}
            title="Show original language too"
          >
            <Languages className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPresenterMode(true)}
            className={iconBtn}
            title="Presenter mode (one line, full screen)"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <span className={`ml-1 h-2.5 w-2.5 rounded-full shrink-0 ${statusDot}`} title={connStatus} />
        </header>
      )}

      {presenterMode && (
        <button
          type="button"
          onClick={() => setPresenterMode(false)}
          className={`${iconBtn} absolute top-3 right-3 z-10 bg-black/30`}
          title="Exit presenter mode"
        >
          <Minimize2 className="h-4 w-4" />
        </button>
      )}

      <main className={`flex-1 min-h-0 overflow-y-auto flex flex-col justify-center items-center p-6 gap-3 max-w-3xl mx-auto w-full ${presenterMode ? 'text-center' : 'justify-end'}`}>
        {visibleLines.length === 0 ? (
          // session.status === 'ended' never reaches here — the early
          // return above swaps to the "no longer available" page first.
          <p className="text-center text-white/50 text-lg">Translation starting…</p>
        ) : (
          visibleLines.map(line => (
            <div key={line.id} className={presenterMode ? '' : 'w-full'}>
              {bilingual && (
                <p className="text-sm sm:text-base text-white/50 mb-1">{line.source_text}</p>
              )}
              <p className={`${FONT_SIZE_CLASS[fontSize]} leading-snug font-medium`}>
                {line.translated_text}
              </p>
            </div>
          ))
        )}
      </main>

      {/* session.status === 'ended' never reaches here, same as above. */}
      {!presenterMode && session && session.status !== 'error' && (
        <footer className="border-t border-white/10 px-4 py-3">
          {audioStatus === 'live' && needsUnlock && (
            <Button
              variant="outline"
              className="w-full text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white"
              // A direct click IS a trusted user gesture, so play() succeeds
              // here even though the earlier automatic attempt was blocked.
              onClick={() => audioElRef.current?.play().then(() => setNeedsUnlock(false)).catch(() => {})}
            >
              <Volume2 className="h-4 w-4 mr-2" />
              Tap to enable sound
            </Button>
          )}
          {audioStatus === 'live' && !needsUnlock && (
            <div className="flex items-center gap-3">
              <Volume2 className="h-5 w-5 shrink-0 text-emerald-400" />
              {/* WebRTC direct — same room the bot publishes into, not a
                  segmented HLS pull, so this is real-time (sub-second),
                  not the "2–8s behind" caption the old HLS player carried. */}
              <span className="text-xs text-white/50">Listening — live audio, real time.</span>
            </div>
          )}
          {(audioStatus === 'connecting' || audioStatus === 'waiting-for-bot') && (
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-white/60" />
              <span className="text-xs text-white/50">
                {audioStatus === 'connecting' ? 'Connecting…' : 'Translation starting — audio will begin automatically…'}
              </span>
            </div>
          )}
          {audioStatus === 'error' && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-red-400 flex-1">
                {AUDIO_ERROR_COPY[audioError ?? ''] ?? 'Could not connect — please try again.'}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white shrink-0"
                onClick={() => { setListening(false); setTimeout(() => setListening(true), 0); }}
              >
                Try again
              </Button>
            </div>
          )}
          {audioStatus === 'idle' && (
            // Explicit text/border/hover colors — outline variant's default
            // ("border border-input bg-background", no text color of its own)
            // inherited this page's text-white onto bg-background's light
            // theme, same near-invisible white-on-white bug as the landing
            // page's language buttons and the PIN-screen Cards above.
            <Button
              variant="outline"
              className="w-full text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white"
              onClick={() => setListening(true)}
            >
              <Volume2 className="h-4 w-4 mr-2" />
              Listen
            </Button>
          )}
        </footer>
      )}
    </div>
  );
};

export default TranslationDisplayPage;
