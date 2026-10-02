import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { toast } from '@rekindle/ui/use-toast';
import { ExternalLink, Languages, Loader2, MessageSquarePlus } from 'lucide-react';
import {
  callConversation,
  conversationErrorMessage,
  CONVERSATION_LANGUAGES,
  defaultLanguage,
  languageLabel,
} from '../conversation/conversationApi';
import { BilingualConversationRoom } from './BilingualConversationRoom';

/**
 * Live → Conversation tab. Separate from the Live Translation audience Q&A
 * (translation_questions) and from meetings: start a two-person
 * conversation, share its invite link, talk across languages.
 */

interface RecentConversation {
  id: string;
  host_language: string;
  guest_name: string | null;
  guest_language: string | null;
  status: 'waiting' | 'active' | 'ended';
  created_at: string;
}

interface Props {
  ministryId?: string;
}

const LANGUAGE_PREF_KEY = 'rk-conversation-language';

export const BilingualConversationHub: React.FC<Props> = ({ ministryId }) => {
  const { profile } = useAuth() as { profile?: { full_name?: string | null } | null };
  const [name, setName] = useState('');
  const [language, setLanguage] = useState(() => {
    try { return localStorage.getItem(LANGUAGE_PREF_KEY) || defaultLanguage(); } catch { return defaultLanguage(); }
  });
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<{ id: string; inviteToken: string | null } | null>(null);
  const [recent, setRecent] = useState<RecentConversation[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  useEffect(() => {
    if (!name && profile?.full_name) setName(profile.full_name);
  }, [profile?.full_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    let query = supabase
      .from('bilingual_conversations')
      .select('id, host_language, guest_name, guest_language, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    if (ministryId) query = query.eq('ministry_id', ministryId);
    const { data, error } = await query;
    if (error) console.error('[BilingualConversationHub] recent load failed:', error);
    setRecent((data as RecentConversation[]) || []);
    setRecentLoading(false);
  }, [ministryId]);

  useEffect(() => { if (!open) loadRecent(); }, [open, loadRecent]);

  const create = async () => {
    setCreating(true);
    try {
      try { localStorage.setItem(LANGUAGE_PREF_KEY, language); } catch { /* non-fatal */ }
      const { conversationId, inviteToken } = await callConversation<{ conversationId: string; inviteToken: string }>({
        action: 'create',
        hostName: name.trim() || undefined,
        hostLanguage: language,
        ministryId,
      });
      setOpen({ id: conversationId, inviteToken });
    } catch (err) {
      toast({ title: "Couldn't create the conversation", description: conversationErrorMessage(err), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  if (open) {
    return (
      <div className="h-[calc(100dvh-12rem)] min-h-[560px]">
        <BilingualConversationRoom
          conversationId={open.id}
          initialInviteToken={open.inviteToken}
          onLeave={() => setOpen(null)}
          onSeatLost={(message) => { toast({ title: 'Conversation unavailable', description: message, variant: 'destructive' }); setOpen(null); }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Languages className="h-5 w-5 text-indigo-600" /> Conversation
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Talk with someone who speaks another language. Each of you speaks in your own language and both of you see what was said
          and its translation, live.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Start a conversation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="conversation-name">Your name</Label>
              <Input id="conversation-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Shown to the other person" />
            </div>
            <div className="space-y-1.5">
              <Label>Your language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger aria-label="Your language"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONVERSATION_LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={create} disabled={creating} className="w-full gap-2 sm:w-auto">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
            Create conversation
          </Button>
          <p className="text-xs text-muted-foreground">
            You'll get an invite link to send. The other person opens it, picks their language, and you can both start talking. No account needed on their side.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent conversations</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {languageLabel(c.host_language)} ⇄ {c.guest_language ? languageLabel(c.guest_language) : 'not joined yet'}
                      {c.guest_name && <span className="text-muted-foreground"> · with {c.guest_name}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                      {c.status === 'ended' ? 'Ended' : c.status === 'active' ? 'In progress' : 'Waiting for guest'}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setOpen({ id: c.id, inviteToken: null })} className="gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" /> {c.status === 'ended' ? 'Transcript' : 'Open'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BilingualConversationHub;
