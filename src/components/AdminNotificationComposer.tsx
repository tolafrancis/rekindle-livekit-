import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from './ui/use-toast';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { Bell, Send, Loader2, ExternalLink } from 'lucide-react';

// Audience values must match the send-push-notification edge function's switch.
const AUDIENCES = [
  { value: 'all',          label: 'All users' },
  { value: 'premium',      label: 'Premium members' },
  { value: 'free',         label: 'Free members' },
  { value: 'leaders',      label: 'Leaders' },
  { value: 'counsellors',  label: 'Counsellors' },
  { value: 'new_converts', label: 'New converts' },
];

// Optional quick deep links into the app's hash-tab router.
const LINK_PRESETS = [
  { value: '',                     label: 'None' },
  { value: '/#home',               label: 'Home' },
  { value: '/#devotional-library', label: 'Devotionals' },
  { value: '/#prayer-library',     label: 'Prayer' },
  { value: '/#challenges',         label: 'Challenges' },
  { value: '/#live-channels',      label: 'Live Channels' },
  { value: '/#books',              label: 'Books' },
];

export const AdminNotificationComposer: React.FC = () => {
  const { t } = useLanguage();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [senderName, setSenderName] = useState('');
  const [audience, setAudience] = useState('all');
  const [alsoPush, setAlsoPush] = useState(true);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ inApp: number; push: number } | null>(null);

  const audienceLabel = AUDIENCES.find(a => a.value === audience)?.label ?? audience;

  const send = async () => {
    if (!title.trim() || !message.trim()) {
      toast({
        title: t('adminNotificationComposer', 'missingTitle', 'Title and message required'),
        description: t('adminNotificationComposer', 'missingDesc', 'Enter both a title and a message before sending.'),
        variant: 'destructive',
      });
      return;
    }

    if (!confirm(
      t('adminNotificationComposer', 'confirmSend', 'Send this notification to: {a}?').replace('{a}', audienceLabel)
    )) return;

    setSending(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          title: title.trim(),
          body: message.trim(),
          link: link || undefined,
          senderName: senderName.trim() || undefined,
          targetAudience: audience,
          notificationType: 'broadcast',
          inApp: true,          // always write the in-app (bell) row
          push: alsoPush,       // optionally also send device push
        },
      });

      if (error) {
        // Surface the real server error (supabase-js hides it behind a generic message).
        let serverMsg = error.message;
        try {
          const body = await (error as any)?.context?.json?.();
          if (body?.error) serverMsg = body.error + (body.details ? ` — ${body.details}` : '');
        } catch { /* body not JSON */ }
        throw new Error(serverMsg);
      }

      const inApp = data?.inApp ?? 0;
      const push = data?.sent ?? 0;
      setLastResult({ inApp, push });
      toast({
        title: t('adminNotificationComposer', 'sentTitle', 'Notification sent'),
        description: t('adminNotificationComposer', 'sentDesc', 'In-app: {n} · Push: {p}').replace('{n}', String(inApp)).replace('{p}', String(push)),
      });
      setTitle('');
      setMessage('');
      setLink('');
    } catch (e: any) {
      console.error('[AdminNotificationComposer] send failed:', e);
      toast({
        title: t('adminNotificationComposer', 'failedTitle', 'Send failed'),
        description: e?.message || t('adminNotificationComposer', 'failedDesc', 'Could not send notification.'),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="border-purple-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-purple-600" />
          {t('adminNotificationComposer', 'title', 'In-App Notification')}
        </CardTitle>
        <CardDescription>
          {t('adminNotificationComposer', 'desc', 'Send a notification to the bell feed for a group of users. Optionally also deliver it as a device push.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>{t('adminNotificationComposer', 'audienceLabel', 'Audience')}</Label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUDIENCES.map(a => (
                  <SelectItem key={a.value} value={a.value}>
                    {t('adminNotificationComposer', `aud_${a.value}`, a.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('adminNotificationComposer', 'senderLabel', 'Sender name (optional)')}</Label>
            <Input
              value={senderName}
              onChange={e => setSenderName(e.target.value)}
              placeholder={t('adminNotificationComposer', 'senderPlaceholder', 'e.g. ReKindle Team')}
            />
          </div>
        </div>

        <div>
          <Label>{t('adminNotificationComposer', 'titleLabel', 'Title *')}</Label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={120}
            placeholder={t('adminNotificationComposer', 'titlePlaceholder', 'e.g. New devotional series is live')}
          />
        </div>

        <div>
          <Label>{t('adminNotificationComposer', 'messageLabel', 'Message *')}</Label>
          <Textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={t('adminNotificationComposer', 'messagePlaceholder', 'Write the notification body…')}
          />
        </div>

        <div>
          <Label>{t('adminNotificationComposer', 'linkLabel', 'Open on tap (optional)')}</Label>
          <Select value={link || 'none'} onValueChange={(v) => setLink(v === 'none' ? '' : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LINK_PRESETS.map(l => {
                const val = l.value || 'none';
                return (
                  <SelectItem key={val} value={val}>
                    {t('adminNotificationComposer', `link_${val}`, l.label)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Push toggle */}
        <div className="flex items-center justify-between rounded-lg border p-3 bg-gray-50">
          <div>
            <Label className="font-medium">{t('adminNotificationComposer', 'alsoPushLabel', 'Also send as device push')}</Label>
            <p className="text-xs text-gray-500">{t('adminNotificationComposer', 'alsoPushDesc', 'Reaches users even when the app is closed (requires push enabled on their device).')}</p>
          </div>
          <Switch checked={alsoPush} onCheckedChange={setAlsoPush} />
        </div>

        {/* Live preview of the bell item */}
        <div>
          <Label className="text-xs text-gray-400 uppercase tracking-wide">{t('adminNotificationComposer', 'previewLabel', 'Preview')}</Label>
          <div className="mt-1 flex items-start gap-3 px-4 py-3 rounded-xl border bg-purple-50/40">
            <div className="mt-1.5 shrink-0"><div className="w-2 h-2 rounded-full bg-purple-500" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">{t('adminNotificationComposer', 'previewBadge', 'Notification')}</span>
                <span className="text-xs text-gray-400">{t('adminNotificationComposer', 'previewNow', 'Just now')}</span>
              </div>
              <p className="text-sm font-medium text-gray-800 break-words leading-snug">
                {title || t('adminNotificationComposer', 'previewTitle', 'Your title appears here')}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 break-words line-clamp-2">
                {message || t('adminNotificationComposer', 'previewMessage', 'Your message appears here')}
              </p>
              {senderName && <p className="text-xs text-gray-400 mt-0.5 italic">— {senderName}</p>}
            </div>
            {link && <ExternalLink className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
          </div>
        </div>

        {lastResult && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            {t('adminNotificationComposer', 'resultLine', 'Delivered — in-app: {n}, push: {p}.')
              .replace('{n}', String(lastResult.inApp))
              .replace('{p}', String(lastResult.push))}
          </p>
        )}

        <div className="flex justify-end">
          <Button onClick={send} disabled={sending} className="bg-purple-600 hover:bg-purple-700">
            {sending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('adminNotificationComposer', 'sending', 'Sending…')}</>
              : <><Send className="h-4 w-4 mr-2" />{t('adminNotificationComposer', 'sendButton', 'Send notification')}</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminNotificationComposer;
