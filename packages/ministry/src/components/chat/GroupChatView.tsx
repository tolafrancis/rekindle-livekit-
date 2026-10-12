import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { Avatar, AvatarFallback, AvatarImage } from '@rekindle/ui/avatar';
import { Button } from '@rekindle/ui/button';
import { Textarea } from '@rekindle/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@rekindle/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { toast } from '@rekindle/ui/use-toast';
import { cn } from '@rekindle/ui/utils';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { useModeration } from '@rekindle/features/ModerationContext';
import type { ScriptureReference } from '@rekindle/features/scripture/parser';
import { ArrowDown, ArrowLeft, Info, Loader2, Pin, UserX, WifiOff } from 'lucide-react';
import { useGroupChat } from '../../lib/useGroupChat';
import { groupChatApi, chatErrorText, MESSAGE_COLUMNS, type ChatMessage } from '../../lib/groupChatApi';
import { MessageBubble, initials, messageSnippet } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { ScripturePassageSheet } from './ScripturePassage';
import { GroupDetailsSheet, type ChatGroupInfo } from './GroupDetailsSheet';

const NEAR_BOTTOM_PX = 120;
const MIN_HEIGHT_PX = 320;

function dayLabel(iso: string, t: (ns: string, k: string, f?: string) => string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('groupChat', 'today', 'Today');
  if (d.toDateString() === yesterday.toDateString()) return t('groupChat', 'yesterday', 'Yesterday');
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * Sizes the chat to what's actually visible, so an open on-screen keyboard
 * shrinks the message list instead of covering the composer.
 *  - 'fill': as tall as the space from the chat's top edge to the bottom of
 *    the visible area.
 *  - 'fullscreen': covers the visible area exactly (phones).
 */
function useViewportBox(ref: React.RefObject<HTMLElement>, mode: 'fill' | 'fullscreen' | 'none') {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    if (mode === 'none') { setBox(null); return; }
    const vv = window.visualViewport;
    const update = () => {
      const vTop = vv ? vv.offsetTop : 0;
      const vHeight = vv ? vv.height : window.innerHeight;
      if (mode === 'fullscreen') { setBox({ top: vTop, height: Math.round(vHeight) }); return; }
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setBox({ top: 0, height: Math.max(MIN_HEIGHT_PX, Math.floor(vTop + vHeight - Math.max(top, vTop))) });
    };
    update();
    const raf = requestAnimationFrame(update);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [ref, mode]);
  return box;
}

export interface GroupChatViewProps {
  groupId: string;
  onBack?: () => void;
  /** Opens the group's page (meetings, posts). */
  onOpenGroupPage?: () => void;
  /** Called after the person leaves or is removed. */
  onLeft?: () => void;
  /**
   * How the chat sizes itself: 'fullscreen' covers the screen (phones),
   * 'fill' runs to the bottom of the screen, 'none' leaves it to the parent.
   */
  layout?: 'fullscreen' | 'fill' | 'none';
  className?: string;
}

export const GroupChatView: React.FC<GroupChatViewProps> = ({
  groupId, onBack, onOpenGroupPage, onLeft, layout = 'fill', className,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { filterBlocked } = useModeration();
  const myId: string = user?.id || '';

  const chat = useGroupChat(groupId, myId || undefined);
  const {
    messages, loading, loadError, hasOlder, loadingOlder, loadOlder, reload, members, memberById,
    reloadMembers, membership, reloadMembership, removed, connection, initialReadAt,
    send, retry, discard, deleteMessage, setPinned, fetchMessage, noteSeen,
  } = chat;

  const [group, setGroup] = useState<ChatGroupInfo | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [canModerate, setCanModerate] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [passageRef, setPassageRef] = useState<ScriptureReference | null>(null);
  const [pinned, setPinnedList] = useState<ChatMessage[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [farMessage, setFarMessage] = useState<ChatMessage | null>(null);
  const [deleting, setDeleting] = useState<{ message: ChatMessage; asModerator: boolean } | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [respondBusy, setRespondBusy] = useState(false);
  const [replyCache, setReplyCache] = useState<Record<string, ChatMessage | null>>({});

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const forceBottomRef = useRef(false);
  const prevScrollHeightRef = useRef<number | null>(null);
  const lastCountRef = useRef(0);
  const lastNewestIdRef = useRef<string | null>(null);

  const box = useViewportBox(rootRef, layout);

  // A full-screen chat shouldn't let the page behind it scroll, and floating
  // app buttons can hide themselves while it's open (data-fullscreen-chat).
  useEffect(() => {
    if (layout !== 'fullscreen') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.dataset.fullscreenChat = '1';
    return () => {
      document.body.style.overflow = prev;
      delete document.body.dataset.fullscreenChat;
    };
  }, [layout]);

  // ── Group and my permissions ───────────────────────────────────────
  const loadGroup = useCallback(async () => {
    const { data, error } = await supabase
      .from('small_groups')
      .select('id, ministry_id, name, description, category, cover_image_url, chat_enabled, members_can_invite, welcome_message, rules, status')
      .eq('id', groupId)
      .maybeSingle();
    if (error || !data) { setGroupError(t('groupChat', 'groupUnavailable', 'This group is not available.')); return; }
    setGroup(data as ChatGroupInfo);
    if (myId) {
      const [lead, own] = await Promise.all([
        supabase.rpc('is_small_group_leader', { p_group_id: groupId, p_user_id: myId }),
        supabase.rpc('is_small_group_owner', { p_group_id: groupId, p_user_id: myId }),
      ]);
      setCanModerate(!!lead.data);
      setIsOwner(!!own.data);
    }
  }, [groupId, myId, t]);

  useEffect(() => {
    setGroup(null); setGroupError(null); setReplyTo(null); setPinnedList([]); setReplyCache({});
    initialScrollDoneRef.current = false;
    lastCountRef.current = 0;
    lastNewestIdRef.current = null;
    loadGroup();
  }, [loadGroup]);

  // Role changes arrive through the membership row; recheck permissions.
  useEffect(() => { if (membership) loadGroup(); }, [membership?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pinned messages ────────────────────────────────────────────────
  const pinnedKey = useMemo(
    () => messages.filter((m) => m.pinned_at && !m.deleted_at).map((m) => m.id).join(','),
    [messages],
  );
  const loadPinned = useCallback(async () => {
    const { data } = await supabase
      .from('small_group_messages')
      .select(MESSAGE_COLUMNS)
      .eq('group_id', groupId)
      .not('pinned_at', 'is', null)
      .is('deleted_at', null)
      .order('pinned_at', { ascending: false })
      .limit(10);
    setPinnedList((data || []) as unknown as ChatMessage[]);
  }, [groupId]);
  useEffect(() => { if (!loading && !loadError) loadPinned(); }, [loading, loadError, pinnedKey, loadPinned]);

  // ── What's on screen ───────────────────────────────────────────────
  const visibleMessages = useMemo(
    () => filterBlocked(messages, (m) => (m.sender_id === myId ? null : m.sender_id)),
    [messages, filterBlocked, myId],
  );

  const memberName = useCallback((id: string | null) => {
    if (!id) return t('groupChat', 'formerMember', 'Former member');
    if (id === myId) return t('groupChat', 'you', 'You');
    return memberById.get(id)?.name || t('groupChat', 'member', 'Member');
  }, [memberById, myId, t]);

  const byId = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    messages.forEach((m) => map.set(m.id, m));
    return map;
  }, [messages]);

  // Originals of replies that aren't loaded yet.
  useEffect(() => {
    const missing = visibleMessages
      .map((m) => m.reply_to_id)
      .filter((id): id is string => !!id && !byId.has(id) && !(id in replyCache));
    if (!missing.length) return;
    const unique = Array.from(new Set(missing));
    setReplyCache((prev) => ({ ...prev, ...Object.fromEntries(unique.map((id) => [id, null])) }));
    supabase.from('small_group_messages').select(MESSAGE_COLUMNS).in('id', unique).then(({ data }) => {
      const rows = (data || []) as unknown as ChatMessage[];
      if (rows.length) setReplyCache((prev) => ({ ...prev, ...Object.fromEntries(rows.map((r) => [r.id, r])) }));
    });
  }, [visibleMessages, byId, replyCache]);

  // The first message from someone else after where I'd read up to.
  const firstUnreadId = useMemo(() => {
    if (!initialReadAt) return null;
    const m = visibleMessages.find((x) => !x.localState && x.sender_id !== myId && x.message_type !== 'system' && x.created_at > initialReadAt);
    return m?.id || null;
  }, [visibleMessages, initialReadAt, myId]);
  const unreadDividerId = useRef<string | null>(null);
  if (!unreadDividerId.current && firstUnreadId && !initialScrollDoneRef.current) unreadDividerId.current = firstUnreadId;
  useEffect(() => { unreadDividerId.current = null; }, [groupId]);

  // ── Scrolling ──────────────────────────────────────────────────────
  const scrollToBottom = useCallback((smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    atBottomRef.current = true;
    setNewBelow(0);
    setAwayFromBottom(false);
  }, []);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    atBottomRef.current = atBottom;
    setAwayFromBottom(!atBottom);
    if (atBottom) setNewBelow(0);
  }, []);

  const requestOlder = useCallback(() => {
    if (!hasOlder || loadingOlder || !listRef.current) return;
    prevScrollHeightRef.current = listRef.current.scrollHeight;
    loadOlder();
  }, [hasOlder, loadingOlder, loadOlder]);

  // Load older messages when the top comes into view.
  useEffect(() => {
    const el = topSentinelRef.current;
    const root = listRef.current;
    if (!el || !root || !initialScrollDoneRef.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) requestOlder();
    }, { root, rootMargin: '200px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [requestOlder, loading, visibleMessages.length]);

  // Place the view after each change to the list.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || loading) return;
    const count = visibleMessages.length;
    const newest = visibleMessages[count - 1];

    if (!initialScrollDoneRef.current) {
      if (!count && !group) return;
      initialScrollDoneRef.current = true;
      const divider = unreadDividerId.current && document.getElementById(`msg-${unreadDividerId.current}`);
      if (divider) {
        el.scrollTop = Math.max(0, divider.offsetTop - 80);
        onScroll();
      } else {
        scrollToBottom();
      }
    } else if (prevScrollHeightRef.current !== null && !loadingOlder) {
      // Older messages were added above: keep what was on screen in place.
      el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = null;
    } else if (newest && newest.id !== lastNewestIdRef.current) {
      if (forceBottomRef.current || atBottomRef.current) {
        forceBottomRef.current = false;
        scrollToBottom();
      } else if (count > lastCountRef.current && newest.sender_id !== myId) {
        setNewBelow((n) => n + (count - lastCountRef.current));
      }
    }
    lastCountRef.current = count;
    lastNewestIdRef.current = newest?.id || null;
  }, [visibleMessages, loading, loadingOlder, group, myId, onScroll, scrollToBottom]);

  // Images change height as they load; stay pinned to the bottom if we were there.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const content = el.firstElementChild;
    if (!content) return;
    const ro = new ResizeObserver(() => { if (atBottomRef.current) el.scrollTop = el.scrollHeight; });
    ro.observe(content);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  // Mark as read only what has actually been on screen.
  useEffect(() => {
    const root = listRef.current;
    // Only members have a read position (leaders reading without joining don't).
    if (!root || loading || membership?.status !== 'active') return;
    // Messages hidden from view (blocked senders) count as read once the
    // newest visible one has been seen, so they don't leave a stuck badge.
    const saved = messages.filter((m) => !m.localState);
    const newestAt = saved[saved.length - 1]?.created_at;
    const nodes = root.querySelectorAll<HTMLElement>('[data-created-at]');
    const lastShownAt = nodes[nodes.length - 1]?.dataset.createdAt;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        // Mostly on screen (a very tall message counts once it fills half the view).
        const seen = e.isIntersecting && (e.intersectionRatio >= 0.6
          || (!!e.rootBounds && e.intersectionRect.height >= e.rootBounds.height * 0.5));
        if (!seen) continue;
        const at = (e.target as HTMLElement).dataset.createdAt;
        if (!at) continue;
        noteSeen(at === lastShownAt && newestAt && newestAt > at ? newestAt : at);
      }
    }, { root, threshold: [0, 0.25, 0.5, 0.6, 1] });
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [messages, visibleMessages, loading, noteSeen, membership?.status]);

  // ── Actions ────────────────────────────────────────────────────────
  const jumpTo = useCallback(async (id: string) => {
    const node = document.getElementById(`msg-${id}`);
    if (node) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setHighlightId(id);
      window.setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 1800);
      return;
    }
    const m = await fetchMessage(id);
    if (m) setFarMessage(m);
    else toast({ title: t('groupChat', 'originalUnavailable', 'Original message unavailable') });
  }, [fetchMessage, t]);

  const handleSend = useCallback((input: Parameters<typeof send>[0]) => {
    forceBottomRef.current = true;
    return send(input);
  }, [send]);

  const handlePin = useCallback(async (m: ChatMessage, pin: boolean) => {
    try {
      await setPinned(m.id, pin);
      loadPinned();
      toast({ title: pin ? t('groupChat', 'messagePinned', 'Message pinned') : t('groupChat', 'messageUnpinned', 'Message unpinned') });
    } catch (e) {
      toast({ title: chatErrorText(e), variant: 'destructive' });
    }
  }, [setPinned, loadPinned, t]);

  const handleDelete = useCallback((m: ChatMessage, asModerator: boolean) => {
    setDeleteReason('');
    setDeleting({ message: m, asModerator });
  }, []);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteMessage(deleting.message.id, deleting.asModerator ? deleteReason.trim() || undefined : undefined);
      if (deleting.message.pinned_at) loadPinned();
      setDeleting(null);
    } catch (e) {
      toast({ title: chatErrorText(e), variant: 'destructive' });
    } finally {
      setDeleteBusy(false);
    }
  };

  const respondInvite = async (accept: boolean) => {
    setRespondBusy(true);
    try {
      await groupChatApi.respondInvite(groupId, accept);
      if (accept) { await reload(); reloadMembers(); } else onLeft?.();
    } catch (e) {
      toast({ title: chatErrorText(e), variant: 'destructive' });
    } finally {
      setRespondBusy(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  const rootStyle: React.CSSProperties | undefined =
    layout === 'fullscreen' ? (box ? { top: box.top, height: box.height } : { top: 0, height: '100dvh' })
      : layout === 'fill' && box ? { height: box.height } : undefined;
  const shell = (body: React.ReactNode) => (
    <div
      ref={rootRef}
      style={rootStyle}
      className={cn(
        'flex flex-col overflow-hidden bg-background',
        layout === 'fullscreen'
          ? 'fixed inset-x-0 z-50 pt-[env(safe-area-inset-top)]'
          : 'min-h-[320px]',
        layout === 'fill' && !box && 'h-[calc(100dvh-4rem)]',
        className,
      )}
    >
      {body}
    </div>
  );

  if (groupError) {
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-muted-foreground">{groupError}</p>
        {onBack && <Button variant="outline" onClick={onBack}>{t('groupChat', 'back', 'Back')}</Button>}
      </div>,
    );
  }

  if (removed) {
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <UserX className="h-10 w-10 text-muted-foreground" />
        <p className="font-medium">{t('groupChat', 'noLongerMember', "You're no longer in this group")}</p>
        <p className="text-sm text-muted-foreground">{t('groupChat', 'noLongerMemberDesc', 'Messages from this group are no longer available to you.')}</p>
        {onBack && <Button variant="outline" onClick={onLeft || onBack}>{t('groupChat', 'back', 'Back')}</Button>}
      </div>,
    );
  }

  const status = membership?.status;
  const mutedUntil = membership?.chat_muted_until && new Date(membership.chat_muted_until).getTime() > Date.now()
    ? new Date(membership.chat_muted_until) : null;
  const disabledReason =
    group && !group.chat_enabled ? t('groupChat', 'chatOff', 'Chat is turned off for this group.')
      : group && group.status !== 'active' ? t('groupChat', 'groupInactive', 'This group is no longer active.')
        : status !== 'active' ? t('groupChat', 'membersOnly', 'Only group members can send messages.')
          : mutedUntil ? t('groupChat', 'youAreMuted', "A leader has paused your messages in this group until {time}.", {
            time: mutedUntil.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
          })
            : null;

  const header = (
    <div className="flex items-center gap-2 border-b px-2 py-2">
      {onBack && (
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('groupChat', 'back', 'Back')} className="h-9 w-9 shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
      )}
      <button type="button" onClick={() => group && setDetailsOpen(true)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-muted">
        <Avatar className="h-9 w-9">
          {group?.cover_image_url && <AvatarImage src={group.cover_image_url} alt="" className="object-cover" />}
          <AvatarFallback>{initials(group?.name || '')}</AvatarFallback>
        </Avatar>
        <span className="min-w-0">
          <span className="block truncate font-semibold leading-tight">{group?.name || ' '}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {connection === 'reconnecting'
              ? t('groupChat', 'reconnecting', 'Reconnecting…')
              : members.length
                ? members.slice(0, 4).map((m) => (m.user_id === myId ? t('groupChat', 'you', 'You') : m.name.split(' ')[0])).join(', ') + (members.length > 4 ? ` +${members.length - 4}` : '')
                : t('groupChat', 'tapForInfo', 'Tap for group info')}
          </span>
        </span>
      </button>
      {connection === 'reconnecting' && <WifiOff className="h-4 w-4 shrink-0 text-amber-500" aria-label={t('groupChat', 'reconnecting', 'Reconnecting…')} />}
      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => group && setDetailsOpen(true)} aria-label={t('groupChat', 'groupInfo', 'Group info')}>
        <Info className="h-5 w-5" />
      </Button>
    </div>
  );

  if (status === 'invited') {
    return shell(
      <>
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-lg font-semibold">{t('groupChat', 'invitedTo', "You've been invited to {name}", { name: group?.name || '' })}</p>
          {group?.description && <p className="max-w-sm text-sm text-muted-foreground">{group.description}</p>}
          <div className="flex gap-2">
            <Button variant="outline" disabled={respondBusy} onClick={() => respondInvite(false)}>{t('groupChat', 'decline', 'Decline')}</Button>
            <Button disabled={respondBusy} onClick={() => respondInvite(true)}>
              {respondBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('groupChat', 'accept', 'Join group')}
            </Button>
          </div>
        </div>
      </>,
    );
  }

  const latestPin = pinned[0];
  let lastDay = '';

  return shell(
    <>
      {header}

      {latestPin && (
        <button type="button" onClick={() => jumpTo(latestPin.id)} className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-left text-sm">
          <Pin className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">{messageSnippet(latestPin, t)}</span>
          {pinned.length > 1 && <span className="shrink-0 text-xs text-muted-foreground">+{pinned.length - 1}</span>}
        </button>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={listRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain pb-2 [overflow-anchor:none]" aria-live="polite" aria-relevant="additions">
          <div>
            <div ref={topSentinelRef} className="h-1" />
            {loadingOlder && <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
            {!hasOlder && !loading && group && (
              <div className="mx-auto my-4 max-w-sm px-4 text-center">
                <p className="text-sm font-semibold">{group.name}</p>
                {group.welcome_message
                  ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{group.welcome_message}</p>
                  : <p className="mt-1 text-sm text-muted-foreground">{t('groupChat', 'chatStart', 'This is the start of the group chat.')}</p>}
                {group.rules && (
                  <button type="button" onClick={() => setDetailsOpen(true)} className="mt-2 text-xs font-medium text-primary underline">
                    {t('groupChat', 'readGuidelines', 'Read the group guidelines')}
                  </button>
                )}
              </div>
            )}

            {loading && !visibleMessages.length ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : loadError && !visibleMessages.length ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <p className="text-sm text-muted-foreground">{loadError}</p>
                <Button size="sm" variant="outline" onClick={reload}>{t('groupChat', 'tryAgain', 'Try again')}</Button>
              </div>
            ) : (
              visibleMessages.map((m, i) => {
                const prev = visibleMessages[i - 1];
                const day = new Date(m.created_at).toDateString();
                const showDay = day !== lastDay;
                lastDay = day;
                const startsRun = showDay || !prev || prev.sender_id !== m.sender_id || prev.message_type === 'system'
                  || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60_000
                  || m.id === unreadDividerId.current;
                const replyTo = m.reply_to_id ? byId.get(m.reply_to_id) ?? replyCache[m.reply_to_id] : undefined;
                return (
                  <React.Fragment key={m.client_id || m.id}>
                    {showDay && (
                      <div className="sticky top-0 z-10 my-2 flex justify-center">
                        <span className="rounded-full bg-background/90 px-3 py-0.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
                          {dayLabel(m.created_at, t)}
                        </span>
                      </div>
                    )}
                    {m.id === unreadDividerId.current && (
                      <div className="my-3 flex items-center gap-2 px-3" role="separator">
                        <span className="h-px flex-1 bg-primary/40" />
                        <span className="text-xs font-semibold text-primary">{t('groupChat', 'newMessages', 'New messages')}</span>
                        <span className="h-px flex-1 bg-primary/40" />
                      </div>
                    )}
                    <MessageBubble
                      message={m}
                      mine={m.sender_id === myId}
                      sender={m.sender_id ? memberById.get(m.sender_id) : undefined}
                      startsRun={startsRun}
                      replyTo={replyTo}
                      replyToName={replyTo ? memberName(replyTo.sender_id) : undefined}
                      canModerate={canModerate}
                      canPin={canModerate}
                      ministryId={group?.ministry_id}
                      highlighted={highlightId === m.id}
                      t={t}
                      onReply={setReplyTo}
                      onPin={handlePin}
                      onDelete={handleDelete}
                      onRetry={retry}
                      onDiscard={discard}
                      onOpenReference={setPassageRef}
                      onJumpTo={jumpTo}
                    />
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>

        {(newBelow > 0 || awayFromBottom) && !loading && visibleMessages.length > 0 && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg"
            aria-label={t('groupChat', 'jumpToLatest', 'Jump to latest')}
          >
            <ArrowDown className="h-4 w-4" />
            {newBelow > 0 ? t('groupChat', 'newCount', '{count} new', { count: newBelow }) : t('groupChat', 'latest', 'Latest')}
          </button>
        )}
      </div>

      <MessageComposer
        t={t}
        disabledReason={loading || !group ? null : disabledReason}
        replyTo={replyTo}
        replyToName={replyTo ? memberName(replyTo.sender_id) : undefined}
        onCancelReply={() => setReplyTo(null)}
        onSend={handleSend}
      />

      <ScripturePassageSheet reference={passageRef} onOpenChange={(o) => !o && setPassageRef(null)} />

      {group && (
        <GroupDetailsSheet
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          group={group}
          members={members}
          membership={membership}
          myId={myId}
          canModerate={canModerate}
          isOwner={isOwner}
          pinned={pinned}
          memberName={memberName}
          onJumpTo={jumpTo}
          onUnpin={(m) => handlePin(m, false)}
          onMembersChanged={reloadMembers}
          onMembershipChanged={() => { reloadMembership(); loadGroup(); }}
          onLeft={() => (onLeft || onBack)?.()}
          onOpenGroupPage={onOpenGroupPage}
          t={t}
        />
      )}

      <Dialog open={!!farMessage} onOpenChange={(o) => !o && setFarMessage(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{farMessage ? memberName(farMessage.sender_id) : ''}</DialogTitle>
          </DialogHeader>
          {farMessage && (
            <div className="space-y-1">
              <p className="whitespace-pre-wrap text-sm">{messageSnippet(farMessage, t)}</p>
              <p className="text-xs text-muted-foreground">{new Date(farMessage.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && !deleteBusy && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting?.asModerator ? t('groupChat', 'removeMessageTitle', 'Remove this message?') : t('groupChat', 'deleteMessageTitle', 'Delete this message?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.asModerator
                ? t('groupChat', 'removeMessageDesc', 'It will be replaced with "Message removed" for everyone. This is recorded in the moderation history.')
                : t('groupChat', 'deleteMessageDesc', 'It will be replaced with "Message removed" for everyone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleting?.asModerator && (
            <Textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value.slice(0, 500))}
              placeholder={t('groupChat', 'reasonOptional', 'Reason (optional, only leaders see this)')}
              rows={2}
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>{t('groupChat', 'cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleting?.asModerator ? t('groupChat', 'remove', 'Remove') : t('groupChat', 'delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>,
  );
};

export default GroupChatView;
