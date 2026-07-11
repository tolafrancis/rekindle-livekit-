import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageCircle, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/components/ui/use-toast';

interface ChatMessage {
  id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: string;
  room_id: number;
}

interface Props {
  roomId: number;
}

export const ChatSidebar: React.FC<Props> = ({ roomId }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('room_chat_messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(100);
      
      if (error) throw error;
      setMessages(data || []);
    } catch (error: any) {
      console.error('Failed to fetch messages:', error);
      toast({
        title: t('chatSidebar', 'error', 'Error'),
        description: t('chatSidebar', 'failedLoadMessages', 'Failed to load messages'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [roomId, t]);

  // Set up real-time subscription
  useEffect(() => {
    fetchMessages();
    
    // Create a unique channel name
    const channelName = `room-chat-${roomId}-${Date.now()}`;
    
    // Subscribe to new messages
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_chat_messages',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          console.log('New message received:', payload);
          const newMsg = payload.new as ChatMessage;
          
          // Add message if not already in the list
          setMessages(prev => {
            const exists = prev.some(m => m.id === newMsg.id);
            if (exists) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe((status) => {
        console.log('Chat subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Chat connected for room:', roomId);
        }
      });
    
    channelRef.current = channel;
    
    return () => {
      console.log('Cleaning up chat subscription');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [roomId, fetchMessages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !user?.id || sending) return;
    
    setSending(true);
    const messageContent = newMessage.trim();
    setNewMessage(''); // Clear input immediately for better UX
    
    try {
      const { data, error } = await supabase
        .from('room_chat_messages')
        .insert({
          room_id: roomId,
          user_id: user.id,
          user_name: profile?.full_name || 'Anonymous',
          content: messageContent
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Optimistically add the message if not already added by subscription
      if (data) {
        setMessages(prev => {
          const exists = prev.some(m => m.id === data.id);
          if (exists) return prev;
          return [...prev, data];
        });
      }
      
    } catch (error: any) {
      console.error('Failed to send message:', error);
      toast({
        title: t('chatSidebar', 'error', 'Error'),
        description: t('chatSidebar', 'failedSendMessage', 'Failed to send message'),
        variant: 'destructive'
      });
      // Restore the message on error
      setNewMessage(messageContent);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return '';
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 border-b">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          {t('chatSidebar', 'roomChat', 'Room Chat')}
          {messages.length > 0 && (
            <span className="text-xs text-gray-500">({messages.length})</span>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t('chatSidebar', 'noMessagesYet', 'No messages yet')}</p>
              <p className="text-xs mt-1">{t('chatSidebar', 'beFirstToSay', 'Be the first to say something!')}</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`p-3 rounded-lg ${
                  msg.user_id === user?.id 
                    ? 'bg-purple-100 ml-4' 
                    : 'bg-gray-50 mr-4'
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <span className={`font-medium text-sm ${
                    msg.user_id === user?.id ? 'text-purple-700' : 'text-gray-700'
                  }`}>
                    {msg.user_id === user?.id ? t('chatSidebar', 'you', 'You') : msg.user_name}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatTime(msg.created_at)}
                  </span>
                </div>
                <p className="text-sm mt-1 text-gray-800 break-words">{msg.content}</p>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Input Area */}
        <div className="border-t p-3">
          <div className="flex gap-2">
            <input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={t('chatSidebar', 'typeMessage', 'Type a message...')}
              onKeyPress={handleKeyPress}
              disabled={sending}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
              maxLength={500}
            />
            <Button 
              onClick={sendMessage} 
              size="sm" 
              disabled={!newMessage.trim() || sending}
              className="px-3"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          {newMessage.length > 400 && (
            <p className="text-xs text-gray-400 mt-1">
              {t('chatSidebar', 'charactersRemaining', '{count} characters remaining').replace('{count}', String(500 - newMessage.length))}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
