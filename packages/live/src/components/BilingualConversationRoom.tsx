import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Switch } from '@rekindle/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { toast } from '@rekindle/ui/use-toast';
import {
  AlertCircle, Check, Copy, Languages, Link2, Loader2, LogOut, Mic, MicOff, RefreshCw, Send, Share2, Volume2, Wifi, WifiOff,
} from 'lucide-react';
import {
  buildInviteLink,
  conversationErrorMessage,
  CONVERSATION_LANGUAGES,
  languageLabel,
  speechTag,
  type ConversationEntry,
  type ConversationRole,
} from '../conversation/conversationApi';
import { useBilingualConversation, type ConnectionStatus, type PendingTurn } from '../conversation/useBilingualConversation';
import { ensureMicrophonePermission, useSpeechCapture, type SpeechCaptureError } from '../conversation/useSpeechCapture';

/**
 * Live → Conversation: the two-person bilingual room, shared by the host
 * (inside the ministry's Live tab, or /conversation/:id while signed in)
 * and the invited guest (/conversation/:id from the invite link).
 *
 * Each side transcribes its own microphone in its own language; the
 * server translates every finished phrase into the other side's language.
 * Both sides render the same transcript: original text first, translation
 * underneath, visually distinct, each turn labelled with who said it.
 */

interface Props {
  conversationId: string;
  /** Guest seat token; omit for the signed-in host. */
  seatToken?: string | null;
  /** Freshly created invite, so the host sees the link without a round trip. */
  initialInviteToken?: string | null;
  onLeave: () => void;
  /** Called when this device lost its seat (e.g. the host made a new invite). */
  onSeatLost?: (message: string) => void;
}

const SPEECH_ERROR_COPY: Record<Exclude<SpeechCaptureError, null>, string> = {
  mic_denied: 'Microphone access is blocked. Allow it in your browser\'s site settings, then tap the mic again.',
  no_mic: 'No microphone was found on this device.',
  speech_network: 'Speech recognition lost its connection. It will keep retrying — you can also type below.',
  speech_failed: 'Speech recognition stopped working on this browser. Tap the mic to try again, or type below.',
};

const CONNECTION_COPY: Record<ConnectionStatus, { label: string; className: string }> = {
  connecting: { label: 'Connecting…', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  connected: { label: 'Connected', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  reconnecting: { label: 'Reconnecting…', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  offline: { label: 'Offline', className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
};

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const BilingualConversationRoom: React.FC<Props> = ({ conversationId, seatToken, initialInviteToken, onLeave, onSeatLost }) => {
  const convo = useBilingualConversation({ conversationId, seatToken });
  const { role, conversation, entries, pending, loadError, connection, peers, peerInterim } = convo;

  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState<SpeechCaptureError>(null);
  const [myInterim, setMyInterim] = useState('');
  const [typed, setTyped] = useState('');
  const [inviteToken, setInviteToken] = useState<string | null>(initialInviteToken || null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'invite' | 'language' | 'leave' | null>(null);
  const [readAloud, setReadAloud] = useState(false);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);

  const otherRole: ConversationRole = role === 'host' ? 'guest' : 'host';
  const myLanguage = conversation ? (role === 'host' ? conversation.hostLanguage : conversation.guestLanguage) || 'en' : 'en';
  const myName = conversation ? (role === 'host' ? conversation.hostName : conversation.guestName) || '' : '';
  const otherName = conversation ? (otherRole === 'host' ? conversation.hostName : conversation.guestName) : null;
  const otherLanguage = conversation ? (otherRole === 'host' ? conversation.hostLanguage : conversation.guestLanguage) : null;
  const ended = conversation?.status === 'ended';
  const guestJoined = !!conversation?.guestName;
  const otherOnline = !!peers[otherRole];

  // Seat lost (new invite issued, conversation deleted) — hand back to the page.
  useEffect(() => {
    if (loadError) onSeatLost?.(conversationErrorMessage(loadError));
  }, [loadError, onSeatLost]);

  // Speech → transcript. Paused while reading a translation aloud so the
  // device doesn't transcribe its own speaker output.
  const speech = useSpeechCapture({
    lang: speechTag(myLanguage),
    enabled: micOn && !ended && !ttsSpeaking && !!role,
    onFinal: (text) => { convo.sendTurn(text); convo.sendInterim(''); },
    onInterim: (text) => { setMyInterim(text); convo.sendInterim(text); },
  });
  useEffect(() => {
    if (speech.error === 'mic_denied' || speech.error === 'no_mic') { setMicOn(false); setMicError(speech.error); }
    else setMicError(speech.error);
  }, [speech.error]);

  // Tell the other side our mic + language.
  useEffect(() => {
    if (!role || !conversation) return;
    convo.setMyPresence({ role, name: myName, language: myLanguage, micOn: micOn && !ended });
  }, [role, conversation, myName, myLanguage, micOn, ended, convo.setMyPresence]);

  // Ending a conversation turns the mic off on both sides.
  useEffect(() => { if (ended) setMicOn(false); }, [ended]);

  const toggleMic = async () => {
    if (micOn) { setMicOn(false); return; }
    setMicError(null);
    const permission = await ensureMicrophonePermission();
    if (permission) { setMicError(permission); return; }
    setMicOn(true);
  };

  // Read the other person's translated turns aloud (optional).
  const spokenIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!spokenIdsRef.current) {
      // Never read out history that was already there when we arrived.
      if (entries.length > 0 || conversation) spokenIdsRef.current = new Set(entries.map((e) => e.id));
      return;
    }
    const fresh = entries.filter((e) => !spokenIdsRef.current!.has(e.id));
    fresh.forEach((e) => spokenIdsRef.current!.add(e.id));
    if (!readAloud || typeof window === 'undefined' || !window.speechSynthesis) return;
    fresh
      .filter((e) => e.speaker_role === otherRole && e.translated_text)
      .forEach((e) => {
        const utterance = new SpeechSynthesisUtterance(e.translated_text!);
        utterance.lang = speechTag(e.translated_language || myLanguage);
        utterance.onstart = () => setTtsSpeaking(true);
        utterance.onend = () => setTtsSpeaking(window.speechSynthesis.speaking);
        utterance.onerror = () => setTtsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      });
  }, [entries, conversation, readAloud, otherRole, myLanguage]);
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* non-fatal */ } }, []);

  const sendTyped = () => {
    if (!typed.trim() || ended) return;
    convo.sendTurn(typed);
    setTyped('');
  };

  const inviteLink = inviteToken ? buildInviteLink(conversationId, inviteToken) : null;
  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Couldn't copy", description: 'Select the link and copy it manually.', variant: 'destructive' });
    }
  };
  const shareLink = async () => {
    if (!inviteLink) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my conversation', text: `${myName || 'I'} invited you to a translated conversation.`, url: inviteLink });
        return;
      } catch { /* cancelled — fall through to copy */ }
    }
    copyLink();
  };
  const makeNewInvite = async () => {
    if (guestJoined && !window.confirm(`Create a new invite link? ${otherName || 'The current guest'} will be removed from this conversation.`)) return;
    setBusy('invite');
    try {
      setInviteToken(await convo.createInvite());
    } catch (err) {
      toast({ title: "Couldn't create a link", description: conversationErrorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const changeLanguage = async (language: string) => {
    setBusy('language');
    try {
      await convo.setLanguage(language);
    } catch (err) {
      toast({ title: "Couldn't change language", description: conversationErrorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const leave = async () => {
    if (role === 'host' && !ended && !window.confirm('Leave and end this conversation for both of you? The transcript stays available.')) return;
    setBusy('leave');
    setMicOn(false);
    await convo.leave();
    setBusy(null);
    onLeave();
  };

  // Keep the newest turn in view, unless the reader scrolled up.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [entries.length, pending.length, myInterim, peerInterim]);

  const pendingVisible = pending;

  if (!conversation || !role) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        {loadError ? (
          <p className="max-w-sm text-center text-sm text-muted-foreground">{conversationErrorMessage(loadError)}</p>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading conversation" />
        )}
      </div>
    );
  }

  const connectionChip = CONNECTION_COPY[connection];

  return (
    <div className="flex h-full min-h-[70vh] flex-col overflow-hidden rounded-xl border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2.5 sm:px-4">
        <Languages className="h-5 w-5 text-indigo-500" />
        <div className="mr-auto min-w-0">
          <p className="truncate text-sm font-semibold">Conversation</p>
          <p className="truncate text-xs text-muted-foreground">
            {languageLabel(conversation.hostLanguage)} ⇄ {conversation.guestLanguage ? languageLabel(conversation.guestLanguage) : '…'}
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${connectionChip.className}`} role="status" title={connectionChip.label}>
          {connection === 'connected' ? <Wifi className="h-3 w-3" /> : connection === 'offline' ? <WifiOff className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
          <span className={connection === 'connected' ? 'hidden sm:inline' : ''}>{connectionChip.label}</span>
        </span>
        <Button variant="outline" size="sm" onClick={leave} disabled={busy === 'leave'} className="shrink-0 gap-1.5">
          {busy === 'leave' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
          {ended ? 'Close' : 'Leave'}
        </Button>
      </div>

      {/* Participants */}
      <div className="grid grid-cols-1 gap-2 border-b p-3 sm:grid-cols-2 sm:px-4">
        <ParticipantCard
          label="You"
          name={myName}
          language={myLanguage}
          online={connection === 'connected'}
          micOn={micOn}
          editable={!ended}
          changing={busy === 'language'}
          onLanguageChange={changeLanguage}
        />
        <ParticipantCard
          label={role === 'host' ? 'Guest' : 'Host'}
          name={otherName}
          language={otherLanguage}
          online={otherOnline}
          micOn={!!peers[otherRole]?.micOn}
          waiting={role === 'host' && !guestJoined}
        />
      </div>

      {/* Invite (host) */}
      {role === 'host' && !ended && !guestJoined && (
        <div className="space-y-2 border-b bg-muted/40 p-3 sm:px-4">
          {inviteLink ? (
            <>
              <p className="text-xs text-muted-foreground">
                Send this link to the person you want to talk with. It works once — after they join, nobody else can use it.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} className="h-9 flex-1 font-mono text-xs" aria-label="Invite link" />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={copyLink} className="flex-1 gap-1.5 sm:flex-none">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy link'}
                  </Button>
                  <Button size="sm" onClick={shareLink} className="flex-1 gap-1.5 sm:flex-none">
                    <Share2 className="h-3.5 w-3.5" /> Share invitation
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-auto text-xs text-muted-foreground">Invite links are shown once. Create a new one to invite someone.</p>
              <Button size="sm" onClick={makeNewInvite} disabled={busy === 'invite'} className="gap-1.5">
                {busy === 'invite' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                Create invite link
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Transcript */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 space-y-3 overflow-y-auto p-3 sm:px-4"
        aria-live="polite"
        aria-label="Conversation transcript"
      >
        {entries.length === 0 && pendingVisible.length === 0 && !myInterim && !peerInterim && (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-center">
            <Languages className="h-8 w-8 text-muted-foreground/40" />
            {role === 'host' && !guestJoined ? (
              <p className="max-w-xs text-sm text-muted-foreground">
                Waiting for your guest to join. You can start talking now. They'll see everything you said in their language when they arrive.
              </p>
            ) : (
              <p className="max-w-xs text-sm text-muted-foreground">
                Tap the microphone and speak in {languageLabel(myLanguage)}. Each of you sees what was said and its translation here.
              </p>
            )}
          </div>
        )}
        {entries.map((e) => (
          <TranscriptTurn key={e.id} entry={e} mine={e.speaker_role === role} waitingForGuest={!guestJoined} />
        ))}
        {pendingVisible.map((p) => (
          <PendingTurnRow key={p.clientUtteranceId} turn={p} onRetry={() => convo.retryTurn(p)} />
        ))}
        {peerInterim && (
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-dashed px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{otherName || 'Them'} · speaking…</p>
            <p className="text-sm italic text-muted-foreground">{peerInterim}</p>
          </div>
        )}
        {myInterim && (
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm border border-dashed border-indigo-400/50 px-3 py-2 text-right">
            <p className="text-[11px] text-muted-foreground">You · speaking…</p>
            <p className="text-sm italic text-muted-foreground">{myInterim}</p>
          </div>
        )}
      </div>

      {/* Errors */}
      {micError && (
        <div className="flex items-start gap-2 border-t bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300 sm:px-4" role="alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {SPEECH_ERROR_COPY[micError]}
        </div>
      )}
      {!speech.supported && !ended && (
        <div className="flex items-start gap-2 border-t bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 sm:px-4">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This browser can't turn speech into text. Type your messages below, or open the link in Chrome, Edge or Safari to talk.
        </div>
      )}
      {ended && (
        <div className="border-t bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground sm:px-4">
          This conversation has ended. The transcript above stays available.
        </div>
      )}

      {/* Controls */}
      {!ended && (
        <div className="space-y-2 border-t p-3 sm:px-4">
          <div className="flex items-center gap-3">
            {speech.supported && (
              <Button
                type="button"
                size="lg"
                onClick={toggleMic}
                variant={micOn ? 'destructive' : 'default'}
                className="h-12 shrink-0 gap-2 rounded-full px-5"
                aria-pressed={micOn}
              >
                {micOn ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                {micOn ? 'Mute' : 'Start talking'}
              </Button>
            )}
            <div className="min-w-0 flex-1 text-xs text-muted-foreground">
              {micOn
                ? ttsSpeaking
                  ? 'Paused while reading aloud…'
                  : speech.listening
                    ? <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Listening in {languageLabel(myLanguage)}</span>
                    : 'Starting microphone…'
                : speech.supported ? 'Microphone is off.' : ''}
            </div>
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" title="Read the other person's translated words aloud">
              <Volume2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Read aloud</span>
              <Switch checked={readAloud} onCheckedChange={setReadAloud} aria-label="Read translations aloud" />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) sendTyped(); }}
              placeholder={`Or type in ${languageLabel(myLanguage)}…`}
              maxLength={1500}
              className="h-9 flex-1"
            />
            <Button size="icon" variant="outline" onClick={sendTyped} disabled={!typed.trim()} title="Send" className="h-9 w-9 shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {role === 'host' && guestJoined && (
            <button type="button" onClick={makeNewInvite} disabled={busy === 'invite'} className="text-[11px] text-muted-foreground underline-offset-2 hover:underline">
              Wrong person joined? Create a new invite link
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const ParticipantCard: React.FC<{
  label: string;
  name: string | null;
  language: string | null;
  online: boolean;
  micOn: boolean;
  waiting?: boolean;
  editable?: boolean;
  changing?: boolean;
  onLanguageChange?: (language: string) => void;
}> = ({ label, name, language, online, micOn, waiting, editable, changing, onLanguageChange }) => (
  <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${waiting ? 'bg-muted-foreground/30' : online ? 'bg-emerald-500' : 'bg-amber-500'}`}
      title={waiting ? 'Not joined yet' : online ? 'Connected' : 'Disconnected'}
    />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">
        {waiting ? 'Waiting to join…' : name || label}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">{label}</span>
      </p>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {waiting ? 'Share the invite link below' : !online ? 'Disconnected — reconnecting…' : micOn ? <><Mic className="h-3 w-3" /> Mic on</> : <><MicOff className="h-3 w-3" /> Muted</>}
      </p>
    </div>
    {editable && language && onLanguageChange ? (
      <Select value={language} onValueChange={onLanguageChange} disabled={changing}>
        <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Your language">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CONVERSATION_LANGUAGES.map((l) => (
            <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      language && <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs">{languageLabel(language)}</span>
    )}
  </div>
);

const TranscriptTurn: React.FC<{ entry: ConversationEntry; mine: boolean; waitingForGuest: boolean }> = ({ entry, mine, waitingForGuest }) => (
  <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
    <div
      className={`max-w-[85%] overflow-hidden rounded-2xl border ${mine ? 'rounded-br-sm border-indigo-300/60 dark:border-indigo-500/40' : 'rounded-bl-sm'}`}
    >
      <div className={`px-3 py-2 ${mine ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'bg-background'}`}>
        <p className="mb-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">{entry.speaker_name}</span>
          · {formatTime(entry.created_at)}
          <span className="rounded bg-muted px-1 py-px text-[10px] uppercase tracking-wide">{entry.original_language} · original</span>
        </p>
        <p className="whitespace-pre-wrap break-words text-sm sm:text-base">{entry.original_text}</p>
      </div>
      <div className="border-t border-dashed bg-muted/50 px-3 py-2">
        {entry.translated_text ? (
          <>
            <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{entry.translated_language} · translation</p>
            <p className="whitespace-pre-wrap break-words text-sm italic text-foreground/90 sm:text-base">{entry.translated_text}</p>
          </>
        ) : entry.translation_failed ? (
          <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><AlertCircle className="h-3 w-3" /> Translation unavailable for this line</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {waitingForGuest ? 'Translated when the other person joins' : 'Translating…'}
          </p>
        )}
      </div>
    </div>
  </div>
);

const PendingTurnRow: React.FC<{ turn: PendingTurn; onRetry: () => void }> = ({ turn, onRetry }) => (
  <div className="flex justify-end">
    <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-indigo-300/60 bg-indigo-50/60 px-3 py-2 dark:border-indigo-500/40 dark:bg-indigo-950/30">
      <p className="whitespace-pre-wrap break-words text-sm sm:text-base">{turn.text}</p>
      {turn.status === 'sending' ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Sending and translating…</p>
      ) : (
        <button type="button" onClick={onRetry} className="mt-1 flex items-center gap-1 text-[11px] text-red-600 hover:underline dark:text-red-400">
          <RefreshCw className="h-3 w-3" /> Not sent — tap to retry
        </button>
      )}
    </div>
  </div>
);

export default BilingualConversationRoom;
