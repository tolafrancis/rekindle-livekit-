// Supabase Edge Function: whatsapp-get-templates
// =====================================================================
// Powers the "Templates" tab in MinistryWhatsAppConnect.tsx — lists a
// connected ministry's approved/pending WhatsApp message templates from
// the Meta Graph API.
//
// Split out of the combined whatsapp-save-credentials-function.ts router
// into its own deployable function — it was never deployed under this
// name before, so the Templates tab's refresh always 404'd.
//
// Request:  POST { ministryId }
// Response: { templates: [{ id, name, status, category, language, body_text, components }] }
//
// Secrets: ENCRYPTION_KEY (same scheme as the other whatsapp-* functions).
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
    if (!isAdmin) return json({ error: 'Not authorized to view templates for this ministry' }, 403);

    const { data: config } = await admin
      .from('ministry_whatsapp_configs')
      .select('waba_id, access_token_encrypted')
      .eq('ministry_id', ministryId)
      .single();

    if (!config) return json({ error: 'Config not found' }, 404);
    if (!config.waba_id || !config.access_token_encrypted) {
      return json({ templates: [] });
    }

    const accessToken = await decryptToken(config.access_token_encrypted, Deno.env.get('ENCRYPTION_KEY') ?? '');

    const res = await fetch(
      `${WHATSAPP_BASE_URL}/${config.waba_id}/message_templates?fields=id,name,status,category,language,components&access_token=${accessToken}`,
    );
    const data = await res.json();

    if (!res.ok || data.error) {
      return json({ error: `Could not fetch templates: ${data.error?.message ?? 'Unknown'}` }, 400);
    }

    const templates = (data.data ?? []).map((t: any) => {
      const bodyComponent = t.components?.find((c: any) => c.type === 'BODY');
      return {
        id: t.id,
        name: t.name,
        status: t.status,
        category: t.category,
        language: t.language,
        body_text: bodyComponent?.text ?? '',
        components: t.components,
      };
    });

    return json({ templates });
  } catch (err: any) {
    console.error('[whatsapp-get-templates] error:', err);
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
