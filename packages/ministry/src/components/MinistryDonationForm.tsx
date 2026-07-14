import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Label } from '@rekindle/ui/label';
import { Checkbox } from '@rekindle/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { toast } from '@rekindle/ui/use-toast';
import { 
  Heart, CreditCard, Globe, Loader2, Gift, 
  CheckCircle, DollarSign, Sparkles, ExternalLink
} from 'lucide-react';
import {
  GiftAidDeclarationFields,
  emptyGiftAidState,
  isGiftAidDeclarationComplete,
  type GiftAidFormState,
} from './GiftAidDeclarationFields';
import {
  loadGiftAidSettings,
  loadDonorGiftAidStatus,
  submitGiftAidDeclaration,
  type GiftAidPublicSettings,
} from '../giftAid';

// Initialize Stripe with the connected account
const stripePromise = loadStripe('pk_live_51OJhJBHdGQpsHqInIzu7c6PzGPSH0yImD4xfpofvxvFZs0VFhPRXZCyEgYkkhOtBOXFWvssYASs851mflwQvjnrl00T6DbUwWZ', {
  stripeAccount: 'acct_1ShQgqHaTSTkefai'
});

interface StripeDonationFormProps {
  amount: number;
  currency: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const StripeDonationForm: React.FC<StripeDonationFormProps> = ({ amount, currency, onSuccess, onCancel }) => {
  const { t } = useLanguage();
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    
    setLoading(true);
    setError(null);

    try {
      const { error: paymentError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { 
          return_url: window.location.origin + '?donation=success' 
        },
        redirect: 'if_required',
      });

      if (paymentError) {
        setError(paymentError.message || 'Payment failed');
        setLoading(false);
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        toast({
          title: t('ministryDonationForm', 'thankYou', 'Thank You!'),
          description: t('ministryDonationForm', 'donationReceived', 'Your donation has been received!')
        });
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getCurrencySymbol = (curr: string) => {
    return curr === 'NGN' ? '₦' : curr === 'GBP' ? '£' : '$';
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}
      
      <div className="flex gap-3">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel} 
          className="flex-1"
          disabled={loading}
        >
          {t('ministryDonationForm', 'cancel', 'Cancel')}
        </Button>
        <Button 
          type="submit" 
          disabled={!stripe || loading} 
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('ministryDonationForm', 'processing', 'Processing...')}
            </>
          ) : (
            <>
              <Heart className="h-4 w-4 mr-2" />
              {t('ministryDonationForm', 'donate', 'Donate')} {getCurrencySymbol(currency)}{(amount / 100).toLocaleString()}
            </>
          )}
        </Button>
      </div>
    </form>
  );
};

interface MinistryDonationFormProps {
  ministryId: string;
  ministryName: string;
  themeColor?: string;
  onComplete?: () => void;
}

interface PaymentSettings {
  payment_mode: 'platform' | 'custom' | 'external';
  external_payment_url?: string;
  external_payment_name?: string;
  default_currency: 'USD' | 'NGN' | 'GBP';
  supported_currencies: string[];
  donation_page_title?: string;
  donation_page_description?: string;
  thank_you_message?: string;
  show_suggested_amounts: boolean;
  suggested_amounts_usd: number[];
  suggested_amounts_ngn: number[];
  is_active: boolean;
}

export const MinistryDonationForm: React.FC<MinistryDonationFormProps> = ({ 
  ministryId, 
  ministryName,
  themeColor = '#7c3aed',
  onComplete
}) => {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'NGN' | 'GBP'>('USD');
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paystack'>('paystack');
  const [loading, setLoading] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Gift Aid (UK ministries only)
  const [giftAidSettings, setGiftAidSettings] = useState<GiftAidPublicSettings>({ enabled: false, charityName: null });
  const [giftAid, setGiftAid] = useState<GiftAidFormState>(emptyGiftAidState);
  const [alreadyDeclared, setAlreadyDeclared] = useState(false);

  // Default suggested amounts
  const defaultAmountsUSD = [500, 1000, 2500, 5000, 10000];
  const defaultAmountsNGN = [500000, 1000000, 2500000, 5000000, 10000000];

  useEffect(() => {
    loadPaymentSettings();
    loadGiftAidSettings(ministryId).then(setGiftAidSettings).catch(() => {});
  }, [ministryId]);

  // Look up whether this donor already has an active Gift Aid declaration so we
  // can tell them future donations are already covered.
  useEffect(() => {
    if (!giftAidSettings.enabled || !email) {
      setAlreadyDeclared(false);
      return;
    }
    let active = true;
    loadDonorGiftAidStatus(ministryId, email)
      .then((status) => { if (active) setAlreadyDeclared(status === 'active'); })
      .catch(() => {});
    return () => { active = false; };
  }, [ministryId, email, giftAidSettings.enabled]);

  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      setName(profile?.display_name || '');
    }

    // Check for donation success in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('donation') === 'success') {
      const reference = params.get('reference');
      if (reference) {
        verifyPaystackDonation(reference);
      } else {
        setShowSuccess(true);
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [user, profile]);

  const loadPaymentSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_payment_settings')
        .select('*')
        .eq('ministry_id', ministryId)
        .eq('is_active', true)
        .single();

      if (data && !error) {
        setPaymentSettings(data);
        setCurrency(data.default_currency || 'USD');
      } else {
        // Use default settings if none configured
        setPaymentSettings({
          payment_mode: 'platform',
          default_currency: 'USD',
          supported_currencies: ['USD', 'GBP', 'NGN'],
          show_suggested_amounts: true,
          suggested_amounts_usd: defaultAmountsUSD,
          suggested_amounts_ngn: defaultAmountsNGN,
          is_active: true
        });
      }
    } catch (err) {
      console.error('Error loading payment settings:', err);
      // Use defaults on error
      setPaymentSettings({
        payment_mode: 'platform',
        default_currency: 'USD',
        supported_currencies: ['USD', 'GBP', 'NGN'],
        show_suggested_amounts: true,
        suggested_amounts_usd: defaultAmountsUSD,
        suggested_amounts_ngn: defaultAmountsNGN,
        is_active: true
      });
    } finally {
      setLoadingSettings(false);
    }
  };

  const verifyPaystackDonation = async (reference: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('paystack-verify', {
        body: { reference }
      });

      if (data?.success) {
        setShowSuccess(true);
      }
    } catch (err) {
      console.error('Paystack verification error:', err);
    }
  };

  const getSuggestedAmounts = () => {
    if (!paymentSettings?.show_suggested_amounts) return [];
    return currency === 'NGN' 
      ? (paymentSettings?.suggested_amounts_ngn || defaultAmountsNGN)
      : (paymentSettings?.suggested_amounts_usd || defaultAmountsUSD);
  };

  const getFinalAmount = () => {
    if (amount) return amount;
    const custom = parseFloat(customAmount);
    if (custom && custom > 0) return Math.round(custom * 100);
    return 0;
  };

  const getCurrencySymbol = () => currency === 'NGN' ? '₦' : currency === 'GBP' ? '£' : '$';

  const getMinimumAmount = () => currency === 'NGN' ? 100000 : 100; // ₦1000, or $1/£1

  // Update Gift Aid state; prefill the donor's name into the declaration the
  // first time they opt in, if those fields are still empty.
  const handleGiftAidChange = (next: GiftAidFormState) => {
    if (next.optedIn && !giftAid.optedIn && !next.firstName && !next.lastName && name.trim()) {
      const parts = name.trim().split(/\s+/);
      next = {
        ...next,
        firstName: parts[0] || '',
        lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
      };
    }
    setGiftAid(next);
  };

  // Record the declaration before payment so it's captured even if the donor
  // finishes paying on an external page. Non-fatal: a failure never blocks the
  // donation itself. Returns false only when the donor opted in but left the
  // declaration incomplete (so we can ask them to finish it).
  const recordGiftAidIfNeeded = async (): Promise<boolean> => {
    if (!giftAidSettings.enabled || !giftAid.optedIn) return true;
    if (!isGiftAidDeclarationComplete(giftAid)) {
      toast({
        title: t('ministryDonationForm', 'completeGiftAidTitle', 'Complete your Gift Aid details'),
        description: t('ministryDonationForm', 'completeGiftAidDesc', 'Please add your name, home address (house number + postcode) and confirm you are a UK taxpayer.'),
        variant: 'destructive',
      });
      return false;
    }
    try {
      const result = await submitGiftAidDeclaration({
        ministryId,
        donorUserId: user?.id || null,
        donorEmail: email,
        title: giftAid.title,
        firstName: giftAid.firstName,
        lastName: giftAid.lastName,
        houseNumberOrName: giftAid.houseNumberOrName,
        addressLine1: giftAid.addressLine1,
        city: giftAid.city,
        postcode: giftAid.postcode,
        isTaxpayerConfirmed: giftAid.taxpayerConfirmed,
        source: 'ministry_donation_form',
      });
      if (!result.ok) {
        toast({
          title: t('ministryDonationForm', 'giftAidNotRecordedTitle', 'Gift Aid not recorded'),
          description: t('ministryDonationForm', 'giftAidNotRecordedDesc', 'We couldn’t save your Gift Aid declaration, but your donation will still go ahead.'),
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.warn('Gift Aid declaration error:', err);
    }
    return true; // never block the donation
  };

  const handleDonate = async () => {
    const finalAmount = getFinalAmount();
    const minAmount = getMinimumAmount();

    if (finalAmount < minAmount) {
      toast({
        title: t('ministryDonationForm', 'invalidAmount', 'Invalid Amount'),
        description: t('ministryDonationForm', 'minimumDonation', 'Minimum donation is {amount}').replace('{amount}', `${getCurrencySymbol()}${(minAmount / 100).toLocaleString()}`),
        variant: 'destructive'
      });
      return;
    }

    if (!email) {
      toast({
        title: t('ministryDonationForm', 'emailRequired', 'Email Required'),
        description: t('ministryDonationForm', 'enterEmail', 'Please enter your email address'),
        variant: 'destructive'
      });
      return;
    }

    // Capture the Gift Aid declaration (if opted in) before initiating payment.
    const giftAidOk = await recordGiftAidIfNeeded();
    if (!giftAidOk) return;

    // Handle external payment
    if (paymentSettings?.payment_mode === 'external' && paymentSettings.external_payment_url) {
      window.open(paymentSettings.external_payment_url, '_blank');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-donation', {
        body: {
          provider: paymentMethod,
          amount: finalAmount,
          currency,
          email,
          name: isAnonymous ? 'Anonymous' : name,
          userId: user?.id,
          isAnonymous,
          message,
          ministryId,
          callbackUrl: `${window.location.origin}?donation=success`
        }
      });

      if (error) throw error;

      // Check for external redirect
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      // Check for error in response data
      if (data?.error) {
        if (paymentMethod === 'stripe' && data.error.includes('temporarily unavailable')) {
          toast({
            title: t('ministryDonationForm', 'stripeUnavailable', 'Stripe Unavailable'),
            description: t('ministryDonationForm', 'usePaystack', 'Please use Paystack for payments.'),
            variant: 'destructive'
          });
          setPaymentMethod('paystack');
          setLoading(false);
          return;
        }
        throw new Error(data.error);
      }

      if (paymentMethod === 'stripe' && data?.clientSecret) {
        setClientSecret(data.clientSecret);
        setShowPaymentModal(true);
      } else if (paymentMethod === 'paystack' && data?.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      }
    } catch (err: any) {
      console.error('Donation error:', err);
      toast({
        title: t('ministryDonationForm', 'error', 'Error'),
        description: err.message || t('ministryDonationForm', 'donationFailed', 'Failed to process donation. Please try Paystack.'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false);
    setClientSecret(null);
    setShowSuccess(true);
    setAmount(null);
    setCustomAmount('');
    setMessage('');
    onComplete?.();
  };

  if (loadingSettings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: themeColor }} />
      </div>
    );
  }

  if (!paymentSettings?.is_active) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="p-8 text-center">
          <Heart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700">{t('ministryDonationForm', 'donationsNotAvailable', 'Donations Not Available')}</h3>
          <p className="text-gray-500">{t('ministryDonationForm', 'notAcceptingDonations', 'This ministry is not currently accepting donations.')}</p>
        </CardContent>
      </Card>
    );
  }

  if (showSuccess) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${themeColor}20` }}>
            <CheckCircle className="h-8 w-8" style={{ color: themeColor }} />
          </div>
          <h3 className="text-xl font-bold mb-2">{t('ministryDonationForm', 'thankYou', 'Thank You!')}</h3>
          <p className="text-gray-600 mb-4">
            {paymentSettings?.thank_you_message || t('ministryDonationForm', 'generousDonationReceived', 'Your generous donation has been received. May God bless you abundantly!')}
          </p>
          <div className="flex items-center justify-center gap-2 mb-6" style={{ color: themeColor }}>
            <Sparkles className="h-5 w-5" />
            <span className="font-medium">{t('ministryDonationForm', 'giftMakesDifference', 'Your gift makes a difference')}</span>
            <Sparkles className="h-5 w-5" />
          </div>
          <Button onClick={() => setShowSuccess(false)} variant="outline">
            {t('ministryDonationForm', 'makeAnotherDonation', 'Make Another Donation')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // External payment mode
  if (paymentSettings?.payment_mode === 'external' && paymentSettings.external_payment_url) {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${themeColor}20` }}>
            <Heart className="h-6 w-6" style={{ color: themeColor }} />
          </div>
          <CardTitle>
            {paymentSettings.donation_page_title || t('ministryDonationForm', 'supportMinistry', 'Support {name}').replace('{name}', ministryName)}
          </CardTitle>
          {paymentSettings.donation_page_description && (
            <CardDescription>{paymentSettings.donation_page_description}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-gray-600 mb-6">
            {t('ministryDonationForm', 'clickToDonateVia', 'Click below to donate via {name}').replace('{name}', paymentSettings.external_payment_name || t('ministryDonationForm', 'ourGivingPlatform', 'our giving platform'))}
          </p>
          <Button 
            className="w-full" 
            size="lg"
            style={{ backgroundColor: themeColor }}
            onClick={() => window.open(paymentSettings.external_payment_url, '_blank')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            {t('ministryDonationForm', 'donateVia', 'Donate via {name}').replace('{name}', paymentSettings.external_payment_name || t('ministryDonationForm', 'externalLink', 'External Link'))}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const suggestedAmounts = getSuggestedAmounts();
  const supportedCurrencies = paymentSettings?.supported_currencies || ['USD', 'NGN'];

  return (
    <>
      <Card className="max-w-lg mx-auto">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${themeColor}20` }}>
            <Heart className="h-6 w-6" style={{ color: themeColor }} />
          </div>
          <CardTitle>
            {paymentSettings?.donation_page_title || t('ministryDonationForm', 'supportMinistry', 'Support {name}').replace('{name}', ministryName)}
          </CardTitle>
          <CardDescription>
            {paymentSettings?.donation_page_description || t('ministryDonationForm', 'generosityHelps', 'Your generosity helps us continue our mission')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Currency Selection */}
          {supportedCurrencies.length > 1 && (
            <div>
              <Label className="mb-2 block">{t('ministryDonationForm', 'currency', 'Currency')}</Label>
              <div className="grid grid-cols-3 gap-3">
                {supportedCurrencies.includes('USD') && (
                  <Button
                    variant={currency === 'USD' ? 'default' : 'outline'}
                    onClick={() => { setCurrency('USD'); setAmount(null); setCustomAmount(''); }}
                    style={currency === 'USD' ? { backgroundColor: themeColor } : {}}
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    USD
                  </Button>
                )}
                {supportedCurrencies.includes('GBP') && (
                  <Button
                    variant={currency === 'GBP' ? 'default' : 'outline'}
                    onClick={() => { setCurrency('GBP'); setPaymentMethod('stripe'); setAmount(null); setCustomAmount(''); }}
                    style={currency === 'GBP' ? { backgroundColor: themeColor } : {}}
                  >
                    £ GBP
                  </Button>
                )}
                {supportedCurrencies.includes('NGN') && (
                  <Button
                    variant={currency === 'NGN' ? 'default' : 'outline'}
                    onClick={() => { setCurrency('NGN'); setAmount(null); setCustomAmount(''); }}
                    style={currency === 'NGN' ? { backgroundColor: themeColor } : {}}
                  >
                    ₦ NGN
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Amount Selection */}
          <div>
            <Label className="mb-3 block">{t('ministryDonationForm', 'selectAmount', 'Select Amount')}</Label>
            {suggestedAmounts.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-3">
                {suggestedAmounts.map(amt => (
                  <Button
                    key={amt}
                    variant={amount === amt ? 'default' : 'outline'}
                    onClick={() => { setAmount(amt); setCustomAmount(''); }}
                    style={amount === amt ? { backgroundColor: themeColor } : {}}
                    className="text-sm"
                  >
                    {getCurrencySymbol()}{(amt / 100).toLocaleString()}
                  </Button>
                ))}
              </div>
            )}
            <div>
              <Label>{t('ministryDonationForm', 'orEnterCustomAmount', 'Or enter custom amount')}</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {getCurrencySymbol()}
                </span>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={customAmount}
                  onChange={(e) => { setCustomAmount(e.target.value); setAmount(null); }}
                  className="pl-8"
                  min="1"
                  step="0.01"
                />
              </div>
            </div>
          </div>

          {/* Donor Info */}
          <div className="space-y-4">
            <div>
              <Label>{t('ministryDonationForm', 'emailLabel', 'Email *')}</Label>
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>{t('ministryDonationForm', 'nameLabel', 'Name')}</Label>
              <Input
                type="text"
                placeholder={t('ministryDonationForm', 'yourNamePlaceholder', 'Your name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isAnonymous}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="anonymous"
                checked={isAnonymous}
                onCheckedChange={(checked) => setIsAnonymous(checked as boolean)}
              />
              <Label htmlFor="anonymous" className="cursor-pointer">
                {t('ministryDonationForm', 'makeAnonymous', 'Make this donation anonymous')}
              </Label>
            </div>
          </div>

          {/* Message */}
          <div>
            <Label>{t('ministryDonationForm', 'messageOptional', 'Message (Optional)')}</Label>
            <Textarea
              placeholder={t('ministryDonationForm', 'messagePlaceholder', 'Add a message of encouragement...')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </div>

          {/* Gift Aid (UK ministries with Gift Aid enabled) */}
          {giftAidSettings.enabled && (
            <GiftAidDeclarationFields
              value={giftAid}
              onChange={handleGiftAidChange}
              charityName={giftAidSettings.charityName}
              themeColor={themeColor}
              alreadyDeclared={alreadyDeclared}
            />
          )}

          {/* Payment Method */}
          <div>
            <Label className="mb-2 block">{t('ministryDonationForm', 'paymentMethod', 'Payment Method')}</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant={paymentMethod === 'stripe' ? 'default' : 'outline'}
                onClick={() => setPaymentMethod('stripe')}
                className={paymentMethod === 'stripe' ? 'bg-purple-600 hover:bg-purple-700' : ''}
                disabled={currency === 'NGN'} // Stripe doesn't support NGN well
              >
                <CreditCard className="h-4 w-4 mr-2" />
                {t('ministryDonationForm', 'cardStripe', 'Card (Stripe)')}
              </Button>
              <Button
                variant={paymentMethod === 'paystack' ? 'default' : 'outline'}
                onClick={() => setPaymentMethod('paystack')}
                style={paymentMethod === 'paystack' ? { backgroundColor: themeColor } : {}}
                disabled={currency === 'GBP'} // Paystack doesn't support GBP
              >
                <Globe className="h-4 w-4 mr-2" />
                Paystack
              </Button>
            </div>
            {currency === 'NGN' && paymentMethod === 'stripe' && (
              <p className="text-xs text-amber-600 mt-2">
                {t('ministryDonationForm', 'stripeNgnWarning', 'Stripe is recommended for USD payments. Paystack works better for NGN.')}
              </p>
            )}
          </div>

          {/* Donate Button */}
          <Button 
            className="w-full" 
            size="lg"
            onClick={handleDonate}
            disabled={loading || getFinalAmount() < getMinimumAmount()}
            style={{ backgroundColor: themeColor }}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('ministryDonationForm', 'processing', 'Processing...')}
              </>
            ) : (
              <>
                <Heart className="h-4 w-4 mr-2" />
                {t('ministryDonationForm', 'donate', 'Donate')} {getCurrencySymbol()}
                {getFinalAmount() > 0 ? (getFinalAmount() / 100).toLocaleString() : '0.00'}
              </>
            )}
          </Button>

          <p className="text-xs text-center text-gray-500">
            {t('ministryDonationForm', 'secureNote', 'Your donation is secure and encrypted. Thank you for your generosity!')}
          </p>
        </CardContent>
      </Card>

      {/* Stripe Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={(open) => {
        setShowPaymentModal(open);
        if (!open) setClientSecret(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('ministryDonationForm', 'completeYourDonation', 'Complete Your Donation')}</DialogTitle>
          </DialogHeader>
          
          {clientSecret && (
            <div className="space-y-4">
              <Card style={{ backgroundColor: `${themeColor}10`, borderColor: `${themeColor}40` }}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Gift className="h-5 w-5" style={{ color: themeColor }} />
                      <span className="font-medium">{t('ministryDonationForm', 'donationTo', 'Donation to {name}').replace('{name}', ministryName)}</span>
                    </div>
                    <p className="text-xl font-bold" style={{ color: themeColor }}>
                      {getCurrencySymbol()}{(getFinalAmount() / 100).toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Elements 
                stripe={stripePromise} 
                options={{ 
                  clientSecret,
                  appearance: { 
                    theme: 'stripe',
                    variables: {
                      colorPrimary: themeColor,
                    }
                  }
                }}
              >
                <StripeDonationForm
                  amount={getFinalAmount()}
                  currency={currency}
                  onSuccess={handlePaymentSuccess}
                  onCancel={() => {
                    setShowPaymentModal(false);
                    setClientSecret(null);
                  }}
                />
              </Elements>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MinistryDonationForm;
