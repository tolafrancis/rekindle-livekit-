export const R68_NAMESPACE = 'http://www.govtalk.gov.uk/taxation/charities/r68/2';
export const GOVTALK_NAMESPACE = 'http://www.govtalk.gov.uk/CM/envelope';

export interface R68LineItem {
  fore: string; sur: string; house: string; postcode: string; date: string; total: number;
}

export type Regulator =
  | { kind: 'named'; regName: 'CCEW' | 'CCNI' | 'OSCR'; regNo: string }
  | { kind: 'none' }
  | { kind: 'other'; otherReg: string; regNo?: string };

export interface R68Charity {
  orgName: string; hmrcRef: string;
  officialFore: string; officialSur: string; officialPhone: string; officialPostcode: string;
  regulator: Regulator;
}

export const xeText = (v: unknown): string =>
  (v == null ? '' : String(v))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\r/g, '&#xD;');

export const xeAttr = (v: unknown): string =>
  (v == null ? '' : String(v))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');

export const isoDate = (d: string): string => {
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date(s).toISOString().slice(0, 10);
};

export function buildRegulatorXml(charity: R68Charity): string {
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

export function buildR68(charity: R68Charity, items: R68LineItem[]): string {
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

export function buildIRenvelope(
  charity: R68Charity, periodEnd: string, r68: string, irmark: string | null,
): string {
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

export async function computeIRmark(irenvelopeWithoutMark: string): Promise<string> {
  return sha1Base64(`<Body xmlns="${GOVTALK_NAMESPACE}">` + irenvelopeWithoutMark + `</Body>`);
}

export async function buildR68Envelope(
  charity: R68Charity, items: R68LineItem[], periodEnd: string,
): Promise<{ xml: string; irmark: string }> {
  const r68 = buildR68(charity, items);
  const forMark = buildIRenvelope(charity, periodEnd, r68, null);
  const irmark = await computeIRmark(forMark);
  const xml = buildIRenvelope(charity, periodEnd, r68, irmark);
  return { xml, irmark };
}
