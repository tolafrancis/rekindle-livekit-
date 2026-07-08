import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from './ui/use-toast';
import {
  Heart, CreditCard, Globe, Loader2, Gift,
  CheckCircle, DollarSign, Sparkles, Building2,
  MessageSquare, Copy, ExternalLink
} from 'lucide-react';

const stripePromise = loadStripe('pk_live_51OJhJBHdGQpsHqInIzu7c6PzGPSH0yImD4xfpofvxvFZs0VFhPRXZCyEgYkkhOtBOXFWvssYASs851mflwQvjnrl00T6DbUwWZ', {
  stripeAccount: 'acct_1ShQgqHaTSTkefai'
});

// Partner days calculation
function calcPartnerDays(amount: number, currency: string): number {
  if (currency === 'NGN') {
    if (amount >= 10000) return 90;
    if (amount >= 5000)  return 60;
    return 30;
  }
  if (amount >= 50)  return 365;
  if (amount >= 25)  return 180;
  if (amount >= 10)  return 90;
  if (amount >= 5)   return 60;
  return 30;
}

interface BankDetails {
  donation_whatsapp_number: string;
  donation_bank_name: string;
  donation_account_number: string;
  donation_account_name: string;
  donation_bank_country: string;
  donation_usd_instructions: string;
}

// ── Stripe inner form ────────────────────────────────────────
interface StripeDonationFormProps {
  amount: number;
  currency: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const StripeDonationForm: React.FC<StripeDonationFormProps> = ({ amount, currency, onSuccess, onCancel }) => {
  const { t } = useLanguage();
  const stripe   = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const symbol = currency === 'NGN' ? '₦' : '$';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);
    try {
      const { error: paymentError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.origin + '?donation=success' },
        redirect: 'if_required',
      });
      if (paymentError) { setError(paymentError.message || 'Payment failed'); setLoading(false); return; }
      if (paymentIntent?.status === 'succeeded') {
        toast({ title: t('donationForm', 'thankYou', 'Thank You! 🙏'), description: t('donationForm', 'donationReceived', 'Donation of {amount} received.').replace('{amount}', `${symbol}${(amount / 100).toLocaleString()}`) });
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1" disabled={loading}>{t('donationForm', 'cancel', 'Cancel')}</Button>
        <Button type="submit" disabled={!stripe || loading} className="flex-1 bg-green-600 hover:bg-green-700">
          {loading
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('donationForm', 'processing', 'Processing...')}</>
            : <><Heart className="h-4 w-4 mr-2" />{t('donationForm', 'donate', 'Donate')} {symbol}{(amount / 100).toLocaleString()}</>}
        </Button>
      </div>
    </form>
  );
};

// ── Main DonationForm ────────────────────────────────────────
interface DonationFormProps {
  ministryId?: string;
  ministryName?: string;
  onComplete?: () => void;
}

export const DonationForm: React.FC<DonationFormProps> = ({ ministryId, ministryName, onComplete }) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [amount, setAmount]             = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [name, setName]                 = useState('');
  const [email, setEmail]               = useState('');
  const [message, setMessage]           = useState('');
  const [isAnonymous, setIsAnonymous]   = useState(false);
  const [currency, setCurrency]         = useState<'USD' | 'NGN'>('USD');
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paystack'>('paystack');
  const [loading, setLoading]           = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [showSuccess, setShowSuccess]   = useState(false);
  const [bankDetails, setBankDetails]   = useState<BankDetails | null>(null);
  const [showBank, setShowBank]         = useState(false);

  const suggestedAmountsUSD = [500, 1000, 2500, 5000, 10000];
  const suggestedAmountsNGN = [500000, 1000000, 2500000, 5000000, 10000000];
  const getSuggestedAmounts = () => currency === 'NGN' ? suggestedAmountsNGN : suggestedAmountsUSD;
  const getCurrencySymbol   = () => currency === 'NGN' ? '₦' : '$';
  const getMinimumAmount    = () => currency === 'NGN' ? 100000 : 100;

  const getFinalAmount = () => {
    if (amount) return amount;
    const c = parseFloat(customAmount);
    return c > 0 ? Math.round(c * 100) : 0;
  };

  const partnerDays = getFinalAmount() > 0
    ? calcPartnerDays(getFinalAmount() / 100, currency)
    : 0;

  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      setName(profile?.full_name || profile?.display_name || '');
    }
    loadBankDetails();
    const params = new URLSearchParams(window.location.search);
    if (params.get('donation') === 'success') {
      const ref = params.get('reference');
      if (ref) verifyPaystackDonation(ref);
      else setShowSuccess(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [user, profile]);

  const loadBankDetails = async () => {
    try {
      const { data } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', ['donation_whatsapp_number','donation_bank_name','donation_account_number','donation_account_name','donation_bank_country','donation_usd_instructions']);
      if (data) {
        const map: any = {};
        data.forEach((r: any) => { map[r.key] = r.value; });
        setBankDetails(map as BankDetails);
      }
    } catch (err) { console.error('Error loading bank details:', err); }
  };

  const verifyPaystackDonation = async (reference: string) => {
    try {
      const { data } = await supabase.functions.invoke('paystack-verify', { body: { reference } });
      if (data?.success) setShowSuccess(true);
    } catch (err) { console.error('Paystack verification error:', err); }
  };

  const handleDonate = async () => {
    const finalAmount = getFinalAmount();
    if (finalAmount < getMinimumAmount()) {
      toast({ title: t('donationForm', 'invalidAmount', 'Invalid Amount'), description: t('donationForm', 'minimumIs', 'Minimum is {amount}').replace('{amount}', `${getCurrencySymbol()}${(getMinimumAmount() / 100).toLocaleString()}`), variant: 'destructive' }); return;
    }
    if (!email) { toast({ title: t('donationForm', 'emailRequired', 'Email Required'), variant: 'destructive' }); return; }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-donation', {
        body: {
          provider:     paymentMethod,
          amount:       finalAmount,
          currency,
          email,
          name:         isAnonymous ? 'Anonymous' : name,
          userId:       user?.id,
          isAnonymous,
          message,
          ministryId,
          partner_days: partnerDays,
          callbackUrl:  `${window.location.origin}?donation=success`,
        }
      });
      if (error) throw error;
      if (data?.error) {
        if (paymentMethod === 'stripe' && data.error.includes('temporarily unavailable')) {
          toast({ title: t('donationForm', 'stripeUnavailable', 'Stripe Unavailable'), description: t('donationForm', 'pleaseUsePaystack', 'Please use Paystack.'), variant: 'destructive' });
          setPaymentMethod('paystack');
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
      toast({ title: t('donationForm', 'error', 'Error'), description: err.message || t('donationForm', 'failedToProcess', 'Failed to process donation'), variant: 'destructive' });
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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t('donationForm', 'labelCopied', '{label} copied!').replace('{label}', label) });
  };

  if (showSuccess) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold mb-2">{t('donationForm', 'thankYou', 'Thank You! 🙏')}</h3>
          <p className="text-gray-600 mb-2">{t('donationForm', 'donationReceivedSuccess', 'Your generous donation has been received.')}</p>
          <p className="text-sm text-purple-600 font-medium mb-4">
            {t('donationForm', 'partnerAccessActivated', 'Partner access activated for {days} days!').replace('{days}', String(partnerDays > 0 ? partnerDays : 30))}
          </p>
          <div className="flex items-center justify-center gap-2 text-amber-600 mb-6">
            <Sparkles className="h-5 w-5" />
            <span className="font-medium">{t('donationForm', 'giftMakesDifference', 'Your gift makes a difference')}</span>
            <Sparkles className="h-5 w-5" />
          </div>
          <Button onClick={() => setShowSuccess(false)} variant="outline">{t('donationForm', 'makeAnotherDonation', 'Make Another Donation')}</Button>
        </CardContent>
      </Card>
    );
  }

  const suggestedAmounts = getSuggestedAmounts();

  return (
    <>
      <Card className="max-w-lg mx-auto">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <Heart className="h-6 w-6 text-white" />
          </div>
          <CardTitle>{ministryName ? t('donationForm', 'supportMinistry', 'Support {name}').replace('{name}', ministryName) : t('donationForm', 'makeADonation', 'Make a Donation')}</CardTitle>
          <CardDescription>{t('donationForm', 'anyAmountActivates', 'Any amount activates Partner access for ReKindle BC')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Currency */}
          <div className="grid grid-cols-2 gap-3">
            {(['USD', 'NGN'] as const).map(c => (
              <Button key={c} variant={currency === c ? 'default' : 'outline'}
                onClick={() => { setCurrency(c); setAmount(null); setCustomAmount(''); }}
                className={currency === c ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                {c === 'USD' ? <><DollarSign className="h-4 w-4 mr-1" />USD</> : '₦ NGN'}
              </Button>
            ))}
          </div>

          {/* Amounts */}
          <div>
            <Label className="mb-2 block">{t('donationForm', 'selectAmount', 'Select Amount')}</Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {suggestedAmounts.map(amt => (
                <Button key={amt} variant={amount === amt ? 'default' : 'outline'} size="sm"
                  onClick={() => { setAmount(amt); setCustomAmount(''); }}
                  className={amount === amt ? 'bg-green-600 hover:bg-green-700' : ''}
                >
                  {getCurrencySymbol()}{(amt / 100).toLocaleString()}
                </Button>
              ))}
            </div>
            <div className="mt-3 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">{getCurrencySymbol()}</span>
              <Input type="number" placeholder="0.00" value={customAmount}
                onChange={e => { setCustomAmount(e.target.value); setAmount(null); }}
                className="pl-8" min="1" step="0.01"
              />
            </div>
          </div>

          {/* Partner days preview */}
          {getFinalAmount() > 0 && (
            <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-100">
              <span className="text-sm text-purple-700">{t('donationForm', 'partnerAccessDuration', 'Partner access duration')}</span>
              <span className="font-bold text-purple-700">{t('donationForm', 'daysCount', '{days} days').replace('{days}', String(partnerDays))}</span>
            </div>
          )}

          {/* Donor info */}
          <div className="space-y-3">
            <div>
              <Label>{t('donationForm', 'emailLabel', 'Email *')}</Label>
              <Input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label>{t('donationForm', 'nameLabel', 'Name')}</Label>
              <Input type="text" placeholder={t('donationForm', 'yourNamePlaceholder', 'Your name')} value={name} onChange={e => setName(e.target.value)} disabled={isAnonymous} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="anonymous" checked={isAnonymous} onCheckedChange={v => setIsAnonymous(v as boolean)} />
              <Label htmlFor="anonymous" className="cursor-pointer">{t('donationForm', 'makeAnonymous', 'Make this donation anonymous')}</Label>
            </div>
          </div>

          {/* Message */}
          <div>
            <Label>{t('donationForm', 'messageOptional', 'Message (Optional)')}</Label>
            <Textarea placeholder={t('donationForm', 'messagePlaceholder', 'Add a message of encouragement...')} value={message} onChange={e => setMessage(e.target.value)} rows={2} />
          </div>

          {/* Payment method */}
          <div>
            <Label className="mb-2 block">{t('donationForm', 'paymentMethod', 'Payment Method')}</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button variant={paymentMethod === 'stripe' ? 'default' : 'outline'}
                onClick={() => setPaymentMethod('stripe')}
                className={paymentMethod === 'stripe' ? 'bg-purple-600 hover:bg-purple-700' : ''}
                disabled={currency === 'NGN'}
              >
                <CreditCard className="h-4 w-4 mr-2" />Card (Stripe)
              </Button>
              <Button variant={paymentMethod === 'paystack' ? 'default' : 'outline'}
                onClick={() => setPaymentMethod('paystack')}
                className={paymentMethod === 'paystack' ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                <Globe className="h-4 w-4 mr-2" />Paystack
              </Button>
            </div>
          </div>

          <Button className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700" size="lg"
            onClick={handleDonate}
            disabled={loading || getFinalAmount() < getMinimumAmount()}
          >
            {loading
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('donationForm', 'processing', 'Processing...')}</>
              : <><Heart className="h-4 w-4 mr-2" />{t('donationForm', 'donate', 'Donate')} {getCurrencySymbol()}{getFinalAmount() > 0 ? (getFinalAmount() / 100).toLocaleString() : '0.00'}</>}
          </Button>

          <p className="text-xs text-center text-gray-500">{t('donationForm', 'secureEncrypted', 'Secure & encrypted · Thank you for your generosity!')}</p>
        </CardContent>
      </Card>

      {/* Bank Transfer Section */}
      {bankDetails && (bankDetails.donation_bank_name || bankDetails.donation_whatsapp_number) && (
        <Card className="max-w-lg mx-auto mt-4">
          <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowBank(p => !p)}>
            <CardTitle className="text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-green-600" />
                {t('donationForm', 'directBankTransfer', 'Direct Bank Transfer')}
              </div>
              <span className="text-xs text-gray-400">{showBank ? t('donationForm', 'hide', 'Hide') : t('donationForm', 'show', 'Show')}</span>
            </CardTitle>
          </CardHeader>
          {showBank && (
            <CardContent className="space-y-3">
              {bankDetails.donation_bank_name && (
                <div className="space-y-2">
                  {[
                    { label: t('donationForm', 'bank', 'Bank'), value: bankDetails.donation_bank_name },
                    { label: t('donationForm', 'accountNumber', 'Account Number'), value: bankDetails.donation_account_number },
                    { label: t('donationForm', 'accountName', 'Account Name'), value: bankDetails.donation_account_name },
                    { label: t('donationForm', 'country', 'Country'), value: bankDetails.donation_bank_country },
                  ].filter(f => f.value).map(f => (
                    <div key={f.label} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-xs text-gray-400">{f.label}</p>
                        <p className="text-sm font-medium">{f.value}</p>
                      </div>
                      <button onClick={() => copyToClipboard(f.value, f.label)} className="p-1.5 hover:bg-gray-200 rounded">
                        <Copy className="h-3.5 w-3.5 text-gray-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {bankDetails.donation_usd_instructions && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-xs font-medium text-blue-700 mb-1">{t('donationForm', 'internationalUsdTransfer', 'International / USD Transfer')}</p>
                  <p className="text-sm text-blue-600">{bankDetails.donation_usd_instructions}</p>
                </div>
              )}
              {bankDetails.donation_whatsapp_number && (
                <a
                  href={`https://wa.me/${bankDetails.donation_whatsapp_number.replace(/[^0-9]/g, '')}?text=Hi, I just made a donation to ReKindle BC and want to confirm my Partner status.`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <MessageSquare className="h-4 w-4" />
                  {t('donationForm', 'confirmTransferWhatsApp', 'Confirm transfer on WhatsApp')}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Stripe Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={open => { setShowPaymentModal(open); if (!open) setClientSecret(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t('donationForm', 'completeYourDonation', 'Complete Your Donation')}</DialogTitle></DialogHeader>
          {clientSecret && (
            <div className="space-y-4">
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Gift className="h-5 w-5 text-green-600" />
                      <span className="font-medium">{t('donationForm', 'donationLabel', 'Donation')}</span>
                    </div>
                    <p className="text-xl font-bold text-green-600">
                      {getCurrencySymbol()}{(getFinalAmount() / 100).toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#16a34a' } } }}>
                <StripeDonationForm amount={getFinalAmount()} currency={currency} onSuccess={handlePaymentSuccess} onCancel={() => { setShowPaymentModal(false); setClientSecret(null); }} />
              </Elements>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DonationForm;
