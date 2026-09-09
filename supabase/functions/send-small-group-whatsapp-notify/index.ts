// Supabase Edge Function: send-small-group-whatsapp-notify
// =====================================================================
// WhatsApp as a notification channel for Small Groups (see
// migrations/0336_small_group_whatsapp_notify.sql). Called by
// SmallGroupDetailManager.tsx right after a leader schedules a meeting or
// posts an announcement, when they've checked "Also notify via WhatsApp".
//
// WhatsApp Business rule this exists to respect: a business can only send
// FREE-FORM text to a user within 24h of that user messaging it first.
// Any business-initiated message outside that window — which a meeting
// reminder or an announcement always is — MUST use a pre-approved Message
// Template. So this function never sends free text; it always sends the
// ministry's configured template (ministry_whatsapp_configs.notify_template_name),
// with a fixed 2-variable contract:
//   {{1}} = short title   (meeting title, or "New update" for a post)
//   {{2}} = details/body  (date+time, or the post's content, truncated)
// The admin must create+get that template approved in Meta Business Manager
// (or via the "Templates" tab MinistryWhatsAppConnect.tsx already has) and
// select it once in WhatsApp Connect settings — this function will not
// fabricate a template name.
//
// Never blocks the caller's real action: if WhatsApp isn't configured for
// this ministry, this returns { ok:true, skipped:'not_configured' } rather
// than an error — meeting/post creation must succeed either way.
//
// Request:  POST { ministryId, groupId, kind:'meeting'|'post', title, body,
//                   meetingId?, postId? }
// Response: { ok, sent, failed, skipped? }
//
// Secrets: ENCRYPTION_KEY (decrypts the ministry's stored WABA token, same
// scheme as the other whatsapp-* functions).
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const WHATSAPP_API_VERSION = 'v20.0';
const WHATSAPP_BASE_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { ministryId, groupId, kind, title, body, meetingId, postId } = await req.json();
    if (!ministryId || !groupId || !kind || !title) {
      return json({ error: 'ministryId, groupId, kind and title are required' }, 400);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Authorize: caller must lead this specific small group (or administer
    // the ministry) — same is_small_group_leader RPC the RLS policies use.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: isLeader } = await admin.rpc('is_small_group_leader', { p_group_id: groupId, p_user_id: user.id });
    if (!isLeader) return json({ error: 'Not authorized to notify this group' }, 403);

    const logRow = { group_id: groupId, ministry_id: ministryId, meeting_id: meetingId ?? null, post_id: postId ?? null, triggered_by: user.id };

    const { data: config } = await admin
      .from('ministry_whatsapp_configs')
      .select('phone_number_id, access_token_encrypted, connection_status, notify_template_name, notify_template_language')
      .eq('ministry_id', ministryId)
      .maybeSingle();

    if (!config || config.connection_status !== 'connected' || !config.notify_template_name) {
      await admin.from('small_group_whatsapp_log').insert({ ...logRow, skipped_reason: 'not_configured' });
      return json({ ok: true, sent: 0, failed: 0, skipped: 'not_configured' });
    }

    const { data: members } = await admin
      .from('small_group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('status', 'active')
      .eq('whatsapp_notify', true);

    if (!members || members.length === 0) {
      await admin.from('small_group_whatsapp_log').insert({ ...logRow, skipped_reason: 'no_opted_in_members' });
      return json({ ok: true, sent: 0, failed: 0, skipped: 'no_opted_in_members' });
    }

    const { data: profiles } = await admin
      .from('user_profiles')
      .select('user_id, phone')
      .in('user_id', members.map((m: any) => m.user_id));

    const phones = (profiles || [])
      .map((p: any) => p.phone)
      .filter((p: any): p is string => !!p && p.trim().length > 0);

    if (phones.length === 0) {
      await admin.from('small_group_whatsapp_log').insert({ ...logRow, skipped_reason: 'no_phone_numbers' });
      return json({ ok: true, sent: 0, failed: 0, skipped: 'no_phone_numbers' });
    }

    const accessToken = await decryptToken(config.access_token_encrypted, Deno.env.get('ENCRYPTION_KEY') ?? '');
    const bodyText = (body || '').slice(0, 1024); // WhatsApp template variables have a length cap

    let sent = 0;
    let failed = 0;

    for (const phone of phones) {
      try {
        const res = await fetch(`${WHATSAPP_BASE_URL}/${config.phone_number_id}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone.replace(/[^\d+]/g, ''),
            type: 'template',
            template: {
              name: config.notify_template_name,
              language: { code: config.notify_template_language || 'en_US' },
              components: [{
                type: 'body',
                parameters: [
                  { type: 'text', text: String(title).slice(0, 1024) },
                  { type: 'text', text: bodyText },
                ],
              }],
            },
          }),
        });
        const data = await res.json();
        if (res.ok && !data.error) sent++;
        else { failed++; console.warn(`[send-small-group-whatsapp-notify] send failed for a member:`, data.error?.message ?? data); }
      } catch (err) {
        failed++;
        console.warn('[send-small-group-whatsapp-notify] send threw for a member:', err);
      }
    }

    await admin.from('small_group_whatsapp_log').insert({ ...logRow, sent_count: sent, failed_count: failed });

    return json({ ok: true, sent, failed });
  } catch (err: any) {
    console.error('[send-small-group-whatsapp-notify] error:', err);
    return json({ error: err.message ?? 'Unexpected error' }, 500);
  }
});

// -- Crypto helper (must match whatsapp-save-credentials's scheme exactly) ----

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
    return encrypted; // dev fallback
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}
