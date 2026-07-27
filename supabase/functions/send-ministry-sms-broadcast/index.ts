// Supabase Edge Function: send-ministry-sms-broadcast
// =====================================================================
// General-purpose SMS broadcast to a ministry's members, via the ministry's
// OWN Twilio number (ministry_sms_configs — the same table/credentials
// already used by process-birthday-wishes, just for an admin-triggered
// message instead of an automatic birthday one).
//
// Request (POST, caller must be a leader/admin/owner of ministryId):
//   { ministryId: string, message: string, title?: string }
//     -> { success, sent, failed, total }
//
// DEPLOY
//   supabase functions deploy send-ministry-sms-broadcast
//
// ENV SECRETS (Supabase Dashboard → Edge Functions)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY  auto-injected
//   ENCRYPTION_KEY   32-byte hex — SAME key used by ministry-whatsapp-broadcast
//                    and process-birthday-wishes to decrypt ministry_sms_configs
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { ministryId, message, title } = await req.json();
    if (!ministryId || !message) return json({ error: 'ministryId and message are required' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const encKey = Deno.env.get('ENCRYPTION_KEY') ?? '';

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: isAdmin } = await admin.rpc('is_group_admin', { p_ministry_id: ministryId, p_user_id: user.id });
    if (!isAdmin) return json({ error: 'Not authorized to message this ministry' }, 403);

    const { data: smsConfig } = await admin
      .from('ministry_sms_configs').select('*').eq('ministry_id', ministryId).maybeSingle();
    if (!smsConfig || smsConfig.connection_status !== 'connected') {
      return json({ error: 'SMS is not connected for this ministry yet — set it up in Ministry Settings first.' }, 400);
    }

    const authToken = await decryptToken(smsConfig.twilio_auth_token_encrypted, encKey);
    if (!authToken) return json({ error: 'Could not decrypt SMS credentials' }, 500);

    const { data: memberRows, error: memberErr } = await admin
      .from('ministry_group_members')
      .select('user_id, user_profiles!inner(phone)')
      .eq('group_id', ministryId);
    if (memberErr) return json({ error: memberErr.message }, 500);

    const recipients = (memberRows ?? [])
      .map((r: any) => r.user_profiles?.phone)
      .filter((phone: unknown): phone is string => typeof phone === 'string' && phone.trim().length > 0);

    if (recipients.length === 0) {
      await logBroadcast(admin, { title, message, sent: 0, failed: 0, total: 0, ministryId });
      return json({ success: true, sent: 0, failed: 0, total: 0, note: 'No members with a phone number on file' });
    }

    let sent = 0;
    let failed = 0;
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${smsConfig.twilio_account_sid}/Messages.json`;
    const credentials = btoa(`${smsConfig.twilio_account_sid}:${authToken}`);

    for (const phone of recipients) {
      const formattedPhone = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
      try {
        const res = await fetch(twilioUrl, {
          method: 'POST',
          headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ From: smsConfig.from_number, To: `+${formattedPhone}`, Body: message }).toString(),
        });
        const data = await res.json();
        if (res.ok && data.sid) sent++; else failed++;
      } catch {
        failed++;
      }
    }

    await logBroadcast(admin, { title, message, sent, failed, total: recipients.length, ministryId });
    return json({ success: true, sent, failed, total: recipients.length });
  } catch (error) {
    console.error('send-ministry-sms-broadcast error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

async function logBroadcast(
  admin: ReturnType<typeof createClient>,
  args: { title?: string; message: string; sent: number; failed: number; total: number; ministryId: string },
) {
  await admin.from('broadcast_logs').insert({
    title: args.title ?? 'SMS broadcast',
    message: args.message.slice(0, 500),
    channel: 'sms',
    recipients_count: args.total,
    successful_sends: args.sent,
    failed_sends: args.failed,
    sent_at: new Date().toISOString(),
    metadata: { ministryId: args.ministryId },
  }).catch((e) => console.error('[send-ministry-sms-broadcast] log failed:', e));
}

// AES-GCM decrypt — mirrors process-birthday-wishes / ministry-whatsapp-broadcast.
async function decryptToken(encrypted: string, keyHex: string): Promise<string | null> {
  try {
    if (!keyHex || !encrypted) return encrypted;
    const keyData = hexToBytes(keyHex.slice(0, 64));
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const combined = hexToBytes(encrypted);
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('Decrypt error — returning token as-is (may be unencrypted in dev):', err);
    return encrypted;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}
