import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '../ui/use-toast';
import {
  HandCoins, Loader2, RefreshCw, Search, CheckCircle2, XCircle, Ban, RotateCcw, Settings,
  FileDown, HelpCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  loadGiftAidSettings,
  loadEligibleDonations,
  loadEligibleLineItems,
  downloadEligibleHmrcCsv,
  setDonationExclusion,
  computeGiftAidSummary,
  reasonLabel,
  type EligibleDonationRow,
} from '@/lib/giftAid';
import { GiftAidClaimsManager } from './GiftAidClaimsManager';
import { GiftAidReports } from './GiftAidReports';
import { GiftAidDeclarationsManager } from './GiftAidDeclarationsManager';

interface Props {
  ministryId: string;
  ministryName?: string;
  themeColor?: string;
  /** Pass the ministry country_code so we can self-gate to the UK. */
  countryCode?: string | null;
  /** Optional: jump the user to the Settings tab to enable Gift Aid. */
  onGoToSettings?: () => void;
}

type StatusFilter = 'all' | 'eligible' | 'ineligible' | 'ready' | 'pending' | 'submitted' | 'accepted' | 'rejected';

const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
};

export const MinistryGiftAidDashboard: React.FC<Props> = ({
  ministryId,
  ministryName,
  themeColor = '#7c3aed',
  countryCode,
  onGoToSettings,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [view, setView] = useState<'donations' | 'claims' | 'declarations' | 'reports'>('donations');
  const [csvBusy, setCsvBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [rows, setRows] = useState<EligibleDonationRow[]>([]);
  const [campaignNames, setCampaignNames] = useState<Record<string, string>>({});

  // filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [fundFilter, setFundFilter] = useState<string>('all');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const isUk = (countryCode ?? '').trim().toUpperCase() === 'GB';

  const load = async () => {
    setLoading(true);
    try {
      const settings = await loadGiftAidSettings(ministryId);
      setEnabled(settings.enabled);
      if (!settings.enabled) {
        setRows([]);
        return;
      }
      const data = await loadEligibleDonations(ministryId, {
        from: fromDate ? new Date(fromDate).toISOString() : null,
        to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : null,
      });
      setRows(data);

      // campaign names for the filter + table
      const { data: camps } = await supabase
        .from('ministry_donation_campaigns')
        .select('id, name')
        .eq('ministry_id', ministryId);
      const map: Record<string, string> = {};
      (camps || []).forEach((c: any) => { map[c.id] = c.name; });
      setCampaignNames(map);
    } catch (err: any) {
      toast({ title: t('ministryGiftAidDashboard', 'error', 'Error'), description: err.message || t('ministryGiftAidDashboard', 'failedLoadData', 'Failed to load Gift Aid data'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ministryId, fromDate, toDate]);

  const funds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.fundAllocation).filter(Boolean))) as string[],
    [rows],
  );
  const campaignsInData = useMemo(
    () => Array.from(new Set(rows.map((r) => r.campaignId).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (term) {
        const hay = `${r.donorName || ''} ${r.donorEmail || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (fundFilter !== 'all' && r.fundAllocation !== fundFilter) return false;
      if (campaignFilter !== 'all' && r.campaignId !== campaignFilter) return false;
      if (statusFilter === 'eligible' && !r.eligible) return false;
      if (statusFilter === 'ineligible' && r.eligible) return false;
      if (['ready', 'pending', 'submitted', 'accepted', 'rejected'].includes(statusFilter)) {
        if (!r.eligible || r.claimStatus !== statusFilter) return false;
      }
      return true;
    });
  }, [rows, search, fundFilter, campaignFilter, statusFilter]);

  const summary = useMemo(() => computeGiftAidSummary(rows), [rows]);

  const handleDownloadHmrcCsv = async () => {
    setCsvBusy(true);
    try {
      const lineItems = await loadEligibleLineItems(ministryId, {
        from: fromDate ? new Date(fromDate).toISOString() : null,
        to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : null,
      });
      if (lineItems.length === 0) {
        toast({ title: t('ministryGiftAidDashboard', 'nothingToExport', 'Nothing to export'), description: t('ministryGiftAidDashboard', 'noEligibleGbp', 'No eligible, unclaimed GBP donations in this period.') });
        return;
      }
      const { exported, skipped } = downloadEligibleHmrcCsv(ministryName || 'ministry', lineItems);
      toast({
        title: t('ministryGiftAidDashboard', 'csvDownloaded', 'CSV downloaded'),
        description: skipped > 0
          ? t('ministryGiftAidDashboard', 'csvIncludedSkipped', "{exported} donor(s) included; {skipped} skipped for incomplete details. Open it in HMRC's schedule spreadsheet to file.").replace('{exported}', String(exported)).replace('{skipped}', String(skipped))
          : t('ministryGiftAidDashboard', 'csvIncluded', "{exported} donor(s) included. Open it in HMRC's schedule spreadsheet to file.").replace('{exported}', String(exported)),
      });
    } catch (err: any) {
      toast({ title: t('ministryGiftAidDashboard', 'error', 'Error'), description: err.message || t('ministryGiftAidDashboard', 'failedBuildCsv', 'Failed to build CSV'), variant: 'destructive' });
    } finally {
      setCsvBusy(false);
    }
  };

  const toggleExclude = async (row: EligibleDonationRow) => {
    try {
      let reason: string | undefined;
      if (!row.adminExcluded) {
        const input = window.prompt(
          t('ministryGiftAidDashboard', 'excludePrompt', 'Exclude this donation from Gift Aid (e.g. corporate gift, donor received a benefit). Optional reason:'),
          '',
        );
        if (input === null) return; // cancelled
        reason = input || undefined;
      }
      await setDonationExclusion(ministryId, row.donationId, !row.adminExcluded, reason, user?.id);
      toast({ title: row.adminExcluded ? t('ministryGiftAidDashboard', 'donationReIncluded', 'Donation re-included') : t('ministryGiftAidDashboard', 'donationExcluded', 'Donation excluded') });
      load();
    } catch (err: any) {
      toast({ title: t('ministryGiftAidDashboard', 'error', 'Error'), description: err.message || t('ministryGiftAidDashboard', 'failedUpdate', 'Failed to update'), variant: 'destructive' });
    }
  };

  if (!isUk) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-600">
          {t('ministryGiftAidDashboard', 'ukOnlyScheme', 'Gift Aid is a UK-only scheme. Set this ministry’s country to the United Kingdom in Settings to use it.')}
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: themeColor }} />
      </div>
    );
  }

  if (!enabled) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <HandCoins className="h-10 w-10 mx-auto text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-700">{t('ministryGiftAidDashboard', 'notEnabledYet', 'Gift Aid isn’t enabled yet')}</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            {t('ministryGiftAidDashboard', 'notEnabledBody', 'Turn on Gift Aid in your ministry Settings and add your charity details to start tracking claimable donations.')}
          </p>
          {onGoToSettings && (
            <Button onClick={onGoToSettings} variant="outline">
              <Settings className="h-4 w-4 mr-2" /> {t('ministryGiftAidDashboard', 'goToSettings', 'Go to Settings')}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <HandCoins className="h-5 w-5" style={{ color: themeColor }} />
            {t('ministryGiftAidDashboard', 'giftAidClaims', 'Gift Aid Claims')}
          </h2>
          <p className="text-sm text-gray-500">{ministryName || t('ministryGiftAidDashboard', 'yourMinistry', 'Your ministry')} · {t('ministryGiftAidDashboard', 'ukDonations', 'UK donations')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border p-0.5">
            <button
              onClick={() => setView('donations')}
              className={`px-3 py-1.5 text-sm rounded-md ${view === 'donations' ? 'bg-gray-100 font-medium' : 'text-gray-500'}`}
            >
              {t('ministryGiftAidDashboard', 'donations', 'Donations')}
            </button>
            <button
              onClick={() => setView('claims')}
              className={`px-3 py-1.5 text-sm rounded-md ${view === 'claims' ? 'bg-gray-100 font-medium' : 'text-gray-500'}`}
            >
              {t('ministryGiftAidDashboard', 'claims', 'Claims')}
            </button>
            <button
              onClick={() => setView('declarations')}
              className={`px-3 py-1.5 text-sm rounded-md ${view === 'declarations' ? 'bg-gray-100 font-medium' : 'text-gray-500'}`}
            >
              {t('ministryGiftAidDashboard', 'declarations', 'Declarations')}
            </button>
            <button
              onClick={() => setView('reports')}
              className={`px-3 py-1.5 text-sm rounded-md ${view === 'reports' ? 'bg-gray-100 font-medium' : 'text-gray-500'}`}
            >
              {t('ministryGiftAidDashboard', 'reports', 'Reports')}
            </button>
          </div>
          {view === 'donations' && (
            <>
              <Button variant="outline" size="sm" onClick={handleDownloadHmrcCsv} disabled={csvBusy}>
                {csvBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
                {t('ministryGiftAidDashboard', 'downloadCsvHmrc', 'Download CSV for HMRC')}
              </Button>
              <Button variant="outline" size="sm" onClick={load}>
                <RefreshCw className="h-4 w-4 mr-1" /> {t('ministryGiftAidDashboard', 'refresh', 'Refresh')}
              </Button>
            </>
          )}
        </div>
      </div>

      {view === 'claims' && (
        <GiftAidClaimsManager ministryId={ministryId} themeColor={themeColor} />
      )}

      {view === 'declarations' && (
        <GiftAidDeclarationsManager ministryId={ministryId} themeColor={themeColor} />
      )}

      {view === 'reports' && (
        <GiftAidReports ministryId={ministryId} ministryName={ministryName} themeColor={themeColor} />
      )}

      {view === 'donations' && (
        <>
      {/* How to file manually */}
      <Card>
        <button
          onClick={() => setShowGuide((s) => !s)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <span className="flex items-center gap-2 font-medium">
            <HelpCircle className="h-4 w-4" style={{ color: themeColor }} />
            {t('ministryGiftAidDashboard', 'howToFileManually', 'How to file a Gift Aid claim manually (no API needed)')}
          </span>
          {showGuide ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>
        {showGuide && (
          <CardContent className="pt-0 text-sm text-gray-600 space-y-2">
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>{t('ministryGiftAidDashboard', 'guideStep1Pre', 'Click')} <span className="font-medium">{t('ministryGiftAidDashboard', 'downloadCsvHmrc', 'Download CSV for HMRC')}</span> {t('ministryGiftAidDashboard', 'guideStep1Post', 'above to get your donor schedule (eligible, unclaimed donations).')}</li>
              <li>{t('ministryGiftAidDashboard', 'guideStep2Pre', 'Sign in to')} <span className="font-medium">{t('ministryGiftAidDashboard', 'hmrcCharitiesOnline', 'HMRC Charities Online')}</span> {t('ministryGiftAidDashboard', 'guideStep2Post', 'with your Government Gateway login at gov.uk and start a Gift Aid repayment claim.')}</li>
              <li>{t('ministryGiftAidDashboard', 'guideStep3Pre', "When asked to attach donations, open HMRC's downloadable")} <span className="font-medium">{t('ministryGiftAidDashboard', 'scheduleSpreadsheet', 'schedule spreadsheet')}</span> {t('ministryGiftAidDashboard', 'guideStep3Post', 'and copy the rows from our CSV into it — the columns are in the same order (Title, First name, Last name, House name or number, Postcode, Donation date, Amount).')}</li>
              <li>{t('ministryGiftAidDashboard', 'guideStep4Pre', 'Check the totals, then submit on the HMRC website and note the')} <span className="font-medium">{t('ministryGiftAidDashboard', 'hmrcSubmissionReference', 'HMRC submission reference')}</span>.</li>
              <li>{t('ministryGiftAidDashboard', 'guideStep5Pre', 'Come back here, open the matching claim under')} <span className="font-medium">{t('ministryGiftAidDashboard', 'claims', 'Claims')}</span>, {t('ministryGiftAidDashboard', 'guideStep5Mid', 'and click')} <span className="font-medium">{t('ministryGiftAidDashboard', 'markSubmittedManually', 'Mark submitted manually')}</span> {t('ministryGiftAidDashboard', 'guideStep5Post', '— enter that reference. Later mark it Accepted or Rejected when HMRC responds.')}</li>
            </ol>
            <p className="text-xs text-gray-500">
              {t('ministryGiftAidDashboard', 'completeRecordsNote', "Only complete donor records (name, house number/address and postcode) are included — anything incomplete is skipped so HMRC doesn't reject the claim.")}
            </p>
          </CardContent>
        )}
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">{t('ministryGiftAidDashboard', 'eligibleDonations', 'Eligible donations')}</p>
            <p className="text-2xl font-bold">{summary.eligibleCount}</p>
            <p className="text-xs text-gray-400">{t('ministryGiftAidDashboard', 'ofXTotal', 'of {total} total').replace('{total}', String(summary.totalDonations))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">{t('ministryGiftAidDashboard', 'eligibleTotalGbp', 'Eligible total (GBP)')}</p>
            <p className="text-2xl font-bold">{money(summary.gbpEligibleAmount, 'GBP')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">{t('ministryGiftAidDashboard', 'estimatedGiftAid', 'Estimated Gift Aid (25%)')}</p>
            <p className="text-2xl font-bold" style={{ color: themeColor }}>
              {money(summary.gbpEstimatedGiftAid, 'GBP')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">{t('ministryGiftAidDashboard', 'claimStatus', 'Claim status')}</p>
            <div className="text-xs text-gray-600 mt-1 space-y-0.5">
              <div>{t('ministryGiftAidDashboard', 'readyLabel', 'Ready')}: <span className="font-medium">{summary.claimStatusCounts.ready}</span></div>
              <div>{t('ministryGiftAidDashboard', 'submittedLabel', 'Submitted')}: <span className="font-medium">{summary.claimStatusCounts.submitted}</span></div>
              <div>{t('ministryGiftAidDashboard', 'acceptedLabel', 'Accepted')}: <span className="font-medium">{summary.claimStatusCounts.accepted}</span> · {t('ministryGiftAidDashboard', 'rejectedLabel', 'Rejected')}: <span className="font-medium">{summary.claimStatusCounts.rejected}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {summary.hasNonGbpEligible && (
        <p className="text-xs text-amber-600">
          {t('ministryGiftAidDashboard', 'nonGbpWarning', 'Some eligible donations are in a non-GBP currency. HMRC claims are in GBP — the headline estimate covers GBP donations only. Non-GBP gifts are listed below for review.')}
        </p>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-1">
            <Label className="text-xs">{t('ministryGiftAidDashboard', 'searchDonor', 'Search donor')}</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('ministryGiftAidDashboard', 'nameOrEmail', 'Name or email')} />
            </div>
          </div>
          <div>
            <Label className="text-xs">{t('ministryGiftAidDashboard', 'status', 'Status')}</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ministryGiftAidDashboard', 'all', 'All')}</SelectItem>
                <SelectItem value="eligible">{t('ministryGiftAidDashboard', 'eligible', 'Eligible')}</SelectItem>
                <SelectItem value="ineligible">{t('ministryGiftAidDashboard', 'ineligible', 'Ineligible')}</SelectItem>
                <SelectItem value="ready">{t('ministryGiftAidDashboard', 'readyToClaim', 'Ready to claim')}</SelectItem>
                <SelectItem value="pending">{t('ministryGiftAidDashboard', 'pending', 'Pending')}</SelectItem>
                <SelectItem value="submitted">{t('ministryGiftAidDashboard', 'submittedLabel', 'Submitted')}</SelectItem>
                <SelectItem value="accepted">{t('ministryGiftAidDashboard', 'acceptedLabel', 'Accepted')}</SelectItem>
                <SelectItem value="rejected">{t('ministryGiftAidDashboard', 'rejectedLabel', 'Rejected')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t('ministryGiftAidDashboard', 'fund', 'Fund')}</Label>
            <Select value={fundFilter} onValueChange={setFundFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ministryGiftAidDashboard', 'allFunds', 'All funds')}</SelectItem>
                {funds.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t('ministryGiftAidDashboard', 'from', 'From')}</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t('ministryGiftAidDashboard', 'to', 'To')}</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          {campaignsInData.length > 0 && (
            <div>
              <Label className="text-xs">{t('ministryGiftAidDashboard', 'campaign', 'Campaign')}</Label>
              <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('ministryGiftAidDashboard', 'allCampaigns', 'All campaigns')}</SelectItem>
                  {campaignsInData.map((c) => (
                    <SelectItem key={c} value={c}>{campaignNames[c] || t('ministryGiftAidDashboard', 'campaign', 'Campaign')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('ministryGiftAidDashboard', 'donationsCount', 'Donations ({count})').replace('{count}', String(filtered.length))}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="p-3 font-medium">{t('ministryGiftAidDashboard', 'donor', 'Donor')}</th>
                <th className="p-3 font-medium">{t('ministryGiftAidDashboard', 'date', 'Date')}</th>
                <th className="p-3 font-medium">{t('ministryGiftAidDashboard', 'amount', 'Amount')}</th>
                <th className="p-3 font-medium">{t('ministryGiftAidDashboard', 'fund', 'Fund')}</th>
                <th className="p-3 font-medium">{t('ministryGiftAidDashboard', 'eligibility', 'Eligibility')}</th>
                <th className="p-3 font-medium">{t('ministryGiftAidDashboard', 'estGiftAid', 'Est. Gift Aid')}</th>
                <th className="p-3 font-medium text-right">{t('ministryGiftAidDashboard', 'action', 'Action')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-gray-400">{t('ministryGiftAidDashboard', 'noDonationsMatch', 'No donations match these filters.')}</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.donationId} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-3">
                    <div className="font-medium">{r.isAnonymous ? t('ministryGiftAidDashboard', 'anonymous', 'Anonymous') : (r.donorName || '—')}</div>
                    {!r.isAnonymous && <div className="text-xs text-gray-400">{r.donorEmail}</div>}
                  </td>
                  <td className="p-3 text-gray-600">{new Date(r.donationDate).toLocaleDateString()}</td>
                  <td className="p-3 font-medium">{money(r.amount, r.currency)}</td>
                  <td className="p-3 text-gray-600">{r.fundAllocation || t('ministryGiftAidDashboard', 'general', 'General')}</td>
                  <td className="p-3">
                    {r.eligible ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> {t('ministryGiftAidDashboard', 'eligible', 'Eligible')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-gray-600">
                        <XCircle className="h-3 w-3 mr-1" /> {reasonLabel(r.reason)}
                      </Badge>
                    )}
                  </td>
                  <td className="p-3">{r.eligible ? money(r.estimatedGiftAid, r.currency) : '—'}</td>
                  <td className="p-3 text-right">
                    {r.adminExcluded ? (
                      <Button variant="ghost" size="sm" onClick={() => toggleExclude(r)}>
                        <RotateCcw className="h-4 w-4 mr-1" /> {t('ministryGiftAidDashboard', 'reInclude', 'Re-include')}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => toggleExclude(r)}
                        disabled={r.isAnonymous}
                        title={r.isAnonymous ? t('ministryGiftAidDashboard', 'anonymousCantClaim', 'Anonymous donations can’t be claimed') : t('ministryGiftAidDashboard', 'excludeFromGiftAid', 'Exclude from Gift Aid')}
                      >
                        <Ban className="h-4 w-4 mr-1" /> {t('ministryGiftAidDashboard', 'exclude', 'Exclude')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
};

export default MinistryGiftAidDashboard;
