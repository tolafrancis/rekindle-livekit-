import React, { useState, useEffect } from 'react';
import { useViewHistory } from '@rekindle/features/hooks/useViewHistory';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Label } from '@rekindle/ui/label';
import { Switch } from '@rekindle/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { COUNTRY_OPTIONS, detectUkFromText, isUkCountryCode } from '../giftAid';
import { useLanguage } from '@rekindle/features/LanguageContext';
import {
  LayoutDashboard, Settings, Users, BookOpen, MessageSquare, Radio, CreditCard,
  Palette, Shield, Loader2, Save, Link as LinkIcon, Image, Upload
} from 'lucide-react';

// Section Components
import { MinistryOverviewDashboard } from './MinistryOverviewDashboard';
import { MinistryRegistrationSettings } from './MinistryRegistrationSettings';
import CustomDomainSettings from './CustomDomainSettings';
import { MinistryMembersManager } from './MinistryMembersManager';
import { MinistryVolunteerTeamsManager } from './MinistryVolunteerTeamsManager';
import MinistryRegistrations from './MinistryRegistrations';
import { MinistryBirthdayWishes } from './MinistryBirthdayWishes';
import { MinistryDevotionalsManager } from './MinistryDevotionalsManager';
import { MinistryPrayerLibraryManager } from './MinistryPrayerLibraryManager';
import { MinistryVideoMessagesManager } from './MinistryVideoMessagesManager';
import { MinistryRulesManager } from './MinistryRulesManager';
import { MinistryAnnouncementsManager } from './MinistryAnnouncementsManager';
import { MinistryTestimoniesManager } from './MinistryTestimoniesManager';
import { MinistryPrayerRequestsManager } from './MinistryPrayerRequestsManager';
import { MinistryDonationsManager } from './MinistryDonationsManager';
import { MinistryEventsManager } from './MinistryEventsManager';
import { EvangelismInbox } from './EvangelismInbox';
import { MinistryWhatsAppHub } from './MinistryWhatsAppHub';
import { MinistryTranslationHub } from './MinistryTranslationHub';
import { MinistryTranslationSettings } from './MinistryTranslationSettings';
import { MinistryPaymentSettings } from './MinistryPaymentSettings';
import { MinistryGiftAidSettings } from './MinistryGiftAidSettings';
import BillingSettings from './BillingSettings';

interface Ministry {
  id: string;
  name: string;
  description: string;
  category: string;
  location: string;
  country_code?: string;
  theme_color: string;
  logo_url: string;
  banner_url: string;
  welcome_message: string;
  is_public: boolean;
  join_method: string;
  social_links: any;
  brand_colors: any;
  white_label_domain: string;
  settings: any;
}

export type SettingsSectionId =
  | 'overview'
  | 'general'
  | 'people'
  | 'content'
  | 'engagement'
  | 'live-tech'
  | 'finance-billing';

interface SectionDef {
  id: SettingsSectionId;
  label: string;
  icon: any;
  description: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'overview',        label: 'Overview',          icon: LayoutDashboard, description: 'Ministry stats & quick actions' },
  { id: 'general',         label: 'General',           icon: Settings,        description: 'Profile, branding & domain' },
  { id: 'people',          label: 'People',            icon: Users,           description: 'Members, teams & signups' },
  { id: 'content',         label: 'Content',           icon: BookOpen,        description: 'Devotionals, library & rules' },
  { id: 'engagement',      label: 'Engagement',       icon: MessageSquare,   description: 'Requests, donations & WhatsApp' },
  { id: 'live-tech',       label: 'Live & Tech',       icon: Radio,           description: 'Translation & restreaming' },
  { id: 'finance-billing', label: 'Finance & Billing', icon: CreditCard,      description: 'Gateways & subscription' },
];

interface MinistrySettingsHubProps {
  ministry: Ministry;
  onUpdate: () => void;
  initialSection?: SettingsSectionId;
}

export const MinistrySettingsHub: React.FC<MinistrySettingsHubProps> = ({
  ministry,
  onUpdate,
  initialSection = 'overview'
}) => {
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useViewHistory<SettingsSectionId>(
    `ministry-settings-section-${ministry.id}`,
    initialSection
  );

  // ── General Profile & Branding Form State ──
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [formData, setFormData] = useState({
    name: ministry.name || '',
    description: ministry.description || '',
    location: ministry.location || '',
    country_code: ministry.country_code || '',
    theme_color: ministry.theme_color || '#7c3aed',
    logo_url: ministry.logo_url || '',
    banner_url: ministry.banner_url || '',
    welcome_message: ministry.welcome_message || '',
    is_public: ministry.is_public ?? true,
    social_links: ministry.social_links || {
      website: '',
      facebook: '',
      instagram: '',
      twitter: '',
      youtube: ''
    },
    brand_colors: ministry.brand_colors || {
      primary: '#7c3aed',
      secondary: '#4f46e5',
      accent: '#f59e0b'
    },
    white_label_domain: ministry.white_label_domain || '',
    settings: ministry.settings || {
      allow_broadcasts: true,
      public_join: true,
      require_approval: false,
      enable_donations: true,
      enable_events: true
    }
  });

  // ── Restream Defaults Form State ──
  const [savingRestream, setSavingRestream] = useState(false);
  const [ytKey, setYtKey] = useState<string>(() => ministry.settings?.restream_defaults?.youtube || '');
  const [fbKey, setFbKey] = useState<string>(() => ministry.settings?.restream_defaults?.facebook || '');

  useEffect(() => {
    const rd = ministry.settings?.restream_defaults;
    if (rd) {
      setYtKey(rd.youtube || '');
      setFbKey(rd.facebook || '');
    }
  }, [ministry.settings]);

  const handleSaveRestream = async () => {
    setSavingRestream(true);
    try {
      const updatedSettings = {
        ...(ministry.settings || {}),
        restream_defaults: {
          youtube: ytKey.trim(),
          facebook: fbKey.trim()
        }
      };
      const { error } = await supabase
        .from('ministry_groups')
        .update({
          settings: updatedSettings,
          updated_at: new Date().toISOString()
        })
        .eq('id', ministry.id);

      if (error) throw error;
      toast({ title: t('ministrySettingsHub', 'restreamSaved', 'Restream defaults saved') });
      onUpdate();
    } catch (err: any) {
      toast({ title: t('ministrySettingsHub', 'saveFailed', 'Save failed'), description: err.message, variant: 'destructive' });
    } finally {
      setSavingRestream(false);
    }
  };

  const uploadMinistryImage = async (
    file: File,
    bucket: 'channel-logos' | 'channel-featured'
  ): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `ministry-${ministry.id}-${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return publicUrl;
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const url = await uploadMinistryImage(file, 'channel-logos');
      setFormData(prev => ({ ...prev, logo_url: url }));
      toast({ title: t('ministrySettingsHub', 'logoUploaded', 'Logo uploaded') });
    } catch (err: any) {
      toast({ title: t('ministrySettingsHub', 'uploadFailed', 'Upload failed'), description: err.message, variant: 'destructive' });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBanner(true);
    try {
      const url = await uploadMinistryImage(file, 'channel-featured');
      setFormData(prev => ({ ...prev, banner_url: url }));
      toast({ title: t('ministrySettingsHub', 'bannerUploaded', 'Banner uploaded') });
    } catch (err: any) {
      toast({ title: t('ministrySettingsHub', 'uploadFailed', 'Upload failed'), description: err.message, variant: 'destructive' });
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleSaveGeneral = async () => {
    setSavingGeneral(true);
    try {
      const { error } = await supabase
        .from('ministry_groups')
        .update({
          name: formData.name,
          description: formData.description,
          location: formData.location,
          country_code: formData.country_code || null,
          theme_color: formData.theme_color,
          logo_url: formData.logo_url,
          banner_url: formData.banner_url,
          welcome_message: formData.welcome_message,
          is_public: formData.is_public,
          social_links: formData.social_links,
          brand_colors: formData.brand_colors,
          white_label_domain: formData.white_label_domain,
          settings: formData.settings,
          updated_at: new Date().toISOString()
        })
        .eq('id', ministry.id);

      if (error) throw error;
      toast({ title: t('ministrySettingsHub', 'settingsSaved', 'General settings saved') });
      onUpdate();
    } catch (err: any) {
      toast({ title: t('ministrySettingsHub', 'saveFailed', 'Save failed'), description: err.message, variant: 'destructive' });
    } finally {
      setSavingGeneral(false);
    }
  };

  const colorOptions = ['#7c3aed', '#2563eb', '#059669', '#dc2626', '#ea580c', '#0891b2', '#7c2d12', '#1e3a8a'];

  return (
    <div className="flex flex-col md:flex-row gap-6 min-h-[650px]">
      {/* Mobile Horizontal Scrollable Nav */}
      <div className="md:hidden flex gap-2 overflow-x-auto pb-2 border-b">
        {SECTIONS.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <Button
              key={sec.id}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveSection(sec.id)}
              className="flex-shrink-0 gap-1.5"
            >
              <Icon className="h-4 w-4" />
              {sec.label}
            </Button>
          );
        })}
      </div>

      {/* Desktop Vertical Left-Nav Sidebar */}
      <aside className="hidden md:block w-64 flex-shrink-0 space-y-1 pr-2">
        <div className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground tracking-wider">
          Settings & Management
        </div>
        {SECTIONS.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 shadow-sm border border-purple-100 dark:border-purple-900/50'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/60'
              }`}
            >
              <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isActive ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400'}`} />
              <div className="text-left">
                <div className="font-semibold leading-tight">{sec.label}</div>
                <div className="text-[11px] text-muted-foreground font-normal leading-normal mt-0.5">{sec.description}</div>
              </div>
            </button>
          );
        })}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 space-y-6">
        {/* Section 1: Overview */}
        {activeSection === 'overview' && (
          <MinistryOverviewDashboard
            ministryId={ministry.id}
            onNavigate={(navTarget) => {
              const navMap: Record<string, SettingsSectionId> = {
                devotionals: 'content',
                'prayer-library': 'content',
                events: 'engagement',
                'prayer-requests': 'engagement',
                announcements: 'content',
                testimonies: 'content',
                donations: 'engagement',
                members: 'people',
                'small-groups': 'people',
                volunteers: 'people',
                'video-messages': 'content',
                translation: 'live-tech',
                registrations: 'people',
                whatsapp: 'engagement',
                inbox: 'engagement',
                birthdays: 'people',
                rules: 'content',
                settings: 'general',
              };
              if (navMap[navTarget]) {
                setActiveSection(navMap[navTarget]);
              }
            }}
          />
        )}

        {/* Section 2: General */}
        {activeSection === 'general' && (
          <div className="space-y-6">
            {/* Profile Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-purple-600" />
                  {t('ministrySettingsHub', 'ministryProfile', 'Ministry Profile')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('ministrySettingsHub', 'ministryName', 'Ministry Name')}</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{t('ministrySettingsHub', 'location', 'Location')}</Label>
                    <Input
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder={t('ministrySettingsHub', 'cityCountryPlaceholder', 'City, Country')}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('ministrySettingsHub', 'country', 'Country')}</Label>
                    <Select
                      value={formData.country_code || undefined}
                      onValueChange={(value) => setFormData({ ...formData, country_code: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('ministrySettingsHub', 'selectCountry', 'Select country')} />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRY_OPTIONS.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isUkCountryCode(formData.country_code) ? (
                      <p className="text-xs text-purple-600 mt-1">
                        {t('ministrySettingsHub', 'ukGiftAidEnabled', 'UK ministry — Gift Aid features can be enabled.')}
                      </p>
                    ) : !formData.country_code && detectUkFromText(formData.location) ? (
                      <p className="text-xs text-amber-600 mt-1">
                        {t('ministrySettingsHub', 'ukGiftAidHint', 'This location looks like the UK. Select “United Kingdom” to enable Gift Aid.')}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">
                        {t('ministrySettingsHub', 'countryRegionHint', 'Used for region-specific features (e.g. UK Gift Aid).')}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <Label>{t('ministrySettingsHub', 'description', 'Description')}</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div>
                  <Label>{t('ministrySettingsHub', 'welcomeMessage', 'Welcome Message')}</Label>
                  <Textarea
                    value={formData.welcome_message}
                    onChange={(e) => setFormData({ ...formData, welcome_message: e.target.value })}
                    placeholder={t('ministrySettingsHub', 'welcomeMessagePlaceholder', 'Message shown to new members...')}
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('ministrySettingsHub', 'logo', 'Logo')}</Label>
                    <div className="flex items-center gap-3 mt-1">
                      {formData.logo_url ? (
                        <img src={formData.logo_url} alt="Logo preview" className="w-12 h-12 rounded-lg object-cover border flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg border flex items-center justify-center bg-gray-50 flex-shrink-0">
                          <Image className="h-4 w-4 text-gray-300" />
                        </div>
                      )}
                      <div className="flex-1 space-y-2">
                        <Input
                          value={formData.logo_url}
                          onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                          placeholder="https://..."
                        />
                        <label className="inline-flex items-center gap-2 text-xs font-medium text-purple-600 cursor-pointer hover:text-purple-700">
                          {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          {uploadingLogo ? t('ministrySettingsHub', 'uploading', 'Uploading…') : t('ministrySettingsHub', 'uploadFile', 'Upload file')}
                          <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                        </label>
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label>{t('ministrySettingsHub', 'banner', 'Banner')}</Label>
                    <div className="mt-1 space-y-2">
                      {formData.banner_url ? (
                        <img src={formData.banner_url} alt="Banner preview" className="w-full h-20 rounded-lg object-cover border" />
                      ) : (
                        <div className="w-full h-20 rounded-lg border flex items-center justify-center bg-gray-50">
                          <Image className="h-5 w-5 text-gray-300" />
                        </div>
                      )}
                      <Input
                        value={formData.banner_url}
                        onChange={(e) => setFormData({ ...formData, banner_url: e.target.value })}
                        placeholder="https://..."
                      />
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-purple-600 cursor-pointer hover:text-purple-700">
                        {uploadingBanner ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {uploadingBanner ? t('ministrySettingsHub', 'uploading', 'Uploading…') : t('ministrySettingsHub', 'uploadFile', 'Upload file')}
                        <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} disabled={uploadingBanner} />
                      </label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Branding */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5 text-purple-600" />
                  {t('ministrySettingsHub', 'brandingColors', 'Branding & Colors')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>{t('ministrySettingsHub', 'themeColor', 'Theme Color')}</Label>
                  <div className="flex gap-2 mt-2">
                    {colorOptions.map(color => (
                      <button
                        key={color}
                        className={`w-10 h-10 rounded-full border-2 transition-all ${
                          formData.theme_color === color ? 'border-gray-900 scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormData({ ...formData, theme_color: color })}
                      />
                    ))}
                    <Input
                      type="color"
                      value={formData.theme_color}
                      onChange={(e) => setFormData({ ...formData, theme_color: e.target.value })}
                      className="w-10 h-10 p-1 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>{t('ministrySettingsHub', 'primaryColor', 'Primary Color')}</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={formData.brand_colors.primary}
                        onChange={(e) => setFormData({
                          ...formData,
                          brand_colors: { ...formData.brand_colors, primary: e.target.value }
                        })}
                        className="w-12 h-10 p-1"
                      />
                      <Input
                        value={formData.brand_colors.primary}
                        onChange={(e) => setFormData({
                          ...formData,
                          brand_colors: { ...formData.brand_colors, primary: e.target.value }
                        })}
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>{t('ministrySettingsHub', 'secondaryColor', 'Secondary Color')}</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={formData.brand_colors.secondary}
                        onChange={(e) => setFormData({
                          ...formData,
                          brand_colors: { ...formData.brand_colors, secondary: e.target.value }
                        })}
                        className="w-12 h-10 p-1"
                      />
                      <Input
                        value={formData.brand_colors.secondary}
                        onChange={(e) => setFormData({
                          ...formData,
                          brand_colors: { ...formData.brand_colors, secondary: e.target.value }
                        })}
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>{t('ministrySettingsHub', 'accentColor', 'Accent Color')}</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={formData.brand_colors.accent}
                        onChange={(e) => setFormData({
                          ...formData,
                          brand_colors: { ...formData.brand_colors, accent: e.target.value }
                        })}
                        className="w-12 h-10 p-1"
                      />
                      <Input
                        value={formData.brand_colors.accent}
                        onChange={(e) => setFormData({
                          ...formData,
                          brand_colors: { ...formData.brand_colors, accent: e.target.value }
                        })}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>{t('ministrySettingsHub', 'customDomain', 'Custom Domain (White Label)')}</Label>
                  <Input
                    value={formData.white_label_domain}
                    onChange={(e) => setFormData({ ...formData, white_label_domain: e.target.value })}
                    placeholder="ministry.yourdomain.com"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('ministrySettingsHub', 'customDomainHint', 'Contact support to configure custom domains')}</p>
                </div>
              </CardContent>
            </Card>

            {/* Social Links */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5 text-purple-600" />
                  {t('ministrySettingsHub', 'socialLinks', 'Social Links')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('ministrySettingsHub', 'website', 'Website')}</Label>
                    <Input
                      value={formData.social_links.website || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        social_links: { ...formData.social_links, website: e.target.value }
                      })}
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <Label>Facebook</Label>
                    <Input
                      value={formData.social_links.facebook || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        social_links: { ...formData.social_links, facebook: e.target.value }
                      })}
                      placeholder="https://facebook.com/..."
                    />
                  </div>
                  <div>
                    <Label>Instagram</Label>
                    <Input
                      value={formData.social_links.instagram || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        social_links: { ...formData.social_links, instagram: e.target.value }
                      })}
                      placeholder="https://instagram.com/..."
                    />
                  </div>
                  <div>
                    <Label>Twitter/X</Label>
                    <Input
                      value={formData.social_links.twitter || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        social_links: { ...formData.social_links, twitter: e.target.value }
                      })}
                      placeholder="https://twitter.com/..."
                    />
                  </div>
                  <div>
                    <Label>YouTube</Label>
                    <Input
                      value={formData.social_links.youtube || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        social_links: { ...formData.social_links, youtube: e.target.value }
                      })}
                      placeholder="https://youtube.com/..."
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Privacy & Access */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-purple-600" />
                  {t('ministrySettingsHub', 'privacyAccess', 'Privacy & Access')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <Label>{t('ministrySettingsHub', 'publicMinistry', 'Public Ministry')}</Label>
                    <p className="text-xs text-gray-500">{t('ministrySettingsHub', 'publicMinistryHint', 'Anyone can discover this ministry')}</p>
                  </div>
                  <Switch
                    checked={formData.is_public}
                    onCheckedChange={(v) => setFormData({ ...formData, is_public: v })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <Label>{t('ministrySettingsHub', 'allowOpenJoining', 'Allow Open Joining')}</Label>
                    <p className="text-xs text-gray-500">{t('ministrySettingsHub', 'allowOpenJoiningHint', 'Members can join without approval')}</p>
                  </div>
                  <Switch
                    checked={formData.settings.public_join}
                    onCheckedChange={(v) => setFormData({
                      ...formData,
                      settings: { ...formData.settings, public_join: v }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <Label>{t('ministrySettingsHub', 'requireApproval', 'Require Approval')}</Label>
                    <p className="text-xs text-gray-500">{t('ministrySettingsHub', 'requireApprovalHint', 'New members need admin approval')}</p>
                  </div>
                  <Switch
                    checked={formData.settings.require_approval}
                    onCheckedChange={(v) => setFormData({
                      ...formData,
                      settings: { ...formData.settings, require_approval: v }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <Label>{t('ministrySettingsHub', 'enableDonations', 'Enable Donations')}</Label>
                    <p className="text-xs text-gray-500">{t('ministrySettingsHub', 'enableDonationsHint', 'Allow members to donate')}</p>
                  </div>
                  <Switch
                    checked={formData.settings.enable_donations}
                    onCheckedChange={(v) => setFormData({
                      ...formData,
                      settings: { ...formData.settings, enable_donations: v }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <Label>{t('ministrySettingsHub', 'enableEvents', 'Enable Events')}</Label>
                    <p className="text-xs text-gray-500">{t('ministrySettingsHub', 'enableEventsHint', 'Show events section')}</p>
                  </div>
                  <Switch
                    checked={formData.settings.enable_events}
                    onCheckedChange={(v) => setFormData({
                      ...formData,
                      settings: { ...formData.settings, enable_events: v }
                    })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Save Button for General Settings */}
            <div className="flex justify-end">
              <Button onClick={handleSaveGeneral} disabled={savingGeneral} size="lg">
                {savingGeneral ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                {t('ministrySettingsHub', 'saveGeneralSettings', 'Save General Settings')}
              </Button>
            </div>

            <MinistryRegistrationSettings ministry={ministry} onUpdate={onUpdate} />
            <CustomDomainSettings ministryId={ministry.id} />
          </div>
        )}

        {/* Section 3: People */}
        {activeSection === 'people' && (
          <div className="space-y-6">
            <MinistryMembersManager ministryId={ministry.id} />
            <MinistryVolunteerTeamsManager ministryId={ministry.id} />
            <MinistryRegistrations ministryId={ministry.id} ministryName={ministry.name} />
            <MinistryBirthdayWishes ministryId={ministry.id} ministryName={ministry.name} />
          </div>
        )}

        {/* Section 4: Content */}
        {activeSection === 'content' && (
          <div className="space-y-6">
            <MinistryDevotionalsManager ministryId={ministry.id} />
            <MinistryPrayerLibraryManager ministryId={ministry.id} />
            <MinistryVideoMessagesManager ministryId={ministry.id} ministryName={ministry.name} />
            <MinistryRulesManager ministryId={ministry.id} />
            <MinistryAnnouncementsManager ministryId={ministry.id} />
            <MinistryTestimoniesManager ministryId={ministry.id} />
          </div>
        )}

        {/* Section 5: Engagement */}
        {activeSection === 'engagement' && (
          <div className="space-y-6">
            <MinistryPrayerRequestsManager ministryId={ministry.id} />
            <MinistryDonationsManager ministryId={ministry.id} ministryName={ministry.name} themeColor={ministry.theme_color} isLeader={true} />
            <MinistryEventsManager ministryId={ministry.id} />
            <EvangelismInbox ministryId={ministry.id} ministryName={ministry.name} isLeader={true} />
            <MinistryWhatsAppHub ministryId={ministry.id} ministryName={ministry.name} />
          </div>
        )}

        {/* Section 6: Live & Tech */}
        {activeSection === 'live-tech' && (
          <div className="space-y-6">
            <MinistryTranslationHub ministryId={ministry.id} ministryName={ministry.name} />
            <MinistryTranslationSettings ministryId={ministry.id} />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="h-5 w-5 text-purple-600" />
                  Restream Defaults
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Configure default RTMP stream keys for broadcasting to external platforms.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>YouTube Stream Key</Label>
                    <Input
                      type="password"
                      value={ytKey}
                      onChange={(e) => setYtKey(e.target.value)}
                      placeholder="xxxx-xxxx-xxxx-xxxx"
                    />
                  </div>
                  <div>
                    <Label>Facebook Stream Key</Label>
                    <Input
                      type="password"
                      value={fbKey}
                      onChange={(e) => setFbKey(e.target.value)}
                      placeholder="FB-xxxx-xxxx-xxxx"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSaveRestream} disabled={savingRestream}>
                    {savingRestream ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Restream Defaults
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Section 7: Finance & Billing */}
        {activeSection === 'finance-billing' && (
          <div className="space-y-6">
            <MinistryPaymentSettings ministryId={ministry.id} />
            <MinistryGiftAidSettings ministryId={ministry.id} countryCode={ministry.country_code} />
            <BillingSettings ministryId={ministry.id} />
          </div>
        )}
      </main>
    </div>
  );
};
export default MinistrySettingsHub;
