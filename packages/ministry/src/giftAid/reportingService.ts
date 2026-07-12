// =============================================================================
// Gift Aid — reporting service (Phase 4)
// Folder: src/lib/giftAid/
// -----------------------------------------------------------------------------
// Aggregates the report set (totals, claimed/pending/rejected, success rate,
// by fund, by campaign, claims summary) from the data Phases 2–3 already expose
// — no new SQL. Money figures are restricted to GBP (the claimable universe);
// non-GBP eligible donations are reported as a separate count.
//
// Exports: CSV (native), Excel (dependency-free .xls via an HTML table that
// Excel/Sheets/LibreOffice open), and PDF (a print-optimised window).
// =============================================================================

import { downloadTextFile } from '@rekindle/features/qrCode';
import type { EligibleDonationRow, GiftAidClaimStatus } from './eligibilityService';
import type { GiftAidClaim, ClaimStatus, CharityDetails } from './claimsService';

export interface StatusBucket { count: number; amount: number; giftAid: number; }
export interface GroupRow { key: string; label: string; count: number; amount: number; giftAid: number; }

export interface GiftAidReport {
  generatedAt: string;
  periodFrom?: string | null;
  periodTo?: string | null;
  currency: string;
  totals: {
    totalDonations: number;
    eligibleCount: number;
    ineligibleCount: number;
    eligibleAmount: number;
    estimatedGiftAid: number;
    nonGbpEligibleCount: number;
  };
  byStatus: Record<GiftAidClaimStatus, StatusBucket>;
  awaiting: StatusBucket;   // ready + pending (not yet with HMRC)
  claimed: StatusBucket;    // submitted + accepted + rejected (sent into claims)
  accepted: StatusBucket;
  rejected: StatusBucket;
  successRateByValue: number | null; // accepted / (accepted + rejected) gift aid
  successRateByCount: number | null;
  byFund: GroupRow[];
  byCampaign: GroupRow[];
  claims: {
    total: number;
    byStatus: Record<ClaimStatus, number>;
    submittedGiftAid: number;
    acceptedGiftAid: number;
    rejectedGiftAid: number;
  };
}

const emptyBucket = (): StatusBucket => ({ count: 0, amount: 0, giftAid: 0 });
const addTo = (b: StatusBucket, amount: number, giftAid: number) => {
  b.count += 1; b.amount += amount; b.giftAid += giftAid;
};
const sumBuckets = (...b: StatusBucket[]): StatusBucket =>
  b.reduce((acc, x) => ({ count: acc.count + x.count, amount: acc.amount + x.amount, giftAid: acc.giftAid + x.giftAid }), emptyBucket());

export interface ComputeReportOptions {
  periodFrom?: string | null;
  periodTo?: string | null;
  campaignNames?: Record<string, string>;
}

export function computeReport(
  rows: EligibleDonationRow[],
  claims: GiftAidClaim[],
  opts: ComputeReportOptions = {},
): GiftAidReport {
  const campaignNames = opts.campaignNames || {};

  const byStatus: Record<GiftAidClaimStatus, StatusBucket> = {
    ready: emptyBucket(), pending: emptyBucket(), submitted: emptyBucket(),
    accepted: emptyBucket(), rejected: emptyBucket(),
  };
  const fundMap = new Map<string, GroupRow>();
  const campaignMap = new Map<string, GroupRow>();

  let eligibleCount = 0, ineligibleCount = 0, eligibleAmount = 0, estimatedGiftAid = 0, nonGbpEligibleCount = 0;

  for (const r of rows) {
    if (!r.eligible) { ineligibleCount++; continue; }
    if ((r.currency || 'GBP') !== 'GBP') { nonGbpEligibleCount++; continue; }

    eligibleCount++;
    eligibleAmount += r.amount;
    estimatedGiftAid += r.estimatedGiftAid;

    const bucket = byStatus[r.claimStatus] || byStatus.ready;
    addTo(bucket, r.amount, r.estimatedGiftAid);

    const fundKey = r.fundAllocation || 'General';
    const f = fundMap.get(fundKey) || { key: fundKey, label: fundKey, count: 0, amount: 0, giftAid: 0 };
    f.count++; f.amount += r.amount; f.giftAid += r.estimatedGiftAid;
    fundMap.set(fundKey, f);

    if (r.campaignId) {
      const c = campaignMap.get(r.campaignId)
        || { key: r.campaignId, label: campaignNames[r.campaignId] || 'Campaign', count: 0, amount: 0, giftAid: 0 };
      c.count++; c.amount += r.amount; c.giftAid += r.estimatedGiftAid;
      campaignMap.set(r.campaignId, c);
    }
  }

  const awaiting = sumBuckets(byStatus.ready, byStatus.pending);
  const claimed = sumBuckets(byStatus.submitted, byStatus.accepted, byStatus.rejected);
  const accepted = byStatus.accepted;
  const rejected = byStatus.rejected;

  const valDenom = accepted.giftAid + rejected.giftAid;
  const cntDenom = accepted.count + rejected.count;

  const claimByStatus: Record<ClaimStatus, number> = { draft: 0, ready: 0, submitted: 0, accepted: 0, rejected: 0 };
  let submittedGiftAid = 0, acceptedGiftAid = 0, rejectedGiftAid = 0;
  for (const c of claims) {
    claimByStatus[c.status] = (claimByStatus[c.status] || 0) + 1;
    if (c.status === 'submitted') submittedGiftAid += Number(c.total_gift_aid);
    if (c.status === 'accepted') acceptedGiftAid += Number(c.total_gift_aid);
    if (c.status === 'rejected') rejectedGiftAid += Number(c.total_gift_aid);
  }

  return {
    generatedAt: new Date().toISOString(),
    periodFrom: opts.periodFrom ?? null,
    periodTo: opts.periodTo ?? null,
    currency: 'GBP',
    totals: {
      totalDonations: rows.length,
      eligibleCount,
      ineligibleCount,
      eligibleAmount,
      estimatedGiftAid,
      nonGbpEligibleCount,
    },
    byStatus,
    awaiting,
    claimed,
    accepted,
    rejected,
    successRateByValue: valDenom > 0 ? accepted.giftAid / valDenom : null,
    successRateByCount: cntDenom > 0 ? accepted.count / cntDenom : null,
    byFund: Array.from(fundMap.values()).sort((a, b) => b.giftAid - a.giftAid),
    byCampaign: Array.from(campaignMap.values()).sort((a, b) => b.giftAid - a.giftAid),
    claims: { total: claims.length, byStatus: claimByStatus, submittedGiftAid, acceptedGiftAid, rejectedGiftAid },
  };
}

// -- formatting helpers -------------------------------------------------------

const gbp = (n: number) => {
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n); }
  catch { return `£${n.toFixed(2)}`; }
};
const pct = (n: number | null) => (n == null ? 'n/a' : `${(n * 100).toFixed(1)}%`);

// -- CSV ----------------------------------------------------------------------

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildReportCsv(report: GiftAidReport): string {
  const L: string[] = [];
  L.push('Gift Aid Report');
  L.push(`Generated,${csvCell(new Date(report.generatedAt).toLocaleString())}`);
  if (report.periodFrom || report.periodTo) L.push(`Period,${report.periodFrom || ''} to ${report.periodTo || ''}`);
  L.push('');
  L.push('Summary,Count,Amount (GBP),Gift Aid (GBP)');
  L.push(`Eligible donations,${report.totals.eligibleCount},${report.totals.eligibleAmount.toFixed(2)},${report.totals.estimatedGiftAid.toFixed(2)}`);
  L.push(`Awaiting claim,${report.awaiting.count},${report.awaiting.amount.toFixed(2)},${report.awaiting.giftAid.toFixed(2)}`);
  L.push(`Claimed (sent to HMRC),${report.claimed.count},${report.claimed.amount.toFixed(2)},${report.claimed.giftAid.toFixed(2)}`);
  L.push(`Accepted,${report.accepted.count},${report.accepted.amount.toFixed(2)},${report.accepted.giftAid.toFixed(2)}`);
  L.push(`Rejected,${report.rejected.count},${report.rejected.amount.toFixed(2)},${report.rejected.giftAid.toFixed(2)}`);
  L.push(`Success rate (by value),${pct(report.successRateByValue)}`);
  L.push(`Success rate (by count),${pct(report.successRateByCount)}`);
  L.push('');
  L.push('By status,Count,Amount (GBP),Gift Aid (GBP)');
  (['ready', 'pending', 'submitted', 'accepted', 'rejected'] as GiftAidClaimStatus[]).forEach((s) => {
    const b = report.byStatus[s];
    L.push(`${s},${b.count},${b.amount.toFixed(2)},${b.giftAid.toFixed(2)}`);
  });
  L.push('');
  L.push('By fund,Count,Amount (GBP),Gift Aid (GBP)');
  report.byFund.forEach((f) => L.push(`${csvCell(f.label)},${f.count},${f.amount.toFixed(2)},${f.giftAid.toFixed(2)}`));
  if (report.byCampaign.length) {
    L.push('');
    L.push('By campaign,Count,Amount (GBP),Gift Aid (GBP)');
    report.byCampaign.forEach((c) => L.push(`${csvCell(c.label)},${c.count},${c.amount.toFixed(2)},${c.giftAid.toFixed(2)}`));
  }
  L.push('');
  L.push('Claims,Count');
  (['draft', 'ready', 'submitted', 'accepted', 'rejected'] as ClaimStatus[]).forEach((s) =>
    L.push(`${s},${report.claims.byStatus[s]}`));
  if (report.totals.nonGbpEligibleCount > 0) {
    L.push('');
    L.push(`Note,${report.totals.nonGbpEligibleCount} eligible non-GBP donation(s) excluded from money totals`);
  }
  return L.join('\r\n');
}

// -- shared HTML table fragments (used by Excel + print) ----------------------

function reportTablesHtml(report: GiftAidReport): string {
  const row = (cells: (string | number)[], th = false) =>
    `<tr>${cells.map((c) => `<${th ? 'th' : 'td'}>${c}</${th ? 'th' : 'td'}>`).join('')}</tr>`;

  const summary = `
    <h3>Summary</h3>
    <table>
      ${row(['Metric', 'Count', 'Amount', 'Gift Aid'], true)}
      ${row(['Eligible donations', report.totals.eligibleCount, gbp(report.totals.eligibleAmount), gbp(report.totals.estimatedGiftAid)])}
      ${row(['Awaiting claim', report.awaiting.count, gbp(report.awaiting.amount), gbp(report.awaiting.giftAid)])}
      ${row(['Claimed (sent to HMRC)', report.claimed.count, gbp(report.claimed.amount), gbp(report.claimed.giftAid)])}
      ${row(['Accepted', report.accepted.count, gbp(report.accepted.amount), gbp(report.accepted.giftAid)])}
      ${row(['Rejected', report.rejected.count, gbp(report.rejected.amount), gbp(report.rejected.giftAid)])}
      ${row(['Success rate (by value)', pct(report.successRateByValue), '', ''])}
      ${row(['Success rate (by count)', pct(report.successRateByCount), '', ''])}
    </table>`;

  const fund = `
    <h3>By fund</h3>
    <table>
      ${row(['Fund', 'Count', 'Amount', 'Gift Aid'], true)}
      ${report.byFund.map((f) => row([f.label, f.count, gbp(f.amount), gbp(f.giftAid)])).join('')}
    </table>`;

  const campaign = report.byCampaign.length ? `
    <h3>By campaign</h3>
    <table>
      ${row(['Campaign', 'Count', 'Amount', 'Gift Aid'], true)}
      ${report.byCampaign.map((c) => row([c.label, c.count, gbp(c.amount), gbp(c.giftAid)])).join('')}
    </table>` : '';

  const claims = `
    <h3>Claims</h3>
    <table>
      ${row(['Status', 'Claims'], true)}
      ${(['draft', 'ready', 'submitted', 'accepted', 'rejected'] as ClaimStatus[])
        .map((s) => row([s, report.claims.byStatus[s]])).join('')}
    </table>`;

  return summary + fund + campaign + claims;
}

export function buildReportExcelHtml(report: GiftAidReport, title = 'Gift Aid Report'): string {
  // An HTML table with the ms-excel MIME opens directly in Excel/Sheets.
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"><style>table{border-collapse:collapse;margin-bottom:16px}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}th{background:#eee}</style></head>
<body><h2>${title}</h2><p>Generated ${new Date(report.generatedAt).toLocaleString()}</p>
${reportTablesHtml(report)}
</body></html>`;
}

export function buildReportPrintableHtml(
  report: GiftAidReport,
  charity?: CharityDetails | null,
  ministryName?: string,
): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Gift Aid Report</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;margin:32px;}
  h1{font-size:20px;margin:0 0 4px;} h3{margin:20px 0 6px;font-size:14px;color:#4c1d95;}
  .meta{color:#6b7280;font-size:12px;margin-bottom:8px;}
  table{border-collapse:collapse;width:100%;margin-bottom:8px;font-size:12px;}
  th,td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left;}
  th{background:#f3f4f6;}
  td:nth-child(n+2),th:nth-child(n+2){text-align:right;}
  @media print{button{display:none;}}
</style></head><body>
<h1>Gift Aid Report${ministryName ? ` — ${ministryName}` : ''}</h1>
<div class="meta">
  ${charity?.charityName ? `${charity.charityName} · ` : ''}${charity?.hmrcReference ? `HMRC ${charity.hmrcReference} · ` : ''}
  Generated ${new Date(report.generatedAt).toLocaleString()}
  ${report.periodFrom || report.periodTo ? ` · Period ${report.periodFrom || '—'} to ${report.periodTo || '—'}` : ''}
</div>
${reportTablesHtml(report)}
${report.totals.nonGbpEligibleCount > 0 ? `<p class="meta">Note: ${report.totals.nonGbpEligibleCount} eligible non-GBP donation(s) are excluded from money totals (HMRC claims are GBP).</p>` : ''}
<button onclick="window.print()">Print / Save as PDF</button>
</body></html>`;
}

// -- download / print wrappers ------------------------------------------------

export function downloadReportCsv(report: GiftAidReport, filename = 'gift-aid-report.csv') {
  downloadTextFile(buildReportCsv(report), filename, 'text/csv');
}

export function downloadReportExcel(report: GiftAidReport, filename = 'gift-aid-report.xls') {
  downloadTextFile(buildReportExcelHtml(report), filename, 'application/vnd.ms-excel');
}

export function printReport(report: GiftAidReport, charity?: CharityDetails | null, ministryName?: string) {
  const html = buildReportPrintableHtml(report, charity, ministryName);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  // give the new window a tick to render before printing
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* user can print manually */ } }, 300);
}
