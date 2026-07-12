import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Badge } from '@rekindle/ui/badge';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { toast } from '@rekindle/ui/use-toast';
import {
  MessageSquare, CheckCircle2, XCircle, AlertTriangle, Loader2,
  ExternalLink, RefreshCw, Shield, Copy,
  Info, Zap, Clock, ChevronRight, Settings, FileText,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MinistryWABAConfig {
  id: string;
  ministry_id: string;
  // WABA credentials (stored encrypted in DB, returned masked)
  waba_id: string;
  phone_number_id: string;
  phone_number_display: string;    // e.g. "+1 (555) 000-1234"
  business_display_name: string;   // verified business name — read-only once approved
  access_token_last4: string;      // last 4 chars only for display
  // Status
  connection_status: 'pending' | 'connected' | 'error' | 'suspended';
  verification_status: 'unverified' | 'pending' | 'verified';
  // Subscription
  whatsapp_plan: 'none' | 'basic' | 'growth' | 'premium';
  plan_status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'none';
  setup_fee_paid: boolean;
  // Meta
  created_at: string;
  updated_at: string;
  last_verified_at?: string;
}

interface WABATemplate {
  id: string;
  name: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  category: string;
  language: string;
  body_text: string;
  content_sid?: string | null;
}

interface MinistryWhatsAppConnectProps {
  ministryId: string;
  ministryName: string;
  onStatusChange?: (status: MinistryWABAConfig['connection_status']) => void;
}

// ─── Plan config ──────────────────────────────────────────────────────────────

const WHATSAPP_PLANS = [
  {
    id: 'basic' as const,
    name: 'Basic',
    monthlyUsd: 10,
    setupUsd: 20,
    features: [
      'Your own WABA & verified phone number',
      'Up to 1,000 messages/month included',
      'Broadcast tool access',
      'Contact management',
      'Delivery reports',
    ],
    messageRate: 0.03,
    msgIncluded: 1000,
    colour: 'border-blue-200 bg-blue-50',
    badgeColour: 'bg-blue-100 text-blue-800',
  },
  {
    id: 'growth' as const,
    name: 'Growth',
    monthlyUsd: 35,
    setupUsd: 50,
    features: [
      'Everything in Basic',
      'Up to 5,000 messages/month included',
      'Template messaging support',
      'Basic analytics & reports',
      'Priority support',
    ],
    messageRate: 0.025,
    msgIncluded: 5000,
    popular: true,
    colour: 'border-purple-300 bg-purple-50',
    badgeColour: 'bg-purple-100 text-purple-800',
  },
  {
    id: 'premium' as const,
    name: 'Premium',
    monthlyUsd: 75,
    setupUsd: 100,
    features: [
      'Everything in Growth',
      'Unlimited messages (usage-billed)',
      'Advanced analytics dashboard',
      'Template library management',
      'Dedicated onboarding support',
    ],
    messageRate: 0.02,
    msgIncluded: null,
    colour: 'border-amber-200 bg-amber-50',
    badgeColour: 'bg-amber-100 text-amber-800',
  },
];

// ─── Main component ───────────────────────────────────────────────────────────

export const MinistryWhatsAppConnect: React.FC<MinistryWhatsAppConnectProps> = ({
  ministryId,
  ministryName,
  onStatusChange,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [config, setConfig]         = useState<MinistryWABAConfig | null>(null);
  const [templates, setTemplates]   = useState<WABATemplate[]>([]);
  const [loading, setLoading]       = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [verifying, setVerifying]   = useState(false);
  const [activeTab, setActiveTab]   = useState<'connect' | 'templates' | 'settings'>('connect');
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedPlan, setSelectedPlan]   = useState<typeof WHATSAPP_PLANS[0] | null>(null);
  const [checkingOut, setCheckingOut]     = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    waba_id: '',
    phone_number_id: '',
    access_token: '',
    phone_number_display: '',
    business_display_name: '',
  });

  const fbWindowRef = useRef<Window | null>(null);

  // ── Load existing WABA config ───────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('ministry_whatsapp_configs')
        .select('*')
        .eq('ministry_id', ministryId)
        .maybeSingle();

      setConfig(data ?? null);
      if (data) onStatusChange?.(data.connection_status);
    } catch (err) {
      console.error('WABA config load error:', err);
    } finally {
      setLoading(false);
    }
  }, [ministryId, onStatusChange]);

  const loadTemplates = useCallback(async () => {
    if (!config?.waba_id) return;
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-get-templates', {
        body: { ministryId },
      });
      if (!error && data?.templates) setTemplates(data.templates);
    } catch (err) {
      console.error('Template load error:', err);
    }
  }, [ministryId, config?.waba_id]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => {
    if (activeTab === 'templates') loadTemplates();
  }, [activeTab, loadTemplates]);

  // ── Meta Embedded Signup ────────────────────────────────────────────────
  const launchEmbeddedSignup = () => {
    const META_APP_ID = import.meta.env.VITE_META_APP_ID;
    if (!META_APP_ID) {
      toast({
        title: t('ministryWhatsAppConnect', 'metaAppNotConfigured', 'Meta App not configured'),
        description: t('ministryWhatsAppConnect', 'metaAppIdNotSet', 'VITE_META_APP_ID is not set. Use manual setup instead.'),
        variant: 'destructive',
      });
      setShowManualModal(true);
      return;
    }

    setConnecting(true);

    // Construct the Embedded Signup OAuth URL
    const state = btoa(JSON.stringify({ ministryId, userId: user?.id, ts: Date.now() }));
    const params = new URLSearchParams({
      client_id:     META_APP_ID,
      display:       'popup',
      extras:        JSON.stringify({ setup: {}, featureType: '', sessionInfoVersion: '3' }),
      redirect_uri:  `${window.location.origin}/api/meta-whatsapp-callback`,
      response_type: 'code',
      scope:         'whatsapp_business_management,whatsapp_business_messaging,business_management',
      state,
    });

    const url = `https://www.facebook.com/dialog/oauth?${params.toString()}`;
    fbWindowRef.current = window.open(url, 'FacebookLogin', 'width=600,height=700');

    // Poll for the popup to close (callback will save credentials via edge function)
    const poll = setInterval(() => {
      if (fbWindowRef.current?.closed) {
        clearInterval(poll);
        setConnecting(false);
        // Reload config — callback may have saved credentials
        setTimeout(() => loadConfig(), 1500);
      }
    }, 500);
  };

  // Handle postMessage from the Embedded Signup popup (Meta sends session_info)
  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      if (e.origin !== 'https://www.facebook.com') return;
      if (e.data?.type !== 'WA_EMBEDDED_SIGNUP') return;

      const { data } = e.data;
      if (!data?.phone_number_id || !data?.waba_id) return;

      fbWindowRef.current?.close();
      setConnecting(true);

      try {
        const { error } = await supabase.functions.invoke('whatsapp-embedded-signup-complete', {
          body: {
            ministryId,
            wabaId:          data.waba_id,
            phoneNumberId:   data.phone_number_id,
            code:            data.code,
          },
        });

        if (error) throw new Error(error.message);

        toast({ title: t('ministryWhatsAppConnect', 'whatsappConnected', 'WhatsApp connected!'), description: t('ministryWhatsAppConnect', 'ministryNowConnected', '{name} is now connected via its own WhatsApp Business Account.').replace('{name}', String(ministryName)) });
        loadConfig();
      } catch (err: any) {
        toast({ title: t('ministryWhatsAppConnect', 'connectionFailed', 'Connection failed'), description: err.message, variant: 'destructive' });
      } finally {
        setConnecting(false);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [ministryId, ministryName, loadConfig]);

  // ── Manual credential save ──────────────────────────────────────────────
  const saveManualCredentials = async () => {
    if (!manualForm.waba_id || !manualForm.phone_number_id || !manualForm.access_token) {
      toast({ title: t('ministryWhatsAppConnect', 'allFieldsRequired', 'All fields required'), variant: 'destructive' });
      return;
    }
    setConnecting(true);
    try {
      const { error } = await supabase.functions.invoke('whatsapp-save-credentials', {
        body: { ministryId, ...manualForm },
      });
      if (error) throw new Error(error.message);
      toast({ title: t('ministryWhatsAppConnect', 'credentialsSaved', 'Credentials saved!'), description: t('ministryWhatsAppConnect', 'whatsappConnectionConfigured', 'WhatsApp connection configured.') });
      setShowManualModal(false);
      loadConfig();
    } catch (err: any) {
      toast({ title: t('ministryWhatsAppConnect', 'saveFailed', 'Save failed'), description: err.message, variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  // ── Verify connection ───────────────────────────────────────────────────
  const verifyConnection = async () => {
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-verify-connection', {
        body: { ministryId },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? 'Verification failed');
      toast({ title: t('ministryWhatsAppConnect', 'connectionVerified', 'Connection verified!'), description: t('ministryWhatsAppConnect', 'businessActiveAndReady', '{name} is active and ready.').replace('{name}', String(config?.business_display_name)) });
      loadConfig();
    } catch (err: any) {
      toast({ title: t('ministryWhatsAppConnect', 'verificationFailed', 'Verification failed'), description: err.message, variant: 'destructive' });
    } finally {
      setVerifying(false);
    }
  };

  // ── Stripe subscription checkout ────────────────────────────────────────
  const startSubscription = async (plan: typeof WHATSAPP_PLANS[0]) => {
    setCheckingOut(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-whatsapp-subscription', {
        body: {
          ministryId,
          plan:       plan.id,
          monthlyUsd: plan.monthlyUsd,
          setupUsd:   plan.setupUsd,
          setupAlreadyPaid: config?.setup_fee_paid ?? false,
          successUrl: `${window.location.origin}?wa_plan_success=1&ministry=${ministryId}`,
          cancelUrl:  `${window.location.origin}?wa_plan_cancel=1`,
        },
      });
      if (error || !data?.checkoutUrl) throw new Error(error?.message ?? 'Could not create checkout');
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      toast({ title: t('ministryWhatsAppConnect', 'checkoutFailed', 'Checkout failed'), description: err.message, variant: 'destructive' });
      setCheckingOut(false);
    }
  };

  // ── Status badge helper ─────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: MinistryWABAConfig['connection_status'] }) => {
    const map = {
      connected:  { label: t('ministryWhatsAppConnect', 'statusConnected', 'Connected'),  cls: 'bg-green-100 text-green-800 border-green-200' },
      pending:    { label: t('ministryWhatsAppConnect', 'statusPending', 'Pending'),    cls: 'bg-amber-100 text-amber-800 border-amber-200' },
      error:      { label: t('ministryWhatsAppConnect', 'statusError', 'Error'),      cls: 'bg-red-100 text-red-800 border-red-200' },
      suspended:  { label: t('ministryWhatsAppConnect', 'statusSuspended', 'Suspended'),  cls: 'bg-gray-100 text-gray-700 border-gray-200' },
    };
    const m = map[status];
    return <Badge variant="outline" className={`text-xs font-medium ${m.cls}`}>{m.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-purple-600" />
      </div>
    );
  }

  // ── No subscription yet ─────────────────────────────────────────────────
  if (!config || config.whatsapp_plan === 'none') {
    return (
      <>
        <div className="space-y-6 max-w-3xl">

          {/* ── How would you like to send? tooltip ── */}
          <div className="rounded-xl border-2 border-dashed border-green-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-base">💡</span>
              <p className="text-sm font-semibold text-gray-800">{t('ministryWhatsAppConnect', 'howWouldYouLikeToSend', 'How would you like to send?')}</p>
              <span className="text-xs text-muted-foreground ml-auto">{t('ministryWhatsAppConnect', 'chooseWhatWorksBest', 'Choose what works best for you')}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {/* Option A — Credits */}
              <div className="text-left rounded-xl border-2 border-green-200 bg-green-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 rounded-lg shrink-0">
                    <Zap className="h-5 w-5 text-green-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-green-900">{t('ministryWhatsAppConnect', 'useCredits', 'Use Credits')}</p>
                      <span className="text-[10px] font-bold bg-green-600 text-white px-2 py-0.5 rounded-full">
                        {t('ministryWhatsAppConnect', 'cheaper', 'CHEAPER')}
                      </span>
                    </div>
                    <p className="text-xs text-green-800 mt-1 leading-relaxed">
                      {t('ministryWhatsAppConnect', 'creditsDescription', 'Pay as you go — only charged for messages actually delivered. No monthly plan needed. Best for occasional or smaller broadcasts.')}
                    </p>
                    <div className="mt-2 space-y-0.5">
                      <p className="text-xs text-green-700 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        {t('ministryWhatsAppConnect', 'creditsFromRate', 'From $0.03/msg — no monthly fee')}
                      </p>
                      <p className="text-xs text-green-700 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        {t('ministryWhatsAppConnect', 'creditsNeverExpire', 'Credits never expire — top up any time')}
                      </p>
                      <p className="text-xs text-green-700 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        {t('ministryWhatsAppConnect', 'creditsWorksImmediately', 'Works immediately — no setup required')}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2.5 italic">
                      {t('ministryWhatsAppConnect', 'creditsSenderShared', "Sender shown as the platform's shared number")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Option B — Custom WABA */}
              <div className="text-left rounded-xl border-2 border-purple-200 bg-purple-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg shrink-0">
                    <MessageSquare className="h-5 w-5 text-purple-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-purple-900">{t('ministryWhatsAppConnect', 'customWaba', 'Custom WABA')}</p>
                      <span className="text-[10px] font-bold bg-purple-600 text-white px-2 py-0.5 rounded-full">
                        {t('ministryWhatsAppConnect', 'yourBrand', 'YOUR BRAND')}
                      </span>
                    </div>
                    <p className="text-xs text-purple-800 mt-1 leading-relaxed">
                      {t('ministryWhatsAppConnect', 'customWabaDescription', "Connect your own WhatsApp Business Account so every message arrives from {name}'s verified name — not a shared number.").replace('{name}', String(ministryName))}
                    </p>
                    <div className="mt-2 space-y-0.5">
                      <p className="text-xs text-purple-700 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        {t('ministryWhatsAppConnect', 'verifiedSenderTrust', 'Verified sender name builds recipient trust')}
                      </p>
                      <p className="text-xs text-purple-700 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        {t('ministryWhatsAppConnect', 'dedicatedPhoneNumber', 'Your own dedicated phone number')}
                      </p>
                      <p className="text-xs text-purple-700 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        {t('ministryWhatsAppConnect', 'templateMessagingIncluded', 'Template messaging + analytics included')}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2.5 italic">
                      {t('ministryWhatsAppConnect', 'startsFromSetupFee', 'Starts from $10/mo + one-time setup fee ↓')}
                    </p>
                  </div>
                </div>
              </div>

            </div>

            {/* Compare note */}
            <div className="flex items-start gap-2 pt-1 border-t border-dashed border-green-200">
              <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>{t('ministryWhatsAppConnect', 'notSure', 'Not sure?')}</strong> {t('ministryWhatsAppConnect', 'compareUse', 'Use')} <strong>{t('ministryWhatsAppConnect', 'creditsLabel', 'Credits')}</strong> {t('ministryWhatsAppConnect', 'compareCreditsRest', 'for simple pay-as-you-go sending with no monthly commitment.')}
                {t('ministryWhatsAppConnect', 'compareChoose', 'Choose')} <strong>{t('ministryWhatsAppConnect', 'customWaba', 'Custom WABA')}</strong> {t('ministryWhatsAppConnect', 'compareWabaRest', 'if your ministry needs its own verified WhatsApp identity.')}
                {t('ministryWhatsAppConnect', 'compareBoth', 'You can use both at the same time.')}
              </p>
            </div>
          </div>

          {/* Hero */}
          <div className="rounded-2xl border bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-100 rounded-xl">
                <MessageSquare className="h-7 w-7 text-green-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-green-900">{t('ministryWhatsAppConnect', 'yourOwnWhatsappIdentity', 'Your Own WhatsApp Business Identity')}</h2>
                <p className="text-sm text-green-700 mt-1 leading-relaxed">
                  {t('ministryWhatsAppConnect', 'heroConnect', 'Connect')} <strong>{ministryName}</strong> {t('ministryWhatsAppConnect', 'heroConnectRest', 'with its own verified WhatsApp Business Account.')}
                  {t('ministryWhatsAppConnect', 'heroMessagesArriveFrom', 'Messages will arrive from')} <em>{t('ministryWhatsAppConnect', 'heroYourMinistrysName', "your ministry's name")}</em> {t('ministryWhatsAppConnect', 'heroNotShared', '— not a shared number.')}
                </p>
                <Alert className="mt-4 border-amber-200 bg-amber-50">
                  <Info className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800 text-xs">
                    <strong>{t('ministryWhatsAppConnect', 'importantLabel', 'Important:')}</strong> {t('ministryWhatsAppConnect', 'importantSenderNameNotice', 'The sender name shown to recipients is tied to your verified WhatsApp Business Account and cannot be changed per-message. Each ministry gets its own verified business name through its own WABA — which is exactly what makes this trustworthy.')}
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          </div>

          {/* Plan cards */}
          <div>
            <h3 className="text-base font-semibold mb-4">{t('ministryWhatsAppConnect', 'chooseAPlan', 'Choose a Plan to Get Started')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {WHATSAPP_PLANS.map(plan => (
                <div
                  key={plan.id}
                  className={`relative rounded-xl border-2 p-5 flex flex-col ${plan.colour} ${plan.popular ? 'ring-2 ring-purple-400' : ''}`}
                >
                  {plan.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold bg-purple-500 text-white px-3 py-0.5 rounded-full">
                      {t('ministryWhatsAppConnect', 'popular', 'POPULAR')}
                    </span>
                  )}
                  <div className="mb-3">
                    <Badge className={`text-xs ${plan.badgeColour} border-0`}>{plan.name}</Badge>
                    <div className="mt-2">
                      <span className="text-3xl font-extrabold">${plan.monthlyUsd}</span>
                      <span className="text-sm text-muted-foreground">/mo</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('ministryWhatsAppConnect', 'oneTimeSetupFeeX', '+ ${amount} one-time setup fee').replace('{amount}', String(plan.setupUsd))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ${plan.messageRate.toFixed(3)}/msg after included{plan.msgIncluded ? ` (${plan.msgIncluded.toLocaleString()} included)` : ' (unlimited, usage-billed)'}
                    </p>
                  </div>
                  <ul className="space-y-1.5 flex-1 mb-4">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => { setSelectedPlan(plan); setShowPlanModal(true); }}
                    disabled={checkingOut}
                  >
                    {t('ministryWhatsAppConnect', 'getStarted', 'Get Started')}
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Plan confirmation modal */}
        <Dialog open={showPlanModal} onOpenChange={setShowPlanModal}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('ministryWhatsAppConnect', 'confirmPlanX', 'Confirm Plan — {name}').replace('{name}', String(selectedPlan?.name))}</DialogTitle>
            </DialogHeader>
            {selectedPlan && (
              <div className="space-y-4 py-2">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('ministryWhatsAppConnect', 'monthlySubscription', 'Monthly subscription')}</span>
                    <span className="font-semibold">${selectedPlan.monthlyUsd}/mo</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('ministryWhatsAppConnect', 'oneTimeSetupFee', 'One-time setup fee')}</span>
                    <span className="font-semibold">${selectedPlan.setupUsd}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>{t('ministryWhatsAppConnect', 'dueToday', 'Due today')}</span>
                    <span>${(selectedPlan.monthlyUsd + selectedPlan.setupUsd).toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground bg-gray-50 rounded-lg p-3">
                  {t('ministryWhatsAppConnect', 'afterPaymentGuidance', "After payment you'll be guided through connecting your WhatsApp Business Account via Meta Embedded Signup. Your ministry's own verified name will appear on all messages.")}
                </p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPlanModal(false)}>{t('ministryWhatsAppConnect', 'cancel', 'Cancel')}</Button>
              <Button
                onClick={() => selectedPlan && startSubscription(selectedPlan)}
                disabled={checkingOut}
                className="gap-2"
              >
                {checkingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('ministryWhatsAppConnect', 'payAndContinue', 'Pay & Continue')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ── Has a plan — show connection management ─────────────────────────────
  return (
    <div className="space-y-5 max-w-3xl">
      {/* Status banner */}
      <div className={`rounded-xl border p-4 flex items-center justify-between gap-4 ${
        config.connection_status === 'connected'
          ? 'bg-green-50 border-green-200'
          : config.connection_status === 'error'
          ? 'bg-red-50 border-red-200'
          : 'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-center gap-3">
          <MessageSquare className={`h-5 w-5 ${
            config.connection_status === 'connected' ? 'text-green-600'
            : config.connection_status === 'error' ? 'text-red-500' : 'text-amber-600'
          }`} />
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">
                {config.connection_status === 'connected'
                  ? config.business_display_name
                  : t('ministryWhatsAppConnect', 'whatsappNotConnected', 'WhatsApp Not Connected')}
              </p>
              <StatusBadge status={config.connection_status} />
              <Badge variant="outline" className="text-xs">
                {WHATSAPP_PLANS.find(p => p.id === config.whatsapp_plan)?.name ?? config.whatsapp_plan} {t('ministryWhatsAppConnect', 'planSuffix', 'Plan')}
              </Badge>
            </div>
            {config.connection_status === 'connected' && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {config.phone_number_display} · WABA: {config.waba_id}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={verifyConnection}
          disabled={verifying}
          className="gap-1.5 shrink-0"
        >
          {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t('ministryWhatsAppConnect', 'verify', 'Verify')}
        </Button>
      </div>

      {/* Sender name notice */}
      <Alert className="border-blue-200 bg-blue-50">
        <Shield className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-xs">
          <strong>{t('ministryWhatsAppConnect', 'aboutYourSenderName', 'About your sender name:')}</strong> {t('ministryWhatsAppConnect', 'recipientsSee', 'Recipients see')} <strong>{config.business_display_name || ministryName}</strong> {t('ministryWhatsAppConnect', 'senderNameNotice', 'as the sender — this is your verified WhatsApp Business name. It cannot be changed per message by design; it is permanently tied to your verified WABA and is what makes your messages trusted and recognisable.')}
        </AlertDescription>
      </Alert>

      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
        <TabsList>
          <TabsTrigger value="connect">{t('ministryWhatsAppConnect', 'tabConnection', 'Connection')}</TabsTrigger>
          <TabsTrigger value="templates">{t('ministryWhatsAppConnect', 'tabTemplates', 'Templates')}</TabsTrigger>
          <TabsTrigger value="settings">{t('ministryWhatsAppConnect', 'tabSettings', 'Settings')}</TabsTrigger>
        </TabsList>

        {/* ── Connection tab ── */}
        <TabsContent value="connect" className="space-y-4 mt-4">
          {config.connection_status !== 'connected' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-purple-600" />
                  {t('ministryWhatsAppConnect', 'connectYourWaba', 'Connect Your WhatsApp Business Account')}
                </CardTitle>
                <CardDescription>
                  {t('ministryWhatsAppConnect', 'useEmbeddedSignupOrManual', 'Use Meta Embedded Signup to link your WABA, or enter credentials manually.')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={launchEmbeddedSignup}
                  disabled={connecting}
                  className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white gap-2"
                >
                  {connecting
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <ExternalLink className="h-4 w-4" />}
                  {t('ministryWhatsAppConnect', 'connectViaEmbeddedSignup', 'Connect via Meta Embedded Signup')}
                </Button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs text-muted-foreground"><span className="bg-white px-2">{t('ministryWhatsAppConnect', 'or', 'or')}</span></div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowManualModal(true)}
                  className="w-full gap-2"
                >
                  <Settings className="h-4 w-4" />
                  {t('ministryWhatsAppConnect', 'enterCredentialsManually', 'Enter Credentials Manually')}
                </Button>

                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium">{t('ministryWhatsAppConnect', 'whatEmbeddedSignupDoes', 'What Meta Embedded Signup does:')}</p>
                  {[
                    t('ministryWhatsAppConnect', 'signupStep1', 'Creates or links your WhatsApp Business Account (WABA)'),
                    t('ministryWhatsAppConnect', 'signupStep2', 'Registers and verifies your dedicated phone number'),
                    t('ministryWhatsAppConnect', 'signupStep3', 'Grants this platform permission to send on your behalf'),
                    t('ministryWhatsAppConnect', 'signupStep4', 'Keeps credentials isolated — your number is only used for your ministry'),
                  ].map(s => (
                    <div key={s} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                      {s}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: t('ministryWhatsAppConnect', 'businessDisplayName', 'Business Display Name'), value: config.business_display_name, note: t('ministryWhatsAppConnect', 'verifiedCannotChange', 'Verified — cannot be changed per message') },
                    { label: t('ministryWhatsAppConnect', 'phoneNumber', 'Phone Number'), value: config.phone_number_display, note: t('ministryWhatsAppConnect', 'dedicatedToMinistry', 'Dedicated to your ministry') },
                    { label: t('ministryWhatsAppConnect', 'wabaId', 'WABA ID'), value: config.waba_id, note: t('ministryWhatsAppConnect', 'yourWabaNote', 'Your WhatsApp Business Account') },
                    { label: t('ministryWhatsAppConnect', 'phoneNumberId', 'Phone Number ID'), value: config.phone_number_id, note: t('ministryWhatsAppConnect', 'usedForApiCalls', 'Used for API calls') },
                  ].map(({ label, value, note }) => (
                    <div key={label} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm font-medium mt-0.5 break-all">{value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{note}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {t('ministryWhatsAppConnect', 'connectedOnX', 'Connected {date}').replace('{date}', new Date(config.updated_at).toLocaleDateString())}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Templates tab ── */}
        <TabsContent value="templates" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('ministryWhatsAppConnect', 'messageTemplates', 'Message Templates')}</p>
              <p className="text-xs text-muted-foreground">
                {t('ministryWhatsAppConnect', 'templatesRequireApproval', 'WhatsApp requires pre-approved templates for certain message types.')}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadTemplates}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('ministryWhatsAppConnect', 'refresh', 'Refresh')}
            </Button>
          </div>

          {templates.length === 0 ? (
            <div className="text-center py-10 border rounded-xl bg-gray-50">
              <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t('ministryWhatsAppConnect', 'noTemplatesYet', 'No templates yet.')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('ministryWhatsAppConnect', 'createTemplatesHint', "Create templates in your Meta Business Manager and they'll appear here once approved.")}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-2"
                onClick={() => window.open('https://business.facebook.com/wa/manage/message-templates/', '_blank')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t('ministryWhatsAppConnect', 'openMetaBusinessManager', 'Open Meta Business Manager')}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map(tpl => (
                <div key={tpl.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{tpl.name}</p>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          tpl.status === 'APPROVED' ? 'text-green-700 border-green-200 bg-green-50'
                          : tpl.status === 'REJECTED' ? 'text-red-700 border-red-200 bg-red-50'
                          : 'text-amber-700 border-amber-200 bg-amber-50'
                        }`}
                      >
                        {tpl.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {tpl.category} · {tpl.language}
                    </p>
                    <p className="text-xs text-muted-foreground truncate max-w-md mt-0.5">{tpl.body_text}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { navigator.clipboard.writeText(tpl.name); toast({ title: t('ministryWhatsAppConnect', 'copiedTemplateName', 'Copied template name') }); }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Settings tab ── */}
        <TabsContent value="settings" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('ministryWhatsAppConnect', 'planAndBilling', 'Plan & Billing')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">{t('ministryWhatsAppConnect', 'currentPlan', 'Current Plan')}</p>
                  <p className="text-xs text-muted-foreground">
                    {WHATSAPP_PLANS.find(p => p.id === config.whatsapp_plan)?.name} ·{' '}
                    ${WHATSAPP_PLANS.find(p => p.id === config.whatsapp_plan)?.monthlyUsd}/mo
                  </p>
                </div>
                <Badge variant="outline" className="capitalize">{config.plan_status}</Badge>
              </div>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowPlanModal(true)}>
                <Zap className="h-3.5 w-3.5" />
                {t('ministryWhatsAppConnect', 'upgradePlan', 'Upgrade Plan')}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-red-100">
            <CardHeader>
              <CardTitle className="text-base text-red-700">{t('ministryWhatsAppConnect', 'dangerZone', 'Danger Zone')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                className="border-red-200 text-red-600 hover:bg-red-50 gap-2"
                onClick={async () => {
                  if (!confirm(t('ministryWhatsAppConnect', 'disconnectConfirm', 'Disconnect your WhatsApp Business Account? You can reconnect later.'))) return;
                  await supabase
                    .from('ministry_whatsapp_configs')
                    .update({ connection_status: 'pending', phone_number_id: '', waba_id: '' })
                    .eq('ministry_id', ministryId);
                  loadConfig();
                  toast({ title: t('ministryWhatsAppConnect', 'disconnected', 'Disconnected'), description: t('ministryWhatsAppConnect', 'reconnectAnyTime', 'You can reconnect any time.') });
                }}
              >
                <XCircle className="h-3.5 w-3.5" />
                {t('ministryWhatsAppConnect', 'disconnectWhatsapp', 'Disconnect WhatsApp')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Manual credentials modal */}
      <Dialog open={showManualModal} onOpenChange={setShowManualModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {t('ministryWhatsAppConnect', 'manualWabaCredentials', 'Manual WABA Credentials')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Alert className="border-amber-200 bg-amber-50 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-xs">
                {t('ministryWhatsAppConnect', 'credentialsEncryptedNotice', 'Credentials are stored encrypted and are only used to send messages on behalf of your ministry.')}
              </AlertDescription>
            </Alert>
            {[
              { key: 'waba_id', label: t('ministryWhatsAppConnect', 'wabaId', 'WABA ID'), placeholder: '1234567890' },
              { key: 'phone_number_id', label: t('ministryWhatsAppConnect', 'phoneNumberId', 'Phone Number ID'), placeholder: '0987654321' },
              { key: 'phone_number_display', label: t('ministryWhatsAppConnect', 'phoneNumberDisplay', 'Phone Number (display)'), placeholder: '+1 555 000 1234' },
              { key: 'business_display_name', label: t('ministryWhatsAppConnect', 'businessDisplayName', 'Business Display Name'), placeholder: 'Grace Community Church' },
              { key: 'access_token', label: t('ministryWhatsAppConnect', 'permanentAccessToken', 'Permanent Access Token'), placeholder: 'EAABxxxxxx...' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-sm">{label}</Label>
                <Input
                  placeholder={placeholder}
                  type={key === 'access_token' ? 'password' : 'text'}
                  value={(manualForm as any)[key]}
                  onChange={e => setManualForm(prev => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManualModal(false)}>{t('ministryWhatsAppConnect', 'cancel', 'Cancel')}</Button>
            <Button onClick={saveManualCredentials} disabled={connecting} className="gap-2">
              {connecting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('ministryWhatsAppConnect', 'saveCredentials', 'Save Credentials')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Twilio credentials modal — removed: admin provisions Twilio numbers centrally */}
    </div>
  );
};
