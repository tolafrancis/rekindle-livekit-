import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useViewHistory } from '@rekindle/features/hooks/useViewHistory';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { DataExportButton } from './DataExportButton';
import CounsellorApplicationStatus from './CounsellorApplicationStatus';
import { LanguageSettings } from '@/components/LanguageSettings';
import { PlatformWhatsAppOptIn } from '@/components/WhatsAppOptIn';
import { DailyReminders } from '@/components/DailyReminders';
import { PartnerDonationPage } from '@/components/PartnerDonationPage';
import { PushNotificationSettings } from '@/components/PushNotificationSettings';
import { 
  User, Mail, Globe, BookOpen, Bell, MessageSquare, 
  Save, Loader2, Lock, AlertTriangle, CheckCircle, 
  RefreshCw, Key, Shield, Download, UserCheck, Languages, ChevronDown, Heart, Sparkles
} from 'lucide-react';

const spiritualLevels = [
  { id: 'seeker', name: 'Seeker' },
  { id: 'new_believer', name: 'New Believer' },
  { id: 'growing', name: 'Growing' },
  { id: 'mature', name: 'Mature' },
  { id: 'leader', name: 'Leader' },
];


const TIMEZONES = [
  { value: 'UTC',                  label: 'UTC (Coordinated Universal Time)' },
  { value: 'Africa/Lagos',         label: 'Lagos / Abuja (WAT +1)' },
  { value: 'Africa/Johannesburg',  label: 'Johannesburg (SAST +2)' },
  { value: 'Africa/Nairobi',       label: 'Nairobi (EAT +3)' },
  { value: 'Africa/Accra',         label: 'Accra / Dakar (GMT +0)' },
  { value: 'Africa/Cairo',         label: 'Cairo (EET +2)' },
  { value: 'America/New_York',     label: 'New York (ET)' },
  { value: 'America/Chicago',      label: 'Chicago (CT)' },
  { value: 'America/Denver',       label: 'Denver (MT)' },
  { value: 'America/Los_Angeles',  label: 'Los Angeles (PT)' },
  { value: 'America/Toronto',      label: 'Toronto (ET)' },
  { value: 'America/Sao_Paulo',    label: 'São Paulo (BRT -3)' },
  { value: 'Europe/London',        label: 'London (GMT/BST)' },
  { value: 'Europe/Paris',         label: 'Paris / Berlin (CET +1)' },
  { value: 'Europe/Moscow',        label: 'Moscow (MSK +3)' },
  { value: 'Asia/Dubai',           label: 'Dubai (GST +4)' },
  { value: 'Asia/Kolkata',         label: 'India (IST +5:30)' },
  { value: 'Asia/Dhaka',           label: 'Dhaka (BST +6)' },
  { value: 'Asia/Bangkok',         label: 'Bangkok (ICT +7)' },
  { value: 'Asia/Ho_Chi_Minh',     label: 'Ho Chi Minh City (ICT +7)' },
  { value: 'Asia/Singapore',       label: 'Singapore (SGT +8)' },
  { value: 'Asia/Seoul',           label: 'Seoul / Tokyo (KST/JST +9)' },
  { value: 'Australia/Sydney',     label: 'Sydney (AEST +10/+11)' },
  { value: 'Pacific/Auckland',     label: 'Auckland (NZST +12/+13)' },
];


const AFFIRMATION_CATS = [
  { value: 'faith',      label: 'Faith',      emoji: '🙏' },
  { value: 'healing',    label: 'Healing',    emoji: '💚' },
  { value: 'provision',  label: 'Provision',  emoji: '💰' },
  { value: 'peace',      label: 'Peace',      emoji: '☮️' },
  { value: 'wisdom',     label: 'Wisdom',     emoji: '📖' },
  { value: 'identity',   label: 'Identity',   emoji: '👑' },
  { value: 'family',     label: 'Family',     emoji: '👨‍👩‍👧' },
  { value: 'strength',   label: 'Strength',   emoji: '💪' },
  { value: 'love',       label: 'Love',       emoji: '❤️' },
  { value: 'prosperity', label: 'Prosperity', emoji: '⭐' },
  { value: 'protection', label: 'Protection', emoji: '🛡️' },
  { value: 'purpose',    label: 'Purpose',    emoji: '🎯' },
];

// Settings grouped by association for the sidebar nav
const SETTINGS_GROUPS: { group: string; items: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = [
  {
    group: 'Account',
    items: [
      { key: 'profile',  label: 'Profile',     icon: User },
      { key: 'security', label: 'Security',    icon: Shield },
      { key: 'data',     label: 'Data Export', icon: Download },
    ],
  },
  {
    group: 'Preferences',
    items: [
      { key: 'language',     label: 'Language',     icon: Languages },
      { key: 'declarations', label: 'Declarations', icon: Sparkles },
    ],
  },
  {
    group: 'Notifications',
    items: [
      { key: 'notifications', label: 'In-app & Email', icon: Bell },
      { key: 'push',          label: 'Push',           icon: Bell },
      { key: 'whatsapp',      label: 'WhatsApp',       icon: MessageSquare },
      { key: 'reminders',     label: 'Daily Reminders', icon: Bell },
    ],
  },
  {
    group: 'Involvement',
    items: [
      { key: 'involvement', label: 'Counsellor & Partner', icon: Heart },
    ],
  },
];

const SettingsSidebar: React.FC<{ section: string; onSelect: (key: string) => void }> = ({ section, onSelect }) => {
  const { t } = useLanguage();
  return (
  <aside className="w-full min-w-0 md:w-56 md:shrink-0 md:sticky md:top-20 md:self-start">
    {/* Mobile: a single flat horizontal scroller (buttons are direct flex
        children via display:contents wrappers — same structure as the working
        primary nav). Desktop: grouped vertical list. */}
    <nav className={Capacitor.isNativePlatform() 
      ? "flex flex-col gap-3 pb-2"
      : "flex flex-nowrap gap-1 overflow-x-auto pb-2 md:flex-col md:overflow-x-visible md:pb-0 [-webkit-overflow-scrolling:touch]"
    }>
      {SETTINGS_GROUPS.map((g) => (
        <div key={g.group} className={Capacitor.isNativePlatform() ? "flex flex-col gap-1 mb-2" : "contents md:block md:mb-3"}>
          <p className={Capacitor.isNativePlatform() 
            ? "block text-xs font-semibold uppercase tracking-wide text-gray-400 px-3 mb-1"
            : "hidden md:block text-xs font-semibold uppercase tracking-wide text-gray-400 px-3 mb-1"
          }>{t('profileSettings', `navGroup_${g.group}`, g.group)}</p>
          <div className={Capacitor.isNativePlatform() ? "flex flex-col gap-1" : "contents md:flex md:flex-col md:gap-1"}>
            {g.items.map((it) => {
              const Icon = it.icon;
              const active = section === it.key;
              return (
                <button
                  key={it.key}
                  onClick={() => onSelect(it.key)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                    active ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-purple-50 hover:text-purple-700'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {t('profileSettings', `navItem_${it.key}`, it.label)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  </aside>
  );
};

export const ProfileSettings: React.FC = () => {
  const { t } = useLanguage();
  // Safe auth hook with fallback
  let profile: any = null;
  let updateProfile = async (updates: any) => {};
  let updatePassword = async (password: string) => ({ error: 'Not available' });
  let syncAccountsByEmail = async (email: string) => ({ success: false, message: 'Not available' });
  let user: any = null;
  let supabaseClient: any = null;

  try {
    const auth = useAuth();
    profile = auth.profile;
    updateProfile = auth.updateProfile;
    updatePassword = auth.updatePassword;
    syncAccountsByEmail = auth.syncAccountsByEmail;
    user = auth.user;
    supabaseClient = auth.supabase;
  } catch (e) {
    console.warn('Auth context not available in ProfileSettings');
  }

  const [saving, setSaving] = useState(false);
  const [section, setSection] = useViewHistory<string>('profile-settings', 'profile');
  // Lets other screens deep-link into a specific settings section, e.g. the home
  // "set up reminders" tip opens the Daily Reminders section directly.
  useEffect(() => {
    const handler = (e: Event) => {
      const target = (e as CustomEvent).detail?.section;
      if (typeof target === 'string') setSection(target);
    };
    window.addEventListener('openProfileSection', handler);
    return () => window.removeEventListener('openProfileSection', handler);
  }, []);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [affirmCatsOpen, setAffirmCatsOpen] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [passwordData, setPasswordData] = useState({ newPassword: '', confirmPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncEmail, setSyncEmail] = useState('');

  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    spiritual_level: profile?.spiritual_level || 'seeker',
    consent_devotionals: profile?.consent_devotionals ?? true,
    consent_affirmations: profile?.consent_affirmations ?? true,
    consent_reminders: profile?.consent_reminders ?? true,
    consent_marketing: profile?.consent_marketing ?? false,
    email_opt_in: (profile as any)?.email_opt_in ?? false,
    timezone: profile?.timezone || 'UTC',
    date_of_birth: (profile as any)?.date_of_birth || '',
    affirmation_categories: profile?.affirmation_categories || [],
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...formData, date_of_birth: formData.date_of_birth || null };
      await updateProfile(payload as any);
      toast({ title: t('profileSettings', 'toastProfileUpdatedTitle', 'Profile Updated'), description: t('profileSettings', 'toastProfileUpdatedDesc', 'Your settings have been saved.') });
    } catch (err) {
      toast({ title: t('profileSettings', 'error', 'Error'), description: t('profileSettings', 'toastSaveFailed', 'Failed to save settings'), variant: 'destructive' });
    }
    setSaving(false);
  };

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ title: t('profileSettings', 'error', 'Error'), description: t('profileSettings', 'toastPasswordsMismatch', 'Passwords do not match'), variant: 'destructive' });
      return;
    }
    if (passwordData.newPassword.length < 6) {
      toast({ title: t('profileSettings', 'error', 'Error'), description: t('profileSettings', 'toastPasswordTooShort', 'Password must be at least 6 characters'), variant: 'destructive' });
      return;
    }

    setPasswordLoading(true);
    try {
      const result = await updatePassword(passwordData.newPassword);
      if (result.error) {
        toast({ title: t('profileSettings', 'error', 'Error'), description: result.error, variant: 'destructive' });
      } else {
        toast({ title: t('profileSettings', 'success', 'Success'), description: t('profileSettings', 'toastPasswordUpdated', 'Password updated successfully!') });
        setShowPasswordModal(false);
        setPasswordData({ newPassword: '', confirmPassword: '' });
      }
    } catch (err: any) {
      toast({ title: t('profileSettings', 'error', 'Error'), description: err.message || t('profileSettings', 'toastPasswordUpdateFailed', 'Failed to update password'), variant: 'destructive' });
    }
    setPasswordLoading(false);
  };

  const handleAccountSync = async () => {
    if (!syncEmail) {
      toast({ title: t('profileSettings', 'error', 'Error'), description: t('profileSettings', 'toastEnterEmail', 'Please enter an email address'), variant: 'destructive' });
      return;
    }

    setSyncLoading(true);
    try {
      const result = await syncAccountsByEmail(syncEmail);
      if (result.success) {
        toast({ title: t('profileSettings', 'success', 'Success'), description: result.message });
        setShowSyncModal(false);
        setSyncEmail('');
      } else {
        toast({ title: t('profileSettings', 'error', 'Error'), description: result.message, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: t('profileSettings', 'error', 'Error'), description: err.message || t('profileSettings', 'toastSyncFailed', 'Failed to sync accounts'), variant: 'destructive' });
    }
    setSyncLoading(false);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className={Capacitor.isNativePlatform() 
        ? "flex flex-col gap-6"
        : "flex flex-col md:flex-row gap-6 md:items-start"
      }>
        <SettingsSidebar section={section} onSelect={setSection} />
        <div className="flex-1 min-w-0 space-y-6">
                {section === 'profile' && (<>
          {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t('profileSettings', 'profileInfoTitle', 'Profile Information')}
          </CardTitle>
          <CardDescription>{t('profileSettings', 'profileInfoDesc', 'Update your personal details and preferences')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">{t('profileSettings', 'fullNameLabel', 'Full Name')}</Label>
            <Input
              id="fullName"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder={t('profileSettings', 'yourNamePlaceholder', 'Your name')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t('profileSettings', 'emailLabel', 'Email')}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="email"
                value={user?.email || profile?.email || ''}
                disabled
                className="pl-10 bg-gray-50"
              />
            </div>
            <p className="text-xs text-gray-500">{t('profileSettings', 'emailCannotChange', 'Email cannot be changed')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dob">{t('profileSettings', 'dobLabel', 'Date of Birth')}</Label>
            <Input
              id="dob"
              type="date"
              value={formData.date_of_birth}
              onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
            />
            <p className="text-xs text-gray-500">
              {t('profileSettings', 'dobHelper', 'Your ministry may send you a birthday greeting on your special day.')}
            </p>
          </div>


          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-gray-500" />
              {t('profileSettings', 'timezoneLabel', 'Timezone')}
            </Label>
            <Select
              value={formData.timezone}
              onValueChange={(v) => setFormData({ ...formData, timezone: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('profileSettings', 'timezonePlaceholder', 'Select your timezone')} />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              {t('profileSettings', 'timezoneHelper', 'Used to send WhatsApp reminders at the right local time')}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t('profileSettings', 'spiritualLevelLabel', 'Spiritual Level')}</Label>
            <Select
              value={formData.spiritual_level}
              onValueChange={(v) => setFormData({ ...formData, spiritual_level: v })}
            >
              <SelectTrigger>
                <BookOpen className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {spiritualLevels.map((level) => (
                  <SelectItem key={level.id} value={level.id}>
                    {level.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Language Settings - New Section */}
                </>)}

          {section === 'language' && (<>
          <LanguageSettings showDescription={true} />

                </>)}

          {section === 'security' && (<>
          {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t('profileSettings', 'securityTitle', 'Security')}
          </CardTitle>
          <CardDescription>{t('profileSettings', 'securityDesc', 'Manage your password and account security')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <Key className="h-5 w-5 text-gray-600" />
              <div>
                <p className="font-medium">{t('profileSettings', 'passwordLabel', 'Password')}</p>
                <p className="text-sm text-gray-500">{t('profileSettings', 'passwordDesc', 'Change your account password')}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setShowPasswordModal(true)}>
              {t('profileSettings', 'changePasswordBtn', 'Change Password')}
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 text-gray-600" />
              <div>
                <p className="font-medium">{t('profileSettings', 'accountMigrationTitle', 'Account Migration')}</p>
                <p className="text-sm text-gray-500">{t('profileSettings', 'accountMigrationDesc', 'Link existing profile to this account')}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setShowSyncModal(true)}>
              {t('profileSettings', 'syncAccountBtn', 'Sync Account')}
            </Button>
          </div>
        </CardContent>
      </Card>

                </>)}

          {section === 'data' && (<>
          {/* Data Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t('profileSettings', 'dataExportTitle', 'Data Export')}
          </CardTitle>
          <CardDescription>{t('profileSettings', 'dataExportDesc', 'Download your personal data for backup or portability')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <Download className="h-5 w-5 text-gray-600" />
              <div>
                <p className="font-medium">{t('profileSettings', 'exportPersonalData', 'Export Personal Data')}</p>
                <p className="text-sm text-gray-500">{t('profileSettings', 'exportPersonalDataDesc', 'Download prayer journal, devotionals, and profile')}</p>
              </div>
            </div>
            <DataExportButton 
              userId={user?.id || profile?.id || ''} 
              userEmail={user?.email || profile?.email || ''}
              supabaseClient={supabaseClient} 
            />
          </div>
        </CardContent>
      </Card>

                </>)}

          {section === 'notifications' && (<>
          {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t('profileSettings', 'notifPrefsTitle', 'Notification Preferences')}
          </CardTitle>
          <CardDescription>{t('profileSettings', 'notifPrefsDesc', 'Control what notifications you receive')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'consent_devotionals', label: t('profileSettings', 'notifDevotionalsLabel', 'Daily Devotionals'), desc: t('profileSettings', 'notifDevotionalsDesc', 'Receive daily scripture and reflections') },
            { key: 'consent_affirmations', label: t('profileSettings', 'notifAffirmationsLabel', 'Daily Affirmations'), desc: t('profileSettings', 'notifAffirmationsDesc', 'Faith-based affirmations for your day') },
            { key: 'consent_reminders', label: t('profileSettings', 'notifRemindersLabel', 'Prayer Reminders'), desc: t('profileSettings', 'notifRemindersDesc', 'Gentle nudges to maintain your streak') },
            { key: 'consent_marketing', label: t('profileSettings', 'notifUpdatesLabel', 'Updates & News'), desc: t('profileSettings', 'notifUpdatesDesc', 'New features and community updates') },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <div>
                <Label className="font-medium">{item.label}</Label>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
              <Switch
                checked={(formData as any)[item.key]}
                onCheckedChange={(v) => setFormData({ ...formData, [item.key]: v })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Email Consent */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-purple-600" />
            {t('profileSettings', 'emailCommsTitle', 'Email Communications')}
          </CardTitle>
          <CardDescription>{t('profileSettings', 'emailCommsDesc', 'Control the emails you receive from ReKindle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Marketing email toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border">
            <div>
              <p className="text-sm font-medium">{t('profileSettings', 'platformNewsLabel', 'Platform news & announcements')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('profileSettings', 'platformNewsDesc', 'Updates, new features, and general broadcasts from ReKindle')}
              </p>
            </div>
            <Switch
              checked={formData.email_opt_in}
              onCheckedChange={v => setFormData({ ...formData, email_opt_in: v })}
            />
          </div>

          {/* Transactional notice */}
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
            <p className="text-xs text-blue-800">
              <strong>{t('profileSettings', 'alwaysSentLabel', 'Always sent:')}</strong> {t('profileSettings', 'alwaysSentDesc', 'booking confirmations, payment receipts, counselling reminders, and account security notices cannot be disabled — they are part of the service.')}
            </p>
          </div>
        </CardContent>
      </Card>

                </>)}

          {section === 'push' && (<>
            <PushNotificationSettings />
          </>)}

          {section === 'whatsapp' && (<>
          {/* WhatsApp opt-in */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-600" />
            {t('profileSettings', 'whatsappTitle', 'WhatsApp Notifications')}
          </CardTitle>
          <CardDescription>{t('profileSettings', 'whatsappDesc', 'Receive platform broadcasts directly on WhatsApp')}</CardDescription>
        </CardHeader>
        <CardContent>
          <PlatformWhatsAppOptIn />
        </CardContent>
      </Card>

                </>)}

          {section === 'involvement' && (<>
          {/* Counsellor Application Status */}
      <CounsellorApplicationStatus />

      {/* Partner / Donation */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setPartnerOpen(prev => !prev)}
        >
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-rose-500" />
              {t('profileSettings', 'partnerTitle', 'Partner with ReKindle BC')}
            </div>
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform ${partnerOpen ? 'rotate-180' : ''}`}
            />
          </CardTitle>
          <CardDescription>
            {t('profileSettings', 'partnerDesc', 'Support the mission and unlock Partner features')}
          </CardDescription>
        </CardHeader>
        {partnerOpen && (
          <CardContent className="px-2">
            <PartnerDonationPage />
          </CardContent>
        )}
      </Card>

                </>)}

          {section === 'declarations' && (<>
          {/* Affirmation & Declaration Categories */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setAffirmCatsOpen(prev => !prev)}
        >
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              {t('profileSettings', 'declarationCatsTitle', 'Daily Declaration Categories')}
            </div>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${affirmCatsOpen ? 'rotate-180' : ''}`} />
          </CardTitle>
          <CardDescription>
            {t('profileSettings', 'declarationCatsDesc', 'Choose which categories of declarations and affirmations you want to see daily')}
          </CardDescription>
        </CardHeader>
        {affirmCatsOpen && (
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {AFFIRMATION_CATS.map(cat => {
                const selected = (formData.affirmation_categories || []).includes(cat.value);
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => {
                      const current: string[] = formData.affirmation_categories || [];
                      const updated = selected
                        ? current.filter(c => c !== cat.value)
                        : [...current, cat.value];
                      setFormData({ ...formData, affirmation_categories: updated });
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      selected
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <span>{cat.emoji}</span>
                    <span>{t('profileSettings', `affirmCat_${cat.value}`, cat.label)}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {(formData.affirmation_categories || []).length === 0
                ? t('profileSettings', 'noCatsSelected', 'No categories selected — all declarations will be shown')
                : t('profileSettings', 'catsSelectedCount', '{count} categories selected').replace('{count}', String((formData.affirmation_categories || []).length))}
            </p>
          </CardContent>
        )}
      </Card>

                </>)}

          {section === 'reminders' && (<>
          {/* Daily Reminders */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setRemindersOpen(prev => !prev)}
        >
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-purple-600" />
              {t('profileSettings', 'dailyRemindersTitle', 'Daily Reminders')}
            </div>
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform ${remindersOpen ? 'rotate-180' : ''}`}
            />
          </CardTitle>
          <CardDescription>
            {t('profileSettings', 'dailyRemindersDesc', 'Set the time you want to receive each daily reminder in the app.')}
          </CardDescription>
        </CardHeader>
        {remindersOpen && (
          <CardContent>
            <DailyReminders />
          </CardContent>
        )}
      </Card>

                </>)}

          {/* Save Button */}
      <Button onClick={handleSave} disabled={saving} className="w-full bg-purple-600 hover:bg-purple-700">
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('profileSettings', 'savingBtn', 'Saving...')}
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            {t('profileSettings', 'saveChangesBtn', 'Save Changes')}
          </>
        )}
      </Button>

      </div>
      </div>

      {/* Password Change Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('profileSettings', 'changePasswordBtn', 'Change Password')}</DialogTitle>
            <DialogDescription>
              {t('profileSettings', 'changePasswordDialogDesc', 'Enter a new password for your account. Must be at least 6 characters.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t('profileSettings', 'newPasswordLabel', 'New Password')}</Label>
              <Input
                id="newPassword"
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                placeholder={t('profileSettings', 'enterNewPasswordPlaceholder', 'Enter new password')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('profileSettings', 'confirmPasswordLabel', 'Confirm Password')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                placeholder={t('profileSettings', 'confirmNewPasswordPlaceholder', 'Confirm new password')}
              />
            </div>
            <Button 
              onClick={handlePasswordChange} 
              disabled={passwordLoading}
              className="w-full"
            >
              {passwordLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('profileSettings', 'updatingBtn', 'Updating...')}
                </>
              ) : (
                t('profileSettings', 'updatePasswordBtn', 'Update Password')
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Account Sync Modal */}
      <Dialog open={showSyncModal} onOpenChange={setShowSyncModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('profileSettings', 'accountMigrationTitle', 'Account Migration')}</DialogTitle>
            <DialogDescription>
              {t('profileSettings', 'accountMigrationDialogDesc', 'If you have an existing profile with a different account, enter the email to link them together.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">{t('profileSettings', 'importantLabel', 'Important')}</p>
                  <p className="text-sm text-amber-700">
                    {t('profileSettings', 'migrationWarning', 'This will link your existing profile data (prayer history, progress, etc.) to your current login account.')}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="syncEmail">{t('profileSettings', 'existingProfileEmailLabel', 'Email of existing profile')}</Label>
              <Input
                id="syncEmail"
                type="email"
                value={syncEmail}
                onChange={(e) => setSyncEmail(e.target.value)}
                placeholder={t('profileSettings', 'emailPlaceholder', 'your@email.com')}
              />
            </div>
            <Button 
              onClick={handleAccountSync} 
              disabled={syncLoading}
              className="w-full"
            >
              {syncLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('profileSettings', 'syncingBtn', 'Syncing...')}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t('profileSettings', 'syncAccountsBtn', 'Sync Accounts')}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
