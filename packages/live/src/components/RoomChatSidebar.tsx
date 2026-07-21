import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { ScrollArea } from '@rekindle/ui/scroll-area';
import { Badge } from '@rekindle/ui/badge';
import { toast } from '@rekindle/ui/use-toast';
import { supabase } from '@rekindle/supabase';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@rekindle/ui/dropdown-menu';
import {
  MessageCircle,
  Send,
  X,
  Shield,
  Crown,
  AlertCircle,
  Ban,
  Paperclip,
  Download,
  FileText,
  Loader2,
  Lock,
  ChevronDown,
  Users,
} from 'lucide-react';
import { ChatMessageType, ChatAttachment } from '@rekindle/types/liveChannelTypes';

interface ChatParticipant { sessionId: string; userName: string; isLocal?: boolean }

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
const ATTACHMENT_BUCKET = 'meeting-chat-attachments';

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface RoomChatSidebarProps {
  messages: ChatMessageType[];
  onSendMessage: (content: string, isPrivate?: boolean, recipientId?: string, attachment?: ChatAttachment | null) => Promise<void>;
  currentUserId: string;
  chatMode?: 'all' | 'host-only' | 'disabled';
  onClose: () => void;
  /** Members can attach files; guests cannot (upload RLS is authenticated-only). */
  canAttach?: boolean;
  meetingId?: string;
  /** Roster for the "send privately to…" picker. */
  participants?: ChatParticipant[];
}

export const RoomChatSidebar: React.FC<RoomChatSidebarProps> = ({
  messages,
  onSendMessage,
  currentUserId,
  chatMode = 'all',
  onClose,
  canAttach = false,
  meetingId,
  participants = [],
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recipientId, setRecipientId] = useState<string | null>(null); // null = Everyone
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // People you can DM = everyone but yourself.
  const others = participants.filter((p) => !p.isLocal && p.sessionId !== currentUserId);
  const nameOf = (sid?: string | null) => participants.find((p) => p.sessionId === sid)?.userName;
  // A selected recipient who has since left falls back to Everyone.
  const recipient = recipientId && others.some((p) => p.sessionId === recipientId) ? recipientId : null;
  const isPrivate = recipient !== null;

  const handleFile = async (file: File | undefined) => {
    if (!file || uploading) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast({ title: 'File too large', description: 'Attachments must be 10 MB or less.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `chat/${meetingId || 'meeting'}/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path);
      await onSendMessage(newMessage.trim(), isPrivate, recipient ?? undefined, {
        url: pub.publicUrl,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
      });
      setNewMessage('');
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message || 'Could not upload the file.', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    if (chatMode === 'disabled') {
      return;
    }

    setSending(true);
    try {
      await onSendMessage(newMessage.trim(), isPrivate, recipient ?? undefined);
      setNewMessage('');
      inputRef.current?.focus();
    } catch (error) {
      console.error('[RoomChatSidebar] Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'host':
        return <Crown className="h-3 w-3 text-yellow-500" />;
      case 'co-host':
        return <Shield className="h-3 w-3 text-blue-500" />;
      default:
        return null;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'host':
        return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
      case 'co-host':
        return 'bg-blue-500/20 text-blue-500 border-blue-500/30';
      case 'speaker':
        return 'bg-green-500/20 text-green-500 border-green-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="w-full h-2/5 sm:w-80 sm:h-full shrink-0 bg-gray-900 border-t sm:border-t-0 sm:border-l border-gray-800 flex flex-col z-40">
      {/* On mobile this docks BELOW the video feed (parent is flex-col); on desktop
          it's a right-hand sidebar (parent is flex-row). */}
      {/* Header */}
      <CardHeader className="border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-blue-400" />
            <CardTitle className="text-white">Chat</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {messages.length}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {chatMode === 'disabled' && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-md flex items-center gap-2">
            <Ban className="h-4 w-4 text-red-400" />
            <span className="text-xs text-red-400">Chat is disabled</span>
          </div>
        )}

        {chatMode === 'host-only' && (
          <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-md flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-400" />
            <span className="text-xs text-yellow-400">Host-only mode</span>
          </div>
        )}
      </CardHeader>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((message) => {
              const isOwnMessage = message.sender_id === currentUserId;
              const isSystemMessage = message.messageType === 'system';
              const isHostAnnouncement = message.messageType === 'host-announcement';

              if (isSystemMessage) {
                return (
                  <div key={message.id} className="text-center">
                    <span className="text-xs text-gray-500 bg-gray-800 px-3 py-1 rounded-full inline-block">
                      {message.content}
                    </span>
                  </div>
                );
              }

              if (isHostAnnouncement) {
                return (
                  <div key={message.id} className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Crown className="h-4 w-4 text-yellow-500" />
                      <span className="text-xs font-medium text-yellow-500">Host Announcement</span>
                    </div>
                    <p className="text-sm text-white">{message.content}</p>
                    <span className="text-xs text-gray-500 mt-1 block">
                      {formatTime(message.timestamp)}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={message.id}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] ${isOwnMessage ? 'bg-blue-600' : 'bg-gray-800'} rounded-lg p-3`}>
                    <div className="flex items-center gap-2 mb-1">
                      {getRoleIcon(message.sender_role)}
                      <span className={`text-xs font-medium ${isOwnMessage ? 'text-blue-100' : 'text-gray-300'}`}>
                        {isOwnMessage ? 'You' : message.sender_name}
                      </span>
                      {message.sender_role !== 'attendee' && (
                        <Badge 
                          variant="outline" 
                          className={`text-xs h-4 px-1 ${getRoleBadgeColor(message.sender_role)}`}
                        >
                          {message.sender_role}
                        </Badge>
                      )}
                    </div>
                    {message.content && (
                      <p className={`text-sm ${isOwnMessage ? 'text-white' : 'text-gray-100'} break-words`}>
                        {message.content}
                      </p>
                    )}
                    {message.attachment && (
                      <a
                        href={message.attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={message.attachment.name}
                        className="block mt-1"
                      >
                        {message.attachment.type?.startsWith('image/') ? (
                          <img
                            src={message.attachment.url}
                            alt={message.attachment.name}
                            className="max-w-full max-h-48 rounded-md border border-white/10"
                          />
                        ) : (
                          <div className="flex items-center gap-2 p-2 rounded-md bg-black/20 hover:bg-black/30 transition-colors">
                            <FileText className="h-5 w-5 shrink-0 text-blue-200" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-white truncate">{message.attachment.name}</p>
                              <p className="text-[10px] text-gray-300">{formatSize(message.attachment.size)}</p>
                            </div>
                            <Download className="h-4 w-4 shrink-0 text-gray-300" />
                          </div>
                        )}
                      </a>
                    )}
                    <span className={`text-xs ${isOwnMessage ? 'text-blue-200' : 'text-gray-500'} mt-1 block`}>
                      {formatTime(message.timestamp)}
                    </span>
                    {message.isPrivate && (
                      <Badge variant="secondary" className="text-xs mt-1 gap-1">
                        <Lock className="h-3 w-3" />
                        {isOwnMessage && nameOf(message.recipientId)
                          ? `Private to ${nameOf(message.recipientId)}`
                          : 'Private'}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <CardContent className="border-t border-gray-800 p-4 flex-shrink-0">
        {/* Recipient picker — send to everyone or privately to one participant. */}
        {others.length > 0 && chatMode !== 'disabled' && (
          <div className="mb-2 flex items-center gap-2 text-xs">
            <span className="text-gray-500">To:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors ${
                    isPrivate ? 'bg-purple-600/20 text-purple-300' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {isPrivate ? <Lock className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                  {isPrivate ? `${nameOf(recipient)} (private)` : 'Everyone'}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-56 overflow-y-auto">
                <DropdownMenuItem onClick={() => setRecipientId(null)} className="gap-2">
                  <Users className="h-4 w-4" /> Everyone
                </DropdownMenuItem>
                {others.map((p) => (
                  <DropdownMenuItem key={p.sessionId} onClick={() => setRecipientId(p.sessionId)} className="gap-2">
                    <Lock className="h-4 w-4 text-purple-500" /> {p.userName}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <div className="flex gap-2">
          {/* Attach (members only). Any file, max 10 MB. */}
          {canAttach && chatMode !== 'disabled' && (
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
                disabled={uploading || sending}
                className="shrink-0 text-gray-400 hover:text-white hover:bg-gray-800"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </Button>
            </>
          )}
          <Input
            ref={inputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              chatMode === 'disabled'
                ? 'Chat is disabled'
                : chatMode === 'host-only'
                ? 'Only hosts can send messages'
                : uploading
                ? 'Uploading…'
                : 'Type a message...'
            }
            disabled={sending || uploading || chatMode === 'disabled'}
            className="flex-1 bg-gray-800 border-gray-700 text-white placeholder-gray-500"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || sending || uploading || chatMode === 'disabled'}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {sending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </div>
  );
};