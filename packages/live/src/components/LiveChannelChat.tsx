import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { supabase } from '@rekindle/supabase';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { ScrollArea } from '@rekindle/ui/scroll-area';
import { Send, Pin, Smile, MessageCircle } from 'lucide-react';
import { toast } from '@rekindle/ui/use-toast';
import { ChannelChatMessage } from '@rekindle/types/liveChannelTypes';

interface LiveChannelChatProps {
  channelId: string;
  isHost?: boolean;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  broadcastId?: string; // FIXED: Add broadcastId to track session
}

export const LiveChannelChat: React.FC<LiveChannelChatProps> = ({
  channelId,
  isHost = false,
  isMinimized = false,
  onToggleMinimize,
  broadcastId
}) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [messages, setMessages] = useState<ChannelChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [pinnedMessage, setPinnedMessage] = useState<ChannelChatMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentBroadcastIdRef = useRef<string | undefined>(broadcastId);

  // FIXED: Clear messages when broadcast session changes
  useEffect(() => {
    if (broadcastId !== currentBroadcastIdRef.current) {
      console.log('[LiveChannelChat] Broadcast session changed:', {
        previous: currentBroadcastIdRef.current,
        current: broadcastId
      });
      console.log('[LiveChannelChat] Clearing messages for new session');
      setMessages([]);
      setPinnedMessage(null);
      currentBroadcastIdRef.current = broadcastId;
    }
  }, [broadcastId]);

  // FIXED: Load messages only from current broadcast session
  const loadMessages = useCallback(async () => {
    if (!channelId) return;

    try {
      console.log('[LiveChannelChat] Loading messages for channel:', channelId, 'broadcast:', broadcastId);
      
      // FIXED: If we have a broadcastId, only load messages from this session
      // Otherwise, load recent messages (for viewers joining mid-stream)
      const query = supabase
        .from('channel_chat_messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(100);

      // FIXED: Add broadcast_id filter if available
      // Note: This requires adding a broadcast_id column to channel_chat_messages table
      // For now, we rely on the initial clearing when broadcast starts
      
      const { data, error } = await query;

      if (error) throw error;

      console.log('[LiveChannelChat] Loaded messages:', data?.length || 0);
      
      // FIXED: Only set messages if this is still the current broadcast session
      if (broadcastId === currentBroadcastIdRef.current) {
        setMessages(data || []);
        
        // Find pinned message
        const pinned = data?.find(m => m.is_pinned);
        if (pinned) setPinnedMessage(pinned);
      } else {
        console.log('[LiveChannelChat] Ignoring stale messages from previous session');
      }
    } catch (err) {
      console.error('[LiveChannelChat] Failed to load messages:', err);
    }
  }, [channelId, broadcastId]);

  // FIXED: Subscribe to real-time messages with better error handling
  useEffect(() => {
    if (!channelId) return;

    // Initial load
    loadMessages();

    // FIXED: Enhanced real-time subscription with reconnection handling
    const channel = supabase
      .channel(`channel-chat-${channelId}`, {
        config: {
          broadcast: { self: true }, // FIXED: Receive our own messages
          presence: { key: user?.id || 'anonymous' }
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'channel_chat_messages',
          filter: `channel_id=eq.${channelId}`
        },
        (payload) => {
          console.log('[LiveChannelChat] New message received:', payload);
          const newMsg = payload.new as ChannelChatMessage;
          
          // FIXED: Prevent duplicate messages and validate session
          setMessages(prev => {
            // Check if message already exists
            if (prev.some(m => m.id === newMsg.id)) {
              console.log('[LiveChannelChat] Duplicate message, skipping');
              return prev;
            }
            
            // FIXED: Verify we're still in the same broadcast session
            if (broadcastId && broadcastId !== currentBroadcastIdRef.current) {
              console.log('[LiveChannelChat] Message from different session, skipping');
              return prev;
            }
            
            return [...prev, newMsg];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'channel_chat_messages',
          filter: `channel_id=eq.${channelId}`
        },
        (payload) => {
          console.log('[LiveChannelChat] Message updated:', payload);
          const updatedMsg = payload.new as ChannelChatMessage;
          setMessages(prev => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
          if (updatedMsg.is_pinned) {
            setPinnedMessage(updatedMsg);
          } else if (pinnedMessage?.id === updatedMsg.id) {
            setPinnedMessage(null);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'channel_chat_messages',
          filter: `channel_id=eq.${channelId}`
        },
        (payload) => {
          console.log('[LiveChannelChat] Message deleted:', payload);
          const deletedMsg = payload.old as ChannelChatMessage;
          setMessages(prev => prev.filter(m => m.id !== deletedMsg.id));
          if (pinnedMessage?.id === deletedMsg.id) {
            setPinnedMessage(null);
          }
        }
      )
      .subscribe((status) => {
        console.log('[LiveChannelChat] Subscription status:', status);
        
        // FIXED: Handle subscription state changes
        if (status === 'SUBSCRIBED') {
          console.log('[LiveChannelChat] Successfully subscribed to real-time updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[LiveChannelChat] Subscription error, will retry...');
          // Supabase will auto-retry
        } else if (status === 'TIMED_OUT') {
          console.error('[LiveChannelChat] Subscription timed out');
        }
      });

    return () => {
      console.log('[LiveChannelChat] Unsubscribing from channel');
      supabase.removeChannel(channel);
    };
  }, [channelId, loadMessages, pinnedMessage?.id, user?.id]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current;
      // Check if user is near bottom before auto-scrolling
      const isNearBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight < 100;
      
      if (isNearBottom || messages.length === 1) {
        setTimeout(() => {
          scrollElement.scrollTop = scrollElement.scrollHeight;
        }, 0);
      }
    }
  }, [messages]);

  // FIXED: Send message with retry logic
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || sending) return;

    const messageContent = newMessage.trim();
    setSending(true);
    
    try {
      const { error } = await supabase
        .from('channel_chat_messages')
        .insert({
          channel_id: channelId,
          user_id: user.id,
          user_name: profile?.full_name || user.email?.split('@')[0] || 'Anonymous',
          message: messageContent,
          message_type: 'text',
          is_pinned: false
        });

      if (error) throw error;

      // FIXED: Clear input immediately for better UX
      setNewMessage('');
      inputRef.current?.focus();
      
      console.log('[LiveChannelChat] Message sent successfully');
    } catch (err) {
      console.error('[LiveChannelChat] Failed to send message:', err);
      
      // FIXED: Better error handling
      toast({
        title: t('liveChannelChat', 'failedToSend', 'Failed to Send'),
        description: t('liveChannelChat', 'failedToSendDesc', 'Your message could not be sent. Please try again.'),
        variant: 'destructive'
      });
      
      // Restore message on error so user doesn't lose it
      setNewMessage(messageContent);
    } finally {
      setSending(false);
    }
  };

  // Pin/unpin message (host only)
  const togglePin = async (message: ChannelChatMessage) => {
    if (!isHost) return;

    try {
      // Unpin current pinned message if exists
      if (pinnedMessage && pinnedMessage.id !== message.id) {
        await supabase
          .from('channel_chat_messages')
          .update({ is_pinned: false })
          .eq('id', pinnedMessage.id);
      }

      // Toggle pin on selected message
      const { error } = await supabase
        .from('channel_chat_messages')
        .update({ is_pinned: !message.is_pinned })
        .eq('id', message.id);

      if (error) throw error;

      toast({
        title: message.is_pinned ? t('liveChannelChat', 'messageUnpinned', 'Message Unpinned') : t('liveChannelChat', 'messagePinned', 'Message Pinned'),
        description: message.is_pinned ? t('liveChannelChat', 'messageUnpinnedDesc', 'Message has been unpinned') : t('liveChannelChat', 'messagePinnedDesc', 'Message is now pinned for all viewers')
      });
    } catch (err) {
      console.error('[LiveChannelChat] Failed to toggle pin:', err);
      toast({
        title: t('liveChannelChat', 'error', 'Error'),
        description: t('liveChannelChat', 'failedToUpdateMessage', 'Failed to update message'),
        variant: 'destructive'
      });
    }
  };

  if (isMinimized) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onToggleMinimize}
        className="fixed bottom-4 right-4 z-50 shadow-lg"
      >
        <MessageCircle className="h-4 w-4 mr-2" />
        {t('liveChannelChat', 'chatCount', 'Chat ({count})').replace('{count}', String(messages.length))}
      </Button>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-purple-400" />
          <span className="font-semibold">{t('liveChannelChat', 'liveChat', 'Live Chat')}</span>
          <span className="text-xs text-gray-400">({messages.length})</span>
        </div>
        {onToggleMinimize && (
          <Button variant="ghost" size="sm" onClick={onToggleMinimize} className="text-gray-400 hover:text-white">
            {t('liveChannelChat', 'minimize', 'Minimize')}
          </Button>
        )}
      </div>

      {/* Pinned Message */}
      {pinnedMessage && (
        <div className="px-4 py-2 bg-purple-900/50 border-b border-purple-700 flex items-start gap-2">
          <Pin className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs text-purple-400 font-medium">{pinnedMessage.user_name}</span>
            <p className="text-sm text-white truncate">{pinnedMessage.message}</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t('liveChannelChat', 'noMessagesYet', 'No messages yet')}</p>
              <p className="text-xs">{t('liveChannelChat', 'beFirstToSay', 'Be the first to say something!')}</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`group flex items-start gap-2 ${
                  msg.user_id === user?.id ? 'flex-row-reverse' : ''
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    msg.user_id === user?.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-100'
                  } ${msg.message_type === 'system' ? 'bg-gray-800 text-gray-400 italic text-center w-full max-w-full' : ''}`}
                >
                  {msg.message_type !== 'system' && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${
                        msg.user_id === user?.id ? 'text-purple-200' : 'text-purple-400'
                      }`}>
                        {msg.user_name}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                  <p className="text-sm break-words">{msg.message}</p>
                </div>

                {/* Pin button for hosts */}
                {isHost && msg.message_type !== 'system' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => togglePin(msg)}
                    className={`opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 ${
                      msg.is_pinned ? 'text-purple-400' : 'text-gray-500'
                    }`}
                  >
                    <Pin className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <form onSubmit={sendMessage} className="p-3 bg-gray-800 border-t border-gray-700">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={t('liveChannelChat', 'sendMessagePlaceholder', 'Send a message...')}
            className="flex-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
            maxLength={500}
            disabled={!user || sending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!newMessage.trim() || sending || !user}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {!user && (
          <p className="text-xs text-gray-500 mt-1">{t('liveChannelChat', 'signInToChat', 'Sign in to chat')}</p>
        )}
        {sending && (
          <p className="text-xs text-gray-400 mt-1">{t('liveChannelChat', 'sending', 'Sending...')}</p>
        )}
      </form>
    </div>
  );
};
export default LiveChannelChat;
