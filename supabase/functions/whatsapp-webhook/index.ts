// Supabase Edge Function: whatsapp-webhook
// =====================================================================
// Meta Cloud API webhook receiver for a ministry's own connected WhatsApp
// Business Account (see MinistryWhatsAppConnect.tsx / ministry_whatsapp_configs
// — the "Connect WhatsApp" flow documented in the Rekindle Guide's
// "Connect WhatsApp — Step by Step" section).
//
// Brought into the tracked supabase/functions/ layout from a previously
// deployed-outside-this-repo copy (same situation whatsapp-save-credentials
// was in, per that file's own header) that only implemented the GET
// verification handshake — its POST handler logged the body and did
// nothing else, so every real inbound WhatsApp message was silently
// discarded and never reached the Evangelism Inbox. This version actually
// resolves the ministry, upserts the contact, and saves the message, using
// the exact same ministry_evangelism_contacts / ministry_evangelism_messages
// shape and upsert logic as the Messenger/Instagram path in
// evangelism-inbox-webhook, so all three channels behave identically once
// a message lands in the inbox.
//
// Ministry resolution: Meta's payload carries `metadata.phone_number_id`,
// which is exactly the phone_number_id column create-whatsapp-subscription
// (manual entry) and whatsapp-embedded-signup-complete both write to
// ministry_whatsapp_configs — so no new column is needed to find which
// ministry a message belongs to.
//
// Signature verification: tries TWO candidate secrets and accepts if either
// matches — Rekindle's shared META_APP_SECRET (correct for ministries
// connected via Embedded Signup, whose WABA lives under Rekindle's own app
// per Meta's tech-provider model), and the resolved ministry's own stored
// app_secret_encrypted (0349_whatsapp_app_secret.sql — set via the "Enter
// Credentials Manually" path for ministries running their own separate
// Meta app). A single POST is assumed to come from one app (Meta doesn't
// batch different apps' webhook deliveries together), so the ministry is
// resolved from the first message-bearing entry and that ministry's secret
// (if any) is checked alongside the shared one. If at least one of the two
// secrets is configured and NEITHER matches, the request is rejected —
// unlike the previous log-and-continue posture, this is now a real check
// now that a manually-connected ministry has somewhere to store its own
// secret. Only when NEITHER secret is configured at all (misconfiguration)
// does it fall through and process unverified, logging a warning.
//
// Required secrets:
//   WHATSAPP_VERIFY_TOKEN   the string entered in Meta's webhook setup —
//                           no hardcoded fallback (the previous version's
//                           'rekindle_meta_webhook_2026' fallback meant an
//                           unset secret silently worked anyway).
//   META_APP_SECRET         for X-Hub-Signature-256 verification against
//                           Rekindle's own shared Meta app.
//   ENCRYPTION_KEY          to decrypt a manually-connected ministry's own
//                           app_secret_encrypted (same AES-256-GCM scheme
//                           as access_token_encrypted).
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function hmacSHA256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Matches whatsapp-embedded-signup-complete / whatsapp-verify-connection's
// AES-256-GCM scheme exactly — a ministry's own app_secret_encrypted is
// written by whatsapp-save-credentials using the same encryptToken helper.
async function decryptToken(encrypted: string, keyHex: string): Promise<string> {
  if (!keyHex || !encrypted) return encrypted;
  try {
    const keyData = hexToBytes(keyHex.slice(0, 64));
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const combined = hexToBytes(encrypted);
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    return encrypted;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function resolveMinistryConfig(
  supabase: any,
  phoneNumberId: string,
): Promise<{ ministryId: string; appSecretEncrypted: string | null } | null> {
  const { data } = await supabase
    .from('ministry_whatsapp_configs')
    .select('ministry_id, app_secret_encrypted')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();
  return data ? { ministryId: data.ministry_id, appSecretEncrypted: data.app_secret_encrypted } : null;
}

async function upsertContact(
  supabase: any,
  ministryId: string,
  externalId: string,
  displayName: string,
  phone: string,
  messagePreview: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from('ministry_evangelism_contacts')
    .select('id, unread_count')
    .eq('ministry_id', ministryId)
    .eq('channel', 'whatsapp')
    .eq('external_id', externalId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('ministry_evangelism_contacts')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: messagePreview.slice(0, 120),
        unread_count: (existing.unread_count ?? 0) + 1,
        status: 'open',
      })
      .eq('id', existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from('ministry_evangelism_contacts')
    .insert({
      ministry_id: ministryId,
      channel: 'whatsapp',
      external_id: externalId,
      display_name: displayName,
      phone,
      last_message_at: new Date().toISOString(),
      last_message_preview: messagePreview.slice(0, 120),
      unread_count: 1,
      status: 'open',
      tags: [],
    })
    .select('id')
    .single();

  if (error) throw error;
  return created.id;
}

async function saveMessage(
  supabase: any,
  contactId: string,
  ministryId: string,
  bodyText: string,
  externalMessageId: string,
  mediaUrl?: string,
): Promise<void> {
  await supabase.from('ministry_evangelism_messages').insert({
    contact_id: contactId,
    ministry_id: ministryId,
    direction: 'inbound',
    channel: 'whatsapp',
    body: bodyText,
    media_url: mediaUrl ?? null,
    status: 'delivered',
    external_message_id: externalMessageId,
  });
}

// Cloud API message types carry the body under a type-named key instead of
// a single universal field — pull out something readable for every kind
// this webhook might realistically receive rather than only 'text'.
function extractBody(message: any): { text: string; mediaUrl?: string } {
  switch (message.type) {
    case 'text':
      return { text: message.text?.body ?? '' };
    case 'image':
      return { text: message.image?.caption || '[image]', mediaUrl: message.image?.id };
    case 'video':
      return { text: message.video?.caption || '[video]', mediaUrl: message.video?.id };
    case 'audio':
      return { text: '[audio]', mediaUrl: message.audio?.id };
    case 'document':
      return { text: message.document?.caption || message.document?.filename || '[document]', mediaUrl: message.document?.id };
    case 'location':
      return { text: `[location: ${message.location?.latitude}, ${message.location?.longitude}]` };
    case 'button':
      return { text: message.button?.text ?? '[button reply]' };
    case 'interactive':
      return { text: message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? '[interactive reply]' };
    default:
      return { text: `[${message.type ?? 'message'}]` };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── Meta webhook verification (GET hub.challenge) ─────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
    if (!expected) {
      console.error('[whatsapp-webhook] WHATSAPP_VERIFY_TOKEN is not set — refusing to verify');
      return new Response('Not configured', { status: 500 });
    }
    if (mode === 'subscribe' && token === expected) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const rawBody = await req.text();

  let body: any;
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (body.object !== 'whatsapp_business_account') {
    return json({ status: 'ignored', note: 'Unrecognised webhook object type' });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Resolve which ministry this delivery belongs to from the first
  // message-bearing entry, then verify the signature against whichever of
  // the two candidate secrets applies to them (see header comment) BEFORE
  // touching the database. A single delivery is assumed to come from one
  // app, so one resolved ministry's secret stands in for the whole request.
  const firstPhoneNumberId = (body.entry ?? [])
    .flatMap((e: any) => e.changes ?? [])
    .map((c: any) => c.value?.metadata?.phone_number_id)
    .find((id: unknown) => !!id);

  let resolvedMinistryId: string | null = null;
  let ministryAppSecret: string | null = null;
  if (firstPhoneNumberId) {
    const config = await resolveMinistryConfig(supabase, firstPhoneNumberId);
    if (config) {
      resolvedMinistryId = config.ministryId;
      if (config.appSecretEncrypted) {
        ministryAppSecret = await decryptToken(config.appSecretEncrypted, Deno.env.get('ENCRYPTION_KEY') ?? '');
      }
    }
  }

  const sharedSecret = Deno.env.get('META_APP_SECRET');
  const candidateSecrets = [sharedSecret, ministryAppSecret].filter((s): s is string => !!s);
  if (candidateSecrets.length > 0) {
    const sigHeader = req.headers.get('x-hub-signature-256') ?? '';
    const digests = await Promise.all(candidateSecrets.map((s) => hmacSHA256Hex(s, rawBody)));
    const matches = digests.some((d) => sigHeader === 'sha256=' + d);
    if (!matches) {
      console.error(`[whatsapp-webhook] signature verification failed for ministry ${resolvedMinistryId ?? '(unresolved)'}`);
      return json({ error: 'Invalid signature' }, 403);
    }
  } else {
    console.warn('[whatsapp-webhook] no secret configured (neither META_APP_SECRET nor a ministry app_secret) — processing unverified');
  }

  try {
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const phoneNumberId = value.metadata?.phone_number_id;
        const messages = value.messages ?? [];
        if (!phoneNumberId || messages.length === 0) continue; // e.g. a 'statuses' (delivery receipt) change — nothing to save

        // Reuse the already-resolved ministry when this is the same phone
        // number the signature check ran against (the common case: one
        // ministry per delivery) — otherwise resolve it fresh.
        const ministryId = phoneNumberId === firstPhoneNumberId && resolvedMinistryId
          ? resolvedMinistryId
          : (await resolveMinistryConfig(supabase, phoneNumberId))?.ministryId ?? null;
        if (!ministryId) {
          console.warn(`[whatsapp-webhook] no ministry connected for phone_number_id ${phoneNumberId}`);
          continue;
        }

        const contactsByWaId = new Map<string, string>();
        for (const c of value.contacts ?? []) {
          if (c.wa_id) contactsByWaId.set(c.wa_id, c.profile?.name ?? c.wa_id);
        }

        for (const message of messages) {
          const from = message.from;
          if (!from) continue;
          const displayName = contactsByWaId.get(from) ?? from;
          const { text, mediaUrl } = extractBody(message);

          const contactId = await upsertContact(supabase, ministryId, from, displayName, from, text);
          await saveMessage(supabase, contactId, ministryId, text, message.id, mediaUrl);
        }
      }
    }

    return json({ status: 'ok' });
  } catch (err: any) {
    console.error('[whatsapp-webhook] error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
