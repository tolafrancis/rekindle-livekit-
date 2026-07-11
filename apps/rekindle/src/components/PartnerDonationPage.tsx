import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { toast } from './ui/use-toast';
import {
  Heart, CheckCircle2, MessageSquare, Building2,
  Loader2, BookOpen, Users, Globe, Sparkles,
  Copy, ExternalLink, Repeat, Gift, Pencil
} from 'lucide-react';

// PayPal giving links
const PAYPAL_LINKS = {
  custom:    'https://www.paypal.com/ncp/payment/3YK4A327MGDEY',
  oneTime:   'https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-4WW211734T869610RNIWUNVA',
  monthly50: 'https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-7P8586509X755242HNIWUDQY',
  monthly25: 'https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-73A12474PE1925450NIWT65I',
} as const;

const GIVING_OPTIONS = [
  {
    key: 'monthly25',
    title: '$25 / month',
    subtitle: 'Recurring monthly support',
    href: PAYPAL_LINKS.monthly25,
    icon: Repeat,
    highlight: false,
  },
  {
    key: 'monthly50',
    title: '$50 / month',
    subtitle: 'Recurring monthly support',
    href: PAYPAL_LINKS.monthly50,
    icon: Repeat,
    highlight: true,
  },
  {
    key: 'oneTime',
    title: 'One-time gift',
    subtitle: 'A single gift to support the mission',
    href: PAYPAL_LINKS.oneTime,
    icon: Gift,
    highlight: false,
  },
];

// Partner days calculation
function calcPartnerDays(amount: number, currency: string): number {
  // Partner access is configured for Ministry Partners only.
  // This page handles individual giving, which is a plain donation (no access window).
  return 0;
}

const PARTNER_BENEFITS = [
  { icon: BookOpen, key: 'benefitDevotionalLibrary', label: 'Full devotional library — all series' },
  { icon: BookOpen, key: 'benefitBookSummaries', label: 'Daily book summaries' },
  { icon: CheckCircle2, key: 'benefitScriptureTracker', label: 'Scripture memory tracker' },
  { icon: Globe, key: 'benefitLiveChannels', label: 'Live channels access' },
  { icon: Users, key: 'benefitPrayerChallenges', label: 'Advanced prayer challenges' },
  { icon: MessageSquare, key: 'benefitWhatsapp', label: 'WhatsApp devotionals & affirmations' },
  { icon: Sparkles, key: 'benefitAdFree', label: 'Ad-free experience' },
];

interface BankDetails {
  donation_whatsapp_number: string;
  donation_bank_name: string;
  donation_account_number: string;
  donation_account_name: string;
  donation_bank_country: string;
  donation_usd_instructions: string;
}

export const PartnerDonationPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [payMethod, setPayMethod]     = useState<'paypal' | 'paystack'>('paypal');
  const [currency, setCurrency]       = useState<'USD' | 'NGN'>('USD');
  const [selectedAmt, setSelectedAmt] = useState<number | null>(null);
  const [customAmt, setCustomAmt]     = useState('');
  const [email, setEmail]             = useState('');
  const [name, setName]               = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [showBank, setShowBank]       = useState(false);
  const [impactStats, setImpactStats] = useState({ users: 0, countries: 0, prayers: 0 });

  const isPartner = profile?.partner_expires_at
    ? new Date(profile.partner_expires_at) > new Date()
    : false;

  const partnerExpiry = profile?.partner_expires_at
    ? new Date(profile.partner_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const USD_AMOUNTS = [5, 10, 25, 50, 100];
  const NGN_AMOUNTS = [1000, 2500, 5000, 10000, 25000];
  const amounts = currency === 'NGN' ? NGN_AMOUNTS : USD_AMOUNTS;
  const symbol  = currency === 'NGN' ? '₦' : '$';

  const finalAmount = selectedAmt ?? (customAmt ? parseFloat(customAmt) : 0);
  const partnerDays = finalAmount > 0 ? calcPartnerDays(finalAmount, currency) : 0;

  useEffect(() => {
    if (user) {
      setEmail(user.email ?? '');
      setName(profile?.full_name ?? '');
    }
    loadBankDetails();
    loadImpactStats();

    // Check for Paystack callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('donation') === 'success') {
      const ref = params.get('reference');
      if (ref) verifyPaystack(ref);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [user, profile]);

  const loadBankDetails = async () => {
    try {
      const { data } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', [
          'donation_whatsapp_number','donation_bank_name',
          'donation_account_number','donation_account_name',
          'donation_bank_country','donation_usd_instructions'
        ]);
      if (data) {
        const map: any = {};
        data.forEach((r: any) => { map[r.key] = r.value; });
        setBankDetails(map);
      }
    } catch (err) {
      console.error('Error loading bank details:', err);
    }
  };

  const loadImpactStats = async () => {
    try {
      const { count: users }   = await supabase.from('user_profiles').select('*', { count: 'exact', head: true });
      const { count: prayers } = await supabase.from('prayer_requests').select('*', { count: 'exact', head: true });
      setImpactStats({ users: users ?? 0, countries: 12, prayers: prayers ?? 0 });
    } catch (err) {
      console.error('Error loading impact stats:', err);
    }
  };

  const verifyPaystack = async (reference: string) => {
    try {
      const { data } = await supabase.functions.invoke('paystack-verify', { body: { reference } });
      if (data?.success) {
        toast({ title: t('partnerDonationPage', 'thankYouPartner', 'Thank you, Partner! 🙏'), description: t('partnerDonationPage', 'partnerStatusActive', 'Your Partner status is now active.') });
      }
    } catch (err) {
      console.error('Paystack verification error:', err);
    }
  };

  const handleDonate = async () => {
    if (!finalAmount || finalAmount <= 0) {
      toast({ title: t('partnerDonationPage', 'selectAnAmount', 'Select an amount'), variant: 'destructive' }); return;
    }
    if (!email) {
      toast({ title: t('partnerDonationPage', 'emailRequired', 'Email required'), description: t('partnerDonationPage', 'emailRequiredDesc', 'We need your email to activate Partner status.'), variant: 'destructive' }); return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-donation', {
        body: {
          amount:      Math.round(finalAmount * 100), // cents/kobo
          currency,
          email,
          name:        isAnonymous ? 'Anonymous' : name,
          is_anonymous: isAnonymous,
          user_id:     user?.id ?? null,
          partner_days: partnerDays,
          redirect_url: `${window.location.origin}${window.location.pathname}?donation=success`,
        }
      });

      if (error) throw error;

      if (data?.authorizationUrl) {
        // Paystack — redirect
        window.location.href = data.authorizationUrl;
      } else if (data?.clientSecret) {
        // Stripe — handled by existing flow
        window.location.href = data.checkoutUrl;
      }
    } catch (err: any) {
      toast({ title: t('partnerDonationPage', 'paymentError', 'Payment error'), description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t('partnerDonationPage', 'labelCopied', '{label} copied!').replace('{label}', String(label)) });
  };

  return (
    <div className="space-y-5 max-w-xl mx-auto pb-10">

      {/* Header */}
      <div className="text-center pt-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Heart className="h-6 w-6 text-rose-500 fill-rose-500" />
          <h1 className="text-2xl font-bold">{t('partnerDonationPage', 'partnerWithRekindle', 'Partner with ReKindle BC')}</h1>
        </div>
        <p className="text-sm text-gray-500">{t('partnerDonationPage', 'reachSoulsGlobally', 'Help us reach souls globally through digital ministry')}</p>
      </div>

      {/* Impact stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { value: impactStats.users.toLocaleString(), key: 'statUsers', label: t('partnerDonationPage', 'statUsers', 'Users') },
          { value: `${impactStats.countries}+`, key: 'statCountries', label: t('partnerDonationPage', 'statCountries', 'Countries') },
          { value: impactStats.prayers.toLocaleString(), key: 'statPrayers', label: t('partnerDonationPage', 'statPrayers', 'Prayers') },
        ].map(s => (
          <Card key={s.key}>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-purple-700">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Partner status card */}
      {user && (
        <Card className={`border-2 ${isPartner ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${isPartner ? 'bg-green-100' : 'bg-gray-100'}`}>
                <Heart className={`h-5 w-5 ${isPartner ? 'text-green-600 fill-green-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="font-semibold text-sm">{isPartner ? t('partnerDonationPage', 'activePartner', 'Active Partner') : t('partnerDonationPage', 'notPartnerYet', 'Not a Partner yet')}</p>
                <p className="text-xs text-gray-500">
                  {isPartner
                    ? t('partnerDonationPage', 'active', 'Active')
                    : t('partnerDonationPage', 'giveAnyAmount', 'Give any amount to become a Partner')}
                </p>
              </div>
            </div>
            <Badge className={isPartner ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'}>
              {isPartner ? t('partnerDonationPage', 'partnerBadge', '✓ Partner') : t('partnerDonationPage', 'free', 'Free')}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Partner Benefits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            {t('partnerDonationPage', 'partnerBenefits', 'Partner Benefits')}
          </CardTitle>
          <CardDescription>{t('partnerDonationPage', 'unlockedByDonation', 'Unlocked by any donation')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {PARTNER_BENEFITS.map(b => (
            <div key={b.key} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
              <span>{t('partnerDonationPage', b.key, b.label)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Donation form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('partnerDonationPage', 'giveToMission', 'Give to the Mission')}</CardTitle>
          <CardDescription>{t('partnerDonationPage', 'choosePaypalPaystack', 'Choose PayPal or Paystack — both are secure')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Payment method selector */}
          <div className="flex gap-2">
            {([
              { id: 'paypal',   label: 'PayPal' },
              { id: 'paystack', label: 'Paystack' },
            ] as const).map(m => (
              <button
                key={m.id}
                onClick={() => setPayMethod(m.id)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                  payMethod === m.id
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* ── PayPal ── */}
          {payMethod === 'paypal' && (
            <div className="space-y-3">
              {/* Fixed PayPal giving options */}
              {GIVING_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const optTitle = opt.key === 'oneTime'
                  ? t('partnerDonationPage', 'oneTimeGift', 'One-time gift')
                  : opt.title;
                const optSubtitle = opt.key === 'oneTime'
                  ? t('partnerDonationPage', 'oneTimeGiftSubtitle', 'A single gift to support the mission')
                  : t('partnerDonationPage', 'recurringMonthlySupport', 'Recurring monthly support');
                return (
                  <a
                    key={opt.key}
                    href={opt.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                      opt.highlight
                        ? 'border-purple-500 bg-purple-50 hover:bg-purple-100'
                        : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${opt.highlight ? 'bg-purple-600' : 'bg-purple-100'}`}>
                        <Icon className={`h-4 w-4 ${opt.highlight ? 'text-white' : 'text-purple-600'}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm flex items-center gap-2">
                          {optTitle}
                          {opt.highlight && (
                            <Badge className="bg-purple-600 text-white text-[10px] px-1.5 py-0">{t('partnerDonationPage', 'popular', 'Popular')}</Badge>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">{optSubtitle}</p>
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
                className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-dashed border-purple-300 bg-white hover:bg-purple-50 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-purple-100">
                    <Pencil className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{t('partnerDonationPage', 'customAmount', 'Custom amount')}</p>
                    <p className="text-xs text-gray-500">{t('partnerDonationPage', 'chooseGiftOnPaypal', 'Choose your own gift on the PayPal page')}</p>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-gray-400 flex-shrink-0" />
              </a>

              {/* Prompt for custom amount */}
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                <Sparkles className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  {t('partnerDonationPage', 'givingDifferentTap', 'Giving a different amount? Tap')} <span className="font-medium">{t('partnerDonationPage', 'customAmount', 'Custom amount')}</span> {t('partnerDonationPage', 'typeExactFigure', "and type the exact figure you'd like to give on the PayPal checkout page.")}
                </p>
              </div>

              <p className="text-xs text-center text-gray-400">
                {t('partnerDonationPage', 'securedByPaypal', 'Secured by PayPal · Pay with your PayPal balance, card, or bank')}
              </p>
            </div>
          )}

          {/* ── Paystack ── */}
          {payMethod === 'paystack' && (
            <div className="space-y-4">
              {/* Currency toggle */}
              <div className="flex gap-2">
                {(['USD', 'NGN'] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => { setCurrency(c); setSelectedAmt(null); setCustomAmt(''); }}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      currency === c
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {c === 'USD' ? t('partnerDonationPage', 'usdAndOthers', '$ USD & Others') : t('partnerDonationPage', 'ngnCurrency', '₦ NGN')}
                  </button>
                ))}
              </div>

              {/* Amount buttons */}
              <div className="grid grid-cols-5 gap-2">
                {amounts.map(a => (
                  <button
                    key={a}
                    onClick={() => { setSelectedAmt(a); setCustomAmt(''); }}
                    className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                      selectedAmt === a
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    {symbol}{currency === 'NGN' ? (a >= 1000 ? `${a/1000}k` : a) : a}
                  </button>
                ))}
              </div>

              {/* Custom amount */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{symbol}</span>
                <Input
                  type="number"
                  placeholder={t('partnerDonationPage', 'customAmount', 'Custom amount')}
                  value={customAmt}
                  onChange={e => { setCustomAmt(e.target.value); setSelectedAmt(null); }}
                  className="pl-7"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label>{t('partnerDonationPage', 'emailAddress', 'Email address')}</Label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
                <p className="text-xs text-gray-400">{t('partnerDonationPage', 'usedToActivate', 'Used to activate your Partner status')}</p>
              </div>

              {/* Name */}
              {!isAnonymous && (
                <div className="space-y-1.5">
                  <Label>{t('partnerDonationPage', 'yourNameOptional', 'Your name (optional)')}</Label>
                  <Input
                    placeholder={t('partnerDonationPage', 'yourName', 'Your name')}
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>
              )}

              {/* Anonymous toggle */}
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={e => setIsAnonymous(e.target.checked)}
                  className="w-4 h-4 accent-purple-600"
                />
                {t('partnerDonationPage', 'makeAnonymous', 'Make this donation anonymous')}
              </label>

              {/* Give button */}
              <Button
                onClick={handleDonate}
                disabled={loading || finalAmount <= 0 || !email}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t('partnerDonationPage', 'processing', 'Processing...')}</>
                  : <><Heart className="h-4 w-4 mr-2" />{t('partnerDonationPage', 'give', 'Give')} {finalAmount > 0 ? `${symbol}${finalAmount.toLocaleString()}` : t('partnerDonationPage', 'now', 'Now')}</>
                }
              </Button>

              <p className="text-xs text-center text-gray-400">
                {t('partnerDonationPage', 'securedByPaystack', 'Secured by Paystack · NGN & card payments processed by Paystack')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Direct Transfer */}
      {bankDetails && (bankDetails.donation_bank_name || bankDetails.donation_whatsapp_number) && (
        <Card>
          <CardHeader
            className="pb-3 cursor-pointer"
            onClick={() => setShowBank(p => !p)}
          >
            <CardTitle className="text-base flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-green-600" />
                {t('partnerDonationPage', 'directBankTransfer', 'Direct Bank Transfer')}
              </div>
              <span className="text-xs text-gray-400">{showBank ? t('partnerDonationPage', 'hide', 'Hide') : t('partnerDonationPage', 'show', 'Show')}</span>
            </CardTitle>
          </CardHeader>
          {showBank && (
            <CardContent className="space-y-3">
              {bankDetails.donation_bank_name && (
                <div className="space-y-2">
                  {[
                    { fieldKey: 'bank', label: t('partnerDonationPage', 'bank', 'Bank'), value: bankDetails.donation_bank_name },
                    { fieldKey: 'accountNumber', label: t('partnerDonationPage', 'accountNumber', 'Account Number'), value: bankDetails.donation_account_number },
                    { fieldKey: 'accountName', label: t('partnerDonationPage', 'accountName', 'Account Name'), value: bankDetails.donation_account_name },
                    { fieldKey: 'country', label: t('partnerDonationPage', 'country', 'Country'), value: bankDetails.donation_bank_country },
                  ].filter(f => f.value).map(f => (
                    <div key={f.fieldKey} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
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
                  <p className="text-xs font-medium text-blue-700 mb-1">{t('partnerDonationPage', 'internationalUsdTransfer', 'International / USD Transfer')}</p>
                  <p className="text-sm text-blue-600">{bankDetails.donation_usd_instructions}</p>
                </div>
              )}

              {bankDetails.donation_whatsapp_number && (
                <a
                  href={`https://wa.me/${bankDetails.donation_whatsapp_number.replace(/[^0-9]/g, '')}?text=Hi, I just made a donation to ReKindle BC and want to confirm my Partner status.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <MessageSquare className="h-4 w-4" />
                  {t('partnerDonationPage', 'confirmOnWhatsapp', 'Confirm transfer on WhatsApp')}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}

              <p className="text-xs text-center text-gray-400">
                {t('partnerDonationPage', 'afterTransferring', 'After transferring, message us on WhatsApp with your name and transfer receipt to activate Partner status')}
              </p>
            </CardContent>
          )}
        </Card>
      )}

      {/* Giving history */}
      {user && (
        <GivingHistory userId={user.id} />
      )}
    </div>
  );
};

// Giving history sub-component
const GivingHistory: React.FC<{ userId: string }> = ({ userId }) => {
  const { t } = useLanguage();
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from('donations')
      .select('id, amount, currency, status, partner_days_granted, created_at, provider')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { if (data) setHistory(data); });
  }, [userId]);

  if (history.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Heart className="h-4 w-4 text-rose-400" />
          {t('partnerDonationPage', 'yourGivingHistory', 'Your Giving History')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {history.map(d => (
          <div key={d.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 text-sm">
            <div>
              <p className="font-medium">
                {d.currency === 'NGN' ? '₦' : '$'}{Number(d.amount).toLocaleString()}
              </p>
              <p className="text-xs text-gray-400">
                {new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' · '}{d.provider}
              </p>
            </div>
            <div className="text-right">
              <Badge className={d.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                {d.status}
              </Badge>
              {d.partner_days_granted > 0 && (
                <p className="text-xs text-purple-600 mt-1">{t('partnerDonationPage', 'daysCount', '{count} days').replace('{count}', String(d.partner_days_granted))}</p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
