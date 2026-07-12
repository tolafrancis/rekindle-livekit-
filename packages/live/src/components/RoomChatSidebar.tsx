import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { ScrollArea } from '@rekindle/ui/scroll-area';
import { Badge } from '@rekindle/ui/badge';
import { 
  MessageCircle, 
  Send, 
  X, 
  Shield,
  Crown,
  AlertCircle,
  Ban
} from 'lucide-react';
import { ChatMessageType } from '@rekindle/types/liveChannelTypes';

interface RoomChatSidebarProps {
  messages: ChatMessageType[];
  onSendMessage: (content: string, isPrivate?: boolean, recipientId?: string) => Promise<void>;
  currentUserId: string;
  chatMode?: 'all' | 'host-only' | 'disabled';
  onClose: () => void;
}

export const RoomChatSidebar: React.FC<RoomChatSidebarProps> = ({
  messages,
  onSendMessage,
  currentUserId,
  chatMode = 'all',
  onClose
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      await onSendMessage(newMessage.trim());
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
    <div className="fixed right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-800 flex flex-col z-50">
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
                    <p className={`text-sm ${isOwnMessage ? 'text-white' : 'text-gray-100'} break-words`}>
                      {message.content}
                    </p>
                    <span className={`text-xs ${isOwnMessage ? 'text-blue-200' : 'text-gray-500'} mt-1 block`}>
                      {formatTime(message.timestamp)}
                    </span>
                    {message.isPrivate && (
                      <Badge variant="secondary" className="text-xs mt-1">
                        Private
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
        <div className="flex gap-2">
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
                : 'Type a message...'
            }
            disabled={sending || chatMode === 'disabled'}
            className="flex-1 bg-gray-800 border-gray-700 text-white placeholder-gray-500"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || sending || chatMode === 'disabled'}
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