import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '../ui/use-toast';
import {
  QrCode, Download, RefreshCw, Copy, Check, Loader2, Monitor, Link2, Save, ShieldCheck, Power, Trash2,
} from 'lucide-react';
import {
  slugify, buildJoinUrl, generateQrPngDataUrl, generateQrSvgString,
  downloadUrl, downloadTextFile, generateInviteCode, sha256Hex,
} from '@/lib/qrCode';

interface Props {
  ministry: any;          // ministry_groups row (select '*')
  onUpdate: () => void;
}

export const MinistryRegistrationSettings: React.FC<Props> = ({ ministry, onUpdate }) => {
  const persistedSlug = ministry.slug || '';
  const [slug, setSlug] = useState(persistedSlug || slugify(ministry.name || ''));
  const [requireApproval, setRequireApproval] = useState(
    (ministry.registration_mode || 'auto_approve') === 'pending_approval',
  );
  const [kioskEnabled, setKioskEnabled] = useState(!!ministry.kiosk_enabled);
  const [kioskPin, setKioskPin] = useState('');           // new PIN entry; blank = keep existing
  const hasPin = !!ministry.kiosk_pin;

  const [inviteCode, setInviteCode] = useState(ministry.invite_code || '');
  const [qrVersion, setQrVersion] = useState<number>(ministry.qr_code_version || 1);

  const [qrPng, setQrPng] = useState('');
  const [qrSvg, setQrSvg] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();
  const { t } = useLanguage();
  const [sessions, setSessions] = useState<any[]>([]);

  const loadSessions = async () => {
    if (!persistedSlug || !ministry.kiosk_enabled) return;
    const { data } = await supabase
      .from('kiosk_sessions')
      .select('id, device_name, last_ping_at, activated_at, expires_at')
      .eq('ministry_id', ministry.id)
      .eq('is_active', true)
      .order('activated_at', { ascending: false });
    setSessions(data || []);
  };

  const activateThisDevice = async () => {
    if (!persistedSlug) { toast({ title: t('ministryRegistrationSettings', 'saveSlugFirstTitle', 'Save a slug first'), description: t('ministryRegistrationSettings', 'saveSlugFirstDesc', 'The kiosk link needs your join address.'), variant: 'destructive' }); return; }
    if (!hasPin && !kioskPin) { toast({ title: t('ministryRegistrationSettings', 'setPinFirstTitle', 'Set a kiosk PIN first'), description: t('ministryRegistrationSettings', 'setPinFirstDesc', 'A PIN is required to exit kiosk mode.'), variant: 'destructive' }); return; }
    try {
      if (kioskPin && /^\d{4}$/.test(kioskPin)) {
        await supabase.from('ministry_groups').update({ kiosk_pin: await sha256Hex(kioskPin) }).eq('id', ministry.id);
        setKioskPin('');
      }
      const raw = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('');
      const hash = await sha256Hex(raw);
      const { error } = await supabase.from('kiosk_sessions').insert({
        ministry_id: ministry.id, device_name: navigator.platform || 'Kiosk device',
        device_token: hash, is_active: true, activated_by: user?.id,
      });
      if (error) throw error;
      localStorage.setItem('kiosk_device_token', raw);
      window.location.href = `/kiosk/${persistedSlug}`;
    } catch (err: any) {
      toast({ title: t('ministryRegistrationSettings', 'couldNotActivateTitle', 'Could not activate'), description: err.message, variant: 'destructive' });
    }
  };

  const deactivateSession = async (id: string) => {
    await supabase.from('kiosk_sessions').update({ is_active: false, deactivated_at: new Date().toISOString() }).eq('id', id);
    loadSessions();
  };


  const dirtySlug = slug !== persistedSlug;
  const joinUrl = buildJoinUrl(slug, inviteCode, qrVersion);

  // (Re)generate the QR preview whenever the encoded URL changes.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!slug || !inviteCode) { setQrPng(''); setQrSvg(''); return; }
      setGenerating(true);
      try {
        const [png, svg] = await Promise.all([
          generateQrPngDataUrl(joinUrl, 600),
          generateQrSvgString(joinUrl),
        ]);
        if (active) { setQrPng(png); setQrSvg(svg); }
      } catch (e) {
        console.error('QR generation failed:', e);
      } finally {
        if (active) setGenerating(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinUrl]);

  useEffect(() => { loadSessions(); /* eslint-disable-next-line */ }, [ministry.id, ministry.kiosk_enabled]);

  // Ensure the slug is unique across ministry_groups (append -2, -3, … on collision).
  const ensureUniqueSlug = async (candidate: string): Promise<string> => {
    const base = slugify(candidate);
    let tryName = base;
    for (let i = 2; i < 50; i++) {
      const { data } = await supabase
        .from('ministry_groups')
        .select('id')
        .eq('slug', tryName)
        .neq('id', ministry.id)
        .maybeSingle();
      if (!data) return tryName;
      tryName = `${base}-${i}`;
    }
    return `${base}-${Date.now().toString().slice(-4)}`;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const finalSlug = await ensureUniqueSlug(slug);
      const update: any = {
        slug: finalSlug,
        registration_mode: requireApproval ? 'pending_approval' : 'auto_approve',
        kiosk_enabled: kioskEnabled,
        updated_at: new Date().toISOString(),
      };
      if (kioskPin) {
        if (!/^\d{4}$/.test(kioskPin)) {
          toast({ title: t('ministryRegistrationSettings', 'invalidPinTitle', 'Invalid PIN'), description: t('ministryRegistrationSettings', 'invalidPinDesc', 'Kiosk PIN must be 4 digits.'), variant: 'destructive' });
          setSaving(false);
          return;
        }
        update.kiosk_pin = await sha256Hex(kioskPin);
      }
      const { error } = await supabase.from('ministry_groups').update(update).eq('id', ministry.id);
      if (error) throw error;

      setSlug(finalSlug);
      setKioskPin('');
      toast({ title: t('ministryRegistrationSettings', 'savedTitle', 'Saved'), description: t('ministryRegistrationSettings', 'savedDesc', 'Registration settings updated.') });
      onUpdate();
    } catch (err: any) {
      toast({ title: t('ministryRegistrationSettings', 'errorTitle', 'Error'), description: err.message || t('ministryRegistrationSettings', 'failedToSave', 'Failed to save'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    const ok = window.confirm(
      t('ministryRegistrationSettings', 'regenerateConfirm', 'Regenerate the join code?\n\nPreviously printed QR codes and shared links will STOP working. Members will need the new code from you.'),
    );
    if (!ok) return;
    setSaving(true);
    try {
      const newCode = generateInviteCode(8);
      const newVersion = (qrVersion || 1) + 1;
      const { error } = await supabase
        .from('ministry_groups')
        .update({ invite_code: newCode, qr_code_version: newVersion, updated_at: new Date().toISOString() })
        .eq('id', ministry.id);
      if (error) throw error;
      setInviteCode(newCode);
      setQrVersion(newVersion);
      toast({ title: t('ministryRegistrationSettings', 'codeRegeneratedTitle', 'Code regenerated'), description: t('ministryRegistrationSettings', 'codeRegeneratedDesc', 'Old QR codes and links are now invalid.') });
      onUpdate();
    } catch (err: any) {
      toast({ title: t('ministryRegistrationSettings', 'errorTitle', 'Error'), description: err.message || t('ministryRegistrationSettings', 'failedToRegenerate', 'Failed to regenerate'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: t('ministryRegistrationSettings', 'copyFailedTitle', 'Copy failed'), description: joinUrl });
    }
  };

  const fileBase = `${slug || 'ministry'}-join-qr-v${qrVersion}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-purple-600" />
          {t('ministryRegistrationSettings', 'memberRegistration', 'Member Registration')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Slug */}
        <div className="space-y-2">
          <Label htmlFor="slug">{t('ministryRegistrationSettings', 'joinLinkAddress', 'Join link address')}</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 whitespace-nowrap">/join/</span>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              placeholder="grace-chapel-lagos"
            />
          </div>
          <p className="text-xs text-gray-500">
            {t('ministryRegistrationSettings', 'slugHelp', 'Used in your QR code and invite link. Must be unique — if taken, a number is appended on save.')}
          </p>
        </div>

        {/* Approval mode */}
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label className="font-medium flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-gray-500" /> {t('ministryRegistrationSettings', 'requireAdminApproval', 'Require admin approval')}
            </Label>
            <p className="text-xs text-gray-500 mt-0.5">
              {requireApproval
                ? t('ministryRegistrationSettings', 'approvalPendingDesc', 'New registrations wait for an admin to approve them.')
                : t('ministryRegistrationSettings', 'approvalAutoDesc', 'New registrations are activated automatically (recommended).')}
            </p>
          </div>
          <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
        </div>

        {/* QR preview + downloads */}
        <div className="rounded-lg border p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="w-40 h-40 flex items-center justify-center rounded-lg bg-white border flex-shrink-0 overflow-hidden">
              {generating ? (
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              ) : qrPng ? (
                <img src={qrPng} alt={t('ministryRegistrationSettings', 'joinQrCode', 'Join QR code')} className="w-full h-full object-contain" />
              ) : (
                <span className="text-xs text-gray-400 text-center px-2">{t('ministryRegistrationSettings', 'setSlugToPreview', 'Set a slug & code to preview')}</span>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-sm font-medium">{t('ministryRegistrationSettings', 'joinQrCode', 'Join QR code')}</p>
              <p className="text-xs text-gray-500 break-all">{joinUrl}</p>
              {dirtySlug && (
                <p className="text-xs text-amber-600">{t('ministryRegistrationSettings', 'unsavedSlugWarning', 'Unsaved slug — Save settings to activate this link.')}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" size="sm" disabled={!qrPng} onClick={() => downloadUrl(qrPng, `${fileBase}.png`)}>
                  <Download className="h-4 w-4 mr-1" /> PNG
                </Button>
                <Button variant="outline" size="sm" disabled={!qrSvg} onClick={() => downloadTextFile(qrSvg, `${fileBase}.svg`)}>
                  <Download className="h-4 w-4 mr-1" /> {t('ministryRegistrationSettings', 'printSvg', 'Print SVG')}
                </Button>
                <Button variant="outline" size="sm" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4 mr-1 text-green-600" /> : <Link2 className="h-4 w-4 mr-1" />}
                  {copied ? t('ministryRegistrationSettings', 'copied', 'Copied') : t('ministryRegistrationSettings', 'copyLink', 'Copy link')}
                </Button>
                <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={saving} className="text-red-600 hover:text-red-700">
                  <RefreshCw className="h-4 w-4 mr-1" /> {t('ministryRegistrationSettings', 'regenerate', 'Regenerate')}
                </Button>
              </div>
              {inviteCode && (
                <p className="text-xs text-gray-400 pt-1">
                  {t('ministryRegistrationSettings', 'codeLabel', 'Code:')} <span className="font-mono">{inviteCode}</span> · v{qrVersion}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Kiosk */}
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="font-medium flex items-center gap-1.5">
                <Monitor className="h-4 w-4 text-gray-500" /> {t('ministryRegistrationSettings', 'kioskCheckInMode', 'Kiosk check-in mode')}
              </Label>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('ministryRegistrationSettings', 'kioskModeDesc', 'Run a tablet at the door for walk-up registration and check-in.')}
              </p>
            </div>
            <Switch checked={kioskEnabled} onCheckedChange={setKioskEnabled} />
          </div>
          {kioskEnabled && (
            <div className="space-y-1.5">
              <Label htmlFor="pin" className="text-sm">{t('ministryRegistrationSettings', 'kioskPinLabel', 'Kiosk PIN (4 digits)')}</Label>
              <Input
                id="pin"
                inputMode="numeric"
                maxLength={4}
                value={kioskPin}
                onChange={(e) => setKioskPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder={hasPin ? t('ministryRegistrationSettings', 'kioskPinSetPlaceholder', '•••• (set — enter to change)') : t('ministryRegistrationSettings', 'kioskPinPlaceholder', 'e.g. 1234')}
                className="w-40"
              />
              <p className="text-xs text-gray-500">{t('ministryRegistrationSettings', 'kioskPinHelp', 'Required to unlock/exit kiosk mode on the tablet. Stored securely (hashed).')}</p>
            </div>
          )}
          {kioskEnabled && (
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-600">{t('ministryRegistrationSettings', 'turnTabletIntoKiosk', 'Turn the tablet you’re holding into the check-in kiosk.')}</p>
                <Button size="sm" variant="outline" onClick={activateThisDevice}>
                  <Power className="h-4 w-4 mr-1" /> {t('ministryRegistrationSettings', 'useThisDevice', 'Use this device')}
                </Button>
              </div>
              {sessions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-400">{t('ministryRegistrationSettings', 'activeKioskDevices', 'Active kiosk devices')}</p>
                  {sessions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-xs border rounded-md px-2 py-1.5">
                      <span className="truncate">{s.device_name || t('ministryRegistrationSettings', 'deviceFallback', 'Device')} {t('ministryRegistrationSettings', 'lastSeenX', '· last seen {time}').replace('{time}', s.last_ping_at ? new Date(s.last_ping_at).toLocaleString() : t('ministryRegistrationSettings', 'never', 'never'))}</span>
                      <button onClick={() => deactivateSession(s.id)} className="text-red-500 hover:text-red-600 ml-2"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {t('ministryRegistrationSettings', 'saveRegistrationSettings', 'Save registration settings')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default MinistryRegistrationSettings;
