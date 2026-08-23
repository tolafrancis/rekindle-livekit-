import React, { useEffect, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Badge } from '@rekindle/ui/badge';
import { Checkbox } from '@rekindle/ui/checkbox';
import { toast } from '@rekindle/ui/use-toast';
import MinistryDuplicates from './MinistryDuplicates';
import {
  Loader2, Check, X, Eye, FileDown, ClipboardList, CheckCircle2, Clock, XCircle, Users2, Pencil, Save, BellRing,
} from 'lucide-react';

interface Props { ministryId: string; ministryName: string; }
type Tab = 'pending' | 'active' | 'rejected' | 'duplicates';

const SOURCE_LABEL: Record<string, string> = {
  qr_code: 'QR', invite_link: 'Link', kiosk: 'Kiosk', manual_admin: 'Admin', import: 'Import',
};
const MEMBERSHIP_OPTIONS = ['visitor','new_convert','regular_attendee','member','worker','minister','pastor'];

const csvEscape = (v: any) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const MinistryRegistrations: React.FC<Props> = ({ ministryId, ministryName }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('pending');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ pending: 0, active: 0, rejected: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<any>({});

  const loadCounts = async () => {
    const q = (s: string) =>
      supabase.from('ministry_member_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('ministry_id', ministryId).eq('registration_status', s);
    const [p, a, r] = await Promise.all([q('pending'), q('active'), q('rejected')]);
    setCounts({ pending: p.count || 0, active: a.count || 0, rejected: r.count || 0 });
  };

  const loadRows = async (status: Tab) => {
    if (status === 'duplicates') return;
    setLoading(true);
    setSelected(new Set());
    try {
      const { data, error } = await supabase
        .from('ministry_member_profiles')
        .select('*')
        .eq('ministry_id', ministryId)
        .eq('registration_status', status)
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows(data || []);
    } catch (e: any) {
      toast({ title: t('ministryRegistrations', 'couldNotLoad', 'Could not load'), description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const ensureGroupMembership = async (userId: string | null, ministryIdValue: string) => {
    if (!userId) return;
    const { data: existing } = await supabase
      .from('ministry_group_members')
      .select('id')
      .eq('group_id', ministryIdValue)
      .eq('user_id', userId)
      .maybeSingle();
    if (existing) return;

    const { error } = await supabase.from('ministry_group_members').insert({
      ministry_id: ministryIdValue,
      group_id: ministryIdValue,
      user_id: userId,
      role: 'member',
      is_leader: false,
      joined_at: new Date().toISOString(),
    });

    if (error && !/duplicate|already exists|unique/i.test(error.message || '')) {
      throw error;
    }
  };

  useEffect(() => { loadCounts(); /* eslint-disable-next-line */ }, [ministryId]);
  useEffect(() => { loadRows(tab); /* eslint-disable-next-line */ }, [tab, ministryId]);

  const audit = (profile: any, event: string, metadata?: any) =>
    supabase.from('member_registration_audit').insert({
      ministry_id: ministryId, user_id: profile.user_id, profile_id: profile.id,
      event_type: event, metadata: metadata || null,
    }).then(() => {}, () => {});

  const notifyMember = (profile: any, title: string, body: string) => {
    if (!profile.user_id) return Promise.resolve();
    return supabase.from('notifications').insert({
      user_id: profile.user_id, title, body, type: 'registration',
    }).then(() => {}, () => {});
  };

  const approve = async (profile: any) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('ministry_member_profiles')
        .update({ registration_status: 'active', approved_at: new Date().toISOString(), approved_by: user?.id })
        .eq('id', profile.id);
      if (error) throw error;
      await ensureGroupMembership(profile.user_id, ministryId);
      await audit(profile, 'approved');
      await notifyMember(profile, t('ministryRegistrations', 'welcomeToX', 'Welcome to {name}').replace('{name}', String(ministryName)), t('ministryRegistrations', 'registrationApproved', 'Your registration has been approved.'));
      toast({ title: t('ministryRegistrations', 'approved', 'Approved'), description: t('ministryRegistrations', 'memberIsNowActive', '{name} is now active.').replace('{name}', String(profile.first_name || t('ministryRegistrations', 'member', 'Member'))) });
      setViewing(null);
      await Promise.all([loadRows(tab), loadCounts()]);
    } catch (e: any) {
      toast({ title: t('ministryRegistrations', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const reject = async (profile: any) => {
    const reason = window.prompt(t('ministryRegistrations', 'rejectionPrompt', 'Optional message to the member (reason for rejection):'), '') ?? '';
    setBusy(true);
    try {
      const { error } = await supabase.from('ministry_member_profiles')
        .update({ registration_status: 'rejected', rejected_at: new Date().toISOString(), rejection_reason: reason || null })
        .eq('id', profile.id);
      if (error) throw error;
      await audit(profile, 'rejected', reason ? { reason } : null);
      if (reason) await notifyMember(profile, t('ministryRegistrations', 'updateOnRegistration', 'Update on your {name} registration').replace('{name}', String(ministryName)), reason);
      toast({ title: t('ministryRegistrations', 'rejected', 'Rejected'), description: t('ministryRegistrations', 'memberWasRejected', '{name} was rejected.').replace('{name}', String(profile.first_name || t('ministryRegistrations', 'member', 'Member'))) });
      setViewing(null);
      await Promise.all([loadRows(tab), loadCounts()]);
    } catch (e: any) {
      toast({ title: t('ministryRegistrations', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const bulkApprove = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const ids = Array.from(selected);
      const { error } = await supabase.from('ministry_member_profiles')
        .update({ registration_status: 'active', approved_at: new Date().toISOString(), approved_by: user?.id })
        .in('id', ids);
      if (error) throw error;
      await Promise.all(rows.filter((r) => selected.has(r.id)).map((r) => ensureGroupMembership(r.user_id, ministryId)));
      rows.filter((r) => selected.has(r.id)).forEach((r) => audit(r, 'approved'));
      toast({ title: t('ministryRegistrations', 'bulkApproved', 'Bulk approved'), description: t('ministryRegistrations', 'registrationsActivated', '{count} registrations activated.').replace('{count}', String(ids.length)) });
      await Promise.all([loadRows(tab), loadCounts()]);
    } catch (e: any) {
      toast({ title: t('ministryRegistrations', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const saveEdit = async () => {
    if (!viewing) return;
    setBusy(true);
    try {
      const patch: any = {
        first_name: edit.first_name, last_name: edit.last_name, preferred_name: edit.preferred_name,
        gender: edit.gender, date_of_birth: edit.date_of_birth || null,
        mobile_number: edit.mobile_number, email: edit.email, city: edit.city, country: edit.country,
        membership_status: edit.membership_status, updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('ministry_member_profiles').update(patch).eq('id', viewing.id);
      if (error) throw error;
      await audit(viewing, 'profile_updated');
      toast({ title: t('ministryRegistrations', 'saved', 'Saved'), description: t('ministryRegistrations', 'profileUpdated', 'Profile updated.') });
      setEditing(false);
      setViewing({ ...viewing, ...patch });
      await loadRows(tab);
    } catch (e: any) {
      toast({ title: t('ministryRegistrations', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const sendReminder = async (profile: any) => {
    setBusy(true);
    try {
      await supabase.from('ministry_member_profiles').update({ last_completion_nudge_at: new Date().toISOString() }).eq('id', profile.id);
      await notifyMember(profile, t('ministryRegistrations', 'completeYourProfile', 'Complete your {name} profile').replace('{name}', String(ministryName)),
        t('ministryRegistrations', 'profileCompleteBody', 'Your profile is {percent}% complete. Please finish the remaining details when you can.').replace('{percent}', String(profile.profile_completion_percentage ?? 0)));
      await audit(profile, 'profile_updated', { action: 'completion_reminder_sent' });
      toast({ title: t('ministryRegistrations', 'reminderSent', 'Reminder sent'), description: t('ministryRegistrations', 'memberWasNudged', '{name} was nudged to finish their profile.').replace('{name}', String(profile.first_name || t('ministryRegistrations', 'member', 'Member'))) });
    } catch (e: any) {
      toast({ title: t('ministryRegistrations', 'error', 'Error'), description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const exportCsv = () => {
    const cols = ['first_name','middle_name','last_name','preferred_name','gender','date_of_birth',
      'mobile_number','email','city','country','membership_status','registration_status',
      'registration_source','submitted_at','created_at'];
    const header = cols.join(',');
    const lines = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(','));
    const csv = [header, ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${ministryName}-${tab}-registrations.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openViewer = (r: any) => { setViewing(r); setEdit(r); setEditing(false); };

  const tabs: { id: Tab; label: string; icon: any; count?: number }[] = [
    { id: 'pending', label: t('ministryRegistrations', 'tabPending', 'Pending'), icon: Clock, count: counts.pending },
    { id: 'active', label: t('ministryRegistrations', 'tabActive', 'Active'), icon: CheckCircle2, count: counts.active },
    { id: 'rejected', label: t('ministryRegistrations', 'tabRejected', 'Rejected'), icon: XCircle, count: counts.rejected },
    { id: 'duplicates', label: t('ministryRegistrations', 'tabDuplicates', 'Duplicates'), icon: Users2 },
  ];

  const fullName = (r: any) => [r.first_name, r.last_name].filter(Boolean).join(' ') || r.preferred_name || t('ministryRegistrations', 'unnamed', 'Unnamed');
  const when = (r: any) => (r.submitted_at || r.created_at || '').slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-purple-600" />
        <h2 className="text-lg font-semibold">{t('ministryRegistrations', 'heading', 'Registrations')}</h2>
      </div>

      {/* sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tb) => {
          const Icon = tb.icon; const on = tab === tb.id;
          return (
            <button key={tb.id} onClick={() => setTab(tb.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition ${on ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <Icon className="h-3.5 w-3.5" /> {tb.label}
              {typeof tb.count === 'number' && <span className={`ml-1 text-xs ${on ? 'opacity-90' : 'text-gray-400'}`}>{tb.count}</span>}
            </button>
          );
        })}
      </div>

      {tab === 'duplicates' ? (
        <MinistryDuplicates ministryId={ministryId} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {tab === 'pending' && (
                <Button size="sm" disabled={busy || selected.size === 0} onClick={bulkApprove}>
                  <Check className="h-4 w-4 mr-1" /> {t('ministryRegistrations', 'approveSelected', 'Approve selected')} ({selected.size})
                </Button>
              )}
            </div>
            <Button size="sm" variant="outline" disabled={rows.length === 0} onClick={exportCsv}>
              <FileDown className="h-4 w-4 mr-1" /> {t('ministryRegistrations', 'exportCsv', 'Export CSV')}
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-purple-600" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">{t('ministryRegistrations', 'noRegistrations', 'No {tab} registrations.').replace('{tab}', String(tab))}</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 border rounded-lg p-3 bg-white">
                  {tab === 'pending' && (
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={(v) => setSelected((s) => {
                        const n = new Set(s); v === true ? n.add(r.id) : n.delete(r.id); return n;
                      })}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{fullName(r)}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {when(r)} · {SOURCE_LABEL[r.registration_source] || r.registration_source || '—'}
                      {r.membership_status ? ` · ${r.membership_status.replace(/_/g, ' ')}` : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => openViewer(r)}><Eye className="h-4 w-4" /></Button>
                  {tab === 'pending' && (
                    <>
                      <Button size="sm" variant="ghost" className="text-green-600" disabled={busy} onClick={() => approve(r)}><Check className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="text-red-600" disabled={busy} onClick={() => reject(r)}><X className="h-4 w-4" /></Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Profile viewer / editor */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h3 className="font-semibold">{fullName(viewing)}</h3>
              <div className="flex items-center gap-2">
                {!editing && (viewing.profile_completion_percentage ?? 0) < 100 && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => sendReminder(viewing)} title={t('ministryRegistrations', 'sendCompletionReminder', 'Send completion reminder')}>
                    <BellRing className="h-4 w-4 mr-1" /> {t('ministryRegistrations', 'remind', 'Remind')} ({viewing.profile_completion_percentage ?? 0}%)
                  </Button>
                )}
                {!editing ? (
                  <Button size="sm" variant="outline" onClick={() => { setEdit(viewing); setEditing(true); }}><Pencil className="h-4 w-4 mr-1" /> {t('ministryRegistrations', 'edit', 'Edit')}</Button>
                ) : (
                  <Button size="sm" disabled={busy} onClick={saveEdit}><Save className="h-4 w-4 mr-1" /> {t('ministryRegistrations', 'save', 'Save')}</Button>
                )}
                <button onClick={() => setViewing(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {([
                ['first_name',t('ministryRegistrations', 'firstName', 'First name')],['last_name',t('ministryRegistrations', 'lastName', 'Last name')],['preferred_name',t('ministryRegistrations', 'preferredName', 'Preferred name')],
                ['gender',t('ministryRegistrations', 'gender', 'Gender')],['date_of_birth',t('ministryRegistrations', 'dateOfBirth', 'Date of birth')],['mobile_number',t('ministryRegistrations', 'mobile', 'Mobile')],
                ['email',t('ministryRegistrations', 'email', 'Email')],['city',t('ministryRegistrations', 'city', 'City')],['country',t('ministryRegistrations', 'country', 'Country')],
              ] as [string,string][]).map(([k,lbl]) => (
                <div key={k} className="grid grid-cols-3 gap-2 items-center">
                  <Label className="text-xs text-gray-500">{lbl}</Label>
                  {editing ? (
                    <Input className="col-span-2 h-8" type={k === 'date_of_birth' ? 'date' : 'text'}
                      value={edit[k] || ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
                  ) : (
                    <span className="col-span-2 text-sm">{viewing[k] || <span className="text-gray-300">—</span>}</span>
                  )}
                </div>
              ))}
              {/* Membership status override (admin only) */}
              <div className="grid grid-cols-3 gap-2 items-center">
                <Label className="text-xs text-gray-500">{t('ministryRegistrations', 'membershipStatus', 'Membership status')}</Label>
                <select className="col-span-2 h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={editing ? (edit.membership_status || '') : (viewing.membership_status || '')}
                  disabled={!editing}
                  onChange={(e) => setEdit({ ...edit, membership_status: e.target.value })}>
                  <option value="">—</option>
                  {MEMBERSHIP_OPTIONS.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <Label className="text-xs text-gray-500">{t('ministryRegistrations', 'registration', 'Registration')}</Label>
                <span className="col-span-2 text-sm capitalize">{viewing.registration_status} · {SOURCE_LABEL[viewing.registration_source] || viewing.registration_source}</span>
              </div>
              {viewing.rejection_reason && (
                <div className="text-xs text-red-600">{t('ministryRegistrations', 'rejectionNote', 'Rejection note:')} {viewing.rejection_reason}</div>
              )}
            </div>
            {viewing.registration_status === 'pending' && !editing && (
              <div className="flex gap-2 p-4 border-t">
                <Button className="flex-1" disabled={busy} onClick={() => approve(viewing)}><Check className="h-4 w-4 mr-1" /> {t('ministryRegistrations', 'approve', 'Approve')}</Button>
                <Button className="flex-1" variant="outline" disabled={busy} onClick={() => reject(viewing)}><X className="h-4 w-4 mr-1" /> {t('ministryRegistrations', 'reject', 'Reject')}</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MinistryRegistrations;
