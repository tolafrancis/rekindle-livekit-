// supabase/functions/bilingual-conversation/index.ts
//
// Backend for Live → Conversation: a two-person bilingual conversation.
// Each participant's browser does its own speech-to-text (Web Speech API,
// the same one /display already uses for spoken questions) and posts each
// finalized turn here. This translates it into the other participant's
// language with the shared translateText helper, stores it, and pings the
// conversation's private Realtime topic so both browsers re-fetch.
//
// Access model is described in migration 0386_bilingual_conversations.sql:
// host = signed-in member (Authorization header), guest = seat token
// obtained by redeeming the one-time invite token.
//
// ── Deploy ────────────────────────────────────────────────────────────
//   Secrets needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   SUPABASE_ANON_KEY, OPENAI_API_KEY (all already set).
//
// ── Request ───────────────────────────────────────────────────────────
//   POST { action, ... }
//     create   { hostName, hostLanguage, ministryId? }          (host)
//              → { conversationId, inviteToken }
//     invite   { conversationId }                               (host)
//              → { inviteToken }   new link; removes any current guest
//     join     { conversationId, inviteToken, guestName, guestLanguage }
//              → { seatToken }
//     state    { conversationId, seatToken? }
//              → { role, conversation, entries }
//     language { conversationId, seatToken?, language }
//              → { ok: true }
//     post     { conversationId, seatToken?, text, clientUtteranceId }
//              → { entry }
//     leave    { conversationId, seatToken? }
//              → { ok: true }   host leaving ends the conversation
//   Errors: { error: <code> } with 400/401/403/404/409/410.
// ─────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { translateText } from '../_shared/translateText.ts';
import { broadcastPing } from '../_shared/realtimeBroadcast.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

const INVITE_TTL_MS = 24 * 60 * 60_000;
const MAX_TEXT_CHARS = 1500;
const MAX_ENTRIES = 1000;
const MAX_NAME_CHARS = 60;
const LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const cleanName = (name: unknown, fallback: string) =>
  (typeof name === 'string' ? name.trim().slice(0, MAX_NAME_CHARS) : '') || fallback;

const validLanguage = (lang: unknown): lang is string => typeof lang === 'string' && LANGUAGE_RE.test(lang);

interface ConversationRow {
  id: string;
  ministry_id: string | null;
  host_user_id: string;
  host_name: string;
  host_language: string;
  guest_name: string | null;
  guest_language: string | null;
  invite_token_hash: string | null;
  invite_expires_at: string | null;
  guest_token_hash: string | null;
  guest_joined_at: string | null;
  channel_key: string;
  status: 'waiting' | 'active' | 'ended';
  created_at: string;
  ended_at: string | null;
}

const ENTRY_COLUMNS = 'id, speaker_role, speaker_name, original_text, original_language, translated_text, translated_language, translation_failed, client_utterance_id, created_at';

/** What a seat holder may see — never the token hashes. */
const publicConversation = (c: ConversationRow) => ({
  id: c.id,
  hostName: c.host_name,
  hostLanguage: c.host_language,
  guestName: c.guest_name,
  guestLanguage: c.guest_language,
  status: c.status,
  channelKey: c.channel_key,
  createdAt: c.created_at,
  endedAt: c.ended_at,
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      return json({ error: 'Supabase secrets not configured.' }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body.action as string | undefined;
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Signed-in caller, if any. A guest's browser may also be signed in to
    // some other account — the seat token, when present, always wins.
    const getUserId = async (): Promise<string | null> => {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return null;
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      return user?.id ?? null;
    };

    const ping = (c: ConversationRow, event: string, payload: Record<string, unknown> = {}) =>
      broadcastPing(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, `bilingual-conversation-${c.channel_key}`, event, payload);

    // ── create ──────────────────────────────────────────────────────────
    if (action === 'create') {
      const userId = await getUserId();
      if (!userId) return json({ error: 'unauthorized' }, 401);
      if (!validLanguage(body.hostLanguage)) return json({ error: 'invalid_language' }, 400);
      const ministryId = typeof body.ministryId === 'string' ? body.ministryId : null;
      if (ministryId) {
        const { data: isMember } = await service.rpc('is_group_member', { p_ministry_id: ministryId, p_user_id: userId });
        const { data: isAdmin } = await service.rpc('is_group_admin', { p_ministry_id: ministryId, p_user_id: userId });
        if (!isMember && !isAdmin) return json({ error: 'not_a_member' }, 403);
      }
      const inviteToken = randomToken();
      const { data, error } = await service
        .from('bilingual_conversations')
        .insert({
          ministry_id: ministryId,
          host_user_id: userId,
          host_name: cleanName(body.hostName, 'Host'),
          host_language: body.hostLanguage,
          invite_token_hash: await sha256Hex(inviteToken),
          invite_expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
        })
        .select('id')
        .single();
      if (error) throw error;
      return json({ conversationId: data.id, inviteToken });
    }

    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : '';
    if (!conversationId) return json({ error: 'conversationId is required' }, 400);
    const { data: conv } = await service
      .from('bilingual_conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle<ConversationRow>();
    if (!conv) return json({ error: 'conversation_not_found' }, 404);

    // ── join ────────────────────────────────────────────────────────────
    if (action === 'join') {
      if (conv.status === 'ended') return json({ error: 'conversation_ended' }, 410);
      const inviteToken = typeof body.inviteToken === 'string' ? body.inviteToken : '';
      if (!inviteToken || !conv.invite_token_hash || conv.invite_token_hash !== (await sha256Hex(inviteToken))) {
        // Either a wrong link, or this invite was already redeemed.
        return json({ error: conv.guest_token_hash ? 'already_joined' : 'invalid_invite' }, conv.guest_token_hash ? 409 : 403);
      }
      if (conv.invite_expires_at && new Date(conv.invite_expires_at).getTime() < Date.now()) {
        return json({ error: 'invite_expired' }, 410);
      }
      if (!validLanguage(body.guestLanguage)) return json({ error: 'invalid_language' }, 400);
      const seatToken = randomToken();
      // Conditional on the same invite hash, so two people opening the
      // link at once can't both claim the seat.
      const { data: claimed, error } = await service
        .from('bilingual_conversations')
        .update({
          guest_name: cleanName(body.guestName, 'Guest'),
          guest_language: body.guestLanguage,
          guest_token_hash: await sha256Hex(seatToken),
          guest_joined_at: new Date().toISOString(),
          invite_token_hash: null,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id)
        .eq('invite_token_hash', conv.invite_token_hash)
        .select('*')
        .maybeSingle<ConversationRow>();
      if (error) throw error;
      if (!claimed) return json({ error: 'already_joined' }, 409);

      // Anything the host said before the guest arrived had no target
      // language yet — translate it now so the guest sees the whole story.
      if (OPENAI_API_KEY) {
        const { data: untranslated } = await service
          .from('bilingual_conversation_entries')
          .select('id, original_text, original_language')
          .eq('conversation_id', conv.id)
          .eq('speaker_role', 'host')
          .is('translated_text', null)
          .order('created_at', { ascending: true })
          .limit(50);
        await Promise.all((untranslated || []).map(async (e) => {
          try {
            const translated = await translateText(e.original_text, e.original_language, claimed.guest_language!, OPENAI_API_KEY, 'conversation');
            await service.from('bilingual_conversation_entries')
              .update({ translated_text: translated || e.original_text, translated_language: claimed.guest_language })
              .eq('id', e.id);
          } catch (err) {
            console.error('[bilingual-conversation] backfill translate failed:', err);
          }
        }));
      }
      await ping(claimed, 'state');
      return json({ seatToken });
    }

    // ── everything else needs a seat ────────────────────────────────────
    let role: 'host' | 'guest' | null = null;
    const seatToken = typeof body.seatToken === 'string' ? body.seatToken : '';
    if (seatToken) {
      if (conv.guest_token_hash && conv.guest_token_hash === (await sha256Hex(seatToken))) role = 'guest';
    } else {
      const userId = await getUserId();
      if (userId && userId === conv.host_user_id) role = 'host';
    }
    if (!role) return json({ error: seatToken ? 'seat_revoked' : 'unauthorized' }, 403);

    if (action === 'state') {
      const { data: entries, error } = await service
        .from('bilingual_conversation_entries')
        .select(ENTRY_COLUMNS)
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: true })
        .limit(MAX_ENTRIES);
      if (error) throw error;
      return json({ role, conversation: publicConversation(conv), entries: entries || [] });
    }

    if (action === 'invite') {
      if (role !== 'host') return json({ error: 'unauthorized' }, 403);
      if (conv.status === 'ended') return json({ error: 'conversation_ended' }, 410);
      const inviteToken = randomToken();
      const { data: updated, error } = await service
        .from('bilingual_conversations')
        .update({
          invite_token_hash: await sha256Hex(inviteToken),
          invite_expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
          guest_token_hash: null,
          guest_name: null,
          guest_language: null,
          guest_joined_at: null,
          status: 'waiting',
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id)
        .select('*')
        .single<ConversationRow>();
      if (error) throw error;
      await ping(updated, 'state');
      return json({ inviteToken });
    }

    if (action === 'language') {
      if (!validLanguage(body.language)) return json({ error: 'invalid_language' }, 400);
      const patch = role === 'host' ? { host_language: body.language } : { guest_language: body.language };
      const { error } = await service
        .from('bilingual_conversations')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', conv.id);
      if (error) throw error;
      await ping(conv, 'state');
      return json({ ok: true });
    }

    if (action === 'leave') {
      if (role === 'host' && conv.status !== 'ended') {
        await service
          .from('bilingual_conversations')
          .update({ status: 'ended', ended_at: new Date().toISOString(), invite_token_hash: null, updated_at: new Date().toISOString() })
          .eq('id', conv.id);
        await ping(conv, 'state');
      }
      return json({ ok: true });
    }

    if (action === 'post') {
      if (conv.status === 'ended') return json({ error: 'conversation_ended' }, 410);
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      const clientUtteranceId = typeof body.clientUtteranceId === 'string' ? body.clientUtteranceId.slice(0, 100) : '';
      if (!text || !clientUtteranceId) return json({ error: 'text and clientUtteranceId are required' }, 400);
      if (text.length > MAX_TEXT_CHARS) return json({ error: 'text_too_long' }, 400);

      // Idempotent retry — the first attempt already landed.
      const existing = await findEntry(service, conv.id, clientUtteranceId);
      if (existing) return json({ entry: existing });

      const sourceLanguage = role === 'host' ? conv.host_language : conv.guest_language!;
      const targetLanguage = role === 'host' ? conv.guest_language : conv.host_language;
      let translated: string | null = null;
      let translationFailed = false;
      if (targetLanguage) {
        if (!OPENAI_API_KEY) {
          translationFailed = true;
        } else {
          try {
            translated = (await translateText(text, sourceLanguage, targetLanguage, OPENAI_API_KEY, 'conversation')) || text;
          } catch (err) {
            console.error('[bilingual-conversation] translate failed:', err);
            translationFailed = true;
          }
        }
      }

      const { data: entry, error } = await service
        .from('bilingual_conversation_entries')
        .insert({
          conversation_id: conv.id,
          speaker_role: role,
          speaker_name: role === 'host' ? conv.host_name : (conv.guest_name || 'Guest'),
          original_text: text,
          original_language: sourceLanguage,
          translated_text: translated,
          translated_language: translated ? targetLanguage : null,
          translation_failed: translationFailed,
          client_utterance_id: clientUtteranceId,
        })
        .select(ENTRY_COLUMNS)
        .single();
      if (error) {
        // Unique violation: a concurrent retry beat this one to it.
        if ((error as { code?: string }).code === '23505') {
          const raced = await findEntry(service, conv.id, clientUtteranceId);
          if (raced) return json({ entry: raced });
        }
        throw error;
      }
      await ping(conv, 'entry', { id: entry.id });
      return json({ entry });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    console.error('bilingual-conversation error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

async function findEntry(service: SupabaseClient, conversationId: string, clientUtteranceId: string) {
  const { data } = await service
    .from('bilingual_conversation_entries')
    .select(ENTRY_COLUMNS)
    .eq('conversation_id', conversationId)
    .eq('client_utterance_id', clientUtteranceId)
    .maybeSingle();
  return data;
}
