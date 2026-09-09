// Supabase Edge Function: whatsapp-verify-connection
// =====================================================================
// The "Verify" button in MinistryWhatsAppConnect.tsx — re-checks a
// ministry's connected WABA phone number against the Meta Graph API and
// refreshes the stored display name / quality rating / connection status.
//
// Split out of the combined whatsapp-save-credentials-function.ts router
// into its own deployable function — it was never deployed under this
// name before, so "Verify" always 404'd.
//
// Request:  POST { ministryId }
// Response: { ok, phoneDisplay, businessName, qualityRating, accountMode }
//
// Secrets: ENCRYPTION_KEY (same scheme as whatsapp-save-credentials /
// whatsapp-embedded-signup-complete — decrypts whichever flow wrote the
// stored token).
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
    const { ministryId } = await req.json();
    if (!ministryId) return json({ error: 'ministryId required' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: isAdmin } = await admin.rpc('is_group_admin', { p_ministry_id: ministryId, p_user_id: user.id });
    if (!isAdmin) return json({ error: 'Not authorized to verify WhatsApp for this ministry' }, 403);

    const { data: config } = await admin
      .from('ministry_whatsapp_configs')
      .select('*')
      .eq('ministry_id', ministryId)
      .single();

    if (!config) return json({ error: 'Config not found' }, 404);
    if (!config.phone_number_id || !config.access_token_encrypted) {
      return json({ error: 'No WhatsApp Business Account connected yet' }, 400);
    }

    const accessToken = await decryptToken(config.access_token_encrypted, Deno.env.get('ENCRYPTION_KEY') ?? '');

    const res = await fetch(
      `${WHATSAPP_BASE_URL}/${config.phone_number_id}?fields=id,display_phone_number,verified_name,quality_rating,account_mode&access_token=${accessToken}`,
    );
    const data = await res.json();

    if (!res.ok || data.error) {
      await admin
        .from('ministry_whatsapp_configs')
        .update({ connection_status: 'error', updated_at: new Date().toISOString() })
        .eq('ministry_id', ministryId);

      return json({ error: `Meta API error: ${data.error?.message ?? 'Unknown'}` }, 400);
    }

    await admin
      .from('ministry_whatsapp_configs')
      .update({
        phone_number_display: data.display_phone_number ?? config.phone_number_display,
        business_display_name: data.verified_name ?? config.business_display_name,
        connection_status: 'connected',
        verification_status: 'verified',
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('ministry_id', ministryId);

    return json({
      ok: true,
      phoneDisplay: data.display_phone_number,
      businessName: data.verified_name,
      qualityRating: data.quality_rating,
      accountMode: data.account_mode,
    });
  } catch (err: any) {
    console.error('[whatsapp-verify-connection] error:', err);
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
