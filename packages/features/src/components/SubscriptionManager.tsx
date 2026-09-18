import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { detectRegion } from '../regionDetection';
import { toast } from '@rekindle/ui/use-toast';
import { 
  Crown, Check, X, CreditCard, Receipt, Calendar, 
  Star, Zap, Shield, Gift, Users, BookOpen, 
  MessageSquare, Video, Download, Clock, Loader2, Globe
} from 'lucide-react';

// Charges land directly on the platform's own Stripe account — no Connect
// account here, unlike a marketplace routing payments to a third party.
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

const MINISTRY_APP_URL = import.meta.env.VITE_MINISTRY_APP_URL || 'https://rekindlebc.com';

interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  notIncluded?: string[];
  highlighted?: boolean;
  planType: 'basic' | 'premium' | 'premium_plus' | 'family' | 'ministry_plus' | 'ministry_starter' | 'ministry_growth' | 'ministry_enterprise';
  description?: string;
  liveChannelLimit?: string;
  category: 'individual' | 'ministry';
}

interface PaymentHistory {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  plan_type: string;
  provider: string;
  receipt_url?: string;
}

const subscriptionTiers: SubscriptionTier[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'month',
    planType: 'basic',
    category: 'individual' as const,
    description: 'For discovery & light personal devotion',
    features: [
      'Daily devotionals',
      'Devotional library (Limited)',
      'Prayer library (Limited)',
      'Bible reading plans (Limited)',
      'Community prayer wall (Limited participation)',
      'Join live channels',
      'Free Ministry Meetings (10 hrs/month, up to 15 participants, 60 min each)',
      'Journal (Limited entries)',
      'GraceCounsel (AI Spiritual Engineer) (Limited usage)',
      'Scripture memory (5 verses)',
      'Basic analytics'
    ],
    notIncluded: [
      'Book summaries',
      'Create live channels',
      'Share revelations',
      'Book a counsellor'
    ]
  },
  {
    id: 'premium',
    name: '⭐ Individual Partner — Tier 1',
    price: 10,
    interval: 'month',
    highlighted: true,
    planType: 'premium',
    category: 'individual' as const,
    description: 'Your own live channel — broadcast, meet, and grow',
    liveChannelLimit: '1 live channel • Live broadcast • AI note taker • Video conferencing & interactive meetings • No recording',
    features: [
      'Everything in Free, plus:',
      'Create your own live channel',
      'Live broadcast to your audience',
      'Unlimited video conferencing & interactive meetings (Free plan: 10 hrs/month)',
      'AI note taker for your meetings',
      'Unlimited devotionals & devotional library',
      'Unlimited prayer library',
      'Book a counsellor (Unlimited)',
      'Unlimited journal entries',
      'Share revelations',
      'Advanced analytics (personal growth insights)',
      'Priority support'
    ]
  },
  {
    id: 'premium_plus',
    name: '⭐⭐ Individual Partner — Tier 2',
    price: 18,
    interval: 'month',
    planType: 'premium_plus',
    category: 'individual' as const,
    description: 'Everything in Tier 1, plus meeting recording & replays',
    liveChannelLimit: '1 live channel • Live broadcast • AI note taker • Video conferencing & interactive meetings • Recording & replay access',
    features: [
      'Everything in Tier 1, plus:',
      '🎥 Meeting & channel recording',
      'Replay access for your sessions',
      'Enable prayer topics & prayer watch on your channel',
      'Channel moderation tools (mute, remove, pin prayers)',
      'Channel-level analytics (attendance, engagement, replays)',
      'Expanded GraceCounsel AI usage (advanced spiritual guidance mode)',
      'Meeting share links (public or private)',
      'Export personal journals & prayers (PDF)'
    ]
  },
];

// Ministries/churches/teams are billed in the Ministry app's own tenant
// model (real Stripe/Paystack pricing set per-tenant in ministry_partner_plans)
// -- not sold here. This block used to offer fictional Starter/Growth/Enterprise
// pricing with no matching Stripe Price (getPriceId in stripe-subscription/index.sql
// had no ministry_starter/growth/enterprise entries), so "Upgrade" would have
// errored. Removed in favor of a redirect to the real Ministry app billing page.

// Stripe Payment Form Component
interface StripePaymentFormProps {
  customerId: string;
  planType: string;
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const StripePaymentForm: React.FC<StripePaymentFormProps> = ({ 
  customerId, 
  planType, 
  userId, 
  onSuccess, 
  onCancel 
}) => {
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
      // Confirm the SetupIntent to save payment method
      const { error: setupError, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: { 
          return_url: window.location.origin + '/subscription?payment=success' 
        },
        redirect: 'if_required',
      });

      if (setupError) {
        setError(setupError.message || t('subscriptionManager', 'paymentSetupFailed', 'Payment setup failed'));
        setLoading(false);
        return;
      }

      // If setup succeeded, create the subscription — pass the saved
      // payment method along so the backend can set it as the
      // subscription's default and actually charge it (without this the
      // subscription is created with no payment method attached and gets
      // stuck in Stripe's 'incomplete' status, never actually billed).
      if (setupIntent?.status === 'succeeded') {
        const { data, error: subError } = await supabase.functions.invoke('stripe-subscription', {
          body: {
            action: 'activate-subscription',
            customerId,
            planType,
            userId,
            paymentMethodId: setupIntent.payment_method,
          }
        });

        if (subError || data?.error) {
          setError(data?.error || subError?.message || t('subscriptionManager', 'failedActivateSubscription', 'Failed to activate subscription'));
          setLoading(false);
          return;
        }

        // First-invoice charge needs 3D Secure — confirm it with the same
        // saved card, separate from the SetupIntent already confirmed above.
        if (data?.requiresAction && data?.clientSecret) {
          const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret, {
            payment_method: setupIntent.payment_method as string,
          });
          if (confirmError || paymentIntent?.status !== 'succeeded') {
            setError(confirmError?.message || t('subscriptionManager', 'paymentNeedsConfirmation', "Your card couldn't be charged yet — it may need additional verification. Please contact support or try a different card."));
            setLoading(false);
            return;
          }
          toast({
            title: t('subscriptionManager', 'subscriptionActivatedTitle', 'Subscription Activated!'),
            description: t('subscriptionManager', 'subscriptionActivatedDesc', 'Welcome to your new plan!')
          });
          onSuccess();
          return;
        }

        if (data?.status === 'active' || data?.status === 'trialing') {
          toast({
            title: t('subscriptionManager', 'subscriptionActivatedTitle', 'Subscription Activated!'),
            description: t('subscriptionManager', 'subscriptionActivatedDesc', 'Welcome to your new plan!')
          });
        } else {
          // 'incomplete' — the card needs further authentication (3D Secure)
          // that this SetupIntent-based flow doesn't run automatically, or
          // the charge itself failed. Don't claim success on an unpaid plan.
          setError(t('subscriptionManager', 'paymentNeedsConfirmation', "Your card couldn't be charged yet — it may need additional verification. Please contact support or try a different card."));
          setLoading(false);
          return;
        }
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || t('subscriptionManager', 'unexpectedError', 'An unexpected error occurred'));
    } finally {
      setLoading(false);
    }
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
          {t('subscriptionManager', 'cancel', 'Cancel')}
        </Button>
        <Button
          type="submit"
          disabled={!stripe || loading}
          className="flex-1 bg-purple-600 hover:bg-purple-700"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('subscriptionManager', 'processing', 'Processing...')}
            </>
          ) : (
            t('subscriptionManager', 'subscribeNow', 'Subscribe Now')
          )}
        </Button>
      </div>
    </form>
  );
};

export const SubscriptionManager: React.FC = () => {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const [currentTier, setCurrentTier] = useState<string>('free');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paystack'>('paystack'); // Default to paystack
  const [paystackCurrency, setPaystackCurrency] = useState<'NGN' | 'GHS' | 'ZAR'>('NGN');
  const [loading, setLoading] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistory[]>([]);
  const [activeTab, setActiveTab] = useState('plans');
  const [planCategory, setPlanCategory] = useState<'individual' | 'ministry'>(() => {
    const hint = sessionStorage.getItem('subscriptionCategory');
    sessionStorage.removeItem('subscriptionCategory');
    return hint === 'ministry' ? 'ministry' : 'individual';
  });
  
  // Stripe Elements state
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [paymentStep, setPaymentStep] = useState<'select' | 'payment'>('select');

  // Default the payment method/currency by detected region — Nigeria pays via
  // Paystack (NGN), everywhere else via Stripe (USD). Still fully overridable
  // via the existing manual selectors below.
  useEffect(() => {
    detectRegion().then((region) => {
      if (region.countryCode === 'NG') {
        setPaymentMethod('paystack');
        setPaystackCurrency('NGN');
      } else {
        setPaymentMethod('stripe');
      }
    });
  }, []);

  useEffect(() => {
    if (profile?.subscription_tier) {
      setCurrentTier(profile.subscription_tier);
    }
    loadPaymentHistory();
    
    // Check for payment success/cancel in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      // Verify Paystack payment if reference exists
      const reference = params.get('reference');
      if (reference) {
        verifyPaystackPayment(reference);
      } else {
        toast({
          title: t('subscriptionManager', 'paymentSuccessfulTitle', 'Payment Successful!'),
          description: t('subscriptionManager', 'paymentSuccessfulDesc', 'Your subscription has been activated.')
        });
        refreshProfile?.();
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('payment') === 'cancelled') {
      toast({
        title: t('subscriptionManager', 'paymentCancelledTitle', 'Payment Cancelled'),
        description: t('subscriptionManager', 'paymentCancelledDesc', 'Your payment was cancelled.'),
        variant: 'destructive'
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [profile]);

  const verifyPaystackPayment = async (reference: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('paystack-verify', {
        body: { reference }
      });

      if (error || data?.error) {
        toast({
          title: t('subscriptionManager', 'verificationFailedTitle', 'Verification Failed'),
          description: data?.error || t('subscriptionManager', 'couldNotVerifyPayment', 'Could not verify payment'),
          variant: 'destructive'
        });
        return;
      }

      if (data?.success) {
        toast({
          title: t('subscriptionManager', 'paymentSuccessfulTitle', 'Payment Successful!'),
          description: t('subscriptionManager', 'paymentSuccessfulDesc', 'Your subscription has been activated.')
        });
        refreshProfile?.();
      }
    } catch (err) {
      console.error('Paystack verification error:', err);
    }
  };

  const loadPaymentHistory = async () => {
    // Payment history loading is optional
  };


  const handleSelectTier = (tier: SubscriptionTier) => {
    if (tier.id === 'free') {
      handleDowngrade();
      return;
    }
    setSelectedTier(tier);
    setPaymentStep('select');
    setClientSecret(null);
    setShowPaymentModal(true);
  };

  const handleDowngrade = async () => {
    if (!user) return;
    
    const confirmed = window.confirm(t('subscriptionManager', 'confirmDowngrade', 'Are you sure you want to downgrade to the free plan? You will lose access to premium features.'));
    if (!confirmed) return;

    setLoading(true);
    try {
      await supabase
        .from('user_profiles')
        .update({ subscription_tier: 'free', subscription_ends_at: null })
        .eq('user_id', user.id);

      setCurrentTier('free');
      toast({ title: t('subscriptionManager', 'downgradedTitle', 'Downgraded'), description: t('subscriptionManager', 'downgradedDesc', 'Your subscription has been cancelled.') });
      refreshProfile?.();
    } catch (err) {
      toast({ title: t('subscriptionManager', 'errorTitle', 'Error'), description: t('subscriptionManager', 'failedDowngrade', 'Failed to downgrade'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleBillingPortal = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-billing-portal', {
        body: {
          returnUrl: window.location.href,
        }
      });

      if (error) throw error;
      
      if (data?.url) {
        window.location.href = data.url;
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error('Billing portal error:', err);
      toast({
        title: t('subscriptionManager', 'errorTitle', 'Error'),
        description: err.message || t('subscriptionManager', 'failedBillingPortal', 'Failed to open billing portal. Please try again.'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!user || !profile) return;

    const confirmed = window.confirm(
      t('subscriptionManager', 'confirmCancel', 'Are you sure you want to cancel your subscription? You will continue to have access until the end of your billing period.')
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const provider = profile.stripe_subscription_id ? 'stripe' : 'paystack';

      const { data, error } = await supabase.functions.invoke('cancel-subscription', {
        body: {
          provider: provider,
          immediate: false,
        }
      });

      if (error) throw error;
      
      if (data?.success) {
        toast({
          title: t('subscriptionManager', 'subscriptionCancelledTitle', 'Subscription Cancelled'),
          description: data.message
        });
        refreshProfile?.();
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error('Cancellation error:', err);
      toast({
        title: t('subscriptionManager', 'errorTitle', 'Error'),
        description: err.message || t('subscriptionManager', 'failedCancelSubscription', 'Failed to cancel subscription. Please try again.'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStripePayment = async () => {
    if (!selectedTier || !user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-subscription', {
        body: {
          action: 'create-setup-intent',
          email: user.email,
          name: profile?.display_name || user.email?.split('@')[0],
          planType: selectedTier.planType,
          userId: user.id
        }
      });

      if (error) throw error;
      
      if (data?.clientSecret) {
        setClientSecret(data.clientSecret);
        setStripeCustomerId(data.customerId);
        setPaymentStep('payment');
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error('Stripe payment error:', err);
      toast({
        title: t('subscriptionManager', 'paymentErrorTitle', 'Payment Error'),
        description: err.message || t('subscriptionManager', 'failedInitPayment', 'Failed to initialize payment. Please try again.'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePaystackPayment = async () => {
    if (!selectedTier || !user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('paystack-initialize', {
        body: {
          planType: selectedTier.planType,
          userId: user.id,
          userEmail: user.email,
          currency: paystackCurrency,
          callbackUrl: `${window.location.origin}/subscription?payment=success`
        }
      });

      if (error) throw error;
      
      if (data?.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error('Paystack payment error:', err);
      toast({
        title: t('subscriptionManager', 'paymentErrorTitle', 'Payment Error'),
        description: err.message || t('subscriptionManager', 'failedInitPayment', 'Failed to initialize payment. Please try again.'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false);
    setClientSecret(null);
    setPaymentStep('select');
    refreshProfile?.();
    loadPaymentHistory();
  };

  const getFeatureIcon = (feature: string) => {
    if (feature.includes('devotional')) return <BookOpen className="h-4 w-4" />;
    if (feature.includes('mentor')) return <Users className="h-4 w-4" />;
    if (feature.includes('prayer')) return <MessageSquare className="h-4 w-4" />;
    if (feature.includes('video') || feature.includes('live')) return <Video className="h-4 w-4" />;
    if (feature.includes('download') || feature.includes('offline')) return <Download className="h-4 w-4" />;
    if (feature.includes('support')) return <Shield className="h-4 w-4" />;
    return <Check className="h-4 w-4" />;
  };

  const formatCurrency = (amount: number, currency: string) => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    });
    return formatter.format(amount / 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">{t('subscriptionManager', 'subscription', 'Subscription')}</h1>
          <p className="text-gray-600">{t('subscriptionManager', 'manageSubscriptionBilling', 'Manage your subscription and billing')}</p>
        </div>
        {currentTier !== 'free' && (
          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
            <Crown className="h-3 w-3 mr-1" />
            {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="plans">{t('subscriptionManager', 'plans', 'Plans')}</TabsTrigger>
          <TabsTrigger value="billing">{t('subscriptionManager', 'billingHistory', 'Billing History')}</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="space-y-6">
          {/* Current Plan Info */}
          {currentTier !== 'free' && (
            <Card className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">{t('subscriptionManager', 'currentPlanX', 'Current Plan: {plan}').replace('{plan}', currentTier.charAt(0).toUpperCase() + currentTier.slice(1))}</h3>
                    <p className="text-purple-200 text-sm flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {profile?.subscription_status === 'cancelled' && profile?.subscription_ends_at
                        ? t('subscriptionManager', 'accessUntilX', 'Access until {date}').replace('{date}', new Date(profile.subscription_ends_at).toLocaleDateString())
                        : t('subscriptionManager', 'renewsOnX', 'Renews on {date}').replace('{date}', profile?.subscription_ends_at ? new Date(profile.subscription_ends_at).toLocaleDateString() : 'N/A')
                      }
                    </p>
                    {profile?.subscription_status === 'past_due' && (
                      <Badge variant="destructive" className="mt-2">
                        {t('subscriptionManager', 'paymentFailedUpdate', 'Payment Failed - Please Update Payment Method')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {profile?.stripe_customer_id && (
                      <Button 
                        variant="outline" 
                        className="bg-white/20 border-white/40 text-white hover:bg-white/30"
                        onClick={handleBillingPortal}
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {t('subscriptionManager', 'loading', 'Loading...')}
                          </>
                        ) : (
                          <>
                            <CreditCard className="h-4 w-4 mr-2" />
                            {t('subscriptionManager', 'billingPortal', 'Billing Portal')}
                          </>
                        )}
                      </Button>
                    )}
                    {profile?.subscription_status === 'active' && (
                      <Button 
                        variant="outline" 
                        className="bg-red-500/20 border-red-300/40 text-white hover:bg-red-500/30"
                        onClick={handleCancelSubscription}
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {t('subscriptionManager', 'processing', 'Processing...')}
                          </>
                        ) : (
                          <>
                            <X className="h-4 w-4 mr-2" />
                            {t('subscriptionManager', 'cancel', 'Cancel')}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Category switcher */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-gray-50 gap-1">
              <button
                onClick={() => setPlanCategory('individual')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  planCategory === 'individual'
                    ? 'bg-white shadow text-purple-700 border border-purple-200'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                👤 {t('subscriptionManager', 'individualPlans', 'Individual Plans')}
              </button>
              <button
                onClick={() => setPlanCategory('ministry')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  planCategory === 'ministry'
                    ? 'bg-white shadow text-purple-700 border border-purple-200'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                🏛 {t('subscriptionManager', 'ministryPlans', 'Ministry Plans')}
              </button>
            </div>
          </div>

          {/* Individual Plans */}
          {planCategory === 'individual' && (
            <>
              <p className="text-sm text-gray-500 text-center mb-4">
                {t('subscriptionManager', 'individualPlansSubtitle', 'For personal faith journeys — devotionals, prayer, counselling, live channels.')}
              </p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {subscriptionTiers.map(tier => (
                  <Card
                    key={tier.id}
                    className={`relative overflow-hidden ${
                      tier.highlighted
                        ? 'border-2 border-purple-500 shadow-lg shadow-purple-100'
                        : ''
                    } ${currentTier === tier.id ? 'ring-2 ring-green-500' : ''}`}
                  >
                    {tier.highlighted && (
                      <div className="absolute top-0 right-0 bg-purple-500 text-white text-xs px-3 py-1 rounded-bl-lg">
                        {t('subscriptionManager', 'mostPopular', 'Most Popular')}
                      </div>
                    )}
                    {currentTier === tier.id && (
                      <div className="absolute top-0 left-0 bg-green-500 text-white text-xs px-3 py-1 rounded-br-lg">
                        {t('subscriptionManager', 'currentPlan', 'Current Plan')}
                      </div>
                    )}
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {tier.id === 'premium' && <Star className="h-5 w-5 text-amber-500" />}
                        {tier.id === 'premium_plus' && (
                          <>
                            <Star className="h-5 w-5 text-amber-500" />
                            <Star className="h-5 w-5 text-amber-500" />
                          </>
                        )}
                        {tier.id === 'ministry' && <Crown className="h-5 w-5 text-purple-500" />}
                        {tier.id === 'ministry_plus' && <Crown className="h-5 w-5 text-amber-500" />}
                        {tier.name}
                      </CardTitle>
                      {tier.description && (
                        <p className="text-xs text-gray-500 mt-1">{tier.description}</p>
                      )}
                      <CardDescription>
                        <span className="text-3xl font-bold text-gray-900">${tier.price}</span>
                        {tier.price > 0 && <span className="text-gray-500">/{tier.interval}</span>}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
                        {tier.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-green-500 mt-0.5 flex-shrink-0">{getFeatureIcon(feature)}</span>
                            <span className="text-gray-600">{feature}</span>
                          </li>
                        ))}
                        {tier.notIncluded && tier.notIncluded.length > 0 && (
                          <>
                            <li className="pt-2 border-t border-gray-200">
                              <span className="text-xs font-semibold text-gray-500">❌ {t('subscriptionManager', 'notIncluded', 'Not Included')}</span>
                            </li>
                            {tier.notIncluded.map((feature, i) => (
                              <li key={`not-${i}`} className="flex items-start gap-2">
                                <X className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                                <span className="text-gray-500">{feature}</span>
                              </li>
                            ))}
                          </>
                        )}
                        {tier.liveChannelLimit && (
                          <li className="pt-2 border-t border-gray-200">
                            <div className="bg-blue-50 p-2 rounded text-xs text-blue-700">
                              <strong>🔒 {t('subscriptionManager', 'liveChannelLimits', 'Live Channel Limits:')}</strong><br />
                              {tier.liveChannelLimit}
                            </div>
                          </li>
                        )}
                      </ul>
                      <Button
                        className={`w-full ${tier.highlighted ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
                        variant={currentTier === tier.id ? 'outline' : 'default'}
                        disabled={currentTier === tier.id}
                        onClick={() => handleSelectTier(tier)}
                      >
                        {currentTier === tier.id ? (
                          <><Check className="h-4 w-4 mr-2" />{t('subscriptionManager', 'currentPlan', 'Current Plan')}</>
                        ) : currentTier !== 'free' && tier.id === 'free' ? (
                          t('subscriptionManager', 'downgrade', 'Downgrade')
                        ) : (
                          <>{tier.price === 0 ? t('subscriptionManager', 'getStarted', 'Get Started') : t('subscriptionManager', 'upgrade', 'Upgrade')}<Zap className="h-4 w-4 ml-2" /></>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}

          {/* Ministry Plans — real pricing/checkout lives in the Ministry app's
              own tenant billing (ministry_partner_plans / ministry-checkout),
              not here. */}
          {planCategory === 'ministry' && (
            <Card className="border-2 border-purple-200 bg-purple-50/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-800">
                  <Crown className="h-5 w-5 text-purple-500" />
                  {t('subscriptionManager', 'ministryPlansMovedTitle', 'Running a ministry, church, or team?')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-purple-700">
                  {t(
                    'subscriptionManager',
                    'ministryPlansMovedDesc',
                    "Ministry plans — member management, multi-channel evangelism, live channels, branding — are set up and billed in the Ministry app, built for teams rather than individual accounts."
                  )}
                </p>
                <Button
                  className="bg-purple-600 hover:bg-purple-700"
                  onClick={() => window.open(`${MINISTRY_APP_URL}/settings/billing`, '_blank')}
                >
                  <Globe className="h-4 w-4 mr-2" />
                  {t('subscriptionManager', 'goToMinistryApp', 'Go to Ministry app')}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                {t('subscriptionManager', 'paymentHistory', 'Payment History')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {paymentHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CreditCard className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>{t('subscriptionManager', 'noPaymentHistory', 'No payment history yet')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentHistory.map(payment => (
                    <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          payment.status === 'completed' ? 'bg-green-100' : 'bg-yellow-100'
                        }`}>
                          <CreditCard className={`h-5 w-5 ${
                            payment.status === 'completed' ? 'text-green-600' : 'text-yellow-600'
                          }`} />
                        </div>
                        <div>
                          <p className="font-medium">{t('subscriptionManager', 'planTypeX', '{plan} Plan').replace('{plan}', payment.plan_type)}</p>
                          <p className="text-sm text-gray-500">
                            {t('subscriptionManager', 'dateViaProvider', '{date} via {provider}').replace('{date}', new Date(payment.created_at).toLocaleDateString()).replace('{provider}', payment.provider)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(payment.amount, payment.currency)}</p>
                        <Badge variant={payment.status === 'completed' ? 'default' : 'secondary'}>
                          {payment.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={(open) => {
        setShowPaymentModal(open);
        if (!open) {
          setPaymentStep('select');
          setClientSecret(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {paymentStep === 'select' ? t('subscriptionManager', 'completeSubscription', 'Complete Your Subscription') : t('subscriptionManager', 'enterPaymentDetails', 'Enter Payment Details')}
            </DialogTitle>
          </DialogHeader>
          
          {selectedTier && paymentStep === 'select' && (
            <div className="space-y-6">
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold">{t('subscriptionManager', 'planNameX', '{plan} Plan').replace('{plan}', selectedTier.name)}</h4>
                      <p className="text-sm text-gray-500">{t('subscriptionManager', 'billedMonthly', 'Billed monthly')}</p>
                    </div>
                    <p className="text-2xl font-bold">${selectedTier.price}</p>
                  </div>
                </CardContent>
              </Card>

              <div>
                <p className="text-sm font-medium mb-3">{t('subscriptionManager', 'selectPaymentMethod', 'Select Payment Method')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant={paymentMethod === 'stripe' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('stripe')}
                    className="h-auto py-4"
                  >
                    <div className="text-center">
                      <CreditCard className="h-6 w-6 mx-auto mb-1" />
                      <span className="text-sm">{t('subscriptionManager', 'cardStripe', 'Card (Stripe)')}</span>
                      <p className="text-xs text-gray-500 mt-1">{t('subscriptionManager', 'international', 'International')}</p>
                    </div>
                  </Button>
                  <Button
                    variant={paymentMethod === 'paystack' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('paystack')}
                    className="h-auto py-4"
                  >
                    <div className="text-center">
                      <Globe className="h-6 w-6 mx-auto mb-1" />
                      <span className="text-sm">Paystack</span>
                      <p className="text-xs text-gray-500 mt-1">{t('subscriptionManager', 'africa', 'Africa')}</p>
                    </div>
                  </Button>
                </div>
              </div>

              {paymentMethod === 'paystack' && (
                <div>
                  <p className="text-sm font-medium mb-2">{t('subscriptionManager', 'selectCurrency', 'Select Currency')}</p>
                  <Select value={paystackCurrency} onValueChange={(v: 'NGN' | 'GHS' | 'ZAR') => setPaystackCurrency(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NGN">{t('subscriptionManager', 'currencyNGN', 'Nigerian Naira (NGN)')}</SelectItem>
                      <SelectItem value="GHS">{t('subscriptionManager', 'currencyGHS', 'Ghanaian Cedi (GHS)')}</SelectItem>
                      <SelectItem value="ZAR">{t('subscriptionManager', 'currencyZAR', 'South African Rand (ZAR)')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button 
                className="w-full" 
                size="lg"
                onClick={paymentMethod === 'stripe' ? handleStripePayment : handlePaystackPayment}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('subscriptionManager', 'processing', 'Processing...')}
                  </>
                ) : (
                  <>
                    {t('subscriptionManager', 'continueToPayment', 'Continue to Payment')}
                    <Zap className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-gray-500">
                {t('subscriptionManager', 'termsNotice', 'By subscribing, you agree to our Terms of Service and Privacy Policy. You can cancel anytime.')}
              </p>
            </div>
          )}

          {/* Stripe Elements Payment Form */}
          {selectedTier && paymentStep === 'payment' && clientSecret && stripeCustomerId && (
            <div className="space-y-4">
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold">{t('subscriptionManager', 'planNameX', '{plan} Plan').replace('{plan}', selectedTier.name)}</h4>
                      <p className="text-sm text-gray-500">{t('subscriptionManager', 'billedMonthly', 'Billed monthly')}</p>
                    </div>
                    <p className="text-2xl font-bold">${selectedTier.price}</p>
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
                      colorPrimary: '#7c3aed',
                    }
                  }
                }}
              >
                <StripePaymentForm
                  customerId={stripeCustomerId}
                  planType={selectedTier.planType}
                  userId={user?.id || ''}
                  onSuccess={handlePaymentSuccess}
                  onCancel={() => {
                    setPaymentStep('select');
                    setClientSecret(null);
                  }}
                />
              </Elements>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubscriptionManager;