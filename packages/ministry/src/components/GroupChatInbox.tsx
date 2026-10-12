import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@rekindle/ui/avatar';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { toast } from '@rekindle/ui/use-toast';
import { cn } from '@rekindle/ui/utils';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { consumeDeepLink } from '@rekindle/features/deepLink';
import { BellOff, Loader2, MessagesSquare, Search, Users } from 'lucide-react';
import { groupChatApi, chatErrorText, lastMessagePreview, type GroupChatSummary } from '../lib/groupChatApi';
import { useGroupChatInbox } from '../lib/useGroupChatInbox';
import { useIsWide } from '../lib/useIsWide';
import { GroupChatView } from './chat/GroupChatView';
import { initials } from './chat/MessageBubble';

function shortTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 6) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export interface GroupChatInboxProps {
  /** Only this ministry's groups (inside a ministry space). */
  ministryId?: string;
  /** Open this group on arrival (e.g. from a notification). */
  initialGroupId?: string | null;
  /** Opens a group's page with meetings and posts. */
  onOpenGroupPage?: (groupId: string, ministryId: string) => void;
  /** Shown in the empty state to help people find a group. */
  onFindGroups?: () => void;
}

/** Messages: every small group chat the person is in, with invitations. */
export const GroupChatInbox: React.FC<GroupChatInboxProps> = ({ ministryId, initialGroupId, onOpenGroupPage, onFindGroups }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const wide = useIsWide();
  const { chats, loading, error, reload } = useGroupChatInbox(user?.id, { ministryId });
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    // Always clear a pending /messages link so it can't fire again elsewhere.
    const dl = consumeDeepLink('messages');
    return initialGroupId || dl?.id || null;
  });
  const [responding, setResponding] = useState<string | null>(null);

  useEffect(() => { if (initialGroupId) setSelectedId(initialGroupId); }, [initialGroupId]);

  const showMinistry = !ministryId && new Set(chats.map((c) => c.ministry_id)).size > 1;

  const { invitations, active } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (c: GroupChatSummary) => !q || c.name.toLowerCase().includes(q)
      || (c.ministry_name || '').toLowerCase().includes(q) || (c.category || '').toLowerCase().includes(q);
    const list = chats.filter(match);
    return {
      invitations: list.filter((c) => c.membership_status === 'invited'),
      active: list.filter((c) => c.membership_status === 'active'),
    };
  }, [chats, query]);

  const selected = chats.find((c) => c.group_id === selectedId) || null;

  const respond = async (c: GroupChatSummary, accept: boolean) => {
    setResponding(c.group_id);
    try {
      await groupChatApi.respondInvite(c.group_id, accept);
      await reload();
      if (accept) setSelectedId(c.group_id);
      else toast({ title: t('groupChat', 'inviteDeclined', 'Invitation declined') });
    } catch (e) {
      toast({ title: chatErrorText(e), variant: 'destructive' });
    } finally {
      setResponding(null);
    }
  };

  const closeChat = () => { setSelectedId(null); reload(); };

  const chatPane = selectedId ? (
    <GroupChatView
      key={selectedId}
      groupId={selectedId}
      onBack={wide ? undefined : closeChat}
      onLeft={closeChat}
      onOpenGroupPage={onOpenGroupPage && selected ? () => onOpenGroupPage(selected.group_id, selected.ministry_id) : undefined}
      className={wide ? 'h-full' : undefined}
      layout={wide ? 'none' : 'fullscreen'}
    />
  ) : null;

  // Phones: the open chat takes the whole screen.
  if (!wide && chatPane) return chatPane;

  const row = (c: GroupChatSummary) => {
    const isSelected = c.group_id === selectedId;
    const unread = c.unread_count > 0 && c.notify_level !== 'muted';
    return (
      <button
        key={c.group_id}
        type="button"
        onClick={() => setSelectedId(c.group_id)}
        className={cn('flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted', isSelected && 'bg-muted')}
        aria-current={isSelected ? 'true' : undefined}
      >
        <Avatar className="h-12 w-12 shrink-0">
          {c.cover_image_url && <AvatarImage src={c.cover_image_url} alt="" className="object-cover" />}
          <AvatarFallback>{initials(c.name)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn('min-w-0 flex-1 truncate', unread ? 'font-bold' : 'font-medium')}>{c.name}</span>
            <span className={cn('shrink-0 text-xs', unread ? 'font-semibold text-primary' : 'text-muted-foreground')}>{shortTime(c.last_message_at)}</span>
          </span>
          {showMinistry && c.ministry_name && <span className="block truncate text-xs text-muted-foreground">{c.ministry_name}</span>}
          <span className="flex items-center gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-sm', unread ? 'text-foreground' : 'text-muted-foreground')}>
              {lastMessagePreview(c, user?.id) || (c.chat_enabled ? t('groupChat', 'sayHello', 'Say hello to the group') : t('groupChat', 'chatOffShort', 'Chat is off'))}
            </span>
            {c.notify_level === 'muted' && <BellOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t('groupChat', 'notify_muted', 'Muted')} />}
            {c.unread_count > 0 && (
              <span className={cn(
                'flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                unread ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/30 text-foreground',
              )}>
                {c.unread_count >= 100 ? '99+' : c.unread_count}
              </span>
            )}
          </span>
        </span>
      </button>
    );
  };

  const list = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b p-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MessagesSquare className="h-5 w-5" />{t('groupChat', 'messages', 'Messages')}
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('groupChat', 'searchChats', 'Search your groups')} className="pl-9" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : error && !chats.length ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" onClick={reload}>{t('groupChat', 'tryAgain', 'Try again')}</Button>
          </div>
        ) : !chats.length ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">{t('groupChat', 'noChats', 'No group chats yet')}</p>
            <p className="text-sm text-muted-foreground">{t('groupChat', 'noChatsDesc', 'Join a small group in your ministry and its chat will appear here.')}</p>
            {onFindGroups && <Button onClick={onFindGroups}>{t('groupChat', 'findGroup', 'Find a small group')}</Button>}
          </div>
        ) : (
          <>
            {invitations.length > 0 && (
              <div className="border-b">
                <p className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('groupChat', 'invitations', 'Invitations')}</p>
                {invitations.map((c) => (
                  <div key={c.group_id} className="flex items-center gap-3 px-3 py-3">
                    <Avatar className="h-12 w-12 shrink-0">
                      {c.cover_image_url && <AvatarImage src={c.cover_image_url} alt="" className="object-cover" />}
                      <AvatarFallback>{initials(c.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.invited_by_name
                          ? t('groupChat', 'invitedBy', '{name} invited you', { name: c.invited_by_name })
                          : t('groupChat', 'youreInvited', "You're invited")}
                        {showMinistry && c.ministry_name ? ` · ${c.ministry_name}` : ''}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" disabled={responding === c.group_id} onClick={() => respond(c, true)}>
                          {responding === c.group_id && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                          {t('groupChat', 'accept', 'Join group')}
                        </Button>
                        <Button size="sm" variant="outline" disabled={responding === c.group_id} onClick={() => respond(c, false)}>
                          {t('groupChat', 'decline', 'Decline')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {active.length === 0 && query ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('groupChat', 'noMatchingChats', 'No groups match your search.')}</p>
            ) : (
              <div className="divide-y">{active.map(row)}</div>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (!wide) return <div className="-mx-4 min-h-[60vh] bg-background sm:mx-0">{list}</div>;

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[480px] overflow-hidden rounded-xl border bg-background">
      <div className="w-80 shrink-0 border-r lg:w-96">{list}</div>
      <div className="min-w-0 flex-1">
        {chatPane || (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <MessagesSquare className="h-10 w-10" />
            <p>{t('groupChat', 'pickChat', 'Choose a group to start chatting')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GroupChatInbox;
