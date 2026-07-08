import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { X, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { useLanguage } from '@/contexts/LanguageContext';

interface ChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  user_name: string;
  message: string;
  is_host: boolean;
  created_at: string;
}

interface CounsellingChatSidebarProps {
  sessionId: string;
  userId: string;
  userName: string;
  isHost: boolean;
  onClose: () => void;
}

export const CounsellingChatSidebar: React.FC<CounsellingChatSidebarProps> = ({
  sessionId,
  userId,
  userName,
  isHost,
  onClose
}) => {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load existing messages
  useEffect(() => {
    loadMessages();
    
    // Subscribe to new messages
    const channel = supabase
      .channel(`session-chat-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'counselling_session_messages',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages(prev => [...prev, newMsg]);
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('counselling_session_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Failed to load messages:', error);
      toast({
        title: t('counsellingChatSidebar', 'error', 'Error'),
        description: t('counsellingChatSidebar', 'failedLoadMessages', 'Failed to load chat messages'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from('counselling_session_messages')
        .insert({
          session_id: sessionId,
          user_id: userId,
          user_name: userName,
          message: newMessage.trim(),
          is_host: isHost,
          created_at: new Date().toISOString()
        });

      if (error) throw error;
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({
        title: t('counsellingChatSidebar', 'error', 'Error'),
        description: t('counsellingChatSidebar', 'failedSendMessage', 'Failed to send message'),
        variant: 'destructive'
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="w-96 h-full flex flex-col bg-gray-800 border-l border-gray-700">
      <CardHeader className="border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-lg">{t('counsellingChatSidebar', 'sessionChat', 'Session Chat')}</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 flex flex-col">
        {/* Messages area */}
        <ScrollArea className="flex-1 p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400 text-center">
                {t('counsellingChatSidebar', 'noMessagesYet', 'No messages yet.')}<br />
                {t('counsellingChatSidebar', 'startConversation', 'Start the conversation!')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => {
                const isOwn = message.user_id === userId;
                const time = formatDistanceToNow(new Date(message.created_at), { addSuffix: true });

                return (
                  <div
                    key={message.id}
                    className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-400">
                        {message.user_name}
                        {message.is_host && (
                          <Badge className="ml-1 bg-amber-500/20 text-amber-400 text-xs">
                            {t('counsellingChatSidebar', 'host', 'Host')}
                          </Badge>
                        )}
                      </span>
                    </div>
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        isOwn
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-700 text-white'
                      }`}
                    >
                      <p className="text-sm break-words">{message.message}</p>
                      <p className="text-xs opacity-70 mt-1">{time}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Message input */}
        <form onSubmit={sendMessage} className="border-t border-gray-700 p-4 flex-shrink-0">
          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={t('counsellingChatSidebar', 'typeMessage', 'Type a message...')}
              disabled={sending}
              className="flex-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
              maxLength={500}
            />
            <Button
              type="submit"
              disabled={!newMessage.trim() || sending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {t('counsellingChatSidebar', 'charCount', '{count}/500 characters').replace('{count}', String(newMessage.length))}
          </p>
        </form>
      </CardContent>
    </Card>
  );
};

export default CounsellingChatSidebar;