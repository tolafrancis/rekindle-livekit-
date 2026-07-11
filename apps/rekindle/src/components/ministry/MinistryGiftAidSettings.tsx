import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '../ui/use-toast';
import { HandCoins, Loader2, Save, ShieldCheck } from 'lucide-react';
import type { GiftAidSubmissionMethod } from '@/lib/giftAid';

interface Props {
  ministryId: string;
  /** Pass the ministry's country_code so the panel can self-gate to the UK. */
  countryCode?: string | null;
}

export const MinistryGiftAidSettings: React.FC<Props> = ({ ministryId, countryCode }) => {
  const { user } = useAuth();
  const { t } = useLanguage();

  const SUBMISSION_METHODS: { value: GiftAidSubmissionMethod; label: string }[] = [
    { value: 'manual', label: t('ministryGiftAidSettings', 'methodManual', 'Manual (review claims in-app)') },
    { value: 'csv', label: t('ministryGiftAidSettings', 'methodCsv', 'CSV export for HMRC Charities Online') },
    { value: 'xml', label: t('ministryGiftAidSettings', 'methodXml', 'XML export for HMRC') },
    { value: 'api', label: t('ministryGiftAidSettings', 'methodApi', 'Direct HMRC API (when available)') },
  ];
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [charityName, setCharityName] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [hmrcReference, setHmrcReference] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submissionMethod, setSubmissionMethod] = useState<GiftAidSubmissionMethod>('manual');
  const [claimPrefix, setClaimPrefix] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [officialPhone, setOfficialPhone] = useState('');
  const [officialPostcode, setOfficialPostcode] = useState('');
  const [gatewayUserId, setGatewayUserId] = useState('');
  const [regulatorType, setRegulatorType] = useState<'CCEW' | 'CCNI' | 'OSCR' | 'none' | 'other'>('CCEW');
  const [regulatorNumber, setRegulatorNumber] = useState('');
  const [regulatorOtherName, setRegulatorOtherName] = useState('');

  const isUk = (countryCode ?? '').trim().toUpperCase() === 'GB';

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('ministry_gift_aid_settings')
          .select('*')
          .eq('ministry_id', ministryId)
          .maybeSingle();
        if (error) throw error;
        if (active && data) {
          setEnabled(!!data.enabled);
          setCharityName(data.charity_name || '');
          setRegNumber(data.charity_registration_number || '');
          setHmrcReference(data.hmrc_reference || '');
          setContactPerson(data.contact_person || '');
          setContactEmail(data.contact_email || '');
          setSubmissionMethod((data.submission_method as GiftAidSubmissionMethod) || 'manual');
          setClaimPrefix(data.claim_reference_prefix || '');
          setOfficialName(data.authorised_official_name || '');
          setOfficialPhone(data.authorised_official_phone || '');
          setOfficialPostcode(data.authorised_official_postcode || '');
          setGatewayUserId(data.hmrc_gateway_user_id || '');
          setRegulatorType((data.regulator_type as typeof regulatorType) || 'CCEW');
          setRegulatorNumber(data.regulator_number || '');
          setRegulatorOtherName(data.regulator_other_name || '');
        }
      } catch (err: any) {
        console.error('Failed to load Gift Aid settings:', err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [ministryId]);

  const handleSave = async () => {
    if (enabled) {
      if (!charityName.trim() || !hmrcReference.trim()) {
        toast({
          title: t('ministryGiftAidSettings', 'missingDetailsTitle', 'Missing details'),
          description: t('ministryGiftAidSettings', 'missingDetailsDesc', 'Charity name and HMRC reference are required to enable Gift Aid.'),
          variant: 'destructive',
        });
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        ministry_id: ministryId,
        enabled,
        charity_name: charityName.trim() || null,
        charity_registration_number: regNumber.trim() || null,
        hmrc_reference: hmrcReference.trim() || null,
        contact_person: contactPerson.trim() || null,
        contact_email: contactEmail.trim() || null,
        submission_method: submissionMethod,
        claim_reference_prefix: claimPrefix.trim() || null,
        authorised_official_name: officialName.trim() || null,
        authorised_official_phone: officialPhone.trim() || null,
        authorised_official_postcode: officialPostcode.trim() || null,
        hmrc_gateway_user_id: gatewayUserId.trim() || null,
        regulator_type: regulatorType,
        regulator_number: regulatorType === 'CCEW' || regulatorType === 'CCNI' || regulatorType === 'OSCR' || regulatorType === 'other'
          ? (regulatorNumber.trim() || null)
          : null,
        regulator_other_name: regulatorType === 'other' ? (regulatorOtherName.trim() || null) : null,
      };

      const { error } = await supabase
        .from('ministry_gift_aid_settings')
        .upsert(payload, { onConflict: 'ministry_id' });
      if (error) throw error;

      // Best-effort audit trail (append-only). Never blocks the save.
      try {
        await supabase.from('gift_aid_audit_log').insert({
          ministry_id: ministryId,
          actor_user_id: user?.id || null,
          event_type: 'settings_updated',
          event_data: { enabled, submission_method: submissionMethod },
        });
      } catch (auditErr) {
        console.warn('Gift Aid audit log (settings_updated) failed:', auditErr);
      }

      toast({ title: t('ministryGiftAidSettings', 'savedTitle', 'Saved'), description: t('ministryGiftAidSettings', 'savedDesc', 'Gift Aid settings updated.') });
    } catch (err: any) {
      toast({ title: t('ministryGiftAidSettings', 'errorTitle', 'Error'), description: err.message || t('ministryGiftAidSettings', 'failedToSave', 'Failed to save'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Self-gate: the panel only renders for UK ministries.
  if (!isUk) return null;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HandCoins className="h-5 w-5 text-purple-600" />
          {t('ministryGiftAidSettings', 'cardTitle', 'Gift Aid (UK)')}
        </CardTitle>
        <CardDescription>
          {t('ministryGiftAidSettings', 'cardDescription', 'Reclaim 25p for every £1 donated by UK taxpayers. Available because this ministry’s country is set to the United Kingdom.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Enable toggle */}
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label className="font-medium flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-gray-500" /> {t('ministryGiftAidSettings', 'enableGiftAid', 'Enable Gift Aid')}
            </Label>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('ministryGiftAidSettings', 'enableGiftAidHint', 'When on, UK donors can add a Gift Aid declaration to their donation.')}
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{t('ministryGiftAidSettings', 'charityName', 'Charity name')} {enabled && <span className="text-red-500">*</span>}</Label>
            <Input
              value={charityName}
              onChange={(e) => setCharityName(e.target.value)}
              placeholder={t('ministryGiftAidSettings', 'charityNamePlaceholder', 'As registered with the Charity Commission')}
            />
          </div>
          <div>
            <Label>{t('ministryGiftAidSettings', 'charityRegNumber', 'Charity registration number')}</Label>
            <Input
              value={regNumber}
              onChange={(e) => setRegNumber(e.target.value)}
              placeholder={t('ministryGiftAidSettings', 'charityRegNumberPlaceholder', 'e.g. 1234567')}
            />
          </div>
          <div>
            <Label>{t('ministryGiftAidSettings', 'hmrcReference', 'HMRC reference')} {enabled && <span className="text-red-500">*</span>}</Label>
            <Input
              value={hmrcReference}
              onChange={(e) => setHmrcReference(e.target.value)}
              placeholder={t('ministryGiftAidSettings', 'hmrcReferencePlaceholder', 'HMRC Charities Reference, e.g. AB12345')}
            />
          </div>
          <div>
            <Label>{t('ministryGiftAidSettings', 'claimPrefix', 'Claim reference prefix')}</Label>
            <Input
              value={claimPrefix}
              onChange={(e) => setClaimPrefix(e.target.value)}
              placeholder={t('ministryGiftAidSettings', 'claimPrefixPlaceholder', 'Optional, e.g. RCCG')}
            />
          </div>
          <div>
            <Label>{t('ministryGiftAidSettings', 'contactPerson', 'Contact person')}</Label>
            <Input
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder={t('ministryGiftAidSettings', 'contactPersonPlaceholder', 'Person responsible for claims')}
            />
          </div>
          <div>
            <Label>{t('ministryGiftAidSettings', 'contactEmail', 'Contact email')}</Label>
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="claims@yourchurch.org"
            />
          </div>
        </div>

        <div>
          <Label>{t('ministryGiftAidSettings', 'submissionMethod', 'Submission method')}</Label>
          <Select
            value={submissionMethod}
            onValueChange={(v) => setSubmissionMethod(v as GiftAidSubmissionMethod)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('ministryGiftAidSettings', 'submissionMethodPlaceholder', "Choose how you'll submit claims")} />
            </SelectTrigger>
            <SelectContent>
              {SUBMISSION_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            {t('ministryGiftAidSettings', 'submissionMethodHint', 'How you intend to file claims with HMRC. You can change this anytime.')}
          </p>
        </div>

        <div className="rounded-lg border p-3 space-y-3">
          <p className="text-sm font-medium">{t('ministryGiftAidSettings', 'regulatorTitle', 'Charity regulator')}</p>
          <p className="text-xs text-gray-500 -mt-1">
            {t('ministryGiftAidSettings', 'regulatorHint', 'HMRC requires the regulator you are registered with (unless your HMRC reference starts with CH/CF).')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>{t('ministryGiftAidSettings', 'regulatorType', 'Regulator')}</Label>
              <Select value={regulatorType} onValueChange={(v) => setRegulatorType(v as typeof regulatorType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CCEW">{t('ministryGiftAidSettings', 'regCCEW', 'Charity Commission (England & Wales)')}</SelectItem>
                  <SelectItem value="CCNI">{t('ministryGiftAidSettings', 'regCCNI', 'Charity Commission for Northern Ireland')}</SelectItem>
                  <SelectItem value="OSCR">{t('ministryGiftAidSettings', 'regOSCR', 'OSCR (Scotland)')}</SelectItem>
                  <SelectItem value="other">{t('ministryGiftAidSettings', 'regOther', 'Other regulator')}</SelectItem>
                  <SelectItem value="none">{t('ministryGiftAidSettings', 'regNone', 'Not registered with a regulator')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(regulatorType === 'CCEW' || regulatorType === 'CCNI' || regulatorType === 'OSCR') && (
              <div>
                <Label>{t('ministryGiftAidSettings', 'regulatorNumber', 'Regulator number')}</Label>
                <Input
                  value={regulatorNumber}
                  onChange={(e) => setRegulatorNumber(e.target.value)}
                  placeholder={t('ministryGiftAidSettings', 'regulatorNumberPlaceholder', 'e.g. 1234567')}
                />
              </div>
            )}
            {regulatorType === 'other' && (
              <>
                <div>
                  <Label>{t('ministryGiftAidSettings', 'regulatorOtherName', 'Regulator name')}</Label>
                  <Input
                    value={regulatorOtherName}
                    onChange={(e) => setRegulatorOtherName(e.target.value)}
                    placeholder={t('ministryGiftAidSettings', 'regulatorOtherNamePlaceholder', 'Name of your regulator')}
                  />
                </div>
                <div>
                  <Label>{t('ministryGiftAidSettings', 'regulatorNumberOptional', 'Regulator number (optional)')}</Label>
                  <Input
                    value={regulatorNumber}
                    onChange={(e) => setRegulatorNumber(e.target.value)}
                    placeholder={t('ministryGiftAidSettings', 'regulatorNumberPlaceholder', 'e.g. 1234567')}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg border p-3 space-y-3">
          <p className="text-sm font-medium">{t('ministryGiftAidSettings', 'authorisedOfficialTitle', 'Authorised Official (for direct HMRC submission)')}</p>
          <p className="text-xs text-gray-500 -mt-1">
            {t('ministryGiftAidSettings', 'authorisedOfficialHint', 'Must match the Authorised Official HMRC holds for this charity, or claims are rejected.')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>{t('ministryGiftAidSettings', 'officialName', 'Authorised Official name')}</Label>
              <Input
                value={officialName}
                onChange={(e) => setOfficialName(e.target.value)}
                placeholder={t('ministryGiftAidSettings', 'officialNamePlaceholder', 'First and last name')}
              />
            </div>
            <div>
              <Label>{t('ministryGiftAidSettings', 'officialPhone', 'Official phone')}</Label>
              <Input
                value={officialPhone}
                onChange={(e) => setOfficialPhone(e.target.value)}
                placeholder={t('ministryGiftAidSettings', 'officialPhonePlaceholder', 'Contact number')}
              />
            </div>
            <div>
              <Label>{t('ministryGiftAidSettings', 'officialPostcode', 'Official postcode')}</Label>
              <Input
                value={officialPostcode}
                onChange={(e) => setOfficialPostcode(e.target.value)}
                placeholder={t('ministryGiftAidSettings', 'officialPostcodePlaceholder', 'e.g. SW1A 1AA')}
              />
            </div>
            <div>
              <Label>{t('ministryGiftAidSettings', 'gatewayUserId', 'Government Gateway user ID')}</Label>
              <Input
                value={gatewayUserId}
                onChange={(e) => setGatewayUserId(e.target.value)}
                placeholder={t('ministryGiftAidSettings', 'gatewayUserIdPlaceholder', 'Optional — saved for convenience')}
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            {t('ministryGiftAidSettings', 'gatewayPasswordHint', 'Your Gateway password is never stored — you enter it each time you submit.')}
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {t('ministryGiftAidSettings', 'saveButton', 'Save Gift Aid settings')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default MinistryGiftAidSettings;
