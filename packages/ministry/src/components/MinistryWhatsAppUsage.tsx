import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { toast } from '@rekindle/ui/use-toast';
import {
  Wallet, MessageSquare, TrendingUp, Users, RefreshCw,
  CheckCircle2, XCircle, Clock, AlertTriangle, Info,
  Loader2, CreditCard, ArrowDownLeft, ArrowUpRight,
  BarChart3, Send, Phone, ShieldCheck,
} from 'lucide-react';
import { BroadcastWallet } from './BroadcastWallet';
import type { MinistryWABAConfig } from './MinistryWhatsAppConnect';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_INCLUDED: Record<string, number | null> = {
  basic:   1000,
  growth:  5000,
  premium: null,  // unlimited (usage-billed)
};

const PLAN_RATE: Record<string, number> = {
  basic:   0.030,
  growth:  0.025,
  premium: 0.020,
};

const PLAN_MONTHLY_FEE: Record<string, number> = {
  basic:   10,
  growth:  35,
  premium: 75,
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface BroadcastRecord {
  id: string;
  title: string;
  message_type: string;
  target_type: string;
  recipient_count: number;
  successful_sends: number;
  failed_sends: number;
  cost_usd: number;
  overage_cost_usd: number;
  status: string;
  sent_at: string | null;
  created_at: string;
}

interface Subscriber {
  id: string;
  phone_number: string;
  user_id: string | null;
  opted_in: boolean;
  opted_in_at: string;
  opted_out_at: string | null;
}

interface WalletTransaction {
  id: string;
  type: string;
  credits: number;
  usd_amount: number | null;
  description: string;
  recipients_count: number | null;
  status: string;
  created_at: string;
}

interface UsageStats {
  monthlyUsed: number;
  monthlyIncluded: number | null;
  monthlyOverageCost: number;
  monthlyTotalCost: number;
  totalBroadcasts: number;
  totalMessagesSent: number;
  avgDeliveryRate: number;
  subscriberCount: number;
  optedOutCount: number;
}

interface MinistryWhatsAppUsageProps {
  ministryId: string;
  wabaConfig: MinistryWABAConfig | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtUSD(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

function startOfMonth() {
  const d = new Date();
  d.setDate(1); d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ─── Quota progress bar ───────────────────────────────────────────────────────

function QuotaBar({
  used, included, plan,
}: { used: number; included: number | null; plan: string }) {
  const { t } = useLanguage();
  const pct = included ? Math.min(100, (used / included) * 100) : 0;
  const over = included ? used > included : false;

  if (included === null) {
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t('ministryWhatsAppUsage', 'messagesThisMonth', 'Messages this month')}</span>
          <span className="font-semibold">{used.toLocaleString()} {t('ministryWhatsAppUsage', 'sent', 'sent')}</span>
        </div>
        <div className="h-2 rounded-full bg-green-100">
          <div className="h-full w-full rounded-full bg-green-500 opacity-30" />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('ministryWhatsAppUsage', 'premiumUnlimitedBilled', 'Premium plan — unlimited messages, billed at ${rate}/msg').replace('{rate}', String(PLAN_RATE[plan]?.toFixed(3)))}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{t('ministryWhatsAppUsage', 'monthlyIncludedQuota', 'Monthly included quota')}</span>
        <span className={`font-semibold ${over ? 'text-amber-600' : 'text-foreground'}`}>
          {used.toLocaleString()} / {included.toLocaleString()} {t('ministryWhatsAppUsage', 'msgs', 'msgs')}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-green-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{Math.round(pct)}% {t('ministryWhatsAppUsage', 'used', 'used')}</span>
        <span>{Math.max(0, included - used).toLocaleString()} {t('ministryWhatsAppUsage', 'remaining', 'remaining')}</span>
      </div>
      {over && (
        <p className="text-xs text-amber-700 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {t('ministryWhatsAppUsage', 'messagesOverQuota', '{count} messages over quota — billed at ${rate}/msg from your wallet').replace('{count}', (used - included).toLocaleString()).replace('{rate}', String(PLAN_RATE[plan]?.toFixed(3)))}
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const MinistryWhatsAppUsage: React.FC<MinistryWhatsAppUsageProps> = ({
  ministryId,
  wabaConfig,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading]           = useState(true);
  const [stats, setStats]               = useState<UsageStats | null>(null);
  const [broadcasts, setBroadcasts]     = useState<BroadcastRecord[]>([]);
  const [subscribers, setSubscribers]   = useState<Subscriber[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [activeSection, setActiveSection] = useState<
    'overview' | 'history' | 'subscribers' | 'wallet'
  >('overview');

  const plan = wabaConfig?.whatsapp_plan ?? 'basic';

  // ── Load all data ──────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadBroadcasts(),
        loadSubscribers(),
        loadTransactions(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [ministryId, user]);

  const loadBroadcasts = useCallback(async () => {
    const { data } = await supabase
      .from('ministry_whatsapp_broadcasts')
      .select('*')
      .eq('ministry_id', ministryId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!data) return;
    setBroadcasts(data);

    // Compute stats from this month's data
    const thisMonth = data.filter(b =>
      b.status === 'sent' && b.sent_at && b.sent_at >= startOfMonth()
    );
    const monthlyUsed  = thisMonth.reduce((s, b) => s + (b.successful_sends ?? 0), 0);
    const monthlyOver  = thisMonth.reduce((s, b) => s + (Number(b.overage_cost_usd) ?? 0), 0);
    const monthlyTotal = thisMonth.reduce((s, b) => s + (Number(b.cost_usd) ?? 0), 0);

    const allSent   = data.filter(b => b.status === 'sent');
    const totalSent = allSent.reduce((s, b) => s + (b.successful_sends ?? 0), 0);
    const totalRecip = allSent.reduce((s, b) => s + (b.recipient_count ?? 0), 0);
    const avgRate   = totalRecip > 0 ? Math.round((totalSent / totalRecip) * 100) : 0;

    setStats(prev => ({
      ...(prev ?? {}),
      monthlyUsed,
      monthlyIncluded: PLAN_INCLUDED[plan] ?? null,
      monthlyOverageCost: monthlyOver,
      monthlyTotalCost:   monthlyTotal,
      totalBroadcasts:    data.length,
      totalMessagesSent:  totalSent,
      avgDeliveryRate:    avgRate,
      subscriberCount:    prev?.subscriberCount ?? 0,
      optedOutCount:      prev?.optedOutCount ?? 0,
    }));
  }, [ministryId, plan]);

  const loadSubscribers = useCallback(async () => {
    const { data } = await supabase
      .from('ministry_whatsapp_subscribers')
      .select('*')
      .eq('ministry_id', ministryId)
      .order('opted_in_at', { ascending: false });

    if (!data) return;
    setSubscribers(data);
    const optedIn  = data.filter(s => s.opted_in).length;
    const optedOut = data.filter(s => !s.opted_in).length;
    setStats(prev => prev ? { ...prev, subscriberCount: optedIn, optedOutCount: optedOut } : null);
  }, [ministryId]);

  const loadTransactions = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('broadcast_wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setTransactions(data ?? []);
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Remove subscriber (manual opt-out) ────────────────────────────────
  const removeSubscriber = async (id: string, phone: string) => {
    if (!confirm(t('ministryWhatsAppUsage', 'confirmRemoveSubscriber', 'Remove {phone} from your subscriber list?').replace('{phone}', String(phone)))) return;
    await supabase
      .from('ministry_whatsapp_subscribers')
      .update({ opted_in: false, opted_out_at: new Date().toISOString() })
      .eq('id', id);
    toast({ title: t('ministryWhatsAppUsage', 'subscriberRemoved', 'Subscriber removed') });
    loadSubscribers();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-green-600" />
      </div>
    );
  }

  const monthlyFee = PLAN_MONTHLY_FEE[plan] ?? 0;

  // ── Nav pills ──────────────────────────────────────────────────────────
  const sections = [
    { id: 'overview',    label: t('ministryWhatsAppUsage', 'navOverview', 'Overview'),     icon: BarChart3 },
    { id: 'history',     label: t('ministryWhatsAppUsage', 'navBroadcasts', 'Broadcasts'),   icon: Send      },
    { id: 'subscribers', label: t('ministryWhatsAppUsage', 'navSubscribers', 'Subscribers'),  icon: Users     },
    { id: 'wallet',      label: t('ministryWhatsAppUsage', 'navCredits', 'Credits'),      icon: Wallet    },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Section nav */}
      <div className="flex gap-2 flex-wrap">
        {sections.map(s => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                activeSection === s.id
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white border-gray-200 text-muted-foreground hover:border-green-300 hover:text-green-700'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
          );
        })}
        <button
          onClick={loadAll}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm border border-gray-200 text-muted-foreground hover:bg-gray-50 ml-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('ministryWhatsAppUsage', 'refresh', 'Refresh')}
        </button>
      </div>

      {/* ── OVERVIEW ── */}
      {activeSection === 'overview' && (
        <div className="space-y-4">
          {/* Plan banner */}
          {wabaConfig && (
            <div className="rounded-xl border bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <MessageSquare className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-green-900">
                        {wabaConfig.business_display_name || t('ministryWhatsAppUsage', 'yourMinistry', 'Your Ministry')}
                      </p>
                      <Badge
                        variant="outline"
                        className="text-xs bg-white border-green-300 text-green-700 capitalize"
                      >
                        {plan} {t('ministryWhatsAppUsage', 'planSuffix', 'plan')}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs capitalize ${
                          wabaConfig.plan_status === 'active'
                            ? 'bg-green-50 border-green-200 text-green-700'
                            : 'bg-amber-50 border-amber-200 text-amber-700'
                        }`}
                      >
                        {wabaConfig.plan_status}
                      </Badge>
                    </div>
                    <p className="text-xs text-green-700 mt-0.5">
                      {wabaConfig.phone_number_display} · {t('ministryWhatsAppUsage', 'moSubscription', '${fee}/mo subscription').replace('{fee}', String(monthlyFee))}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{t('ministryWhatsAppUsage', 'thisMonthsTotalCost', "This month's total cost")}</p>
                  <p className="text-2xl font-bold text-green-700">
                    {fmtUSD((stats?.monthlyTotalCost ?? 0) + monthlyFee)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtUSD(monthlyFee)} {t('ministryWhatsAppUsage', 'planPlusOverage', 'plan')} + {fmtUSD(stats?.monthlyOverageCost ?? 0)} {t('ministryWhatsAppUsage', 'overageSuffix', 'overage')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Quota progress */}
          <Card>
            <CardContent className="pt-5 pb-4 space-y-4">
              <QuotaBar
                used={stats?.monthlyUsed ?? 0}
                included={stats?.monthlyIncluded ?? PLAN_INCLUDED[plan] ?? 0}
                plan={plan}
              />
              {/* Overage alert */}
              {stats?.monthlyOverageCost != null && stats.monthlyOverageCost > 0 && (
                <Alert className="border-amber-200 bg-amber-50 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800 text-xs">
                    {t('ministryWhatsAppUsage', 'overQuotaThisMonth', "You've gone over your included quota this month.")}
                    {' '}{t('ministryWhatsAppUsage', 'chargedFromWallet', '{amount} was charged from your credit wallet.').replace('{amount}', fmtUSD(stats.monthlyOverageCost))}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                icon: Send,
                label: t('ministryWhatsAppUsage', 'broadcastsThisMonth', 'Broadcasts this month'),
                value: broadcasts.filter(b =>
                  b.status === 'sent' && (b.sent_at ?? '') >= startOfMonth()
                ).length,
                colour: 'bg-blue-100 text-blue-600',
              },
              {
                icon: MessageSquare,
                label: t('ministryWhatsAppUsage', 'messagesSentThisMonth', 'Messages sent this month'),
                value: (stats?.monthlyUsed ?? 0).toLocaleString(),
                colour: 'bg-green-100 text-green-600',
              },
              {
                icon: TrendingUp,
                label: t('ministryWhatsAppUsage', 'avgDeliveryRate', 'Avg delivery rate'),
                value: `${stats?.avgDeliveryRate ?? 0}%`,
                colour: 'bg-purple-100 text-purple-600',
              },
              {
                icon: Users,
                label: t('ministryWhatsAppUsage', 'activeSubscribers', 'Active subscribers'),
                value: (stats?.subscriberCount ?? 0).toLocaleString(),
                sub: t('ministryWhatsAppUsage', 'optedOutCount', '{count} opted out').replace('{count}', String(stats?.optedOutCount ?? 0)),
                colour: 'bg-indigo-100 text-indigo-600',
              },
            ].map(({ icon: Icon, label, value, sub, colour }) => (
              <Card key={label} className="border-0 shadow-sm">
                <CardContent className="pt-4 pb-3 flex items-start gap-2.5">
                  <div className={`p-1.5 rounded-lg ${colour}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-xl font-bold leading-tight">{value}</p>
                    {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Cost breakdown this month */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                {t('ministryWhatsAppUsage', 'costBreakdownTitle', "This Month's Cost Breakdown")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b">
                <span className="text-muted-foreground">{t('ministryWhatsAppUsage', 'monthlySubscriptionLine', 'Monthly subscription ({plan} plan)').replace('{plan}', String(plan))}</span>
                <span className="font-medium">{fmtUSD(monthlyFee)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b">
                <span className="text-muted-foreground">
                  {t('ministryWhatsAppUsage', 'includedQuotaLine', 'Included quota ({count} msgs)').replace('{count}', (PLAN_INCLUDED[plan] ?? 0)?.toLocaleString() ?? '∞')}
                </span>
                <span className="font-medium text-green-700">$0.00</span>
              </div>
              <div className="flex justify-between py-1.5 border-b">
                <span className="text-muted-foreground">
                  {t('ministryWhatsAppUsage', 'overageLine', 'Overage ({count} msgs × ${rate})').replace('{count}', Math.max(0, (stats?.monthlyUsed ?? 0) - (PLAN_INCLUDED[plan] ?? Infinity)).toLocaleString()).replace('{rate}', String(PLAN_RATE[plan]?.toFixed(3)))}
                </span>
                <span className={`font-medium ${(stats?.monthlyOverageCost ?? 0) > 0 ? 'text-amber-600' : ''}`}>
                  {fmtUSD(stats?.monthlyOverageCost ?? 0)}
                </span>
              </div>
              <div className="flex justify-between py-1.5 font-semibold">
                <span>{t('ministryWhatsAppUsage', 'total', 'Total')}</span>
                <span className="text-green-700">
                  {fmtUSD((stats?.monthlyTotalCost ?? 0) + monthlyFee)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Compliance notice */}
          <Alert className="border-blue-200 bg-blue-50">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800 text-xs">
              <strong>{t('ministryWhatsAppUsage', 'complianceLabel', 'Compliance:')}</strong> {t('ministryWhatsAppUsage', 'complianceBody', 'Subscribers can opt out at any time by replying STOP. Opt-outs are processed automatically and those numbers are removed from all future broadcasts. You are responsible for including unsubscribe instructions in your first message to new subscribers.')}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* ── BROADCAST HISTORY ── */}
      {activeSection === 'history' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('ministryWhatsAppUsage', 'allBroadcastsSentFrom', 'All broadcasts sent from')} <strong>{wabaConfig?.business_display_name || t('ministryWhatsAppUsage', 'yourMinistryLower', 'your ministry')}</strong>.
          </p>

          {broadcasts.length === 0 ? (
            <div className="text-center py-12 border rounded-xl bg-gray-50">
              <Send className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t('ministryWhatsAppUsage', 'noBroadcastsYet', 'No broadcasts sent yet.')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {broadcasts.map(b => {
                const deliveryRate = b.recipient_count > 0
                  ? Math.round((b.successful_sends / b.recipient_count) * 100)
                  : 0;
                return (
                  <Card key={b.id} className="hover:bg-gray-50 transition-colors">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium truncate">{b.title || t('ministryWhatsAppUsage', 'noTitle', '(no title)')}</p>
                            <Badge variant="outline" className={`text-xs shrink-0 ${
                              b.status === 'sent'      ? 'text-green-700 bg-green-50 border-green-200'
                              : b.status === 'scheduled' ? 'text-blue-700 bg-blue-50 border-blue-200'
                              : 'text-red-700 bg-red-50 border-red-200'
                            }`}>{b.status}</Badge>
                            <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
                              {b.message_type}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {fmt(b.sent_at || b.created_at)} · {b.target_type}
                          </p>
                        </div>
                        <div className="text-right shrink-0 space-y-1">
                          <div className="flex items-center gap-2 justify-end">
                            {b.successful_sends > 0 && (
                              <span className="flex items-center gap-0.5 text-emerald-600 text-xs font-medium">
                                <CheckCircle2 className="h-3 w-3" />
                                {b.successful_sends.toLocaleString()}
                              </span>
                            )}
                            {b.failed_sends > 0 && (
                              <span className="flex items-center gap-0.5 text-red-500 text-xs font-medium">
                                <XCircle className="h-3 w-3" />
                                {b.failed_sends.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {b.recipient_count.toLocaleString()} {t('ministryWhatsAppUsage', 'recipients', 'recipients')} · {deliveryRate}%
                          </p>
                          {b.cost_usd > 0 && (
                            <p className="text-xs font-medium text-green-700">{fmtUSD(b.cost_usd)}</p>
                          )}
                        </div>
                      </div>

                      {/* Delivery rate bar */}
                      {b.recipient_count > 0 && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                deliveryRate === 100 ? 'bg-emerald-500'
                                : deliveryRate >= 80 ? 'bg-amber-400'
                                : 'bg-red-400'
                              }`}
                              style={{ width: `${deliveryRate}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 tabular-nums text-right">
                            {deliveryRate}%
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SUBSCRIBERS ── */}
      {activeSection === 'subscribers' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {subscribers.filter(s => s.opted_in).length.toLocaleString()} {t('ministryWhatsAppUsage', 'activeSubscribersLower', 'active subscribers')}
              </p>
              <p className="text-xs text-muted-foreground">
                {subscribers.filter(s => !s.opted_in).length} {t('ministryWhatsAppUsage', 'optedOutLower', 'opted out')}
              </p>
            </div>
          </div>

          <Alert className="border-blue-200 bg-blue-50 py-2">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800 text-xs">
              {t('ministryWhatsAppUsage', 'subscribersInfoNotice', 'Subscribers are added when members opt in via your WhatsApp number. You can remove a subscriber manually — they can re-subscribe by replying START.')}
            </AlertDescription>
          </Alert>

          {subscribers.length === 0 ? (
            <div className="text-center py-12 border rounded-xl bg-gray-50">
              <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t('ministryWhatsAppUsage', 'noSubscribersYet', 'No subscribers yet.')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('ministryWhatsAppUsage', 'shareWhatsAppNumber', 'Share your WhatsApp number and ask members to message you to subscribe.')}
              </p>
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-xs text-muted-foreground uppercase">
                    <th className="text-left px-4 py-2.5">{t('ministryWhatsAppUsage', 'colPhone', 'Phone')}</th>
                    <th className="text-center px-4 py-2.5">{t('ministryWhatsAppUsage', 'colStatus', 'Status')}</th>
                    <th className="text-left px-4 py-2.5 hidden md:table-cell">{t('ministryWhatsAppUsage', 'colSubscribed', 'Subscribed')}</th>
                    <th className="text-left px-4 py-2.5 hidden md:table-cell">{t('ministryWhatsAppUsage', 'colOptedOut', 'Opted out')}</th>
                    <th className="text-right px-4 py-2.5">{t('ministryWhatsAppUsage', 'colAction', 'Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map(s => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm font-mono">{s.phone_number}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            s.opted_in
                              ? 'text-green-700 bg-green-50 border-green-200'
                              : 'text-gray-500 bg-gray-50 border-gray-200'
                          }`}
                        >
                          {s.opted_in ? t('ministryWhatsAppUsage', 'statusActive', 'Active') : t('ministryWhatsAppUsage', 'statusOptedOut', 'Opted out')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                        {fmt(s.opted_in_at)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                        {s.opted_out_at ? fmt(s.opted_out_at) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.opted_in && (
                          <button
                            onClick={() => removeSubscriber(s.id, s.phone_number)}
                            className="text-xs text-red-500 hover:text-red-700 hover:underline"
                          >
                            {t('ministryWhatsAppUsage', 'remove', 'Remove')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── WALLET / CREDITS ── */}
      {activeSection === 'wallet' && (
        <div className="space-y-4">
          {/* Credits context for this ministry */}
          <Card className="border-green-100 bg-green-50/50">
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <div className="text-xs text-green-800 space-y-0.5">
                  <p>
                    <strong>{t('ministryWhatsAppUsage', 'howCreditsWorkLabel', 'How credits work for your ministry:')}</strong> {t('ministryWhatsAppUsage', 'howCreditsWorkBody', 'Your {plan} plan includes {included} messages per month at no extra cost. Messages beyond that quota are charged at ${rate}/msg from your credit wallet.').replace('{plan}', String(plan)).replace('{included}', PLAN_INCLUDED[plan]?.toLocaleString() ?? t('ministryWhatsAppUsage', 'unlimited', 'unlimited')).replace('{rate}', String(PLAN_RATE[plan]?.toFixed(3)))}
                  </p>
                  <p>
                    {t('ministryWhatsAppUsage', 'creditsDeductedNote', 'Credits are deducted only for successfully delivered messages. Failed deliveries are not charged.')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Full wallet component */}
          <BroadcastWallet compact={false} />

          {/* Ministry-scoped deduction history from transactions */}
          {transactions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {t('ministryWhatsAppUsage', 'recentCreditActivity', 'Recent Credit Activity')}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t('ministryWhatsAppUsage', 'walletMovementsDesc', 'Wallet movements related to your broadcasts')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                {transactions.slice(0, 15).map(tx => {
                  const isCredit = tx.credits > 0;
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`p-1 rounded-full shrink-0 ${isCredit ? 'bg-green-100' : 'bg-red-50'}`}>
                          {isCredit
                            ? <ArrowDownLeft className="h-3.5 w-3.5 text-green-600" />
                            : <ArrowUpRight className="h-3.5 w-3.5 text-red-500" />
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{tx.description || tx.type}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {fmt(tx.created_at)}
                            {tx.recipients_count ? ` · ${tx.recipients_count.toLocaleString()} ${t('ministryWhatsAppUsage', 'msgs', 'msgs')}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className={`text-sm font-semibold tabular-nums ${isCredit ? 'text-green-600' : 'text-red-500'}`}>
                          {isCredit ? '+' : ''}{tx.credits.toLocaleString()}
                        </p>
                        {tx.usd_amount != null && (
                          <p className="text-[10px] text-muted-foreground">
                            ${Math.abs(tx.usd_amount).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
