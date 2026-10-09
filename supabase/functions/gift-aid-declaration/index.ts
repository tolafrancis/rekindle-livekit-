// =============================================================================
// Edge Function: gift-aid-declaration
// -----------------------------------------------------------------------------
// Records a UK Gift Aid declaration as immutable evidence. Runs with the service
// role so it can write the declaration, refresh the donor's rollup status, and
// append an audit row in one place — and so the donor IP is captured from the
// request headers (server-side, trustworthy) rather than trusting the client.
//
// Deploy as a Supabase Edge Function named "gift-aid-declaration".
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (provided by Supabase).
//
// verify_jwt is OFF (supabase/config.toml): donors declaring from the public
// /gift-aid/:slug page or a kiosk aren't signed in.
//
// Copied into the repo 2026-10-10 from the deployed version (v86), unchanged.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

function clientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    null
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server not configured' }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const {
    ministryId,
    donorUserId = null,
    donorEmail,
    title = null,
    firstName,
    lastName,
    houseNumberOrName = null,
    addressLine1 = null,
    addressLine2 = null,
    city = null,
    postcode,
    countryCode = 'GB',
    isTaxpayerConfirmed = true,
    declarationText,
    declarationVersion,
    source = 'donation_form',
    userAgent = null,
    platform = null,
  } = body || {};

  // Minimal HMRC-required validation.
  if (!ministryId || !donorEmail || !firstName || !lastName || !postcode) {
    return json(
      { error: 'Missing required fields: ministryId, donorEmail, firstName, lastName, postcode' },
      400,
    );
  }
  if (!declarationText || !declarationVersion) {
    return json({ error: 'Missing declaration text/version' }, 400);
  }
  if (!isTaxpayerConfirmed) {
    return json({ error: 'Taxpayer confirmation is required for Gift Aid' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Gift Aid must be enabled for this ministry.
  const { data: settings, error: settingsErr } = await supabase
    .from('ministry_gift_aid_settings')
    .select('enabled')
    .eq('ministry_id', ministryId)
    .maybeSingle();

  if (settingsErr) {
    return json({ error: 'Could not verify Gift Aid settings' }, 500);
  }
  if (!settings || !settings.enabled) {
    return json({ error: 'Gift Aid is not enabled for this ministry' }, 400);
  }

  const ip = clientIp(req);

  // 1) Insert the immutable declaration.
  const { data: decl, error: declErr } = await supabase
    .from('gift_aid_declarations')
    .insert({
      ministry_id: ministryId,
      donor_user_id: donorUserId,
      donor_email: donorEmail,
      title,
      first_name: firstName,
      last_name: lastName,
      house_number_or_name: houseNumberOrName,
      address_line1: addressLine1,
      address_line2: addressLine2,
      city,
      postcode,
      country_code: countryCode,
      is_taxpayer_confirmed: isTaxpayerConfirmed,
      declaration_text: declarationText,
      declaration_version: declarationVersion,
      status: 'active',
      source,
      captured_ip: ip,
      user_agent: userAgent,
      platform,
    })
    .select('id')
    .single();

  if (declErr || !decl) {
    console.error('declaration insert failed:', declErr);
    return json({ error: declErr?.message || 'Failed to record declaration' }, 500);
  }

  // 2) Refresh the donor rollup status (future donations inherit from here).
  const { error: statusErr } = await supabase
    .from('donor_gift_aid_status')
    .upsert(
      {
        ministry_id: ministryId,
        donor_user_id: donorUserId,
        donor_email: donorEmail,
        status: 'active',
        current_declaration_id: decl.id,
        effective_from: new Date().toISOString().slice(0, 10),
        effective_to: null,
      },
      { onConflict: 'ministry_id,donor_email' },
    );
  if (statusErr) console.warn('donor_gift_aid_status upsert failed:', statusErr);

  // 3) Append the audit row (best-effort).
  const { error: auditErr } = await supabase.from('gift_aid_audit_log').insert({
    ministry_id: ministryId,
    declaration_id: decl.id,
    actor_user_id: donorUserId,
    event_type: 'declaration_created',
    event_data: { source, via: 'edge_function' },
    captured_ip: ip,
    user_agent: userAgent,
  });
  if (auditErr) console.warn('gift_aid_audit_log insert failed:', auditErr);

  return json({ ok: true, declarationId: decl.id });
});
