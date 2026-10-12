import React, { memo } from 'react';
import { DropdownMenuItem } from '@rekindle/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@rekindle/ui/avatar';
import { cn } from '@rekindle/ui/utils';
import { ContentSafetyMenu } from '@rekindle/features/components/ContentSafetyMenu';
import { parseReference, type ScriptureReference } from '@rekindle/features/scripture/parser';
import { AlertCircle, BookOpen, Copy, HandHeart, Loader2, Pin, PinOff, Reply, RotateCw, Trash2, X } from 'lucide-react';
import type { ChatMember, ChatMessage, LocalMessage } from '../../lib/groupChatApi';
import { ChatImage } from './ChatImage';
import { RichMessageText, usePassage } from './ScripturePassage';

type T = (ns: string, key: string, fallback?: string, vars?: Record<string, string | number>) => string;

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** One-line summary of a message, used in reply previews. */
export function messageSnippet(m: ChatMessage | null | undefined, t: T): string {
  if (!m) return t('groupChat', 'originalUnavailable', 'Original message unavailable');
  if (m.deleted_at) return t('groupChat', 'messageRemoved', 'Message removed');
  if (m.message_type === 'image') return m.body || t('groupChat', 'photo', 'Photo');
  if (m.message_type === 'scripture') return [m.scripture_ref, m.body].filter(Boolean).join(' · ');
  if (m.message_type === 'prayer_request') return `${t('groupChat', 'prayerRequest', 'Prayer request')}: ${m.body}`;
  return m.body;
}

const ScriptureCard: React.FC<{ refText: string; onOpen: (r: ScriptureReference) => void; mine: boolean }> = ({ refText, onOpen, mine }) => {
  const reference = parseReference(refText);
  const { passage } = usePassage(reference);
  return (
    <button
      type="button"
      onClick={() => reference && onOpen(reference)}
      className={cn(
        'mb-1 block w-full rounded-lg border-l-4 px-3 py-2 text-left',
        mine ? 'border-primary-foreground/60 bg-primary-foreground/10' : 'border-primary bg-background/70',
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        <BookOpen className="h-3.5 w-3.5" /> {refText}
      </span>
      {passage && <span className="mt-1 line-clamp-4 block text-sm italic leading-snug">{passage.text}</span>}
    </button>
  );
};

export interface MessageBubbleProps {
  message: LocalMessage;
  mine: boolean;
  sender?: ChatMember;
  /** First message in a run from the same person: show name and avatar. */
  startsRun: boolean;
  replyTo?: ChatMessage | null;
  replyToName?: string;
  canModerate: boolean;
  canPin: boolean;
  ministryId?: string;
  highlighted?: boolean;
  t: T;
  onReply: (m: ChatMessage) => void;
  onPin: (m: ChatMessage, pinned: boolean) => void;
  onDelete: (m: ChatMessage, asModerator: boolean) => void;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
  onOpenReference: (r: ScriptureReference) => void;
  onJumpTo: (id: string) => void;
}

export const MessageBubble = memo<MessageBubbleProps>(({
  message: m, mine, sender, startsRun, replyTo, replyToName, canModerate, canPin, ministryId, highlighted, t,
  onReply, onPin, onDelete, onRetry, onDiscard, onOpenReference, onJumpTo,
}) => {
  if (m.message_type === 'system') {
    return (
      <div className="my-2 flex justify-center px-4">
        <span className="rounded-full bg-muted px-3 py-1 text-center text-xs text-muted-foreground">{m.body}</span>
      </div>
    );
  }

  const name = mine ? t('groupChat', 'you', 'You') : sender?.name || t('groupChat', 'member', 'Member');
  const deleted = !!m.deleted_at;
  const saved = !m.localState;
  const copyText = () => { navigator.clipboard?.writeText(m.body).catch(() => {}); };

  const menuItems = saved && !deleted ? (
    <>
      <DropdownMenuItem onSelect={() => onReply(m)}>
        <Reply className="mr-2 h-4 w-4" />{t('groupChat', 'reply', 'Reply')}
      </DropdownMenuItem>
      {m.body && (
        <DropdownMenuItem onSelect={copyText}>
          <Copy className="mr-2 h-4 w-4" />{t('groupChat', 'copyText', 'Copy text')}
        </DropdownMenuItem>
      )}
      {canPin && (
        <DropdownMenuItem onSelect={() => onPin(m, !m.pinned_at)}>
          {m.pinned_at ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
          {m.pinned_at ? t('groupChat', 'unpin', 'Unpin') : t('groupChat', 'pin', 'Pin message')}
        </DropdownMenuItem>
      )}
      {(mine || canModerate) && (
        <DropdownMenuItem onSelect={() => onDelete(m, !mine)} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          {mine ? t('groupChat', 'deleteMessage', 'Delete message') : t('groupChat', 'removeMessage', 'Remove message')}
        </DropdownMenuItem>
      )}
    </>
  ) : null;

  return (
    <div
      id={`msg-${m.id}`}
      data-created-at={saved ? m.created_at : undefined}
      className={cn(
        'group flex gap-2 px-3 transition-colors',
        mine ? 'flex-row-reverse' : 'flex-row',
        startsRun ? 'mt-3' : 'mt-0.5',
        highlighted && 'rounded-lg bg-amber-100/60 dark:bg-amber-500/10',
      )}
    >
      {!mine && (
        <div className="w-8 shrink-0">
          {startsRun && (
            <Avatar className="h-8 w-8">
              {sender?.avatar_url && <AvatarImage src={sender.avatar_url} alt="" />}
              <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
            </Avatar>
          )}
        </div>
      )}

      <div className={cn('flex min-w-0 max-w-[80%] flex-col', mine ? 'items-end' : 'items-start')}>
        {startsRun && !mine && (
          <span className="mb-0.5 px-1 text-xs font-medium text-muted-foreground">
            {name}
            {sender?.role === 'leader' && <span className="ml-1 text-amber-600">· {t('groupChat', 'leader', 'Leader')}</span>}
            {sender?.role === 'assistant_leader' && <span className="ml-1 text-blue-600">· {t('groupChat', 'assistantLeader', 'Assistant leader')}</span>}
          </span>
        )}

        <div className={cn('flex items-center gap-1', mine ? 'flex-row-reverse' : 'flex-row')}>
          <div
            className={cn(
              'min-w-0 rounded-2xl px-3 py-2 text-[15px] leading-snug shadow-sm',
              deleted
                ? 'border border-dashed bg-transparent text-muted-foreground shadow-none'
                : mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
              m.localState === 'failed' && 'opacity-70',
            )}
          >
            {deleted ? (
              <p className="text-sm italic">{t('groupChat', 'messageRemoved', 'Message removed')}</p>
            ) : (
              <>
                {m.pinned_at && (
                  <span className="mb-1 flex items-center gap-1 text-[11px] font-medium opacity-80">
                    <Pin className="h-3 w-3" />{t('groupChat', 'pinned', 'Pinned')}
                  </span>
                )}
                {m.reply_to_id && (
                  <button
                    type="button"
                    onClick={() => onJumpTo(m.reply_to_id!)}
                    className={cn(
                      'mb-1.5 block w-full max-w-full rounded-md border-l-2 px-2 py-1 text-left text-xs',
                      mine ? 'border-primary-foreground/60 bg-primary-foreground/10' : 'border-primary/60 bg-background/60',
                    )}
                  >
                    <span className="block font-semibold">{replyToName || t('groupChat', 'member', 'Member')}</span>
                    <span className="line-clamp-2 opacity-80">{messageSnippet(replyTo, t)}</span>
                  </button>
                )}
                {m.message_type === 'prayer_request' && (
                  <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                    <HandHeart className="h-3.5 w-3.5" />{t('groupChat', 'prayerRequest', 'Prayer request')}
                  </span>
                )}
                {m.message_type === 'scripture' && m.scripture_ref && (
                  <ScriptureCard refText={m.scripture_ref} onOpen={onOpenReference} mine={mine} />
                )}
                {m.message_type === 'image' && (
                  <div className="-mx-1 mb-1">
                    <ChatImage
                      path={m.attachment_path}
                      previewUrl={m.localPreviewUrl}
                      width={m.attachment_width}
                      height={m.attachment_height}
                      alt={t('groupChat', 'photoFrom', 'Photo from {name}', { name })}
                    />
                  </div>
                )}
                {m.body && (
                  <RichMessageText
                    text={m.body}
                    onOpenReference={onOpenReference}
                    className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                  />
                )}
              </>
            )}
          </div>
          {saved && !deleted && (
            <ContentSafetyMenu
              contentType="small_group_messages"
              contentId={m.id}
              authorId={m.sender_id || undefined}
              ministryId={ministryId}
              className="opacity-60 group-hover:opacity-100 focus:opacity-100"
            >
              {menuItems}
            </ContentSafetyMenu>
          )}
        </div>

        <span className="mt-0.5 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
          {m.localState === 'sending' && (<><Loader2 className="h-3 w-3 animate-spin" />{t('groupChat', 'sending', 'Sending…')}</>)}
          {m.localState === 'failed' && (
            <>
              <AlertCircle className="h-3 w-3 text-destructive" />
              <span className="text-destructive">{m.errorText || t('groupChat', 'notSent', 'Not sent')}</span>
              <button type="button" onClick={() => onRetry(m.client_id)} className="ml-1 inline-flex items-center gap-0.5 font-medium text-foreground underline">
                <RotateCw className="h-3 w-3" />{t('groupChat', 'retry', 'Retry')}
              </button>
              <button type="button" onClick={() => onDiscard(m.client_id)} className="ml-1 inline-flex items-center gap-0.5 font-medium text-foreground underline">
                <X className="h-3 w-3" />{t('groupChat', 'discard', 'Delete')}
              </button>
            </>
          )}
          {saved && formatTime(m.created_at)}
        </span>
      </div>
    </div>
  );
});
MessageBubble.displayName = 'MessageBubble';
