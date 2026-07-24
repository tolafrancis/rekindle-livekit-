import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { toast } from '@rekindle/ui/use-toast';
import { supabase } from '@rekindle/supabase';
import { Send, MessageCircle, X, Paperclip, Download, FileText, Loader2 } from 'lucide-react';
import { useMeetingChat } from '../useMeetingChat';
import type { ChatAttachment } from '@rekindle/types/liveChannelTypes';

interface MeetingChatPanelProps {
  meetingId: string;
  userId: string;
  userName: string;
  isGuest?: boolean;
  onClose?: () => void;
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
// Same bucket RoomChatSidebar (the in-call chat) uploads to — one shared
// storage location for every meeting chat surface, in-call or audience-side.
const ATTACHMENT_BUCKET = 'meeting-chat-attachments';

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MeetingChatPanel: React.FC<MeetingChatPanelProps> = ({
  meetingId,
  userId,
  userName,
  isGuest,
  onClose,
}) => {
  const { messages, sendMessage } = useMeetingChat(meetingId, userId, userName);
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const t = text;
    setText('');
    await sendMessage(t);
  };

  // Attachments are member-only, same restriction as the in-call chat — the
  // upload bucket's RLS is authenticated-only, and guests can't chat here at
  // all yet (see the "Sign in to join the chat" gate below).
  const canAttach = !isGuest;

  const handleFile = async (file: File | undefined) => {
    if (!file || uploading || !canAttach) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast({ title: 'File too large', description: 'Attachments must be 10 MB or less.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `chat/${meetingId}/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path);
      const attachment: ChatAttachment = {
        url: pub.publicUrl,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
      };
      const t = text;
      setText('');
      await sendMessage(t, attachment);
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message || 'Could not upload the file.', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Lets a screenshot or copied image go straight from the clipboard into the
  // chat, same as the in-call RoomChatSidebar.
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (!canAttach || uploading) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleFile(file);
        }
        break;
      }
    }
  };

  const renderAttachment = (attachment?: ChatAttachment | null) =>
    attachment ? (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        download={attachment.name}
        className="block mt-1"
      >
        {attachment.type?.startsWith('image/') ? (
          <img
            src={attachment.url}
            alt={attachment.name}
            className="max-w-full max-h-48 rounded-md border border-white/10"
          />
        ) : (
          <div className="flex items-center gap-2 p-2 rounded-md bg-black/20 hover:bg-black/30 transition-colors">
            <FileText className="h-5 w-5 shrink-0 text-blue-200" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate">{attachment.name}</p>
              <p className="text-[10px] text-gray-300">{formatSize(attachment.size)}</p>
            </div>
            <Download className="h-4 w-4 shrink-0 text-gray-300" />
          </div>
        )}
      </a>
    ) : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-gray-800 bg-gray-900 text-white">
      <div className="flex items-center justify-between p-3 border-b border-gray-800 shrink-0">
        <span className="flex items-center gap-2 text-sm font-medium">
          <MessageCircle className="h-4 w-4" /> Chat
        </span>
        {onClose && (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-white" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-xs text-gray-500">No messages yet. Say hello!</p>
        ) : (
          messages.map(m => (
            <div key={m.id} className="text-sm leading-snug">
              <span className={`font-medium ${m.user_id === userId ? 'text-purple-300' : 'text-gray-300'}`}>
                {(m.user_name && m.user_name.trim()) ? m.user_name : 'Guest'}:{' '}
              </span>
              {m.content && <span className="text-gray-100 break-words">{m.content}</span>}
              {renderAttachment(m.attachment)}
            </div>
          ))
        )}
      </div>

      {isGuest ? (
        <div className="p-3 border-t border-gray-800 shrink-0 text-center text-xs text-gray-400">
          Sign in to join the chat
        </div>
      ) : (
        <div className="p-3 border-t border-gray-800 flex gap-2 shrink-0">
          {canAttach && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] || undefined)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Attach a file (max 10 MB)"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="shrink-0 text-gray-400 hover:text-white hover:bg-gray-800"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </Button>
            </>
          )}
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            onPaste={handlePaste}
            placeholder={uploading ? 'Uploading…' : 'Type a message'}
            disabled={uploading}
            className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
          />
          <Button size="icon" className="bg-purple-600 hover:bg-purple-700 shrink-0" onClick={send} disabled={uploading}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
