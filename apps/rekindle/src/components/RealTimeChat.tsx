import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from './ui/use-toast';
import { 
  Send, Image, Paperclip, Smile, MoreVertical, 
  Users, Plus, ArrowLeft, Phone, Video, Search,
  MessageCircle
} from 'lucide-react';

interface ChatRoom {
  id: string;
  name: string;
  type: string;
  description: string;
  image_url: string;
  is_active: boolean;
  created_at: string;
}

interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  user_name: string;
  user_avatar: string;
  message: string;
  message_type: string;
  file_url: string;
  created_at: string;
}

export const RealTimeChat: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadRooms();
  }, []);

  useEffect(() => {
    if (selectedRoom) {
      loadMessages(selectedRoom.id);
      subscribeToMessages(selectedRoom.id);
    }
    return () => {
      supabase.channel('chat-messages').unsubscribe();
    };
  }, [selectedRoom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadRooms = async () => {
    try {
      const { data, error } = await supabase
        .from('chat_rooms')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRooms(data || []);
    } catch (err) {
      console.error('Error loading rooms:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (roomId: string) => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('room_id', roomId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  };

  const subscribeToMessages = (roomId: string) => {
    supabase
      .channel('chat-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as ChatMessage]);
        }
      )
      .subscribe();
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedRoom || !user) return;

    setSending(true);
    try {
      const { error } = await supabase.from('chat_messages').insert({
        room_id: selectedRoom.id,
        user_id: user.id,
        user_name: profile?.full_name || 'Anonymous',
        user_avatar: profile?.avatar_url || '',
        message: newMessage.trim(),
        message_type: 'text',
        created_at: new Date().toISOString()
      });

      if (error) throw error;
      setNewMessage('');
    } catch (err: any) {
      toast({ title: t('realTimeChat', 'error', 'Error'), description: err.message, variant: 'destructive' });
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
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return t('realTimeChat', 'today', 'Today');
    } else if (date.toDateString() === yesterday.toDateString()) {
      return t('realTimeChat', 'yesterday', 'Yesterday');
    } else {
      return date.toLocaleDateString();
    }
  };

  const filteredRooms = rooms.filter(room =>
    room.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <Card className="h-[600px] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
      </Card>
    );
  }

  // Room List View
  if (!selectedRoom) {
    return (
      <Card className="h-[600px] flex flex-col">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-purple-600" />
              {t('realTimeChat', 'chatRooms', 'Chat Rooms')}
            </CardTitle>
            <Badge variant="secondary">{t('realTimeChat', 'roomsCount', '{count} rooms').replace('{count}', String(rooms.length))}</Badge>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t('realTimeChat', 'searchRooms', 'Search rooms...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden">
          <ScrollArea className="h-full">
            {filteredRooms.length === 0 ? (
              <div className="p-8 text-center">
                <MessageCircle className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">{t('realTimeChat', 'noRooms', 'No chat rooms available')}</p>
                <p className="text-sm text-gray-400">{t('realTimeChat', 'noRoomsHint', 'Check back later or ask admin to create one')}</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredRooms.map(room => (
                  <div
                    key={room.id}
                    className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedRoom(room)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={room.image_url} />
                        <AvatarFallback className="bg-purple-100 text-purple-600">
                          {room.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold truncate">{room.name}</h3>
                          <Badge variant="outline" className="text-xs capitalize">{room.type}</Badge>
                        </div>
                        <p className="text-sm text-gray-500 truncate">{room.description || t('realTimeChat', 'joinConversation', 'Join the conversation')}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  // Chat View
  return (
    <Card className="h-[600px] flex flex-col">
      {/* Chat Header */}
      <CardHeader className="border-b py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedRoom(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar className="h-10 w-10">
            <AvatarImage src={selectedRoom.image_url} />
            <AvatarFallback className="bg-purple-100 text-purple-600">
              {selectedRoom.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h3 className="font-semibold">{selectedRoom.name}</h3>
            <p className="text-xs text-gray-500 capitalize">{t('realTimeChat', 'typeChat', '{type} chat').replace('{type}', String(selectedRoom.type))}</p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon">
              <Phone className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Video className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Messages */}
      <CardContent className="flex-1 p-4 overflow-hidden">
        <ScrollArea className="h-full pr-4">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <MessageCircle className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">{t('realTimeChat', 'noMessages', 'No messages yet')}</p>
                <p className="text-sm text-gray-400">{t('realTimeChat', 'beFirst', 'Be the first to say something!')}</p>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isOwn = msg.user_id === user?.id;
                const showDate = index === 0 || 
                  formatDate(messages[index - 1].created_at) !== formatDate(msg.created_at);

                return (
                  <React.Fragment key={msg.id}>
                    {showDate && (
                      <div className="flex justify-center my-4">
                        <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                          {formatDate(msg.created_at)}
                        </span>
                      </div>
                    )}
                    <div className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                      {!isOwn && (
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarImage src={msg.user_avatar} />
                          <AvatarFallback className="text-xs">
                            {msg.user_name?.charAt(0) || '?'}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                        {!isOwn && (
                          <p className="text-xs text-gray-500 mb-1 ml-1">{msg.user_name}</p>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-2 ${
                            isOwn
                              ? 'bg-purple-600 text-white rounded-br-md'
                              : 'bg-gray-100 text-gray-900 rounded-bl-md'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                        </div>
                        <p className={`text-xs text-gray-400 mt-1 ${isOwn ? 'text-right mr-1' : 'ml-1'}`}>
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </CardContent>

      {/* Message Input */}
      <div className="border-t p-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-gray-500">
            <Plus className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-500">
            <Image className="h-5 w-5" />
          </Button>
          <Input
            placeholder={t('realTimeChat', 'typeMessage', 'Type a message...')}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
          />
          <Button variant="ghost" size="icon" className="text-gray-500">
            <Smile className="h-5 w-5" />
          </Button>
          <Button 
            onClick={sendMessage} 
            disabled={!newMessage.trim() || sending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default RealTimeChat;
