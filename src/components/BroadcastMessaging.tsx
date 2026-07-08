import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import {
  Send, MessageSquare, Bell, Smartphone, Calendar, Users,
  Loader2, CheckCircle, AlertCircle, Info, Mail, Eye, X,
  Wallet, AlertTriangle,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { BroadcastWallet, WalletBalanceChip, WHATSAPP_COST_PER_MESSAGE } from './BroadcastWallet';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface WhatsAppChannel {
  id: string;
  name: string;
  description: string;
  subscriber_count: number;
  is_active: boolean;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html_content: string;
  email_type: string;
}

interface ChannelStatus {
  configured: boolean;
  message: string;
}

interface BroadcastMessagingProps {
  onSend: () => void;
}

interface ChannelCardProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge: React.ReactNode;
  activeClass: string;
  checked: boolean;
}

const ChannelCard: React.FC<ChannelCardProps> = ({
  active, onClick, icon, label, badge, activeClass, checked,
}) => (
  <Card
    className={`cursor-pointer transition-all select-none ${active ? activeClass : 'hover:bg-gray-50'}`}
    onClick={onClick}
  >
    <CardContent className="p-4 text-center">
      {icon}
      <p className="text-sm font-medium">{label}</p>
      {badge}
      <Switch checked={checked} className="mt-2 pointer-events-none" />
    </CardContent>
  </Card>
);

export const BroadcastMessaging: React.FC<BroadcastMessagingProps> = ({ onSend }) => {
  const { user, isAdmin } = useAuth();
  const { t } = useLanguage();
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const [whatsappChannels, setWhatsappChannels] = useState<WhatsAppChannel[]>([]);
  const [selectedWhatsAppChannels, setSelectedWhatsAppChannels] = useState<string[]>([]);

  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('none');
  const [emailSubject, setEmailSubject] = useState('');
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  // Wallet state
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [showWalletPanel, setShowWalletPanel] = useState(false);
  const [whatsappRecipientCount, setWhatsappRecipientCount] = useState<number>(0);
  const [countingRecipients, setCountingRecipients] = useState(false);
  // Per-channel subscriber counts for card display
  const [channelSubscriberCounts, setChannelSubscriberCounts] = useState<Record<string, number>>({});

  // WhatsApp provider selection — 'auto' uses whichever secrets are configured
  const [whatsappProvider, setWhatsappProvider] = useState<'auto' | 'meta' | 'twilio'>('auto');

  const [channelStatus, setChannelStatus] = useState<Record<string, ChannelStatus>>({
    inapp:    { configured: false, message: t('broadcastMessaging', 'checking', 'Checking...') },
    whatsapp: { configured: false, message: t('broadcastMessaging', 'checking', 'Checking...') },
    push:     { configured: false, message: t('broadcastMessaging', 'checking', 'Checking...') },
    zalo:     { configured: false, message: t('broadcastMessaging', 'checking', 'Checking...') },
    email:    { configured: false, message: t('broadcastMessaging', 'checking', 'Checking...') },
  });

  const [formData, setFormData] = useState({
    title: '',
    message: '',
    senderName: '',
    channels: {
      push:     false,
      whatsapp: false,
      zalo:     false,
      inapp:    false,
      email:    false,
    },
    targetAudience: 'all',
    scheduledAt: '',
    isScheduled: false,
  });

  useEffect(() => {
    checkChannelConfigurations();
    loadWhatsAppChannels();
    loadEmailTemplates();
  }, []);

  const checkChannelConfigurations = async () => {
    const next: Record<string, ChannelStatus> = { ...channelStatus };

    const checks: Array<{ key: string; table: string; needsRows?: boolean }> = [
      { key: 'inapp',    table: 'notifications' },
      { key: 'whatsapp', table: 'whatsapp_channels', needsRows: true },
      { key: 'push',     table: 'push_tokens' },
      { key: 'zalo',     table: 'zalo_profiles' },
      { key: 'email',    table: 'email_templates' },
    ];

    await Promise.all(
      checks.map(async ({ key, table, needsRows }) => {
        try {
          const { data, error } = await supabase.from(table).select('id').limit(1);
          if (error) {
            next[key] = { configured: false, message: t('broadcastMessaging', 'tableNotFound', 'Table not found. Setup required.') };
          } else if (needsRows && (!data || data.length === 0)) {
            next[key] = { configured: false, message: t('broadcastMessaging', 'noChannelsConfigured', 'No channels configured yet.') };
          } else {
            next[key] = { configured: true, message: t('broadcastMessaging', 'readyToUse', 'Ready to use') };
          }
        } catch {
          next[key] = { configured: false, message: t('broadcastMessaging', 'configurationError', 'Configuration error') };
        }
      }),
    );

    setChannelStatus({ ...next });
  };

  const loadWhatsAppChannels = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_channels')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (!error && data) {
        setWhatsappChannels(data);
        // Load subscriber counts for each channel
        const counts: Record<string, number> = {};
        await Promise.all(data.map(async (ch: { id: string }) => {
          const { count } = await supabase
            .from('whatsapp_channel_subscribers')
            .select('*', { count: 'exact', head: true })
            .eq('channel_id', ch.id);
          counts[ch.id] = count ?? 0;
        }));
        setChannelSubscriberCounts(counts);
      }
    } catch (err) {
      console.error('WhatsApp channel load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadEmailTemplates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('id, name, subject, html_content, email_type')
        .order('name');
      if (!error && data) setEmailTemplates(data);
    } catch (err) {
      console.error('Email template load error:', err);
    }
  }, []);

  const selectedTemplate = emailTemplates.find(tpl => tpl.id === selectedTemplateId) ?? null;

  const handleTemplateSelect = (id: string) => {
    setSelectedTemplateId(id);
    if (id !== 'none') {
      const tpl = emailTemplates.find(item => item.id === id);
      if (tpl && !emailSubject) setEmailSubject(tpl.subject);
    }
  };

  const buildPreviewHtml = (): string => {
    if (!selectedTemplate) return '';
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    return selectedTemplate.html_content
      .replace(/\{\{title\}\}/g,      formData.title      || t('broadcastMessaging', 'previewYourTitle', 'Your Title'))
      .replace(/\{\{message\}\}/g,    formData.message    || t('broadcastMessaging', 'previewYourMessageBody', 'Your message body'))
      .replace(/\{\{senderName\}\}/g, formData.senderName || t('broadcastMessaging', 'previewYourMinistry', 'Your Ministry'))
      .replace(/\{\{userName\}\}/g,   t('broadcastMessaging', 'previewValuedMember', 'Valued Member'))
      .replace(/\{\{date\}\}/g,       today)
      .replace(/\{\{siteUrl\}\}/g,    window.location.origin);
  };

  const handleChannelToggle = (channel: string) => {
    const status = channelStatus[channel];
    if (!status?.configured) {
      toast({ title: t('broadcastMessaging', 'channelNotConfigured', 'Channel Not Configured'), description: status?.message ?? t('broadcastMessaging', 'setupRequired', 'Setup required.') });
    }
    setFormData(prev => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channel]: !prev.channels[channel as keyof typeof prev.channels],
      },
    }));
  };

  const toggleWhatsAppChannel = (id: string) =>
    setSelectedWhatsAppChannels(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );

  const resetForm = () => {
    setFormData({
      title: '', message: '', senderName: '',
      channels: { push: false, whatsapp: false, zalo: false, inapp: false, email: false },
      targetAudience: 'all',
    scheduledAt: '',
    isScheduled: false,
    messageCategory: 'marketing' as 'marketing' | 'transactional',
    });
    setSelectedWhatsAppChannels([]);
    setSelectedTemplateId('none');
    setEmailSubject('');
    setWhatsappProvider('auto');
    setShowEmailPreview(false);
  };

  const handleSend = async () => {
    if (sending) return;

    if (!formData.title.trim() || !formData.message.trim()) {
      toast({ title: t('broadcastMessaging', 'error', 'Error'), description: t('broadcastMessaging', 'titleMessageRequired', 'Title and message are required'), variant: 'destructive' });
      return;
    }

    const selectedChannels = (Object.entries(formData.channels) as [string, boolean][])
      .filter(([, on]) => on)
      .map(([ch]) => ch);

    if (selectedChannels.length === 0) {
      toast({ title: t('broadcastMessaging', 'error', 'Error'), description: t('broadcastMessaging', 'selectAtLeastOneChannel', 'Select at least one channel'), variant: 'destructive' });
      return;
    }

    if (formData.channels.whatsapp && selectedWhatsAppChannels.length === 0) {
      toast({
        title: t('broadcastMessaging', 'error', 'Error'),
        description: t('broadcastMessaging', 'selectWhatsAppChannelOrDisable', 'Select at least one WhatsApp channel or disable the WhatsApp toggle'),
        variant: 'destructive',
      });
      return;
    }

    if (formData.channels.email && !emailSubject.trim()) {
      toast({ title: t('broadcastMessaging', 'error', 'Error'), description: t('broadcastMessaging', 'emailSubjectRequired', 'An email subject is required'), variant: 'destructive' });
      return;
    }

    // Wallet gate — check balance before sending WhatsApp (admins bypass)
    if (!isAdmin && formData.channels.whatsapp && whatsappRecipientCount > 0) {
      if (walletBalance < whatsappRecipientCount) {
        toast({
          title: t('broadcastMessaging', 'insufficientCredits', 'Insufficient credits'),
          description: t('broadcastMessaging', 'insufficientCreditsDesc', 'You need {needed} credits but only have {have}. Top up your wallet to continue.')
            .replace('{needed}', String(whatsappRecipientCount))
            .replace('{have}', String(walletBalance)),
          variant: 'destructive',
        });
        setShowWalletPanel(true);
        return;
      }
    }

    setSending(true);
    const results: { success: string[]; failed: string[]; skipped: string[] } = {
      success: [], failed: [], skipped: [],
    };

    try {
      await supabase.from('broadcast_notifications').insert({
        title:             formData.title,
        message:           formData.message,
        sender_name:       formData.senderName.trim() || undefined,
        channel:           selectedChannels.join(','),
        whatsapp_channels: formData.channels.whatsapp ? selectedWhatsAppChannels : [],
        target_audience:   formData.targetAudience,
        status:            formData.isScheduled ? 'scheduled' : 'sent',
        scheduled_at:      formData.isScheduled ? formData.scheduledAt : null,
        sent_at:           !formData.isScheduled ? new Date().toISOString() : null,
        created_at:        new Date().toISOString(),
      });

      if (formData.isScheduled) {
        toast({
          title: t('broadcastMessaging', 'scheduled', 'Scheduled'),
          description: t('broadcastMessaging', 'broadcastScheduledFor', 'Broadcast scheduled for {when}')
            .replace('{when}', new Date(formData.scheduledAt).toLocaleString()),
        });
        resetForm();
        onSend();
        return;
      }

      // In-App — server-side fan-out (one notifications row per recipient via
      // the edge function's service role, since client inserts for other users
      // are blocked by RLS).
      if (formData.channels.inapp) {
        if (channelStatus.inapp.configured) {
          try {
            const { error } = await supabase.functions.invoke('send-push-notification', {
              body: {
                title: formData.title,
                body: formData.message,
                senderName: formData.senderName.trim() || undefined,
                targetAudience: formData.targetAudience,
                notificationType: 'broadcast',
                inApp: true,
                push: false,
              },
            });
            if (error) throw error;
            results.success.push('In-App');
          } catch { results.failed.push('In-App'); }
        } else { results.skipped.push('In-App'); }
      }

      // Push
      if (formData.channels.push) {
        if (channelStatus.push.configured) {
          try {
            const { error } = await supabase.functions.invoke('send-push-notification', {
              body: { title: formData.title, body: formData.message, senderName: formData.senderName.trim() || undefined, targetAudience: formData.targetAudience },
            });
            if (error) throw error;
            results.success.push('Push');
          } catch { results.failed.push('Push'); }
        } else { results.skipped.push('Push'); }
      }

      // WhatsApp
      if (formData.channels.whatsapp) {
        if (channelStatus.whatsapp.configured && selectedWhatsAppChannels.length > 0) {
          try {
            const { data: subscribers, error: subsError } = await supabase
              .from('whatsapp_channel_subscribers')
              .select('phone_number')
              .in('channel_id', selectedWhatsAppChannels);

            if (subsError) throw subsError;

            const phones = (subscribers ?? [])
              .map((s: { phone_number: string }) => s.phone_number)
              .filter(Boolean);

            if (phones.length > 0) {
              const { error } = await supabase.functions.invoke('broadcast-whatsapp', {
                body: {
                  title:      formData.title,
                  message:    formData.message,
                  senderName: formData.senderName.trim() || undefined,
                  phones,
                  userId:     user?.id,
                  provider:   whatsappProvider === 'auto' ? undefined : whatsappProvider,
                },
              });
              if (error) throw error;
              results.success.push(`WhatsApp (${phones.length} recipients)`);
            } else {
              results.skipped.push('WhatsApp (no subscribers found)');
            }
          } catch { results.failed.push('WhatsApp'); }
        } else { results.skipped.push('WhatsApp'); }
      }

      // Zalo
      if (formData.channels.zalo) {
        if (channelStatus.zalo.configured) {
          try {
            const { error } = await supabase.functions.invoke('send-zalo-message', {
              body: { title: formData.title, message: formData.message, senderName: formData.senderName.trim() || undefined, targetAudience: formData.targetAudience },
            });
            if (error) throw error;
            results.success.push('Zalo');
          } catch { results.failed.push('Zalo'); }
        } else { results.skipped.push('Zalo'); }
      }

      // Email
      if (formData.channels.email) {
        if (channelStatus.email.configured) {
          try {
            const { error } = await supabase.functions.invoke('send-email-broadcast', {
              body: {
                title:           formData.title,
                message:         formData.message,
                senderName:      formData.senderName.trim() || undefined,
                subject:         emailSubject,
                templateId:      selectedTemplateId !== 'none' ? selectedTemplateId : undefined,
                targetAudience:  formData.targetAudience,
                messageCategory: formData.messageCategory,
              },
            });
            if (error) throw error;
            results.success.push('Email');
          } catch { results.failed.push('Email'); }
        } else { results.skipped.push('Email'); }
      }

      const parts: string[] = [];
      if (results.success.length) parts.push(`Sent: ${results.success.join(', ')}`);
      if (results.failed.length)  parts.push(`Failed: ${results.failed.join(', ')}`);
      if (results.skipped.length) parts.push(`Skipped (not configured): ${results.skipped.join(', ')}`);

      toast({ title: t('broadcastMessaging', 'broadcastComplete', 'Broadcast complete'), description: parts.join(' · ') });
      resetForm();
      onSend();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('broadcastMessaging', 'failedToSendBroadcast', 'Failed to send broadcast');
      toast({ title: t('broadcastMessaging', 'error', 'Error'), description: msg, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  // Count WhatsApp recipients whenever selected channels change
  useEffect(() => {
    if (!formData.channels.whatsapp || selectedWhatsAppChannels.length === 0) {
      setWhatsappRecipientCount(0);
      return;
    }
    let cancelled = false;
    const count = async () => {
      setCountingRecipients(true);
      try {
        const { count: c } = await supabase
          .from('whatsapp_channel_subscribers')
          .select('*', { count: 'exact', head: true })
          .in('channel_id', selectedWhatsAppChannels);
        if (!cancelled) setWhatsappRecipientCount(c ?? 0);
      } catch { /* ignore */ } finally {
        if (!cancelled) setCountingRecipients(false);
      }
    };
    count();
    return () => { cancelled = true; };
  }, [formData.channels.whatsapp, selectedWhatsAppChannels]);

  const whatsappCost  = whatsappRecipientCount * WHATSAPP_COST_PER_MESSAGE;
  // Admins are never blocked by credits — they can always send
  const canAffordSend = isAdmin || !formData.channels.whatsapp || walletBalance >= whatsappRecipientCount;

  const getChannelBadge = (channel: string) => {
    const status = channelStatus[channel];
    return status?.configured
      ? <Badge variant="success" className="ml-2 text-xs">{t('broadcastMessaging', 'ready', 'Ready')}</Badge>
      : <Badge variant="secondary" className="ml-2 text-xs">{t('broadcastMessaging', 'notSetup', 'Not Setup')}</Badge>;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>{t('broadcastMessaging', 'broadcastMessagingTitle', 'Broadcast Messaging')}</CardTitle>
              <CardDescription>
                {t('broadcastMessaging', 'broadcastMessagingDesc', 'Send notifications across multiple channels to your users')}
              </CardDescription>
            </div>
            <WalletBalanceChip
              balance={walletBalance}
              loading={false}
              onClick={() => setShowWalletPanel(v => !v)}
            />
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-6">

            {/* Wallet panel — slides open when chip is clicked */}
            {showWalletPanel && (
              <div className="border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-green-50 border-b border-green-100">
                  <span className="text-sm font-medium text-green-800 flex items-center gap-2">
                    <Wallet className="h-4 w-4" /> {t('broadcastMessaging', 'whatsappCreditsWallet', 'WhatsApp Credits Wallet')}
                  </span>
                  <button
                    onClick={() => setShowWalletPanel(false)}
                    className="text-green-600 hover:text-green-800 text-lg leading-none"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-4">
                  <BroadcastWallet
                    pendingRecipientCount={formData.channels.whatsapp ? whatsappRecipientCount : undefined}
                    onBalanceChange={setWalletBalance}
                  />
                </div>
              </div>
            )}

            {Object.values(channelStatus).some(s => !s.configured) && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>{t('broadcastMessaging', 'channelConfiguration', 'Channel Configuration')}</AlertTitle>
                <AlertDescription>
                  {t('broadcastMessaging', 'someChannelsNotConfigured', 'Some channels are not fully configured. Unconfigured channels will be skipped.')}
                </AlertDescription>
              </Alert>
            )}

            <div>
              <Label>{t('broadcastMessaging', 'senderIdentity', 'Sender Identity')}</Label>
              <p className="text-xs text-muted-foreground mb-2">
                {t('broadcastMessaging', 'senderIdentityHint', 'Choose who this broadcast appears to come from. Leave blank to use the default platform name.')}
              </p>
              <Input
                placeholder={t('broadcastMessaging', 'senderNamePlaceholder', 'e.g., Grace Church, Youth Ministry, Pastor John...')}
                value={formData.senderName}
                onChange={e => setFormData({ ...formData, senderName: e.target.value })}
                className="mb-2"
              />
              <div className="flex flex-wrap gap-2">
                {['Our Church', 'Youth Ministry', 'Worship Team', 'Prayer Team', 'Leadership'].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setFormData({ ...formData, senderName: preset })}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      formData.senderName === preset
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted hover:bg-muted/80 border-border text-muted-foreground'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
                {formData.senderName && !['Our Church', 'Youth Ministry', 'Worship Team', 'Prayer Team', 'Leadership'].includes(formData.senderName) && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, senderName: '' })}
                    className="text-xs px-3 py-1 rounded-full border border-border bg-muted hover:bg-muted/80 text-muted-foreground"
                  >
                    ✕ {t('broadcastMessaging', 'clear', 'Clear')}
                  </button>
                )}
              </div>
            </div>

            <div>
              <Label>{t('broadcastMessaging', 'broadcastTitleLabel', 'Broadcast Title')}</Label>
              <Input
                placeholder={t('broadcastMessaging', 'broadcastTitlePlaceholder', 'e.g., Weekly Update, Important Announcement')}
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div>
              <Label>{t('broadcastMessaging', 'messageLabel', 'Message')}</Label>
              <Textarea
                placeholder={t('broadcastMessaging', 'messagePlaceholder', 'Enter your message...')}
                value={formData.message}
                onChange={e => setFormData({ ...formData, message: e.target.value })}
                rows={5}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('broadcastMessaging', 'messageBodyHint', 'Plain-text body for Push / WhatsApp / Zalo / In-App. Injected into email templates via')}{' '}
                <code className="bg-gray-100 px-1 rounded text-xs">{'{{'+'message'+'}}'}</code>.
              </p>
            </div>

            {/* Channel grid */}
            <div>
              <Label className="mb-3 block">{t('broadcastMessaging', 'selectChannels', 'Select Channels')}</Label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">

                <ChannelCard
                  active={formData.channels.push}
                  onClick={() => handleChannelToggle('push')}
                  icon={<Bell className={`h-7 w-7 mx-auto mb-2 ${formData.channels.push ? 'text-blue-500' : 'text-gray-400'}`} />}
                  label={t('broadcastMessaging', 'push', 'Push')}
                  badge={getChannelBadge('push')}
                  activeClass="ring-2 ring-blue-500 bg-blue-50"
                  checked={formData.channels.push}
                />

                <ChannelCard
                  active={formData.channels.whatsapp}
                  onClick={() => handleChannelToggle('whatsapp')}
                  icon={<MessageSquare className={`h-7 w-7 mx-auto mb-2 ${formData.channels.whatsapp ? 'text-green-500' : 'text-gray-400'}`} />}
                  label="WhatsApp"
                  badge={getChannelBadge('whatsapp')}
                  activeClass="ring-2 ring-green-500 bg-green-50"
                  checked={formData.channels.whatsapp}
                />

                <ChannelCard
                  active={formData.channels.zalo}
                  onClick={() => handleChannelToggle('zalo')}
                  icon={<Smartphone className={`h-7 w-7 mx-auto mb-2 ${formData.channels.zalo ? 'text-purple-500' : 'text-gray-400'}`} />}
                  label="Zalo"
                  badge={getChannelBadge('zalo')}
                  activeClass="ring-2 ring-purple-500 bg-purple-50"
                  checked={formData.channels.zalo}
                />

                <ChannelCard
                  active={formData.channels.inapp}
                  onClick={() => handleChannelToggle('inapp')}
                  icon={<Bell className={`h-7 w-7 mx-auto mb-2 ${formData.channels.inapp ? 'text-orange-500' : 'text-gray-400'}`} />}
                  label={t('broadcastMessaging', 'inApp', 'In-App')}
                  badge={getChannelBadge('inapp')}
                  activeClass="ring-2 ring-orange-500 bg-orange-50"
                  checked={formData.channels.inapp}
                />

                {/* Email — fifth channel */}
                <ChannelCard
                  active={formData.channels.email}
                  onClick={() => handleChannelToggle('email')}
                  icon={<Mail className={`h-7 w-7 mx-auto mb-2 ${formData.channels.email ? 'text-rose-500' : 'text-gray-400'}`} />}
                  label={t('broadcastMessaging', 'email', 'Email')}
                  badge={getChannelBadge('email')}
                  activeClass="ring-2 ring-rose-500 bg-rose-50"
                  checked={formData.channels.email}
                />

              </div>
            </div>

            {/* WhatsApp channel picker */}
            {formData.channels.whatsapp && (
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-green-500" />
                    <Label>{t('broadcastMessaging', 'selectWhatsAppChannels', 'Select WhatsApp Channels')}</Label>
                    {selectedWhatsAppChannels.length > 0 && (
                      <Badge variant="secondary">{t('broadcastMessaging', 'countSelected', '{count} selected').replace('{count}', String(selectedWhatsAppChannels.length))}</Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => setSelectedWhatsAppChannels(whatsappChannels.map(c => c.id))}
                      disabled={whatsappChannels.length === 0}>
                      {t('broadcastMessaging', 'selectAll', 'Select All')}
                    </Button>
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => setSelectedWhatsAppChannels([])}
                      disabled={selectedWhatsAppChannels.length === 0}>
                      {t('broadcastMessaging', 'clear', 'Clear')}
                    </Button>
                  </div>
                </div>

                {/* Provider toggle */}
                <div className="flex items-center gap-3">
                  <Label className="text-sm text-muted-foreground shrink-0">{t('broadcastMessaging', 'sendVia', 'Send via')}</Label>
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                    {([
                      { value: 'auto',   label: t('broadcastMessaging', 'auto', 'Auto') },
                      { value: 'meta',   label: 'Meta' },
                      { value: 'twilio', label: 'Twilio' },
                    ] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setWhatsappProvider(opt.value)}
                        className={`px-3 py-1.5 transition-colors ${
                          whatsappProvider === opt.value
                            ? 'bg-green-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {whatsappProvider === 'auto'   && t('broadcastMessaging', 'providerAutoDesc', 'Uses whichever provider is configured')}
                    {whatsappProvider === 'meta'   && t('broadcastMessaging', 'providerMetaDesc', 'Force Meta Graph API')}
                    {whatsappProvider === 'twilio' && t('broadcastMessaging', 'providerTwilioDesc', 'Force Twilio Programmable Messaging')}
                  </span>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-green-500" />
                    <span className="ml-2 text-sm text-gray-500">{t('broadcastMessaging', 'loadingChannels', 'Loading channels...')}</span>
                  </div>
                ) : whatsappChannels.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t('broadcastMessaging', 'noActiveWhatsAppChannels', 'No active WhatsApp channels found. Create channels in Live Channels first.')}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto p-2 border rounded-lg">
                    {whatsappChannels.map(channel => (
                      <Card
                        key={channel.id}
                        className={`cursor-pointer transition-all hover:shadow-md ${
                          selectedWhatsAppChannels.includes(channel.id)
                            ? 'ring-2 ring-green-500 bg-green-50'
                            : ''
                        }`}
                        onClick={() => toggleWhatsAppChannel(channel.id)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selectedWhatsAppChannels.includes(channel.id)}
                              onCheckedChange={() => toggleWhatsAppChannel(channel.id)}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">{channel.name}</p>
                                {channel.is_active && (
                                  <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">{channel.description}</p>
                              <div className="flex items-center gap-1 mt-1">
                                <Users className="h-3 w-3 text-gray-400" />
                                <span className="text-xs text-gray-500">
                                  {t('broadcastMessaging', 'countSubscribers', '{count} subscribers').replace('{count}', String(channelSubscriberCounts[channel.id] ?? 0))}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* WhatsApp cost summary — shown when channels are selected */}
            {formData.channels.whatsapp && selectedWhatsAppChannels.length > 0 && (
              <div className={`rounded-xl border p-4 space-y-3 ${canAffordSend ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MessageSquare className={`h-4 w-4 ${canAffordSend ? 'text-green-600' : 'text-red-500'}`} />
                    <span className={canAffordSend ? 'text-green-800' : 'text-red-700'}>
                      {t('broadcastMessaging', 'whatsappBroadcastCost', 'WhatsApp Broadcast Cost')}
                    </span>
                  </div>
                  <WalletBalanceChip
                    balance={walletBalance}
                    loading={false}
                    onClick={() => setShowWalletPanel(true)}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-white rounded-lg p-2 border border-green-100">
                    <p className="text-xs text-muted-foreground">{t('broadcastMessaging', 'recipients', 'Recipients')}</p>
                    <p className="font-bold text-lg">
                      {countingRecipients
                        ? <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                        : whatsappRecipientCount.toLocaleString()
                      }
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-green-100">
                    <p className="text-xs text-muted-foreground">{t('broadcastMessaging', 'creditsNeeded', 'Credits needed')}</p>
                    <p className={`font-bold text-lg ${canAffordSend ? 'text-green-700' : 'text-red-600'}`}>
                      {whatsappRecipientCount.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-green-100">
                    <p className="text-xs text-muted-foreground">{t('broadcastMessaging', 'cost', 'Cost')}</p>
                    <p className={`font-bold text-lg ${canAffordSend ? 'text-green-700' : 'text-red-600'}`}>
                      ${whatsappCost.toFixed(2)}
                    </p>
                  </div>
                </div>

                {!canAffordSend && (
                  <Alert className="border-red-300 bg-red-100 py-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-700 text-xs">
                      {t('broadcastMessaging', 'insufficientCreditsLabel', 'Insufficient credits.')} {t('broadcastMessaging', 'youNeed', 'You need')} <strong>{whatsappRecipientCount}</strong> {t('broadcastMessaging', 'butHave', 'but have')} <strong>{walletBalance}</strong>.{' '}
                      <button
                        className="underline font-medium"
                        onClick={() => setShowWalletPanel(true)}
                      >
                        {t('broadcastMessaging', 'topUpNow', 'Top up now')}
                      </button>
                    </AlertDescription>
                  </Alert>
                )}

                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3 shrink-0" />
                  {t('broadcastMessaging', 'onlyDeliveredCharged', 'Only successfully delivered messages are charged.')} {t('broadcastMessaging', 'perMsgSendOnly', '${cost}/msg · send-only, no replies.').replace('{cost}', WHATSAPP_COST_PER_MESSAGE.toFixed(2))}
                </p>
              </div>
            )}
            {formData.channels.email && (
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-rose-500" />
                  <Label className="text-base font-medium">{t('broadcastMessaging', 'emailOptions', 'Email Options')}</Label>
                </div>

                {/* Template picker */}
                <div>
                  <Label className="text-sm">
                    {t('broadcastMessaging', 'template', 'Template')}{' '}
                    <span className="text-muted-foreground font-normal">{t('broadcastMessaging', 'optional', '(optional)')}</span>
                  </Label>
                  <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={t('broadcastMessaging', 'noTemplatePlainLayout', 'No template — plain layout')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('broadcastMessaging', 'noTemplateWrapPlain', 'No template — wrap message in plain layout')}</SelectItem>
                      {emailTemplates.map(tpl => (
                        <SelectItem key={tpl.id} value={tpl.id}>
                          {tpl.name}
                          <span className="ml-2 text-xs text-muted-foreground capitalize">
                            ({tpl.email_type})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {emailTemplates.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {t('broadcastMessaging', 'noTemplatesFound', 'No templates found — create them in the')}{' '}
                      <strong>Notifications</strong> {t('broadcastMessaging', 'tabThenComeBack', 'tab then come back here.')}
                    </p>
                  )}
                </div>

                {/* Subject */}
                <div>
                  <Label className="text-sm">
                    {t('broadcastMessaging', 'subjectLine', 'Subject Line')} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    className="mt-1"
                    placeholder={t('broadcastMessaging', 'subjectPlaceholder', "e.g., This week's devotional update")}
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                  />
                  {selectedTemplate && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('broadcastMessaging', 'templateDefault', 'Template default:')} <em>{selectedTemplate.subject}</em>
                    </p>
                  )}
                </div>

                {/* Live preview */}
                {selectedTemplate && (
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setShowEmailPreview(v => !v)}
                    >
                      {showEmailPreview
                        ? <><X className="h-3.5 w-3.5" />{t('broadcastMessaging', 'hidePreview', 'Hide Preview')}</>
                        : <><Eye className="h-3.5 w-3.5" />{t('broadcastMessaging', 'previewEmail', 'Preview Email')}</>
                      }
                    </Button>

                    {showEmailPreview && (
                      <div className="mt-3 border rounded-lg overflow-hidden shadow-sm">
                        <div className="bg-gray-50 px-4 py-2 border-b flex items-center justify-between">
                          <div className="flex flex-col gap-0.5">
                            {formData.senderName && (
                              <span className="text-xs font-medium text-muted-foreground">
                                {t('broadcastMessaging', 'fromLabel', 'From:')} <em>{formData.senderName}</em>
                              </span>
                            )}
                            <span className="text-xs font-medium text-muted-foreground">
                              {t('broadcastMessaging', 'subjectLabel', 'Subject:')} <em>{emailSubject || selectedTemplate.subject}</em>
                            </span>
                          </div>
                          <Badge variant="outline" className="text-xs">{t('broadcastMessaging', 'livePreview', 'Live preview')}</Badge>
                        </div>
                        <div
                          className="h-80 overflow-auto p-2 bg-white"
                          dangerouslySetInnerHTML={{ __html: buildPreviewHtml() }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Message Category — controls email consent filtering */}
            {formData.channels.email && (
              <div>
                <Label>{t('broadcastMessaging', 'messageType', 'Message Type')}</Label>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden mt-1.5 text-sm font-medium">
                  {([
                    { value: 'marketing',     label: t('broadcastMessaging', 'marketing', 'Marketing'),         desc: t('broadcastMessaging', 'marketingDesc', 'Filtered by email opt-in + consent') },
                    { value: 'transactional', label: t('broadcastMessaging', 'transactional', 'Transactional'), desc: t('broadcastMessaging', 'transactionalDesc', 'Reaches all opted-in users') },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, messageCategory: opt.value })}
                      className={`flex-1 px-3 py-2 transition-colors text-left ${
                        formData.messageCategory === opt.value
                          ? 'bg-purple-600 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="block">{opt.label}</span>
                      <span className={`block text-xs mt-0.5 ${formData.messageCategory === opt.value ? 'text-purple-200' : 'text-gray-400'}`}>
                        {opt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Target Audience */}
            <div>
              <Label>{t('broadcastMessaging', 'targetAudience', 'Target Audience')}</Label>
              <Select
                value={formData.targetAudience}
                onValueChange={v => setFormData({ ...formData, targetAudience: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('broadcastMessaging', 'allUsers', 'All Users')}</SelectItem>
                  <SelectItem value="premium">{t('broadcastMessaging', 'premiumUsers', 'Premium Users')}</SelectItem>
                  <SelectItem value="free">{t('broadcastMessaging', 'freeUsers', 'Free Users')}</SelectItem>
                  <SelectItem value="new_converts">{t('broadcastMessaging', 'newConverts', 'New Converts')}</SelectItem>
                  <SelectItem value="counsellors">{t('broadcastMessaging', 'counsellors', 'Counsellors')}</SelectItem>
                  <SelectItem value="leaders">{t('broadcastMessaging', 'leaders', 'Leaders')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Schedule toggle */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isScheduled}
                  onCheckedChange={v => setFormData({ ...formData, isScheduled: v })}
                />
                <Label className="cursor-pointer">{t('broadcastMessaging', 'scheduleForLater', 'Schedule for later')}</Label>
              </div>
              {formData.isScheduled && (
                <div>
                  <Label>{t('broadcastMessaging', 'scheduleDateTime', 'Schedule Date & Time')}</Label>
                  <Input
                    type="datetime-local"
                    value={formData.scheduledAt}
                    onChange={e => setFormData({ ...formData, scheduledAt: e.target.value })}
                  />
                </div>
              )}
            </div>

            {/* Sender summary */}
            {formData.senderName && (
              <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-sm text-muted-foreground">
                <Send className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {t('broadcastMessaging', 'willBeSentAs', 'This broadcast will be sent as')} <strong className="text-foreground">{formData.senderName}</strong>
                </span>
              </div>
            )}

            {/* Send */}
            <Button
              onClick={handleSend}
              disabled={sending || !canAffordSend}
              className="w-full"
              size="lg"
            >
              {sending ? (
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" />{t('broadcastMessaging', 'sending', 'Sending...')}</>
              ) : !canAffordSend ? (
                <><AlertTriangle className="h-5 w-5 mr-2" />{t('broadcastMessaging', 'insufficientCreditsTopUp', 'Insufficient Credits — Top Up to Send')}</>
              ) : formData.isScheduled ? (
                <><Calendar className="h-5 w-5 mr-2" />{t('broadcastMessaging', 'scheduleBroadcast', 'Schedule Broadcast')}</>
              ) : (
                <><Send className="h-5 w-5 mr-2" />{t('broadcastMessaging', 'sendNow', 'Send Now')}</>
              )}
            </Button>

          </div>
        </CardContent>
      </Card>
    </div>
  );
};