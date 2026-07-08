// Supabase Edge Function: whatsapp-save-credentials
// Also handles: whatsapp-embedded-signup-complete, whatsapp-verify-connection,
//               whatsapp-get-templates, create-whatsapp-subscription
//
// Deploy: supabase functions deploy whatsapp-save-credentials
// (Deploy each action as its own function, or use a router pattern like below)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHATSAPP_API_VERSION = 'v20.0';
const WHATSAPP_BASE_URL    = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url    = new URL(req.url);
  const action = url.pathname.split('/').pop(); // last path segment = function name

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const body = await req.json();

    // ── Route by function name ─────────────────────────────────────────────
    if (action === 'whatsapp-save-credentials') {
      return await saveCredentials(supabase, body);
    }
    if (action === 'whatsapp-embedded-signup-complete') {
      return await embeddedSignupComplete(supabase, body);
    }
    if (action === 'whatsapp-verify-connection') {
      return await verifyConnection(supabase, body);
    }
    if (action === 'whatsapp-get-templates') {
      return await getTemplates(supabase, body);
    }
    if (action === 'create-whatsapp-subscription') {
      return await createSubscription(supabase, body);
    }

    return jsonError('Unknown action', 404);
  } catch (err: any) {
    console.error(`[${action}] error:`, err);
    return jsonError(err.message ?? 'Unexpected error', 500);
  }
});

// ── Save credentials (manual flow) ───────────────────────────────────────────

async function saveCredentials(supabase: any, body: any) {
  const {
    ministryId, waba_id, phone_number_id,
    access_token, phone_number_display, business_display_name,
  } = body;

  if (!ministryId || !waba_id || !phone_number_id || !access_token) {
    return jsonError('ministryId, waba_id, phone_number_id, and access_token are required', 400);
  }

  const encryptedToken = await encryptToken(access_token, Deno.env.get('ENCRYPTION_KEY') ?? '');

  await supabase
    .from('ministry_whatsapp_configs')
    .upsert({
      ministry_id:             ministryId,
      waba_id,
      phone_number_id,
      phone_number_display:    phone_number_display ?? '',
      business_display_name:   business_display_name ?? '',
      access_token_encrypted:  encryptedToken,
      access_token_last4:      access_token.slice(-4),
      connection_status:       'pending', // set to connected after verify
      verification_status:     'pending',
      updated_at:              new Date().toISOString(),
    }, { onConflict: 'ministry_id' });

  return jsonOk({ ok: true, message: 'Credentials saved. Run verify to confirm the connection.' });
}

// ── Embedded Signup completion (OAuth code exchange) ─────────────────────────

async function embeddedSignupComplete(supabase: any, body: any) {
  const { ministryId, wabaId, phoneNumberId, code } = body;

  if (!ministryId || !wabaId || !phoneNumberId || !code) {
    return jsonError('ministryId, wabaId, phoneNumberId and code are required', 400);
  }

  const META_APP_ID     = Deno.env.get('META_APP_ID');
  const META_APP_SECRET = Deno.env.get('META_APP_SECRET');

  if (!META_APP_ID || !META_APP_SECRET) {
    return jsonError('META_APP_ID and META_APP_SECRET not configured', 500);
  }

  // Exchange code for a user access token
  const tokenRes = await fetch(
    `${WHATSAPP_BASE_URL}/oauth/access_token?` +
    `client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&code=${code}`,
  );
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return jsonError(`Token exchange failed: ${tokenData.error?.message ?? 'no token'}`, 400);
  }

  const userToken = tokenData.access_token;

  // Get a system user token (long-lived) via business login
  // In production: exchange for a permanent system user token scoped to the WABA
  // For now we use the user token (short-lived — replace with system user flow in prod)
  const accessToken = userToken;

  // Fetch phone number details from Meta
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
    console.warn('Could not fetch phone details:', err);
  }

  const encryptedToken = await encryptToken(accessToken, Deno.env.get('ENCRYPTION_KEY') ?? '');

  await supabase
    .from('ministry_whatsapp_configs')
    .upsert({
      ministry_id:             ministryId,
      waba_id:                 wabaId,
      phone_number_id:         phoneNumberId,
      phone_number_display:    phoneDisplay,
      business_display_name:   businessName,
      access_token_encrypted:  encryptedToken,
      access_token_last4:      accessToken.slice(-4),
      connection_status:       'connected',
      verification_status:     'verified',
      last_verified_at:        new Date().toISOString(),
      updated_at:              new Date().toISOString(),
    }, { onConflict: 'ministry_id' });

  return jsonOk({
    ok: true,
    phoneDisplay,
    businessName,
    message: 'WhatsApp Business Account connected successfully.',
  });
}

// ── Verify connection ─────────────────────────────────────────────────────────

async function verifyConnection(supabase: any, body: any) {
  const { ministryId } = body;
  if (!ministryId) return jsonError('ministryId required', 400);

  const { data: config } = await supabase
    .from('ministry_whatsapp_configs')
    .select('*')
    .eq('ministry_id', ministryId)
    .single();

  if (!config) return jsonError('Config not found', 404);

  const accessToken = await decryptToken(config.access_token_encrypted, Deno.env.get('ENCRYPTION_KEY') ?? '');

  // Call Meta API to verify phone number is still active
  const res = await fetch(
    `${WHATSAPP_BASE_URL}/${config.phone_number_id}?fields=id,display_phone_number,verified_name,quality_rating,account_mode&access_token=${accessToken}`,
  );
  const data = await res.json();

  if (!res.ok || data.error) {
    await supabase
      .from('ministry_whatsapp_configs')
      .update({ connection_status: 'error', updated_at: new Date().toISOString() })
      .eq('ministry_id', ministryId);

    return jsonError(`Meta API error: ${data.error?.message ?? 'Unknown'}`, 400);
  }

  // Update verified details from Meta
  await supabase
    .from('ministry_whatsapp_configs')
    .update({
      phone_number_display:  data.display_phone_number ?? config.phone_number_display,
      business_display_name: data.verified_name ?? config.business_display_name,
      connection_status:     'connected',
      verification_status:   'verified',
      last_verified_at:      new Date().toISOString(),
      updated_at:            new Date().toISOString(),
    })
    .eq('ministry_id', ministryId);

  return jsonOk({
    ok: true,
    phoneDisplay:    data.display_phone_number,
    businessName:    data.verified_name,
    qualityRating:   data.quality_rating,
    accountMode:     data.account_mode,
  });
}

// ── Get templates ─────────────────────────────────────────────────────────────

async function getTemplates(supabase: any, body: any) {
  const { ministryId } = body;
  if (!ministryId) return jsonError('ministryId required', 400);

  const { data: config } = await supabase
    .from('ministry_whatsapp_configs')
    .select('waba_id, access_token_encrypted, provider, twilio_account_sid, twilio_auth_token_encrypted, twilio_from_number')
    .eq('ministry_id', ministryId)
    .single();

  if (!config) return jsonError('Config not found', 404);

  const provider = config.provider ?? 'meta';
  const encKey   = Deno.env.get('ENCRYPTION_KEY') ?? '';

  // ── Twilio Content API ──────────────────────────────────────────────────
  if (provider === 'twilio') {
    // Use platform-level Twilio credentials (same as broadcast function)
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') ?? config.twilio_account_sid;
    const authToken  = config.twilio_auth_token_encrypted
      ? await decryptToken(config.twilio_auth_token_encrypted, encKey)
      : Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!accountSid || !authToken) {
      return jsonError('Twilio credentials not configured', 400);
    }

    const credentials = btoa(`${accountSid}:${authToken}`);

    const res = await fetch(
      'https://content.twilio.com/v1/Content',
      { headers: { 'Authorization': `Basic ${credentials}` } }
    );
    const data = await res.json();

    if (!res.ok) {
      return jsonError(`Could not fetch Twilio templates: ${data.message ?? 'Unknown'}`, 400);
    }

    // Normalize Twilio Content templates to match the Meta template shape
    const templates = (data.contents ?? []).map((t: any) => {
      // Twilio stores template body under types.twilio/call-to-action or twilio/text
      const types    = t.types ?? {};
      const bodyText = types['twilio/text']?.body
        ?? types['twilio/call-to-action']?.body
        ?? types['twilio/quick-reply']?.body
        ?? '';

      return {
        id:         t.sid,
        name:       t.friendly_name,
        status:     t.approval_requests?.status?.toUpperCase() ?? 'APPROVED',
        category:   'UTILITY',
        language:   t.language ?? 'en',
        body_text:  bodyText,
        content_sid: t.sid,   // extra field for sending via ContentSid
        components:  [],
      };
    });

    // Only return approved templates
    return jsonOk({ templates: templates.filter((t: any) => t.status === 'APPROVED') });
  }

  // ── Meta Graph API (default) ────────────────────────────────────────────
  const accessToken = await decryptToken(config.access_token_encrypted, encKey);

  const res = await fetch(
    `${WHATSAPP_BASE_URL}/${config.waba_id}/message_templates?fields=id,name,status,category,language,components&access_token=${accessToken}`,
  );
  const data = await res.json();

  if (!res.ok || data.error) {
    return jsonError(`Could not fetch templates: ${data.error?.message ?? 'Unknown'}`, 400);
  }

  // Normalize template list
  const templates = (data.data ?? []).map((t: any) => {
    const bodyComponent = t.components?.find((c: any) => c.type === 'BODY');
    return {
      id:         t.id,
      name:       t.name,
      status:     t.status,
      category:   t.category,
      language:   t.language,
      body_text:  bodyComponent?.text ?? '',
      content_sid: null,
      components:  t.components,
    };
  });

  return jsonOk({ templates });
}

// ── Create WhatsApp subscription (Stripe Checkout) ────────────────────────────

async function createSubscription(supabase: any, body: any) {
  const {
    ministryId, plan, monthlyUsd, setupUsd,
    setupAlreadyPaid, successUrl, cancelUrl,
  } = body;

  const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

  // Dev mode
  if (!STRIPE_SECRET_KEY) {
    await supabase
      .from('ministry_whatsapp_configs')
      .upsert({
        ministry_id:    ministryId,
        whatsapp_plan:  plan,
        plan_status:    'active',
        setup_fee_paid: true,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'ministry_id' });

    return jsonOk({
      checkoutUrl: `${successUrl}&wa_plan_simulated=1`,
      simulated:   true,
    });
  }

  // Build line items
  const lineItems: string[][] = [];
  let idx = 0;

  // Monthly subscription
  lineItems.push(
    [`line_items[${idx}][price_data][currency]`, 'usd'],
    [`line_items[${idx}][price_data][unit_amount]`, String(Math.round(monthlyUsd * 100))],
    [`line_items[${idx}][price_data][recurring][interval]`, 'month'],
    [`line_items[${idx}][price_data][product_data][name]`, `WhatsApp ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan — ${ministryId}`],
    [`line_items[${idx}][quantity]`, '1'],
  );
  idx++;

  // One-time setup fee (if not already paid)
  if (!setupAlreadyPaid && setupUsd > 0) {
    lineItems.push(
      [`line_items[${idx}][price_data][currency]`, 'usd'],
      [`line_items[${idx}][price_data][unit_amount]`, String(Math.round(setupUsd * 100))],
      [`line_items[${idx}][price_data][product_data][name]`, 'WhatsApp Business Account Setup Fee'],
      [`line_items[${idx}][quantity]`, '1'],
    );
    idx++;
  }

  const params = new URLSearchParams([
    ['mode',            'subscription'],
    ['success_url',     successUrl],
    ['cancel_url',      cancelUrl],
    ['metadata[ministryId]',  ministryId],
    ['metadata[plan]',        plan],
    ['metadata[type]',        'whatsapp_subscription'],
    // Also set on the subscription itself so renewal webhooks carry ministryId
    ['subscription_data[metadata][ministryId]', ministryId],
    ['subscription_data[metadata][plan]',       plan],
    ...lineItems.flat().reduce((acc: string[][], v, i, arr) => {
      if (i % 2 === 0) acc.push([arr[i] as string, arr[i + 1] as string]);
      return acc;
    }, []),
  ]);

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method:  'POST',
    headers: {
      'Authorization':  `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type':   'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const session = await stripeRes.json();
  if (!stripeRes.ok) return jsonError(session?.error?.message ?? 'Stripe error', 400);

  // Save pending subscription record
  await supabase
    .from('ministry_whatsapp_configs')
    .upsert({
      ministry_id:    ministryId,
      whatsapp_plan:  plan,
      plan_status:    'pending',
      setup_fee_paid: setupAlreadyPaid,
      stripe_session_id: session.id,
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'ministry_id' });

  return jsonOk({ checkoutUrl: session.url, sessionId: session.id });
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

async function encryptToken(plaintext: string, keyHex: string): Promise<string> {
  if (!keyHex) return plaintext; // dev fallback
  try {
    const keyData = hexToBytes(keyHex.slice(0, 64));
    const key     = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv      = crypto.getRandomValues(new Uint8Array(12));
    const enc     = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
    const combined = new Uint8Array(12 + enc.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(enc), 12);
    return bytesToHex(combined);
  } catch {
    return plaintext;
  }
}

async function decryptToken(encrypted: string, keyHex: string): Promise<string> {
  if (!keyHex || !encrypted) return encrypted;
  try {
    const keyData   = hexToBytes(keyHex.slice(0, 64));
    const key       = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const combined  = hexToBytes(encrypted);
    const iv        = combined.slice(0, 12);
    const data      = combined.slice(12);
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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
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

/*
DEPLOY AS SEPARATE FUNCTIONS (one file each):
  supabase functions deploy whatsapp-save-credentials
  supabase functions deploy whatsapp-embedded-signup-complete
  supabase functions deploy whatsapp-verify-connection
  supabase functions deploy whatsapp-get-templates
  supabase functions deploy create-whatsapp-subscription

ENVIRONMENT SECRETS:
  META_APP_ID         Your Meta app ID (from developers.facebook.com)
  META_APP_SECRET     Your Meta app secret
  STRIPE_SECRET_KEY   Stripe secret key
  ENCRYPTION_KEY      32-byte hex key for AES-256-GCM token encryption
                      Generate: openssl rand -hex 32

DATABASE TABLE REQUIRED:
  ministry_whatsapp_configs (see migration below)

FRONTEND ENV:
  VITE_META_APP_ID    Same Meta app ID (exposed to browser for Embedded Signup OAuth URL)
*/
