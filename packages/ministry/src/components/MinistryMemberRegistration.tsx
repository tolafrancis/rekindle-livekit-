import React, { useEffect, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Progress } from '@rekindle/ui/progress';
import { Checkbox } from '@rekindle/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@rekindle/ui/radio-group';
import { toast } from '@rekindle/ui/use-toast';
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2, Clock, Smartphone } from 'lucide-react';
import { generateQrPngDataUrl } from '@rekindle/features/qrCode';
import { getMinistryEntitlements } from '@rekindle/auth/ministryEntitlements';

interface Props {
  ministryId: string;
  ministryName: string;
  country?: string | null;
  giftAidEnabled?: boolean;
  registrationMode: string;            // 'auto_approve' | 'pending_approval'
  registrationSource?: string;         // 'qr_code' | 'invite_link' | 'kiosk'
  kioskMode?: boolean;
  guestMode?: boolean;                                  // kiosk guest (no account)
  onGuestSubmit?: (payload: any) => Promise<'active' | 'pending'>;
  accountSetupUrl?: string;                             // kiosk: QR/link to sign in & claim this record
  onComplete?: (status: 'active' | 'pending') => void;
  onExit?: () => void;
}

const MEMBERSHIP_OPTIONS = [
  { value: 'visitor', labelKey: 'msVisitor', label: 'Visitor / first time here' },
  { value: 'new_convert', labelKey: 'msNewConvert', label: 'New convert' },
  { value: 'regular_attendee', labelKey: 'msRegularAttendee', label: 'Regular attendee' },
  { value: 'member', labelKey: 'msMember', label: 'Member' },
  { value: 'worker', labelKey: 'msWorker', label: 'Worker' },
  { value: 'minister', labelKey: 'msMinister', label: 'Minister' },
  { value: 'pastor', labelKey: 'msPastor', label: 'Pastor' },
];

const DECLARATION_VERSION = '1.0';

const TOTAL_STEPS = 4;

const MinistryMemberRegistration: React.FC<Props> = ({
  ministryId, ministryName, country, giftAidEnabled, registrationMode,
  registrationSource = 'qr_code', kioskMode = false, guestMode = false, onGuestSubmit, accountSetupUrl, onComplete, onExit,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const showGiftAid = (country || '').toUpperCase() === 'UK' && !!giftAidEnabled;

  const CONSENT_TEXTS: Record<string, string> = {
    privacy_policy: `I have read and agree to the Privacy Policy and to how ${ministryName} stores and uses my data.`,
    data_processing: `I consent to ${ministryName} processing my personal data for membership, pastoral care, and communication.`,
    photo_media: `I consent to photos and video taken at services and events, which may include me, being used by ${ministryName}.`,
    gift_aid: `I am a UK taxpayer and would like ${ministryName} to reclaim Gift Aid on my donations.`,
  };

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [done, setDone] = useState<null | 'active' | 'pending'>(null);
  const [setupQr, setSetupQr] = useState('');

  const [f, setF] = useState({
    first_name: '', middle_name: '', last_name: '', preferred_name: '',
    gender: '', date_of_birth: '',
    mobile_number: '', email: '', city: '', country: country || '',
    membership_status: '',
    consent_privacy_policy: false, consent_data_processing: false,
    consent_photo_media: false, consent_gift_aid: false,
  });
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));

  // Load any existing draft/profile + prefill contact from the account.
  useEffect(() => {
    (async () => {
      if (!user) { setLoading(false); return; }
      try {
        const { data: prof } = await supabase
          .from('ministry_member_profiles')
          .select('*')
          .eq('ministry_id', ministryId)
          .eq('user_id', user.id)
          .maybeSingle();

        const { data: up } = await supabase
          .from('user_profiles')
          .select('full_name, phone, email')
          .eq('user_id', user.id)
          .maybeSingle();

        const fullName = (up as any)?.full_name || '';
        const [guessFirst, ...rest] = fullName.split(' ');

        if (prof) {
          setProfileId(prof.id);
          if (prof.registration_status === 'active') { setDone('active'); }
          setF((p) => ({
            ...p,
            first_name: prof.first_name || guessFirst || '',
            middle_name: prof.middle_name || '',
            last_name: prof.last_name || rest.join(' ') || '',
            preferred_name: prof.preferred_name || '',
            gender: prof.gender || '',
            date_of_birth: prof.date_of_birth || '',
            mobile_number: prof.mobile_number || (up as any)?.phone || '',
            email: prof.email || (user as any)?.email || (up as any)?.email || '',
            city: prof.city || '',
            country: prof.country || country || '',
            membership_status: prof.membership_status || '',
          }));
          if (prof.registration_step && prof.registration_status !== 'active') {
            setStep(Math.min(Math.max(prof.registration_step, 1), TOTAL_STEPS));
          }
        } else {
          setF((p) => ({
            ...p,
            first_name: guessFirst || '',
            last_name: rest.join(' ') || '',
            mobile_number: (up as any)?.phone || '',
            email: (user as any)?.email || (up as any)?.email || '',
          }));
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ministryId]);

  useEffect(() => {
    let active = true;
    if (done && guestMode && accountSetupUrl) {
      generateQrPngDataUrl(accountSetupUrl, 360).then((d) => { if (active) setSetupQr(d); }).catch(() => {});
    }
    return () => { active = false; };
  }, [done, guestMode, accountSetupUrl]);

  const completionPct = () => {
    const tier1 = [f.first_name, f.last_name, f.date_of_birth, f.mobile_number, f.email, f.membership_status];
    const filled = tier1.filter((v) => v && String(v).trim()).length;
    return Math.round((filled / tier1.length) * 60); // Tier 1 complete ≈ 60%; Tier 2/3 fill the rest later
  };

  const baseProfilePayload = (status: string) => ({
    ministry_id: ministryId,
    user_id: user?.id,
    first_name: f.first_name.trim() || null,
    middle_name: f.middle_name.trim() || null,
    last_name: f.last_name.trim() || null,
    preferred_name: f.preferred_name.trim() || null,
    gender: f.gender || null,
    date_of_birth: f.date_of_birth || null,
    mobile_number: f.mobile_number.trim() || null,
    email: f.email.trim() || null,
    city: f.city.trim() || null,
    country: (f.country || '').trim() || null,
    membership_status: f.membership_status || null,
    registration_source: registrationSource,
    registration_status: status,
    registration_step: step,
    profile_completion_percentage: completionPct(),
    updated_at: new Date().toISOString(),
  });

  const upsertProfile = async (payload: any) => {
    const { data, error } = await supabase
      .from('ministry_member_profiles')
      .upsert(payload, { onConflict: 'ministry_id,user_id' })
      .select('id')
      .single();
    if (error) throw error;
    setProfileId(data.id);
    return data.id as string;
  };

  const ensureGroupMembership = async (profileId?: string) => {
    if (!user?.id) return;
    const { data: existing } = await supabase
      .from('ministry_group_members')
      .select('id')
      .eq('group_id', ministryId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing) return;

    // Member-count limit, resolved from the ministry's real plan (fix 2's
    // getMinistryEntitlements) — -1 means unlimited.
    const entitlements = await getMinistryEntitlements(ministryId);
    if (entitlements.limits.members !== -1) {
      const { count } = await supabase
        .from('ministry_group_members')
        .select('*', { count: 'exact', head: true })
        .eq('ministry_id', ministryId);
      if ((count ?? 0) >= entitlements.limits.members) {
        throw new Error(`This ministry has reached its member limit (${entitlements.limits.members}). Ask an admin to upgrade the plan.`);
      }
    }

    const { error } = await supabase
      .from('ministry_group_members')
      .insert({
        ministry_id: ministryId,
        group_id: ministryId,
        user_id: user.id,
        role: 'member',
        is_leader: false,
        joined_at: new Date().toISOString(),
      });

    if (error && !/duplicate|already exists|unique/i.test(error.message || '')) {
      throw error;
    }
  };

  const validateStep = (): string | null => {
    if (step === 1) {
      if (!f.first_name.trim()) return t('ministryMemberRegistration', 'errFirstName', 'Please enter your first name.');
      if (!f.last_name.trim()) return t('ministryMemberRegistration', 'errLastName', 'Please enter your last name.');
      if (!f.date_of_birth) return t('ministryMemberRegistration', 'errDob', 'Please enter your date of birth.');
    }
    if (step === 2) {
      if (!f.mobile_number.trim()) return t('ministryMemberRegistration', 'errMobile', 'Please enter your mobile number.');
      if (!f.email.trim()) return t('ministryMemberRegistration', 'errEmail', 'Please enter your email.');
    }
    if (step === 3 && !f.membership_status) return t('ministryMemberRegistration', 'errChurchRelation', 'Please choose how you relate to the church.');
    return null;
  };

  const next = async () => {
    const err = validateStep();
    if (err) { toast({ title: t('ministryMemberRegistration', 'almostThere', 'Almost there'), description: err, variant: 'destructive' }); return; }
    if (guestMode) { setStep((s) => Math.min(s + 1, TOTAL_STEPS)); return; }
    setSaving(true);
    try {
      const id = await upsertProfile(baseProfilePayload('draft'));
      if (step === 1 && id) {
        // best-effort audit; ignore failures
        supabase.from('member_registration_audit').insert({
          ministry_id: ministryId, user_id: user?.id, profile_id: id,
          event_type: 'registration_started', step_number: 1,
        }).then(() => {}, () => {});
      }
      setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    } catch (e: any) {
      toast({ title: t('ministryMemberRegistration', 'couldNotSave', 'Could not save'), description: e.message || t('ministryMemberRegistration', 'pleaseTryAgain', 'Please try again.'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const back = () => setStep((s) => Math.max(s - 1, 1));

  const submit = async () => {
    if (!f.consent_privacy_policy || !f.consent_data_processing) {
      toast({ title: t('ministryMemberRegistration', 'consentRequired', 'Consent required'), description: t('ministryMemberRegistration', 'consentRequiredDesc', 'Please agree to the Privacy Policy and data processing to continue.'), variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const shown: string[] = ['privacy_policy', 'data_processing', 'photo_media'];
      if (showGiftAid) shown.push('gift_aid');

      if (guestMode && onGuestSubmit) {
        const payload = {
          first_name: f.first_name.trim(), middle_name: f.middle_name.trim(), last_name: f.last_name.trim(),
          preferred_name: f.preferred_name.trim(), gender: f.gender, date_of_birth: f.date_of_birth,
          mobile_number: f.mobile_number.trim(), email: f.email.trim(), city: f.city.trim(),
          country: (f.country || '').trim(), membership_status: f.membership_status,
          completion: completionPct(),
          consents: shown.map((ct) => ({ type: ct, given: (f as any)[`consent_${ct}`] === true, text: CONSENT_TEXTS[ct], version: DECLARATION_VERSION })),
        };
        const st = await onGuestSubmit(payload);
        setDone(st);
        onComplete?.(st);
        return;
      }

      const status = registrationMode === 'pending_approval' ? 'pending' : 'active';
      const payload: any = {
        ...baseProfilePayload(status),
        registration_step: TOTAL_STEPS,
        submitted_at: new Date().toISOString(),
      };
      if (status === 'active') payload.approved_at = new Date().toISOString();
      const id = await upsertProfile(payload);
      if (status === 'active') await ensureGroupMembership(id);

      // Communication preferences (defaults on; tunable later in profile)
      await supabase.from('member_communication_preferences')
        .upsert({ ministry_member_profile_id: id }, { onConflict: 'ministry_member_profile_id' });

      // Consents (append-only)
      const consentRows = shown.map((ct) => ({
        ministry_member_profile_id: id,
        user_id: user?.id,
        consent_type: ct,
        consent_given: (f as any)[`consent_${ct}`] === true,
        declaration_text_shown: CONSENT_TEXTS[ct],
        declaration_version: DECLARATION_VERSION,
        source_platform: kioskMode ? 'kiosk' : 'web',
      }));
      await supabase.from('member_consents').insert(consentRows);

      // Audit (best-effort)
      const events: any[] = [{ ministry_id: ministryId, user_id: user?.id, profile_id: id, event_type: 'submitted', step_number: TOTAL_STEPS }];
      if (status === 'active') events.push({ ministry_id: ministryId, user_id: user?.id, profile_id: id, event_type: 'approved' });
      supabase.from('member_registration_audit').insert(events).then(() => {}, () => {});

      setDone(status);
      onComplete?.(status);
    } catch (e: any) {
      toast({ title: t('ministryMemberRegistration', 'submissionFailed', 'Submission failed'), description: e.message || t('ministryMemberRegistration', 'pleaseTryAgain', 'Please try again.'), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const big = kioskMode ? 'text-lg' : '';
  const inputCls = kioskMode ? 'h-12 text-lg' : '';

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-purple-600" /></div>;
  }

  if (done) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
        {done === 'active' ? (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-gray-900 mb-1">{t('ministryMemberRegistration', 'welcomeTo', 'Welcome to {name}!').replace('{name}', String(ministryName))}</h2>
            <p className="text-sm text-gray-600">{t('ministryMemberRegistration', 'registrationComplete', 'Your registration is complete. You can finish the rest of your profile any time in the app.')}</p>
          </>
        ) : (
          <>
            <Clock className="h-12 w-12 text-amber-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-gray-900 mb-1">{t('ministryMemberRegistration', 'registrationReceived', 'Registration received')}</h2>
            <p className="text-sm text-gray-600">{t('ministryMemberRegistration', 'registrationPending', 'Thank you! Your registration is pending approval. You’ll be notified once an admin approves it.')}</p>
          </>
        )}
        {guestMode && accountSetupUrl && (
          <div className="mt-5 rounded-lg border bg-purple-50 p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-purple-800 mb-1">
              <Smartphone className="h-4 w-4" />
              <span className="text-sm font-medium">{t('ministryMemberRegistration', 'setUpAccount', 'Set up your account (optional)')}</span>
            </div>
            <p className="text-xs text-gray-600 mb-3">
              {t('ministryMemberRegistration', 'setUpAccountDesc', 'Scan with your phone to get devotionals, prayer reminders, and to manage your own profile.')}
            </p>
            {setupQr
              ? <img src={setupQr} alt={t('ministryMemberRegistration', 'accountSetupQrAlt', 'Account setup QR')} className="w-36 h-36 mx-auto rounded bg-white p-1 border" />
              : <div className="w-36 h-36 mx-auto flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-purple-400" /></div>}
          </div>
        )}
        <Button className="w-full mt-5" onClick={() => (onExit ? onExit() : (window.location.href = '/'))}>
          {kioskMode ? t('ministryMemberRegistration', 'done', 'Done') : t('ministryMemberRegistration', 'continueToRekindle', 'Continue to Rekindle')}
        </Button>
      </div>
    );
  }

  const stepTitle = [
    t('ministryMemberRegistration', 'stepAboutYou', 'About you'),
    t('ministryMemberRegistration', 'stepContact', 'Contact'),
    t('ministryMemberRegistration', 'stepChurchStatus', 'Your church status'),
    t('ministryMemberRegistration', 'stepConsent', 'Consent'),
  ][step - 1];

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5 space-y-5">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className={`font-semibold text-gray-900 ${big}`}>{stepTitle}</p>
          <span className="text-xs text-gray-400">{t('ministryMemberRegistration', 'stepXofY', 'Step {step} of {total}').replace('{step}', String(step)).replace('{total}', String(TOTAL_STEPS))}</span>
        </div>
        <Progress value={(step / TOTAL_STEPS) * 100} className="h-1.5" />
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('ministryMemberRegistration', 'firstNameLabel', 'First name *')}</Label>
              <Input className={inputCls} value={f.first_name} onChange={(e) => set({ first_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('ministryMemberRegistration', 'lastNameLabel', 'Last name *')}</Label>
              <Input className={inputCls} value={f.last_name} onChange={(e) => set({ last_name: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('ministryMemberRegistration', 'preferredNameLabel', 'Preferred name')}</Label>
            <Input className={inputCls} value={f.preferred_name} onChange={(e) => set({ preferred_name: e.target.value })} placeholder={t('ministryMemberRegistration', 'preferredNamePlaceholder', 'What should we call you?')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('ministryMemberRegistration', 'genderLabel', 'Gender')}</Label>
              <select
                className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm ${inputCls}`}
                value={f.gender}
                onChange={(e) => set({ gender: e.target.value })}
              >
                <option value="">{t('ministryMemberRegistration', 'selectPlaceholder', 'Select…')}</option>
                <option value="male">{t('ministryMemberRegistration', 'genderMale', 'Male')}</option>
                <option value="female">{t('ministryMemberRegistration', 'genderFemale', 'Female')}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('ministryMemberRegistration', 'dobLabel', 'Date of birth *')}</Label>
              <Input className={inputCls} type="date" value={f.date_of_birth} onChange={(e) => set({ date_of_birth: e.target.value })} />
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('ministryMemberRegistration', 'mobileNumberLabel', 'Mobile number *')}</Label>
            <Input className={inputCls} inputMode="tel" value={f.mobile_number} onChange={(e) => set({ mobile_number: e.target.value })} placeholder="+84…" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('ministryMemberRegistration', 'emailLabel', 'Email *')}</Label>
            <Input className={inputCls} type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('ministryMemberRegistration', 'cityLabel', 'City')}</Label>
              <Input className={inputCls} value={f.city} onChange={(e) => set({ city: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('ministryMemberRegistration', 'countryLabel', 'Country')}</Label>
              <Input className={inputCls} value={f.country} onChange={(e) => set({ country: e.target.value })} />
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2">
          <Label className="text-sm text-gray-600">{t('ministryMemberRegistration', 'churchRelationQuestion', 'How do you currently relate to the church?')}</Label>
          <RadioGroup value={f.membership_status} onValueChange={(v) => set({ membership_status: v })} className="space-y-2">
            {MEMBERSHIP_OPTIONS.map((o) => (
              <label key={o.value} htmlFor={`ms-${o.value}`} className="flex items-center gap-3 border rounded-lg p-3 cursor-pointer hover:bg-gray-50">
                <RadioGroupItem value={o.value} id={`ms-${o.value}`} />
                <span className={`text-sm ${big}`}>{t('ministryMemberRegistration', o.labelKey, o.label)}</span>
              </label>
            ))}
          </RadioGroup>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{t('ministryMemberRegistration', 'reviewAndAgree', 'Please review and agree before submitting.')}</p>
          {([
            ['consent_privacy_policy', 'privacy_policy', true],
            ['consent_data_processing', 'data_processing', true],
            ['consent_photo_media', 'photo_media', false],
            ...(showGiftAid ? [['consent_gift_aid', 'gift_aid', false]] : []),
          ] as [string, string, boolean][]).map(([field, type, required]) => (
            <label key={field} className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer">
              <Checkbox
                checked={(f as any)[field]}
                onCheckedChange={(v) => set({ [field]: v === true } as any)}
                className="mt-0.5"
              />
              <span className="text-sm text-gray-700">
                {CONSENT_TEXTS[type]} {required && <span className="text-red-500">*</span>}
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        {step > 1 ? (
          <Button variant="ghost" onClick={back} disabled={saving || submitting}>
            <ArrowLeft className="h-4 w-4 mr-1" /> {t('ministryMemberRegistration', 'back', 'Back')}
          </Button>
        ) : <span />}
        {step < TOTAL_STEPS ? (
          <Button onClick={next} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {t('ministryMemberRegistration', 'next', 'Next')} <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            {t('ministryMemberRegistration', 'submitRegistration', 'Submit registration')}
          </Button>
        )}
      </div>
    </div>
  );
};

export default MinistryMemberRegistration;
