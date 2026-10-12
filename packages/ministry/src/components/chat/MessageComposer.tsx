import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@rekindle/ui/dropdown-menu';
import { cn } from '@rekindle/ui/utils';
import { formatReference, parseReference } from '@rekindle/features/scripture/parser';
import { BookOpen, HandHeart, ImagePlus, Loader2, Plus, Reply, X } from 'lucide-react';
import { MESSAGE_MAX_LENGTH, type ChatMessage } from '../../lib/groupChatApi';
import type { SendInput } from '../../lib/useGroupChat';
import { messageSnippet } from './MessageBubble';
import { usePassage } from './ScripturePassage';

type T = (ns: string, key: string, fallback?: string, vars?: Record<string, string | number>) => string;
type Mode = 'text' | 'scripture' | 'prayer_request' | 'image';

const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export const MessageComposer: React.FC<{
  t: T;
  disabledReason?: string | null;
  replyTo: ChatMessage | null;
  replyToName?: string;
  onCancelReply: () => void;
  /** Returns an error sentence, or null when the message was queued. */
  onSend: (input: SendInput) => string | null;
  onFocus?: () => void;
}> = ({ t, disabledReason, replyTo, replyToName, onCancelReply, onSend, onFocus }) => {
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [refText, setRefText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reference = mode === 'scripture' ? parseReference(refText) : null;
  const { passage, loading: passageLoading } = usePassage(reference);

  // Grow the box with its content, up to about six lines.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => { if (replyTo) textRef.current?.focus(); }, [replyTo]);

  const reset = () => {
    setMode('text'); setText(''); setRefText(''); setFile(null); setError(null);
  };

  const over = text.length > MESSAGE_MAX_LENGTH;
  const canSend = !disabledReason && !over && (
    mode === 'image' ? !!file
      : mode === 'scripture' ? !!reference
        : text.trim().length > 0
  );

  const submit = () => {
    if (!canSend) {
      if (mode === 'scripture' && !reference) setError(t('groupChat', 'scriptureInvalid', 'Enter a reference like John 3:16 or Psalm 23.'));
      return;
    }
    const input: SendInput = {
      kind: mode,
      body: text,
      scriptureRef: reference ? formatReference(reference) : null,
      file: mode === 'image' ? file : null,
      replyToId: replyTo?.id || null,
    };
    const err = onSend(input);
    if (err) { setError(err); return; }
    reset();
    onCancelReply();
    // Keep the keyboard up on phones so the next message can follow.
    textRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouchDevice()) {
      e.preventDefault();
      submit();
    }
  };

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFile(f);
    setMode('image');
    setError(null);
  };

  if (disabledReason) {
    return (
      <div className="border-t bg-background px-4 py-3 text-center text-sm text-muted-foreground">
        {disabledReason}
      </div>
    );
  }

  const placeholder =
    mode === 'prayer_request' ? t('groupChat', 'prayerPlaceholder', 'What would you like the group to pray for?')
      : mode === 'scripture' ? t('groupChat', 'scriptureNotePlaceholder', 'Add a note (optional)')
        : mode === 'image' ? t('groupChat', 'captionPlaceholder', 'Add a caption (optional)')
          : t('groupChat', 'messagePlaceholder', 'Message');

  return (
    <div className="border-t bg-background px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
          <Reply className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <span className="font-semibold">{t('groupChat', 'replyingTo', 'Replying to {name}', { name: replyToName || t('groupChat', 'member', 'Member') })}</span>
            <p className="truncate text-muted-foreground">{messageSnippet(replyTo, t)}</p>
          </div>
          <button type="button" onClick={onCancelReply} aria-label={t('groupChat', 'cancelReply', 'Cancel reply')} className="rounded p-0.5 hover:bg-background">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {mode !== 'text' && (
        <div className="mb-2 rounded-lg border bg-muted/40 p-2">
          <div className="mb-1 flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center gap-1.5">
              {mode === 'scripture' && (<><BookOpen className="h-3.5 w-3.5" />{t('groupChat', 'shareScripture', 'Share a Scripture')}</>)}
              {mode === 'prayer_request' && (<><HandHeart className="h-3.5 w-3.5" />{t('groupChat', 'prayerRequest', 'Prayer request')}</>)}
              {mode === 'image' && (<><ImagePlus className="h-3.5 w-3.5" />{t('groupChat', 'photo', 'Photo')}</>)}
            </span>
            <button type="button" onClick={reset} aria-label={t('groupChat', 'cancel', 'Cancel')} className="rounded p-0.5 hover:bg-background">
              <X className="h-4 w-4" />
            </button>
          </div>
          {mode === 'scripture' && (
            <>
              <Input
                autoFocus
                value={refText}
                onChange={(e) => { setRefText(e.target.value); setError(null); }}
                placeholder={t('groupChat', 'scriptureRefPlaceholder', 'e.g. John 3:16 or Romans 8:28-30')}
                className="h-9 bg-background"
                maxLength={64}
              />
              {reference && (
                <p className="mt-1.5 line-clamp-3 text-xs italic text-muted-foreground">
                  {passageLoading ? <Loader2 className="inline h-3 w-3 animate-spin" /> : passage?.text || formatReference(reference)}
                </p>
              )}
            </>
          )}
          {mode === 'prayer_request' && (
            <p className="text-xs text-muted-foreground">
              {t('groupChat', 'prayerHint', "Your request is posted in the chat and added to the group's prayer requests.")}
            </p>
          )}
          {mode === 'image' && preview && (
            <img src={preview} alt="" className="max-h-40 rounded-md object-contain" />
          )}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full" aria-label={t('groupChat', 'addToMessage', 'Add to message')}>
              <Plus className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
              <ImagePlus className="mr-2 h-4 w-4" />{t('groupChat', 'photo', 'Photo')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { setMode('scripture'); setFile(null); setError(null); }}>
              <BookOpen className="mr-2 h-4 w-4" />{t('groupChat', 'scripture', 'Scripture')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { setMode('prayer_request'); setFile(null); setError(null); setTimeout(() => textRef.current?.focus(), 0); }}>
              <HandHeart className="mr-2 h-4 w-4" />{t('groupChat', 'prayerRequest', 'Prayer request')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" onChange={pickPhoto} />

        <textarea
          ref={textRef}
          rows={1}
          value={text}
          onChange={(e) => { setText(e.target.value); if (error) setError(null); }}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          placeholder={placeholder}
          aria-label={placeholder}
          enterKeyHint="send"
          className={cn(
            'min-h-10 flex-1 resize-none rounded-2xl border bg-muted/40 px-3 py-2 text-base leading-snug',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            over && 'border-destructive',
          )}
        />
        <Button type="button" onClick={submit} disabled={!canSend} className="h-10 shrink-0 rounded-full px-4">
          {t('groupChat', 'send', 'Send')}
        </Button>
      </div>

      {(error || text.length > MESSAGE_MAX_LENGTH - 200) && (
        <p className={cn('mt-1 px-2 text-xs', error || over ? 'text-destructive' : 'text-muted-foreground')}>
          {error || `${text.length.toLocaleString()} / ${MESSAGE_MAX_LENGTH.toLocaleString()}`}
        </p>
      )}
    </div>
  );
};
