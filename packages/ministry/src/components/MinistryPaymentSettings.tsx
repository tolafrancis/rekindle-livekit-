import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Textarea } from '@rekindle/ui/textarea';
import { Switch } from '@rekindle/ui/switch';
import { RadioGroup, RadioGroupItem } from '@rekindle/ui/radio-group';
import { Badge } from '@rekindle/ui/badge';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useLanguage } from '@rekindle/features/LanguageContext';
import {
  CreditCard, Globe, ExternalLink, Loader2, Save, Eye, EyeOff,
  CheckCircle, AlertCircle, Settings, Link2, DollarSign, Info, Shield
} from 'lucide-react';

interface MinistryPaymentSettingsProps {
  ministryId: string;
  onSave?: () => void;
}

interface PaymentSettings {
  id?: string;
  ministry_id: string;
  payment_mode: 'platform' | 'custom' | 'external';
  stripe_account_id: string;
  stripe_publishable_key: string;
  paystack_public_key: string;
  paystack_secret_key_encrypted: string;
  external_payment_url: string;
  external_payment_name: string;
  default_currency: 'USD' | 'NGN' | 'GBP';
  supported_currencies: string[];
  donation_page_title: string;
  donation_page_description: string;
  thank_you_message: string;
  show_suggested_amounts: boolean;
  suggested_amounts_usd: number[];
  suggested_amounts_ngn: number[];
  is_active: boolean;
}

const defaultSettings: PaymentSettings = {
  ministry_id: '',
  payment_mode: 'platform',
  stripe_account_id: '',
  stripe_publishable_key: '',
  paystack_public_key: '',
  paystack_secret_key_encrypted: '',
  external_payment_url: '',
  external_payment_name: '',
  default_currency: 'USD',
  supported_currencies: ['USD', 'GBP', 'NGN'],
  donation_page_title: '',
  donation_page_description: '',
  thank_you_message: 'Thank you for your generous donation! May God bless you abundantly.',
  show_suggested_amounts: true,
  suggested_amounts_usd: [500, 1000, 2500, 5000, 10000],
  suggested_amounts_ngn: [500000, 1000000, 2500000, 5000000, 10000000],
  is_active: true
};

export const MinistryPaymentSettings: React.FC<MinistryPaymentSettingsProps> = ({
  ministryId,
  onSave
}) => {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<PaymentSettings>({ ...defaultSettings, ministry_id: ministryId });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [ministryId]);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_payment_settings')
        .select('*')
        .eq('ministry_id', ministryId)
        .single();

      if (data && !error) {
        setSettings({
          ...defaultSettings,
          ...data,
          supported_currencies: data.supported_currencies || ['USD', 'NGN'],
          suggested_amounts_usd: data.suggested_amounts_usd || defaultSettings.suggested_amounts_usd,
          suggested_amounts_ngn: data.suggested_amounts_ngn || defaultSettings.suggested_amounts_ngn
        });
      }
    } catch (err) {
      console.error('Error loading payment settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const dataToSave = {
        ministry_id: ministryId,
        payment_mode: settings.payment_mode,
        stripe_account_id: settings.stripe_account_id || null,
        stripe_publishable_key: settings.stripe_publishable_key || null,
        paystack_public_key: settings.paystack_public_key || null,
        paystack_secret_key_encrypted: settings.paystack_secret_key_encrypted || null,
        external_payment_url: settings.external_payment_url || null,
        external_payment_name: settings.external_payment_name || null,
        default_currency: settings.default_currency,
        supported_currencies: settings.supported_currencies,
        donation_page_title: settings.donation_page_title || null,
        donation_page_description: settings.donation_page_description || null,
        thank_you_message: settings.thank_you_message || null,
        show_suggested_amounts: settings.show_suggested_amounts,
        suggested_amounts_usd: settings.suggested_amounts_usd,
        suggested_amounts_ngn: settings.suggested_amounts_ngn,
        is_active: settings.is_active,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('ministry_payment_settings')
        .upsert(dataToSave, { onConflict: 'ministry_id' });

      if (error) throw error;

      toast({
        title: t('ministryPaymentSettings', 'settingsSavedTitle', 'Settings Saved'),
        description: t('ministryPaymentSettings', 'settingsSavedDesc', 'Your payment settings have been updated successfully.')
      });

      onSave?.();
    } catch (err: any) {
      console.error('Error saving payment settings:', err);
      toast({
        title: t('ministryPaymentSettings', 'errorTitle', 'Error'),
        description: err.message || t('ministryPaymentSettings', 'saveFailed', 'Failed to save settings'),
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCurrencyToggle = (currency: string) => {
    const currencies = settings.supported_currencies.includes(currency)
      ? settings.supported_currencies.filter(c => c !== currency)
      : [...settings.supported_currencies, currency];
    
    // Ensure at least one currency is selected
    if (currencies.length > 0) {
      setSettings({ ...settings, supported_currencies: currencies });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Payment Mode Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-purple-600" />
            {t('ministryPaymentSettings', 'paymentConfiguration', 'Payment Configuration')}
          </CardTitle>
          <CardDescription>
            {t('ministryPaymentSettings', 'paymentConfigurationDesc', 'Choose how your ministry will receive donations')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={settings.payment_mode}
            onValueChange={(value: 'platform' | 'custom' | 'external') => 
              setSettings({ ...settings, payment_mode: value })
            }
            className="space-y-4"
          >
            {/* Platform Payments */}
            <div className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors ${
              settings.payment_mode === 'platform' ? 'border-purple-500 bg-purple-50' : 'border-gray-200'
            }`}>
              <RadioGroupItem value="platform" id="platform" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="platform" className="text-base font-semibold cursor-pointer">
                  {t('ministryPaymentSettings', 'usePlatformGateway', 'Use Platform Payment Gateway')}
                </Label>
                <p className="text-sm text-gray-600 mt-1">
                  {t('ministryPaymentSettings', 'usePlatformGatewayDesc', "Donations are processed through the app's payment system. Simple setup with no additional configuration required.")}
                </p>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    <CreditCard className="h-3 w-3 mr-1" />
                    Stripe
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Globe className="h-3 w-3 mr-1" />
                    Paystack
                  </Badge>
                </div>
              </div>
            </div>

            {/* Custom Payment Provider */}
            <div className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors ${
              settings.payment_mode === 'custom' ? 'border-purple-500 bg-purple-50' : 'border-gray-200'
            }`}>
              <RadioGroupItem value="custom" id="custom" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="custom" className="text-base font-semibold cursor-pointer">
                  {t('ministryPaymentSettings', 'useOwnProvider', 'Use Your Own Payment Provider')}
                </Label>
                <p className="text-sm text-gray-600 mt-1">
                  {t('ministryPaymentSettings', 'useOwnProviderDesc', "Connect your ministry's own Stripe or Paystack account. Donations go directly to your account.")}
                </p>
                <Badge variant="secondary" className="text-xs mt-2">
                  <Shield className="h-3 w-3 mr-1" />
                  {t('ministryPaymentSettings', 'fullControlFunds', 'Full control over funds')}
                </Badge>
              </div>
            </div>

            {/* External Payment Link */}
            <div className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors ${
              settings.payment_mode === 'external' ? 'border-purple-500 bg-purple-50' : 'border-gray-200'
            }`}>
              <RadioGroupItem value="external" id="external" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="external" className="text-base font-semibold cursor-pointer">
                  {t('ministryPaymentSettings', 'externalPaymentLink', 'External Payment Link')}
                </Label>
                <p className="text-sm text-gray-600 mt-1">
                  {t('ministryPaymentSettings', 'externalPaymentLinkDesc', 'Redirect donors to an external payment page (PayPal, GoFundMe, church giving platform, etc.)')}
                </p>
                <Badge variant="secondary" className="text-xs mt-2">
                  <Link2 className="h-3 w-3 mr-1" />
                  {t('ministryPaymentSettings', 'anyPaymentProvider', 'Any payment provider')}
                </Badge>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Custom Payment Provider Settings */}
      {settings.payment_mode === 'custom' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('ministryPaymentSettings', 'customProviderKeys', 'Custom Payment Provider Keys')}</CardTitle>
            <CardDescription>
              {t('ministryPaymentSettings', 'customProviderKeysDesc', 'Enter your own payment provider API keys')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {t('ministryPaymentSettings', 'secretKeysEncrypted', 'Your secret keys are encrypted and stored securely. Never share these keys publicly.')}
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div>
                <Label>{t('ministryPaymentSettings', 'paystackPublicKey', 'Paystack Public Key')}</Label>
                <Input
                  value={settings.paystack_public_key}
                  onChange={(e) => setSettings({ ...settings, paystack_public_key: e.target.value })}
                  placeholder="pk_live_... or pk_test_..."
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <Label>{t('ministryPaymentSettings', 'paystackSecretKey', 'Paystack Secret Key')}</Label>
                <div className="relative">
                  <Input
                    type={showSecrets ? 'text' : 'password'}
                    value={settings.paystack_secret_key_encrypted}
                    onChange={(e) => setSettings({ ...settings, paystack_secret_key_encrypted: e.target.value })}
                    placeholder="sk_live_... or sk_test_..."
                    className="font-mono text-sm pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                    onClick={() => setShowSecrets(!showSecrets)}
                  >
                    {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-red-500 mt-1">
                  {t('ministryPaymentSettings', 'keepKeySecure', 'Keep this key secure. It will be encrypted before storage.')}
                </p>
              </div>

              <div className="border-t pt-4 mt-4">
                <Label>{t('ministryPaymentSettings', 'stripeAccountId', 'Stripe Account ID (Optional)')}</Label>
                <Input
                  value={settings.stripe_account_id}
                  onChange={(e) => setSettings({ ...settings, stripe_account_id: e.target.value })}
                  placeholder="acct_..."
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('ministryPaymentSettings', 'forStripeConnect', 'For Stripe Connect accounts')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* External Payment Link Settings */}
      {settings.payment_mode === 'external' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('ministryPaymentSettings', 'externalPaymentLink', 'External Payment Link')}</CardTitle>
            <CardDescription>
              {t('ministryPaymentSettings', 'externalPageDesc', 'Configure your external donation page')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{t('ministryPaymentSettings', 'paymentLinkName', 'Payment Link Name')}</Label>
              <Input
                value={settings.external_payment_name}
                onChange={(e) => setSettings({ ...settings, external_payment_name: e.target.value })}
                placeholder={t('ministryPaymentSettings', 'paymentLinkNamePlaceholder', 'e.g., PayPal, GoFundMe, Tithe.ly')}
              />
            </div>

            <div>
              <Label>{t('ministryPaymentSettings', 'paymentUrl', 'Payment URL')}</Label>
              <Input
                type="url"
                value={settings.external_payment_url}
                onChange={(e) => setSettings({ ...settings, external_payment_url: e.target.value })}
                placeholder="https://..."
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('ministryPaymentSettings', 'donorsRedirected', 'Donors will be redirected to this URL when they click "Donate"')}
              </p>
            </div>

            {settings.external_payment_url && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-2">{t('ministryPaymentSettings', 'preview', 'Preview:')}</p>
                <Button variant="outline" size="sm" asChild>
                  <a href={settings.external_payment_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {t('ministryPaymentSettings', 'donateVia', 'Donate via {name}').replace('{name}', String(settings.external_payment_name || t('ministryPaymentSettings', 'externalLink', 'External Link')))}
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Currency Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            {t('ministryPaymentSettings', 'currencySettings', 'Currency Settings')}
          </CardTitle>
          <CardDescription>
            {t('ministryPaymentSettings', 'currencySettingsDesc', 'Configure which currencies donors can use')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-3 block">{t('ministryPaymentSettings', 'supportedCurrencies', 'Supported Currencies')}</Label>
            <div className="flex gap-3">
              <Button
                variant={settings.supported_currencies.includes('USD') ? 'default' : 'outline'}
                onClick={() => handleCurrencyToggle('USD')}
                className={settings.supported_currencies.includes('USD') ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                <DollarSign className="h-4 w-4 mr-1" />
                {t('ministryPaymentSettings', 'usdLabel', 'USD (US Dollar)')}
              </Button>
              <Button
                variant={settings.supported_currencies.includes('GBP') ? 'default' : 'outline'}
                onClick={() => handleCurrencyToggle('GBP')}
                className={settings.supported_currencies.includes('GBP') ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                {t('ministryPaymentSettings', 'gbpLabel', '£ GBP (Pound)')}
              </Button>
              <Button
                variant={settings.supported_currencies.includes('NGN') ? 'default' : 'outline'}
                onClick={() => handleCurrencyToggle('NGN')}
                className={settings.supported_currencies.includes('NGN') ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                {t('ministryPaymentSettings', 'ngnLabel', '₦ NGN (Naira)')}
              </Button>
            </div>
          </div>

          <div>
            <Label>{t('ministryPaymentSettings', 'defaultCurrency', 'Default Currency')}</Label>
            <div className="flex gap-3 mt-2">
              <Button
                variant={settings.default_currency === 'USD' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSettings({ ...settings, default_currency: 'USD' })}
                disabled={!settings.supported_currencies.includes('USD')}
              >
                USD
              </Button>
              <Button
                variant={settings.default_currency === 'GBP' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSettings({ ...settings, default_currency: 'GBP' })}
                disabled={!settings.supported_currencies.includes('GBP')}
              >
                GBP
              </Button>
              <Button
                variant={settings.default_currency === 'NGN' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSettings({ ...settings, default_currency: 'NGN' })}
                disabled={!settings.supported_currencies.includes('NGN')}
              >
                NGN
              </Button>
            </div>
          </div>

          {settings.show_suggested_amounts && (
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <Label>{t('ministryPaymentSettings', 'showSuggestedAmounts', 'Show Suggested Amounts')}</Label>
                <Switch
                  checked={settings.show_suggested_amounts}
                  onCheckedChange={(checked) => setSettings({ ...settings, show_suggested_amounts: checked })}
                />
              </div>

              {settings.supported_currencies.includes('USD') && (
                <div>
                  <Label className="text-sm text-gray-600">{t('ministryPaymentSettings', 'suggestedUsdAmounts', 'Suggested USD Amounts (in cents)')}</Label>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {settings.suggested_amounts_usd.map((amt, idx) => (
                      <Badge key={idx} variant="outline">${(amt / 100).toFixed(0)}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {settings.supported_currencies.includes('NGN') && (
                <div>
                  <Label className="text-sm text-gray-600">{t('ministryPaymentSettings', 'suggestedNgnAmounts', 'Suggested NGN Amounts (in kobo)')}</Label>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {settings.suggested_amounts_ngn.map((amt, idx) => (
                      <Badge key={idx} variant="outline">₦{(amt / 100).toLocaleString()}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Donation Page Customization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('ministryPaymentSettings', 'donationPageCustomization', 'Donation Page Customization')}</CardTitle>
          <CardDescription>
            {t('ministryPaymentSettings', 'donationPageCustomizationDesc', 'Customize the donation experience for your donors')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t('ministryPaymentSettings', 'pageTitle', 'Page Title (Optional)')}</Label>
            <Input
              value={settings.donation_page_title}
              onChange={(e) => setSettings({ ...settings, donation_page_title: e.target.value })}
              placeholder={t('ministryPaymentSettings', 'pageTitlePlaceholder', 'e.g., Support Our Ministry')}
            />
          </div>

          <div>
            <Label>{t('ministryPaymentSettings', 'descriptionOptional', 'Description (Optional)')}</Label>
            <Textarea
              value={settings.donation_page_description}
              onChange={(e) => setSettings({ ...settings, donation_page_description: e.target.value })}
              placeholder={t('ministryPaymentSettings', 'descriptionPlaceholder', 'Tell donors how their gift will be used...')}
              rows={3}
            />
          </div>

          <div>
            <Label>{t('ministryPaymentSettings', 'thankYouMessage', 'Thank You Message')}</Label>
            <Textarea
              value={settings.thank_you_message}
              onChange={(e) => setSettings({ ...settings, thank_you_message: e.target.value })}
              placeholder={t('ministryPaymentSettings', 'thankYouPlaceholder', 'Message shown after successful donation...')}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Status Toggle */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">{t('ministryPaymentSettings', 'enableDonations', 'Enable Donations')}</Label>
              <p className="text-sm text-gray-500">{t('ministryPaymentSettings', 'enableDonationsDesc', 'Allow donors to give to your ministry')}</p>
            </div>
            <Switch
              checked={settings.is_active}
              onCheckedChange={(checked) => setSettings({ ...settings, is_active: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('ministryPaymentSettings', 'saving', 'Saving...')}
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {t('ministryPaymentSettings', 'savePaymentSettings', 'Save Payment Settings')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default MinistryPaymentSettings;
