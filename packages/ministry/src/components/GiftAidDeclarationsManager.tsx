import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Badge } from '@rekindle/ui/badge';
import { Switch } from '@rekindle/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@rekindle/ui/dialog';
import { toast } from '@rekindle/ui/use-toast';
import { Loader2, Search, Plus, Pencil, Ban, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import {
  listDeclarations, saveAdminDeclaration, withdrawDeclaration, isDeclarationComplete,
  type DeclarationRow, type AdminDeclarationInput,
} from '../giftAid';

interface Props {
  ministryId: string;
  themeColor?: string;
}

type Filter = 'all' | 'active' | 'incomplete';

const emptyForm = (): AdminDeclarationInput & { id?: string } => ({
  ministryId: '', donorEmail: '', title: '', firstName: '', lastName: '',
  houseNumberOrName: '', addressLine1: '', city: '', postcode: '', isTaxpayerConfirmed: true,
});

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    withdrawn: 'bg-red-100 text-red-700',
    superseded: 'bg-gray-100 text-gray-500',
    pending: 'bg-amber-100 text-amber-700',
  };
  return <Badge className={`${map[status] || 'bg-gray-100 text-gray-600'} hover:${map[status] || ''}`}>{status}</Badge>;
};

export const GiftAidDeclarationsManager: React.FC<Props> = ({ ministryId, themeColor = '#7c3aed' }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState<DeclarationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const [showDialog, setShowDialog] = useState(false);
  const [supersedeId, setSupersedeId] = useState<string | null>(null);
  const [form, setForm] = useState<AdminDeclarationInput & { id?: string }>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listDeclarations(ministryId));
    } catch (err: any) {
      toast({ title: t('giftAidDeclarationsManager', 'error', 'Error'), description: err.message || t('giftAidDeclarationsManager', 'failedLoad', 'Failed to load declarations'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ministryId]);

  const incompleteActiveCount = useMemo(
    () => rows.filter((r) => r.status === 'active' && !isDeclarationComplete(r)).length,
    [rows],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'active' && r.status !== 'active') return false;
      if (filter === 'incomplete' && !(r.status === 'active' && !isDeclarationComplete(r))) return false;
      if (term) {
        const hay = `${r.firstName} ${r.lastName} ${r.donorEmail}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, search, filter]);

  const openAdd = () => {
    setSupersedeId(null);
    setForm({ ...emptyForm(), ministryId });
    setShowDialog(true);
  };

  const openCorrect = (r: DeclarationRow) => {
    setSupersedeId(r.id);
    setForm({
      ministryId,
      donorEmail: r.donorEmail,
      donorUserId: r.donorUserId,
      title: r.title || '',
      firstName: r.firstName,
      lastName: r.lastName,
      houseNumberOrName: r.houseNumberOrName || '',
      addressLine1: r.addressLine1 || '',
      city: r.city || '',
      postcode: r.postcode || '',
      isTaxpayerConfirmed: true,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.firstName?.trim() || !form.lastName?.trim()) {
      toast({ title: t('giftAidDeclarationsManager', 'nameRequired', 'Donor name required'), description: t('giftAidDeclarationsManager', 'nameRequiredDesc', 'Enter the donor’s first and last name.'), variant: 'destructive' });
      return;
    }
    if (!form.donorEmail?.trim()) {
      toast({ title: t('giftAidDeclarationsManager', 'emailRequired', 'Donor email required'), description: t('giftAidDeclarationsManager', 'emailRequiredDesc', 'The declaration is keyed to the donor’s email.'), variant: 'destructive' });
      return;
    }
    if (!form.postcode?.trim()) {
      toast({ title: t('giftAidDeclarationsManager', 'postcodeRequired', 'Postcode required'), description: t('giftAidDeclarationsManager', 'postcodeRequiredDesc', 'HMRC needs a UK postcode (with a space, e.g. SW1A 1AA).'), variant: 'destructive' });
      return;
    }
    if (!form.isTaxpayerConfirmed) {
      toast({ title: t('giftAidDeclarationsManager', 'taxpayerRequired', 'Taxpayer confirmation required'), description: t('giftAidDeclarationsManager', 'taxpayerRequiredDesc', 'Confirm the donor has agreed to the Gift Aid declaration as a UK taxpayer.'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const result = await saveAdminDeclaration(
        { ...form, ministryId, houseNumberOrName: form.houseNumberOrName?.trim() || null, postcode: form.postcode.trim() },
        { supersedeId, actorUserId: user?.id },
      );
      if (!result.ok) throw new Error(result.error);
      toast({
        title: supersedeId ? t('giftAidDeclarationsManager', 'declarationCorrected', 'Declaration corrected') : t('giftAidDeclarationsManager', 'declarationAdded', 'Declaration added'),
        description: t('giftAidDeclarationsManager', 'savedDesc', 'The donor’s current declaration was updated. Their donations will use the new details.'),
      });
      setShowDialog(false);
      load();
    } catch (err: any) {
      toast({ title: t('giftAidDeclarationsManager', 'error', 'Error'), description: err.message || t('giftAidDeclarationsManager', 'failedSave', 'Failed to save'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleWithdraw = async (r: DeclarationRow) => {
    if (!window.confirm(t('giftAidDeclarationsManager', 'withdrawConfirm', 'Withdraw {name}’s Gift Aid declaration? Their future donations won’t be claimable until a new declaration is made.').replace('{name}', `${r.firstName} ${r.lastName}`.trim()))) return;
    try {
      await withdrawDeclaration(r.id, ministryId, user?.id);
      toast({ title: t('giftAidDeclarationsManager', 'declarationWithdrawn', 'Declaration withdrawn') });
      load();
    } catch (err: any) {
      toast({ title: t('giftAidDeclarationsManager', 'error', 'Error'), description: err.message || t('giftAidDeclarationsManager', 'failedWithdraw', 'Failed to withdraw'), variant: 'destructive' });
    }
  };

  const set = (patch: Partial<AdminDeclarationInput>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">{t('giftAidDeclarationsManager', 'title', 'Gift Aid declarations')}</CardTitle>
              <p className="text-sm text-gray-500 mt-0.5">
                {t('giftAidDeclarationsManager', 'subtitle', 'Complete missing donor details, add paper declarations, or withdraw a declaration. Originals are kept as evidence.')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={openAdd} style={{ backgroundColor: themeColor }}>
                <Plus className="h-4 w-4 mr-1" /> {t('giftAidDeclarationsManager', 'addDeclaration', 'Add declaration')}
              </Button>
              <Button variant="outline" size="sm" onClick={load}>
                <RefreshCw className="h-4 w-4 mr-1" /> {t('giftAidDeclarationsManager', 'refresh', 'Refresh')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {incompleteActiveCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{t('giftAidDeclarationsManager', 'incompleteWarning', '{count} active declaration(s) are missing a house number/name or postcode. Their donations can’t be claimed until fixed — use “Correct” to complete them.').replace('{count}', String(incompleteActiveCount))}</span>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">{t('giftAidDeclarationsManager', 'searchDonor', 'Search donor')}</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('giftAidDeclarationsManager', 'nameOrEmail', 'Name or email')} />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t('giftAidDeclarationsManager', 'show', 'Show')}</Label>
              <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('giftAidDeclarationsManager', 'allDeclarations', 'All declarations')}</SelectItem>
                  <SelectItem value="active">{t('giftAidDeclarationsManager', 'activeOnly', 'Active only')}</SelectItem>
                  <SelectItem value="incomplete">{t('giftAidDeclarationsManager', 'incompleteOnly', 'Incomplete (active)')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="p-2 font-medium">{t('giftAidDeclarationsManager', 'donor', 'Donor')}</th>
                    <th className="p-2 font-medium">{t('giftAidDeclarationsManager', 'houseNo', 'House / no.')}</th>
                    <th className="p-2 font-medium">{t('giftAidDeclarationsManager', 'postcode', 'Postcode')}</th>
                    <th className="p-2 font-medium">{t('giftAidDeclarationsManager', 'status', 'Status')}</th>
                    <th className="p-2 font-medium">{t('giftAidDeclarationsManager', 'source', 'Source')}</th>
                    <th className="p-2 font-medium">{t('giftAidDeclarationsManager', 'date', 'Date')}</th>
                    <th className="p-2 font-medium text-right">{t('giftAidDeclarationsManager', 'actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-center text-gray-400">{t('giftAidDeclarationsManager', 'noDeclarations', 'No declarations match.')}</td></tr>
                  )}
                  {filtered.map((r) => {
                    const complete = isDeclarationComplete(r);
                    const incomplete = r.status === 'active' && !complete;
                    return (
                      <tr key={r.id} className={`border-b last:border-0 ${incomplete ? 'bg-amber-50' : ''}`}>
                        <td className="p-2">
                          <div className="font-medium">{[r.title, r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}</div>
                          <div className="text-xs text-gray-400">{r.donorEmail}</div>
                        </td>
                        <td className="p-2 text-gray-600">{r.houseNumberOrName || r.addressLine1 || <span className="text-amber-600">{t('giftAidDeclarationsManager', 'missing', 'missing')}</span>}</td>
                        <td className="p-2 text-gray-600">{r.postcode || <span className="text-amber-600">{t('giftAidDeclarationsManager', 'missing', 'missing')}</span>}</td>
                        <td className="p-2">{statusBadge(r.status)}</td>
                        <td className="p-2 text-gray-500 text-xs">{r.source || '—'}</td>
                        <td className="p-2 text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                        <td className="p-2 text-right whitespace-nowrap">
                          {r.status === 'active' && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => openCorrect(r)}>
                                <Pencil className="h-4 w-4 mr-1" /> {t('giftAidDeclarationsManager', 'correct', 'Correct')}
                              </Button>
                              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleWithdraw(r)}>
                                <Ban className="h-4 w-4 mr-1" /> {t('giftAidDeclarationsManager', 'withdraw', 'Withdraw')}
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {supersedeId ? t('giftAidDeclarationsManager', 'correctDeclaration', 'Correct declaration') : t('giftAidDeclarationsManager', 'addDeclaration', 'Add declaration')}
            </DialogTitle>
            <DialogDescription>
              {supersedeId
                ? t('giftAidDeclarationsManager', 'correctDesc', 'Fix the donor’s details. The original is kept as evidence; this becomes their current declaration.')
                : t('giftAidDeclarationsManager', 'addDesc', 'Key in a declaration (e.g. from a paper form). Only add this if the donor has agreed to the Gift Aid declaration as a UK taxpayer.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">{t('giftAidDeclarationsManager', 'titleLabel', 'Title')}</Label>
                <Input value={form.title || ''} onChange={(e) => set({ title: e.target.value })} placeholder="Mr" />
              </div>
              <div>
                <Label className="text-xs">{t('giftAidDeclarationsManager', 'firstName', 'First name')} *</Label>
                <Input value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">{t('giftAidDeclarationsManager', 'lastName', 'Last name')} *</Label>
                <Input value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t('giftAidDeclarationsManager', 'email', 'Donor email')} *</Label>
              <Input type="email" value={form.donorEmail} onChange={(e) => set({ donorEmail: e.target.value })} disabled={!!supersedeId} />
              {supersedeId && <p className="text-[11px] text-gray-400 mt-0.5">{t('giftAidDeclarationsManager', 'emailLocked', 'Locked — corrections stay with the same donor.')}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('giftAidDeclarationsManager', 'houseNumberName', 'House number / name')}</Label>
                <Input value={form.houseNumberOrName || ''} onChange={(e) => set({ houseNumberOrName: e.target.value })} placeholder="12 or Rose Cottage" />
              </div>
              <div>
                <Label className="text-xs">{t('giftAidDeclarationsManager', 'postcode', 'Postcode')} *</Label>
                <Input value={form.postcode} onChange={(e) => set({ postcode: e.target.value })} placeholder="SW1A 1AA" />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t('giftAidDeclarationsManager', 'addressLine', 'Address (optional)')}</Label>
              <Input value={form.addressLine1 || ''} onChange={(e) => set({ addressLine1: e.target.value })} placeholder={t('giftAidDeclarationsManager', 'street', 'Street')} />
            </div>
            <div>
              <Label className="text-xs">{t('giftAidDeclarationsManager', 'city', 'City / town')}</Label>
              <Input value={form.city || ''} onChange={(e) => set({ city: e.target.value })} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <Label className="flex items-center gap-1.5 text-sm">
                <ShieldCheck className="h-4 w-4 text-gray-500" />
                {t('giftAidDeclarationsManager', 'taxpayerConfirm', 'Donor has agreed the Gift Aid declaration as a UK taxpayer')}
              </Label>
              <Switch checked={!!form.isTaxpayerConfirmed} onCheckedChange={(v) => set({ isTaxpayerConfirmed: v })} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>{t('giftAidDeclarationsManager', 'cancel', 'Cancel')}</Button>
              <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: themeColor }}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {supersedeId ? t('giftAidDeclarationsManager', 'saveCorrection', 'Save correction') : t('giftAidDeclarationsManager', 'addDeclaration', 'Add declaration')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GiftAidDeclarationsManager;
