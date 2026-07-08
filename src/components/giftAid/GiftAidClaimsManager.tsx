import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { toast } from '../ui/use-toast';
import {
  FileSpreadsheet, FileCode2, FileText, Loader2, Plus, ArrowLeft, Send,
  CheckCircle2, XCircle, Trash2, AlertTriangle, RefreshCw, Landmark, FileDown,
} from 'lucide-react';
import {
  buildClaim, listClaims, getClaim, getClaimLineItems, setClaimStatus, deleteClaim,
  loadCharityDetails, downloadClaimCsv, downloadClaimXml, downloadClaimSummary,
  downloadClaimR68Xml, submitClaimToHmrc, pollClaimToHmrc,
  type GiftAidClaim, type ClaimLineItem, type CharityDetails, type ClaimStatus,
} from '@/lib/giftAid';
import { validateClaim } from '@/lib/giftAid/r68Validation';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  ministryId: string;
  themeColor?: string;
}

const money = (amount: number, currency = 'GBP') => {
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
};

const statusBadge = (status: ClaimStatus) => {
  const map: Record<ClaimStatus, string> = {
    draft: 'bg-gray-100 text-gray-700',
    ready: 'bg-blue-100 text-blue-700',
    submitted: 'bg-amber-100 text-amber-700',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  };
  return <Badge className={`${map[status]} hover:${map[status]}`}>{status}</Badge>;
};

export const GiftAidClaimsManager: React.FC<Props> = ({ ministryId, themeColor = '#7c3aed' }) => {
  const { t } = useLanguage();
  const [claims, setClaims] = useState<GiftAidClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [selected, setSelected] = useState<GiftAidClaim | null>(null);
  const [items, setItems] = useState<ClaimLineItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [charity, setCharity] = useState<CharityDetails | null>(null);

  // HMRC submission dialog
  const [showSubmit, setShowSubmit] = useState(false);
  const [gwUser, setGwUser] = useState('');
  const [gwPass, setGwPass] = useState('');
  const [gwEnv, setGwEnv] = useState<'test' | 'live'>('test');
  const [submitting, setSubmitting] = useState(false);
  const [submitMode, setSubmitMode] = useState<'submit' | 'poll'>('submit');

  const loadList = async () => {
    setLoading(true);
    try {
      setClaims(await listClaims(ministryId));
    } catch (err: any) {
      toast({ title: t('giftAidClaimsManager', 'error', 'Error'), description: err.message || t('giftAidClaimsManager', 'failedLoadClaims', 'Failed to load claims'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadList(); loadCharityDetails(ministryId).then(setCharity); /* eslint-disable-next-line */ }, [ministryId]);

  const openClaim = async (claim: GiftAidClaim) => {
    setSelected(claim);
    setItemsLoading(true);
    try {
      setItems(await getClaimLineItems(claim.id));
    } catch (err: any) {
      toast({ title: t('giftAidClaimsManager', 'error', 'Error'), description: err.message || t('giftAidClaimsManager', 'failedLoadLineItems', 'Failed to load line items'), variant: 'destructive' });
    } finally {
      setItemsLoading(false);
    }
  };

  const refreshSelected = async () => {
    if (!selected) return;
    const fresh = await getClaim(selected.id);
    if (fresh) { setSelected(fresh); setItems(await getClaimLineItems(fresh.id)); }
    loadList();
  };

  const handleBuild = async () => {
    setBuilding(true);
    try {
      const id = await buildClaim(
        ministryId,
        fromDate ? new Date(fromDate).toISOString() : null,
        toDate ? new Date(`${toDate}T23:59:59`).toISOString() : null,
      );
      toast({ title: t('giftAidClaimsManager', 'claimCreated', 'Claim created'), description: t('giftAidClaimsManager', 'claimCreatedDesc', 'Eligible GBP donations were bundled into a draft claim.') });
      await loadList();
      const created = await getClaim(id);
      if (created) openClaim(created);
    } catch (err: any) {
      const msg = err.message || t('giftAidClaimsManager', 'failedBuildClaim', 'Failed to build claim');
      toast({ title: t('giftAidClaimsManager', 'couldNotBuildClaim', 'Could not build claim'), description: msg, variant: 'destructive' });
    } finally {
      setBuilding(false);
    }
  };

  const changeStatus = async (status: ClaimStatus) => {
    if (!selected) return;
    try {
      let reference: string | null = null;
      let notes: string | null = null;
      if (status === 'submitted') {
        reference = window.prompt(t('giftAidClaimsManager', 'hmrcRefPrompt', 'HMRC submission reference (optional):'), selected.hmrc_submission_reference || '') || null;
      }
      if (status === 'rejected') {
        notes = window.prompt(t('giftAidClaimsManager', 'rejectionNotesPrompt', 'Rejection notes from HMRC (optional):'), '') || null;
      }
      await setClaimStatus(selected.id, status, reference, notes);
      toast({ title: t('giftAidClaimsManager', 'claimMarkedX', 'Claim marked {status}').replace('{status}', String(status)) });
      refreshSelected();
    } catch (err: any) {
      toast({ title: t('giftAidClaimsManager', 'error', 'Error'), description: err.message || t('giftAidClaimsManager', 'failedUpdateStatus', 'Failed to update status'), variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!window.confirm(t('giftAidClaimsManager', 'deleteDraftConfirm', 'Delete this draft claim? Its donations return to the eligible pool.'))) return;
    try {
      await deleteClaim(selected.id);
      toast({ title: t('giftAidClaimsManager', 'draftClaimDeleted', 'Draft claim deleted') });
      setSelected(null);
      loadList();
    } catch (err: any) {
      toast({ title: t('giftAidClaimsManager', 'error', 'Error'), description: err.message || t('giftAidClaimsManager', 'failedDelete', 'Failed to delete'), variant: 'destructive' });
    }
  };

  const handleHmrcSubmit = async () => {
    if (!selected) return;
    if (!gwUser.trim() || !gwPass.trim()) {
      toast({ title: t('giftAidClaimsManager', 'credentialsRequired', 'Credentials required'), description: t('giftAidClaimsManager', 'credentialsRequiredDesc', 'Enter the Government Gateway user ID and password.'), variant: 'destructive' });
      return;
    }
    // Pre-submission check against the documented R68 business rules.
    // Validate ONLY the complete records — incomplete donors are skipped by the
    // builder/edge function (never sent to HMRC), so they must not hard-block a
    // claim that is otherwise valid. The dialog already warns they'll be skipped.
    if (charity) {
      const submittable = items.filter((i) => i.complete);
      const result = validateClaim(charity, submittable);
      if (!result.ok) {
        const shown = result.errors.slice(0, 4).map((e) => `• ${e.message}`).join('\n');
        const more = result.errors.length > 4 ? '\n' + t('giftAidClaimsManager', 'andMoreIssues', '…and {count} more.').replace('{count}', String(result.errors.length - 4)) : '';
        toast({
          title: t('giftAidClaimsManager', 'claimHasIssues', 'Claim has {count} issue(s) to fix before submitting').replace('{count}', String(result.errors.length)),
          description: shown + more,
          variant: 'destructive',
        });
        return;
      }
      if (result.warnings.length > 0) {
        toast({ title: t('giftAidClaimsManager', 'submittingWithWarnings', 'Submitting with {count} warning(s)').replace('{count}', String(result.warnings.length)), description: result.warnings[0].message });
      }
    }
    setSubmitting(true);
    try {
      const result = await submitClaimToHmrc({
        claimId: selected.id,
        gatewayUserId: gwUser.trim(),
        gatewayPassword: gwPass,
        environment: gwEnv,
      });
      if (result.ok) {
        toast({ title: t('giftAidClaimsManager', 'submittedToHmrc', 'Submitted to HMRC'), description: result.message || t('giftAidClaimsManager', 'correlationIdX', 'Correlation ID {id}').replace('{id}', String(result.correlationId || '')) });
        setShowSubmit(false);
        setGwPass('');
        refreshSelected();
      } else {
        toast({
          title: result.stage === 'poll-timeout' ? t('giftAidClaimsManager', 'submittedAwaitingHmrc', 'Submitted — awaiting HMRC') : t('giftAidClaimsManager', 'submissionFailed', 'Submission failed'),
          description: result.message || result.error || t('giftAidClaimsManager', 'hmrcRejected', 'HMRC rejected the submission'),
          variant: result.stage === 'poll-timeout' ? undefined : 'destructive',
        });
        if (result.stage === 'poll-timeout') { setShowSubmit(false); setGwPass(''); refreshSelected(); }
      }
    } catch (err: any) {
      toast({ title: t('giftAidClaimsManager', 'error', 'Error'), description: err.message || t('giftAidClaimsManager', 'submissionFailed', 'Submission failed'), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePollStatus = async () => {
    if (!selected) return;
    if (!gwUser.trim() || !gwPass.trim()) {
      toast({ title: t('giftAidClaimsManager', 'credentialsRequired', 'Credentials required'), description: t('giftAidClaimsManager', 'credentialsRequiredDesc', 'Enter the Government Gateway user ID and password.'), variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const result = await pollClaimToHmrc({
        claimId: selected.id,
        gatewayUserId: gwUser.trim(),
        gatewayPassword: gwPass,
        environment: gwEnv,
      });
      if (result.ok) {
        toast({ title: t('giftAidClaimsManager', 'hmrcConfirmed', 'HMRC confirmed'), description: result.message || t('giftAidClaimsManager', 'claimAccepted', 'Claim accepted by HMRC.') });
        setShowSubmit(false); setGwPass(''); refreshSelected();
      } else if (result.stage === 'poll-timeout') {
        toast({ title: t('giftAidClaimsManager', 'stillAwaitingHmrc', 'Still awaiting HMRC'), description: result.message || t('giftAidClaimsManager', 'tryAgainShortly', 'Try again shortly.') });
      } else {
        toast({ title: t('giftAidClaimsManager', 'hmrcRejectedTitle', 'HMRC rejected the claim'), description: result.error || result.message || t('giftAidClaimsManager', 'hmrcRejected', 'HMRC rejected the submission'), variant: 'destructive' });
        setShowSubmit(false); setGwPass(''); refreshSelected();
      }
    } catch (err: any) {
      toast({ title: t('giftAidClaimsManager', 'error', 'Error'), description: err.message || t('giftAidClaimsManager', 'pollFailed', 'Could not check status'), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const incompleteCount = items.filter((i) => !i.complete).length;

  const handleExportR68 = async () => {
    if (!selected || !charity) return;
    try {
      const { exported, skipped } = await downloadClaimR68Xml(selected, items, charity);
      toast({
        title: t('giftAidClaimsManager', 'r68Exported', 'R68 XML exported'),
        description: skipped > 0
          ? t('giftAidClaimsManager', 'r68ExportedWithSkipped', "{exported} donor record(s) included; {skipped} skipped for incomplete details. Drop the file into HMRC's Local Test Service to validate.").replace('{exported}', String(exported)).replace('{skipped}', String(skipped))
          : t('giftAidClaimsManager', 'r68ExportedDesc', "{exported} donor record(s) included. Drop the file into HMRC's Local Test Service to validate.").replace('{exported}', String(exported)),
      });
    } catch (err: any) {
      toast({ title: t('giftAidClaimsManager', 'couldNotExportR68', 'Could not export R68'), description: err.message || t('giftAidClaimsManager', 'exportFailed', 'Export failed'), variant: 'destructive' });
    }
  };

  // ---- Claim detail view ----
  if (selected) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {t('giftAidClaimsManager', 'backToClaims', 'Back to claims')}
        </Button>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {selected.claim_reference} {statusBadge(selected.status)}
                </CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  {selected.donation_count} {t('giftAidClaimsManager', 'donations', 'donations')} · {money(Number(selected.total_amount), selected.currency)} ·
                  {' '}{t('giftAidClaimsManager', 'giftAid', 'Gift Aid')} {money(Number(selected.total_gift_aid), selected.currency)}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={refreshSelected}>
                <RefreshCw className="h-4 w-4 mr-1" /> {t('giftAidClaimsManager', 'refresh', 'Refresh')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Export + status actions */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadClaimCsv(selected, items)}>
                <FileSpreadsheet className="h-4 w-4 mr-1" /> {t('giftAidClaimsManager', 'csvHmrcSchedule', 'CSV (HMRC schedule)')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => charity && downloadClaimXml(selected, items, charity)}>
                <FileCode2 className="h-4 w-4 mr-1" /> {t('giftAidClaimsManager', 'xml', 'XML')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => charity && downloadClaimSummary(selected, items, charity)}>
                <FileText className="h-4 w-4 mr-1" /> {t('giftAidClaimsManager', 'summary', 'Summary')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportR68}>
                <FileDown className="h-4 w-4 mr-1" /> {t('giftAidClaimsManager', 'r68XmlLts', 'R68 XML (LTS)')}
              </Button>
              <div className="flex-1" />
              {(selected.status === 'draft' || selected.status === 'ready') && (
                <>
                  <Button size="sm" onClick={() => { setSubmitMode('submit'); setShowSubmit(true); }} style={{ backgroundColor: themeColor }}>
                    <Landmark className="h-4 w-4 mr-1" /> {t('giftAidClaimsManager', 'submitToHmrc', 'Submit to HMRC')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => changeStatus('submitted')}>
                    <Send className="h-4 w-4 mr-1" /> {t('giftAidClaimsManager', 'markSubmittedManually', 'Mark submitted manually')}
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4 mr-1" /> {t('giftAidClaimsManager', 'deleteDraft', 'Delete draft')}
                  </Button>
                </>
              )}
              {selected.status === 'submitted' && (
                <>
                  <Button size="sm" onClick={() => { setSubmitMode('poll'); setShowSubmit(true); }} style={{ backgroundColor: themeColor }}>
                    <RefreshCw className="h-4 w-4 mr-1" /> {t('giftAidClaimsManager', 'checkHmrcStatus', 'Check HMRC status')}
                  </Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => changeStatus('accepted')}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> {t('giftAidClaimsManager', 'accepted', 'Accepted')}
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600" onClick={() => changeStatus('rejected')}>
                    <XCircle className="h-4 w-4 mr-1" /> {t('giftAidClaimsManager', 'rejected', 'Rejected')}
                  </Button>
                </>
              )}
            </div>

            {incompleteCount > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  {t('giftAidClaimsManager', 'incompleteDonorWarning', '{count} donation(s) have incomplete donor details (name, house number/address or postcode). HMRC may reject these — ask the donor to update their declaration.').replace('{count}', String(incompleteCount))}
                </span>
              </div>
            )}

            {/* Line items */}
            {itemsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="p-2 font-medium">{t('giftAidClaimsManager', 'donor', 'Donor')}</th>
                      <th className="p-2 font-medium">{t('giftAidClaimsManager', 'houseNo', 'House / no.')}</th>
                      <th className="p-2 font-medium">{t('giftAidClaimsManager', 'postcode', 'Postcode')}</th>
                      <th className="p-2 font-medium">{t('giftAidClaimsManager', 'date', 'Date')}</th>
                      <th className="p-2 font-medium">{t('giftAidClaimsManager', 'amount', 'Amount')}</th>
                      <th className="p-2 font-medium">{t('giftAidClaimsManager', 'giftAid', 'Gift Aid')}</th>
                      <th className="p-2 font-medium">{t('giftAidClaimsManager', 'status', 'Status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.donationId} className={`border-b last:border-0 ${!it.complete ? 'bg-amber-50' : ''}`}>
                        <td className="p-2">{[it.title, it.firstName, it.lastName].filter(Boolean).join(' ') || '—'}</td>
                        <td className="p-2 text-gray-600">{it.houseNumberOrName || it.addressLine1 || '—'}</td>
                        <td className="p-2 text-gray-600">{it.postcode || '—'}</td>
                        <td className="p-2 text-gray-600">{new Date(it.donationDate).toLocaleDateString()}</td>
                        <td className="p-2 font-medium">{money(it.amount, selected.currency)}</td>
                        <td className="p-2">{money(it.estimatedGiftAid, selected.currency)}</td>
                        <td className="p-2">
                          {it.complete
                            ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{t('giftAidClaimsManager', 'complete', 'Complete')}</Badge>
                            : <Badge variant="secondary" className="text-amber-700">{t('giftAidClaimsManager', 'missingX', 'Missing: {fields}').replace('{fields}', String(it.missing))}</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selected.hmrc_submission_reference && (
              <p className="text-xs text-gray-500">{t('giftAidClaimsManager', 'hmrcSubmissionReferenceLabel', 'HMRC submission reference:')} {selected.hmrc_submission_reference}</p>
            )}
            {selected.response_notes && (
              <p className="text-xs text-gray-500">{t('giftAidClaimsManager', 'hmrcNotesLabel', 'HMRC notes:')} {selected.response_notes}</p>
            )}
          </CardContent>
        </Card>

        <Dialog open={showSubmit} onOpenChange={(o) => { setShowSubmit(o); if (!o) setGwPass(''); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {submitMode === 'poll'
                  ? t('giftAidClaimsManager', 'checkHmrcStatus', 'Check HMRC status')
                  : t('giftAidClaimsManager', 'submitToHmrc', 'Submit to HMRC')}
              </DialogTitle>
              <DialogDescription>
                {submitMode === 'poll'
                  ? t('giftAidClaimsManager', 'pollDialogDesc', "Checks HMRC for the outcome of this already-submitted claim using your Government Gateway login. Choose the same environment you originally submitted to.")
                  : t('giftAidClaimsManager', 'submitDialogDesc', "Files this claim to HMRC Charities Online using your ministry's Government Gateway login. Your password is sent securely for this submission only and is never stored.")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {submitMode === 'submit' && incompleteCount > 0 && (
                <p className="text-xs text-amber-700">
                  {t('giftAidClaimsManager', 'incompleteSkipWarning', '{count} donation(s) have incomplete donor details and will be skipped or may be rejected. Consider fixing them first.').replace('{count}', String(incompleteCount))}
                </p>
              )}
              <div>
                <Label className="text-xs">{t('giftAidClaimsManager', 'gatewayUserId', 'Government Gateway user ID')}</Label>
                <Input value={gwUser} onChange={(e) => setGwUser(e.target.value)} placeholder={t('giftAidClaimsManager', 'gatewayUserIdPlaceholder', 'e.g. 1234 5678 9012')} />
              </div>
              <div>
                <Label className="text-xs">{t('giftAidClaimsManager', 'gatewayPassword', 'Government Gateway password')}</Label>
                <Input type="password" value={gwPass} onChange={(e) => setGwPass(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t('giftAidClaimsManager', 'environment', 'Environment')}</Label>
                <Select value={gwEnv} onValueChange={(v) => setGwEnv(v as 'test' | 'live')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">{t('giftAidClaimsManager', 'envTest', 'Test (HMRC test service)')}</SelectItem>
                    <SelectItem value="live">{t('giftAidClaimsManager', 'envLive', 'Live (real submission)')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setShowSubmit(false)} disabled={submitting}>{t('giftAidClaimsManager', 'cancel', 'Cancel')}</Button>
                <Button onClick={submitMode === 'poll' ? handlePollStatus : handleHmrcSubmit} disabled={submitting} style={{ backgroundColor: themeColor }}>
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : submitMode === 'poll' ? <RefreshCw className="h-4 w-4 mr-2" /> : <Landmark className="h-4 w-4 mr-2" />}
                  {submitMode === 'poll'
                    ? t('giftAidClaimsManager', 'checkStatusButton', 'Check status')
                    : gwEnv === 'live' ? t('giftAidClaimsManager', 'submitLiveClaim', 'Submit live claim') : t('giftAidClaimsManager', 'submitTestClaim', 'Submit test claim')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('giftAidClaimsManager', 'buildNewClaim', 'Build a new claim')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">{t('giftAidClaimsManager', 'fromOptional', 'From (optional)')}</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t('giftAidClaimsManager', 'toOptional', 'To (optional)')}</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <Button onClick={handleBuild} disabled={building} style={{ backgroundColor: themeColor }}>
            {building ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            {t('giftAidClaimsManager', 'bundleEligibleDonations', 'Bundle eligible donations')}
          </Button>
          <p className="text-xs text-gray-500 w-full">
            {t('giftAidClaimsManager', 'bundleHint', 'Bundles every eligible GBP donation in the period that isn’t already in a claim.')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('giftAidClaimsManager', 'claims', 'Claims')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="p-3 font-medium">{t('giftAidClaimsManager', 'reference', 'Reference')}</th>
                  <th className="p-3 font-medium">{t('giftAidClaimsManager', 'donationsCol', 'Donations')}</th>
                  <th className="p-3 font-medium">{t('giftAidClaimsManager', 'total', 'Total')}</th>
                  <th className="p-3 font-medium">{t('giftAidClaimsManager', 'giftAid', 'Gift Aid')}</th>
                  <th className="p-3 font-medium">{t('giftAidClaimsManager', 'status', 'Status')}</th>
                  <th className="p-3 font-medium">{t('giftAidClaimsManager', 'created', 'Created')}</th>
                </tr>
              </thead>
              <tbody>
                {claims.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-gray-400">{t('giftAidClaimsManager', 'noClaimsYet', 'No claims yet. Build your first one above.')}</td></tr>
                )}
                {claims.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => openClaim(c)}>
                    <td className="p-3 font-medium">{c.claim_reference}</td>
                    <td className="p-3">{c.donation_count}</td>
                    <td className="p-3">{money(Number(c.total_amount), c.currency)}</td>
                    <td className="p-3" style={{ color: themeColor }}>{money(Number(c.total_gift_aid), c.currency)}</td>
                    <td className="p-3">{statusBadge(c.status)}</td>
                    <td className="p-3 text-gray-500">{new Date(c.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GiftAidClaimsManager;
