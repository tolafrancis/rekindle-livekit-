import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Send, MessageCircle, X } from 'lucide-react';
import { useMeetingChat } from '../useMeetingChat';

interface MeetingChatPanelProps {
  meetingId: string;
  userId: string;
  userName: string;
  isGuest?: boolean;
  onClose?: () => void;
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const t = text;
    setText('');
    await sendMessage(t);
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-900 text-white border-l border-gray-800">
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 ? (
          <p className="text-xs text-gray-500">No messages yet. Say hello!</p>
        ) : (
          messages.map(m => (
            <div key={m.id} className="text-sm leading-snug">
              <span className={`font-medium ${m.user_id === userId ? 'text-purple-300' : 'text-gray-300'}`}>
                {m.user_name || 'Guest'}:{' '}
              </span>
              <span className="text-gray-100 break-words">{m.content}</span>
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
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder="Type a message"
            className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
          />
          <Button size="icon" className="bg-purple-600 hover:bg-purple-700 shrink-0" onClick={send}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
