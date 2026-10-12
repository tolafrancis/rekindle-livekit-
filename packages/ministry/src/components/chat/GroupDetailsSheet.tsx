import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@rekindle/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@rekindle/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@rekindle/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@rekindle/ui/avatar';
import { Badge } from '@rekindle/ui/badge';
import { Button } from '@rekindle/ui/button';
import { toast } from '@rekindle/ui/use-toast';
import { cn } from '@rekindle/ui/utils';
import {
  Bell, BellOff, ChevronDown, ChevronRight, Crown, History, Info, Loader2, LogOut, MoreVertical, Pin, PinOff, Shield,
  UserPlus, Users, VolumeX,
} from 'lucide-react';
import {
  groupChatApi, chatErrorText, NOTIFY_LEVEL_LABELS,
  type ChatMember, type ChatMessage, type ModerationLogEntry, type NotifyLevel,
} from '../../lib/groupChatApi';
import type { MyMembership } from '../../lib/useGroupChat';
import { initials, messageSnippet } from './MessageBubble';
import { InvitePeopleDialog } from './InvitePeopleDialog';

type T = (ns: string, key: string, fallback?: string, vars?: Record<string, string | number>) => string;

export interface ChatGroupInfo {
  id: string;
  ministry_id: string;
  name: string;
  description: string | null;
  category: string | null;
  cover_image_url: string | null;
  chat_enabled: boolean;
  members_can_invite: boolean;
  welcome_message: string | null;
  rules: string | null;
  status: string;
}

type Confirm =
  | { kind: 'leave' }
  | { kind: 'remove'; member: ChatMember }
  | { kind: 'transfer'; member: ChatMember }
  | null;

const MUTE_OPTIONS: { hours: number; label: string; key: string }[] = [
  { hours: 1, label: 'For 1 hour', key: 'mute1h' },
  { hours: 24, label: 'For 24 hours', key: 'mute24h' },
  { hours: 24 * 7, label: 'For 7 days', key: 'mute7d' },
];

const isMuted = (until: string | null) => !!until && new Date(until).getTime() > Date.now();

const ACTION_LABELS: Record<string, string> = {
  remove_member: 'removed',
  mute_member: 'muted',
  unmute_member: 'unmuted',
  hide_message: 'removed a message from',
  pin: 'pinned a message',
  unpin: 'unpinned a message',
  set_role: 'changed the role of',
  transfer_leadership: 'handed leadership to',
  invite: 'invited',
  leave: 'left the group',
  settings_change: 'changed the group settings',
};

export const GroupDetailsSheet: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: ChatGroupInfo;
  members: ChatMember[];
  membership: MyMembership | null;
  myId: string;
  canModerate: boolean;
  isOwner: boolean;
  pinned: ChatMessage[];
  memberName: (id: string | null) => string;
  onJumpTo: (id: string) => void;
  onUnpin: (m: ChatMessage) => void;
  onMembersChanged: () => void;
  onMembershipChanged: () => void;
  onLeft: () => void;
  onOpenGroupPage?: () => void;
  t: T;
}> = ({
  open, onOpenChange, group, members, membership, myId, canModerate, isOwner, pinned, memberName,
  onJumpTo, onUnpin, onMembersChanged, onMembershipChanged, onLeft, onOpenGroupPage, t,
}) => {
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [log, setLog] = useState<ModerationLogEntry[] | null>(null);
  const [savingLevel, setSavingLevel] = useState<NotifyLevel | null>(null);

  const isActiveMember = membership?.status === 'active';
  const canInvite = canModerate || (isActiveMember && group.members_can_invite);

  useEffect(() => {
    if (!logOpen || !canModerate) return;
    groupChatApi.moderationLog(group.id).then(setLog).catch(() => setLog([]));
  }, [logOpen, canModerate, group.id]);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast({ title: done });
      onMembersChanged();
      if (logOpen) groupChatApi.moderationLog(group.id).then(setLog).catch(() => {});
      return true;
    } catch (e) {
      toast({ title: chatErrorText(e), variant: 'destructive' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setLevel = async (level: NotifyLevel) => {
    setSavingLevel(level);
    try {
      await groupChatApi.updateMySettings(group.id, { notifyLevel: level });
      onMembershipChanged();
    } catch (e) {
      toast({ title: chatErrorText(e), variant: 'destructive' });
    } finally {
      setSavingLevel(null);
    }
  };

  const doConfirm = async () => {
    if (!confirm) return;
    if (confirm.kind === 'leave') {
      const ok = await run(() => groupChatApi.leave(group.id), t('groupChat', 'leftGroup', 'You left {name}', { name: group.name }));
      setConfirm(null);
      if (ok) { onOpenChange(false); onLeft(); }
      return;
    }
    if (confirm.kind === 'remove') {
      await run(() => groupChatApi.removeMember(group.id, confirm.member.user_id),
        t('groupChat', 'memberRemoved', '{name} was removed', { name: confirm.member.name }));
    } else {
      const ok = await run(() => groupChatApi.transferLeadership(group.id, confirm.member.user_id),
        t('groupChat', 'leadershipTransferred', '{name} now leads the group', { name: confirm.member.name }));
      if (ok) onMembershipChanged();
    }
    setConfirm(null);
  };

  const sortedMembers = [...members].sort((a, b) => {
    const rank = (r: string) => (r === 'leader' ? 0 : r === 'assistant_leader' ? 1 : 2);
    return rank(a.role) - rank(b.role) || a.name.localeCompare(b.name);
  });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
          <SheetHeader className="space-y-1 border-b p-4 text-left">
            {group.cover_image_url && <img src={group.cover_image_url} alt="" className="mb-2 h-32 w-full rounded-lg object-cover" />}
            <SheetTitle>{group.name}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-2">
              {group.category && <Badge variant="outline">{group.category}</Badge>}
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />
                {t('groupChat', 'memberCount', '{count} members', { count: members.length })}</span>
            </SheetDescription>
            {group.description && <p className="pt-1 text-sm text-muted-foreground">{group.description}</p>}
            {onOpenGroupPage && (
              <button type="button" onClick={() => { onOpenChange(false); onOpenGroupPage(); }}
                className="flex items-center gap-1 pt-1 text-sm font-medium text-primary">
                <Info className="h-4 w-4" />{t('groupChat', 'meetingsAndPosts', 'Meetings, prayer requests and posts')}
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </SheetHeader>

          <div className="space-y-6 p-4">
            {(group.welcome_message || group.rules) && (
              <section className="space-y-3">
                {group.welcome_message && (
                  <div>
                    <h3 className="mb-1 text-sm font-semibold">{t('groupChat', 'welcome', 'Welcome')}</h3>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{group.welcome_message}</p>
                  </div>
                )}
                {group.rules && (
                  <div>
                    <h3 className="mb-1 text-sm font-semibold">{t('groupChat', 'groupRules', 'Group guidelines')}</h3>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{group.rules}</p>
                  </div>
                )}
              </section>
            )}

            {isActiveMember && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">{t('groupChat', 'notifications', 'Notifications')}</h3>
                <div className="space-y-1.5" role="radiogroup">
                  {(Object.keys(NOTIFY_LEVEL_LABELS) as NotifyLevel[]).map((level) => {
                    const active = membership?.notify_level === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={!!savingLevel}
                        onClick={() => !active && setLevel(level)}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left',
                          active ? 'border-primary bg-primary/5' : 'hover:bg-muted',
                        )}
                      >
                        {level === 'muted' ? <BellOff className="mt-0.5 h-4 w-4" /> : <Bell className="mt-0.5 h-4 w-4" />}
                        <span className="flex-1">
                          <span className="block text-sm font-medium">{t('groupChat', `notify_${level}`, NOTIFY_LEVEL_LABELS[level].label)}</span>
                          <span className="block text-xs text-muted-foreground">{t('groupChat', `notify_${level}_desc`, NOTIFY_LEVEL_LABELS[level].description)}</span>
                        </span>
                        {savingLevel === level && <Loader2 className="h-4 w-4 animate-spin" />}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {pinned.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Pin className="h-4 w-4" />{t('groupChat', 'pinnedMessages', 'Pinned messages')}</h3>
                <div className="space-y-1.5">
                  {pinned.map((m) => (
                    <div key={m.id} className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { onOpenChange(false); onJumpTo(m.id); }}>
                        <span className="block text-xs font-semibold">{memberName(m.sender_id)}</span>
                        <span className="line-clamp-2 text-sm">{messageSnippet(m, t)}</span>
                      </button>
                      {canModerate && (
                        <button type="button" onClick={() => onUnpin(m)} aria-label={t('groupChat', 'unpin', 'Unpin')} className="rounded p-1 hover:bg-background">
                          <PinOff className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t('groupChat', 'members', 'Members')}</h3>
                {canInvite && (
                  <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
                    <UserPlus className="mr-1.5 h-4 w-4" />{t('groupChat', 'invite', 'Invite')}
                  </Button>
                )}
              </div>
              <ul className="divide-y">
                {sortedMembers.map((mem) => {
                  const self = mem.user_id === myId;
                  const muted = isMuted(mem.chat_muted_until);
                  const canActOn = canModerate && !self && (isOwner || mem.role === 'member');
                  return (
                    <li key={mem.user_id} className="flex items-center gap-3 py-2">
                      <Avatar className="h-9 w-9">
                        {mem.avatar_url && <AvatarImage src={mem.avatar_url} alt="" />}
                        <AvatarFallback className="text-xs">{initials(mem.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {mem.name}{self && <span className="font-normal text-muted-foreground"> ({t('groupChat', 'you', 'You')})</span>}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          {mem.role === 'leader' && (<><Crown className="h-3 w-3 text-amber-500" />{t('groupChat', 'leader', 'Leader')}</>)}
                          {mem.role === 'assistant_leader' && (<><Shield className="h-3 w-3 text-blue-500" />{t('groupChat', 'assistantLeader', 'Assistant leader')}</>)}
                          {muted && (<><VolumeX className="ml-1 h-3 w-3" />{t('groupChat', 'mutedUntil', 'Muted until {time}', { time: new Date(mem.chat_muted_until!).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) })}</>)}
                        </p>
                      </div>
                      {canActOn && (
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} aria-label={t('groupChat', 'memberOptions', 'Options for {name}', { name: mem.name })}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {muted ? (
                              <DropdownMenuItem onSelect={() => run(() => groupChatApi.muteMember(group.id, mem.user_id, null), t('groupChat', 'unmuted', '{name} can send messages again', { name: mem.name }))}>
                                {t('groupChat', 'unmute', 'Unmute')}
                              </DropdownMenuItem>
                            ) : (
                              <>
                                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('groupChat', 'muteInChat', 'Mute in chat')}</DropdownMenuLabel>
                                {MUTE_OPTIONS.map((o) => (
                                  <DropdownMenuItem key={o.key} onSelect={() => run(
                                    () => groupChatApi.muteMember(group.id, mem.user_id, new Date(Date.now() + o.hours * 3600_000).toISOString()),
                                    t('groupChat', 'muted', '{name} is muted', { name: mem.name }),
                                  )}>
                                    {t('groupChat', o.key, o.label)}
                                  </DropdownMenuItem>
                                ))}
                              </>
                            )}
                            {isOwner && (
                              <>
                                <DropdownMenuSeparator />
                                {mem.role !== 'assistant_leader' && (
                                  <DropdownMenuItem onSelect={() => run(() => groupChatApi.setRole(group.id, mem.user_id, 'assistant_leader'), t('groupChat', 'roleChanged', 'Role updated'))}>
                                    {t('groupChat', 'makeAssistant', 'Make assistant leader')}
                                  </DropdownMenuItem>
                                )}
                                {mem.role !== 'member' && (
                                  <DropdownMenuItem onSelect={() => run(() => groupChatApi.setRole(group.id, mem.user_id, 'member'), t('groupChat', 'roleChanged', 'Role updated'))}>
                                    {t('groupChat', 'makeMember', 'Make member')}
                                  </DropdownMenuItem>
                                )}
                                {mem.role !== 'leader' && (
                                  <DropdownMenuItem onSelect={() => setConfirm({ kind: 'transfer', member: mem })}>
                                    {t('groupChat', 'transferLeadership', 'Hand over leadership')}
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm({ kind: 'remove', member: mem })}>
                              {t('groupChat', 'removeFromGroup', 'Remove from group')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {canModerate && (
              <section>
                <button type="button" onClick={() => setLogOpen((v) => !v)} className="flex w-full items-center gap-1.5 text-sm font-semibold">
                  <History className="h-4 w-4" />{t('groupChat', 'moderationLog', 'Moderation history')}
                  {logOpen ? <ChevronDown className="ml-auto h-4 w-4" /> : <ChevronRight className="ml-auto h-4 w-4" />}
                </button>
                {logOpen && (
                  <div className="mt-2 space-y-2">
                    {log === null ? <Loader2 className="h-4 w-4 animate-spin" />
                      : log.length === 0 ? <p className="text-sm text-muted-foreground">{t('groupChat', 'noModeration', 'Nothing yet.')}</p>
                        : log.map((e) => (
                          <div key={e.id} className="text-sm">
                            <p>
                              <span className="font-medium">{e.actor_name}</span>{' '}
                              {t('groupChat', `log_${e.action}`, ACTION_LABELS[e.action] || e.action.replace(/_/g, ' '))}
                              {e.target_name && <> <span className="font-medium">{e.target_name}</span></>}
                            </p>
                            {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
                            <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                          </div>
                        ))}
                  </div>
                )}
              </section>
            )}

            {isActiveMember && (
              <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={() => setConfirm({ kind: 'leave' })}>
                <LogOut className="mr-2 h-4 w-4" />{t('groupChat', 'leaveGroup', 'Leave group')}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <InvitePeopleDialog groupId={group.id} open={inviteOpen} onOpenChange={setInviteOpen} onInvited={onMembersChanged} t={t} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'leave' && t('groupChat', 'leaveTitle', 'Leave {name}?', { name: group.name })}
              {confirm?.kind === 'remove' && t('groupChat', 'removeTitle', 'Remove {name}?', { name: confirm.member.name })}
              {confirm?.kind === 'transfer' && t('groupChat', 'transferTitle', 'Make {name} the leader?', { name: confirm.member.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'leave' && t('groupChat', 'leaveDesc', "You'll stop seeing this chat. You can ask to join again later.")}
              {confirm?.kind === 'remove' && t('groupChat', 'removeDesc', "They'll lose access to the chat straight away. Only a leader can invite them back.")}
              {confirm?.kind === 'transfer' && t('groupChat', 'transferDesc', "You'll become an assistant leader.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('groupChat', 'cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => { e.preventDefault(); doConfirm(); }}
              className={confirm?.kind === 'transfer' ? undefined : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirm?.kind === 'leave' && t('groupChat', 'leave', 'Leave')}
              {confirm?.kind === 'remove' && t('groupChat', 'remove', 'Remove')}
              {confirm?.kind === 'transfer' && t('groupChat', 'transfer', 'Make leader')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
