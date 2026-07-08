// Supabase Edge Function: evangelism-send-message
// Routes an outbound reply from the inbox to the correct channel.
// Deploy: supabase functions deploy evangelism-send-message
//
// Required secrets:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
//   META_PAGE_ACCESS_TOKEN    (Facebook Messenger)
//   META_IG_PAGE_ACCESS_TOKEN (Instagram DMs)
//   ENCRYPTION_KEY            (for per-ministry token decryption)
//
// The function reads per-ministry credentials from ministry_whatsapp_configs
// and falls back to global env secrets.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Simple XOR-based decrypt (matches whatsapp-save-credentials encryption)
async function decryptToken(encryptedHex: string, key: string): Promise<string> {
  try {
    const enc = new TextEncoder();
    const keyData = enc.encode(key.slice(0, 32).padEnd(32, '0'));
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, 'AES-GCM', false, ['decrypt']);
    const buf = new Uint8Array(encryptedHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
    const iv = buf.slice(0, 12);
    const data = buf.slice(12);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
    return new TextDecoder().decode(dec);
  } catch {
    return '';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { ministryId, contactId, channel, externalId, message } = await req.json();
    if (!ministryId || !contactId || !channel || !externalId || !message) {
      return json({ error: 'Missing required fields' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const encKey = Deno.env.get('ENCRYPTION_KEY') ?? '';

    // ── WhatsApp ──────────────────────────────────────────────────────────────
    if (channel === 'whatsapp') {
      // Load ministry Twilio config
      const { data: wabaConfig } = await supabase
        .from('ministry_whatsapp_configs')
        .select('twilio_account_sid, twilio_auth_token_encrypted, twilio_from_number, provider')
        .eq('ministry_id', ministryId)
        .maybeSingle();

      const accountSid = wabaConfig?.twilio_account_sid ?? Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
      const authToken  = wabaConfig?.twilio_auth_token_encrypted
        ? await decryptToken(wabaConfig.twilio_auth_token_encrypted, encKey)
        : Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
      const fromNumber = wabaConfig?.twilio_from_number ?? Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '';

      if (!accountSid || !authToken) return json({ error: 'WhatsApp not configured for this ministry' }, 422);

      // Ensure phone is in E.164 format
      const to = externalId.startsWith('whatsapp:') ? externalId : `whatsapp:${externalId}`;
      const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: to, From: from, Body: message }).toString(),
        }
      );
      const twilioData = await twilioRes.json();
      if (!twilioRes.ok) return json({ error: twilioData.message ?? 'Twilio error' }, 502);

      // Update message status to delivered
      await supabase
        .from('ministry_evangelism_messages')
        .update({ status: 'delivered', external_message_id: twilioData.sid })
        .eq('contact_id', contactId)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(1);

      return json({ success: true, sid: twilioData.sid });
    }

    // ── Facebook Messenger ────────────────────────────────────────────────────
    if (channel === 'messenger') {
      // Load page token — ministry-level or global
      const { data: channelCfg } = await supabase
        .from('ministry_channel_configs')
        .select('access_token_encrypted')
        .eq('ministry_id', ministryId)
        .eq('channel', 'messenger')
        .maybeSingle();

      const pageToken = channelCfg?.access_token_encrypted
        ? await decryptToken(channelCfg.access_token_encrypted, encKey)
        : Deno.env.get('META_PAGE_ACCESS_TOKEN') ?? '';

      if (!pageToken) return json({ error: 'Messenger not configured for this ministry' }, 422);

      const metaRes = await fetch(
        `https://graph.facebook.com/v20.0/me/messages?access_token=${pageToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: externalId },
            message:   { text: message },
            messaging_type: 'RESPONSE',
          }),
        }
      );
      const metaData = await metaRes.json();
      if (!metaRes.ok) return json({ error: metaData.error?.message ?? 'Meta API error' }, 502);

      return json({ success: true, message_id: metaData.message_id });
    }

    // ── Instagram DMs ─────────────────────────────────────────────────────────
    if (channel === 'instagram') {
      const { data: channelCfg } = await supabase
        .from('ministry_channel_configs')
        .select('access_token_encrypted, page_id')
        .eq('ministry_id', ministryId)
        .eq('channel', 'instagram')
        .maybeSingle();

      const igToken = channelCfg?.access_token_encrypted
        ? await decryptToken(channelCfg.access_token_encrypted, encKey)
        : Deno.env.get('META_IG_PAGE_ACCESS_TOKEN') ?? '';
      const igPageId = channelCfg?.page_id ?? Deno.env.get('META_IG_PAGE_ID') ?? '';

      if (!igToken || !igPageId) return json({ error: 'Instagram not configured for this ministry' }, 422);

      const igRes = await fetch(
        `https://graph.facebook.com/v20.0/${igPageId}/messages?access_token=${igToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: externalId },
            message:   { text: message },
          }),
        }
      );
      const igData = await igRes.json();
      if (!igRes.ok) return json({ error: igData.error?.message ?? 'Instagram API error' }, 502);

      return json({ success: true, message_id: igData.message_id });
    }

    // ── Website chat (via Supabase Realtime broadcast) ────────────────────────
    if (channel === 'website') {
      // Insert a special outbound record that the website widget listens for via Realtime
      // The widget subscribes to ministry_evangelism_messages for its session ID
      await supabase.from('ministry_evangelism_messages').insert({
        contact_id:  contactId,
        ministry_id: ministryId,
        direction:   'outbound',
        channel:     'website',
        body:        message,
        status:      'delivered',
      });
      return json({ success: true, channel: 'website' });
    }

    return json({ error: `Unknown channel: ${channel}` }, 400);

  } catch (err: any) {
    console.error('[evangelism-send-message] error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
