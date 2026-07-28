// Supabase Edge Function: sms-save-credentials
//
// PURPOSE
//   Saves a ministry's own Twilio SMS credentials (Account SID, Auth Token,
//   From number) for the Birthday Wishes SMS channel. Fully independent of
//   ministry_whatsapp_configs — a ministry can run SMS with no WhatsApp
//   connected at all, or a different Twilio number than the one approved
//   for WhatsApp.
//
// DEPLOY
//   supabase functions deploy sms-save-credentials
//
// ENV SECRETS (Supabase Dashboard → Edge Functions)
//   SUPABASE_URL                auto-injected
//   SUPABASE_SERVICE_ROLE_KEY   auto-injected
//   ENCRYPTION_KEY              32-byte hex (same key used by
//                               whatsapp-save-credentials / process-birthday-wishes)
//
// DATABASE TABLE REQUIRED: ministry_sms_configs (migration 0255)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SaveSmsCredentialsRequest {
  ministryId: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  fromNumber: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { ministryId, twilioAccountSid, twilioAuthToken, fromNumber }: SaveSmsCredentialsRequest = await req.json();

    if (!ministryId || !twilioAccountSid || !twilioAuthToken || !fromNumber) {
      return jsonError('ministryId, twilioAccountSid, twilioAuthToken, and fromNumber are required', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const encryptedToken = await encryptToken(twilioAuthToken, Deno.env.get('ENCRYPTION_KEY') ?? '');

    const { error } = await supabase
      .from('ministry_sms_configs')
      .upsert({
        ministry_id: ministryId,
        twilio_account_sid: twilioAccountSid,
        twilio_auth_token_encrypted: encryptedToken,
        from_number: fromNumber,
        connection_status: 'connected',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'ministry_id' });

    if (error) return jsonError(error.message, 500);

    return jsonOk({
      ok: true,
      accountSidLast4: twilioAccountSid.slice(-4),
      message: 'SMS credentials saved.',
    });
  } catch (err: any) {
    console.error('sms-save-credentials error:', err);
    return jsonError(err?.message ?? 'Unexpected error', 500);
  }
});

// ── Crypto helper — mirrors whatsapp-save-credentials-function.ts exactly ──

async function encryptToken(plaintext: string, keyHex: string): Promise<string> {
  if (!keyHex) return plaintext; // dev fallback
  try {
    const keyData = hexToBytes(keyHex.slice(0, 64));
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
    const combined = new Uint8Array(12 + enc.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(enc), 12);
    return bytesToHex(combined);
  } catch {
    return plaintext;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function jsonOk(body: object) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
