import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Switch } from '@rekindle/ui/switch';
import { Progress } from '@rekindle/ui/progress';
import { Badge } from '@rekindle/ui/badge';
import { toast } from '@rekindle/ui/use-toast';
import {
  Loader2, Save, Plus, Trash2, User, Users, Phone, Heart, Bell, ShieldCheck, Baby,
} from 'lucide-react';

const DECLARATION_VERSION = '1.0';
const CONSENT_LABEL: Record<string, string> = {
  privacy_policy: 'Privacy Policy', data_processing: 'Data processing',
  photo_media: 'Photo / media', child_protection: 'Child protection', gift_aid: 'Gift Aid',
};

const MemberMinistryProfile: React.FC<{ slug?: string }> = ({ slug: slugProp }) => {
  const params = useParams<{ slug: string }>();
  const slug = slugProp || params.slug;
  const { user } = useAuth();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [ministry, setMinistry] = useState<any>(null);
  const [pid, setPid] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<any>({});
  const [children, setChildren] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [interests, setInterests] = useState<any[]>([]);
  const [prefs, setPrefs] = useState<any>(null);
  const [consents, setConsents] = useState<any[]>([]);

  const load = async () => {
    if (!user || !slug) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: mv } = await supabase.rpc('validate_join', { p_slug: slug, p_code: '', p_version: null });
      const m = Array.isArray(mv) ? mv[0] : mv;
      setMinistry(m);
      if (!m || m.code_status === 'not_found') { setLoading(false); return; }

      const { data: prof } = await supabase
        .from('ministry_member_profiles').select('*')
        .eq('ministry_id', m.ministry_id).eq('user_id', user.id).maybeSingle();
      if (!prof) { setLoading(false); return; }
      setPid(prof.id);
      setF(prof);

      const [ch, ec, mi, cp, cs] = await Promise.all([
        supabase.from('member_children').select('*').eq('parent_profile_id', prof.id).eq('is_active', true),
        supabase.from('member_emergency_contacts').select('*').eq('ministry_member_profile_id', prof.id),
        supabase.from('member_ministry_interests').select('*').eq('ministry_member_profile_id', prof.id),
        supabase.from('member_communication_preferences').select('*').eq('ministry_member_profile_id', prof.id).maybeSingle(),
        supabase.from('member_consents').select('*').eq('ministry_member_profile_id', prof.id).order('actioned_at', { ascending: false }),
      ]);
      setChildren(ch.data || []); setContacts(ec.data || []); setInterests(mi.data || []);
      setPrefs(cp.data || { ministry_member_profile_id: prof.id, email_notifications: true, sms_notifications: true, whatsapp_notifications: true, push_notifications: true, newsletter_subscription: true });
      setConsents(cs.data || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user, slug]);

  const upd = (patch: any) => setF((p: any) => ({ ...p, ...patch }));

  const saveFields = async () => {
    if (!pid) return;
    setSaving(true);
    try {
      const cols = ['middle_name','preferred_name','marital_status','alternate_phone','address_line_1','address_line_2',
        'state_province','postal_code','baptism_status','water_baptism_date','holy_ghost_baptism_status','previous_church',
        'date_of_salvation','small_group','cell_leader','giving_number','preferred_giving_method',
        'is_born_again','is_baptized','interested_in_discipleship','interested_in_workers_training'];
      const patch: any = { updated_at: new Date().toISOString() };
      cols.forEach((c) => { patch[c] = f[c] === '' ? null : f[c] ?? null; });
      const { error } = await supabase.from('ministry_member_profiles').update(patch).eq('id', pid);
      if (error) throw error;
      await supabase.from('member_registration_audit').insert({ ministry_id: ministry.ministry_id, user_id: user?.id, profile_id: pid, event_type: 'profile_updated' }).then(() => {}, () => {});
      toast({ title: t('memberMinistryProfile', 'saved', 'Saved'), description: t('memberMinistryProfile', 'profileUpdated', 'Your profile was updated.') });
      load();
    } catch (e: any) { toast({ title: t('memberMinistryProfile', 'error', 'Error'), description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  // children
  const addChild = async () => {
    if (!pid) return;
    const { data } = await supabase.from('member_children').insert({ parent_profile_id: pid, name: 'New child' }).select().single();
    if (data) setChildren((c) => [...c, data]);
  };
  const saveChild = async (id: string, patch: any) => { await supabase.from('member_children').update(patch).eq('id', id); };
  const removeChild = async (id: string) => { await supabase.from('member_children').update({ is_active: false }).eq('id', id); setChildren((c) => c.filter((x) => x.id !== id)); };

  // contacts
  const addContact = async () => {
    if (!pid) return;
    const { data } = await supabase.from('member_emergency_contacts').insert({ ministry_member_profile_id: pid, contact_name: 'New contact' }).select().single();
    if (data) setContacts((c) => [...c, data]);
  };
  const saveContact = async (id: string, patch: any) => { await supabase.from('member_emergency_contacts').update(patch).eq('id', id); };
  const removeContact = async (id: string) => { await supabase.from('member_emergency_contacts').delete().eq('id', id); setContacts((c) => c.filter((x) => x.id !== id)); };

  // interests
  const [newInterest, setNewInterest] = useState('');
  const addInterest = async () => {
    if (!pid || !newInterest.trim()) return;
    const { data } = await supabase.from('member_ministry_interests').insert({ ministry_member_profile_id: pid, category: 'interest', value: newInterest.trim() }).select().single();
    if (data) { setInterests((i) => [...i, data]); setNewInterest(''); }
  };
  const removeInterest = async (id: string) => { await supabase.from('member_ministry_interests').delete().eq('id', id); setInterests((i) => i.filter((x) => x.id !== id)); };

  // comm prefs
  const togglePref = async (key: string, val: boolean) => {
    if (!pid) return;
    const next = { ...prefs, [key]: val, ministry_member_profile_id: pid, updated_at: new Date().toISOString() };
    setPrefs(next);
    await supabase.from('member_communication_preferences').upsert(next, { onConflict: 'ministry_member_profile_id' });
  };

  // consents — current status = latest row per type
  const currentConsent = (type: string) => consents.find((c) => c.consent_type === type);
  const withdraw = async (type: string) => {
    if (!pid) return;
    const { error } = await supabase.from('member_consents').insert({
      ministry_member_profile_id: pid, user_id: user?.id, consent_type: type, consent_given: false,
      declaration_text_shown: 'Consent withdrawn by member', declaration_version: DECLARATION_VERSION,
      source_platform: 'web', withdrawal_at: new Date().toISOString(),
    });
    if (error) { toast({ title: t('memberMinistryProfile', 'error', 'Error'), description: error.message, variant: 'destructive' }); return; }
    await supabase.from('member_registration_audit').insert({ ministry_id: ministry.ministry_id, user_id: user?.id, profile_id: pid, event_type: 'consent_withdrawn', metadata: { consent_type: type } }).then(() => {}, () => {});
    toast({ title: t('memberMinistryProfile', 'consentWithdrawn', 'Consent withdrawn'), description: CONSENT_LABEL[type] || type });
    load();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-purple-600" /></div>;
  if (!user) return <div className="text-center py-16 text-gray-500">{t('memberMinistryProfile', 'signInPrompt', 'Please sign in to view your membership profile.')}</div>;
  if (!ministry || ministry.code_status === 'not_found') return <div className="text-center py-16 text-gray-500">{t('memberMinistryProfile', 'ministryNotFound', 'Ministry not found.')}</div>;
  if (!pid) return (
    <div className="text-center py-16 text-gray-500">
      <p className="mb-3">{t('memberMinistryProfile', 'notRegisteredYet', 'You haven’t registered for {name} yet.').replace('{name}', String(ministry.name))}</p>
      <Button onClick={() => (window.location.href = `/register/${slug}`)}>{t('memberMinistryProfile', 'registerNow', 'Register now')}</Button>
    </div>
  );

  const field = (k: string, lbl: string, type = 'text') => (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-500">{lbl}</Label>
      <Input type={type} value={f[k] || ''} onChange={(e) => upd({ [k]: e.target.value })} />
    </div>
  );
  const toggle = (k: string, lbl: string) => (
    <div className="flex items-center justify-between gap-3 py-1">
      <Label className="text-sm">{lbl}</Label>
      <Switch checked={!!f[k]} onCheckedChange={(v) => upd({ [k]: v })} />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold">{ministry.name}</h1>
        <p className="text-sm text-gray-500">{t('memberMinistryProfile', 'yourMembershipProfile', 'Your membership profile')}</p>
      </div>

      {/* completion */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium">{t('memberMinistryProfile', 'profileCompletion', 'Profile completion')}</span>
            <span className="text-sm text-gray-500">{f.profile_completion_percentage ?? 0}%</span>
          </div>
          <Progress value={f.profile_completion_percentage ?? 0} className="h-2" />
          {(f.profile_completion_percentage ?? 0) < 100 && (
            <p className="text-xs text-gray-500 mt-2">{t('memberMinistryProfile', 'fillSectionsBelow', 'Fill in the sections below to complete your profile.')}</p>
          )}
        </CardContent>
      </Card>

      {/* Tier 2/3 details */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4 text-purple-600" /> {t('memberMinistryProfile', 'personalDetails', 'Personal details')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {field('middle_name', t('memberMinistryProfile', 'middleName', 'Middle name'))}
            {field('preferred_name', t('memberMinistryProfile', 'preferredName', 'Preferred name'))}
            {field('marital_status', t('memberMinistryProfile', 'maritalStatus', 'Marital status'))}
            {field('alternate_phone', t('memberMinistryProfile', 'alternatePhone', 'Alternate phone'))}
          </div>
          {field('address_line_1', t('memberMinistryProfile', 'addressLine1', 'Address line 1'))}
          {field('address_line_2', t('memberMinistryProfile', 'addressLine2', 'Address line 2'))}
          <div className="grid grid-cols-2 gap-3">
            {field('state_province', t('memberMinistryProfile', 'stateProvince', 'State / province'))}
            {field('postal_code', t('memberMinistryProfile', 'postalCode', 'Postal code'))}
          </div>
          <div className="text-xs text-gray-400 pt-1">{t('memberMinistryProfile', 'membershipStatusLabel', 'Membership status:')} <span className="capitalize">{(f.membership_status || '—').replace(/_/g, ' ')}</span> {t('memberMinistryProfile', 'setByMinistry', '(set by your ministry)')}</div>
        </CardContent>
      </Card>

      {/* Spiritual */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Heart className="h-4 w-4 text-pink-600" /> {t('memberMinistryProfile', 'spiritualJourney', 'Spiritual journey')}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            {field('date_of_salvation', t('memberMinistryProfile', 'dateOfSalvation', 'Date of salvation'), 'date')}
            {field('baptism_status', t('memberMinistryProfile', 'waterBaptismStatus', 'Water baptism status'))}
            {field('water_baptism_date', t('memberMinistryProfile', 'waterBaptismDate', 'Water baptism date'), 'date')}
            {field('holy_ghost_baptism_status', t('memberMinistryProfile', 'holyGhostBaptism', 'Holy Ghost baptism'))}
            {field('previous_church', t('memberMinistryProfile', 'previousChurch', 'Previous church'))}
            {field('small_group', t('memberMinistryProfile', 'smallGroupCell', 'Small group / cell'))}
            {field('cell_leader', t('memberMinistryProfile', 'cellLeader', 'Cell leader'))}
          </div>
          <div className="pt-2 space-y-1 border-t mt-2">
            {toggle('is_born_again', t('memberMinistryProfile', 'iAmBornAgain', 'I am born again'))}
            {toggle('is_baptized', t('memberMinistryProfile', 'iAmBaptized', 'I am baptized'))}
            {toggle('interested_in_discipleship', t('memberMinistryProfile', 'interestedDiscipleship', 'Interested in discipleship'))}
            {toggle('interested_in_workers_training', t('memberMinistryProfile', 'interestedWorkersTraining', 'Interested in workers’ training'))}
          </div>
        </CardContent>
      </Card>

      {/* Giving */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('memberMinistryProfile', 'giving', 'Giving')}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          {field('giving_number', t('memberMinistryProfile', 'givingNumber', 'Giving number'))}
          {field('preferred_giving_method', t('memberMinistryProfile', 'preferredMethod', 'Preferred method'))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={saveFields} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} {t('memberMinistryProfile', 'saveDetails', 'Save details')}
        </Button>
      </div>

      {/* Children */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Baby className="h-4 w-4 text-amber-600" /> {t('memberMinistryProfile', 'children', 'Children')}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {children.length === 0 && <p className="text-sm text-gray-400">{t('memberMinistryProfile', 'noChildrenAdded', 'No children added.')}</p>}
          {children.map((c) => (
            <div key={c.id} className="grid grid-cols-12 gap-2 items-center">
              <Input className="col-span-5" defaultValue={c.name} placeholder={t('memberMinistryProfile', 'namePlaceholder', 'Name')} onBlur={(e) => saveChild(c.id, { name: e.target.value })} />
              <Input className="col-span-4" type="date" defaultValue={c.date_of_birth || ''} onBlur={(e) => saveChild(c.id, { date_of_birth: e.target.value || null })} />
              <Input className="col-span-2" defaultValue={c.gender || ''} placeholder={t('memberMinistryProfile', 'genderPlaceholder', 'Gender')} onBlur={(e) => saveChild(c.id, { gender: e.target.value })} />
              <button className="col-span-1 text-red-500 flex justify-center" onClick={() => removeChild(c.id)}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addChild}><Plus className="h-4 w-4 mr-1" /> {t('memberMinistryProfile', 'addChild', 'Add child')}</Button>
        </CardContent>
      </Card>

      {/* Emergency contacts */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Phone className="h-4 w-4 text-red-500" /> {t('memberMinistryProfile', 'emergencyContacts', 'Emergency contacts')}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {contacts.length === 0 && <p className="text-sm text-gray-400">{t('memberMinistryProfile', 'noContactsAdded', 'No contacts added.')}</p>}
          {contacts.map((c) => (
            <div key={c.id} className="grid grid-cols-12 gap-2 items-center">
              <Input className="col-span-4" defaultValue={c.contact_name} placeholder={t('memberMinistryProfile', 'namePlaceholder', 'Name')} onBlur={(e) => saveContact(c.id, { contact_name: e.target.value })} />
              <Input className="col-span-3" defaultValue={c.relationship || ''} placeholder={t('memberMinistryProfile', 'relationshipPlaceholder', 'Relationship')} onBlur={(e) => saveContact(c.id, { relationship: e.target.value })} />
              <Input className="col-span-4" defaultValue={c.phone_number || ''} placeholder={t('memberMinistryProfile', 'phonePlaceholder', 'Phone')} onBlur={(e) => saveContact(c.id, { phone_number: e.target.value })} />
              <button className="col-span-1 text-red-500 flex justify-center" onClick={() => removeContact(c.id)}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addContact}><Plus className="h-4 w-4 mr-1" /> {t('memberMinistryProfile', 'addContact', 'Add contact')}</Button>
        </CardContent>
      </Card>

      {/* Interests */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-indigo-600" /> {t('memberMinistryProfile', 'interestsService', 'Interests & service')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {interests.map((i) => (
              <Badge key={i.id} variant="secondary" className="flex items-center gap-1">
                {i.value}
                <button onClick={() => removeInterest(i.id)} className="text-gray-400 hover:text-red-500">×</button>
              </Badge>
            ))}
            {interests.length === 0 && <p className="text-sm text-gray-400">{t('memberMinistryProfile', 'noneYet', 'None yet.')}</p>}
          </div>
          <div className="flex gap-2">
            <Input value={newInterest} onChange={(e) => setNewInterest(e.target.value)} placeholder={t('memberMinistryProfile', 'interestPlaceholder', 'e.g. Choir, Media, Ushering')} />
            <Button variant="outline" size="sm" onClick={addInterest}><Plus className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Communication preferences */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4 text-blue-600" /> {t('memberMinistryProfile', 'communicationPreferences', 'Communication preferences')}</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {prefs && ([
            ['email_notifications', t('memberMinistryProfile', 'emailNotifications', 'Email notifications')],
            ['sms_notifications', t('memberMinistryProfile', 'smsNotifications', 'SMS notifications')],
            ['whatsapp_notifications', t('memberMinistryProfile', 'whatsappNotifications', 'WhatsApp notifications')],
            ['push_notifications', t('memberMinistryProfile', 'pushNotifications', 'Push notifications')],
            ['newsletter_subscription', t('memberMinistryProfile', 'newsletter', 'Newsletter')],
          ] as [string, string][]).map(([k, lbl]) => (
            <div key={k} className="flex items-center justify-between py-1">
              <Label className="text-sm">{lbl}</Label>
              <Switch checked={!!prefs[k]} onCheckedChange={(v) => togglePref(k, v)} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Consent history */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-green-600" /> {t('memberMinistryProfile', 'consentHistory', 'Consent history')}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {['privacy_policy', 'data_processing', 'photo_media', 'child_protection', 'gift_aid'].map((type) => {
            const cur = currentConsent(type);
            if (!cur) return null;
            const given = cur.consent_given && !cur.withdrawal_at;
            return (
              <div key={type} className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium">{CONSENT_LABEL[type] || type}</p>
                  <p className="text-xs text-gray-400">{given ? t('memberMinistryProfile', 'given', 'Given') : t('memberMinistryProfile', 'withdrawn', 'Withdrawn')} · {(cur.actioned_at || '').slice(0, 10)}</p>
                </div>
                {given && <Button size="sm" variant="outline" onClick={() => withdraw(type)}>{t('memberMinistryProfile', 'withdraw', 'Withdraw')}</Button>}
              </div>
            );
          })}
          {consents.length === 0 && <p className="text-sm text-gray-400">{t('memberMinistryProfile', 'noConsentRecords', 'No consent records.')}</p>}
        </CardContent>
      </Card>
    </div>
  );
};

export default MemberMinistryProfile;
