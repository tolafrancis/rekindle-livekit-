import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, supabaseUrl } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import EvangelismChannelsPanel from './EvangelismChannelsPanel';
import {
  MessageSquare, Send, Search, RefreshCw, Filter,
  Phone, Globe, Instagram, Facebook, Loader2, User,
  ChevronLeft, MoreVertical, Circle, CheckCheck, Clock,
  Tag, Archive, Inbox, Wifi, WifiOff, Bot, Plug
} from 'lucide-react';
import { notify } from '@/lib/notify';

// ─── Types ──────────────────────────────────────────────────────────────────

type Channel = 'whatsapp' | 'messenger' | 'instagram' | 'website';

interface Contact {
  id: string;
  ministry_id: string;
  channel: Channel;
  external_id: string;       // WA phone / PSID / IG IGSID / socket ID
  display_name: string;
  avatar_url?: string;
  phone?: string;
  last_message_at: string;
  last_message_preview: string;
  unread_count: number;
  status: 'open' | 'resolved' | 'archived';
  tags: string[];
  notes?: string;
  created_at: string;
}

interface Message {
  id: string;
  contact_id: string;
  ministry_id: string;
  direction: 'inbound' | 'outbound';
  channel: Channel;
  body: string;
  media_url?: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  created_at: string;
  sent_by?: string;   // staff user_id for outbound
}

// ─── Channel config ──────────────────────────────────────────────────────────

const CHANNEL_META: Record<Channel, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  whatsapp:  { label: 'WhatsApp',  color: 'text-green-600',  bg: 'bg-green-100',  Icon: Phone    },
  messenger: { label: 'Messenger', color: 'text-blue-600',   bg: 'bg-blue-100',   Icon: Facebook },
  instagram: { label: 'Instagram', color: 'text-pink-600',   bg: 'bg-pink-100',   Icon: Instagram},
  website:   { label: 'Website',   color: 'text-purple-600', bg: 'bg-purple-100', Icon: Globe    },
};

function ChannelBadge({ channel }: { channel: Channel }) {
  const m = CHANNEL_META[channel];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${m.color} ${m.bg}`}>
      <m.Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  ministryId: string;
  ministryName: string;
  isLeader: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const EvangelismInbox: React.FC<Props> = ({ ministryId, ministryName, isLeader }) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();

  // List state
  const [contacts, setContacts]           = useState<Contact[]>([]);
  const [showChannels, setShowChannels]   = useState(false);
  const [loading, setLoading]             = useState(true);
  const [searchQuery, setSearchQuery]     = useState('');
  const [channelFilter, setChannelFilter] = useState<Channel | 'all'>('all');
  const [statusFilter, setStatusFilter]   = useState<'open' | 'resolved' | 'archived' | 'all'>('open');

  // Thread state
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages]               = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText]             = useState('');
  const [sending, setSending]                 = useState(false);
  const [tagInput, setTagInput]               = useState('');
  const [showNotes, setShowNotes]             = useState(false);
  const [notesText, setNotesText]             = useState('');
  const [aiSuggestion, setAiSuggestion]       = useState('');
  const [loadingAI, setLoadingAI]             = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyRef       = useRef<HTMLTextAreaElement>(null);

  // ── Load contacts ──────────────────────────────────────────────────────────
  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('ministry_evangelism_contacts')
        .select('*')
        .eq('ministry_id', ministryId)
        .order('last_message_at', { ascending: false });

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (channelFilter !== 'all') query = query.eq('channel', channelFilter);

      const { data, error } = await query;
      if (error) throw error;
      setContacts(data || []);
    } catch (err: any) {
      toast({ title: t('evangelismInbox', 'errorLoadingContacts', 'Error loading contacts'), description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [ministryId, statusFilter, channelFilter]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // ── Realtime: new inbound messages update contact list ────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`inbox-contacts-${ministryId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ministry_evangelism_contacts',
        filter: `ministry_id=eq.${ministryId}`,
      }, () => { loadContacts(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ministryId, loadContacts]);

  // ── Load thread ────────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (contact: Contact) => {
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from('ministry_evangelism_messages')
        .select('*')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);

      // Mark as read
      if (contact.unread_count > 0) {
        await supabase
          .from('ministry_evangelism_contacts')
          .update({ unread_count: 0 })
          .eq('id', contact.id);
        setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, unread_count: 0 } : c));
      }
    } catch (err: any) {
      toast({ title: t('evangelismInbox', 'errorLoadingMessages', 'Error loading messages'), description: err.message, variant: 'destructive' });
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  // ── Realtime: new messages in open thread ─────────────────────────────────
  useEffect(() => {
    if (!selectedContact) return;
    const channel = supabase
      .channel(`inbox-thread-${selectedContact.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ministry_evangelism_messages',
        filter: `contact_id=eq.${selectedContact.id}`,
      }, payload => {
        setMessages(prev => [...prev, payload.new as Message]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedContact]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openThread = (contact: Contact) => {
    setSelectedContact(contact);
    setNotesText(contact.notes || '');
    setAiSuggestion('');
    loadMessages(contact);
  };

  // ── Send reply ─────────────────────────────────────────────────────────────
  const sendReply = async () => {
    if (!selectedContact || !replyText.trim() || !user) return;
    setSending(true);
    const body = replyText.trim();
    setReplyText('');

    try {
      // 1. Insert outbound message record
      const { error: msgErr } = await supabase
        .from('ministry_evangelism_messages')
        .insert({
          contact_id:  selectedContact.id,
          ministry_id: ministryId,
          direction:   'outbound',
          channel:     selectedContact.channel,
          body,
          status:      'sent',
          sent_by:     user.id,
        });
      if (msgErr) throw msgErr;

      // 2. Update contact preview
      await supabase
        .from('ministry_evangelism_contacts')
        .update({ last_message_at: new Date().toISOString(), last_message_preview: `You: ${body.slice(0, 60)}` })
        .eq('id', selectedContact.id);

      // 3. Route to actual channel via edge function
      await supabase.functions.invoke('evangelism-send-message', {
        body: {
          ministryId,
          contactId:  selectedContact.id,
          channel:    selectedContact.channel,
          externalId: selectedContact.external_id,
          message:    body,
        },
      });

    } catch (err: any) {
      toast({ title: t('evangelismInbox', 'failedToSend', 'Failed to send'), description: err.message, variant: 'destructive' });
      setReplyText(body); // restore
    } finally {
      setSending(false);
      replyRef.current?.focus();
    }
  };

  // ── AI Gospel response suggestion ──────────────────────────────────────────
  const getAISuggestion = async () => {
    if (!selectedContact || messages.length === 0) return;
    setLoadingAI(true);
    try {
      const lastFew = messages.slice(-6).map(m =>
        `${m.direction === 'inbound' ? selectedContact.display_name : 'Us'}: ${m.body}`
      ).join('\n');

      // Route through a secure edge function — the API key lives in Supabase
      // secrets, never in the browser.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Please sign in again.');

      const res = await fetch(`${supabaseUrl}/functions/v1/evangelism-ai-suggestion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          conversation: lastFew,
          channelLabel: CHANNEL_META[selectedContact.channel].label,
          ministryName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'AI suggestion failed');
      setAiSuggestion((data.suggestion || '').trim());
    } catch (e: any) {
      toast({ title: t('evangelismInbox', 'aiSuggestionUnavailable', 'AI suggestion unavailable'), description: e?.message, variant: 'destructive' });
    } finally {
      setLoadingAI(false);
    }
  };

  // ── Status / tag actions ────────────────────────────────────────────────────
  const updateStatus = async (status: Contact['status']) => {
    if (!selectedContact) return;
    await supabase.from('ministry_evangelism_contacts').update({ status }).eq('id', selectedContact.id);
    setSelectedContact(prev => prev ? { ...prev, status } : null);
    setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, status } : c));
    toast({ title: t('evangelismInbox', 'conversationStatusChanged', 'Conversation {status}').replace('{status}', String(status)) });
  };

  const addTag = async () => {
    if (!selectedContact || !tagInput.trim()) return;
    const tag = tagInput.trim().toLowerCase();
    if (selectedContact.tags.includes(tag)) { setTagInput(''); return; }
    const newTags = [...selectedContact.tags, tag];
    await supabase.from('ministry_evangelism_contacts').update({ tags: newTags }).eq('id', selectedContact.id);
    setSelectedContact(prev => prev ? { ...prev, tags: newTags } : null);
    setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, tags: newTags } : c));
    setTagInput('');
  };

  const removeTag = async (tag: string) => {
    if (!selectedContact) return;
    const newTags = selectedContact.tags.filter(existing => existing !== tag);
    await supabase.from('ministry_evangelism_contacts').update({ tags: newTags }).eq('id', selectedContact.id);
    setSelectedContact(prev => prev ? { ...prev, tags: newTags } : null);
    setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, tags: newTags } : c));
  };

  const saveNotes = async () => {
    if (!selectedContact) return;
    await supabase.from('ministry_evangelism_contacts').update({ notes: notesText }).eq('id', selectedContact.id);
    toast({ title: t('evangelismInbox', 'notesSaved', 'Notes saved') });
  };

  // ── Filtered contacts ──────────────────────────────────────────────────────
  const filteredContacts = contacts.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.display_name.toLowerCase().includes(q) ||
      c.last_message_preview.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.tags.some(tag => tag.includes(q))
    );
  });

  const totalUnread = contacts.reduce((sum, c) => sum + c.unread_count, 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-180px)] min-h-[500px] bg-white rounded-xl border border-gray-200 overflow-hidden">

      {/* ── LEFT: Contact list ───────────────────────────────────────────── */}
      <div className={`flex flex-col w-full md:w-80 border-r border-gray-100 ${selectedContact ? 'hidden md:flex' : 'flex'}`}>

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-purple-600" />
              <span className="font-semibold text-sm text-gray-800">{t('evangelismInbox', 'evangelismInbox', 'Evangelism Inbox')}</span>
              {totalUnread > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {totalUnread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setShowChannels(true)} title={t('evangelismInbox', 'connectChannelsTooltip', 'Connect WhatsApp, Messenger, Instagram & website chat')} className="text-xs text-purple-600 hover:text-purple-700 gap-1">
                <Plug className="h-3.5 w-3.5" />
                {t('evangelismInbox', 'connectChannels', 'Connect channels')}
              </Button>
              <Button variant="ghost" size="icon" onClick={loadContacts} title={t('evangelismInbox', 'refresh', 'Refresh')}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('evangelismInbox', 'searchContacts', 'Search contacts…')}
              className="pl-8 h-8 text-sm"
            />
          </div>

          {/* Channel filter */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {(['all', 'whatsapp', 'messenger', 'instagram', 'website'] as const).map(ch => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                className={`shrink-0 text-xs px-2 py-1 rounded-md font-medium transition-colors ${
                  channelFilter === ch
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {ch === 'all' ? t('evangelismInbox', 'all', 'All') : CHANNEL_META[ch].label}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex gap-1 mt-1.5">
            {(['open', 'resolved', 'archived'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium transition-colors ${
                  statusFilter === s
                    ? s === 'open' ? 'bg-green-100 text-green-700' : s === 'resolved' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {s === 'open' ? t('evangelismInbox', 'statusOpen', 'open') : s === 'resolved' ? t('evangelismInbox', 'statusResolved', 'resolved') : t('evangelismInbox', 'statusArchived', 'archived')}
              </button>
            ))}
          </div>
        </div>

        {/* Contact rows */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-10 px-4 text-gray-400">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">{t('evangelismInbox', 'noConversationsYet', 'No conversations yet.')}</p>
              <p className="text-xs mt-1">{t('evangelismInbox', 'noConversationsHint', 'Messages from WhatsApp, Messenger, Instagram and your website chat will appear here.')}</p>
              <Button variant="outline" size="sm" onClick={() => setShowChannels(true)} className="mt-3 gap-1 text-purple-600 border-purple-200 hover:bg-purple-50">
                <Plug className="h-3.5 w-3.5" />
                {t('evangelismInbox', 'connectChannels', 'Connect channels')}
              </Button>
            </div>
          ) : (
            filteredContacts.map(contact => {
              const isSelected = selectedContact?.id === contact.id;
              const meta = CHANNEL_META[contact.channel];
              return (
                <button
                  key={contact.id}
                  onClick={() => openThread(contact)}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-gray-50 transition-colors hover:bg-gray-50 ${isSelected ? 'bg-purple-50 border-l-2 border-l-purple-500' : ''}`}
                >
                  {/* Avatar */}
                  <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${meta.bg}`}>
                    {contact.avatar_url
                      ? <img src={contact.avatar_url} className="w-10 h-10 rounded-full object-cover" alt="" />
                      : <span className={meta.color}>{contact.display_name.charAt(0).toUpperCase()}</span>
                    }
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium text-sm text-gray-900 truncate">{contact.display_name}</span>
                      <span className="text-xs text-gray-400 shrink-0">{timeAgo(contact.last_message_at)}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <meta.Icon className={`h-3 w-3 shrink-0 ${meta.color}`} />
                      <p className="text-xs text-gray-500 truncate">{contact.last_message_preview}</p>
                    </div>
                    {contact.tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {contact.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Unread badge */}
                  {contact.unread_count > 0 && (
                    <span className="shrink-0 bg-purple-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      {contact.unread_count}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── RIGHT: Thread view ───────────────────────────────────────────── */}
      {selectedContact ? (
        <div className="flex-1 flex flex-col min-w-0">

          {/* Thread header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80">
            <div className="flex items-center gap-3 min-w-0">
              <button
                className="md:hidden p-1 rounded hover:bg-gray-100"
                onClick={() => setSelectedContact(null)}
              >
                <ChevronLeft className="h-5 w-5 text-gray-500" />
              </button>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 text-sm">{selectedContact.display_name}</span>
                  <ChannelBadge channel={selectedContact.channel} />
                  <span className={`text-xs capitalize px-2 py-0.5 rounded-full font-medium ${
                    selectedContact.status === 'open' ? 'bg-green-100 text-green-700' :
                    selectedContact.status === 'resolved' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>{selectedContact.status === 'open' ? t('evangelismInbox', 'statusOpen', 'open') : selectedContact.status === 'resolved' ? t('evangelismInbox', 'statusResolved', 'resolved') : t('evangelismInbox', 'statusArchived', 'archived')}</span>
                </div>
                {selectedContact.phone && (
                  <p className="text-xs text-gray-400 mt-0.5">{selectedContact.phone}</p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost" size="sm"
                className="text-xs"
                onClick={() => setShowNotes(v => !v)}
              >
                <Tag className="h-3.5 w-3.5 mr-1" />
                {t('evangelismInbox', 'notes', 'Notes')}
              </Button>
              {selectedContact.status === 'open' && (
                <Button variant="ghost" size="sm" className="text-xs text-green-600" onClick={() => updateStatus('resolved')}>
                  <CheckCheck className="h-3.5 w-3.5 mr-1" />
                  {t('evangelismInbox', 'resolve', 'Resolve')}
                </Button>
              )}
              {selectedContact.status !== 'archived' && (
                <Button variant="ghost" size="sm" className="text-xs text-gray-400" onClick={() => updateStatus('archived')}>
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Notes + tags panel */}
          {showNotes && (
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 space-y-2">
              <p className="text-xs font-semibold text-amber-800">{t('evangelismInbox', 'internalNotesTags', 'Internal Notes & Tags (not sent to contact)')}</p>
              <Textarea
                value={notesText}
                onChange={e => setNotesText(e.target.value)}
                placeholder={t('evangelismInbox', 'addNotesPlaceholder', 'Add notes about this contact…')}
                rows={2}
                className="text-xs bg-white"
              />
              <Button size="sm" variant="outline" className="text-xs" onClick={saveNotes}>{t('evangelismInbox', 'saveNotes', 'Save notes')}</Button>
              <div className="flex flex-wrap gap-1 items-center mt-1">
                {selectedContact.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-purple-900">×</button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                  placeholder={t('evangelismInbox', 'addTagPlaceholder', 'Add tag…')}
                  className="text-xs border-none outline-none bg-transparent w-20"
                />
                <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={addTag}>{t('evangelismInbox', 'add', 'Add')}</Button>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/30">
            {messagesLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">{t('evangelismInbox', 'noMessagesYet', 'No messages yet.')}</div>
            ) : (
              messages.map(msg => {
                const isOut = msg.direction === 'outbound';
                return (
                  <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                      isOut
                        ? 'bg-purple-600 text-white rounded-br-sm'
                        : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm'
                    }`}>
                      <p className="break-words">{msg.body}</p>
                      <div className={`flex items-center justify-end gap-1 mt-1 ${isOut ? 'text-purple-200' : 'text-gray-400'}`}>
                        <span className="text-[10px]">{timeAgo(msg.created_at)}</span>
                        {isOut && (
                          msg.status === 'read'      ? <CheckCheck className="h-3 w-3 text-blue-300" /> :
                          msg.status === 'delivered' ? <CheckCheck className="h-3 w-3" /> :
                          msg.status === 'failed'    ? <span className="text-red-300 text-[10px]">{t('evangelismInbox', 'failed', 'failed')}</span> :
                          <Clock className="h-3 w-3" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* AI Suggestion strip */}
          {aiSuggestion && (
            <div className="mx-4 mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-blue-700 flex items-center gap-1 mb-1">
                    <Bot className="h-3.5 w-3.5" />
                    {t('evangelismInbox', 'aiGospelResponseSuggestion', 'AI Gospel Response Suggestion')}
                  </p>
                  <p className="text-sm text-blue-800">{aiSuggestion}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm" variant="outline"
                    className="text-xs h-7"
                    onClick={() => { setReplyText(aiSuggestion); setAiSuggestion(''); replyRef.current?.focus(); }}
                  >
                    {t('evangelismInbox', 'use', 'Use')}
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="text-xs h-7 text-gray-400"
                    onClick={() => setAiSuggestion('')}
                  >
                    ×
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Reply bar */}
          {selectedContact.status === 'open' ? (
            <div className="px-4 py-3 border-t border-gray-100 bg-white">
              <div className="flex gap-2 items-end">
                <Textarea
                  ref={replyRef}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder={t('evangelismInbox', 'replyVia', 'Reply via {channel}…').replace('{channel}', String(CHANNEL_META[selectedContact.channel].label))}
                  rows={2}
                  className="flex-1 resize-none text-sm"
                />
                <div className="flex flex-col gap-1.5">
                  <Button
                    size="icon"
                    className="bg-purple-600 hover:bg-purple-700 text-white w-9 h-9"
                    onClick={sendReply}
                    disabled={sending || !replyText.trim()}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="w-9 h-9 text-blue-500 border-blue-200 hover:bg-blue-50"
                    onClick={getAISuggestion}
                    disabled={loadingAI}
                    title={t('evangelismInbox', 'getAiSuggestionTooltip', 'Get AI gospel response suggestion')}
                  >
                    {loadingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{t('evangelismInbox', 'replyHint', 'Enter to send · Shift+Enter for new line · 🤖 for AI suggestion')}</p>
            </div>
          ) : (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <p className="text-sm text-gray-400 capitalize">{t('evangelismInbox', 'conversationIsStatus', 'Conversation is {status}.').replace('{status}', selectedContact.status === 'resolved' ? t('evangelismInbox', 'statusResolved', 'resolved') : t('evangelismInbox', 'statusArchived', 'archived'))}</p>
              <Button size="sm" variant="outline" onClick={() => updateStatus('open')}>{t('evangelismInbox', 'reopen', 'Reopen')}</Button>
            </div>
          )}
        </div>
      ) : (
        /* Empty state when no thread selected on desktop */
        <div className="hidden md:flex flex-1 items-center justify-center text-center text-gray-400">
          <div>
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">{t('evangelismInbox', 'selectConversation', 'Select a conversation')}</p>
            <p className="text-sm mt-1 max-w-xs">{t('evangelismInbox', 'selectConversationHint', 'Messages from WhatsApp, Messenger, Instagram DMs and your website chat widget all land here.')}</p>
          </div>
        </div>
      )}

      <Dialog open={showChannels} onOpenChange={setShowChannels}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('evangelismInbox', 'setUpMessagingChannels', 'Set up messaging channels')}</DialogTitle>
          </DialogHeader>
          <EvangelismChannelsPanel ministryId={ministryId} ministryName={ministryName} isLeader={isLeader} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EvangelismInbox;
