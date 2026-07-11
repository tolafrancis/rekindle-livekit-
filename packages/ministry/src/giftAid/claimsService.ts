// =============================================================================
// Gift Aid — claims service (Phase 3)
// Folder: src/lib/giftAid/
// -----------------------------------------------------------------------------
// Build/list/update claims (RPCs) and produce HMRC-style exports:
//   • CSV in the HMRC "Schedule spreadsheet for Gift Aid donations" layout
//   • a well-formed XML data export (record/import aid, NOT a GovTalk envelope —
//     direct HMRC API submission is a separate future phase)
//   • a printable submission summary / cover sheet
// =============================================================================

import { supabase } from '@rekindle/supabase';
import { downloadTextFile } from '@rekindle/features/qrCode';

export type ClaimStatus = 'draft' | 'ready' | 'submitted' | 'accepted' | 'rejected';

export interface GiftAidClaim {
  id: string;
  ministry_id: string;
  claim_reference: string;
  status: ClaimStatus;
  period_from: string | null;
  period_to: string | null;
  donation_count: number;
  total_amount: number;
  total_gift_aid: number;
  currency: string;
  hmrc_submission_reference: string | null;
  submitted_at: string | null;
  response_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimLineItem {
  donationId: string;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  houseNumberOrName: string | null;
  addressLine1: string | null;
  city: string | null;
  postcode: string | null;
  donationDate: string;
  amount: number;
  estimatedGiftAid: number;
  complete: boolean;
  missing: string | null;
}

export interface CharityDetails {
  charityName: string | null;
  hmrcReference: string | null;
  registrationNumber: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  authorisedOfficialName: string | null;
  authorisedOfficialPhone: string | null;
  authorisedOfficialPostcode: string | null;
  // Charity regulator (R68 v2 <Regulator> — required unless HMRCref starts CH/CF).
  regulatorType?: 'CCEW' | 'CCNI' | 'OSCR' | 'none' | 'other' | null;
  regulatorNumber?: string | null;
  regulatorOtherName?: string | null;
}

// -- data access --------------------------------------------------------------

export async function buildClaim(
  ministryId: string,
  from?: string | null,
  to?: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('ga_build_claim', {
    p_ministry_id: ministryId,
    p_from: from ?? null,
    p_to: to ?? null,
  });
  if (error) throw error;
  return data as string; // new claim id
}

export async function listClaims(ministryId: string): Promise<GiftAidClaim[]> {
  const { data, error } = await supabase
    .from('gift_aid_claims')
    .select('*')
    .eq('ministry_id', ministryId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as GiftAidClaim[];
}

export async function getClaim(claimId: string): Promise<GiftAidClaim | null> {
  const { data, error } = await supabase
    .from('gift_aid_claims')
    .select('*')
    .eq('id', claimId)
    .maybeSingle();
  if (error) throw error;
  return (data as GiftAidClaim) || null;
}

export async function getClaimLineItems(claimId: string): Promise<ClaimLineItem[]> {
  const { data, error } = await supabase.rpc('ga_get_claim_line_items', { p_claim_id: claimId });
  if (error) throw error;
  return (data || []).map(mapLineItem);
}

/** HMRC schedule rows for eligible, GBP, not-yet-claimed donations (manual filing). */
export async function loadEligibleLineItems(
  ministryId: string,
  opts: { from?: string | null; to?: string | null } = {},
): Promise<ClaimLineItem[]> {
  const { data, error } = await supabase.rpc('ga_get_eligible_line_items', {
    p_ministry_id: ministryId,
    p_from: opts.from ?? null,
    p_to: opts.to ?? null,
  });
  if (error) throw error;
  return (data || []).map(mapLineItem);
}

function mapLineItem(r: any): ClaimLineItem {
  return {
    donationId: r.donation_id,
    title: r.title,
    firstName: r.first_name,
    lastName: r.last_name,
    houseNumberOrName: r.house_number_or_name,
    addressLine1: r.address_line1,
    city: r.city,
    postcode: r.postcode,
    donationDate: r.donation_date,
    amount: Number(r.amount ?? 0),
    estimatedGiftAid: Number(r.estimated_gift_aid ?? 0),
    complete: !!r.complete,
    missing: r.missing,
  };
}

export async function setClaimStatus(
  claimId: string,
  status: ClaimStatus,
  reference?: string | null,
  notes?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('ga_set_claim_status', {
    p_claim_id: claimId,
    p_status: status,
    p_reference: reference ?? null,
    p_notes: notes ?? null,
  });
  if (error) throw error;
}

export async function deleteClaim(claimId: string): Promise<void> {
  const { error } = await supabase.rpc('ga_delete_claim', { p_claim_id: claimId });
  if (error) throw error;
}

export async function loadCharityDetails(ministryId: string): Promise<CharityDetails> {
  const { data } = await supabase
    .from('ministry_gift_aid_settings')
    .select('charity_name, hmrc_reference, charity_registration_number, contact_person, contact_email, authorised_official_name, authorised_official_phone, authorised_official_postcode, regulator_type, regulator_number, regulator_other_name')
    .eq('ministry_id', ministryId)
    .maybeSingle();
  return {
    charityName: data?.charity_name ?? null,
    hmrcReference: data?.hmrc_reference ?? null,
    registrationNumber: data?.charity_registration_number ?? null,
    contactPerson: data?.contact_person ?? null,
    contactEmail: data?.contact_email ?? null,
    authorisedOfficialName: data?.authorised_official_name ?? null,
    authorisedOfficialPhone: data?.authorised_official_phone ?? null,
    authorisedOfficialPostcode: data?.authorised_official_postcode ?? null,
    regulatorType: (data?.regulator_type as CharityDetails['regulatorType']) ?? null,
    regulatorNumber: data?.regulator_number ?? null,
    regulatorOtherName: data?.regulator_other_name ?? null,
  };
}

// -- export builders (pure) ---------------------------------------------------

/** HMRC wants DD/MM/YY for donation dates on the schedule. */
function hmrcDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV in HMRC's Gift Aid donations schedule column order. Itemised donations
 * (no aggregation / sponsored event) — those columns are left blank.
 */
export function buildClaimCsv(items: ClaimLineItem[]): string {
  const headers = [
    'Title',
    'First name',
    'Last name',
    'House name or number',
    'Postcode',
    'Aggregated donations',
    'Sponsored event',
    'Donation date',
    'Amount',
  ];
  const lines = [headers.join(',')];
  for (const it of items) {
    lines.push([
      csvCell(it.title),
      csvCell(it.firstName),
      csvCell(it.lastName),
      csvCell(it.houseNumberOrName || it.addressLine1),
      csvCell(it.postcode),
      '', // aggregated donations
      '', // sponsored event
      csvCell(hmrcDate(it.donationDate)),
      csvCell(it.amount.toFixed(2)),
    ].join(','));
  }
  return lines.join('\r\n');
}

function xmlEscape(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Well-formed XML representation of the claim. This is a structured data export
 * for records / import — NOT a GovTalk submission envelope.
 */
export function buildClaimXml(
  claim: GiftAidClaim,
  items: ClaimLineItem[],
  charity: CharityDetails,
): string {
  const rows = items
    .map(
      (it) => `    <Donation>
      <Title>${xmlEscape(it.title)}</Title>
      <FirstName>${xmlEscape(it.firstName)}</FirstName>
      <LastName>${xmlEscape(it.lastName)}</LastName>
      <HouseNumberOrName>${xmlEscape(it.houseNumberOrName || it.addressLine1)}</HouseNumberOrName>
      <Postcode>${xmlEscape(it.postcode)}</Postcode>
      <DonationDate>${xmlEscape(hmrcDate(it.donationDate))}</DonationDate>
      <Amount>${it.amount.toFixed(2)}</Amount>
    </Donation>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<GiftAidClaim reference="${xmlEscape(claim.claim_reference)}">
  <Charity>
    <Name>${xmlEscape(charity.charityName)}</Name>
    <HMRCReference>${xmlEscape(charity.hmrcReference)}</HMRCReference>
    <RegistrationNumber>${xmlEscape(charity.registrationNumber)}</RegistrationNumber>
  </Charity>
  <Totals donationCount="${claim.donation_count}" totalAmount="${Number(claim.total_amount).toFixed(2)}" totalGiftAid="${Number(claim.total_gift_aid).toFixed(2)}" currency="${xmlEscape(claim.currency)}"/>
  <Donations>
${rows}
  </Donations>
</GiftAidClaim>`;
}

/** Human-readable cover sheet for the submission package. */
export function buildClaimSummary(
  claim: GiftAidClaim,
  items: ClaimLineItem[],
  charity: CharityDetails,
): string {
  const incomplete = items.filter((i) => !i.complete);
  const lines: string[] = [];
  lines.push('GIFT AID CLAIM — SUBMISSION SUMMARY');
  lines.push('===================================');
  lines.push('');
  lines.push(`Claim reference:   ${claim.claim_reference}`);
  lines.push(`Status:            ${claim.status}`);
  lines.push(`Charity:           ${charity.charityName || '(not set)'}`);
  lines.push(`HMRC reference:    ${charity.hmrcReference || '(not set)'}`);
  lines.push(`Charity reg no.:   ${charity.registrationNumber || '(not set)'}`);
  if (claim.period_from || claim.period_to) {
    lines.push(`Period:            ${claim.period_from || '—'} to ${claim.period_to || '—'}`);
  }
  lines.push('');
  lines.push(`Donations:         ${claim.donation_count}`);
  lines.push(`Total donated:     ${claim.currency} ${Number(claim.total_amount).toFixed(2)}`);
  lines.push(`Gift Aid (25%):    ${claim.currency} ${Number(claim.total_gift_aid).toFixed(2)}`);
  lines.push('');
  if (incomplete.length > 0) {
    lines.push(`WARNING: ${incomplete.length} donation(s) have incomplete donor details and may be rejected by HMRC:`);
    incomplete.forEach((i) => {
      lines.push(`  - ${[i.firstName, i.lastName].filter(Boolean).join(' ') || '(unnamed)'}: missing ${i.missing || 'details'}`);
    });
  } else {
    lines.push('All donor records are complete.');
  }
  lines.push('');
  if (claim.hmrc_submission_reference) {
    lines.push(`HMRC submission ref: ${claim.hmrc_submission_reference}`);
  }
  if (charity.contactPerson || charity.contactEmail) {
    lines.push(`Contact: ${charity.contactPerson || ''} ${charity.contactEmail ? `<${charity.contactEmail}>` : ''}`.trim());
  }
  lines.push('');
  lines.push('Note: the CSV follows HMRC\u2019s Gift Aid donations schedule layout. The XML is a');
  lines.push('structured data export for your records, not a direct HMRC submission envelope.');
  return lines.join('\n');
}

// -- download wrappers (+ audit) ----------------------------------------------

async function logExport(ministryId: string, claimId: string, format: string) {
  try {
    await supabase.from('gift_aid_audit_log').insert({
      ministry_id: ministryId,
      event_type: 'claim_exported',
      event_data: { claim_id: claimId, format },
    });
  } catch (e) {
    console.warn('audit (claim_exported) failed:', e);
  }
}

export async function downloadClaimCsv(claim: GiftAidClaim, items: ClaimLineItem[]) {
  downloadTextFile(buildClaimCsv(items), `${claim.claim_reference}.csv`, 'text/csv');
  await logExport(claim.ministry_id, claim.id, 'csv');
}

/**
 * Download an HMRC-schedule CSV for the eligible donations passed in (manual
 * filing, no claim needed). Includes only complete donor records and returns
 * how many were skipped so the UI can warn.
 */
export function downloadEligibleHmrcCsv(
  filenameBase: string,
  items: ClaimLineItem[],
): { exported: number; skipped: number } {
  const usable = items.filter((i) => i.complete);
  const skipped = items.length - usable.length;
  const safeName = (filenameBase || 'gift-aid').replace(/[^a-z0-9_-]+/gi, '-');
  downloadTextFile(buildClaimCsv(usable), `${safeName}-gift-aid-schedule.csv`, 'text/csv');
  return { exported: usable.length, skipped };
}

export async function downloadClaimXml(claim: GiftAidClaim, items: ClaimLineItem[], charity: CharityDetails) {
  downloadTextFile(buildClaimXml(claim, items, charity), `${claim.claim_reference}.xml`, 'application/xml');
  await logExport(claim.ministry_id, claim.id, 'xml');
}

export async function downloadClaimSummary(claim: GiftAidClaim, items: ClaimLineItem[], charity: CharityDetails) {
  downloadTextFile(buildClaimSummary(claim, items, charity), `${claim.claim_reference}-summary.txt`, 'text/plain');
  await logExport(claim.ministry_id, claim.id, 'summary');
}

/**
 * Export the full GovTalkMessage (R68 v2 body + IRmark) for validation in HMRC's
 * Local Test Service. Uses the SAME shared builder as the live submission, so an
 * LTS pass means the live body is valid too. Marked as a TEST message
 * (GatewayTest=1) with a placeholder GatewayTimestamp and no credentials — LTS
 * validates the body, not the header. Only complete GBP records are included;
 * returns the count actually exported so the UI can warn about anything skipped.
 */
export async function downloadClaimR68Xml(
  claim: GiftAidClaim,
  items: ClaimLineItem[],
  charity: CharityDetails,
): Promise<{ exported: number; skipped: number }> {
  // Imported lazily to keep the (browser) crypto-using module out of other paths.
  const { toR68Charity, toR68LineItems } = await import('./r68Adapters');
  const { buildGovTalkMessage } = await import('./r68Builder');

  const usable = items.filter((it) => it.complete);
  const skipped = items.length - usable.length;
  if (usable.length === 0) {
    throw new Error('No complete donor records to export. Fix the highlighted donations first.');
  }

  const r68Charity = toR68Charity(charity);
  if (!r68Charity.hmrcRef) throw new Error('Missing HMRC charity reference in Gift Aid settings.');
  if (!r68Charity.officialFore) throw new Error('Missing Authorised Official name in Gift Aid settings.');

  const lineItems = toR68LineItems(usable);
  const periodEnd =
    claim.period_to || usable.reduce((m, it) => (it.donationDate > m ? it.donationDate : m), usable[0].donationDate);

  const { xml } = await buildGovTalkMessage({
    charity: r68Charity,
    items: lineItems,
    periodEnd,
    test: true,
    vendorId: '9515',
    productName: 'Rekindle Digital Missions',
    productVersion: '1.0',
    gatewayTimestamp: new Date().toISOString().replace(/\.\d+Z$/, '.000'),
    // Dummy Gateway auth so SenderDetails is populated (matches HMRC's LTS sample).
    // LTS validates the body, not credentials, and this file never reaches a real
    // gateway. The live/ETS submit path passes the ministry's real credentials.
    auth: { senderId: 'GIFTAIDCHAR', password: 'testing' },
  });
  downloadTextFile(xml, `${claim.claim_reference}-GovTalkMessage.xml`, 'application/xml');
  await logExport(claim.ministry_id, claim.id, 'r68_xml');
  return { exported: usable.length, skipped };
}
