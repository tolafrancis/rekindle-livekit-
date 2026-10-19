import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Label } from '@rekindle/ui/label';
import { Badge } from '@rekindle/ui/badge';
import { Switch } from '@rekindle/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { toast } from '@rekindle/ui/use-toast';
import {
  Send, MessageSquare, Users, Calendar, Loader2,
  CheckCircle2, AlertTriangle, Info, Clock, Shield,
  ChevronDown, ChevronUp, XCircle, Zap,
} from 'lucide-react';
import type { MinistryWABAConfig } from './MinistryWhatsAppConnect';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_MSG_RATES: Record<string, number> = {
  basic:   0.030,
  growth:  0.025,
  premium: 0.020,
};

const PLAN_INCLUDED: Record<string, number | null> = {
  basic:   1000,
  growth:  5000,
  premium: null,
};

// Send via Rekindle: one wallet credit per delivered message, no allowance.
const REKINDLE_MSG_RATE = 0.03;
const REKINDLE_TITLE_MAX = 60;
const REKINDLE_MESSAGE_MAX = 700;

// ─── Types ────────────────────────────────────────────────────────────────────

interface WABATemplate {
  id: string;
  name: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  category: string;
  language: string;
  body_text: string;
  content_sid?: string | null;  // Twilio ContentSid (HX...) — null for Meta templates
  components?: any[];
}

interface BroadcastContact {
  id: string;
  phone_number: string;
  display_name?: string;
}

interface MinistryWABroadcastProps {
  ministryId: string;
  ministryName: string;
  // null when the ministry has never set anything up — it can still send
  // via Rekindle's number.
  wabaConfig: MinistryWABAConfig | null;
  onConfigChange?: () => void;
  onOpenCredits?: () => void;
}

type Sender = 'ministry' | 'rekindle';

// ─── Component ────────────────────────────────────────────────────────────────

export const MinistryWhatsAppBroadcast: React.FC<MinistryWABroadcastProps> = ({
  ministryId,
  ministryName,
  wabaConfig,
  onConfigChange,
  onOpenCredits,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();

  // Which number sends: the ministry's own WABA once connected, otherwise
  // Rekindle's shared number.
  const ownConnected = wabaConfig?.connection_status === 'connected';
  const [senderChoice, setSenderChoice] = useState<Sender | null>(null);
  const sender: Sender = senderChoice === 'ministry' && ownConnected
    ? 'ministry'
    : senderChoice ?? (ownConnected ? 'ministry' : 'rekindle');
  const viaRekindle = sender === 'rekindle';
  const sharedEnabled = !!wabaConfig?.shared_sender_enabled;
  const [togglingShared, setTogglingShared] = useState(false);

  // Form state
  const [messageType, setMessageType] = useState<'text' | 'template'>('text');
  const [title, setTitle]             = useState('');
  const [message, setMessage]         = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<WABATemplate | null>(null);
  const [templateParams, setTemplateParams]       = useState<string[]>([]);
  const [targetType, setTargetType]   = useState<'all' | 'group' | 'small_group' | 'custom'>('all');
  const [groupId, setGroupId]         = useState('');
  const [smallGroupId, setSmallGroupId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

  // Data state
  const [templates, setTemplates]           = useState<WABATemplate[]>([]);
  const [groups, setGroups]                 = useState<{ id: string; name: string; member_count: number }[]>([]);
  const [smallGroups, setSmallGroups]       = useState<{ id: string; name: string; member_count: number }[]>([]);
  const [recipientCount, setRecipientCount] = useState<number>(0);
  const [walletBalance, setWalletBalance]   = useState<number>(0);
  const [monthlyUsed, setMonthlyUsed]       = useState<number>(0);
  const [loadingCount, setLoadingCount]     = useState(false);

  // Send state
  const [sending, setSending]     = useState(false);
  const [lastResult, setLastResult] = useState<{ sent: number; failed: number; cost: number } | null>(null);
  const [broadcastHistory, setBroadcastHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory]           = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────
  const loadTemplates = useCallback(async () => {
    if (!ownConnected) return;
    try {
      const { data } = await supabase.functions.invoke('whatsapp-get-templates', {
        body: { ministryId },
      });
      if (data?.templates) setTemplates(data.templates.filter((tpl: WABATemplate) => tpl.status === 'APPROVED'));
    } catch (err) {
      console.error('Template load error:', err);
    }
  }, [ministryId, ownConnected]);

  const loadGroups = useCallback(async () => {
    const { data } = await supabase
      .from('ministry_groups')
      .select('id, name, member_count')
      .eq('ministry_id', ministryId);
    setGroups(data ?? []);
  }, [ministryId]);

  const loadSmallGroups = useCallback(async () => {
    const { data } = await supabase
      .from('small_groups')
      .select('id, name, member_count')
      .eq('ministry_id', ministryId)
      .eq('status', 'active');
    setSmallGroups(data ?? []);
  }, [ministryId]);

  const loadWallet = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('broadcast_wallets')
      .select('balance_credits')
      .eq('user_id', user.id)
      .single();
    setWalletBalance(data?.balance_credits ?? 0);
  }, [user]);

  const loadMonthlyUsage = useCallback(async () => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('ministry_whatsapp_broadcasts')
      .select('successful_sends')
      .eq('ministry_id', ministryId)
      .eq('sender', 'ministry')   // sends via Rekindle don't use the plan allowance
      .gte('sent_at', startOfMonth.toISOString());
    const total = (data ?? []).reduce((s: number, r: any) => s + (r.successful_sends ?? 0), 0);
    setMonthlyUsed(total);
  }, [ministryId]);

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('ministry_whatsapp_broadcasts')
      .select('*')
      .eq('ministry_id', ministryId)
      .order('created_at', { ascending: false })
      .limit(20);
    setBroadcastHistory(data ?? []);
  }, [ministryId]);

  // ── Count recipients ──────────────────────────────────────────────────
  const countRecipients = useCallback(async () => {
    setLoadingCount(true);
    try {
      if (targetType === 'all') {
        const { count } = await supabase
          .from('ministry_whatsapp_subscribers')
          .select('*', { count: 'exact', head: true })
          .eq('ministry_id', ministryId)
          .eq('opted_in', true);
        setRecipientCount(count ?? 0);
      } else if (targetType === 'group' && groupId) {
        // Matches the edge function: the group's members who opted in to
        // the ministry's WhatsApp updates, not every member.
        const { data: members } = await supabase
          .from('ministry_group_members')
          .select('user_id')
          .eq('group_id', groupId);
        const userIds = (members ?? []).map((m: any) => m.user_id).filter(Boolean);
        if (userIds.length === 0) {
          setRecipientCount(0);
        } else {
          const { count } = await supabase
            .from('ministry_whatsapp_subscribers')
            .select('*', { count: 'exact', head: true })
            .eq('ministry_id', ministryId)
            .eq('opted_in', true)
            .in('user_id', userIds);
          setRecipientCount(count ?? 0);
        }
      } else if (targetType === 'small_group' && smallGroupId) {
        // Matches the edge function's filter exactly — only members opted
        // in to WhatsApp reminders for this group, not every member.
        const { count } = await supabase
          .from('small_group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', smallGroupId)
          .eq('status', 'active')
          .eq('whatsapp_notify', true);
        setRecipientCount(count ?? 0);
      }
    } catch (err) {
      console.error('Count error:', err);
    } finally {
      setLoadingCount(false);
    }
  }, [ministryId, targetType, groupId, smallGroupId]);

  useEffect(() => {
    loadTemplates();
    loadGroups();
    loadSmallGroups();
    loadWallet();
    loadMonthlyUsage();
  }, [loadTemplates, loadGroups, loadSmallGroups, loadWallet, loadMonthlyUsage]);

  useEffect(() => { countRecipients(); }, [countRecipients]);
  useEffect(() => { if (showHistory) loadHistory(); }, [showHistory, loadHistory]);

  // ── Cost calculation ──────────────────────────────────────────────────
  const plan        = wabaConfig?.whatsapp_plan ?? 'none';
  const msgRate     = viaRekindle ? REKINDLE_MSG_RATE : (PLAN_MSG_RATES[plan] ?? 0.03);
  // premium (null) = unlimited; via Rekindle nothing is included.
  const included    = viaRekindle ? 0 : (PLAN_INCLUDED[plan] === null ? Infinity : (PLAN_INCLUDED[plan] ?? 0));
  const overageCount = Math.max(0, (monthlyUsed + recipientCount) - included);
  const includedUsed = recipientCount - overageCount;
  const overageCost  = overageCount * msgRate;
  const creditsNeeded = overageCount; // 1 credit = 1 msg for overage
  const canAfford    = walletBalance >= creditsNeeded || overageCost === 0;

  // ── Send broadcast ────────────────────────────────────────────────────
  const handleSend = async () => {
    if (sending) return;

    // Validation
    const effectiveType = viaRekindle ? 'text' : messageType;
    if (effectiveType === 'text' && (!title.trim() || !message.trim())) {
      toast({ title: t('ministryWhatsAppBroadcast', 'titleAndMessageRequired', 'Title and message required'), variant: 'destructive' });
      return;
    }
    if (effectiveType === 'template' && !selectedTemplate) {
      toast({ title: t('ministryWhatsAppBroadcast', 'selectATemplate', 'Select a template'), variant: 'destructive' });
      return;
    }
    if (recipientCount === 0) {
      toast({ title: t('ministryWhatsAppBroadcast', 'noRecipientsFound', 'No recipients found'), variant: 'destructive' });
      return;
    }
    if (!canAfford && !(isScheduled && !viaRekindle)) {
      toast({
        title: t('ministryWhatsAppBroadcast', 'insufficientCreditsForOverage', 'Insufficient credits for overage'),
        description: t('ministryWhatsAppBroadcast', 'topUpAtLeastX', 'Top up at least {count} credits to send.').replace('{count}', String(creditsNeeded)),
        variant: 'destructive',
      });
      return;
    }

    setSending(true);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('ministry-whatsapp-broadcast', {
        body: viaRekindle ? {
          ministryId,
          userId:       user?.id,
          sender:       'rekindle',
          messageType:  'text',
          title:        title.trim(),
          message:      message.trim(),
          targetType,
          groupId:      targetType === 'group' ? groupId : undefined,
          smallGroupId: targetType === 'small_group' ? smallGroupId : undefined,
        } : {
          ministryId,
          userId:          user?.id,
          sender:          'ministry',
          messageType,
          title:           messageType === 'text' ? title : selectedTemplate?.name,
          message:         messageType === 'text' ? message : selectedTemplate?.body_text,
          // For Twilio: pass content_sid if available (HX...) so the edge function
          // uses ContentSid for proper template delivery. Falls back to name for Meta.
          templateName:    messageType === 'template'
            ? (selectedTemplate?.content_sid || selectedTemplate?.name)
            : undefined,
          templateParams:  messageType === 'template' ? templateParams : undefined,
          language:        messageType === 'template' ? selectedTemplate?.language : undefined,
          targetType,
          groupId:         targetType === 'group' ? groupId : undefined,
          smallGroupId:    targetType === 'small_group' ? smallGroupId : undefined,
          scheduledAt:     isScheduled ? scheduledAt : undefined,
        },
      });

      if (error || data?.error) throw new Error(error?.message ?? data?.error ?? 'Send failed');

      if (isScheduled && !viaRekindle) {
        toast({ title: t('ministryWhatsAppBroadcast', 'broadcastScheduled', 'Broadcast scheduled'), description: t('ministryWhatsAppBroadcast', 'scheduledForX', 'Scheduled for {time}').replace('{time}', new Date(scheduledAt).toLocaleString()) });
      } else {
        const result = { sent: data.sent ?? 0, failed: data.failed ?? 0, cost: data.cost_usd ?? 0 };
        setLastResult(result);
        toast({
          title: t('ministryWhatsAppBroadcast', 'broadcastSent', 'Broadcast sent!'),
          description: t('ministryWhatsAppBroadcast', 'messagesDeliveredCharged', '{count} messages delivered · ${cost} charged').replace('{count}', result.sent.toLocaleString()).replace('{cost}', result.cost.toFixed(2)),
        });
        loadWallet();
        loadMonthlyUsage();
      }

      // Reset form
      setTitle(''); setMessage(''); setSelectedTemplate(null); setTemplateParams([]);
      setIsScheduled(false); setScheduledAt('');
    } catch (err: any) {
      toast({ title: t('ministryWhatsAppBroadcast', 'broadcastFailed', 'Broadcast failed'), description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  // Members only see the "WhatsApp Updates" subscribe card on the ministry
  // page once the ministry sends WhatsApp — its own number, or this switch.
  const setSharedSender = async (enabled: boolean) => {
    setTogglingShared(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-config-update', {
        body: { ministryId, action: 'set_shared_sender', enabled },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      toast({
        title: enabled
          ? t('ministryWhatsAppBroadcast', 'sharedOnTitle', 'Members can now subscribe')
          : t('ministryWhatsAppBroadcast', 'sharedOffTitle', 'WhatsApp updates via Rekindle turned off'),
      });
      onConfigChange?.();
    } catch (err: any) {
      toast({ title: t('ministryWhatsAppBroadcast', 'saveFailed', 'Could not save'), description: err.message, variant: 'destructive' });
    } finally {
      setTogglingShared(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 max-w-2xl">
      {/* Which number sends */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setSenderChoice('ministry')}
          disabled={!ownConnected}
          className={`text-left rounded-xl border-2 p-3 transition-all ${
            sender === 'ministry' ? 'border-green-600 bg-green-50' : 'border-gray-200 bg-white'
          } ${!ownConnected ? 'opacity-60 cursor-not-allowed' : 'hover:border-green-300'}`}
        >
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-green-700" />
            {t('ministryWhatsAppBroadcast', 'senderOwn', 'Your own number')}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ownConnected
              ? t('ministryWhatsAppBroadcast', 'senderOwnDesc', 'Arrives from {name}, your verified sender.').replace('{name}', String(wabaConfig?.business_display_name || ministryName))
              : t('ministryWhatsAppBroadcast', 'senderOwnNotConnected', 'Connect it in the Your Number tab first.')}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setSenderChoice('rekindle')}
          className={`text-left rounded-xl border-2 p-3 transition-all hover:border-green-300 ${
            sender === 'rekindle' ? 'border-green-600 bg-green-50' : 'border-gray-200 bg-white'
          }`}
        >
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-green-700" />
            {t('ministryWhatsAppBroadcast', 'senderRekindle', "Via Rekindle's number")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('ministryWhatsAppBroadcast', 'senderRekindleDesc', 'No setup. ${rate} per message from your credits.').replace('{rate}', REKINDLE_MSG_RATE.toFixed(2))}
          </p>
        </button>
      </div>

      {viaRekindle && (
        sharedEnabled ? (
          <div className="flex items-start justify-between gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-xs text-green-800">
              {t('ministryWhatsAppBroadcast', 'sharedOnDesc', 'Members can subscribe to WhatsApp updates on your ministry page. Only subscribers receive your broadcasts, sent from Rekindle with your ministry\'s name in every message.')}
            </p>
            <Button variant="ghost" size="sm" className="shrink-0 text-xs h-7" disabled={togglingShared} onClick={() => setSharedSender(false)}>
              {t('ministryWhatsAppBroadcast', 'turnOff', 'Turn off')}
            </Button>
          </div>
        ) : (
          <Card className="border-green-200">
            <CardContent className="pt-5 space-y-3">
              <p className="text-sm font-semibold">{t('ministryWhatsAppBroadcast', 'letMembersSubscribe', 'Let members subscribe to WhatsApp updates')}</p>
              <p className="text-xs text-muted-foreground">
                {t('ministryWhatsAppBroadcast', 'letMembersSubscribeDesc', 'WhatsApp only allows messages to people who agreed to them. Turning this on shows members a "Subscribe to WhatsApp Updates" card on your ministry page, where they add their number. Your broadcasts then reach everyone who subscribed.')}
              </p>
              <Button size="sm" className="gap-2" disabled={togglingShared} onClick={() => setSharedSender(true)}>
                {togglingShared && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('ministryWhatsAppBroadcast', 'turnOnSubscriptions', 'Turn on WhatsApp updates')}
              </Button>
            </CardContent>
          </Card>
        )
      )}

      {/* Identity notice */}
      {!viaRekindle && wabaConfig && (
      <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
        <div className="p-1.5 bg-green-100 rounded-lg">
          <Shield className="h-4 w-4 text-green-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-green-900">
            {t('ministryWhatsAppBroadcast', 'sendingAs', 'Sending as')} <strong>{wabaConfig.business_display_name}</strong>
          </p>
          <p className="text-xs text-green-700">
            {wabaConfig.phone_number_display} · {t('ministryWhatsAppBroadcast', 'recipientsSeeVerifiedName', 'Recipients see your verified business name')}
          </p>
        </div>
        <Badge variant="outline" className="border-green-300 text-green-700 shrink-0 text-xs">
          {wabaConfig.whatsapp_plan.charAt(0).toUpperCase() + wabaConfig.whatsapp_plan.slice(1)} {t('ministryWhatsAppBroadcast', 'plan', 'Plan')}
        </Badge>
      </div>
      )}

      {/* Last result */}
      {lastResult && (
        <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-800">
              {t('ministryWhatsAppBroadcast', 'lastBroadcastXSent', 'Last broadcast: {count} sent').replace('{count}', lastResult.sent.toLocaleString())}
              {lastResult.failed > 0 && t('ministryWhatsAppBroadcast', 'commaXFailed', ', {count} failed').replace('{count}', String(lastResult.failed))}
            </span>
          </div>
          <span className="text-sm text-emerald-700">${lastResult.cost.toFixed(2)}</span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-green-600" />
            {t('ministryWhatsAppBroadcast', 'composeBroadcast', 'Compose Broadcast')}
          </CardTitle>
          <CardDescription>
            {t('ministryWhatsAppBroadcast', 'sendOnlyBroadcastsDesc', 'Send-only broadcasts — recipients cannot reply through this system.')}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Message type toggle — via Rekindle always uses Rekindle's one
              approved template, filled with your title and message. */}
          {!viaRekindle && (
          <div className="flex gap-2">
            {(['text', 'template'] as const).map(type => (
              <button
                key={type}
                onClick={() => setMessageType(type)}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                  messageType === type
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white border-gray-200 text-muted-foreground hover:border-gray-300'
                }`}
              >
                {type === 'text' ? t('ministryWhatsAppBroadcast', 'freeFormText', '💬 Free-form Text') : t('ministryWhatsAppBroadcast', 'approvedTemplate', '📋 Approved Template')}
              </button>
            ))}
          </div>
          )}

          {/* Text message fields */}
          {(viaRekindle || messageType === 'text') && (
            <>
              <div className="space-y-1.5">
                <Label>{t('ministryWhatsAppBroadcast', 'broadcastTitle', 'Broadcast Title')}</Label>
                <Input
                  placeholder={t('ministryWhatsAppBroadcast', 'broadcastTitlePlaceholder', 'e.g., Sunday Service Reminder')}
                  value={title}
                  maxLength={viaRekindle ? REKINDLE_TITLE_MAX : undefined}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('ministryWhatsAppBroadcast', 'message', 'Message')}</Label>
                <Textarea
                  placeholder={t('ministryWhatsAppBroadcast', 'enterYourMessage', 'Enter your message…')}
                  rows={5}
                  value={message}
                  maxLength={viaRekindle ? REKINDLE_MESSAGE_MAX : undefined}
                  onChange={e => setMessage(e.target.value)}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {viaRekindle
                      ? t('ministryWhatsAppBroadcast', 'rekindleFormatNote', "Sent in Rekindle's approved message format with {name}'s name, your title and message. Line breaks become spaces.").replace('{name}', String(ministryName))
                      : t('ministryWhatsAppBroadcast', 'plainTextNoHtml', 'Plain text — no HTML. Emojis are supported ✅')}
                  </span>
                  <span>
                    {viaRekindle
                      ? `${message.length}/${REKINDLE_MESSAGE_MAX}`
                      : t('ministryWhatsAppBroadcast', 'xChars', '{count} chars').replace('{count}', String(message.length))}
                  </span>
                </div>
              </div>
              {!viaRekindle && (
                <Alert className="border-amber-200 bg-amber-50 py-2">
                  <Info className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800 text-xs">
                    {t('ministryWhatsAppBroadcast', 'freeFormWindowNote', 'WhatsApp only delivers free-form text to people who messaged your number in the last 24 hours. For everyone else, use an approved template.')}
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}

          {/* Template picker */}
          {!viaRekindle && messageType === 'template' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t('ministryWhatsAppBroadcast', 'selectTemplate', 'Select Template')}</Label>
                <Select
                  value={selectedTemplate?.name ?? ''}
                  onValueChange={name => {
                    const tpl = templates.find(item => item.name === name) ?? null;
                    setSelectedTemplate(tpl);
                    setTemplateParams([]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('ministryWhatsAppBroadcast', 'chooseApprovedTemplate', 'Choose an approved template…')} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.length === 0 ? (
                      <SelectItem value="_none" disabled>{t('ministryWhatsAppBroadcast', 'noApprovedTemplates', 'No approved templates')}</SelectItem>
                    ) : templates.map(tpl => (
                      <SelectItem key={tpl.name} value={tpl.name}>
                        {tpl.name}
                        <span className="ml-2 text-xs text-muted-foreground">({tpl.language})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplate && (
                <div className="p-3 bg-gray-50 rounded-lg border text-sm space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t('ministryWhatsAppBroadcast', 'templatePreview', 'Template preview')}</p>
                  <p className="text-sm">{selectedTemplate.body_text}</p>
                  {/* Extract {{1}}, {{2}} etc. and render param inputs */}
                  {(selectedTemplate.body_text.match(/\{\{\d+\}\}/g) ?? []).map((match, i) => (
                    <div key={i} className="space-y-1">
                      <Label className="text-xs">{t('ministryWhatsAppBroadcast', 'parameterXReplacesY', 'Parameter {num} (replaces {token})').replace('{num}', String(i + 1)).replace('{token}', match)}</Label>
                      <Input
                        placeholder={t('ministryWhatsAppBroadcast', 'valueForX', 'Value for {token}').replace('{token}', match)}
                        value={templateParams[i] ?? ''}
                        onChange={e => {
                          const next = [...templateParams];
                          next[i] = e.target.value;
                          setTemplateParams(next);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              <Alert className="border-blue-200 bg-blue-50 py-2">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800 text-xs">
                  {t('ministryWhatsAppBroadcast', 'templatesRequiredNote', 'WhatsApp requires approved templates for marketing messages. Free-form text is only allowed within a 24-hour customer service window.')}
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Target audience */}
          <div className="space-y-1.5">
            <Label>{t('ministryWhatsAppBroadcast', 'recipients', 'Recipients')}</Label>
            <Select value={targetType} onValueChange={(v: any) => setTargetType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ministryWhatsAppBroadcast', 'allOptedInSubscribers', 'All opted-in subscribers')}</SelectItem>
                <SelectItem value="group">{t('ministryWhatsAppBroadcast', 'specificGroup', 'Specific group')}</SelectItem>
                <SelectItem value="small_group">{t('ministryWhatsAppBroadcast', 'specificSmallGroup', 'Specific small group')}</SelectItem>
              </SelectContent>
            </Select>
            {targetType === 'group' && (
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder={t('ministryWhatsAppBroadcast', 'chooseAGroup', 'Choose a group…')} />
                </SelectTrigger>
                <SelectContent>
                  {groups.map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} {t('ministryWhatsAppBroadcast', 'xMembers', '({count} members)').replace('{count}', String(g.member_count))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {targetType === 'small_group' && (
              <>
                <Select value={smallGroupId} onValueChange={setSmallGroupId}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder={t('ministryWhatsAppBroadcast', 'chooseASmallGroup', 'Choose a small group…')} />
                  </SelectTrigger>
                  <SelectContent>
                    {smallGroups.length === 0 ? (
                      <SelectItem value="_none" disabled>{t('ministryWhatsAppBroadcast', 'noSmallGroups', 'No small groups yet')}</SelectItem>
                    ) : smallGroups.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} {t('ministryWhatsAppBroadcast', 'xMembers', '({count} members)').replace('{count}', String(g.member_count))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('ministryWhatsAppBroadcast', 'smallGroupOptInNote', 'Only members who opted in to WhatsApp reminders for this group (Small Groups settings) receive it.')}
                </p>
              </>
            )}
          </div>

          {/* Recipient + cost summary */}
          <div
            className={`rounded-xl border p-4 space-y-3 ${canAfford ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-green-600" />
                {t('ministryWhatsAppBroadcast', 'deliveryEstimate', 'Delivery estimate')}
              </p>
              <button
                className="text-xs text-muted-foreground flex items-center gap-1"
                onClick={() => setShowCostBreakdown(v => !v)}
              >
                {showCostBreakdown ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showCostBreakdown ? t('ministryWhatsAppBroadcast', 'hideBreakdown', 'Hide breakdown') : t('ministryWhatsAppBroadcast', 'showBreakdown', 'Show breakdown')}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-white rounded-lg p-2 border border-green-100">
                <p className="text-xs text-muted-foreground">{t('ministryWhatsAppBroadcast', 'recipients', 'Recipients')}</p>
                <p className="font-bold text-lg">
                  {loadingCount
                    ? <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                    : recipientCount.toLocaleString()
                  }
                </p>
              </div>
              <div className="bg-white rounded-lg p-2 border border-green-100">
                <p className="text-xs text-muted-foreground">{viaRekindle ? t('ministryWhatsAppBroadcast', 'paidMsgs', 'Paid msgs') : t('ministryWhatsAppBroadcast', 'overageMsgs', 'Overage msgs')}</p>
                <p className={`font-bold text-lg ${overageCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  {overageCount.toLocaleString()}
                </p>
              </div>
              <div className="bg-white rounded-lg p-2 border border-green-100">
                <p className="text-xs text-muted-foreground">{viaRekindle ? t('ministryWhatsAppBroadcast', 'cost', 'Cost') : t('ministryWhatsAppBroadcast', 'overageCost', 'Overage cost')}</p>
                <p className={`font-bold text-lg ${!canAfford ? 'text-red-600' : 'text-green-700'}`}>
                  ${overageCost.toFixed(2)}
                </p>
              </div>
            </div>

            {showCostBreakdown && (
              <div className="text-xs space-y-1 pt-1 border-t border-green-200">
                {!viaRekindle && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t('ministryWhatsAppBroadcast', 'monthlyIncludedX', 'Monthly included ({count} msgs/mo)').replace('{count}', Number.isFinite(included) ? included.toLocaleString() : '∞')}</span>
                    <span>{t('ministryWhatsAppBroadcast', 'xUsedSoFar', '{count} used so far').replace('{count}', monthlyUsed.toLocaleString())}</span>
                  </div>
                )}
                {includedUsed > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>{t('ministryWhatsAppBroadcast', 'includedThisBroadcast', 'Included this broadcast')}</span>
                    <span>{t('ministryWhatsAppBroadcast', 'xMsgsFree', '{count} msgs · $0.00').replace('{count}', String(includedUsed))}</span>
                  </div>
                )}
                {overageCount > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>{t('ministryWhatsAppBroadcast', 'overageCalcX', 'Overage ({count} × ${rate})').replace('{count}', String(overageCount)).replace('{rate}', msgRate.toFixed(3))}</span>
                    <span>{t('ministryWhatsAppBroadcast', 'xFromWallet', '${cost} from wallet').replace('{cost}', overageCost.toFixed(2))}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t font-medium">
                  <span>{t('ministryWhatsAppBroadcast', 'walletBalance', 'Wallet balance')}</span>
                  <span className={walletBalance < creditsNeeded ? 'text-red-600' : 'text-green-700'}>
                    {t('ministryWhatsAppBroadcast', 'xCredits', '{count} credits').replace('{count}', walletBalance.toLocaleString())}
                  </span>
                </div>
              </div>
            )}

            {!canAfford && (
              <Alert className="border-red-300 bg-red-100 py-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-700 text-xs">
                  {t('ministryWhatsAppBroadcast', 'needXCreditsWalletHasYCredits', 'Need {needed} credits but your wallet has {have}.').replace('{needed}', String(creditsNeeded)).replace('{have}', String(walletBalance))}
                  {onOpenCredits && (
                    <Button variant="link" size="sm" className="h-auto p-0 ml-1 text-xs text-red-700 underline" onClick={onOpenCredits}>
                      {t('ministryWhatsAppBroadcast', 'topUpCredits', 'Top up credits')}
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {recipientCount === 0 && !loadingCount && (
              <p className="text-xs text-muted-foreground">
                {t('ministryWhatsAppBroadcast', 'noSubscribersHint', 'Nobody has subscribed yet. Members subscribe with the "WhatsApp Updates" card on your ministry page (small groups: in their WhatsApp reminder settings).')}
              </p>
            )}
          </div>

          {/* Schedule — not available via Rekindle yet */}
          {!viaRekindle && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Switch checked={isScheduled} onCheckedChange={setIsScheduled} />
              <Label className="cursor-pointer">{t('ministryWhatsAppBroadcast', 'scheduleForLater', 'Schedule for later')}</Label>
            </div>
            {isScheduled && (
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
              />
            )}
          </div>
          )}

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={sending || (!canAfford && !(isScheduled && !viaRekindle)) || recipientCount === 0}
            className="w-full gap-2"
            size="lg"
          >
            {sending ? (
              <><Loader2 className="h-5 w-5 animate-spin" />{t('ministryWhatsAppBroadcast', 'sending', 'Sending…')}</>
            ) : !canAfford && !(isScheduled && !viaRekindle) ? (
              <><AlertTriangle className="h-5 w-5" />{t('ministryWhatsAppBroadcast', 'insufficientCredits', 'Insufficient Credits')}</>
            ) : isScheduled && !viaRekindle ? (
              <><Calendar className="h-5 w-5" />{t('ministryWhatsAppBroadcast', 'scheduleBroadcast', 'Schedule Broadcast')}</>
            ) : (
              <><Send className="h-5 w-5" />{t('ministryWhatsAppBroadcast', 'sendToXRecipients', 'Send to {count} Recipients').replace('{count}', recipientCount.toLocaleString())}</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* History toggle */}
      <div>
        <button
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setShowHistory(v => !v)}
        >
          <Clock className="h-4 w-4" />
          {showHistory ? t('ministryWhatsAppBroadcast', 'hideBroadcastHistory', 'Hide Broadcast History') : t('ministryWhatsAppBroadcast', 'showBroadcastHistory', 'Show Broadcast History')}
          {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showHistory && (
          <div className="mt-3 space-y-2">
            {broadcastHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('ministryWhatsAppBroadcast', 'noBroadcastsYet', 'No broadcasts sent yet.')}</p>
            ) : broadcastHistory.map(b => (
              <div key={b.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 text-sm">
                <div>
                  <p className="font-medium">{b.title || t('ministryWhatsAppBroadcast', 'noTitle', '(no title)')}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(b.created_at).toLocaleString()} · {b.target_type}
                    {b.sender === 'rekindle' && ` · ${t('ministryWhatsAppBroadcast', 'viaRekindle', 'via Rekindle')}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-2">
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
                  {b.cost_usd != null && (
                    <p className="text-xs text-muted-foreground">${Number(b.cost_usd).toFixed(2)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
