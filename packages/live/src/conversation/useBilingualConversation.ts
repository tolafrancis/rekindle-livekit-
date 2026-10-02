import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import {
  callConversation,
  ConversationApiError,
  newUtteranceId,
  type ConversationEntry,
  type ConversationInfo,
  type ConversationRole,
  type ConversationState,
} from './conversationApi';

/**
 * Shared state for one bilingual conversation, on either seat.
 *
 * Source of truth is the bilingual-conversation edge function's `state`
 * action; the private Realtime channel (topic = channel_key) only carries
 * "re-fetch now" pings from the server, each side's live partial text,
 * and presence (who's connected, muted, which language). Re-fetching the
 * whole transcript on every ping keeps both sides identical by
 * construction, and on reconnect nothing is lost: the first SUBSCRIBED
 * after a drop triggers a full re-fetch. A slow poll is the backstop for
 * a channel that's silently dead.
 */

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface PeerPresence {
  role: ConversationRole;
  name: string;
  language: string;
  micOn: boolean;
}

/** A turn this device has sent (or is sending) that the server hasn't
 *  confirmed yet. */
export interface PendingTurn {
  clientUtteranceId: string;
  text: string;
  status: 'sending' | 'failed';
}

const POLL_MS = 10_000;
const MAX_SEND_ATTEMPTS = 4;
/** Errors that mean this device is no longer in the conversation at all. */
const FATAL_CODES = new Set(['seat_revoked', 'unauthorized', 'conversation_not_found']);

interface Options {
  conversationId: string;
  /** Guest seat token; omitted for the host (signed-in session instead). */
  seatToken?: string | null;
}

export function useBilingualConversation({ conversationId, seatToken }: Options) {
  const [role, setRole] = useState<ConversationRole | null>(null);
  const [conversation, setConversation] = useState<ConversationInfo | null>(null);
  const [entries, setEntries] = useState<ConversationEntry[]>([]);
  const [loadError, setLoadError] = useState<ConversationApiError | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [peers, setPeers] = useState<Partial<Record<ConversationRole, PeerPresence>>>({});
  const [peerInterim, setPeerInterim] = useState('');
  const [pending, setPending] = useState<PendingTurn[]>([]);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const subscribedRef = useRef(false);
  const myPresenceRef = useRef<PeerPresence | null>(null);
  const fetchingRef = useRef<Promise<void> | null>(null);
  const refetchQueuedRef = useRef(false);

  const seatBody = useCallback(
    (extra: Record<string, unknown> = {}) => ({ conversationId, ...(seatToken ? { seatToken } : {}), ...extra }),
    [conversationId, seatToken],
  );

  const refresh = useCallback(async () => {
    // Coalesce bursts of pings into at most one in-flight + one queued fetch.
    if (fetchingRef.current) { refetchQueuedRef.current = true; return fetchingRef.current; }
    const run = (async () => {
      try {
        const state = await callConversation<ConversationState>({ action: 'state', ...seatBody() });
        setRole(state.role);
        setConversation(state.conversation);
        setEntries(state.entries);
        setLoadError(null);
        // Confirmed turns drop out of the local pending list.
        const confirmed = new Set(state.entries.map((e) => e.client_utterance_id));
        setPending((prev) => prev.filter((p) => !confirmed.has(p.clientUtteranceId)));
      } catch (err) {
        const apiErr = err instanceof ConversationApiError ? err : new ConversationApiError('network_error');
        // A network blip keeps showing what we have; anything else
        // (revoked seat, deleted conversation) replaces the room.
        if (FATAL_CODES.has(apiErr.code)) setLoadError(apiErr);
        else setConnection((c) => (c === 'connected' ? 'reconnecting' : c));
      }
    })();
    fetchingRef.current = run;
    await run;
    fetchingRef.current = null;
    if (refetchQueuedRef.current) {
      refetchQueuedRef.current = false;
      return refresh();
    }
  }, [seatBody]);

  // First load.
  useEffect(() => { refresh(); }, [refresh]);

  // Realtime channel, once we know the private topic.
  const channelKey = conversation?.channelKey;
  useEffect(() => {
    if (!channelKey || !role) return;
    const channel = supabase.channel(`bilingual-conversation-${channelKey}`, {
      config: { presence: { key: role }, broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'entry' }, () => refresh())
      .on('broadcast', { event: 'state' }, () => refresh())
      .on('broadcast', { event: 'interim' }, ({ payload }) => {
        if (payload?.role && payload.role !== role) setPeerInterim(typeof payload.text === 'string' ? payload.text : '');
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PeerPresence>();
        const next: Partial<Record<ConversationRole, PeerPresence>> = {};
        (['host', 'guest'] as ConversationRole[]).forEach((r) => {
          const metas = state[r];
          if (metas && metas.length > 0) next[r] = metas[metas.length - 1];
        });
        setPeers(next);
        const otherRole = role === 'host' ? 'guest' : 'host';
        if (!next[otherRole]) setPeerInterim('');
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          subscribedRef.current = true;
          setConnection('connected');
          if (myPresenceRef.current) channel.track(myPresenceRef.current);
          refresh(); // catch up on anything missed while disconnected
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribedRef.current = false;
          setConnection(navigator.onLine === false ? 'offline' : 'reconnecting');
        }
      });

    return () => {
      subscribedRef.current = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [channelKey, role, refresh]);

  // Backstop poll + browser online/offline signals.
  useEffect(() => {
    const interval = setInterval(() => { if (document.visibilityState !== 'hidden' || !subscribedRef.current) refresh(); }, POLL_MS);
    const onOffline = () => setConnection('offline');
    const onOnline = () => { setConnection(subscribedRef.current ? 'connected' : 'reconnecting'); refresh(); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(interval);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [refresh]);

  /** Updates what the other side sees about this device (mic, language). */
  const setMyPresence = useCallback((presence: PeerPresence) => {
    const prev = myPresenceRef.current;
    if (prev && prev.micOn === presence.micOn && prev.language === presence.language && prev.name === presence.name) return;
    myPresenceRef.current = presence;
    if (channelRef.current && subscribedRef.current) channelRef.current.track(presence);
  }, []);

  const lastInterimSentRef = useRef(0);
  const interimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Live partial text while speaking — throttled, best-effort, not stored. */
  const sendInterim = useCallback((text: string) => {
    if (!role) return;
    const send = () => {
      lastInterimSentRef.current = Date.now();
      channelRef.current?.send({ type: 'broadcast', event: 'interim', payload: { role, text } });
    };
    if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
    const since = Date.now() - lastInterimSentRef.current;
    if (!text || since > 300) send();
    else interimTimerRef.current = setTimeout(send, 300 - since);
  }, [role]);

  const sendTurn = useCallback(async (text: string, existingId?: string) => {
    const clean = text.trim();
    if (!clean) return;
    const clientUtteranceId = existingId || newUtteranceId();
    setPending((prev) => [
      ...prev.filter((p) => p.clientUtteranceId !== clientUtteranceId),
      { clientUtteranceId, text: clean, status: 'sending' },
    ]);
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
      try {
        const { entry } = await callConversation<{ entry: ConversationEntry }>({ action: 'post', ...seatBody({ text: clean, clientUtteranceId }) });
        // Show it straight away; the ping-triggered refresh confirms order.
        setEntries((prev) => (prev.some((e) => e.id === entry.id) ? prev : [...prev, entry]));
        setPending((prev) => prev.filter((p) => p.clientUtteranceId !== clientUtteranceId));
        return;
      } catch (err) {
        const code = err instanceof ConversationApiError ? err.code : 'network_error';
        const retryable = code === 'network_error' || code === 'server_error';
        if (!retryable || attempt === MAX_SEND_ATTEMPTS) {
          setPending((prev) => prev.map((p) => (p.clientUtteranceId === clientUtteranceId ? { ...p, status: 'failed' } : p)));
          if (FATAL_CODES.has(code)) setLoadError(err as ConversationApiError);
          if (code === 'conversation_ended') refresh();
          return;
        }
        // Same clientUtteranceId on every retry, so the server never stores it twice.
        await new Promise((r) => setTimeout(r, 600 * 2 ** (attempt - 1)));
      }
    }
  }, [seatBody, refresh]);

  const retryTurn = useCallback((turn: PendingTurn) => sendTurn(turn.text, turn.clientUtteranceId), [sendTurn]);

  const setLanguage = useCallback(async (language: string) => {
    await callConversation({ action: 'language', ...seatBody({ language }) });
    await refresh();
  }, [seatBody, refresh]);

  const leave = useCallback(async () => {
    try { await callConversation({ action: 'leave', ...seatBody() }); } catch { /* leaving anyway */ }
  }, [seatBody]);

  const createInvite = useCallback(async () => {
    const { inviteToken } = await callConversation<{ inviteToken: string }>({ action: 'invite', conversationId });
    await refresh();
    return inviteToken;
  }, [conversationId, refresh]);

  return {
    role,
    conversation,
    entries,
    pending,
    loadError,
    connection,
    peers,
    peerInterim,
    refresh,
    sendTurn,
    retryTurn,
    sendInterim,
    setMyPresence,
    setLanguage,
    leave,
    createInvite,
  };
}
