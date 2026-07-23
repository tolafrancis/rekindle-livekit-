import React, { useState, useEffect } from 'react';
import { useViewHistory } from '@rekindle/features/hooks/useViewHistory';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from './ui/use-toast';
import {
  Heart, Church, Users, DollarSign, CheckCircle, Copy,
  CreditCard, Receipt, Globe, Loader2, Sparkles,
  Building2, MessageSquare, ExternalLink, Gift, Ticket, Share2,
  Radio, BarChart2, Crown, Shield, Repeat, Pencil
} from 'lucide-react';
import { PAYPAL_LINKS } from '@/lib/givingLinks';

const PAYPAL_OPTIONS = [
  { key: 'monthly25', title: '$25 / month', subtitle: 'Recurring monthly support', href: PAYPAL_LINKS.monthly25, icon: Repeat, highlight: false },
  { key: 'monthly50', title: '$50 / month', subtitle: 'Recurring monthly support', href: PAYPAL_LINKS.monthly50, icon: Repeat, highlight: true },
  { key: 'oneTime',   title: 'One-time gift', subtitle: 'A single gift to support the mission', href: PAYPAL_LINKS.oneTime, icon: Gift, highlight: false },
];

const stripePromise = loadStripe('pk_live_51OJhJBHdGQpsHqInIzu7c6PzGPSH0yImD4xfpofvxvFZs0VFhPRXZCyEgYkkhOtBOXFWvssYASs851mflwQvjnrl00T6DbUwWZ', {
  stripeAccount: 'acct_1ShQgqHaTSTkefai'
});

// Partner days calculation
function calcPartnerDays(amount: number, currency: string, tier: 'individual' | 'ministry'): number {
  // Partner access is configured for Ministry Partners only — a flat 60 days.
  // Individual giving is treated as a plain donation and grants no access window.
  if (tier === 'ministry') return 60;
  return 0;
}

interface BankDetails {
  donation_whatsapp_number: string;
  donation_bank_name: string;
  donation_account_number: string;
  donation_account_name: string;
  donation_bank_country: string;
  donation_usd_instructions: string;
}

// Stripe inner form
const StripePaymentForm: React.FC<{ amount: number; currency: string; onSuccess: () => void; onCancel: () => void }> = ({ amount, currency, onSuccess, onCancel }) => {
  const { t } = useLanguage();
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const symbol = currency === 'NGN' ? '₦' : '$';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true); setError(null);
    try {
      const { error: paymentError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.origin + '?donation=success' },
        redirect: 'if_required',
      });
      if (paymentError) { setError(paymentError.message || t('sponsorshipSystem', 'paymentFailed', 'Payment failed')); return; }
      if (paymentIntent?.status === 'succeeded') {
        toast({ title: t('sponsorshipSystem', 'thankYou', 'Thank You! 🙏'), description: t('sponsorshipSystem', 'donationReceived', 'Donation of {amount} received.').replace('{amount}', `${symbol}${(amount / 100).toLocaleString()}`) });
        onSuccess();
      }
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1" disabled={loading}>{t('sponsorshipSystem', 'cancel', 'Cancel')}</Button>
        <Button type="submit" disabled={!stripe || loading} className="flex-1 bg-green-600 hover:bg-green-700">
          {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('sponsorshipSystem', 'processing', 'Processing...')}</> : <><Heart className="h-4 w-4 mr-2" />{t('sponsorshipSystem', 'giveAmount', 'Give {amount}').replace('{amount}', `${symbol}${(amount / 100).toLocaleString()}`)}</>}
        </Button>
      </div>
    </form>
  );
};

// Partner Tier Card
const PartnerTierCard: React.FC<{
  tier: 'individual' | 'ministry';
  isActive: boolean;
  expiresAt: string | null;
  onSelect: (donationType: 'monthly' | 'one-time') => void;
}> = ({ tier, isActive, expiresAt, onSelect }) => {
  const { t } = useLanguage();
  const isMinistry = tier === 'ministry';
  const expiry = expiresAt ? new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  const individualBenefits = [
    t('sponsorshipSystem', 'indBenefit1', 'Funds new devotionals, translations & resources'),
    t('sponsorshipSystem', 'indBenefit2', 'Powers global evangelism and outreach'),
    t('sponsorshipSystem', 'indBenefit3', 'Helps keep ReKindle BC free for believers everywhere'),
    t('sponsorshipSystem', 'indBenefit4', 'A simple way to give back and sow into the mission'),
  ];

  const ministryBenefits = [
    t('sponsorshipSystem', 'minBenefit1', 'Create & manage a ministry'),
    t('sponsorshipSystem', 'minBenefit2', 'Live channel creation'),
    t('sponsorshipSystem', 'minBenefit3', 'Interactive meeting hosting'),
    t('sponsorshipSystem', 'minBenefit4', 'Broadcast to congregation'),
    t('sponsorshipSystem', 'minBenefit5', 'Ministry analytics & export'),
    t('sponsorshipSystem', 'minBenefit6', 'Team management'),
  ];

  const benefits = isMinistry ? ministryBenefits : individualBenefits;
  const gradient = isMinistry
    ? 'from-purple-600 to-indigo-700'
    : 'from-rose-500 to-pink-600';
  const icon = isMinistry ? Church : Heart;
  const Icon = icon;

  return (
    <Card className={`overflow-hidden border-2 transition-all ${isActive ? (isMinistry ? 'border-purple-400' : 'border-rose-400') : 'border-gray-200 hover:border-gray-300'}`}>
      <div className={`bg-gradient-to-br ${gradient} p-5 text-white`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">{isMinistry ? t('sponsorshipSystem', 'ministryPartner', 'Ministry Partner') : t('sponsorshipSystem', 'individualPartner', 'Individual Partner')}</h3>
              <p className="text-white/80 text-xs">{isMinistry ? t('sponsorshipSystem', 'forChurches', 'For churches & ministry leaders') : t('sponsorshipSystem', 'forPersonalGrowth', 'For personal spiritual growth')}</p>
            </div>
          </div>
          {isActive && (
            <Badge className="bg-white/20 text-white border-white/30">{t('sponsorshipSystem', 'activeCheck', 'Active ✓')}</Badge>
          )}
        </div>

        {/* Support type text + two CTAs */}
        <div className="bg-white/10 rounded-lg p-3 mb-3 space-y-2">
          <p className="text-sm text-white/90 leading-snug">
            {isMinistry
              ? t('sponsorshipSystem', 'ministrySupportText', 'Support the ministry with a monthly partnership to unlock access.')
              : t('sponsorshipSystem', 'individualSupportText', 'Partner with us monthly for ongoing impact, or give a one-time gift.')}
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => onSelect('monthly')}
              className="text-xs font-semibold py-2 px-3 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-white border border-white/30"
            >
              {t('sponsorshipSystem', 'monthlyPartnership', 'Monthly Partnership')}
            </button>
            <button
              onClick={() => onSelect('one-time')}
              className="text-xs font-semibold py-2 px-3 rounded-lg bg-white text-gray-800 hover:bg-white/90 transition-colors"
            >
              {t('sponsorshipSystem', 'oneTimeSupport', 'One-Time Support')}
            </button>
          </div>
        </div>

        {isActive && (
          <p className="text-white/80 text-xs">{t('sponsorshipSystem', 'active', 'Active')}</p>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        <p className="text-xs font-medium text-gray-500">
          {isMinistry
            ? t('sponsorshipSystem', 'ministryUnlocks', 'All app features are free — Ministry partnership unlocks:')
            : t('sponsorshipSystem', 'giftSupports', 'Every feature is free for everyone. Your gift supports:')}
        </p>
        <ul className="space-y-1.5">
          {benefits.map(b => (
            <li key={b} className="flex items-start gap-2 text-sm text-gray-700">
              <CheckCircle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${isMinistry ? 'text-purple-500' : 'text-rose-500'}`} />
              {b}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

// Main Component
export const SponsorshipSystem: React.FC = () => {
  const { t } = useLanguage();
  const { user, profile, isPartner: authIsPartner } = useAuth() as any;
  const isPartner = authIsPartner ?? !!(profile?.partner_expires_at && new Date(profile.partner_expires_at) > new Date());
  const [activeTab, setActiveTab] = useViewHistory<string>('sponsorship-system', 'partners');
  const [selectedTier, setSelectedTier] = useState<'individual' | 'ministry' | null>(null);
  const [currency, setCurrency] = useState<'USD' | 'NGN'>('USD');
  const [amount, setAmount] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paystack' | 'paypal'>('paystack');
  const [loading, setLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [showBank, setShowBank] = useState(false);
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [donations, setDonations] = useState<any[]>([]);
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [vouchers, setVouchers] = useState<any[]>([]);

  const currentTier = (profile as any)?.partner_tier as 'individual' | 'ministry' | null;
  const partnerExpiresAt = profile?.partner_expires_at || null;
  const isIndividualActive = isPartner && currentTier === 'individual';
  const isMinistryActive = isPartner && currentTier === 'ministry';

  const USD_AMOUNTS_IND = [5, 10, 25, 50];
  const NGN_AMOUNTS_IND = [1000, 5000, 10000, 25000];
  const USD_AMOUNTS_MIN = [25, 50, 100, 200];
  const NGN_AMOUNTS_MIN = [25000, 50000, 100000, 200000];

  const amounts = selectedTier === 'ministry'
    ? (currency === 'NGN' ? NGN_AMOUNTS_MIN : USD_AMOUNTS_MIN)
    : (currency === 'NGN' ? NGN_AMOUNTS_IND : USD_AMOUNTS_IND);
  const symbol = currency === 'NGN' ? '₦' : '$';
  const selectedAmt = amount ? parseFloat(amount) : customAmount ? parseFloat(customAmount) : 0;
  const partnerDays = selectedAmt > 0 && selectedTier ? calcPartnerDays(selectedAmt, currency, selectedTier) : 0;

  useEffect(() => {
    loadBankDetails();
    loadDonations();
    loadVouchers();
    const params = new URLSearchParams(window.location.search);
    if (params.get('donation') === 'success') {
      const ref = params.get('reference');
      if (ref) verifyPaystack(ref);
      else toast({ title: t('sponsorshipSystem', 'thankYouLower', 'Thank you! 🙏'), description: t('sponsorshipSystem', 'partnershipActivated', 'Your partnership has been activated.') });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [user]);

  const loadBankDetails = async () => {
    try {
      const { data } = await supabase.from('platform_settings').select('key, value')
        .in('key', ['donation_whatsapp_number','donation_bank_name','donation_account_number','donation_account_name','donation_bank_country','donation_usd_instructions']);
      if (data) {
        const map: any = {};
        data.forEach((r: any) => { map[r.key] = r.value; });
        setBankDetails(map);
      }
    } catch (err) { console.error(err); }
  };

  const loadDonations = async () => {
    if (!user) return;
    try {
      const { data } = await supabase.from('donations').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      setDonations(data || []);
    } catch (err) { console.error(err); }
  };

  const loadVouchers = async () => {
    if (!user) return;
    try {
      const { data } = await supabase.from('vouchers').select('*').eq('created_by', user.id).order('created_at', { ascending: false });
      setVouchers(data || []);
    } catch (err) { console.error(err); }
  };

  const verifyPaystack = async (reference: string) => {
    try {
      const { data } = await supabase.functions.invoke('paystack-verify', { body: { reference } });
      if (data?.success) { toast({ title: t('sponsorshipSystem', 'thankYouLower', 'Thank you! 🙏'), description: t('sponsorshipSystem', 'partnershipNowActive', 'Your partnership is now active.') }); loadDonations(); }
    } catch (err) { console.error(err); }
  };

  const handleDonate = async () => {
    if (!selectedTier) { toast({ title: t('sponsorshipSystem', 'selectTierFirst', 'Select a tier first'), variant: 'destructive' }); return; }
    if (!selectedAmt || selectedAmt <= 0) { toast({ title: t('sponsorshipSystem', 'selectAmount', 'Select an amount'), variant: 'destructive' }); return; }
    if (!user?.email) { toast({ title: t('sponsorshipSystem', 'pleaseSignIn', 'Please sign in'), variant: 'destructive' }); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-donation', {
        body: {
          provider: paymentMethod,
          amount: Math.round(selectedAmt * 100),
          currency,
          email: user.email,
          name: isAnonymous ? 'Anonymous' : (profile?.full_name || user.email),
          userId: user.id,
          isAnonymous,
          message,
          partner_tier: selectedTier,
          partner_days: partnerDays,
          callbackUrl: `${window.location.origin}?donation=success`,
        }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (paymentMethod === 'stripe' && data?.clientSecret) {
        setClientSecret(data.clientSecret);
        setPendingAmount(Math.round(selectedAmt * 100));
        setShowPaymentModal(true);
      } else if (paymentMethod === 'paystack' && data?.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      }
    } catch (err: any) {
      toast({ title: t('sponsorshipSystem', 'paymentError', 'Payment error'), description: err.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false);
    setClientSecret(null);
    setAmount('');
    setCustomAmount('');
    loadDonations();
    toast({ title: t('sponsorshipSystem', 'thankYou', 'Thank You! 🙏'), description: t('sponsorshipSystem', 'youAreNowPartner', 'You are now {tier} Partner.').replace('{tier}', selectedTier === 'ministry' ? t('sponsorshipSystem', 'aMinistry', 'a Ministry') : t('sponsorshipSystem', 'anIndividual', 'an Individual')) });
  };

  const redeemVoucher = async () => {
    if (!redeemCode || !user) return;
    setLoading(true);
    try {
      const { data: voucher } = await supabase.from('vouchers').select('*').eq('code', redeemCode.toUpperCase()).eq('status', 'active').single();
      if (!voucher) throw new Error(t('sponsorshipSystem', 'invalidVoucher', 'Invalid or expired voucher code'));
      if (new Date(voucher.expires_at) < new Date()) throw new Error(t('sponsorshipSystem', 'voucherExpired', 'This voucher has expired'));
      await supabase.from('vouchers').update({ status: 'redeemed', redeemed_by: user.id, redeemed_at: new Date().toISOString() }).eq('id', voucher.id);
      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      await supabase.from('user_profiles').update({ partner_expires_at: expires.toISOString(), partner_tier: 'individual' }).eq('user_id', user.id);
      toast({ title: t('sponsorshipSystem', 'voucherRedeemed', 'Voucher Redeemed! 🎉'), description: t('sponsorshipSystem', 'individualAccessActivated', 'Individual Partner access activated for 30 days.') });
      setShowRedeemModal(false);
      setRedeemCode('');
    } catch (err: any) {
      toast({ title: t('sponsorshipSystem', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t('sponsorshipSystem', 'labelCopied', '{label} copied!').replace('{label}', label) });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">{t('sponsorshipSystem', 'partnerWithRekindle', 'Partner with ReKindle BC')}</h1>
          <p className="text-gray-600 mt-1">{t('sponsorshipSystem', 'supportMissionSubtitle', 'Support the mission and unlock powerful features')}</p>
        </div>
        <Button variant="outline" onClick={() => setShowRedeemModal(true)}>
          <Ticket className="h-4 w-4 mr-2" />{t('sponsorshipSystem', 'redeemVoucher', 'Redeem Voucher')}
        </Button>
      </div>

      {/* Current status banner */}
      {user && isPartner && (
        <Card className={`border-2 ${isMinistryActive ? 'border-purple-400 bg-purple-50' : 'border-rose-300 bg-rose-50'}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${isMinistryActive ? 'bg-purple-100' : 'bg-rose-100'}`}>
                {isMinistryActive ? <Church className="h-5 w-5 text-purple-600" /> : <Heart className="h-5 w-5 text-rose-500 fill-rose-500" />}
              </div>
              <div>
                <p className="font-semibold">{isMinistryActive ? t('sponsorshipSystem', 'ministryPartner', 'Ministry Partner') : t('sponsorshipSystem', 'individualPartner', 'Individual Partner')} ✓</p>
                <p className="text-xs text-gray-500">
                  {t('sponsorshipSystem', 'active', 'Active')}
                </p>
              </div>
            </div>
            <Badge className={isMinistryActive ? 'bg-purple-600 text-white' : 'bg-rose-500 text-white'}>
              {isMinistryActive ? t('sponsorshipSystem', 'ministry', 'Ministry') : t('sponsorshipSystem', 'individual', 'Individual')}
            </Badge>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="partners">{t('sponsorshipSystem', 'becomeAPartner', 'Become a Partner')}</TabsTrigger>
          <TabsTrigger value="vouchers">{t('sponsorshipSystem', 'vouchers', 'Vouchers')}</TabsTrigger>
          <TabsTrigger value="history">{t('sponsorshipSystem', 'givingHistory', 'Giving History')}</TabsTrigger>
        </TabsList>

        {/* ── Partners Tab ── */}
        <TabsContent value="partners" className="space-y-6">

          {/* Two tier cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PartnerTierCard
              tier="individual"
              isActive={isIndividualActive}
              expiresAt={isIndividualActive ? partnerExpiresAt : null}
              onSelect={(donationType) => { setSelectedTier('individual'); setAmount(''); setCustomAmount(''); }}
            />
            <PartnerTierCard
              tier="ministry"
              isActive={isMinistryActive}
              expiresAt={isMinistryActive ? partnerExpiresAt : null}
              onSelect={(donationType) => { setSelectedTier('ministry'); setAmount(''); setCustomAmount(''); }}
            />
          </div>

          {/* Give form — shows after selecting a tier */}
          {selectedTier && (
            <Card className="border-2 border-dashed border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  {selectedTier === 'ministry' ? <Church className="h-5 w-5 text-purple-600" /> : <Heart className="h-5 w-5 text-rose-500" />}
                  {t('sponsorshipSystem', 'giveAsPartner', 'Give as {tier} Partner').replace('{tier}', selectedTier === 'ministry' ? t('sponsorshipSystem', 'ministry', 'Ministry') : t('sponsorshipSystem', 'individual', 'Individual'))}
                  <button onClick={() => setSelectedTier(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">{t('sponsorshipSystem', 'changeTier', 'Change tier')}</button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Currency toggle */}
                <div className="grid grid-cols-2 gap-2">
                  {(['USD', 'NGN'] as const).map(c => (
                    <Button key={c} variant={currency === c ? 'default' : 'outline'}
                      onClick={() => { setCurrency(c); setAmount(''); setCustomAmount(''); }}
                      className={currency === c ? (selectedTier === 'ministry' ? 'bg-purple-600' : 'bg-rose-500') : ''}
                    >
                      {c === 'USD' ? t('sponsorshipSystem', 'usdAndOthers', '$ USD & Others') : t('sponsorshipSystem', 'ngn', '₦ NGN')}
                    </Button>
                  ))}
                </div>

                {/* Amount buttons */}
                <div className="grid grid-cols-4 gap-2">
                  {amounts.map(a => (
                    <Button key={a} size="sm"
                      variant={amount === String(a) ? 'default' : 'outline'}
                      onClick={() => { setAmount(String(a)); setCustomAmount(''); }}
                      className={amount === String(a) ? (selectedTier === 'ministry' ? 'bg-purple-600' : 'bg-rose-500') : ''}
                    >
                      {symbol}{currency === 'NGN' && a >= 1000 ? `${a/1000}k` : a}
                    </Button>
                  ))}
                </div>

                {/* Custom amount */}
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">{symbol}</span>
                  <Input type="number" placeholder={t('sponsorshipSystem', 'customAmount', 'Custom amount')} value={customAmount}
                    onChange={e => { setCustomAmount(e.target.value); setAmount(''); }}
                    className="pl-7"
                  />
                </div>

                {/* Message */}
                <div>
                  <Label>{t('sponsorshipSystem', 'messageOptional', 'Message (Optional)')}</Label>
                  <Textarea placeholder={t('sponsorshipSystem', 'addAMessage', 'Add a message...')} value={message} onChange={e => setMessage(e.target.value)} rows={2} />
                </div>

                {/* Anonymous */}
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                  <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} className="w-4 h-4 accent-purple-600" />
                  {t('sponsorshipSystem', 'makeAnonymous', 'Make this donation anonymous')}
                </label>

                {/* Payment method */}
                <div className="grid grid-cols-3 gap-2">
                  <Button variant={paymentMethod === 'stripe' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('stripe')} disabled={currency === 'NGN'}
                    className={paymentMethod === 'stripe' ? 'bg-indigo-600' : ''}
                  >
                    <CreditCard className="h-4 w-4 mr-1.5" />{t('sponsorshipSystem', 'card', 'Card')}
                  </Button>
                  <Button variant={paymentMethod === 'paystack' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('paystack')}
                    className={paymentMethod === 'paystack' ? 'bg-green-600' : ''}
                  >
                    <Globe className="h-4 w-4 mr-1.5" />Paystack
                  </Button>
                  <Button variant={paymentMethod === 'paypal' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('paypal')}
                    className={paymentMethod === 'paypal' ? 'bg-[#003087]' : ''}
                  >
                    <Heart className="h-4 w-4 mr-1.5" />PayPal
                  </Button>
                </div>

                {paymentMethod === 'paypal' ? (
                  <div className="space-y-3">
                    {PAYPAL_OPTIONS.map(opt => {
                      const Icon = opt.icon;
                      return (
                        <a
                          key={opt.key}
                          href={opt.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                            opt.highlight
                              ? 'border-[#003087] bg-blue-50 hover:bg-blue-100'
                              : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${opt.highlight ? 'bg-[#003087]' : 'bg-blue-100'}`}>
                              <Icon className={`h-4 w-4 ${opt.highlight ? 'text-white' : 'text-[#003087]'}`} />
                            </div>
                            <div>
                              <p className="font-semibold text-sm flex items-center gap-2">
                                {opt.title}
                                {opt.highlight && <Badge className="bg-[#003087] text-white text-[10px] px-1.5 py-0">{t('sponsorshipSystem', 'popular', 'Popular')}</Badge>}
                              </p>
                              <p className="text-xs text-gray-500">{opt.subtitle}</p>
                            </div>
                          </div>
                          <ExternalLink className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        </a>
                      );
                    })}

                    {/* Custom amount — fill in on PayPal */}
                    <a
                      href={PAYPAL_LINKS.custom}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-dashed border-blue-300 bg-white hover:bg-blue-50 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-blue-100">
                          <Pencil className="h-4 w-4 text-[#003087]" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{t('sponsorshipSystem', 'customAmount', 'Custom amount')}</p>
                          <p className="text-xs text-gray-500">{t('sponsorshipSystem', 'chooseOwnGift', 'Choose your own gift on the PayPal page')}</p>
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    </a>

                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">
                        {t('sponsorshipSystem', 'differentAmountHint1', 'Giving a different amount? Tap')} <span className="font-medium">{t('sponsorshipSystem', 'customAmount', 'Custom amount')}</span> {t('sponsorshipSystem', 'differentAmountHint2', 'and type the exact figure on the PayPal checkout page.')}
                      </p>
                    </div>

                    <p className="text-xs text-center text-gray-400">{t('sponsorshipSystem', 'securedByPaypal', 'Secured by PayPal · Pay with your PayPal balance, card, or bank')}</p>
                  </div>
                ) : (
                  <>
                    <Button
                      className={`w-full text-white font-semibold ${selectedTier === 'ministry' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-rose-500 hover:bg-rose-600'}`}
                      size="lg"
                      onClick={handleDonate}
                      disabled={loading || !selectedAmt || selectedAmt <= 0}
                    >
                      {loading
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('sponsorshipSystem', 'processing', 'Processing...')}</>
                        : <>{selectedTier === 'ministry' ? <Church className="h-4 w-4 mr-2" /> : <Heart className="h-4 w-4 mr-2" />}
                          {t('sponsorshipSystem', 'giveAmount', 'Give {amount}').replace('{amount}', selectedAmt > 0 ? `${symbol}${selectedAmt.toLocaleString()}` : t('sponsorshipSystem', 'now', 'Now'))}</>
                      }
                    </Button>
                    <p className="text-xs text-center text-gray-400">{t('sponsorshipSystem', 'securedByStripePaystack', 'Secured by Stripe & Paystack')}</p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Direct Bank Transfer */}
          {bankDetails && (bankDetails.donation_bank_name || bankDetails.donation_whatsapp_number) && (
            <Card>
              <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowBank(p => !p)}>
                <CardTitle className="text-sm flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-green-600" />
                    {t('sponsorshipSystem', 'directBankTransfer', 'Direct Bank Transfer')}
                  </div>
                  <span className="text-xs text-gray-400 font-normal">{showBank ? t('sponsorshipSystem', 'hide', 'Hide') : t('sponsorshipSystem', 'show', 'Show')}</span>
                </CardTitle>
              </CardHeader>
              {showBank && (
                <CardContent className="space-y-3">
                  {[
                    { label: t('sponsorshipSystem', 'bank', 'Bank'), value: bankDetails.donation_bank_name },
                    { label: t('sponsorshipSystem', 'accountNumber', 'Account Number'), value: bankDetails.donation_account_number },
                    { label: t('sponsorshipSystem', 'accountName', 'Account Name'), value: bankDetails.donation_account_name },
                    { label: t('sponsorshipSystem', 'country', 'Country'), value: bankDetails.donation_bank_country },
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
                  {bankDetails.donation_usd_instructions && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <p className="text-xs font-medium text-blue-700 mb-1">{t('sponsorshipSystem', 'internationalUsd', 'International / USD')}</p>
                      <p className="text-sm text-blue-600">{bankDetails.donation_usd_instructions}</p>
                    </div>
                  )}
                  {bankDetails.donation_whatsapp_number && (
                    <a
                      href={`https://wa.me/${bankDetails.donation_whatsapp_number.replace(/[^0-9]/g, '')}?text=Hi, I just made a donation to ReKindle BC. Please activate my Partner status.`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <MessageSquare className="h-4 w-4" />{t('sponsorshipSystem', 'confirmTransferWhatsapp', 'Confirm transfer on WhatsApp')}<ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </CardContent>
              )}
            </Card>
          )}
        </TabsContent>

        {/* ── Vouchers Tab ── */}
        <TabsContent value="vouchers" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">{t('sponsorshipSystem', 'giftVouchers', 'Gift Vouchers')}</h3>
            <Button onClick={() => setShowVoucherModal(true)}>
              <Gift className="h-4 w-4 mr-2" />{t('sponsorshipSystem', 'createVoucher', 'Create Voucher')}
            </Button>
          </div>
          {vouchers.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Ticket className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">{t('sponsorshipSystem', 'noVouchersYet', 'No vouchers yet. Create one to gift Partner access to others.')}</p>
                <Button className="mt-4" onClick={() => setShowVoucherModal(true)}>
                  <Gift className="h-4 w-4 mr-2" />{t('sponsorshipSystem', 'createVoucher', 'Create Voucher')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {vouchers.map(v => (
                <Card key={v.id} className={v.status !== 'active' ? 'opacity-60' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant={v.status === 'active' ? 'default' : 'secondary'}>{v.status}</Badge>
                      <span className="font-bold">${v.value}</span>
                    </div>
                    <div className="bg-gray-100 rounded-lg p-3 font-mono text-center mb-3">{v.code}</div>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>{t('sponsorshipSystem', 'expiresLabel', 'Expires:')} {new Date(v.expires_at).toLocaleDateString()}</span>
                      {v.status === 'active' && (
                        <Button size="sm" variant="ghost" onClick={() => copyToClipboard(v.code, t('sponsorshipSystem', 'voucherCode', 'Voucher code'))}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── History Tab ── */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />{t('sponsorshipSystem', 'givingHistory', 'Giving History')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {donations.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <DollarSign className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>{t('sponsorshipSystem', 'noDonationsYet', 'No donations yet')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {donations.map(d => (
                    <div key={d.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${(d as any).partner_tier === 'ministry' ? 'bg-purple-100' : 'bg-rose-100'}`}>
                          {(d as any).partner_tier === 'ministry'
                            ? <Church className="h-4 w-4 text-purple-600" />
                            : <Heart className="h-4 w-4 text-rose-500" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium capitalize">{(d as any).partner_tier || 'individual'} {t('sponsorshipSystem', 'partnerWord', 'Partner')}</p>
                          <p className="text-xs text-gray-500">{new Date(d.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600">
                          {d.currency === 'NGN' ? '₦' : '$'}{Number(d.amount).toFixed(2)}
                        </p>
                        <Badge variant="outline" className="text-xs">{d.status || d.payment_status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Stripe Modal */}
      <Dialog open={showPaymentModal} onOpenChange={open => { setShowPaymentModal(open); if (!open) setClientSecret(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t('sponsorshipSystem', 'completeYourGift', 'Complete Your Gift')}</DialogTitle></DialogHeader>
          {clientSecret && (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg ${selectedTier === 'ministry' ? 'bg-purple-50' : 'bg-rose-50'}`}>
                <div className="flex justify-between items-center">
                  <span className="font-medium">{t('sponsorshipSystem', 'partnerGift', '{tier} Partner Gift').replace('{tier}', selectedTier === 'ministry' ? t('sponsorshipSystem', 'ministry', 'Ministry') : t('sponsorshipSystem', 'individual', 'Individual'))}</span>
                  <p className="text-xl font-bold">{symbol}{(pendingAmount / 100).toFixed(2)}</p>
                </div>
              </div>
              <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
                <StripePaymentForm amount={pendingAmount} currency={currency} onSuccess={handlePaymentSuccess} onCancel={() => { setShowPaymentModal(false); setClientSecret(null); }} />
              </Elements>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Voucher Modal */}
      <Dialog open={showVoucherModal} onOpenChange={setShowVoucherModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('sponsorshipSystem', 'createGiftVoucher', 'Create Gift Voucher')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">{t('sponsorshipSystem', 'voucherGivesAccess', 'Gift vouchers give the recipient 30 days of Individual Partner access.')}</p>
            <div>
              <Label>{t('sponsorshipSystem', 'valueDollar', 'Value ($)')}</Label>
              <Input type="number" placeholder="9.99" min="1" />
            </div>
            <Button className="w-full" onClick={async () => {
              if (!user) return;
              const code = `GIFT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
              const expires = new Date();
              expires.setMonth(expires.getMonth() + 3);
              await supabase.from('vouchers').insert({ code, type: 'individual_partner', value: 9.99, status: 'active', created_by: user.id, expires_at: expires.toISOString() });
              toast({ title: t('sponsorshipSystem', 'voucherCreated', 'Voucher Created!'), description: t('sponsorshipSystem', 'codeX', 'Code: {code}').replace('{code}', code) });
              setShowVoucherModal(false);
              loadVouchers();
            }}>
              {t('sponsorshipSystem', 'createVoucher', 'Create Voucher')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Redeem Modal */}
      <Dialog open={showRedeemModal} onOpenChange={setShowRedeemModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('sponsorshipSystem', 'redeemVoucher', 'Redeem Voucher')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('sponsorshipSystem', 'voucherCodeLabel', 'Voucher Code')}</Label>
              <Input placeholder="GIFT-XXXXXX" value={redeemCode} onChange={e => setRedeemCode(e.target.value.toUpperCase())} className="font-mono" />
            </div>
            <Button onClick={redeemVoucher} className="w-full" disabled={loading || !redeemCode}>
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('sponsorshipSystem', 'redeeming', 'Redeeming...')}</> : t('sponsorshipSystem', 'redeemVoucher', 'Redeem Voucher')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SponsorshipSystem;
