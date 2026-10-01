// Supabase Edge Function: whatsapp-save-credentials
// =====================================================================
// The "Save Credentials" button on MinistryWhatsAppConnect.tsx's manual
// entry modal ("Enter Credentials Manually") — for ministries who created
// their own separate Meta app rather than using Embedded Signup.
//
// Split out of the combined whatsapp-save-credentials-function.ts router
// into its own deployable function, matching how its four siblings
// (whatsapp-embedded-signup-complete, whatsapp-verify-connection,
// whatsapp-get-templates, create-whatsapp-subscription) were already split
// out — see supabase/config.toml's header comment on that group. The
// previous deployment of this specific action (found deployed outside this
// repo's tracked layout, per that same comment) had verify_jwt off and NO
// in-function authorization check at all: any caller who knew a ministryId
// could overwrite that ministry's stored WhatsApp credentials. Closed here
// by requiring a real signed-in ministry admin, same as every sibling.
//
// Also now accepts an App Secret (Settings -> Basic in the ministry's own
// Meta app dashboard) alongside the WABA ID / Phone Number ID / access
// token already collected — needed so whatsapp-webhook can verify
// X-Hub-Signature-256 on this ministry's inbound messages. Ministries
// connected via Embedded Signup don't need this: their WABA lives under
// Rekindle's own app, already covered by the shared META_APP_SECRET.
//
// Request:  POST { ministryId, waba_id, phone_number_id, access_token,
//                   phone_number_display?, business_display_name?, app_secret? }
// Response: { ok, message }
//
// Secrets: ENCRYPTION_KEY (same AES-256-GCM scheme as
// whatsapp-embedded-signup-complete / whatsapp-verify-connection, so
// either flow can write a token/secret the others can later decrypt).
// =====================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const {
      ministryId, waba_id, phone_number_id, access_token,
      phone_number_display, business_display_name, app_secret,
    } = await req.json();

    if (!ministryId || !waba_id || !phone_number_id || !access_token) {
      return json({ error: 'ministryId, waba_id, phone_number_id, and access_token are required' }, 400);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Authorize: caller must administer this ministry (same pattern as every
    // sibling in this group — see ministry-checkout for the original).
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: isAdmin } = await admin.rpc('is_group_admin', { p_ministry_id: ministryId, p_user_id: user.id });
    if (!isAdmin) return json({ error: 'Not authorized to manage WhatsApp for this ministry' }, 403);

    const encKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
    const encryptedToken = await encryptToken(access_token, encKey);
    const encryptedAppSecret = app_secret ? await encryptToken(app_secret, encKey) : null;

    await admin
      .from('ministry_whatsapp_configs')
      .upsert({
        ministry_id: ministryId,
        waba_id,
        phone_number_id,
        phone_number_display: phone_number_display ?? '',
        business_display_name: business_display_name ?? '',
        access_token_encrypted: encryptedToken,
        access_token_last4: access_token.slice(-4),
        app_secret_encrypted: encryptedAppSecret,
        connection_status: 'pending', // set to connected after verify
        verification_status: 'pending',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'ministry_id' });

    return json({ ok: true, message: 'Credentials saved. Run verify to confirm the connection.' });
  } catch (err: any) {
    console.error('[whatsapp-save-credentials] error:', err);
    return json({ error: err.message ?? 'Unexpected error' }, 500);
  }
});

// -- Crypto helper (must match whatsapp-embedded-signup-complete's scheme exactly) --

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
