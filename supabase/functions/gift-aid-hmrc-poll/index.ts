// supabase/functions/gift-aid-hmrc-poll/index.ts
// =============================================================================
// Gift Aid — HMRC poll / resume (Transaction Engine / GovTalk DSP)
// =============================================================================
// ⚠ SELF-CONTAINED for Supabase DASHBOARD PASTE deploy — no local imports.
//   Companion to gift-aid-hmrc-submit. When a submission takes longer than the
//   submit function's budget it returns stage:'poll-timeout' and the claim sits
//   as `submitted` with its HMRC CorrelationID in hmrc_submission_reference.
//   This re-polls that CorrelationID for the final receipt (accept) or business
//   errors (reject), then deletes the message to complete the DSP handshake.
//
//   The control-envelope + parser below are DUPLICATED from
//   gift-aid-hmrc-submit/index.ts (paste-deploy can't share files). 👉 Keep the
//   two copies byte-identical, or the poll/delete handshake will diverge.
//
// ⚠ `environment` must match the environment the claim was ORIGINALLY submitted
//   to — a correlation id from the test gateway is unknown to the live gateway.
//
// Secrets: same as gift-aid-hmrc-submit.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOVTALK_NAMESPACE = 'http://www.govtalk.gov.uk/CM/envelope';

const CONFIG = {
  vendorId: Deno.env.get('HMRC_VENDOR_ID') || '9515',
  productName: Deno.env.get('HMRC_PRODUCT_NAME') || 'Rekindle Digital Missions',
  productVersion: Deno.env.get('HMRC_PRODUCT_VERSION') || '1.0',
  urlTest: Deno.env.get('HMRC_TE_URL_TEST') || 'https://test-transaction-engine.tax.service.gov.uk/submission',
  urlLive: Deno.env.get('HMRC_TE_URL_LIVE') || Deno.env.get('HMRC_SUBMIT_URL') || 'https://transaction-engine.tax.service.gov.uk/submission',
  pollBudgetMs: Number(Deno.env.get('HMRC_POLL_BUDGET_MS') || '45000'),
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const xeText = (v: unknown): string =>
  (v == null ? '' : String(v))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\r/g, '&#xD;');

// == GovTalk control envelopes + parser (byte-identical to submit) ============
interface ChannelRouting { vendorId: string; productName: string; productVersion: string; }
interface ControlOpts {
  qualifier: 'poll' | 'request'; func: 'submit' | 'delete'; correlationId: string;
  test: boolean; senderId: string; password: string; charId: string; channel: ChannelRouting;
}
function buildControlMessage(o: ControlOpts): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<GovTalkMessage xmlns="${GOVTALK_NAMESPACE}">` +
      `<EnvelopeVersion>2.0</EnvelopeVersion>` +
      `<Header><MessageDetails>` +
        `<Class>HMRC-CHAR-CLM</Class><Qualifier>${o.qualifier}</Qualifier><Function>${o.func}</Function>` +
        `<CorrelationID>${xeText(o.correlationId)}</CorrelationID>` +
        `<Transformation>XML</Transformation>` +
        `<GatewayTest>${o.test ? '1' : '0'}</GatewayTest>` +
      `</MessageDetails>` +
      `<SenderDetails><IDAuthentication>` +
        `<SenderID>${xeText(o.senderId)}</SenderID>` +
        `<Authentication><Method>clear</Method><Role>principal</Role>` +
        `<Value>${xeText(o.password)}</Value></Authentication>` +
      `</IDAuthentication></SenderDetails></Header>` +
      `<GovTalkDetails>` +
        `<Keys><Key Type="CHARID">${xeText(o.charId)}</Key></Keys>` +
        `<ChannelRouting><Channel>` +
          `<URI>${xeText(o.channel.vendorId)}</URI><Product>${xeText(o.channel.productName)}</Product>` +
          `<Version>${xeText(o.channel.productVersion)}</Version>` +
        `</Channel></ChannelRouting>` +
      `</GovTalkDetails>` +
      `<Body/>` +
    `</GovTalkMessage>`
  );
}

interface ParsedResponse {
  qualifier: string; correlationId: string | null; responseEndPoint: string | null;
  pollInterval: number | null; errors: string[]; irmarkReceipt: string | null; successMessage: string | null;
}
const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, 'i'));
  return m ? m[1].trim() : null;
};
function parseGovTalk(xml: string): ParsedResponse {
  const repEnd = xml.match(/<(?:\w+:)?ResponseEndPoint[^>]*>([\s\S]*?)<\/(?:\w+:)?ResponseEndPoint>/i);
  const pollAttr = xml.match(/<(?:\w+:)?ResponseEndPoint[^>]*\bPollInterval="(\d+)"/i);
  const errors: string[] = [];
  const errBlock = xml.match(/<(?:\w+:)?GovTalkErrors>([\s\S]*?)<\/(?:\w+:)?GovTalkErrors>/i);
  if (errBlock) {
    const re = /<(?:\w+:)?Error>([\s\S]*?)<\/(?:\w+:)?Error>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(errBlock[1])) !== null) {
      const num = tag(m[1], 'Number');
      const text = tag(m[1], 'Text') || tag(m[1], 'RaisedBy') || 'Unknown HMRC error';
      errors.push(num ? `[${num}] ${text}` : text);
    }
  }
  return {
    qualifier: (tag(xml, 'Qualifier') || '').toLowerCase(),
    correlationId: tag(xml, 'CorrelationID'),
    responseEndPoint: repEnd ? repEnd[1].trim() : null,
    pollInterval: pollAttr ? Number(pollAttr[1]) : null,
    errors,
    irmarkReceipt: tag(xml, 'IRmarkReceipt') || tag(xml, 'IRmark'),
    successMessage: tag(xml, 'Message'),
  };
}
async function postGovTalk(url: string, xml: string): Promise<ParsedResponse> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=UTF-8' }, body: xml });
  return parseGovTalk(await res.text());
}

// == main =====================================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startedAt = Date.now();

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  let input: { claimId?: string; gatewayUserId?: string; gatewayPassword?: string; environment?: string };
  try { input = await req.json(); } catch { return json({ ok: false, error: 'Invalid JSON body' }, 400); }

  const claimId = (input.claimId || '').trim();
  const environment = input.environment === 'live' ? 'live' : 'test';
  const senderId = (input.gatewayUserId || '').trim() || Deno.env.get('HMRC_GATEWAY_SENDER_ID') || '';
  const password = input.gatewayPassword || Deno.env.get('HMRC_GATEWAY_PASSWORD') || '';
  if (!claimId) return json({ ok: false, error: 'claimId is required.' }, 400);
  if (!senderId || !password) return json({ ok: false, error: 'Government Gateway user ID and password are required.' }, 400);

  // --- authenticate + authorize via RLS ---
  const authHeader = req.headers.get('Authorization') || '';
  const asUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await asUser.auth.getUser();
  if (!userData?.user) return json({ ok: false, error: 'Not authenticated.' }, 401);

  const { data: claim, error: claimErr } = await asUser
    .from('gift_aid_claims').select('*').eq('id', claimId).maybeSingle();
  if (claimErr || !claim) return json({ ok: false, error: 'Claim not found or access denied.' }, 403);

  // Terminal states: nothing to poll.
  if (claim.status === 'accepted') return json({ ok: true, environment, correlationId: claim.hmrc_submission_reference, message: 'Claim already accepted by HMRC.', terminal: true });
  if (claim.status === 'rejected') return json({ ok: false, stage: 'response', environment, correlationId: claim.hmrc_submission_reference, error: claim.response_notes || 'Claim was rejected by HMRC.', terminal: true });

  const correlationId = (claim.hmrc_submission_reference || '').trim();
  if (!correlationId) return json({ ok: false, error: 'This claim has no HMRC correlation ID to poll. Submit it first.' }, 400);

  const svc = createClient(supabaseUrl, serviceKey);
  const { data: settings } = await svc
    .from('ministry_gift_aid_settings').select('hmrc_reference')
    .eq('ministry_id', claim.ministry_id).maybeSingle();
  const charId = (settings?.hmrc_reference || '').trim();
  if (!charId) return json({ ok: false, error: 'Missing HMRC charity reference in Gift Aid settings.' }, 400);

  const test = environment !== 'live';
  const channel: ChannelRouting = { vendorId: CONFIG.vendorId, productName: CONFIG.productName, productVersion: CONFIG.productVersion };
  const base = environment === 'live' ? CONFIG.urlLive : CONFIG.urlTest;
  let pollUrl = base.replace(/\/submission\/?$/, '/poll');
  let waitMs = 3000;

  const audit = (event_type: string, event_data: Record<string, unknown>) =>
    svc.from('gift_aid_audit_log').insert({
      ministry_id: claim.ministry_id, actor_user_id: userData.user!.id, event_type, event_data,
    }).then(() => {}, () => {});

  while (true) {
    if (Date.now() - startedAt + waitMs > CONFIG.pollBudgetMs) {
      return json({
        ok: false, stage: 'poll-timeout', environment, correlationId,
        message: 'Still awaiting HMRC confirmation. The claim remains submitted — try again shortly.',
      });
    }
    await sleep(waitMs);

    let poll: ParsedResponse;
    try {
      poll = await postGovTalk(pollUrl, buildControlMessage({ qualifier: 'poll', func: 'submit', correlationId, test, senderId, password, charId, channel }));
    } catch (e) {
      return json({ ok: false, stage: 'poll-timeout', environment, correlationId, message: `Polling failed: ${e instanceof Error ? e.message : String(e)}. The claim remains submitted.` });
    }

    if (poll.qualifier === 'acknowledgement') {
      if (poll.responseEndPoint) pollUrl = poll.responseEndPoint;
      waitMs = Math.max(1000, (poll.pollInterval || 3) * 1000);
      continue; // still processing
    }

    if (poll.qualifier === 'error' || poll.errors.length > 0) {
      await svc.from('gift_aid_claims').update({ status: 'rejected', response_notes: poll.errors.join(' | ') || 'HMRC returned an error.', updated_at: new Date().toISOString() }).eq('id', claimId);
      await audit('claim_submission_rejected', { environment, correlationId, errors: poll.errors, via: 'poll' });
      await postGovTalk(pollUrl, buildControlMessage({ qualifier: 'request', func: 'delete', correlationId, test, senderId, password, charId, channel })).catch(() => {});
      return json({ ok: false, stage: 'response', environment, correlationId, error: poll.errors.join(' | ') || 'HMRC rejected the submission.' });
    }

    // qualifier === 'response' → success
    const receiptMark = poll.irmarkReceipt || '';
    await svc.from('gift_aid_claims').update({
      status: 'accepted', hmrc_submission_reference: correlationId,
      response_notes: poll.successMessage ? `${poll.successMessage}${receiptMark ? ` (IRmark ${receiptMark})` : ''}` : `Accepted.${receiptMark ? ` IRmark ${receiptMark}` : ''}`,
      updated_at: new Date().toISOString(),
    }).eq('id', claimId);
    await audit('claim_accepted', { environment, correlationId, irmark: receiptMark, message: poll.successMessage, via: 'poll' });
    await postGovTalk(pollUrl, buildControlMessage({ qualifier: 'request', func: 'delete', correlationId, test, senderId, password, charId, channel })).catch(() => {});

    return json({ ok: true, environment, correlationId, irMark: receiptMark || undefined, message: poll.successMessage || 'Claim accepted by HMRC.' });
  }
});
