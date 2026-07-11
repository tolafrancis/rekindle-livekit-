import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { supabase } from '@rekindle/supabase';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { toast } from '@rekindle/ui/use-toast';
import { FileSpreadsheet, FileText, Sheet, Loader2, RefreshCw } from 'lucide-react';
import {
  loadEligibleDonations, listClaims, loadCharityDetails, computeReport,
  downloadReportCsv, downloadReportExcel, printReport,
  type EligibleDonationRow, type GiftAidClaim, type CharityDetails, type GiftAidReport,
} from '../giftAid';

interface Props {
  ministryId: string;
  ministryName?: string;
  themeColor?: string;
}

const gbp = (n: number) => {
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n); }
  catch { return `£${n.toFixed(2)}`; }
};
const pct = (n: number | null) => (n == null ? 'n/a' : `${(n * 100).toFixed(1)}%`);

export const GiftAidReports: React.FC<Props> = ({ ministryId, ministryName, themeColor = '#7c3aed' }) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EligibleDonationRow[]>([]);
  const [claims, setClaims] = useState<GiftAidClaim[]>([]);
  const [charity, setCharity] = useState<CharityDetails | null>(null);
  const [campaignNames, setCampaignNames] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [r, c, ch, camps] = await Promise.all([
        loadEligibleDonations(ministryId, {
          from: fromDate ? new Date(fromDate).toISOString() : null,
          to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : null,
        }),
        listClaims(ministryId),
        loadCharityDetails(ministryId),
        supabase.from('ministry_donation_campaigns').select('id, name').eq('ministry_id', ministryId),
      ]);
      setRows(r);
      setClaims(c);
      setCharity(ch);
      const map: Record<string, string> = {};
      (camps.data || []).forEach((x: any) => { map[x.id] = x.name; });
      setCampaignNames(map);
    } catch (err: any) {
      toast({ title: t('giftAidReports', 'error', 'Error'), description: err.message || t('giftAidReports', 'failedLoadReport', 'Failed to load report data'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ministryId, fromDate, toDate]);

  const report: GiftAidReport = useMemo(
    () => computeReport(rows, claims, { periodFrom: fromDate || null, periodTo: toDate || null, campaignNames }),
    [rows, claims, fromDate, toDate, campaignNames],
  );

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin" style={{ color: themeColor }} /></div>;
  }

  const statuses: { key: 'ready' | 'pending' | 'submitted' | 'accepted' | 'rejected'; label: string }[] = [
    { key: 'ready', label: t('giftAidReports', 'awaitingClaim', 'Awaiting claim') },
    { key: 'pending', label: t('giftAidReports', 'inDraftClaim', 'In draft claim') },
    { key: 'submitted', label: t('giftAidReports', 'submittedToHmrc', 'Submitted to HMRC') },
    { key: 'accepted', label: t('giftAidReports', 'accepted', 'Accepted') },
    { key: 'rejected', label: t('giftAidReports', 'rejected', 'Rejected') },
  ];

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">{t('giftAidReports', 'from', 'From')}</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t('giftAidReports', 'to', 'To')}</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" /> {t('giftAidReports', 'refresh', 'Refresh')}
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => downloadReportCsv(report)}>
            <FileText className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadReportExcel(report)}>
            <Sheet className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => printReport(report, charity, ministryName)}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> PDF
          </Button>
        </CardContent>
      </Card>

      {/* Headline cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500">{t('giftAidReports', 'eligibleDonations', 'Eligible donations')}</p>
          <p className="text-2xl font-bold">{report.totals.eligibleCount}</p>
          <p className="text-xs text-gray-400">{gbp(report.totals.eligibleAmount)} {t('giftAidReports', 'total', 'total')}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500">{t('giftAidReports', 'estimatedGiftAid', 'Estimated Gift Aid')}</p>
          <p className="text-2xl font-bold" style={{ color: themeColor }}>{gbp(report.totals.estimatedGiftAid)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500">{t('giftAidReports', 'acceptedGiftAid', 'Accepted Gift Aid')}</p>
          <p className="text-2xl font-bold text-green-700">{gbp(report.accepted.giftAid)}</p>
          <p className="text-xs text-gray-400">{report.accepted.count} {t('giftAidReports', 'donations', 'donations')}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500">{t('giftAidReports', 'successRateValue', 'Success rate (value)')}</p>
          <p className="text-2xl font-bold">{pct(report.successRateByValue)}</p>
          <p className="text-xs text-gray-400">{t('giftAidReports', 'acceptedVsRejected', 'accepted vs rejected')}</p>
        </CardContent></Card>
      </div>

      {report.totals.nonGbpEligibleCount > 0 && (
        <p className="text-xs text-amber-600">
          {t('giftAidReports', 'nonGbpExcluded', '{count} eligible non-GBP donation(s) are excluded from these money totals — HMRC claims are in GBP.').replace('{count}', String(report.totals.nonGbpEligibleCount))}
        </p>
      )}

      {/* By status */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('giftAidReports', 'byStatus', 'By status')}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="p-3 font-medium">{t('giftAidReports', 'status', 'Status')}</th>
              <th className="p-3 font-medium text-right">{t('giftAidReports', 'donationsCol', 'Donations')}</th>
              <th className="p-3 font-medium text-right">{t('giftAidReports', 'amount', 'Amount')}</th>
              <th className="p-3 font-medium text-right">{t('giftAidReports', 'giftAid', 'Gift Aid')}</th>
            </tr></thead>
            <tbody>
              {statuses.map((s) => {
                const b = report.byStatus[s.key];
                return (
                  <tr key={s.key} className="border-b last:border-0">
                    <td className="p-3">{s.label}</td>
                    <td className="p-3 text-right">{b.count}</td>
                    <td className="p-3 text-right">{gbp(b.amount)}</td>
                    <td className="p-3 text-right">{gbp(b.giftAid)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* By fund */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('giftAidReports', 'byFund', 'By fund')}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="p-3 font-medium">{t('giftAidReports', 'fund', 'Fund')}</th>
              <th className="p-3 font-medium text-right">{t('giftAidReports', 'donationsCol', 'Donations')}</th>
              <th className="p-3 font-medium text-right">{t('giftAidReports', 'amount', 'Amount')}</th>
              <th className="p-3 font-medium text-right">{t('giftAidReports', 'giftAid', 'Gift Aid')}</th>
            </tr></thead>
            <tbody>
              {report.byFund.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-gray-400">{t('giftAidReports', 'noEligibleYet', 'No eligible donations yet.')}</td></tr>
              )}
              {report.byFund.map((f) => (
                <tr key={f.key} className="border-b last:border-0">
                  <td className="p-3">{f.label}</td>
                  <td className="p-3 text-right">{f.count}</td>
                  <td className="p-3 text-right">{gbp(f.amount)}</td>
                  <td className="p-3 text-right">{gbp(f.giftAid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* By campaign */}
      {report.byCampaign.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('giftAidReports', 'byCampaign', 'By campaign')}</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500 border-b">
                <th className="p-3 font-medium">{t('giftAidReports', 'campaign', 'Campaign')}</th>
                <th className="p-3 font-medium text-right">{t('giftAidReports', 'donationsCol', 'Donations')}</th>
                <th className="p-3 font-medium text-right">{t('giftAidReports', 'amount', 'Amount')}</th>
                <th className="p-3 font-medium text-right">{t('giftAidReports', 'giftAid', 'Gift Aid')}</th>
              </tr></thead>
              <tbody>
                {report.byCampaign.map((c) => (
                  <tr key={c.key} className="border-b last:border-0">
                    <td className="p-3">{c.label}</td>
                    <td className="p-3 text-right">{c.count}</td>
                    <td className="p-3 text-right">{gbp(c.amount)}</td>
                    <td className="p-3 text-right">{gbp(c.giftAid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Claims summary */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('giftAidReports', 'claimsCount', 'Claims ({count})').replace('{count}', String(report.claims.total))}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          {(['draft', 'ready', 'submitted', 'accepted', 'rejected'] as const).map((s) => (
            <div key={s} className="rounded-lg border p-3">
              <p className="text-xs text-gray-500 capitalize">{s}</p>
              <p className="text-xl font-bold">{report.claims.byStatus[s]}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default GiftAidReports;
