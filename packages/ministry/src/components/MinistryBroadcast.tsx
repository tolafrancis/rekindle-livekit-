import { useState, useEffect } from 'react';
import { supabase } from '@rekindle/supabase';
import { useCurrentMinistry } from '@rekindle/features/CurrentMinistryContext';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Checkbox } from '@rekindle/ui/checkbox';
import { Badge } from '@rekindle/ui/badge';
import { toast } from '@rekindle/ui/use-toast';
import { Send, Loader2, Bell, Smartphone, Mail, MessageSquare } from 'lucide-react';

// Lets a ministry admin/leader send one message to their members across any
// combination of in-app, push, email, and SMS. Reuses the existing
// send-push-notification (in-app + push, notificationType:'group_broadcast'
// so it resolves recipients from ministry_group_members.can_receive_broadcasts
// — the canonical table, not the legacy ministry_members one), plus
// send-ministry-email and the new send-ministry-sms-broadcast for the other
// two channels. WhatsApp already has its own dedicated composer elsewhere and
// isn't duplicated here.

type ChannelKey = 'inApp' | 'push' | 'email' | 'sms';

interface RecentSend {
  id: string;
  title: string;
  channel: string;
  recipients_count: number;
  successful_sends: number;
  failed_sends: number;
  sent_at: string;
}

export default function MinistryBroadcast() {
  const { currentMinistryId, currentMinistry } = useCurrentMinistry();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [channels, setChannels] = useState<Record<ChannelKey, boolean>>({
    inApp: true, push: true, email: false, sms: false,
  });
  const [sending, setSending] = useState(false);
  const [recent, setRecent] = useState<RecentSend[]>([]);

  const loadRecent = async () => {
    if (!currentMinistryId) return;
    const { data } = await supabase
      .from('broadcast_logs')
      .select('id, title, channel, recipients_count, successful_sends, failed_sends, sent_at')
      .contains('metadata', { ministryId: currentMinistryId })
      .order('sent_at', { ascending: false })
      .limit(10);
    setRecent((data as RecentSend[]) ?? []);
  };

  useEffect(() => { loadRecent(); }, [currentMinistryId]);

  const toggleChannel = (key: ChannelKey) =>
    setChannels((prev) => ({ ...prev, [key]: !prev[key] }));

  const send = async () => {
    if (!currentMinistryId) return;
    if (!title.trim() || !message.trim()) {
      return toast({ title: 'Title and message are required', variant: 'destructive' });
    }
    const anyChannel = channels.inApp || channels.push || channels.email || channels.sms;
    if (!anyChannel) {
      return toast({ title: 'Pick at least one channel', variant: 'destructive' });
    }

    setSending(true);
    const errors: string[] = [];

    if (channels.inApp || channels.push) {
      const { error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          title: title.trim(),
          body: message.trim(),
          ministryId: currentMinistryId,
          notificationType: 'group_broadcast',
          inApp: channels.inApp,
          push: channels.push,
        },
      });
      if (error) errors.push(`In-app/push: ${error.message}`);
    }

    if (channels.email) {
      const { error } = await supabase.functions.invoke('send-ministry-email', {
        body: {
          ministryId: currentMinistryId,
          targetAudience: 'all',
          title: title.trim(),
          content: message.trim(),
        },
      });
      if (error) errors.push(`Email: ${error.message}`);
    }

    if (channels.sms) {
      const { error } = await supabase.functions.invoke('send-ministry-sms-broadcast', {
        body: { ministryId: currentMinistryId, title: title.trim(), message: message.trim() },
      });
      if (error) errors.push(`SMS: ${error.message}`);
    }

    setSending(false);

    if (errors.length > 0) {
      toast({ title: 'Some channels failed', description: errors.join(' · '), variant: 'destructive' });
    } else {
      toast({ title: 'Broadcast sent', description: `To ${currentMinistry?.name ?? 'your ministry'}` });
      setTitle('');
      setMessage('');
    }
    loadRecent();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Broadcast</h1>
        <p className="text-sm text-muted-foreground">Send a message to your members — pick any combination of channels.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compose</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sunday service moved to 10am" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Message</label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Write your message…" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Channels</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChannelToggle icon={Bell} label="In-app notification" checked={channels.inApp} onChange={() => toggleChannel('inApp')} />
              <ChannelToggle icon={Smartphone} label="Push notification" checked={channels.push} onChange={() => toggleChannel('push')} />
              <ChannelToggle icon={Mail} label="Email" checked={channels.email} onChange={() => toggleChannel('email')} />
              <ChannelToggle icon={MessageSquare} label="SMS" checked={channels.sms} onChange={() => toggleChannel('sms')} />
            </div>
            {channels.sms && (
              <p className="text-xs text-muted-foreground">SMS needs a connected Twilio number for this ministry — set up under Ministry Settings if you haven't yet.</p>
            )}
          </div>

          <Button onClick={send} disabled={sending} className="w-full">
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            {sending ? 'Sending…' : 'Send broadcast'}
          </Button>
        </CardContent>
      </Card>

      {recent.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recent broadcasts</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{new Date(r.sent_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize">{r.channel}</Badge>
                  <span className="text-xs text-muted-foreground">{r.successful_sends}/{r.recipients_count} sent</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ChannelToggle({ icon: Icon, label, checked, onChange }: {
  icon: React.ElementType; label: string; checked: boolean; onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2.5 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm">{label}</span>
    </label>
  );
}
