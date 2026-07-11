// =============================================================================
// R68 pre-submission validation  ·  Folder: src/lib/giftAid/
// -----------------------------------------------------------------------------
// Front-line checks that run in-app BEFORE a Gift Aid (R68) repayment claim is
// built, exported, or submitted to HMRC. Catching problems here means a claim
// is clean before it ever reaches the Transaction Engine, and gives the user
// specific, fixable messages instead of an opaque HMRC rejection.
//
// These encode the *documented* Charities Online / R68 business rules from
// HMRC's public guidance (field presence, formats, the 4-year claim window,
// money precision, aggregation limits). They are deliberately the single place
// to update: when the official RIM artefacts (schema + schematron) arrive with
// the Vendor ID, reconcile the exact lengths, formats and limits flagged with
// "VERIFY against RIM" against the published schematron and adjust here.
// =============================================================================

import type { ClaimLineItem, CharityDetails } from './claimsService';

export interface ValidationIssue {
  level: 'error' | 'warning';
  scope: 'charity' | 'donation' | 'claim';
  field: string;
  message: string;
  donationId?: string;
  donorLabel?: string;
}

export interface ValidationResult {
  ok: boolean;               // true when there are zero errors (warnings are allowed)
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  issues: ValidationIssue[]; // errors + warnings, in order
}

// --- constraints reconciled against the CHAR 2.0 RIM (schema + schematron) ---
const MAX_TITLE = 4;        // RIM: Ttl 1–4
const MAX_FORENAME = 35;    // RIM: Fore 1–35
const MAX_SURNAME = 35;     // RIM: Sur 1–35
const MAX_HOUSE = 40;       // RIM: House 1–40
const MAX_ORGNAME = 160;    // RIM: OrgName 1–160, first char alphanumeric
const MAX_PHONE = 35;       // RIM: Phone 1–35
const CLAIM_WINDOW_YEARS = 4;                 // HMRC: donations within the last 4 years
const AGG_MAX_SINGLE_DONATION = 20;           // small donations that may be aggregated
const TITLE_RE = /^[A-Za-z][A-Za-z'\-]*$/;                 // RIM: Ttl pattern
const UK_POSTCODE = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s\d[A-Za-z]{2}$/; // RIM: 1–8, MUST contain a space
const HMRC_CHARITY_REF = /^[A-Z]{1,2}[0-9]{1,5}$/i;        // RIM: [A-Z]{1,2}[0-9]{1,5}
const PHONE_RE = /^[0-9()\-\s]{1,35}$/;                    // RIM: Phone pattern
const MONEY_2DP = /^-?(([1-9][0-9]*)|0)\.[0-9]{2}$/;       // RIM: exactly 2 dp
const MONEY_MIN = 0.01;

function donorLabel(it: ClaimLineItem): string {
  return [it.firstName, it.lastName].filter(Boolean).join(' ').trim() || `donation ${it.donationId.slice(0, 8)}`;
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Charity / authorised-official level rules. */
export function validateCharity(charity: CharityDetails): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const err = (field: string, message: string) => out.push({ level: 'error', scope: 'charity', field, message });
  const warn = (field: string, message: string) => out.push({ level: 'warning', scope: 'charity', field, message });

  if (!charity.charityName?.trim()) {
    err('charityName', 'Charity name is required.');
  } else {
    const name = charity.charityName.trim();
    if (name.length > MAX_ORGNAME) err('charityName', `Charity name exceeds ${MAX_ORGNAME} characters (rule 7025).`);
    if (!/^[A-Za-z0-9]/.test(name)) warn('charityName', 'Charity name should start with a letter or number (HMRC OrgName rule).');
  }

  if (!charity.hmrcReference?.trim()) {
    err('hmrcReference', 'HMRC charities reference is required to submit a claim.');
  } else if (!HMRC_CHARITY_REF.test(charity.hmrcReference.trim())) {
    warn('hmrcReference', `HMRC reference "${charity.hmrcReference}" does not look like the usual format (letters then digits, e.g. AB12345). Double-check it.`);
  }

  if (!charity.authorisedOfficialName?.trim())
    err('authorisedOfficialName', 'Authorised official name is required for HMRC submission (rule 7026).');
  if (!charity.authorisedOfficialPhone?.trim()) {
    err('authorisedOfficialPhone', 'Authorised official phone number is required for HMRC submission.');
  } else if (!PHONE_RE.test(charity.authorisedOfficialPhone.trim())) {
    warn('authorisedOfficialPhone', `Authorised official phone "${charity.authorisedOfficialPhone}" has characters HMRC may reject (digits, spaces, brackets and hyphens only, max ${MAX_PHONE}).`);
  }
  if (!charity.authorisedOfficialPostcode?.trim()) {
    err('authorisedOfficialPostcode', 'Authorised official postcode is required for HMRC submission.');
  } else if (!UK_POSTCODE.test(charity.authorisedOfficialPostcode.trim())) {
    warn('authorisedOfficialPostcode', `Authorised official postcode "${charity.authorisedOfficialPostcode}" is not a valid UK format (it must contain a space, e.g. SW1A 1AA).`);
  }

  // Regulator (rule 7029/7031/7033): required UNLESS the HMRC ref starts CH/CF.
  const isCHCF = /^(CH|CF)/i.test((charity.hmrcReference || '').trim());
  const regType = charity.regulatorType || 'CCEW';
  if (!isCHCF) {
    if (regType === 'CCEW' || regType === 'CCNI' || regType === 'OSCR') {
      if (!charity.regulatorNumber?.trim())
        err('regulatorNumber', 'Regulator registration number is required when a regulator (CCEW/CCNI/OSCR) is selected (rule 7031).');
    } else if (regType === 'other') {
      if (!charity.regulatorOtherName?.trim())
        err('regulatorOtherName', 'Regulator name is required when "Other regulator" is selected.');
    }
    // 'none' is a valid explicit choice (NoReg); no number needed.
  }

  return out;
}

/** Per-donation (Gift Aid donation line) rules. */
export function validateDonation(it: ClaimLineItem): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const label = donorLabel(it);
  const err = (field: string, message: string) =>
    out.push({ level: 'error', scope: 'donation', field, message, donationId: it.donationId, donorLabel: label });
  const warn = (field: string, message: string) =>
    out.push({ level: 'warning', scope: 'donation', field, message, donationId: it.donationId, donorLabel: label });

  // Donor name
  if (!it.firstName?.trim()) err('firstName', `${label}: donor first name is required.`);
  else if (it.firstName.trim().length > MAX_FORENAME) err('firstName', `${label}: first name exceeds ${MAX_FORENAME} characters.`);
  if (!it.lastName?.trim()) err('lastName', `${label}: donor last name is required.`);
  else if (it.lastName.trim().length > MAX_SURNAME) err('lastName', `${label}: last name exceeds ${MAX_SURNAME} characters.`);
  if (it.title && it.title.trim()) {
    const ttl = it.title.trim();
    if (ttl.length > MAX_TITLE) warn('title', `${label}: title exceeds ${MAX_TITLE} characters.`);
    else if (!TITLE_RE.test(ttl)) warn('title', `${label}: title "${ttl}" has characters HMRC may reject (letters, apostrophe and hyphen only).`);
  }

  // Address — HMRC needs house number/name + postcode for UK Gift Aid donations
  const house = (it.houseNumberOrName || it.addressLine1 || '').trim();
  if (!house) err('houseNumberOrName', `${label}: house number or name is required for the donor's address.`);
  else if (house.length > MAX_HOUSE) warn('houseNumberOrName', `${label}: house number/name exceeds ${MAX_HOUSE} characters.`);
  if (!it.postcode?.trim()) err('postcode', `${label}: postcode is required (use the overseas rule only for non-UK donors).`);
  else if (!UK_POSTCODE.test(it.postcode.trim())) warn('postcode', `${label}: postcode "${it.postcode}" is not a valid UK format.`);

  // Donation date — present, real, not future, within the 4-year claim window
  const d = parseDate(it.donationDate);
  if (!d) {
    err('donationDate', `${label}: a valid donation date is required.`);
  } else {
    const now = new Date();
    if (d.getTime() > now.getTime()) err('donationDate', `${label}: donation date is in the future.`);
    const earliest = new Date();
    earliest.setFullYear(earliest.getFullYear() - CLAIM_WINDOW_YEARS);
    if (d.getTime() < earliest.getTime())
      warn('donationDate', `${label}: donation is older than ${CLAIM_WINDOW_YEARS} years and may be outside the claim window.`);
  }

  // Amount — at least £0.01, exactly 2 decimal places (RIM money pattern)
  if (!(it.amount >= MONEY_MIN)) {
    err('amount', `${label}: donation amount must be at least £${MONEY_MIN.toFixed(2)}.`);
  } else {
    if (!MONEY_2DP.test(it.amount.toFixed(2))) err('amount', `${label}: amount is not a valid money value.`);
    if (Math.round(it.amount * 100) !== it.amount * 100) warn('amount', `${label}: amount has more than 2 decimal places and will be rounded.`);
  }

  return out;
}

/** Validate a whole claim (charity details + all donation line items). */
export function validateClaim(charity: CharityDetails, items: ClaimLineItem[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  issues.push(...validateCharity(charity));

  if (!items || items.length === 0) {
    issues.push({ level: 'error', scope: 'claim', field: 'items', message: 'A claim must contain at least one eligible donation.' });
  } else {
    items.forEach((it) => issues.push(...validateDonation(it)));

    // Small-donation aggregation note (advisory): individually small donations
    // can be aggregated, but our builder submits them as named donations.
    const tinyCount = items.filter((it) => it.amount > 0 && it.amount <= AGG_MAX_SINGLE_DONATION).length;
    if (tinyCount > 0) {
      issues.push({
        level: 'warning', scope: 'claim', field: 'aggregation',
        message: `${tinyCount} donation(s) are £${AGG_MAX_SINGLE_DONATION} or under. HMRC allows these to be aggregated into a single line; this claim lists them individually (which is also valid).`,
      });
    }
  }

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues };
}
