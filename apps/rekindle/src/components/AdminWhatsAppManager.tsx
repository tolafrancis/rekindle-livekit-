import React, { useState, useEffect, useCallback } from 'react';
import { useViewHistory } from '@rekindle/features/hooks/useViewHistory';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Alert, AlertDescription } from './ui/alert';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from './ui/use-toast';
import {
  Wallet, MessageSquare, Users, DollarSign, TrendingUp,
  RefreshCw, Search, CheckCircle2, XCircle, Clock, AlertTriangle,
  Shield, Phone, Building2, Eye, Gift, Zap, Send, Filter,
  ChevronDown, ChevronUp, Loader2, CreditCard,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WalletRow {
  id: string;
  user_id: string;
  balance_credits: number;
  total_purchased: number;
  total_used: number;
  updated_at: string;
  email?: string;
  full_name?: string;
}

interface WABARow {
  id: string;
  ministry_id: string;
  ministry_name?: string;
  waba_id: string;
  phone_number_display: string;
  business_display_name: string;
  connection_status: 'pending' | 'connected' | 'error' | 'suspended';
  whatsapp_plan: 'none' | 'basic' | 'growth' | 'premium';
  plan_status: 'none' | 'active' | 'trialing' | 'past_due' | 'cancelled' | 'pending';
  setup_fee_paid: boolean;
  last_verified_at: string | null;
  updated_at: string;
}

interface BroadcastRow {
  id: string;
  ministry_id: string;
  ministry_name?: string;
  title: string;
  message_type: string;
  target_type: string;
  recipient_count: number;
  successful_sends: number;
  failed_sends: number;
  cost_usd: number;
  status: string;
  sent_at: string;
  created_at: string;
}

interface TransactionRow {
  id: string;
  user_id: string;
  type: string;
  credits: number;
  usd_amount: number;
  description: string;
  status: string;
  created_at: string;
  email?: string;
  full_name?: string;
}

interface RevenueStats {
  totalWalletRevenue: number;
  totalWhatsAppPlanRevenue: number;
  activeWABACount: number;
  totalWalletCreditsOutstanding: number;
  totalBroadcastsSent: number;
  totalMessagesSent: number;
  monthlyRevenue: number;
}


interface ChannelSubscriberRow {
  id: string;
  channel_id: string;
  user_id: string;
  phone_number: string;
  subscribed_at: string | null;
  channel_name?: string;
  full_name?: string;
  email?: string;
}

interface WhatsAppChannel {
  id: string;
  name: string;
  is_active: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAN_COLOURS: Record<string, string> = {
  basic:   'bg-blue-100 text-blue-800 border-blue-200',
  growth:  'bg-purple-100 text-purple-800 border-purple-200',
  premium: 'bg-amber-100 text-amber-800 border-amber-200',
  none:    'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_COLOURS: Record<string, string> = {
  connected:  'bg-green-100 text-green-800 border-green-200',
  pending:    'bg-amber-100 text-amber-800 border-amber-200',
  error:      'bg-red-100 text-red-800 border-red-200',
  suspended:  'bg-gray-100 text-gray-600 border-gray-200',
  active:     'bg-green-100 text-green-800 border-green-200',
  trialing:   'bg-blue-100 text-blue-800 border-blue-200',
  past_due:   'bg-red-100 text-red-800 border-red-200',
  cancelled:  'bg-gray-100 text-gray-600 border-gray-200',
};

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

// ─── Summary card ─────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, colour }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; colour: string;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="pt-5 pb-4 flex items-start gap-3">
        <div className={`p-2 rounded-lg ${colour}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const AdminWhatsAppManager: React.FC = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useViewHistory<'overview' | 'wallets' | 'waba' | 'broadcasts' | 'transactions' | 'subscribers' | 'settings'>("admin-whatsapp", 'overview');
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [stats, setStats]               = useState<RevenueStats | null>(null);
  const [wallets, setWallets]           = useState<WalletRow[]>([]);
  const [wabas, setWabas]               = useState<WABARow[]>([]);
  const [broadcasts, setBroadcasts]     = useState<BroadcastRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [subscribers, setSubscribers] = useState<ChannelSubscriberRow[]>([]);
  const [waChannels, setWaChannels] = useState<WhatsAppChannel[]>([]);
  const [subSearch, setSubSearch] = useState('');
  const [subChannelFilter, setSubChannelFilter] = useState('all');
  const [subLoading, setSubLoading] = useState(false);
  const [reminderProvider, setReminderProvider] = useState<'twilio' | 'meta'>('twilio');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Credit grant modal
  const [showGrantModal, setShowGrantModal]   = useState(false);
  const [grantTarget, setGrantTarget]         = useState<WalletRow | null>(null);
  const [grantAmount, setGrantAmount]         = useState('');
  const [grantReason, setGrantReason]         = useState('');
  const [granting, setGranting]               = useState(false);

  // WABA detail modal
  const [selectedWABA, setSelectedWABA]       = useState<WABARow | null>(null);

  // Twilio provisioning modal
  const [showTwilioProvision, setShowTwilioProvision] = useState(false);
  const [twilioTarget, setTwilioTarget]               = useState<WABARow | null>(null);
  const [twilioProvisionForm, setTwilioProvisionForm] = useState({
    from_number:           '',   // e.g. +14155238886
    business_display_name: '',
  });
  const [provisioning, setProvisioning] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'whatsapp_reminder_provider')
        .maybeSingle();
      if (data?.value) setReminderProvider(data.value as 'twilio' | 'meta');
      setSettingsLoaded(true);
    } catch (err) {
      console.error('Error loading settings:', err);
      setSettingsLoaded(true);
    }
  }, []);

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      await supabase
        .from('platform_settings')
        .upsert({ key: 'whatsapp_reminder_provider', value: reminderProvider, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      toast({ title: t('adminWhatsAppManager', 'settingsSaved', 'Settings saved'), description: t('adminWhatsAppManager', 'reminderProviderSetTo', 'Reminder provider set to {provider}').replace('{provider}', reminderProvider === 'twilio' ? 'Twilio' : 'Meta') });
    } catch (err) {
      toast({ title: t('adminWhatsAppManager', 'errorSavingSettings', 'Error saving settings'), variant: 'destructive' });
    } finally {
      setSettingsSaving(false);
    }
  };

  const loadSubscribers = useCallback(async () => {
    setSubLoading(true);
    try {
      // Load channels list for filter dropdown
      const { data: chData } = await supabase
        .from('whatsapp_channels')
        .select('id, name, is_active')
        .order('name');
      if (chData) setWaChannels(chData);

      // Load subscribers joined to user_profiles
      const { data, error } = await supabase
        .from('whatsapp_channel_subscribers')
        .select(`
          id, channel_id, user_id, phone_number, subscribed_at,
          user_profiles(full_name, email),
          whatsapp_channels(name)
        `)
        .order('subscribed_at', { ascending: false });

      if (error) throw error;

      const rows: ChannelSubscriberRow[] = (data ?? []).map((r: any) => ({
        id:            r.id,
        channel_id:    r.channel_id,
        user_id:       r.user_id,
        phone_number:  r.phone_number,
        subscribed_at: r.subscribed_at,
        channel_name:  r.whatsapp_channels?.name ?? '—',
        full_name:     r.user_profiles?.full_name ?? null,
        email:         r.user_profiles?.email ?? null,
      }));
      setSubscribers(rows);
    } catch (err) {
      console.error('Error loading subscribers:', err);
    } finally {
      setSubLoading(false);
    }
  }, []);

  // ── Data loading ────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadWallets(),
        loadWABAs(),
        loadBroadcasts(),
        loadTransactions(),
      ]);
      await computeStats();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadWallets = async () => {
    const { data } = await supabase
      .from('broadcast_wallet_summary')   // uses the view we created in migration
      .select('*')
      .order('balance_credits', { ascending: false });

    if (data) setWallets(data);
    else {
      // Fallback if view doesn't exist yet
      const { data: raw } = await supabase
        .from('broadcast_wallets')
        .select('*')
        .order('balance_credits', { ascending: false });
      setWallets(raw ?? []);
    }
  };

  const loadWABAs = async () => {
    const { data } = await supabase
      .from('ministry_whatsapp_configs')
      .select(`
        *,
        ministry_groups ( name )
      `)
      .order('updated_at', { ascending: false });

    if (data) {
      setWabas(data.map((r: any) => ({
        ...r,
        ministry_name: r.ministry_groups?.name ?? '—',
      })));
    }
  };

  const loadBroadcasts = async () => {
    const { data } = await supabase
      .from('ministry_whatsapp_broadcasts')
      .select(`
        *,
        ministry_groups ( name )
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (data) {
      setBroadcasts(data.map((r: any) => ({
        ...r,
        ministry_name: r.ministry_groups?.name ?? '—',
      })));
    }
  };

  const loadTransactions = async () => {
    const { data } = await supabase
      .from('broadcast_wallet_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (data) setTransactions(data);
  };

  const computeStats = async () => {
    // Wallet credits outstanding
    const { data: walletData } = await supabase
      .from('broadcast_wallets')
      .select('balance_credits, total_purchased, total_used');

    const totalOutstanding  = (walletData ?? []).reduce((s: number, r: any) => s + (r.balance_credits ?? 0), 0);
    const totalWalletRev    = (walletData ?? []).reduce((s: number, r: any) => s + (r.total_purchased ?? 0) * 0.03, 0);

    // Active WABA plans
    const { data: planData } = await supabase
      .from('ministry_whatsapp_configs')
      .select('whatsapp_plan, plan_status')
      .eq('plan_status', 'active');

    const activeCount = planData?.length ?? 0;
    const planRevMap: Record<string, number> = { basic: 10, growth: 35, premium: 75 };
    const monthlyPlanRev = (planData ?? []).reduce((s: number, r: any) => s + (planRevMap[r.whatsapp_plan] ?? 0), 0);

    // Total broadcasts
    const { count: broadcastCount } = await supabase
      .from('ministry_whatsapp_broadcasts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent');

    const { data: msgData } = await supabase
      .from('ministry_whatsapp_broadcasts')
      .select('successful_sends, cost_usd')
      .eq('status', 'sent');

    const totalMsgs    = (msgData ?? []).reduce((s: number, r: any) => s + (r.successful_sends ?? 0), 0);
    const totalWABARev = (msgData ?? []).reduce((s: number, r: any) => s + (Number(r.cost_usd) ?? 0), 0);

    setStats({
      totalWalletRevenue:             totalWalletRev,
      totalWhatsAppPlanRevenue:       totalWABARev,
      activeWABACount:                activeCount,
      totalWalletCreditsOutstanding:  totalOutstanding,
      totalBroadcastsSent:            broadcastCount ?? 0,
      totalMessagesSent:              totalMsgs,
      monthlyRevenue:                 monthlyPlanRev,
    });
  };

  // ── Grant credits ────────────────────────────────────────────────────────
  const grantCredits = async () => {
    if (!grantTarget || !grantAmount || parseInt(grantAmount) <= 0) return;
    setGranting(true);
    try {
      const credits = parseInt(grantAmount);

      // Upsert wallet
      const { data: existing } = await supabase
        .from('broadcast_wallets')
        .select('id, balance_credits, total_purchased')
        .eq('user_id', grantTarget.user_id)
        .single();

      if (existing) {
        await supabase
          .from('broadcast_wallets')
          .update({
            balance_credits: existing.balance_credits + credits,
            total_purchased: existing.total_purchased + credits,
            updated_at:      new Date().toISOString(),
          })
          .eq('user_id', grantTarget.user_id);
      } else {
        await supabase
          .from('broadcast_wallets')
          .insert({
            user_id:         grantTarget.user_id,
            balance_credits: credits,
            total_purchased: credits,
            total_used:      0,
          });
      }

      // Log transaction
      await supabase
        .from('broadcast_wallet_transactions')
        .insert({
          user_id:     grantTarget.user_id,
          type:        'bonus',
          credits,
          description: `Admin grant: ${grantReason || 'No reason given'}`,
          status:      'completed',
          created_at:  new Date().toISOString(),
        });

      toast({ title: t('adminWhatsAppManager', 'creditsGrantedTo', '{credits} credits granted to {target}').replace('{credits}', String(credits)).replace('{target}', String(grantTarget.email ?? grantTarget.user_id)) });
      setShowGrantModal(false);
      setGrantAmount('');
      setGrantReason('');
      setGrantTarget(null);
      loadWallets();
    } catch (err: any) {
      toast({ title: t('adminWhatsAppManager', 'grantFailed', 'Grant failed'), description: err.message, variant: 'destructive' });
    } finally {
      setGranting(false);
    }
  };

  // ── WABA plan override ───────────────────────────────────────────────────
  const overridePlanStatus = async (ministryId: string, planStatus: string) => {
    await supabase
      .from('ministry_whatsapp_configs')
      .update({ plan_status: planStatus, updated_at: new Date().toISOString() })
      .eq('ministry_id', ministryId);
    toast({ title: t('adminWhatsAppManager', 'planStatusUpdated', 'Plan status updated') });
    loadWABAs();
    setSelectedWABA(null);
  };

  // ── Twilio provision — admin assigns platform Twilio number to a ministry ──
  const provisionTwilio = async () => {
    if (!twilioTarget || !twilioProvisionForm.from_number) {
      toast({ title: t('adminWhatsAppManager', 'fromNumberRequired', 'From number is required'), variant: 'destructive' });
      return;
    }
    setProvisioning(true);
    try {
      // Read platform Twilio credentials from Supabase secrets via edge function
      const { error } = await supabase.functions.invoke('whatsapp-save-credentials', {
        body: {
          ministryId:            twilioTarget.ministry_id,
          provider:              'twilio',
          // Platform-level Twilio credentials — stored in Supabase secrets, not ministry-owned
          use_platform_twilio:   true,
          twilio_from_number:    twilioProvisionForm.from_number.startsWith('whatsapp:')
            ? twilioProvisionForm.from_number
            : `whatsapp:${twilioProvisionForm.from_number}`,
          business_display_name: twilioProvisionForm.business_display_name || twilioTarget.ministry_name,
          phone_number_display:  twilioProvisionForm.from_number,
          waba_id:               'twilio-platform',
          phone_number_id:       twilioProvisionForm.from_number,
        },
      });
      if (error) throw new Error(error.message);
      toast({
        title: t('adminWhatsAppManager', 'twilioNumberProvisioned', 'Twilio number provisioned'),
        description: t('adminWhatsAppManager', 'ministryCanNowBroadcast', '{ministry} can now broadcast via {number}').replace('{ministry}', String(twilioTarget.ministry_name)).replace('{number}', String(twilioProvisionForm.from_number)),
      });
      setShowTwilioProvision(false);
      setTwilioTarget(null);
      setTwilioProvisionForm({ from_number: '', business_display_name: '' });
      loadWABAs();
    } catch (err: any) {
      toast({ title: t('adminWhatsAppManager', 'provisioningFailed', 'Provisioning failed'), description: err.message, variant: 'destructive' });
    } finally {
      setProvisioning(false);
    }
  };

  // ── Filtered data ────────────────────────────────────────────────────────
  const q = search.toLowerCase();

  const filteredWallets = wallets.filter(w =>
    !q || (w.email ?? '').toLowerCase().includes(q) || (w.full_name ?? '').toLowerCase().includes(q)
  );

  const filteredWABAs = wabas.filter(w => {
    const matchSearch = !q
      || (w.ministry_name ?? '').toLowerCase().includes(q)
      || w.business_display_name.toLowerCase().includes(q)
      || w.phone_number_display.includes(q);
    const matchPlan   = planFilter   === 'all' || w.whatsapp_plan   === planFilter;
    const matchStatus = statusFilter === 'all' || w.connection_status === statusFilter;
    return matchSearch && matchPlan && matchStatus;
  });

  const filteredBroadcasts = broadcasts.filter(b =>
    !q || (b.ministry_name ?? '').toLowerCase().includes(q) || (b.title ?? '').toLowerCase().includes(q)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-600" />
            {t('adminWhatsAppManager', 'title', 'WhatsApp & Wallet Admin')}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('adminWhatsAppManager', 'subtitle', 'Manage credits, per-ministry WABA accounts, and broadcast history')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAll} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          {t('adminWhatsAppManager', 'refresh', 'Refresh')}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview"     className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" />{t('adminWhatsAppManager', 'tabOverview', 'Overview')}</TabsTrigger>
          <TabsTrigger value="wallets"      className="gap-1.5"><Wallet className="h-3.5 w-3.5" />{t('adminWhatsAppManager', 'tabWallets', 'Wallets')}</TabsTrigger>
          <TabsTrigger value="waba"         className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" />{t('adminWhatsAppManager', 'tabWabaAccounts', 'WABA Accounts')}</TabsTrigger>
          <TabsTrigger value="broadcasts"   className="gap-1.5"><Send className="h-3.5 w-3.5" />{t('adminWhatsAppManager', 'tabBroadcasts', 'Broadcasts')}</TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" />{t('adminWhatsAppManager', 'tabTransactions', 'Transactions')}</TabsTrigger>
          <TabsTrigger value="subscribers" className="gap-1.5" onClick={() => { if (subscribers.length === 0) loadSubscribers(); }}><Users className="h-3.5 w-3.5" />{t('adminWhatsAppManager', 'tabSubscribers', 'Subscribers')}</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5" onClick={() => { if (!settingsLoaded) loadSettings(); }}><Shield className="h-3.5 w-3.5" />{t('adminWhatsAppManager', 'tabSettings', 'Settings')}</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview" className="mt-5 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={DollarSign}    label={t('adminWhatsAppManager', 'statMonthlyPlanRevenue', 'Monthly Plan Revenue')}      value={fmtUSD(stats?.monthlyRevenue ?? 0)}                     sub={t('adminWhatsAppManager', 'statMonthlyPlanRevenueSub', 'active plans × monthly rate')}       colour="bg-green-100 text-green-600" />
            <StatCard icon={Wallet}        label={t('adminWhatsAppManager', 'statWalletRevenue', 'Wallet Revenue (all-time)')}  value={fmtUSD(stats?.totalWalletRevenue ?? 0)}                 sub={t('adminWhatsAppManager', 'statWalletRevenueSub', 'from credit purchases')}             colour="bg-blue-100 text-blue-600" />
            <StatCard icon={MessageSquare} label={t('adminWhatsAppManager', 'statActiveWabaPlans', 'Active WABA Plans')}          value={stats?.activeWABACount ?? 0}                            sub={t('adminWhatsAppManager', 'statActiveWabaPlansSub', 'ministries with connected WABAs')}   colour="bg-purple-100 text-purple-600" />
            <StatCard icon={Zap}           label={t('adminWhatsAppManager', 'statCreditsOutstanding', 'Credits Outstanding')}        value={(stats?.totalWalletCreditsOutstanding ?? 0).toLocaleString()}  sub={t('adminWhatsAppManager', 'statCreditsOutstandingSub', 'unused credits across all wallets')} colour="bg-amber-100 text-amber-600" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard icon={Send}          label={t('adminWhatsAppManager', 'statBroadcastsSent', 'Ministry Broadcasts Sent')}   value={(stats?.totalBroadcastsSent ?? 0).toLocaleString()}     colour="bg-indigo-100 text-indigo-600" />
            <StatCard icon={Users}         label={t('adminWhatsAppManager', 'statMessagesDelivered', 'Total Messages Delivered')}   value={(stats?.totalMessagesSent ?? 0).toLocaleString()}       colour="bg-pink-100 text-pink-600" />
            <StatCard icon={TrendingUp}    label={t('adminWhatsAppManager', 'statWabaBroadcastRevenue', 'WABA Broadcast Revenue')}     value={fmtUSD(stats?.totalWhatsAppPlanRevenue ?? 0)}           sub={t('adminWhatsAppManager', 'statWabaBroadcastRevenueSub', 'from per-message billing')}          colour="bg-rose-100 text-rose-600" />
          </div>

          {/* Revenue breakdown table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t('adminWhatsAppManager', 'planRevenueBreakdown', 'Plan Revenue Breakdown')}</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase">
                    <th className="text-left py-2">{t('adminWhatsAppManager', 'colPlan', 'Plan')}</th>
                    <th className="text-center py-2">{t('adminWhatsAppManager', 'colActiveMinistries', 'Active ministries')}</th>
                    <th className="text-right py-2">{t('adminWhatsAppManager', 'colMonthlyRevenue', 'Monthly revenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {['basic', 'growth', 'premium'].map(plan => {
                    const count = wabas.filter(w => w.whatsapp_plan === plan && w.plan_status === 'active').length;
                    const rate  = plan === 'basic' ? 10 : plan === 'growth' ? 35 : 75;
                    return (
                      <tr key={plan} className="border-b last:border-0">
                        <td className="py-2.5">
                          <Badge variant="outline" className={`text-xs ${PLAN_COLOURS[plan]}`}>
                            {plan.charAt(0).toUpperCase() + plan.slice(1)}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-center font-medium">{count}</td>
                        <td className="py-2.5 text-right font-semibold text-green-700">{fmtUSD(count * rate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── WALLETS ── */}
        <TabsContent value="wallets" className="mt-5 space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t('adminWhatsAppManager', 'searchEmailOrName', 'Search by email or name…')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/60 text-xs text-muted-foreground uppercase">
                    <th className="text-left px-4 py-2.5">{t('adminWhatsAppManager', 'colUser', 'User')}</th>
                    <th className="text-center px-4 py-2.5">{t('adminWhatsAppManager', 'colBalance', 'Balance')}</th>
                    <th className="text-center px-4 py-2.5">{t('adminWhatsAppManager', 'colPurchased', 'Purchased')}</th>
                    <th className="text-center px-4 py-2.5">{t('adminWhatsAppManager', 'colUsed', 'Used')}</th>
                    <th className="text-center px-4 py-2.5">{t('adminWhatsAppManager', 'colUsdValue', 'USD value')}</th>
                    <th className="text-right px-4 py-2.5">{t('adminWhatsAppManager', 'colActions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWallets.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">{t('adminWhatsAppManager', 'noWalletsFound', 'No wallets found.')}</td></tr>
                  ) : filteredWallets.map(w => (
                    <tr key={w.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-sm">{w.full_name || '—'}</p>
                        <p className="text-xs text-muted-foreground">{w.email || w.user_id.slice(0, 8) + '…'}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold text-base ${w.balance_credits === 0 ? 'text-red-500' : w.balance_credits < 50 ? 'text-amber-600' : 'text-green-700'}`}>
                          {w.balance_credits.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{w.total_purchased.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{w.total_used.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center text-green-700 font-medium">
                        {fmtUSD(w.balance_credits * 0.03)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 h-7 text-xs"
                          onClick={() => { setGrantTarget(w); setShowGrantModal(true); }}
                        >
                          <Gift className="h-3 w-3" />
                          {t('adminWhatsAppManager', 'grant', 'Grant')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ── WABA ACCOUNTS ── */}
        <TabsContent value="waba" className="mt-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t('adminWhatsAppManager', 'searchWaba', 'Search ministry, number, or business name…')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="h-9 w-32 text-sm">
                <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder={t('adminWhatsAppManager', 'colPlan', 'Plan')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('adminWhatsAppManager', 'allPlans', 'All plans')}</SelectItem>
                <SelectItem value="basic">{t('adminWhatsAppManager', 'planBasic', 'Basic')}</SelectItem>
                <SelectItem value="growth">{t('adminWhatsAppManager', 'planGrowth', 'Growth')}</SelectItem>
                <SelectItem value="premium">{t('adminWhatsAppManager', 'planPremium', 'Premium')}</SelectItem>
                <SelectItem value="none">{t('adminWhatsAppManager', 'planNone', 'No plan')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-36 text-sm">
                <SelectValue placeholder={t('adminWhatsAppManager', 'colStatus', 'Status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('adminWhatsAppManager', 'allStatuses', 'All statuses')}</SelectItem>
                <SelectItem value="connected">{t('adminWhatsAppManager', 'statusConnected', 'Connected')}</SelectItem>
                <SelectItem value="pending">{t('adminWhatsAppManager', 'statusPending', 'Pending')}</SelectItem>
                <SelectItem value="error">{t('adminWhatsAppManager', 'statusError', 'Error')}</SelectItem>
                <SelectItem value="suspended">{t('adminWhatsAppManager', 'statusSuspended', 'Suspended')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/60 text-xs text-muted-foreground uppercase">
                    <th className="text-left px-4 py-2.5">{t('adminWhatsAppManager', 'colMinistry', 'Ministry')}</th>
                    <th className="text-left px-4 py-2.5">{t('adminWhatsAppManager', 'colBusinessName', 'Business name')}</th>
                    <th className="text-left px-4 py-2.5">{t('adminWhatsAppManager', 'colPhone', 'Phone')}</th>
                    <th className="text-center px-4 py-2.5">{t('adminWhatsAppManager', 'colConnection', 'Connection')}</th>
                    <th className="text-center px-4 py-2.5">{t('adminWhatsAppManager', 'colPlan', 'Plan')}</th>
                    <th className="text-center px-4 py-2.5">{t('adminWhatsAppManager', 'colPlanStatus', 'Plan status')}</th>
                    <th className="text-right px-4 py-2.5">{t('adminWhatsAppManager', 'colActions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWABAs.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">{t('adminWhatsAppManager', 'noWabaFound', 'No WABA accounts found.')}</td></tr>
                  ) : filteredWABAs.map(w => (
                    <tr key={w.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{w.ministry_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <p>{w.business_display_name || '—'}</p>
                        {w.waba_id && <p className="text-[10px] text-muted-foreground/60">{w.waba_id}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{w.phone_number_display || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className={`text-xs ${STATUS_COLOURS[w.connection_status] ?? ''}`}>
                          {w.connection_status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className={`text-xs ${PLAN_COLOURS[w.whatsapp_plan] ?? ''}`}>
                          {w.whatsapp_plan}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className={`text-xs ${STATUS_COLOURS[w.plan_status] ?? ''}`}>
                          {w.plan_status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1"
                          onClick={() => setSelectedWABA(w)}
                        >
                          <Eye className="h-3 w-3" />
                          {t('adminWhatsAppManager', 'manage', 'Manage')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ── BROADCASTS ── */}
        <TabsContent value="broadcasts" className="mt-5 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t('adminWhatsAppManager', 'searchMinistryOrTitle', 'Search by ministry or title…')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/60 text-xs text-muted-foreground uppercase">
                    <th className="text-left px-4 py-2.5">{t('adminWhatsAppManager', 'colMinistry', 'Ministry')}</th>
                    <th className="text-left px-4 py-2.5">{t('adminWhatsAppManager', 'colTitle', 'Title')}</th>
                    <th className="text-center px-4 py-2.5">{t('adminWhatsAppManager', 'colRecipients', 'Recipients')}</th>
                    <th className="text-center px-4 py-2.5">{t('adminWhatsAppManager', 'colSentFailed', 'Sent / Failed')}</th>
                    <th className="text-center px-4 py-2.5">{t('adminWhatsAppManager', 'colCost', 'Cost')}</th>
                    <th className="text-center px-4 py-2.5">{t('adminWhatsAppManager', 'colStatus', 'Status')}</th>
                    <th className="text-left px-4 py-2.5 hidden lg:table-cell">{t('adminWhatsAppManager', 'colSentAt', 'Sent at')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBroadcasts.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">{t('adminWhatsAppManager', 'noBroadcastsFound', 'No broadcasts found.')}</td></tr>
                  ) : filteredBroadcasts.map(b => (
                    <tr key={b.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-sm">{b.ministry_name}</td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <p className="truncate text-sm">{b.title || '—'}</p>
                        <p className="text-xs text-muted-foreground">{b.message_type} · {b.target_type}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{(b.recipient_count ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-center">
                          {b.successful_sends > 0 && (
                            <span className="flex items-center gap-0.5 text-emerald-600 text-xs font-medium">
                              <CheckCircle2 className="h-3 w-3" />{b.successful_sends}
                            </span>
                          )}
                          {b.failed_sends > 0 && (
                            <span className="flex items-center gap-0.5 text-red-500 text-xs font-medium">
                              <XCircle className="h-3 w-3" />{b.failed_sends}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-green-700 font-medium text-xs">
                        {fmtUSD(b.cost_usd ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className={`text-xs ${
                          b.status === 'sent' ? 'text-green-700 bg-green-50 border-green-200'
                          : b.status === 'scheduled' ? 'text-blue-700 bg-blue-50 border-blue-200'
                          : 'text-red-700 bg-red-50 border-red-200'
                        }`}>{b.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                        {fmt(b.sent_at || b.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ── TRANSACTIONS ── */}
        <TabsContent value="transactions" className="mt-5 space-y-4">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/60 text-xs text-muted-foreground uppercase">
                    <th className="text-left px-4 py-2.5">{t('adminWhatsAppManager', 'colUser', 'User')}</th>
                    <th className="text-center px-4 py-2.5">{t('adminWhatsAppManager', 'colType', 'Type')}</th>
                    <th className="text-center px-4 py-2.5">{t('adminWhatsAppManager', 'colCredits', 'Credits')}</th>
                    <th className="text-center px-4 py-2.5">{t('adminWhatsAppManager', 'colUsd', 'USD')}</th>
                    <th className="text-left px-4 py-2.5">{t('adminWhatsAppManager', 'colDescription', 'Description')}</th>
                    <th className="text-center px-4 py-2.5">{t('adminWhatsAppManager', 'colStatus', 'Status')}</th>
                    <th className="text-left px-4 py-2.5 hidden lg:table-cell">{t('adminWhatsAppManager', 'colDate', 'Date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">{t('adminWhatsAppManager', 'noTransactionsYet', 'No transactions yet.')}</td></tr>
                  ) : transactions.map(tx => (
                    <tr key={tx.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-xs text-muted-foreground">{tx.user_id.slice(0, 8)}…</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className={`text-xs ${
                          tx.type === 'topup'     ? 'text-green-700 bg-green-50 border-green-200'
                          : tx.type === 'deduction' ? 'text-red-700 bg-red-50 border-red-200'
                          : tx.type === 'bonus'    ? 'text-purple-700 bg-purple-50 border-purple-200'
                          : 'text-blue-700 bg-blue-50 border-blue-200'
                        }`}>{tx.type}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold tabular-nums ${tx.credits > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {tx.credits > 0 ? '+' : ''}{tx.credits.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground text-xs">
                        {tx.usd_amount != null ? fmtUSD(Math.abs(tx.usd_amount)) : '—'}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-xs truncate">{tx.description || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className={`text-xs ${
                          tx.status === 'completed' ? 'text-green-700 bg-green-50 border-green-200'
                          : tx.status === 'pending'  ? 'text-amber-700 bg-amber-50 border-amber-200'
                          : 'text-red-700 bg-red-50 border-red-200'
                        }`}>{tx.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                        {fmt(tx.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="subscribers" className="mt-5 space-y-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('adminWhatsAppManager', 'searchNameEmailPhone', 'Search name, email or phone...')}
                    value={subSearch}
                    onChange={e => setSubSearch(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
                <Select value={subChannelFilter} onValueChange={setSubChannelFilter}>
                  <SelectTrigger className="w-48 h-9 text-sm">
                    <SelectValue placeholder={t('adminWhatsAppManager', 'allChannels', 'All channels')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('adminWhatsAppManager', 'allChannels', 'All channels')}</SelectItem>
                    {waChannels.map(ch => (
                      <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={loadSubscribers} disabled={subLoading} className="gap-1.5">
                  <RefreshCw className={`h-3.5 w-3.5 ${subLoading ? 'animate-spin' : ''}`} />
                  {t('adminWhatsAppManager', 'refresh', 'Refresh')}
                </Button>
                <Badge variant="secondary" className="ml-auto">
                  {t('adminWhatsAppManager', 'ofShown', '{shown} of {total} shown').replace('{shown}', String(subscribers.filter(s => {
                    const q = subSearch.toLowerCase();
                    const matchSearch = !q || s.phone_number?.toLowerCase().includes(q) || (s.full_name ?? '').toLowerCase().includes(q) || (s.email ?? '').toLowerCase().includes(q);
                    const matchChannel = subChannelFilter === 'all' || s.channel_id === subChannelFilter;
                    return matchSearch && matchChannel;
                  }).length)).replace('{total}', String(subscribers.length))}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            {subLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50/60 text-xs text-muted-foreground uppercase">
                      <th className="text-left px-4 py-2.5">{t('adminWhatsAppManager', 'colSubscriber', 'Subscriber')}</th>
                      <th className="text-left px-4 py-2.5">{t('adminWhatsAppManager', 'colPhone', 'Phone')}</th>
                      <th className="text-left px-4 py-2.5">{t('adminWhatsAppManager', 'colChannel', 'Channel')}</th>
                      <th className="text-left px-4 py-2.5 hidden md:table-cell">{t('adminWhatsAppManager', 'colSubscribed', 'Subscribed')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const q = subSearch.toLowerCase();
                      const filtered = subscribers.filter(s => {
                        const matchSearch = !q || s.phone_number?.toLowerCase().includes(q) || (s.full_name ?? '').toLowerCase().includes(q) || (s.email ?? '').toLowerCase().includes(q);
                        const matchChannel = subChannelFilter === 'all' || s.channel_id === subChannelFilter;
                        return matchSearch && matchChannel;
                      });
                      if (filtered.length === 0) return (
                        <tr><td colSpan={4} className="text-center py-12 text-muted-foreground text-sm">{t('adminWhatsAppManager', 'noSubscribersFound', 'No subscribers found.')}</td></tr>
                      );
                      return filtered.map(s => (
                        <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-sm">{s.full_name || t('adminWhatsAppManager', 'unknown', 'Unknown')}</p>
                            <p className="text-xs text-muted-foreground">{s.email || s.user_id?.slice(0, 8) + '…'}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm text-green-700">{s.phone_number}</span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-xs text-green-700 bg-green-50 border-green-200 gap-1">
                              <MessageSquare className="h-3 w-3" />{s.channel_name}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                            {s.subscribed_at ? fmt(s.subscribed_at) : '—'}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-5 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-600" />
                {t('adminWhatsAppManager', 'reminderProviderTitle', 'WhatsApp Reminder Provider')}
              </CardTitle>
              <CardDescription>
                {t('adminWhatsAppManager', 'reminderProviderDesc', 'Choose which provider sends automated reminders (devotional, prayer, bible reading, etc). Broadcasts have their own per-send toggle in the broadcast form.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Provider cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Twilio */}
                <button
                  type="button"
                  onClick={() => setReminderProvider('twilio')}
                  className={`text-left rounded-xl border-2 p-4 transition-all ${
                    reminderProvider === 'twilio'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">Twilio</span>
                    {reminderProvider === 'twilio' && (
                      <Badge className="bg-blue-500 text-white text-xs">{t('adminWhatsAppManager', 'active', 'Active')}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    {t('adminWhatsAppManager', 'twilioDesc', 'Sends via Twilio Programmable Messaging using pre-approved Content Templates. Easier setup, slightly higher per-message cost.')}
                  </p>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> {t('adminWhatsAppManager', 'twilioFeature1', 'No business verification needed')}</p>
                    <p className="text-xs text-gray-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> {t('adminWhatsAppManager', 'twilioFeature2', 'Templates: 9 approved')}</p>
                    <p className="text-xs text-gray-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM</p>
                  </div>
                </button>

                {/* Meta */}
                <button
                  type="button"
                  onClick={() => setReminderProvider('meta')}
                  className={`text-left rounded-xl border-2 p-4 transition-all ${
                    reminderProvider === 'meta'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">Meta (Direct)</span>
                    {reminderProvider === 'meta' && (
                      <Badge className="bg-green-500 text-white text-xs">{t('adminWhatsAppManager', 'active', 'Active')}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    {t('adminWhatsAppManager', 'metaDesc', 'Sends directly via Meta Graph API using WhatsApp Message Templates. Cheaper per message, requires verified phone number and approved templates in Meta.')}
                  </p>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> {t('adminWhatsAppManager', 'metaFeature1', 'Lower cost (~$0.005 less per message)')}</p>
                    <p className="text-xs text-gray-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" /> {t('adminWhatsAppManager', 'metaFeature2', 'Requires registered Meta phone number')}</p>
                    <p className="text-xs text-gray-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" /> Secrets: WHATSAPP_PHONE_ID, WHATSAPP_ACCESS_TOKEN</p>
                  </div>
                </button>
              </div>

              {/* Current status */}
              <div className="rounded-lg bg-gray-50 border p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t('adminWhatsAppManager', 'currentlyActive', 'Currently active')}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t('adminWhatsAppManager', 'allReminderFunctionsUse', 'All reminder functions (devotional, prayer, bible, counselling) will use')}{' '}
                    <strong>{reminderProvider === 'twilio' ? 'Twilio' : 'Meta Direct'}</strong>
                  </p>
                </div>
                <Badge className={reminderProvider === 'twilio' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}>
                  {reminderProvider === 'twilio' ? 'Twilio' : 'Meta'}
                </Badge>
              </div>

              <Button
                onClick={saveSettings}
                disabled={settingsSaving}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {settingsSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t('adminWhatsAppManager', 'saving', 'Saving...')}</> : t('adminWhatsAppManager', 'saveSettings', 'Save Settings')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Grant credits modal ── */}
      <Dialog open={showGrantModal} onOpenChange={setShowGrantModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-purple-600" />
              {t('adminWhatsAppManager', 'grantCreditsTitle', 'Grant Credits')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              <p className="text-muted-foreground">{t('adminWhatsAppManager', 'colUser', 'User')}</p>
              <p className="font-medium">{grantTarget?.full_name || '—'}</p>
              <p className="text-xs text-muted-foreground">{grantTarget?.email}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('adminWhatsAppManager', 'currentBalance', 'Current balance:')} <span className="font-semibold">{grantTarget?.balance_credits.toLocaleString()} {t('adminWhatsAppManager', 'creditsUnit', 'credits')}</span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('adminWhatsAppManager', 'creditsToGrant', 'Credits to grant')}</Label>
              <Input
                type="number"
                min="1"
                placeholder={t('adminWhatsAppManager', 'egCreditAmount', 'e.g. 500')}
                value={grantAmount}
                onChange={e => setGrantAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                = {fmtUSD((parseInt(grantAmount) || 0) * 0.03)} {t('adminWhatsAppManager', 'inMessageValue', 'in message value')}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('adminWhatsAppManager', 'reasonInternalNote', 'Reason (internal note)')}</Label>
              <Input
                placeholder={t('adminWhatsAppManager', 'egReason', 'e.g. Promotion, refund, test account…')}
                value={grantReason}
                onChange={e => setGrantReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGrantModal(false)}>{t('adminWhatsAppManager', 'cancel', 'Cancel')}</Button>
            <Button
              onClick={grantCredits}
              disabled={granting || !grantAmount || parseInt(grantAmount) <= 0}
              className="gap-2"
            >
              {granting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('adminWhatsAppManager', 'grantXCredits', 'Grant {amount} Credits').replace('{amount}', grantAmount || '0')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── WABA manage modal ── */}
      <Dialog open={!!selectedWABA} onOpenChange={() => setSelectedWABA(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-green-600" />
              {selectedWABA?.ministry_name}
            </DialogTitle>
          </DialogHeader>
          {selectedWABA && (
            <div className="space-y-4 py-2">
              {/* WABA details */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: t('adminWhatsAppManager', 'businessName', 'Business Name'),   value: selectedWABA.business_display_name || '—' },
                  { label: t('adminWhatsAppManager', 'colPhone', 'Phone'),           value: selectedWABA.phone_number_display || '—'  },
                  { label: t('adminWhatsAppManager', 'wabaId', 'WABA ID'),         value: selectedWABA.waba_id || '—'               },
                  { label: t('adminWhatsAppManager', 'setupFeePaid', 'Setup Fee Paid'),  value: selectedWABA.setup_fee_paid ? t('adminWhatsAppManager', 'yesEmoji', '✅ Yes') : t('adminWhatsAppManager', 'noEmoji', '❌ No') },
                  { label: t('adminWhatsAppManager', 'lastVerified', 'Last Verified'),   value: fmt(selectedWABA.last_verified_at)         },
                  { label: t('adminWhatsAppManager', 'updated', 'Updated'),         value: fmt(selectedWABA.updated_at)               },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-sm font-medium break-all">{value}</p>
                  </div>
                ))}
              </div>

              <Alert className="border-blue-200 bg-blue-50 py-2">
                <Shield className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800 text-xs">
                  {t('adminWhatsAppManager', 'senderNameVerified1', 'The sender name')} <strong>{selectedWABA.business_display_name || t('adminWhatsAppManager', 'notSet', 'not set')}</strong>{' '}
                  {t('adminWhatsAppManager', 'senderNameVerified2', 'is verified by Meta and cannot be changed per message — this is by design.')}
                </AlertDescription>
              </Alert>

              {/* Plan status override */}
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('adminWhatsAppManager', 'overridePlanStatus', 'Override Plan Status')}</p>
                <div className="flex gap-2 flex-wrap">
                  {['active', 'past_due', 'cancelled', 'pending'].map(s => (
                    <Button
                      key={s}
                      size="sm"
                      variant={selectedWABA.plan_status === s ? 'default' : 'outline'}
                      className="h-7 text-xs"
                      onClick={() => overridePlanStatus(selectedWABA.ministry_id, s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('adminWhatsAppManager', 'overridePlanHint', 'Use this to manually correct plan status if Stripe webhook fails.')}
                </p>
              </div>

              {/* Twilio provisioning */}
              <div className="space-y-2 border-t pt-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4 text-red-600" />
                  {t('adminWhatsAppManager', 'provisionViaTwilio', 'Provision via Twilio')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('adminWhatsAppManager', 'provisionTwilioHint', 'While waiting for Meta verification, assign a platform Twilio number to this ministry so they can start broadcasting immediately. No Meta approval required.')}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 border-red-200 text-red-700 hover:bg-red-50 w-full"
                  onClick={() => {
                    setTwilioTarget(selectedWABA);
                    setTwilioProvisionForm({
                      from_number: '',
                      business_display_name: selectedWABA.business_display_name || selectedWABA.ministry_name,
                    });
                    setSelectedWABA(null);
                    setShowTwilioProvision(true);
                  }}
                >
                  <Phone className="h-3.5 w-3.5" />
                  {t('adminWhatsAppManager', 'assignTwilioNumber', 'Assign Twilio Number to this Ministry')}
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedWABA(null)}>{t('adminWhatsAppManager', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Twilio provision modal — admin only */}
      <Dialog open={showTwilioProvision} onOpenChange={setShowTwilioProvision}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-red-600" />
              {t('adminWhatsAppManager', 'provisionTwilioNumberTitle', 'Provision Twilio Number')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Alert className="border-blue-200 bg-blue-50 py-2">
              <Shield className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800 text-xs">
                {t('adminWhatsAppManager', 'twilioAssignAlert1', 'This assigns one of your')} <strong>{t('adminWhatsAppManager', 'platformTwilioNumbers', 'platform Twilio numbers')}</strong> {t('adminWhatsAppManager', 'to', 'to')}{' '}
                <strong>{twilioTarget?.ministry_name}</strong>. {t('adminWhatsAppManager', 'twilioAssignAlert2', "The platform's Twilio Account SID and Auth Token (set in Supabase secrets) are used — the ministry never sees these credentials.")}
              </AlertDescription>
            </Alert>

            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-medium text-gray-700">{t('adminWhatsAppManager', 'colMinistry', 'Ministry')}</p>
              <p className="text-sm font-semibold">{twilioTarget?.ministry_name}</p>
              <p className="text-xs text-muted-foreground">{t('adminWhatsAppManager', 'planLabel', 'Plan:')} {twilioTarget?.whatsapp_plan}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">{t('adminWhatsAppManager', 'whatsappFromNumber', 'WhatsApp From Number')} <span className="text-red-500">*</span></Label>
              <Input
                placeholder="+14155238886"
                value={twilioProvisionForm.from_number}
                onChange={e => setTwilioProvisionForm(prev => ({ ...prev, from_number: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                {t('adminWhatsAppManager', 'twilioFromHint', 'The Twilio WhatsApp-enabled number to assign. Must be active on your Twilio account. Sandbox:')} <code className="bg-gray-100 px-1 rounded">+14155238886</code>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">{t('adminWhatsAppManager', 'senderDisplayName', 'Sender Display Name')}</Label>
              <Input
                placeholder={twilioTarget?.ministry_name}
                value={twilioProvisionForm.business_display_name}
                onChange={e => setTwilioProvisionForm(prev => ({ ...prev, business_display_name: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                {t('adminWhatsAppManager', 'senderDisplayHint', "Name shown to recipients in the message body (Twilio sandbox doesn't have verified business names like Meta).")}
              </p>
            </div>

            <Alert className="border-amber-200 bg-amber-50 py-2">
              <MessageSquare className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-xs">
                <strong>{t('adminWhatsAppManager', 'sandboxNote', 'Sandbox note:')}</strong> {t('adminWhatsAppManager', 'sandboxNoteBody', "For testing, recipients must first send the Twilio join code to this number before they can receive messages. Production numbers don't have this requirement.")}
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTwilioProvision(false)}>{t('adminWhatsAppManager', 'cancel', 'Cancel')}</Button>
            <Button
              onClick={provisionTwilio}
              disabled={provisioning}
              className="gap-2 bg-red-600 hover:bg-red-700 text-white"
            >
              {provisioning && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('adminWhatsAppManager', 'provisionNumber', 'Provision Number')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
