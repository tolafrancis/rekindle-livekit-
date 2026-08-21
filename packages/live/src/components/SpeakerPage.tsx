import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Room, RoomEvent, createAudioAnalyser } from 'livekit-client';
import type { LocalAudioTrack } from 'livekit-client';
import { supabase } from '@rekindle/supabase';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Loader2, Mic, MicOff, Radio, Copy, Square, AlertCircle, CheckCircle2 } from 'lucide-react';

type Phase = 'idle' | 'requesting-mic' | 'connecting' | 'live' | 'ended' | 'error';

/** translation-speaker-token's 200 response. */
interface SpeakerToken {
  url: string;
  token: string;
  roomName: string;
  identity: string;
  sourceLanguage: string;
  targetLanguage: string;
}

const ERROR_COPY: Record<string, string> = {
  missing_link: 'This link is incomplete — ask whoever shared it for the full URL.',
  invalid_speaker_token: "This speaker link isn't valid — it may have been replaced by a newer one.",
  session_not_found: 'This speaker session no longer exists.',
  session_ended: 'This speaker session has already ended.',
  mic_denied: 'Microphone access was denied — check your browser/site permissions and reload.',
  connection_failed: 'Could not connect. Check your internet connection and try again.',
};

/**
 * /speak/:sessionId?t=<speaker token> — "Speaker Link" (migration 0288),
 * the third way to start a translation session alongside Meetings and the
 * PA edge agent. Public, unauthenticated — the token in the URL IS the
 * credential (see that migration's header comment for the threat model).
 * No video call: this page's only job is turning the visitor's microphone
 * into a published LiveKit track the cloud bot subscribes to and
 * translates, same pipeline every other source already uses. Listeners
 * still use the ordinary /display/:sessionId link — this page shows it
 * for convenience but doesn't render it itself.
 */
export const SpeakerPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const speakerToken = searchParams.get('t');

  const [phase, setPhase] = useState<Phase>('idle');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [languages, setLanguages] = useState<{ source: string; target: string } | null>(null);
  const [muted, setMuted] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy listener link');
  const [level, setLevel] = useState(0); // 0–1, simple mic-activity meter

  const roomRef = useRef<Room | null>(null);
  const analyserCleanupRef = useRef<(() => Promise<void>) | null>(null);
  const levelRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionId || !speakerToken) {
      setErrorCode('missing_link');
      setPhase('error');
    }
  }, [sessionId, speakerToken]);

  const teardownLevelMeter = () => {
    if (levelRafRef.current !== null) cancelAnimationFrame(levelRafRef.current);
    levelRafRef.current = null;
    analyserCleanupRef.current?.().catch(() => {});
    analyserCleanupRef.current = null;
  };

  // livekit-client's own analyser helper — reassurance that audio is
  // actually reaching the room, not a from-scratch AudioContext setup.
  const startLevelMeter = (track: LocalAudioTrack) => {
    try {
      const { calculateVolume, cleanup } = createAudioAnalyser(track);
      analyserCleanupRef.current = cleanup;
      const tick = () => {
        setLevel(Math.min(1, calculateVolume() * 4)); // scaled up — normal speech volume reads low otherwise
        levelRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      console.error('[SpeakerPage] level meter setup failed (non-fatal):', err);
    }
  };

  const startSpeaking = async () => {
    if (!sessionId || !speakerToken) return;
    setErrorCode(null);
    setPhase('requesting-mic');

    const { data, error } = await supabase.functions.invoke('translation-speaker-token', {
      body: { sessionId, speakerToken },
    });
    if (error || !data?.token) {
      setErrorCode((data as { error?: string })?.error ?? 'connection_failed');
      setPhase('error');
      return;
    }
    const { url, token, identity, sourceLanguage, targetLanguage } = data as SpeakerToken;
    setLanguages({ source: sourceLanguage, target: targetLanguage });

    setPhase('connecting');
    const room = new Room();
    roomRef.current = room;
    room.on(RoomEvent.Disconnected, () => {
      teardownLevelMeter();
      setPhase((prev) => (prev === 'ended' ? prev : 'ended'));
    });

    try {
      await room.connect(url, token);
      // setMicrophoneEnabled handles getUserMedia + publish in one call —
      // if the visitor denies the permission prompt, it rejects here. Its
      // own return value is the fresh publication, no separate lookup needed.
      const micPub = await room.localParticipant.setMicrophoneEnabled(true);
      if (micPub?.track) startLevelMeter(micPub.track as LocalAudioTrack);
      setPhase('live');
      console.log('[SpeakerPage] publishing as', identity);
    } catch (err) {
      console.error('[SpeakerPage] connect/publish failed:', err);
      await room.disconnect().catch(() => {});
      roomRef.current = null;
      setErrorCode(
        err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
          ? 'mic_denied'
          : 'connection_failed',
      );
      setPhase('error');
    }
  };

  const toggleMute = async () => {
    if (!roomRef.current) return;
    const next = !muted;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  };

  const stopSpeaking = async () => {
    if (!sessionId || !speakerToken) return;
    teardownLevelMeter();
    try {
      await roomRef.current?.disconnect();
    } catch { /* already gone */ }
    roomRef.current = null;
    try {
      await supabase.rpc('speaker_stop_session', { p_session_id: sessionId, p_speaker_token: speakerToken });
    } catch (err) {
      console.error('[SpeakerPage] speaker_stop_session failed (session may still show active):', err);
    }
    setPhase('ended');
  };

  // Leaving the tab/closing the browser mid-session — best-effort stop so
  // the session doesn't sit "live" forever with nobody actually speaking.
  // Not guaranteed to complete (unload is not awaitable), but the bot's own
  // ParticipantDisconnected handling is the real backstop either way.
  useEffect(() => {
    const onUnload = () => {
      if (roomRef.current) roomRef.current.disconnect();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      teardownLevelMeter();
      roomRef.current?.disconnect().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listenerLink = sessionId ? `${window.location.origin}/display/${sessionId}` : '';
  const copyListenerLink = () => {
    navigator.clipboard.writeText(listenerLink).then(() => {
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy listener link'), 1500);
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4 py-10">
      <Card className="max-w-sm w-full bg-white/5 border-white/10">
        <CardContent className="py-8 space-y-5">
          <div className="text-center space-y-1">
            <Radio className="h-7 w-7 mx-auto text-indigo-400" />
            <p className="text-sm font-medium text-white">Speaker Link</p>
            {languages && (
              <p className="text-xs text-white/50">
                {languages.source.toUpperCase()} → {languages.target.toUpperCase()}
              </p>
            )}
          </div>

          {phase === 'idle' && (
            <>
              <p className="text-sm text-white/70 text-center leading-relaxed">
                Tap Start when you're ready to speak. Your microphone will be translated live for anyone using the
                listener link — keep this tab open while you talk.
              </p>
              <Button className="w-full" onClick={startSpeaking}>
                <Mic className="h-4 w-4 mr-2" /> Start Speaking
              </Button>
            </>
          )}

          {(phase === 'requesting-mic' || phase === 'connecting') && (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="h-6 w-6 animate-spin text-white/60" />
              <p className="text-xs text-white/50">
                {phase === 'requesting-mic' ? 'Requesting microphone access…' : 'Connecting…'}
              </p>
            </div>
          )}

          {phase === 'live' && (
            <>
              <div className="flex items-center justify-center gap-3">
                <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-medium text-emerald-400">Live — you're being translated</span>
              </div>

              {/* Simple mic-activity meter — reassurance that audio is actually
                  reaching the room, not just that the button says "Live". */}
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-[width] duration-75"
                  style={{ width: `${Math.round(level * 100)}%` }}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white" onClick={toggleMute}>
                  {muted ? <Mic className="h-4 w-4 mr-2" /> : <MicOff className="h-4 w-4 mr-2" />}
                  {muted ? 'Unmute' : 'Mute'}
                </Button>
                <Button variant="destructive" className="flex-1" onClick={stopSpeaking}>
                  <Square className="h-4 w-4 mr-2" /> Stop
                </Button>
              </div>

              <div className="border-t border-white/10 pt-4 space-y-2">
                <p className="text-xs text-white/50 text-center">Share this with anyone following along:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-black/30 px-2 py-1.5 text-[11px] text-white/70 truncate">{listenerLink}</code>
                  <Button variant="outline" size="sm" className="text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white shrink-0" onClick={copyListenerLink}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {copyLabel === 'Copied!' && <p className="text-[11px] text-emerald-400 text-center">{copyLabel}</p>}
              </div>
            </>
          )}

          {phase === 'ended' && (
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <CheckCircle2 className="h-7 w-7 text-white/40" />
              <p className="text-sm font-medium text-white">Session ended</p>
              <p className="text-xs text-white/50">You can close this tab now.</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <AlertCircle className="h-7 w-7 text-red-400" />
              <p className="text-sm text-red-400">{ERROR_COPY[errorCode ?? ''] ?? 'Something went wrong.'}</p>
              {errorCode !== 'missing_link' && errorCode !== 'session_ended' && errorCode !== 'invalid_speaker_token' && (
                <Button variant="outline" className="text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white" onClick={startSpeaking}>
                  Try again
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SpeakerPage;
