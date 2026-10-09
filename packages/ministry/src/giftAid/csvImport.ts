// =============================================================================
// Gift Aid CSV import: donations received outside the app (cash, envelopes,
// bank transfers, another giving platform) and paper Gift Aid declarations.
// -----------------------------------------------------------------------------
// Parsing and validation only; GiftAidCsvImport.tsx previews the rows and
// saves the valid ones. Donations and declarations are matched by email
// (ga_get_eligible_donations joins donor_gift_aid_status on donor_email), so a
// donor without an email needs the same placeholder in both files.
//
// Limits mirror r68Validation.ts (CHAR 2.0 RIM) so anything that imports
// cleanly also passes the pre-submission checks.
// =============================================================================

const MAX_TITLE = 4;
const MAX_FORENAME = 35;
const MAX_SURNAME = 35;
const MAX_HOUSE = 40;
const MAX_AMOUNT = 100_000;
const CLAIM_WINDOW_YEARS = 4;
const TITLE_RE = /^[A-Za-z][A-Za-z'\-]*$/;
// HMRC wants the space; we add it when it's missing (e.g. "SW1A1AA").
const UK_POSTCODE = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s\d[A-Za-z]{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ImportKind = 'donations' | 'declarations';

export interface RowIssue {
  level: 'error' | 'warning';
  message: string;
}

export interface DonationImportRow {
  line: number; // 1-based line in the file (header = 1)
  firstName: string;
  lastName: string;
  email: string;
  amount: number;
  date: string; // YYYY-MM-DD
  fund: string;
  paymentMethod: string;
  reference: string;
  notes: string;
  issues: RowIssue[];
}

export interface DeclarationImportRow {
  line: number;
  title: string;
  firstName: string;
  lastName: string;
  email: string;
  houseNumberOrName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  declarationDate: string; // YYYY-MM-DD
  taxpayerConfirmed: boolean;
  issues: RowIssue[];
}

export interface ParsedImport<T> {
  rows: T[];
  /** Problems with the file itself (missing columns, empty file). */
  fileErrors: string[];
  unknownColumns: string[];
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const DONATION_TEMPLATE_HEADERS = [
  'first_name', 'last_name', 'email', 'amount', 'date', 'fund', 'payment_method', 'reference', 'notes',
];

export const DECLARATION_TEMPLATE_HEADERS = [
  'title', 'first_name', 'last_name', 'email', 'house_name_or_number', 'address_line1', 'address_line2',
  'city', 'postcode', 'declaration_date', 'taxpayer_confirmed',
];

const DONATION_EXAMPLES = [
  ['Jane', 'Smith', 'jane.smith@example.com', '50.00', '2026-09-07', 'General', 'cash', 'ENV-0042', 'Sunday envelope'],
  ['John', 'Brown', 'john.brown@example.com', '120.00', '14/09/2026', 'Building', 'bank_transfer', 'BT-7781', ''],
];

const DECLARATION_EXAMPLES = [
  ['Mrs', 'Jane', 'Smith', 'jane.smith@example.com', '12', 'High Street', '', 'London', 'SW1A 1AA', '2026-09-07', 'yes'],
  ['Mr', 'John', 'Brown', 'john.brown@example.com', 'Rose Cottage', 'Church Lane', '', 'Manchester', 'M1 2AB', '01/03/2026', 'yes'],
];

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildTemplateCsv(kind: ImportKind): string {
  const headers = kind === 'donations' ? DONATION_TEMPLATE_HEADERS : DECLARATION_TEMPLATE_HEADERS;
  const examples = kind === 'donations' ? DONATION_EXAMPLES : DECLARATION_EXAMPLES;
  return [headers, ...examples].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadTemplate(kind: ImportKind) {
  const blob = new Blob(['﻿' + buildTemplateCsv(kind)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = kind === 'donations' ? 'gift-aid-donations-template.csv' : 'gift-aid-declarations-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// CSV parsing (RFC 4180: quoted fields, "" escapes, CRLF/LF, BOM)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  // Excel in some locales saves with semicolons; pick whichever the header uses.
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // Drop fully blank lines (trailing newline, spacer rows in Excel).
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Header aliases, so a spreadsheet with "First Name" or "Postcode" works.
const ALIASES: Record<string, string> = {
  firstname: 'first_name', forename: 'first_name', first: 'first_name', givenname: 'first_name',
  lastname: 'last_name', surname: 'last_name', last: 'last_name', familyname: 'last_name',
  emailaddress: 'email', mail: 'email',
  value: 'amount', gift: 'amount', giftamount: 'amount', donation: 'amount', donationamount: 'amount',
  donationdate: 'date', giftdate: 'date', datereceived: 'date',
  fundallocation: 'fund', designation: 'fund',
  paymentmethod: 'payment_method', method: 'payment_method', paidby: 'payment_method',
  ref: 'reference', transactionid: 'reference', receipt: 'reference',
  note: 'notes', comments: 'notes', memo: 'notes',
  housenameornumber: 'house_name_or_number', housenumberorname: 'house_name_or_number',
  housenumber: 'house_name_or_number', housename: 'house_name_or_number', house: 'house_name_or_number',
  address1: 'address_line1', addressline1: 'address_line1', street: 'address_line1', address: 'address_line1',
  address2: 'address_line2', addressline2: 'address_line2',
  town: 'city', towncity: 'city',
  postalcode: 'postcode', zip: 'postcode', postcodezip: 'postcode',
  declarationdate: 'declaration_date', datesigned: 'declaration_date', signeddate: 'declaration_date',
  taxpayer: 'taxpayer_confirmed', taxpayerconfirmed: 'taxpayer_confirmed', uktaxpayer: 'taxpayer_confirmed',
};

function normaliseHeader(h: string): string {
  const key = h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ALIASES[key]) return ALIASES[key];
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function readTable(text: string, known: string[], required: string[]) {
  const table = parseCsv(text);
  const fileErrors: string[] = [];
  if (table.length === 0) return { records: [] as { line: number; get: (k: string) => string }[], fileErrors: ['The file is empty.'], unknownColumns: [] as string[] };
  const headers = table[0].map(normaliseHeader);
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length) fileErrors.push(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the template to see the expected headers.`);
  if (table.length === 1) fileErrors.push('The file has a header row but no data rows.');
  const unknownColumns = headers.filter((h) => h && !known.includes(h));
  const records = table.slice(1).map((cells, i) => ({
    line: i + 2,
    get: (k: string) => {
      const idx = headers.indexOf(k);
      return idx === -1 ? '' : (cells[idx] ?? '').trim();
    },
  }));
  return { records, fileErrors, unknownColumns };
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

/** YYYY-MM-DD, or UK day-first DD/MM/YYYY (also with - or .). */
export function parseUkDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else if ((match = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/))) {
    d = +match[1]; m = +match[2]; y = +match[3];
    if (y < 100) y += 2000;
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseAmount(raw: string): number | null {
  const s = raw.replace(/[£,\s]/g, '').replace(/^GBP/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100) / 100;
}

/** Uppercase and insert the space HMRC requires ("sw1a1aa" → "SW1A 1AA"). */
export function normalisePostcode(raw: string): string {
  const compact = raw.toUpperCase().replace(/\s+/g, '');
  return compact.length > 3 ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : compact;
}

function parseYes(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'x', '✓'].includes(s)) return true;
  if (['no', 'n', 'false', '0'].includes(s)) return false;
  return null;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function yearsAgoIso(years: number) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

const PAYMENT_METHODS: Record<string, string> = {
  cash: 'cash', envelope: 'cash', collection: 'cash',
  cheque: 'cheque', check: 'cheque',
  bank: 'bank_transfer', banktransfer: 'bank_transfer', transfer: 'bank_transfer', bacs: 'bank_transfer',
  standingorder: 'standing_order', so: 'standing_order', directdebit: 'direct_debit', dd: 'direct_debit',
  card: 'card', online: 'card',
};

function nameIssues(firstName: string, lastName: string, title: string, out: RowIssue[]) {
  if (!firstName) out.push({ level: 'error', message: 'First name is required.' });
  else if (firstName.length > MAX_FORENAME) out.push({ level: 'error', message: `First name is over ${MAX_FORENAME} characters.` });
  if (!lastName) out.push({ level: 'error', message: 'Last name is required.' });
  else if (lastName.length > MAX_SURNAME) out.push({ level: 'error', message: `Last name is over ${MAX_SURNAME} characters.` });
  if (title && (title.length > MAX_TITLE || !TITLE_RE.test(title))) {
    out.push({ level: 'warning', message: `Title "${title}" may be rejected by HMRC (up to ${MAX_TITLE} letters, e.g. Mr, Mrs, Dr).` });
  }
}

function emailIssues(email: string, out: RowIssue[]) {
  if (!email) out.push({ level: 'error', message: 'Email is required: it links donations to declarations. For a donor with no email, use the same made-up one in both files (e.g. jane.smith.0042@noemail.local).' });
  else if (!EMAIL_RE.test(email)) out.push({ level: 'error', message: `"${email}" doesn't look like an email address.` });
}

// ---------------------------------------------------------------------------
// Donations
// ---------------------------------------------------------------------------

export function parseDonationsCsv(text: string): ParsedImport<DonationImportRow> {
  const { records, fileErrors, unknownColumns } = readTable(
    text, DONATION_TEMPLATE_HEADERS, ['first_name', 'last_name', 'email', 'amount', 'date'],
  );
  if (fileErrors.length) return { rows: [], fileErrors, unknownColumns };

  const oldest = yearsAgoIso(CLAIM_WINDOW_YEARS);
  const today = todayIso();
  const seen = new Map<string, number>();

  const rows = records.map(({ line, get }) => {
    const issues: RowIssue[] = [];
    const firstName = get('first_name');
    const lastName = get('last_name');
    const email = get('email').toLowerCase();
    nameIssues(firstName, lastName, '', issues);
    emailIssues(email, issues);

    const amount = parseAmount(get('amount'));
    if (amount === null) issues.push({ level: 'error', message: `Amount "${get('amount')}" isn't a number (use e.g. 25 or 25.50).` });
    else if (amount <= 0) issues.push({ level: 'error', message: 'Amount must be more than £0.' });
    else if (amount > MAX_AMOUNT) issues.push({ level: 'error', message: `Amount over £${MAX_AMOUNT.toLocaleString()}: check it's not a typo.` });

    const date = parseUkDate(get('date'));
    if (!date) issues.push({ level: 'error', message: `Date "${get('date')}" isn't valid (use 2026-09-07 or 07/09/2026).` });
    else if (date > today) issues.push({ level: 'error', message: 'Date is in the future.' });
    else if (date < oldest) issues.push({ level: 'warning', message: `Older than ${CLAIM_WINDOW_YEARS} years: HMRC won't accept Gift Aid on it.` });

    const rawMethod = get('payment_method');
    const methodKey = rawMethod.toLowerCase().replace(/[^a-z]/g, '');
    const paymentMethod = rawMethod ? (PAYMENT_METHODS[methodKey] ?? 'other') : 'cash';

    // Same donor, amount and day twice in one file is usually a copy-paste slip.
    if (email && amount !== null && date) {
      const key = `${email}|${amount}|${date}`;
      const firstLine = seen.get(key);
      if (firstLine) issues.push({ level: 'warning', message: `Same donor, amount and date as line ${firstLine}.` });
      else seen.set(key, line);
    }

    return {
      line, firstName, lastName, email,
      amount: amount ?? 0,
      date: date ?? '',
      fund: get('fund') || 'General',
      paymentMethod,
      reference: get('reference'),
      notes: get('notes'),
      issues,
    };
  });

  return { rows, fileErrors, unknownColumns };
}

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

export function parseDeclarationsCsv(text: string): ParsedImport<DeclarationImportRow> {
  const { records, fileErrors, unknownColumns } = readTable(
    text, DECLARATION_TEMPLATE_HEADERS,
    ['first_name', 'last_name', 'email', 'house_name_or_number', 'postcode', 'declaration_date', 'taxpayer_confirmed'],
  );
  if (fileErrors.length) return { rows: [], fileErrors, unknownColumns };

  const today = todayIso();
  const seen = new Map<string, number>();

  const rows = records.map(({ line, get }) => {
    const issues: RowIssue[] = [];
    const title = get('title');
    const firstName = get('first_name');
    const lastName = get('last_name');
    const email = get('email').toLowerCase();
    nameIssues(firstName, lastName, title, issues);
    emailIssues(email, issues);

    const houseNumberOrName = get('house_name_or_number');
    if (!houseNumberOrName) issues.push({ level: 'error', message: 'House name or number is required by HMRC.' });
    else if (houseNumberOrName.length > MAX_HOUSE) issues.push({ level: 'error', message: `House name or number is over ${MAX_HOUSE} characters.` });

    const rawPostcode = get('postcode');
    const postcode = rawPostcode ? normalisePostcode(rawPostcode) : '';
    if (!postcode) issues.push({ level: 'error', message: 'Postcode is required.' });
    else if (!UK_POSTCODE.test(postcode)) issues.push({ level: 'error', message: `"${rawPostcode}" isn't a valid UK postcode.` });

    const declarationDate = parseUkDate(get('declaration_date'));
    if (!declarationDate) issues.push({ level: 'error', message: `Declaration date "${get('declaration_date')}" isn't valid (use 2026-09-07 or 07/09/2026).` });
    else if (declarationDate > today) issues.push({ level: 'error', message: 'Declaration date is in the future.' });

    const taxpayer = parseYes(get('taxpayer_confirmed'));
    if (taxpayer !== true) {
      issues.push({ level: 'error', message: 'The donor must have confirmed they are a UK taxpayer (taxpayer_confirmed = yes). Without it the declaration isn\'t valid for Gift Aid.' });
    }

    if (email) {
      const firstLine = seen.get(email);
      if (firstLine) issues.push({ level: 'error', message: `Same email as line ${firstLine}: one declaration per donor.` });
      else seen.set(email, line);
    }

    return {
      line, title, firstName, lastName, email, houseNumberOrName,
      addressLine1: get('address_line1'),
      addressLine2: get('address_line2'),
      city: get('city'),
      postcode,
      declarationDate: declarationDate ?? '',
      taxpayerConfirmed: taxpayer === true,
      issues,
    };
  });

  return { rows, fileErrors, unknownColumns };
}

export const hasErrors = (row: { issues: RowIssue[] }) => row.issues.some((i) => i.level === 'error');
