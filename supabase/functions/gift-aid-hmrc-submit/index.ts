// supabase/functions/gift-aid-hmrc-submit/index.ts
// =============================================================================
// Gift Aid — HMRC Charities Online submission (Transaction Engine / GovTalk)
// =============================================================================
// ⚠ SELF-CONTAINED for Supabase DASHBOARD PASTE deploy — no local imports.
//   The R68 v2 builder + IRmark below are the LTS-VERIFIED logic. The SAME bytes
//   also live in src/lib/giftAid (frontend, via supabase/functions/_shared/
//   r68Builder.ts + giftAidEnvelope.ts) for the "R68 XML (LTS)" export, and the
//   control/parse helpers are duplicated in gift-aid-hmrc-poll/index.ts.
//   👉 If you change the builder/IRmark/envelope or the control/parse helpers,
//      update EVERY copy byte-for-byte, or the IRmark / DSP handshake will break.
//
// Hard rules (do NOT "improve"): namespace .../r68/2; IRmark = SHA-1→base64 over
//   `<Body xmlns=".../CM/envelope">`+IRenvelope-without-IRmark+`</Body>`; xeText
//   escapes ONLY & < > CR (never ' or "); no inter-tag whitespace; AuthOfficial
//   order OffName→OffID(Postcode)→Phone; Regulator absent iff HMRCref starts CH/CF.
//
// Secrets: HMRC_VENDOR_ID, HMRC_PRODUCT_NAME, HMRC_PRODUCT_VERSION,
//   HMRC_GATEWAY_SENDER_ID/PASSWORD (fallbacks), HMRC_TE_URL_TEST/LIVE,
//   HMRC_POLL_BUDGET_MS.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const R68_NAMESPACE = 'http://www.govtalk.gov.uk/taxation/charities/r68/2';
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

// == R68 v2 builder (byte-identical to _shared/r68Builder.ts) =================
type Regulator =
  | { kind: 'named'; regName: 'CCEW' | 'CCNI' | 'OSCR'; regNo: string }
  | { kind: 'none' }
  | { kind: 'other'; otherReg: string; regNo?: string };
interface R68LineItem { fore: string; sur: string; house: string; postcode: string; date: string; total: number; }
interface R68Charity {
  orgName: string; hmrcRef: string;
  officialFore: string; officialSur: string; officialPhone: string; officialPostcode: string;
  regulator: Regulator;
}

const xeText = (v: unknown): string =>
  (v == null ? '' : String(v))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\r/g, '&#xD;');

const isoDate = (d: string): string => {
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date(s).toISOString().slice(0, 10);
};

function buildRegulatorXml(charity: R68Charity): string {
  if (/^(CH|CF)/i.test(charity.hmrcRef)) return '';
  const r = charity.regulator;
  switch (r.kind) {
    case 'named':
      return `<Regulator><RegName>${xeText(r.regName)}</RegName><RegNo>${xeText(r.regNo)}</RegNo></Regulator>`;
    case 'none':
      return `<Regulator><NoReg>yes</NoReg></Regulator>`;
    case 'other':
      return `<Regulator><OtherReg>${xeText(r.otherReg)}</OtherReg>` +
             (r.regNo ? `<RegNo>${xeText(r.regNo)}</RegNo>` : '') + `</Regulator>`;
  }
}

function buildR68(charity: R68Charity, items: R68LineItem[]): string {
  const gad = items.map((it) =>
    `<GAD><Donor><Fore>${xeText(it.fore)}</Fore><Sur>${xeText(it.sur)}</Sur>` +
    `<House>${xeText(it.house)}</House><Postcode>${xeText(it.postcode)}</Postcode></Donor>` +
    `<Date>${xeText(isoDate(it.date))}</Date><Total>${it.total.toFixed(2)}</Total></GAD>`,
  ).join('');
  const earliest = items.reduce((min, it) => (it.date < min ? it.date : min), items[0].date);
  return (
    `<R68>` +
      `<AuthOfficial>` +
        `<OffName><Fore>${xeText(charity.officialFore)}</Fore><Sur>${xeText(charity.officialSur)}</Sur></OffName>` +
        `<OffID><Postcode>${xeText(charity.officialPostcode)}</Postcode></OffID>` +
        `<Phone>${xeText(charity.officialPhone)}</Phone>` +
      `</AuthOfficial>` +
      `<Declaration>yes</Declaration>` +
      `<Claim>` +
        `<OrgName>${xeText(charity.orgName)}</OrgName>` +
        `<HMRCref>${xeText(charity.hmrcRef)}</HMRCref>` +
        buildRegulatorXml(charity) +
        `<Repayment>${gad}<EarliestGAdate>${xeText(isoDate(earliest))}</EarliestGAdate></Repayment>` +
      `</Claim>` +
    `</R68>`
  );
}

function buildIRenvelope(charity: R68Charity, periodEnd: string, r68: string, irmark: string | null): string {
  const irmarkEl = irmark ? `<IRmark Type="generic">${xeText(irmark)}</IRmark>` : '';
  return (
    `<IRenvelope xmlns="${R68_NAMESPACE}">` +
      `<IRheader>` +
        `<Keys><Key Type="CHARID">${xeText(charity.hmrcRef)}</Key></Keys>` +
        `<PeriodEnd>${xeText(isoDate(periodEnd))}</PeriodEnd>` +
        `<DefaultCurrency>GBP</DefaultCurrency>` +
        irmarkEl +
        `<Sender>Individual</Sender>` +
      `</IRheader>` +
      r68 +
    `</IRenvelope>`
  );
}

async function sha1Base64(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  let bin = '';
  new Uint8Array(digest).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

async function computeIRmark(irenvelopeWithoutMark: string): Promise<string> {
  return sha1Base64(`<Body xmlns="${GOVTALK_NAMESPACE}">` + irenvelopeWithoutMark + `</Body>`);
}

async function buildR68Envelope(
  charity: R68Charity, items: R68LineItem[], periodEnd: string,
): Promise<{ xml: string; irmark: string }> {
  const r68 = buildR68(charity, items);
  const forMark = buildIRenvelope(charity, periodEnd, r68, null);
  const irmark = await computeIRmark(forMark);
  const xml = buildIRenvelope(charity, periodEnd, r68, irmark);
  return { xml, irmark };
}

// == GovTalk submit envelope (byte-identical to _shared/giftAidEnvelope.ts) ===
interface GatewayAuth { senderId: string; password: string; }
interface GovTalkOptions {
  charity: R68Charity; items: R68LineItem[]; periodEnd: string; test: boolean;
  vendorId: string; productName: string; productVersion: string;
  auth?: GatewayAuth; correlationId?: string; gatewayTimestamp?: string;
}
async function buildGovTalkMessage(opts: GovTalkOptions): Promise<{ xml: string; irmark: string }> {
  const { xml: irenvelope, irmark } = await buildR68Envelope(opts.charity, opts.items, opts.periodEnd);
  const senderDetails = opts.auth
    ? `<SenderDetails><IDAuthentication>` +
        `<SenderID>${xeText(opts.auth.senderId)}</SenderID>` +
        `<Authentication><Method>clear</Method><Role>principal</Role>` +
        `<Value>${xeText(opts.auth.password)}</Value></Authentication>` +
      `</IDAuthentication></SenderDetails>`
    : `<SenderDetails/>`;
  const correlation = opts.correlationId ? `<CorrelationID>${xeText(opts.correlationId)}</CorrelationID>` : '';
  const gwTimestamp = opts.gatewayTimestamp ? `<GatewayTimestamp>${xeText(opts.gatewayTimestamp)}</GatewayTimestamp>` : '';
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<GovTalkMessage xmlns="${GOVTALK_NAMESPACE}">` +
      `<EnvelopeVersion>2.0</EnvelopeVersion>` +
      `<Header><MessageDetails>` +
        `<Class>HMRC-CHAR-CLM</Class><Qualifier>request</Qualifier><Function>submit</Function>` +
        correlation + `<Transformation>XML</Transformation>` +
        `<GatewayTest>${opts.test ? '1' : '0'}</GatewayTest>` + gwTimestamp +
      `</MessageDetails>` + senderDetails + `</Header>` +
      `<GovTalkDetails>` +
        `<Keys><Key Type="CHARID">${xeText(opts.charity.hmrcRef)}</Key></Keys>` +
        `<ChannelRouting><Channel>` +
          `<URI>${xeText(opts.vendorId)}</URI><Product>${xeText(opts.productName)}</Product>` +
          `<Version>${xeText(opts.productVersion)}</Version>` +
        `</Channel></ChannelRouting>` +
      `</GovTalkDetails>` +
      `<Body>${irenvelope}</Body>` +
    `</GovTalkMessage>`;
  return { xml, irmark };
}

// == GovTalk control envelopes + parser (mirror gift-aid-hmrc-poll) ===========
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

function toRegulator(s: Record<string, any> | null): Regulator {
  const type = String(s?.regulator_type || 'CCEW');
  const regNo = s?.regulator_number || '';
  switch (type) {
    case 'none':  return { kind: 'none' };
    case 'other': return { kind: 'other', otherReg: s?.regulator_other_name || '', regNo: regNo || undefined };
    case 'CCEW': case 'CCNI': case 'OSCR': return { kind: 'named', regName: type, regNo };
    default: return { kind: 'named', regName: 'CCEW', regNo };
  }
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

  // --- 1. authenticate + authorize via RLS ---
  const authHeader = req.headers.get('Authorization') || '';
  const asUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await asUser.auth.getUser();
  if (!userData?.user) return json({ ok: false, error: 'Not authenticated.' }, 401);

  const { data: claim, error: claimErr } = await asUser
    .from('gift_aid_claims').select('*').eq('id', claimId).maybeSingle();
  if (claimErr || !claim) return json({ ok: false, error: 'Claim not found or access denied.' }, 403);
  if (claim.status === 'accepted') return json({ ok: false, error: 'This claim has already been accepted by HMRC.' }, 409);

  // --- 2. load settings + line items UNDER THE CALLER'S JWT ---
  // ga_get_claim_line_items relies on the caller's auth.uid() for its access
  // check; the service role has none and would get ZERO rows (=> "no complete
  // donor records"). We still read only by claimId (already RLS-authorised
  // above), so no client-supplied donation data is trusted.
  const svc = createClient(supabaseUrl, serviceKey); // service role: writeback + audit only
  const { data: settings } = await asUser
    .from('ministry_gift_aid_settings')
    .select('charity_name, hmrc_reference, authorised_official_name, authorised_official_phone, authorised_official_postcode, regulator_type, regulator_number, regulator_other_name')
    .eq('ministry_id', claim.ministry_id).maybeSingle();

  const { data: rawItems, error: itemsErr } = await asUser.rpc('ga_get_claim_line_items', { p_claim_id: claimId });
  if (itemsErr) return json({ ok: false, error: `Could not load line items: ${itemsErr.message}` }, 400);

  const nameParts = String(settings?.authorised_official_name || '').trim().split(/\s+/).filter(Boolean);
  const charity: R68Charity = {
    orgName: settings?.charity_name || '',
    hmrcRef: (settings?.hmrc_reference || '').trim(),
    officialFore: nameParts[0] || '',
    officialSur: nameParts.length > 1 ? nameParts.slice(1).join(' ') : (nameParts[0] || ''),
    officialPhone: settings?.authorised_official_phone || '',
    officialPostcode: settings?.authorised_official_postcode || '',
    regulator: toRegulator(settings),
  };
  if (!charity.hmrcRef) return json({ ok: false, error: 'Missing HMRC charity reference in Gift Aid settings.' }, 400);
  if (!charity.officialFore) return json({ ok: false, error: 'Missing Authorised Official name in Gift Aid settings.' }, 400);

  const complete = (rawItems || []).filter((r: any) => !!r.complete);
  if (complete.length === 0) return json({ ok: false, error: 'No complete donor records to submit. Fix the flagged donations first.' }, 400);
  const items: R68LineItem[] = complete.map((r: any) => ({
    fore: r.first_name || '', sur: r.last_name || '',
    house: r.house_number_or_name || r.address_line1 || '',
    postcode: r.postcode || '', date: r.donation_date, total: Number(r.amount ?? 0),
  }));
  const periodEnd = claim.period_to || items.reduce((m, it) => (it.date > m ? it.date : m), items[0].date);

  // --- 3. build the submit message ---
  const test = environment !== 'live';
  const endpoint = environment === 'live' ? CONFIG.urlLive : CONFIG.urlTest;
  const channel: ChannelRouting = { vendorId: CONFIG.vendorId, productName: CONFIG.productName, productVersion: CONFIG.productVersion };
  const { xml: submitXml, irmark } = await buildGovTalkMessage({
    charity, items, periodEnd, test,
    vendorId: CONFIG.vendorId, productName: CONFIG.productName, productVersion: CONFIG.productVersion,
    auth: { senderId, password },
  });

  const audit = (event_type: string, event_data: Record<string, unknown>) =>
    svc.from('gift_aid_audit_log').insert({
      ministry_id: claim.ministry_id, actor_user_id: userData.user!.id, event_type, event_data,
    }).then(() => {}, () => {});

  // --- 4. submit ---
  let ack: ParsedResponse;
  try { ack = await postGovTalk(endpoint, submitXml); }
  catch (e) { return json({ ok: false, stage: 'submit', error: `Could not reach HMRC: ${e instanceof Error ? e.message : String(e)}` }, 502); }

  if (ack.qualifier === 'error' && ack.errors.length > 0) {
    await svc.from('gift_aid_claims').update({ status: 'rejected', response_notes: ack.errors.join(' | '), updated_at: new Date().toISOString() }).eq('id', claimId);
    await audit('claim_submission_rejected', { environment, correlationId: ack.correlationId, errors: ack.errors });
    return json({ ok: false, stage: 'submit', environment, correlationId: ack.correlationId || undefined, error: ack.errors.join(' | ') });
  }

  const correlationId = ack.correlationId || '';
  await svc.from('gift_aid_claims').update({
    status: 'submitted', hmrc_submission_reference: correlationId, submitted_at: new Date().toISOString(),
    response_notes: `IRmark ${irmark}`, updated_at: new Date().toISOString(),
  }).eq('id', claimId);
  await audit('claim_submitted', { environment, correlationId, irmark, donationCount: items.length });

  let pollUrl = ack.responseEndPoint || endpoint.replace(/\/submission\/?$/, '/poll');
  let waitMs = Math.max(1000, (ack.pollInterval || 3) * 1000);

  // --- 5. poll (submit -> poll -> delete), bounded by the wall-clock budget ---
  while (correlationId) {
    if (Date.now() - startedAt + waitMs > CONFIG.pollBudgetMs) {
      return json({
        ok: false, stage: 'poll-timeout', environment, correlationId, irMark: irmark, donationCount: items.length,
        message: 'Submitted to HMRC and awaiting confirmation. The claim is marked submitted; check back shortly for the receipt.',
      });
    }
    await sleep(waitMs);

    let poll: ParsedResponse;
    try {
      poll = await postGovTalk(pollUrl, buildControlMessage({ qualifier: 'poll', func: 'submit', correlationId, test, senderId, password, charId: charity.hmrcRef, channel }));
    } catch (e) {
      return json({ ok: false, stage: 'poll-timeout', environment, correlationId, irMark: irmark, message: `Submitted, but polling failed: ${e instanceof Error ? e.message : String(e)}. The claim is marked submitted.` });
    }

    if (poll.qualifier === 'acknowledgement') {
      if (poll.responseEndPoint) pollUrl = poll.responseEndPoint;
      waitMs = Math.max(1000, (poll.pollInterval || 3) * 1000);
      continue;
    }

    if (poll.qualifier === 'error' || poll.errors.length > 0) {
      await svc.from('gift_aid_claims').update({ status: 'rejected', response_notes: poll.errors.join(' | ') || 'HMRC returned an error.', updated_at: new Date().toISOString() }).eq('id', claimId);
      await audit('claim_submission_rejected', { environment, correlationId, errors: poll.errors });
      await postGovTalk(pollUrl, buildControlMessage({ qualifier: 'request', func: 'delete', correlationId, test, senderId, password, charId: charity.hmrcRef, channel })).catch(() => {});
      return json({ ok: false, stage: 'response', environment, correlationId, error: poll.errors.join(' | ') || 'HMRC rejected the submission.' });
    }

    const receiptMark = poll.irmarkReceipt || irmark;
    await svc.from('gift_aid_claims').update({
      status: 'accepted', hmrc_submission_reference: correlationId,
      response_notes: poll.successMessage ? `${poll.successMessage} (IRmark ${receiptMark})` : `Accepted. IRmark ${receiptMark}`,
      updated_at: new Date().toISOString(),
    }).eq('id', claimId);
    await audit('claim_accepted', { environment, correlationId, irmark: receiptMark, message: poll.successMessage });
    await postGovTalk(pollUrl, buildControlMessage({ qualifier: 'request', func: 'delete', correlationId, test, senderId, password, charId: charity.hmrcRef, channel })).catch(() => {});

    return json({ ok: true, environment, correlationId, irMark: receiptMark, donationCount: items.length, message: poll.successMessage || 'Claim accepted by HMRC.' });
  }

  return json({ ok: false, stage: 'submit', environment, error: 'HMRC did not return a correlation ID.' });
});
