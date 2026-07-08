// Supabase Edge Function: evangelism-inbox-webhook
// Receives inbound messages from:
//   - WhatsApp (via Twilio webhook)
//   - Facebook Messenger (via Meta webhook)
//   - Instagram DMs (via Meta webhook)
//   - Website chat widget (direct POST)
//
// Deploy: supabase functions deploy evangelism-inbox-webhook
// Webhook URL to register: https://<project>.supabase.co/functions/v1/evangelism-inbox-webhook
//
// Required secrets:
//   TWILIO_AUTH_TOKEN         (for WhatsApp HMAC verification)
//   META_APP_SECRET           (for Facebook Messenger verification)
//   META_IG_APP_SECRET        (for Instagram verification)
//   META_WEBHOOK_VERIFY_TOKEN (your chosen verify string for hub challenge)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function hmacSHA256(secret: string, message: string): Promise<string> {
  const enc   = new TextEncoder();
  const key   = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig   = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function upsertContact(
  supabase: any,
  ministryId: string,
  channel: string,
  externalId: string,
  displayName: string,
  phone: string | null,
  messagePreview: string
): Promise<string> {
  // Check existing
  const { data: existing } = await supabase
    .from('ministry_evangelism_contacts')
    .select('id, unread_count')
    .eq('ministry_id', ministryId)
    .eq('channel', channel)
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

  // New contact
  const { data: created, error } = await supabase
    .from('ministry_evangelism_contacts')
    .insert({
      ministry_id: ministryId,
      channel,
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
  channel: string,
  body: string,
  externalMessageId?: string,
  mediaUrl?: string
): Promise<void> {
  await supabase.from('ministry_evangelism_messages').insert({
    contact_id: contactId,
    ministry_id: ministryId,
    direction: 'inbound',
    channel,
    body,
    media_url: mediaUrl ?? null,
    status: 'delivered',
    external_message_id: externalMessageId ?? null,
  });
}

// Resolve ministryId from a Twilio WhatsApp number or a Meta page ID
async function resolveMinistryId(supabase: any, field: string, value: string): Promise<string | null> {
  if (field === 'twilio_from_number') {
    const { data } = await supabase
      .from('ministry_whatsapp_configs')
      .select('ministry_id')
      .eq('twilio_from_number', value)
      .eq('connection_status', 'connected')
      .maybeSingle();
    return data?.ministry_id ?? null;
  }
  if (field === 'page_id') {
    const { data } = await supabase
      .from('ministry_channel_configs')
      .select('ministry_id')
      .eq('page_id', value)
      .in('channel', ['messenger', 'instagram'])
      .maybeSingle();
    return data?.ministry_id ?? null;
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── Meta webhook verification (GET hub.challenge) ─────────────────────────
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const expected  = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN');
    if (mode === 'subscribe' && token === expected) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const rawBody  = await req.text();
  const body     = JSON.parse(rawBody || '{}');
  const source   = url.searchParams.get('source') ?? body.source ?? 'auto';

  try {

    // ── WhatsApp via Twilio ───────────────────────────────────────────────────
    if (source === 'whatsapp' || req.headers.get('x-twilio-signature')) {
      const params       = new URLSearchParams(rawBody);
      const fromRaw      = params.get('From') ?? '';
      const toRaw        = params.get('To')   ?? '';
      const messageBody  = params.get('Body') ?? '';
      const mediaSid     = params.get('MediaUrl0');
      const msgSid       = params.get('MessageSid') ?? '';
      const profileName  = params.get('ProfileName') ?? fromRaw.replace('whatsapp:', '');

      // Validate Twilio signature
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
      if (authToken) {
        const twilioSig   = req.headers.get('x-twilio-signature') ?? '';
        const webhookUrl  = req.url;
        const sortedPairs = Array.from(params.entries()).sort().map(([k, v]) => k + v).join('');
        const expected    = await hmacSHA256(authToken, webhookUrl + sortedPairs);
        const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expected.match(/.{2}/g)!.map(h => parseInt(h, 16)))));
        if (twilioSig && twilioSig !== expectedB64) {
          console.warn('[whatsapp] invalid Twilio signature');
        }
      }

      const phone      = fromRaw.replace('whatsapp:', '');
      const toNumber   = toRaw.replace('whatsapp:', '');
      const ministryId = await resolveMinistryId(supabase, 'twilio_from_number', toRaw) ?? url.searchParams.get('ministryId');

      if (!ministryId) return json({ error: 'Ministry not found for this WhatsApp number' }, 404);

      const contactId = await upsertContact(supabase, ministryId, 'whatsapp', phone, profileName, phone, messageBody);
      await saveMessage(supabase, contactId, ministryId, 'whatsapp', messageBody, msgSid, mediaSid ?? undefined);

      return new Response('<?xml version="1.0"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // ── Meta webhook (Messenger + Instagram) ─────────────────────────────────
    if (body.object === 'page' || body.object === 'instagram') {
      const isInstagram = body.object === 'instagram';
      const secret      = isInstagram
        ? Deno.env.get('META_IG_APP_SECRET') ?? ''
        : Deno.env.get('META_APP_SECRET') ?? '';

      // Verify Meta signature
      if (secret) {
        const sigHeader = req.headers.get('x-hub-signature-256') ?? '';
        const expected  = 'sha256=' + await hmacSHA256(secret, rawBody);
        if (sigHeader && sigHeader !== expected) {
          return json({ error: 'Invalid Meta signature' }, 403);
        }
      }

      for (const entry of body.entry ?? []) {
        const pageId  = entry.id;
        const channel = isInstagram ? 'instagram' : 'messenger';

        const ministryId = await resolveMinistryId(supabase, 'page_id', pageId);
        if (!ministryId) { console.warn(`No ministry for page ${pageId}`); continue; }

        for (const event of entry.messaging ?? []) {
          const senderId = event.sender?.id;
          if (!senderId || event.sender?.id === pageId) continue; // skip echo
          if (!event.message) continue;

          const msgText  = event.message.text ?? '[media]';
          const msgId    = event.message.mid;
          const mediaUrl = event.message.attachments?.[0]?.payload?.url;

          // Fetch sender name from Graph API
          let displayName = `User ${senderId.slice(-6)}`;
          try {
            const token = isInstagram
              ? Deno.env.get('META_IG_PAGE_ACCESS_TOKEN')
              : Deno.env.get('META_PAGE_ACCESS_TOKEN');
            if (token) {
              const profileRes = await fetch(`https://graph.facebook.com/v20.0/${senderId}?fields=name&access_token=${token}`);
              const profileData = await profileRes.json();
              if (profileData.name) displayName = profileData.name;
            }
          } catch { /* non-fatal */ }

          const contactId = await upsertContact(supabase, ministryId, channel, senderId, displayName, null, msgText);
          await saveMessage(supabase, contactId, ministryId, channel, msgText, msgId, mediaUrl);
        }
      }

      return json({ status: 'ok' });
    }

    // ── Website chat widget ───────────────────────────────────────────────────
    if (source === 'website' || body.channel === 'website') {
      const { ministryId, sessionId, displayName, message: msgText } = body;
      if (!ministryId || !sessionId || !msgText) {
        return json({ error: 'ministryId, sessionId, and message are required' }, 400);
      }

      const contactId = await upsertContact(
        supabase, ministryId, 'website', sessionId,
        displayName || 'Website Visitor', null, msgText
      );
      await saveMessage(supabase, contactId, ministryId, 'website', msgText);

      return json({ success: true, contactId });
    }

    return json({ status: 'ignored', note: 'Unrecognised webhook source' });

  } catch (err: any) {
    console.error('[evangelism-inbox-webhook] error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
