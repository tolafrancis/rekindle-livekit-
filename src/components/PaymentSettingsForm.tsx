// components/admin/PaymentSettingsForm.tsx
// Admin interface for managing payment gateway settings

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { PaymentSettings } from '@/types/payment';

interface PaymentSettingsFormProps {
  ministryId: string;
  onSuccess?: () => void;
}

export function PaymentSettingsForm({ ministryId, onSuccess }: PaymentSettingsFormProps) {
  const [settings, setSettings] = useState<Partial<PaymentSettings>>({
    ministry_id: ministryId,
    preferred_gateway: 'both',
    is_live_mode: false
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);

  // Load existing settings
  useEffect(() => {
    loadSettings();
  }, [ministryId]);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);

    try {
      // Use decrypted view if using encrypted schema
      const { data, error: fetchError } = await supabase
        .from('payment_settings') // or 'payment_settings_decrypted' for encrypted schema
        .select('*')
        .eq('ministry_id', ministryId)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          // No settings found - this is OK, we'll create new ones
          console.log('No existing payment settings found');
        } else {
          throw fetchError;
        }
      } else {
        setSettings(data);
      }
    } catch (err: any) {
      console.error('Error loading payment settings:', err);
      setError(err.message || 'Failed to load payment settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const { data: user } = await supabase.auth.getUser();
      
      if (!user.user) {
        throw new Error('Not authenticated');
      }

      // Check if settings exist
      const { data: existing } = await supabase
        .from('payment_settings')
        .select('id')
        .eq('ministry_id', ministryId)
        .single();

      if (existing) {
        // Update existing settings
        const { error: updateError } = await supabase
          .from('payment_settings')
          .update({
            stripe_publishable_key: settings.stripe_publishable_key,
            stripe_secret_key: settings.stripe_secret_key,
            stripe_connected_account_id: settings.stripe_connected_account_id,
            stripe_webhook_secret: settings.stripe_webhook_secret,
            paystack_public_key: settings.paystack_public_key,
            paystack_secret_key: settings.paystack_secret_key,
            preferred_gateway: settings.preferred_gateway,
            is_live_mode: settings.is_live_mode,
            updated_by: user.user.id
          })
          .eq('ministry_id', ministryId);

        if (updateError) throw updateError;
      } else {
        // Insert new settings
        const { error: insertError } = await supabase
          .from('payment_settings')
          .insert({
            ministry_id: ministryId,
            stripe_publishable_key: settings.stripe_publishable_key,
            stripe_secret_key: settings.stripe_secret_key,
            stripe_connected_account_id: settings.stripe_connected_account_id,
            stripe_webhook_secret: settings.stripe_webhook_secret,
            paystack_public_key: settings.paystack_public_key,
            paystack_secret_key: settings.paystack_secret_key,
            preferred_gateway: settings.preferred_gateway,
            is_live_mode: settings.is_live_mode,
            updated_by: user.user.id
          });

        if (insertError) throw insertError;
      }

      // Success
      onSuccess?.();
      alert('Payment settings saved successfully!');
    } catch (err: any) {
      console.error('Error saving payment settings:', err);
      setError(err.message || 'Failed to save payment settings');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof PaymentSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Payment Settings</h2>
          <p className="text-gray-600 mt-2">
            Configure payment gateways for your ministry
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Environment Toggle */}
          <div className="border-b pb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Environment</h3>
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!settings.is_live_mode}
                  onChange={() => handleInputChange('is_live_mode', false)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">Test Mode</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  checked={settings.is_live_mode}
                  onChange={() => handleInputChange('is_live_mode', true)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">Live Mode</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {settings.is_live_mode 
                ? '⚠️ Live mode will process real payments' 
                : 'Test mode for development and testing'}
            </p>
          </div>

          {/* Stripe Settings */}
          <div className="border-b pb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Stripe Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Publishable Key
                </label>
                <input
                  type="text"
                  value={settings.stripe_publishable_key || ''}
                  onChange={(e) => handleInputChange('stripe_publishable_key', e.target.value)}
                  placeholder="pk_test_..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Public key for client-side integration
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Secret Key
                </label>
                <div className="relative">
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={settings.stripe_secret_key || ''}
                    onChange={(e) => handleInputChange('stripe_secret_key', e.target.value)}
                    placeholder="sk_test_..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecrets(!showSecrets)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showSecrets ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                <p className="text-xs text-red-500 mt-1">
                  ⚠️ Keep this secret and never expose to client-side code
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Connected Account ID (Optional)
                </label>
                <input
                  type="text"
                  value={settings.stripe_connected_account_id || ''}
                  onChange={(e) => handleInputChange('stripe_connected_account_id', e.target.value)}
                  placeholder="acct_..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  For Stripe Connect platform payments
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Webhook Secret
                </label>
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={settings.stripe_webhook_secret || ''}
                  onChange={(e) => handleInputChange('stripe_webhook_secret', e.target.value)}
                  placeholder="whsec_..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  For webhook signature verification
                </p>
              </div>
            </div>
          </div>

          {/* Paystack Settings */}
          <div className="border-b pb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Paystack Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Public Key
                </label>
                <input
                  type="text"
                  value={settings.paystack_public_key || ''}
                  onChange={(e) => handleInputChange('paystack_public_key', e.target.value)}
                  placeholder="pk_test_..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Public key for client-side integration
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Secret Key
                </label>
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={settings.paystack_secret_key || ''}
                  onChange={(e) => handleInputChange('paystack_secret_key', e.target.value)}
                  placeholder="sk_test_..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-red-500 mt-1">
                  ⚠️ Keep this secret and never expose to client-side code
                </p>
              </div>
            </div>
          </div>

          {/* Preferred Gateway */}
          <div className="border-b pb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Preferred Gateway</h3>
            <div className="space-y-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  value="stripe"
                  checked={settings.preferred_gateway === 'stripe'}
                  onChange={(e) => handleInputChange('preferred_gateway', e.target.value)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">Stripe Only</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  value="paystack"
                  checked={settings.preferred_gateway === 'paystack'}
                  onChange={(e) => handleInputChange('preferred_gateway', e.target.value)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">Paystack Only</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  value="both"
                  checked={settings.preferred_gateway === 'both'}
                  onChange={(e) => handleInputChange('preferred_gateway', e.target.value)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">Both Gateways</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              When 'Both' is selected, users can choose their preferred payment method
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-6">
            <button
              type="button"
              onClick={() => setShowSecrets(!showSecrets)}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              {showSecrets ? 'Hide' : 'Show'} Secret Keys
            </button>
            
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={loadSettings}
                disabled={saving}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {saving && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                )}
                <span>{saving ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Security Notice */}
        <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 className="text-sm font-semibold text-yellow-900 mb-2">🔒 Security Notice</h4>
          <ul className="text-xs text-yellow-800 space-y-1">
            <li>• Never share your secret keys or webhook secrets</li>
            <li>• Always use test keys during development</li>
            <li>• Rotate keys regularly (every 6 months recommended)</li>
            <li>• Monitor failed payment attempts in your gateway dashboard</li>
            <li>• Enable webhook signature verification in production</li>
          </ul>
        </div>

        {/* Test Connection Button */}
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={async () => {
              try {
                // You can implement a test connection function here
                alert('Connection test feature coming soon!');
              } catch (err) {
                alert('Connection test failed');
              }
            }}
            className="text-sm text-blue-600 hover:text-blue-700 underline"
          >
            Test Connection to Payment Gateways
          </button>
        </div>
      </div>
    </div>
  );
}