// Supabase Edge Function: whatsapp-embedded-signup-complete
// =====================================================================
// Finishes Meta's WhatsApp Embedded Signup OAuth flow — called by
// MinistryWhatsAppConnect.tsx's `postMessage` handler once the Facebook
// popup reports back a waba_id + phone_number_id + short-lived `code`.
// Exchanges the code for an access token, reads the verified phone/business
// details from the Graph API, encrypts the token, and upserts the ministry's
// ministry_whatsapp_configs row as connected.
//
// Split out of the combined whatsapp-save-credentials-function.ts router
// (see that file's header) into its own deployable function — it was never
// deployed under this name before, so completing Embedded Signup always
// 404'd even when VITE_META_APP_ID was configured.
//
// Request:  POST { ministryId, wabaId, phoneNumberId, code }
// Response: { ok, phoneDisplay, businessName }
//
// Secrets: META_APP_ID, META_APP_SECRET, ENCRYPTION_KEY (same AES-256-GCM
// scheme/key as whatsapp-save-credentials, so either flow can write a token
// whatsapp-verify-connection / whatsapp-get-templates can later decrypt).
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
    let { ministryId, wabaId, phoneNumberId, code } = await req.json();
    if (!ministryId || !code) {
      return json({ error: 'ministryId and code are required' }, 400);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const META_APP_ID = Deno.env.get('META_APP_ID');
    const META_APP_SECRET = Deno.env.get('META_APP_SECRET');

    // Authorize: caller must administer this ministry.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: isAdmin } = await admin.rpc('is_group_admin', { p_ministry_id: ministryId, p_user_id: user.id });
    if (!isAdmin) return json({ error: 'Not authorized to connect WhatsApp for this ministry' }, 403);

    if (!META_APP_ID || !META_APP_SECRET) {
      return json({ error: 'META_APP_ID and META_APP_SECRET are not configured' }, 500);
    }

    // Exchange the OAuth code for a user access token.
    const tokenRes = await fetch(
      `${WHATSAPP_BASE_URL}/oauth/access_token?` +
      `client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&code=${encodeURIComponent(code)}`,
    );
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return json({ error: `Token exchange failed: ${tokenData.error?.message ?? 'no token'}` }, 400);
    }

    // NOTE: this is the short-lived user token. Production should exchange it
    // for a long-lived system-user token scoped to the WABA before storing it
    // (same caveat the original combined router carried) — tracked as a
    // follow-up, not silently fixed here since it needs a Meta System User
    // set up on the Business Manager side first.
    const accessToken = tokenData.access_token;

    // Auto-discover WABA ID and Phone Number ID from Meta Graph API if omitted
    if (!wabaId || !phoneNumberId) {
      try {
        const wabaRes = await fetch(`${WHATSAPP_BASE_URL}/me/whatsapp_business_accounts?access_token=${accessToken}`);
        const wabaData = await wabaRes.json();
        if (wabaData.data && wabaData.data.length > 0) {
          wabaId = wabaId || wabaData.data[0].id;
          const phoneRes = await fetch(`${WHATSAPP_BASE_URL}/${wabaId}/phone_numbers?access_token=${accessToken}`);
          const phoneData = await phoneRes.json();
          if (phoneData.data && phoneData.data.length > 0) {
            phoneNumberId = phoneNumberId || phoneData.data[0].id;
          }
        }
      } catch (err) {
        console.warn('[whatsapp-embedded-signup-complete] could not auto-discover WABA/Phone ID:', err);
      }
    }

    if (!wabaId || !phoneNumberId) {
      return json({ error: 'Could not resolve WABA ID or Phone Number ID from Meta.' }, 400);
    }

    let phoneDisplay = '';
    let businessName = '';
    try {
      const phoneRes = await fetch(
        `${WHATSAPP_BASE_URL}/${phoneNumberId}?fields=display_phone_number,verified_name&access_token=${accessToken}`,
      );
      const phoneData = await phoneRes.json();
      phoneDisplay = phoneData.display_phone_number ?? '';
      businessName = phoneData.verified_name ?? '';
    } catch (err) {
      console.warn('[whatsapp-embedded-signup-complete] could not fetch phone details:', err);
    }

    const encryptedToken = await encryptToken(accessToken, Deno.env.get('ENCRYPTION_KEY') ?? '');

    await admin
      .from('ministry_whatsapp_configs')
      .upsert({
        ministry_id: ministryId,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        phone_number_display: phoneDisplay,
        business_display_name: businessName,
        access_token_encrypted: encryptedToken,
        access_token_last4: accessToken.slice(-4),
        connection_status: 'connected',
        verification_status: 'verified',
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'ministry_id' });

    return json({
      ok: true,
      phoneDisplay,
      businessName,
      message: 'WhatsApp Business Account connected successfully.',
    });
  } catch (err: any) {
    console.error('[whatsapp-embedded-signup-complete] error:', err);
    return json({ error: err.message ?? 'Unexpected error' }, 500);
  }
});

// -- Crypto helper (must match whatsapp-save-credentials's scheme exactly) ----

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
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
