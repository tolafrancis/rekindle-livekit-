import React, { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Checkbox } from '@rekindle/ui/checkbox';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { toast } from '@rekindle/ui/use-toast';
import { AlertTriangle, CheckCircle2, FileDown, FileUp, Loader2, XCircle } from 'lucide-react';
import {
  downloadTemplate,
  hasErrors,
  parseDeclarationsCsv,
  parseDonationsCsv,
  saveAdminDeclaration,
  type DeclarationImportRow,
  type DonationImportRow,
  type ImportKind,
  type RowIssue,
} from '../giftAid';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ministryId: string;
  initialKind: ImportKind;
  themeColor?: string;
  /** Called after anything was saved, so the dashboard reloads. */
  onImported: () => void;
}

type Row = (DonationImportRow | DeclarationImportRow) & { skip?: string };

const PREVIEW_LIMIT = 300;
const INSERT_CHUNK = 200;

/**
 * Upload a CSV of donations received outside the app, or of paper Gift Aid
 * declarations, preview it with every problem shown per row, then save the
 * valid rows. Imported donations and declarations feed the same eligibility
 * check, claim builder and HMRC export/submission as in-app ones.
 */
export const GiftAidCsvImport: React.FC<Props> = ({
  open, onOpenChange, ministryId, initialKind, themeColor = '#7c3aed', onImported,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [fileName, setFileName] = useState('');
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [unknownColumns, setUnknownColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<{ saved: number; failed: string[] } | null>(null);

  React.useEffect(() => { if (open) { setKind(initialKind); reset(); } }, [open, initialKind]);

  function reset() {
    setFileName(''); setFileErrors([]); setUnknownColumns([]); setRows([]);
    setConfirmed(false); setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const ready = useMemo(() => rows.filter((r) => !r.skip && !hasErrors(r)), [rows]);
  const errorRows = rows.filter((r) => !r.skip && hasErrors(r));
  const skipped = rows.filter((r) => r.skip);
  const warned = ready.filter((r) => r.issues.some((i) => i.level === 'warning'));

  // Compare the file against what's already saved for this ministry.
  async function checkAgainstExisting(parsed: Row[]): Promise<Row[]> {
    const emails = [...new Set(parsed.map((r) => r.email).filter(Boolean))];
    const declared = new Set<string>();
    for (let i = 0; i < emails.length; i += 100) {
      const { data } = await supabase
        .from('donor_gift_aid_status')
        .select('donor_email')
        .eq('ministry_id', ministryId)
        .eq('status', 'active')
        .in('donor_email', emails.slice(i, i + 100));
      for (const d of data ?? []) declared.add(String(d.donor_email).toLowerCase());
    }

    if (kind === 'declarations') {
      // The file's own declarations also count for the donations check below.
      return parsed.map((r) => (declared.has(r.email)
        ? { ...r, skip: 'Already has an active Gift Aid declaration' }
        : r));
    }

    const existing = new Set<string>();
    const dated = (parsed as DonationImportRow[]).filter((r) => r.date);
    if (dated.length) {
      const dates = dated.map((r) => r.date).sort();
      const { data } = await supabase
        .from('ministry_donations')
        .select('donor_email, amount, created_at')
        .eq('ministry_id', ministryId)
        .gte('created_at', `${dates[0]}T00:00:00Z`)
        .lte('created_at', `${dates[dates.length - 1]}T23:59:59Z`);
      for (const d of data ?? []) {
        existing.add(`${String(d.donor_email ?? '').toLowerCase()}|${Number(d.amount)}|${String(d.created_at).slice(0, 10)}`);
      }
    }
    return (parsed as DonationImportRow[]).map((r) => {
      if (existing.has(`${r.email}|${r.amount}|${r.date}`)) return { ...r, skip: 'Already recorded (same donor, amount and date)' };
      if (r.email && !declared.has(r.email)) {
        const issue: RowIssue = { level: 'warning', message: 'No Gift Aid declaration for this email yet, so it won\'t be claimable until you import one.' };
        return { ...r, issues: [...r.issues, issue] };
      }
      return r;
    });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    reset();
    setFileName(file.name);
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setFileErrors(['Choose a .csv file. In Excel or Google Sheets use File > Save as / Download > CSV.']);
      return;
    }
    setChecking(true);
    try {
      const text = await file.text();
      const parsed = kind === 'donations' ? parseDonationsCsv(text) : parseDeclarationsCsv(text);
      setFileErrors(parsed.fileErrors);
      setUnknownColumns(parsed.unknownColumns);
      setRows(parsed.fileErrors.length ? [] : await checkAgainstExisting(parsed.rows as Row[]));
    } catch (err) {
      setFileErrors([`Couldn't read the file: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setChecking(false);
    }
  }

  async function importDonations(list: DonationImportRow[]) {
    const stamp = new Date().toISOString().slice(0, 10);
    const payload = list.map((r) => ({
      ministry_id: ministryId,
      donor_name: `${r.firstName} ${r.lastName}`.trim(),
      donor_email: r.email,
      amount: r.amount,
      amount_cents: Math.round(r.amount * 100),
      currency: 'GBP',
      donation_type: 'one_time',
      status: 'completed',
      is_anonymous: false,
      fund_allocation: r.fund,
      payment_method: r.paymentMethod,
      transaction_id: r.reference || null,
      notes: [`Imported from ${fileName} on ${stamp}`, r.notes].filter(Boolean).join(' · '),
      // Midday UTC so the date shows the same everywhere in the UK.
      created_at: `${r.date}T12:00:00Z`,
    }));
    let saved = 0;
    const failed: string[] = [];
    for (let i = 0; i < payload.length; i += INSERT_CHUNK) {
      const chunk = payload.slice(i, i + INSERT_CHUNK);
      const { error } = await supabase.from('ministry_donations').insert(chunk);
      if (error) failed.push(`Lines ${list[i].line}–${list[Math.min(i + INSERT_CHUNK, list.length) - 1].line}: ${error.message}`);
      else saved += chunk.length;
    }
    try {
      await supabase.from('gift_aid_audit_log').insert({
        ministry_id: ministryId,
        actor_user_id: user?.id ?? null,
        event_type: 'donations_imported',
        event_data: { file: fileName, imported: saved, failed: failed.length },
      });
    } catch { /* audit is best-effort, like the rest of the Gift Aid code */ }
    return { saved, failed };
  }

  async function importDeclarations(list: DeclarationImportRow[]) {
    let saved = 0;
    const failed: string[] = [];
    for (const r of list) {
      const res = await saveAdminDeclaration(
        {
          ministryId,
          donorEmail: r.email,
          title: r.title || null,
          firstName: r.firstName,
          lastName: r.lastName,
          houseNumberOrName: r.houseNumberOrName,
          addressLine1: r.addressLine1 || null,
          addressLine2: r.addressLine2 || null,
          city: r.city || null,
          postcode: r.postcode,
          countryCode: 'GB',
          isTaxpayerConfirmed: r.taxpayerConfirmed,
        },
        { actorUserId: user?.id ?? null, source: 'csv_import', effectiveFrom: r.declarationDate },
      );
      if (res.ok) saved++;
      else failed.push(`Line ${r.line} (${r.firstName} ${r.lastName}): ${res.error}`);
    }
    return { saved, failed };
  }

  async function runImport() {
    setImporting(true);
    try {
      const res = kind === 'donations'
        ? await importDonations(ready as DonationImportRow[])
        : await importDeclarations(ready as DeclarationImportRow[]);
      setResult(res);
      if (res.saved > 0) {
        onImported();
        toast({ title: `Imported ${res.saved} ${kind === 'donations' ? 'donation' : 'declaration'}${res.saved === 1 ? '' : 's'}` });
      }
    } finally {
      setImporting(false);
    }
  }

  const canImport = ready.length > 0 && !importing && !result && (kind === 'donations' || confirmed);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!importing) onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" style={{ color: themeColor }} />
            {t('giftAidCsvImport', 'title', 'Import from CSV')}
          </DialogTitle>
          <DialogDescription>
            {kind === 'donations'
              ? 'Add gifts the app didn\'t record, such as cash and envelope collections, bank transfers or another giving platform. Valid rows join the Gift Aid list and can go into a claim like any other donation.'
              : 'Add Gift Aid declarations from signed paper forms. Each one covers the donor\'s gifts from 4 years before the date they signed onwards. Donations are matched to declarations by email.'}
          </DialogDescription>
        </DialogHeader>

        {/* Which file */}
        <div className="inline-flex rounded-lg border p-0.5 self-start">
          {(['donations', 'declarations'] as ImportKind[]).map((k) => (
            <button
              key={k}
              type="button"
              disabled={importing}
              onClick={() => { setKind(k); reset(); }}
              className={`px-3 py-1.5 text-sm rounded-md ${kind === k ? 'bg-gray-100 font-medium' : 'text-gray-500'}`}
            >
              {k === 'donations' ? 'Donations' : 'Declarations'}
            </button>
          ))}
        </div>

        <div className="rounded-lg border bg-gray-50 p-3 text-sm space-y-2">
          <p className="font-medium">1. Fill in the template</p>
          <p className="text-gray-600">
            {kind === 'donations'
              ? 'Columns: first_name, last_name, email, amount, date (required), then fund, payment_method (cash, cheque, bank_transfer, standing_order, card), reference, notes. Amounts in pounds; dates as 2026-09-07 or 07/09/2026.'
              : 'Columns: title, first_name, last_name, email, house_name_or_number, address_line1, address_line2, city, postcode, declaration_date, taxpayer_confirmed (yes). Use the date the donor signed the form.'}
          </p>
          <p className="text-gray-600">
            Email links each donation to its declaration. For a donor with no email, make one up and use it in both files, e.g. <code>jane.smith.0042@noemail.local</code>.
          </p>
          <Button variant="outline" size="sm" onClick={() => downloadTemplate(kind)}>
            <FileDown className="h-4 w-4 mr-1" /> Download {kind} template
          </Button>
        </div>

        <div className="rounded-lg border p-3 text-sm space-y-2">
          <p className="font-medium">2. Choose your file</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            disabled={importing || checking}
            onChange={(e) => void onFile(e.target.files?.[0])}
            className="block text-sm"
          />
          {checking && <p className="flex items-center gap-2 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking the file…</p>}
          {fileErrors.map((e) => (
            <p key={e} className="flex items-start gap-2 text-red-600"><XCircle className="h-4 w-4 mt-0.5 shrink-0" />{e}</p>
          ))}
          {unknownColumns.length > 0 && (
            <p className="text-xs text-gray-500">Ignored columns: {unknownColumns.join(', ')}</p>
          )}
        </div>

        {rows.length > 0 && (
          <div className="space-y-3">
            <p className="font-medium text-sm">3. Check and import</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{ready.length} ready</Badge>
              {warned.length > 0 && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{warned.length} with warnings (still imported)</Badge>}
              {errorRows.length > 0 && <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{errorRows.length} with errors (left out)</Badge>}
              {skipped.length > 0 && <Badge variant="outline">{skipped.length} skipped</Badge>}
            </div>

            <div className="max-h-80 overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="p-2">Line</th>
                    <th className="p-2">Donor</th>
                    <th className="p-2">{kind === 'donations' ? 'Amount' : 'Postcode'}</th>
                    <th className="p-2">Date</th>
                    <th className="p-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, PREVIEW_LIMIT).map((r) => {
                    const bad = hasErrors(r);
                    return (
                      <tr key={r.line} className={`border-t align-top ${r.skip ? 'text-gray-400' : bad ? 'bg-red-50' : ''}`}>
                        <td className="p-2">{r.line}</td>
                        <td className="p-2">
                          <div className="font-medium">{`${r.firstName} ${r.lastName}`.trim() || '—'}</div>
                          <div className="text-gray-500">{r.email || '—'}</div>
                        </td>
                        <td className="p-2">
                          {'amount' in r ? (r.amount ? `£${r.amount.toFixed(2)}` : '—') : (r as DeclarationImportRow).postcode || '—'}
                        </td>
                        <td className="p-2">{'amount' in r ? r.date : (r as DeclarationImportRow).declarationDate || '—'}</td>
                        <td className="p-2 space-y-1">
                          {r.skip ? (
                            <span>Skipped: {r.skip}</span>
                          ) : r.issues.length === 0 ? (
                            <span className="flex items-center gap-1 text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> Ready</span>
                          ) : (
                            r.issues.map((i, n) => (
                              <span key={n} className={`flex items-start gap-1 ${i.level === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
                                {i.level === 'error' ? <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                                {i.message}
                              </span>
                            ))
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > PREVIEW_LIMIT && (
                <p className="p-2 text-xs text-gray-500 border-t">Showing the first {PREVIEW_LIMIT} of {rows.length} rows; the summary above counts them all.</p>
              )}
            </div>

            {kind === 'declarations' && !result && ready.length > 0 && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
                <span>
                  I hold a signed Gift Aid declaration for each of these {ready.length} donor{ready.length === 1 ? '' : 's'}, in which they confirmed they are a UK taxpayer.
                  <span className="block text-amber-800 mt-1">Declarations are permanent records HMRC can audit: once imported they can be withdrawn but not deleted.</span>
                </span>
              </label>
            )}

            {result ? (
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <p className="flex items-center gap-2 font-medium text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> Imported {result.saved} {kind === 'donations' ? 'donation' : 'declaration'}{result.saved === 1 ? '' : 's'}.
                </p>
                {result.failed.map((f) => <p key={f} className="text-red-600">{f}</p>)}
                <div className="pt-2 flex gap-2">
                  <Button variant="outline" size="sm" onClick={reset}>Import another file</Button>
                  <Button size="sm" onClick={() => onOpenChange(false)} style={{ backgroundColor: themeColor }} className="text-white">Done</Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
                <Button onClick={() => void runImport()} disabled={!canImport} style={{ backgroundColor: themeColor }} className="text-white">
                  {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileUp className="h-4 w-4 mr-2" />}
                  Import {ready.length} {kind === 'donations' ? 'donation' : 'declaration'}{ready.length === 1 ? '' : 's'}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default GiftAidCsvImport;
