import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@rekindle/supabase';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Card, CardContent } from '@rekindle/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { AlertCircle, Languages, Loader2 } from 'lucide-react';
import {
  callConversation,
  ConversationApiError,
  conversationErrorMessage,
  CONVERSATION_LANGUAGES,
  clearSeatToken,
  defaultLanguage,
  languageLabel,
  loadSeatToken,
  saveSeatToken,
  type ConversationState,
} from '../conversation/conversationApi';
import { BilingualConversationRoom } from './BilingualConversationRoom';

/**
 * /conversation/:conversationId#invite=<token> — public entry to a
 * bilingual conversation. No account needed for the guest.
 *
 *   1. This device already holds a guest seat → straight back in
 *      (reload, reconnect, phone locked and unlocked).
 *   2. Signed in as the host → into the room as host.
 *   3. Valid invite in the fragment → name + language, then join, which
 *      swaps the one-time invite for this device's own seat token.
 */

type Phase =
  | { kind: 'checking' }
  | { kind: 'join'; inviteToken: string; hostName?: string }
  | { kind: 'room'; seatToken: string | null }
  | { kind: 'error'; message: string }
  | { kind: 'left' };

const readInviteFromHash = () => {
  const match = /(?:^|[#&])invite=([A-Za-z0-9]+)/.exec(window.location.hash);
  return match ? match[1] : null;
};

export const BilingualConversationJoinPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [name, setName] = useState('');
  const [language, setLanguage] = useState(defaultLanguage);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const resolve = useCallback(async () => {
    if (!conversationId) { setPhase({ kind: 'error', message: 'This link is incomplete.' }); return; }
    const invite = readInviteFromHash();

    const stored = loadSeatToken(conversationId);
    if (stored) {
      try {
        await callConversation<ConversationState>({ action: 'state', conversationId, seatToken: stored });
        setPhase({ kind: 'room', seatToken: stored });
        return;
      } catch (err) {
        if (err instanceof ConversationApiError && err.code === 'network_error') {
          // Offline right now — the room itself shows reconnecting and retries.
          setPhase({ kind: 'room', seatToken: stored });
          return;
        }
        clearSeatToken(conversationId); // seat was replaced; fall through to the invite
      }
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      try {
        const state = await callConversation<ConversationState>({ action: 'state', conversationId });
        if (state.role === 'host') { setPhase({ kind: 'room', seatToken: null }); return; }
      } catch { /* not the host — carry on */ }
    }

    if (invite) { setPhase({ kind: 'join', inviteToken: invite }); return; }
    setPhase({ kind: 'error', message: "This link is missing its invite. Ask the person who invited you to send it again." });
  }, [conversationId]);

  useEffect(() => { resolve(); }, [resolve]);

  const join = async () => {
    if (phase.kind !== 'join' || !conversationId) return;
    setJoining(true);
    setJoinError(null);
    try {
      const { seatToken } = await callConversation<{ seatToken: string }>({
        action: 'join',
        conversationId,
        inviteToken: phase.inviteToken,
        guestName: name.trim() || undefined,
        guestLanguage: language,
      });
      saveSeatToken(conversationId, seatToken);
      // The invite is spent — drop it from the address bar so it isn't
      // copied or re-shared by accident.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      setPhase({ kind: 'room', seatToken });
    } catch (err) {
      const code = err instanceof ConversationApiError ? err.code : '';
      if (['already_joined', 'invite_expired', 'conversation_ended', 'invalid_invite', 'conversation_not_found'].includes(code)) {
        setPhase({ kind: 'error', message: conversationErrorMessage(err) });
      } else {
        setJoinError(conversationErrorMessage(err));
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ minHeight: '100dvh' }}>
      {phase.kind === 'room' && conversationId ? (
        <div className="mx-auto flex h-screen max-w-4xl flex-col p-2 sm:p-4" style={{ height: '100dvh' }}>
          <BilingualConversationRoom
            conversationId={conversationId}
            seatToken={phase.seatToken}
            onLeave={() => (phase.seatToken ? setPhase({ kind: 'left' }) : navigate('/'))}
            onSeatLost={(message) => { if (conversationId) clearSeatToken(conversationId); setPhase({ kind: 'error', message }); }}
          />
        </div>
      ) : (
        <div className="flex min-h-screen items-center justify-center px-4 py-8" style={{ minHeight: '100dvh' }}>
          <Card className="w-full max-w-md">
            <CardContent className="space-y-5 py-8">
              <div className="space-y-1 text-center">
                <Languages className="mx-auto h-8 w-8 text-indigo-500" />
                <p className="text-base font-semibold">Translated conversation</p>
              </div>

              {phase.kind === 'checking' && (
                <div className="flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              )}

              {phase.kind === 'join' && (
                <>
                  <p className="text-center text-sm text-muted-foreground">
                    You've been invited to talk. Speak in your own language; you'll both see what was said and its translation.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="guest-name">Your name</Label>
                    <Input id="guest-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="So they know who's talking" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Language you'll speak</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger aria-label="Your language"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONVERSATION_LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {joinError && (
                    <p className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400" role="alert">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {joinError}
                    </p>
                  )}
                  <Button className="w-full" onClick={join} disabled={joining}>
                    {joining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Join in {languageLabel(language)}
                  </Button>
                </>
              )}

              {phase.kind === 'error' && (
                <p className="text-center text-sm text-muted-foreground">{phase.message}</p>
              )}

              {phase.kind === 'left' && (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">You left the conversation.</p>
                  <Button variant="outline" onClick={() => setPhase({ kind: 'room', seatToken: loadSeatToken(conversationId!) })}>
                    Rejoin
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default BilingualConversationJoinPage;
