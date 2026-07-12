import React, { useState, useEffect } from 'react';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Switch } from '@rekindle/ui/switch';
import { Badge } from '@rekindle/ui/badge';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { toast } from '@rekindle/ui/use-toast';
import {
  MessageSquare, CheckCircle2, Phone, Loader2, ShieldCheck,
  Info, BookOpen, Heart, Sparkles, Megaphone,
} from 'lucide-react';

// ─── Platform-level opt-in (shown in Profile Settings) ───────────────────────

interface WAPrefs {
  devotionals:  boolean;
  reminders:    boolean;
  affirmations: boolean;
  marketing:    boolean;
}

export const PlatformWhatsAppOptIn: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [phone, setPhone]     = useState('');
  const [optedIn, setOptedIn] = useState(false);
  const [prefs, setPrefs]     = useState<WAPrefs>({
    devotionals:  false,
    reminders:    false,
    affirmations: false,
    marketing:    false,
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_profiles')
      .select('phone, whatsapp_opted_in, whatsapp_devotionals, whatsapp_reminders, whatsapp_affirmations, whatsapp_marketing')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPhone(data.phone ?? '');
          setOptedIn(data.whatsapp_opted_in ?? false);
          setPrefs({
            devotionals:  data.whatsapp_devotionals  ?? false,
            reminders:    data.whatsapp_reminders    ?? false,
            affirmations: data.whatsapp_affirmations ?? false,
            marketing:    data.whatsapp_marketing    ?? false,
          });
        }
        setLoaded(true);
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    if (optedIn && !phone.trim()) {
      toast({ title: t('whatsAppOptIn', 'phoneRequired', 'Phone number required'), description: t('whatsAppOptIn', 'enterNumberOptIn', 'Enter your WhatsApp number to opt in.'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const cleanPhone = phone.trim().replace(/\s+/g, '');
      const savedPrefs = optedIn
        ? prefs
        : { devotionals: false, reminders: false, affirmations: false, marketing: false };

      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({
          phone:                 cleanPhone || null,
          whatsapp_opted_in:     optedIn,
          whatsapp_opted_in_at:  optedIn ? new Date().toISOString() : null,
          whatsapp_devotionals:  savedPrefs.devotionals,
          whatsapp_reminders:    savedPrefs.reminders,
          whatsapp_affirmations: savedPrefs.affirmations,
          whatsapp_marketing:    savedPrefs.marketing,
        })
        .eq('user_id', user.id);

      if (profileError) throw profileError;

      if (optedIn && cleanPhone) {
        const { data: channels } = await supabase
          .from('whatsapp_channels')
          .select('id')
          .eq('is_active', true);

        if (channels && channels.length > 0) {
          await supabase
            .from('whatsapp_channel_subscribers')
            .upsert(
              channels.map((ch: { id: string }) => ({
                channel_id:    ch.id,
                user_id:       user.id,
                phone_number:  cleanPhone,
                subscribed_at: new Date().toISOString(),
              })),
              { onConflict: 'channel_id,phone_number', ignoreDuplicates: true }
            );
        }
      } else if (!optedIn) {
        await supabase
          .from('whatsapp_channel_subscribers')
          .delete()
          .eq('user_id', user.id);
      }

      toast({
        title: optedIn ? t('whatsAppOptIn', 'prefsSaved', 'WhatsApp preferences saved') : t('whatsAppOptIn', 'optOutSaved', 'WhatsApp opt-out saved'),
        description: optedIn
          ? t('whatsAppOptIn', 'prefsUpdatedDesc', 'Your WhatsApp notification preferences have been updated.')
          : t('whatsAppOptIn', 'optOutDesc', 'You will no longer receive WhatsApp messages from ReKindle.'),
      });

    } catch (err: any) {
      toast({ title: t('whatsAppOptIn', 'saveFailed', 'Save failed'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  const PREF_ITEMS: { key: keyof WAPrefs; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      key:   'devotionals',
      label: t('whatsAppOptIn', 'dailyDevotionals', 'Daily Devotionals'),
      desc:  t('whatsAppOptIn', 'dailyDevotionalsDesc', 'Receive your daily devotional reading via WhatsApp'),
      icon:  <BookOpen className="h-4 w-4 text-purple-500" />,
    },
    {
      key:   'reminders',
      label: t('whatsAppOptIn', 'prayerReminders', 'Prayer Reminders'),
      desc:  t('whatsAppOptIn', 'prayerRemindersDesc', 'Gentle nudges to pray and maintain your streak'),
      icon:  <Heart className="h-4 w-4 text-red-500" />,
    },
    {
      key:   'affirmations',
      label: t('whatsAppOptIn', 'dailyAffirmations', 'Daily Affirmations'),
      desc:  t('whatsAppOptIn', 'dailyAffirmationsDesc', 'Faith-based affirmations to start your day'),
      icon:  <Sparkles className="h-4 w-4 text-amber-500" />,
    },
    {
      key:   'marketing',
      label: t('whatsAppOptIn', 'announcementsUpdates', 'Announcements & Updates'),
      desc:  t('whatsAppOptIn', 'announcementsUpdatesDesc', 'Platform news, new features and ministry announcements'),
      icon:  <Megaphone className="h-4 w-4 text-blue-500" />,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-green-600" />
          <Label className="font-medium">{t('whatsAppOptIn', 'whatsappNotifications', 'WhatsApp Notifications')}</Label>
        </div>
        {optedIn && phone && (
          <Badge className="bg-green-100 text-green-800 border-0 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {t('whatsAppOptIn', 'optedIn', 'Opted in')}
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm text-muted-foreground">{t('whatsAppOptIn', 'whatsappPhoneNumber', 'WhatsApp Phone Number')}</Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="+234 800 000 0000"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="pl-9"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('whatsAppOptIn', 'countryCodeHint', 'Include your country code e.g. +234 for Nigeria, +1 for US')}
        </p>
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border">
        <div>
          <p className="text-sm font-medium">{t('whatsAppOptIn', 'receiveNotifications', 'Receive WhatsApp notifications')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('whatsAppOptIn', 'masterSwitchHint', 'Master switch — turn off to stop all WhatsApp messages')}
          </p>
        </div>
        <Switch
          checked={optedIn}
          onCheckedChange={setOptedIn}
          disabled={!phone.trim() && !optedIn}
        />
      </div>

      {optedIn && phone.trim() && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-green-50 px-3 py-2 border-b">
            <p className="text-xs font-semibold text-green-800 uppercase tracking-wide">
              {t('whatsAppOptIn', 'chooseWhatToReceive', 'Choose what to receive on WhatsApp')}
            </p>
          </div>
          {PREF_ITEMS.map((item, idx) => (
            <div
              key={item.key}
              className={`flex items-center justify-between px-3 py-3 hover:bg-gray-50 transition-colors ${
                idx < PREF_ITEMS.length - 1 ? 'border-b' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                {item.icon}
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
              <Switch
                checked={prefs[item.key]}
                onCheckedChange={val => setPrefs(prev => ({ ...prev, [item.key]: val }))}
              />
            </div>
          ))}
        </div>
      )}


      {/* 24hr window activation */}
      {optedIn && phone.trim() && prefs.devotionals && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <BookOpen className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">{t('whatsAppOptIn', 'activateDelivery', 'Activate devotional delivery')}</p>
              <p className="text-xs text-green-700 mt-0.5">
                {t('whatsAppOptIn', 'activateDeliveryDesc', 'To receive daily devotionals and affirmations on WhatsApp, send us a quick message to activate your account.')}
              </p>
            </div>
          </div>
          <a
            href={`https://wa.me/${
              (import.meta.env.VITE_WHATSAPP_SENDER_NUMBER ?? '84899183287').replace(/[^\d]/g, '')
            }?text=Start`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            {t('whatsAppOptIn', 'tapToActivate', 'Tap to activate on WhatsApp')}
          </a>
          <p className="text-xs text-green-600 text-center">
            {t('whatsAppOptIn', 'preFilledHint', 'Opens WhatsApp with a pre-filled message — just tap Send')}
          </p>
        </div>
      )}

      <Alert className="border-blue-100 bg-blue-50 py-2">
        <ShieldCheck className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-xs">
          {t('whatsAppOptIn', 'privacyNote', 'Your number is only used for the notifications you select above. We never share it with third parties.')}{' '}
          {t('whatsAppOptIn', 'replyStopPrefix', 'Reply')} <strong>STOP</strong> {t('whatsAppOptIn', 'replyStopSuffix', 'to any message or turn off the master switch to opt out at any time.')}
        </AlertDescription>
      </Alert>

      <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {t('whatsAppOptIn', 'savePreferences', 'Save WhatsApp Preferences')}
      </Button>
    </div>
  );
};

// ─── Ministry-level opt-in (shown in MinistrySpace) ──────────────────────────

interface MinistryWhatsAppOptInProps {
  ministryId:   string;
  ministryName: string;
}

export const MinistryWhatsAppOptIn: React.FC<MinistryWhatsAppOptInProps> = ({
  ministryId,
  ministryName,
}) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();

  const [phone, setPhone]         = useState('');
  const [optedIn, setOptedIn]     = useState(false);
  const [hasWABA, setHasWABA]     = useState(false);
  const [wabaPhone, setWabaPhone] = useState('');
  const [saving, setSaving]       = useState(false);
  const [loaded, setLoaded]       = useState(false);

  useEffect(() => {
    if (!user || !ministryId) return;
    loadState();
  }, [user, ministryId]);

  const loadState = async () => {
    const { data: waba } = await supabase
      .from('ministry_whatsapp_configs')
      .select('connection_status, phone_number_display, twilio_from_number, provider')
      .eq('ministry_id', ministryId)
      .maybeSingle();

    if (waba?.connection_status === 'connected') {
      setHasWABA(true);
      setWabaPhone(
        waba.provider === 'twilio'
          ? (waba.twilio_from_number ?? '').replace('whatsapp:', '')
          : (waba.phone_number_display ?? '')
      );
    }

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('phone, whatsapp_opted_in')
      .eq('user_id', user!.id)
      .maybeSingle();

    if (userProfile?.phone) setPhone(userProfile.phone);

    const { data: sub } = await supabase
      .from('ministry_whatsapp_subscribers')
      .select('opted_in')
      .eq('ministry_id', ministryId)
      .eq('user_id', user!.id)
      .maybeSingle();

    setOptedIn(sub?.opted_in ?? false);
    setLoaded(true);
  };

  const handleSubscribe = async () => {
    if (!user) return;
    if (!phone.trim()) {
      toast({ title: t('whatsAppOptIn', 'phoneRequired', 'Phone number required'), description: t('whatsAppOptIn', 'enterNumberSubscribe', 'Enter your WhatsApp number to subscribe.'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const cleanPhone = phone.trim().replace(/\s+/g, '');
      const newOptedIn = !optedIn;

      await supabase
        .from('user_profiles')
        .update({ phone: cleanPhone })
        .eq('user_id', user.id);

      const { error } = await supabase
        .from('ministry_whatsapp_subscribers')
        .upsert({
          ministry_id:  ministryId,
          user_id:      user.id,
          phone_number: cleanPhone,
          opted_in:     newOptedIn,
          opted_in_at:  newOptedIn ? new Date().toISOString() : null,
          opted_out_at: newOptedIn ? null : new Date().toISOString(),
        }, { onConflict: 'ministry_id,user_id' });

      if (error) throw error;

      setOptedIn(newOptedIn);
      toast({
        title: newOptedIn ? t('whatsAppOptIn', 'subscribed', 'Subscribed!') : t('whatsAppOptIn', 'unsubscribed', 'Unsubscribed'),
        description: newOptedIn
          ? t('whatsAppOptIn', 'subscribedDesc', "You'll receive WhatsApp updates from {name}").replace('{name}', String(ministryName))
          : t('whatsAppOptIn', 'unsubscribedDesc', "You've unsubscribed from {name} WhatsApp updates").replace('{name}', String(ministryName)),
      });
    } catch (err: any) {
      toast({ title: t('whatsAppOptIn', 'failed', 'Failed'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;
  if (!hasWABA) return null;

  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-green-100 rounded-lg">
          <MessageSquare className="h-4 w-4 text-green-700" />
        </div>
        <div>
          <p className="text-sm font-semibold text-green-900">{t('whatsAppOptIn', 'whatsappUpdates', 'WhatsApp Updates')}</p>
          <p className="text-xs text-green-700">
            {t('whatsAppOptIn', 'getBroadcasts', 'Get broadcasts from {name} directly on WhatsApp').replace('{name}', String(ministryName))}
          </p>
        </div>
        {optedIn && (
          <Badge className="ml-auto bg-green-600 text-white border-0 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {t('whatsAppOptIn', 'subscribedBadge', 'Subscribed')}
          </Badge>
        )}
      </div>

      {!optedIn && (
        <div className="space-y-1.5">
          <Label className="text-xs text-green-800 font-medium">{t('whatsAppOptIn', 'yourWhatsappNumber', 'Your WhatsApp Number')}</Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="+234 800 000 0000"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="pl-9 h-9 text-sm bg-white"
            />
          </div>
          <p className="text-xs text-green-700">{t('whatsAppOptIn', 'includeCountryCode', 'Include country code · e.g. +234 for Nigeria')}</p>
        </div>
      )}

      {optedIn && phone && (
        <div className="flex items-center gap-2 text-xs text-green-800 bg-green-100 rounded-lg p-2.5">
          <Phone className="h-3.5 w-3.5 shrink-0" />
          <span>{t('whatsAppOptIn', 'subscribedAt', 'Subscribed at')} <strong>{phone}</strong></span>
        </div>
      )}

      <div className="flex items-start gap-2 text-xs text-green-700">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <span>
          {optedIn
            ? t('whatsAppOptIn', 'replyStopUnsub', 'Reply STOP to any message to unsubscribe, or click below.')
            : t('whatsAppOptIn', 'consentDesc', 'By subscribing you consent to receive WhatsApp messages from {name}. Reply STOP anytime to unsubscribe.').replace('{name}', String(ministryName))
          }
        </span>
      </div>

      <Button
        onClick={handleSubscribe}
        disabled={saving || (!optedIn && !phone.trim())}
        size="sm"
        className={`w-full gap-2 ${
          optedIn
            ? 'bg-white text-green-700 border border-green-300 hover:bg-green-50'
            : 'bg-green-600 hover:bg-green-700 text-white'
        }`}
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {optedIn ? t('whatsAppOptIn', 'unsubscribeBtn', 'Unsubscribe from WhatsApp') : t('whatsAppOptIn', 'subscribeBtn', 'Subscribe to WhatsApp Updates')}
      </Button>
    </div>
  );
};
