import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from './ui/use-toast';
import { 
  CreditCard, 
  Key, 
  Eye, 
  EyeOff, 
  Save, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Globe,
  Shield,
  ExternalLink,
  Copy,
  Info
} from 'lucide-react';

interface PaymentSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ministryId?: string;
}

interface PaymentSettings {
  stripe_publishable_key: string;
  stripe_secret_key: string;
  stripe_connected_account_id: string;
  stripe_webhook_secret: string;
  paystack_public_key: string;
  paystack_secret_key: string;
  preferred_gateway: 'stripe' | 'paystack' | 'both';
  is_live_mode: boolean;
}

const defaultSettings: PaymentSettings = {
  stripe_publishable_key: '',
  stripe_secret_key: '',
  stripe_connected_account_id: '',
  stripe_webhook_secret: '',
  paystack_public_key: '',
  paystack_secret_key: '',
  preferred_gateway: 'both',
  is_live_mode: false
};

export const PaymentSettingsDialog: React.FC<PaymentSettingsDialogProps> = ({
  open,
  onOpenChange,
  ministryId
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [settings, setSettings] = useState<PaymentSettings>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<'stripe' | 'paystack' | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState('stripe');
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | null>>({});

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open, ministryId]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_settings')
        .select('*')
        .eq('ministry_id', ministryId || 'platform')
        .maybeSingle();

      if (data && !error) {
        setSettings({
          stripe_publishable_key: data.stripe_publishable_key || '',
          stripe_secret_key: data.stripe_secret_key || '',
          stripe_connected_account_id: data.stripe_connected_account_id || '',
          stripe_webhook_secret: data.stripe_webhook_secret || '',
          paystack_public_key: data.paystack_public_key || '',
          paystack_secret_key: data.paystack_secret_key || '',
          preferred_gateway: data.preferred_gateway || 'both',
          is_live_mode: data.is_live_mode || false
        });
      }
    } catch (err) {
      console.error('Error loading payment settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const settingsData = {
        ministry_id: ministryId || 'platform',
        stripe_publishable_key: settings.stripe_publishable_key,
        stripe_secret_key: settings.stripe_secret_key,
        stripe_connected_account_id: settings.stripe_connected_account_id,
        stripe_webhook_secret: settings.stripe_webhook_secret,
        paystack_public_key: settings.paystack_public_key,
        paystack_secret_key: settings.paystack_secret_key,
        preferred_gateway: settings.preferred_gateway,
        is_live_mode: settings.is_live_mode,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('payment_settings')
        .upsert(settingsData, {
          onConflict: 'ministry_id'
        });

      if (error) throw error;

      // Try to update secrets via edge function (optional)
      if (settings.stripe_secret_key || settings.paystack_secret_key) {
        try {
          await supabase.functions.invoke('update-payment-secrets', {
            body: {
              ministryId: ministryId || 'platform',
              stripeSecretKey: settings.stripe_secret_key,
              paystackSecretKey: settings.paystack_secret_key,
              stripeWebhookSecret: settings.stripe_webhook_secret
            }
          });
        } catch (secretError) {
          console.warn('Could not update secrets via edge function:', secretError);
        }
      }

      toast({
        title: t('paymentSettingsDialog', 'settingsSavedTitle', 'Settings Saved'),
        description: t('paymentSettingsDialog', 'settingsSavedDesc', 'Your payment gateway settings have been updated successfully.')
      });

      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving payment settings:', err);
      toast({
        title: t('paymentSettingsDialog', 'errorTitle', 'Error'),
        description: err.message || t('paymentSettingsDialog', 'saveFailedDesc', 'Failed to save settings. Please try again.'),
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const testStripeConnection = async () => {
    if (!settings.stripe_publishable_key) {
      toast({
        title: t('paymentSettingsDialog', 'missingKeyTitle', 'Missing Key'),
        description: t('paymentSettingsDialog', 'missingStripeKeyDesc', 'Please enter your Stripe publishable key first.'),
        variant: 'destructive'
      });
      return;
    }

    setTesting('stripe');
    try {
      const { loadStripe } = await import('@stripe/stripe-js');
      const stripe = await loadStripe(settings.stripe_publishable_key, {
        stripeAccount: settings.stripe_connected_account_id || undefined
      });

      if (stripe) {
        setTestResults(prev => ({ ...prev, stripe: 'success' }));
        toast({
          title: t('paymentSettingsDialog', 'connectionSuccessfulTitle', 'Connection Successful'),
          description: t('paymentSettingsDialog', 'stripeConfiguredDesc', 'Stripe is configured correctly.')
        });
      } else {
        throw new Error('Failed to initialize Stripe');
      }
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, stripe: 'error' }));
      toast({
        title: t('paymentSettingsDialog', 'connectionFailedTitle', 'Connection Failed'),
        description: t('paymentSettingsDialog', 'stripeInvalidDesc', 'Invalid Stripe key or configuration.'),
        variant: 'destructive'
      });
    } finally {
      setTesting(null);
    }
  };

  const testPaystackConnection = async () => {
    if (!settings.paystack_public_key) {
      toast({
        title: t('paymentSettingsDialog', 'missingKeyTitle', 'Missing Key'),
        description: t('paymentSettingsDialog', 'missingPaystackKeyDesc', 'Please enter your Paystack public key first.'),
        variant: 'destructive'
      });
      return;
    }

    setTesting('paystack');
    try {
      const response = await fetch('https://api.paystack.co/bank', {
        headers: {
          'Authorization': `Bearer ${settings.paystack_secret_key || settings.paystack_public_key}`
        }
      });

      if (response.ok) {
        setTestResults(prev => ({ ...prev, paystack: 'success' }));
        toast({
          title: t('paymentSettingsDialog', 'connectionSuccessfulTitle', 'Connection Successful'),
          description: t('paymentSettingsDialog', 'paystackConfiguredDesc', 'Paystack is configured correctly.')
        });
      } else {
        throw new Error('Invalid Paystack credentials');
      }
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, paystack: 'error' }));
      toast({
        title: t('paymentSettingsDialog', 'connectionFailedTitle', 'Connection Failed'),
        description: t('paymentSettingsDialog', 'paystackInvalidDesc', 'Invalid Paystack key or configuration.'),
        variant: 'destructive'
      });
    } finally {
      setTesting(null);
    }
  };

  const toggleShowSecret = (field: string) => {
    setShowSecrets(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('paymentSettingsDialog', 'copiedTitle', 'Copied'),
      description: t('paymentSettingsDialog', 'copiedToClipboardDesc', '{label} copied to clipboard.').replace('{label}', String(label))
    });
  };

  const renderSecretInput = (
    field: keyof PaymentSettings,
    label: string,
    placeholder: string,
    helpText?: string
  ) => (
    <div className="space-y-2">
      <Label htmlFor={field} className="flex items-center gap-2">
        <Key className="h-4 w-4 text-gray-500" />
        {label}
      </Label>
      <div className="relative">
        <Input
          id={field}
          type={showSecrets[field] ? 'text' : 'password'}
          value={settings[field] as string}
          onChange={(e) => setSettings(prev => ({ ...prev, [field]: e.target.value }))}
          placeholder={placeholder}
          className="pr-20 font-mono text-sm"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => toggleShowSecret(field)}
          >
            {showSecrets[field] ? (
              <EyeOff className="h-4 w-4 text-gray-500" />
            ) : (
              <Eye className="h-4 w-4 text-gray-500" />
            )}
          </Button>
          {settings[field] && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => copyToClipboard(settings[field] as string, label)}
            >
              <Copy className="h-4 w-4 text-gray-500" />
            </Button>
          )}
        </div>
      </div>
      {helpText && (
        <p className="text-xs text-gray-500">{helpText}</p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-purple-600" />
            {t('paymentSettingsDialog', 'dialogTitle', 'Payment Gateway Settings')}
          </DialogTitle>
          <DialogDescription>
            {t('paymentSettingsDialog', 'dialogDescription', 'Configure your Stripe and Paystack API keys to accept payments.')}
            {ministryId && (
              <Badge variant="outline" className="ml-2">{t('paymentSettingsDialog', 'ministrySettingsBadge', 'Ministry Settings')}</Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Mode Toggle */}
            <Card className={settings.is_live_mode ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className={`h-5 w-5 ${settings.is_live_mode ? 'text-green-600' : 'text-yellow-600'}`} />
                    <div>
                      <p className="font-medium">
                        {settings.is_live_mode
                          ? t('paymentSettingsDialog', 'liveMode', 'Live Mode')
                          : t('paymentSettingsDialog', 'testMode', 'Test Mode')}
                      </p>
                      <p className="text-sm text-gray-600">
                        {settings.is_live_mode
                          ? t('paymentSettingsDialog', 'liveModeDesc', 'Real payments will be processed')
                          : t('paymentSettingsDialog', 'testModeDesc', 'Use test keys for development')}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSettings(prev => ({ ...prev, is_live_mode: !prev.is_live_mode }))}
                  >
                    {settings.is_live_mode
                      ? t('paymentSettingsDialog', 'switchToTestMode', 'Switch to Test Mode')
                      : t('paymentSettingsDialog', 'switchToLiveMode', 'Switch to Live Mode')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="stripe" className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Stripe
                  {testResults.stripe === 'success' && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  {testResults.stripe === 'error' && (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="paystack" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Paystack
                  {testResults.paystack === 'success' && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  {testResults.paystack === 'error' && (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="stripe" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between">
                      {t('paymentSettingsDialog', 'stripeConfiguration', 'Stripe Configuration')}
                      <a
                        href="https://dashboard.stripe.com/apikeys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1 font-normal"
                      >
                        {t('paymentSettingsDialog', 'getApiKeys', 'Get API Keys')}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </CardTitle>
                    <CardDescription>
                      {t('paymentSettingsDialog', 'stripeConfigDesc', 'Enter your Stripe API keys to accept card payments worldwide.')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {renderSecretInput(
                      'stripe_publishable_key',
                      t('paymentSettingsDialog', 'publishableKeyLabel', 'Publishable Key'),
                      settings.is_live_mode ? 'pk_live_...' : 'pk_test_...',
                      t('paymentSettingsDialog', 'publishableKeyHelp', 'This key is safe to expose in your frontend code.')
                    )}

                    {renderSecretInput(
                      'stripe_secret_key',
                      t('paymentSettingsDialog', 'secretKeyLabel', 'Secret Key'),
                      settings.is_live_mode ? 'sk_live_...' : 'sk_test_...',
                      t('paymentSettingsDialog', 'secretKeyHelp', 'Keep this key secure. Never expose it in frontend code.')
                    )}

                    {renderSecretInput(
                      'stripe_connected_account_id',
                      t('paymentSettingsDialog', 'connectedAccountIdLabel', 'Connected Account ID (Optional)'),
                      'acct_...',
                      t('paymentSettingsDialog', 'connectedAccountIdHelp', 'Required if using Stripe Connect for marketplace payments.')
                    )}

                    {renderSecretInput(
                      'stripe_webhook_secret',
                      t('paymentSettingsDialog', 'webhookSecretLabel', 'Webhook Secret (Optional)'),
                      'whsec_...',
                      t('paymentSettingsDialog', 'webhookSecretHelp', 'Required for handling webhook events like subscription updates.')
                    )}

                    <div className="pt-2">
                      <Button
                        variant="outline"
                        onClick={testStripeConnection}
                        disabled={testing === 'stripe' || !settings.stripe_publishable_key}
                        className="w-full"
                      >
                        {testing === 'stripe' ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {t('paymentSettingsDialog', 'testingConnection', 'Testing Connection...')}
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {t('paymentSettingsDialog', 'testStripeConnection', 'Test Stripe Connection')}
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{t('paymentSettingsDialog', 'webhookUrlLabel', 'Webhook URL:')}</strong> {t('paymentSettingsDialog', 'stripeWebhookPointTo', 'Configure your Stripe webhook to point to:')}
                    <code className="block mt-1 p-2 bg-gray-100 rounded text-xs break-all">
                      {window.location.origin}/api/webhooks/stripe
                    </code>
                  </AlertDescription>
                </Alert>
              </TabsContent>

              <TabsContent value="paystack" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between">
                      {t('paymentSettingsDialog', 'paystackConfiguration', 'Paystack Configuration')}
                      <a
                        href="https://dashboard.paystack.com/#/settings/developers"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1 font-normal"
                      >
                        {t('paymentSettingsDialog', 'getApiKeys', 'Get API Keys')}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </CardTitle>
                    <CardDescription>
                      {t('paymentSettingsDialog', 'paystackConfigDesc', 'Enter your Paystack API keys to accept payments in Africa (NGN, GHS, ZAR).')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {renderSecretInput(
                      'paystack_public_key',
                      t('paymentSettingsDialog', 'publicKeyLabel', 'Public Key'),
                      settings.is_live_mode ? 'pk_live_...' : 'pk_test_...',
                      t('paymentSettingsDialog', 'publishableKeyHelp', 'This key is safe to expose in your frontend code.')
                    )}

                    {renderSecretInput(
                      'paystack_secret_key',
                      t('paymentSettingsDialog', 'secretKeyLabel', 'Secret Key'),
                      settings.is_live_mode ? 'sk_live_...' : 'sk_test_...',
                      t('paymentSettingsDialog', 'secretKeyHelp', 'Keep this key secure. Never expose it in frontend code.')
                    )}

                    <div className="pt-2">
                      <Button
                        variant="outline"
                        onClick={testPaystackConnection}
                        disabled={testing === 'paystack' || !settings.paystack_public_key}
                        className="w-full"
                      >
                        {testing === 'paystack' ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {t('paymentSettingsDialog', 'testingConnection', 'Testing Connection...')}
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {t('paymentSettingsDialog', 'testPaystackConnection', 'Test Paystack Connection')}
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{t('paymentSettingsDialog', 'webhookUrlLabel', 'Webhook URL:')}</strong> {t('paymentSettingsDialog', 'paystackWebhookPointTo', 'Configure your Paystack webhook to point to:')}
                    <code className="block mt-1 p-2 bg-gray-100 rounded text-xs break-all">
                      {window.location.origin}/api/webhooks/paystack
                    </code>
                  </AlertDescription>
                </Alert>
              </TabsContent>
            </Tabs>

            {/* Preferred Gateway */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{t('paymentSettingsDialog', 'defaultPaymentGateway', 'Default Payment Gateway')}</CardTitle>
                <CardDescription>
                  {t('paymentSettingsDialog', 'defaultGatewayDesc', 'Choose which payment gateway to show first to users.')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {(['stripe', 'paystack', 'both'] as const).map((gateway) => (
                    <Button
                      key={gateway}
                      variant={settings.preferred_gateway === gateway ? 'default' : 'outline'}
                      onClick={() => setSettings(prev => ({ ...prev, preferred_gateway: gateway }))}
                      className="h-auto py-3"
                    >
                      <div className="text-center">
                        {gateway === 'stripe' && <CreditCard className="h-5 w-5 mx-auto mb-1" />}
                        {gateway === 'paystack' && <Globe className="h-5 w-5 mx-auto mb-1" />}
                        {gateway === 'both' && (
                          <div className="flex justify-center gap-1 mb-1">
                            <CreditCard className="h-4 w-4" />
                            <Globe className="h-4 w-4" />
                          </div>
                        )}
                        <span className="text-sm capitalize">{gateway}</span>
                      </div>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('paymentSettingsDialog', 'cancel', 'Cancel')}
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('paymentSettingsDialog', 'saving', 'Saving...')}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {t('paymentSettingsDialog', 'saveSettings', 'Save Settings')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentSettingsDialog;
