import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { supabase } from '@/lib/supabase';
import { toast } from '../ui/use-toast';
import { MinistryRegistrationSettings } from './MinistryRegistrationSettings';
import { MinistryGiftAidSettings } from './MinistryGiftAidSettings';
import { COUNTRY_OPTIONS, detectUkFromText, isUkCountryCode } from '@/lib/giftAid';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Settings, Palette, Globe, Bell, Shield, Loader2, Save, Link, Image, Upload
} from 'lucide-react';

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

interface MinistrySettingsManagerProps {
  ministry: Ministry;
  onUpdate: () => void;
}

export const MinistrySettingsManager: React.FC<MinistrySettingsManagerProps> = ({
  ministry,
  onUpdate
}) => {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
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
      toast({ title: t('ministrySettingsManager', 'logoUploaded', 'Logo uploaded') });
    } catch (err: any) {
      toast({ title: t('ministrySettingsManager', 'uploadFailed', 'Upload failed'), description: err.message, variant: 'destructive' });
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
      toast({ title: t('ministrySettingsManager', 'bannerUploaded', 'Banner uploaded') });
    } catch (err: any) {
      toast({ title: t('ministrySettingsManager', 'uploadFailed', 'Upload failed'), description: err.message, variant: 'destructive' });
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
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
      toast({ title: t('ministrySettingsManager', 'success', 'Success'), description: t('ministrySettingsManager', 'settingsSaved', 'Settings saved successfully') });
      onUpdate();
    } catch (err: any) {
      toast({ title: t('ministrySettingsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const colorOptions = ['#7c3aed', '#2563eb', '#059669', '#dc2626', '#ea580c', '#0891b2', '#7c2d12', '#1e3a8a'];

  return (
    <div className="space-y-6">
      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-purple-600" />
            {t('ministrySettingsManager', 'ministryProfile', 'Ministry Profile')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('ministrySettingsManager', 'ministryName', 'Ministry Name')}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('ministrySettingsManager', 'location', 'Location')}</Label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder={t('ministrySettingsManager', 'cityCountryPlaceholder', 'City, Country')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('ministrySettingsManager', 'country', 'Country')}</Label>
              <Select
                value={formData.country_code || undefined}
                onValueChange={(value) => setFormData({ ...formData, country_code: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('ministrySettingsManager', 'selectCountry', 'Select country')} />
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
                  {t('ministrySettingsManager', 'ukGiftAidEnabled', 'UK ministry — Gift Aid features can be enabled.')}
                </p>
              ) : !formData.country_code && detectUkFromText(formData.location) ? (
                <p className="text-xs text-amber-600 mt-1">
                  {t('ministrySettingsManager', 'ukGiftAidHint', 'This location looks like the UK. Select “United Kingdom” to enable Gift Aid.')}
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  {t('ministrySettingsManager', 'countryRegionHint', 'Used for region-specific features (e.g. UK Gift Aid).')}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label>{t('ministrySettingsManager', 'description', 'Description')}</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          <div>
            <Label>{t('ministrySettingsManager', 'welcomeMessage', 'Welcome Message')}</Label>
            <Textarea
              value={formData.welcome_message}
              onChange={(e) => setFormData({ ...formData, welcome_message: e.target.value })}
              placeholder={t('ministrySettingsManager', 'welcomeMessagePlaceholder', 'Message shown to new members...')}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('ministrySettingsManager', 'logo', 'Logo')}</Label>
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
                    {uploadingLogo ? t('ministrySettingsManager', 'uploading', 'Uploading…') : t('ministrySettingsManager', 'uploadFile', 'Upload file')}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                  </label>
                </div>
              </div>
            </div>
            <div>
              <Label>{t('ministrySettingsManager', 'banner', 'Banner')}</Label>
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
                  {uploadingBanner ? t('ministrySettingsManager', 'uploading', 'Uploading…') : t('ministrySettingsManager', 'uploadFile', 'Upload file')}
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
            {t('ministrySettingsManager', 'brandingColors', 'Branding & Colors')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t('ministrySettingsManager', 'themeColor', 'Theme Color')}</Label>
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
              <Label>{t('ministrySettingsManager', 'primaryColor', 'Primary Color')}</Label>
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
              <Label>{t('ministrySettingsManager', 'secondaryColor', 'Secondary Color')}</Label>
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
              <Label>{t('ministrySettingsManager', 'accentColor', 'Accent Color')}</Label>
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
            <Label>{t('ministrySettingsManager', 'customDomain', 'Custom Domain (White Label)')}</Label>
            <Input
              value={formData.white_label_domain}
              onChange={(e) => setFormData({ ...formData, white_label_domain: e.target.value })}
              placeholder="ministry.yourdomain.com"
            />
            <p className="text-xs text-gray-500 mt-1">{t('ministrySettingsManager', 'customDomainHint', 'Contact support to configure custom domains')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Social Links */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5 text-purple-600" />
            {t('ministrySettingsManager', 'socialLinks', 'Social Links')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('ministrySettingsManager', 'website', 'Website')}</Label>
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
            {t('ministrySettingsManager', 'privacyAccess', 'Privacy & Access')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <Label>{t('ministrySettingsManager', 'publicMinistry', 'Public Ministry')}</Label>
              <p className="text-xs text-gray-500">{t('ministrySettingsManager', 'publicMinistryHint', 'Anyone can discover this ministry')}</p>
            </div>
            <Switch
              checked={formData.is_public}
              onCheckedChange={(v) => setFormData({ ...formData, is_public: v })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <Label>{t('ministrySettingsManager', 'allowOpenJoining', 'Allow Open Joining')}</Label>
              <p className="text-xs text-gray-500">{t('ministrySettingsManager', 'allowOpenJoiningHint', 'Members can join without approval')}</p>
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
              <Label>{t('ministrySettingsManager', 'requireApproval', 'Require Approval')}</Label>
              <p className="text-xs text-gray-500">{t('ministrySettingsManager', 'requireApprovalHint', 'New members need admin approval')}</p>
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
              <Label>{t('ministrySettingsManager', 'enableDonations', 'Enable Donations')}</Label>
              <p className="text-xs text-gray-500">{t('ministrySettingsManager', 'enableDonationsHint', 'Allow members to donate')}</p>
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
              <Label>{t('ministrySettingsManager', 'enableEvents', 'Enable Events')}</Label>
              <p className="text-xs text-gray-500">{t('ministrySettingsManager', 'enableEventsHint', 'Show events section')}</p>
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

      {/* Member Registration (QR / kiosk / approval) */}
      <MinistryRegistrationSettings ministry={ministry} onUpdate={onUpdate} />

      {formData.country_code === 'GB' && (
        <MinistryGiftAidSettings ministryId={ministry.id} countryCode={formData.country_code} />
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          {t('ministrySettingsManager', 'saveSettings', 'Save Settings')}
        </Button>
      </div>
    </div>
  );
};
export default MinistrySettingsManager;