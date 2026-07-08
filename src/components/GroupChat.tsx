import React from 'react';
import { LiveChannelChat } from './LiveChannelChat';
import { Card } from './ui/card';
import { MessageCircle, AlertCircle } from 'lucide-react';

/**
 * GroupChat has been deprecated in favor of LiveChannelChat.
 * 
 * The old group chat system has been replaced with Live Channel chat which provides:
 * - Real-time messaging during broadcasts
 * - Message pinning by hosts
 * - System messages for broadcast events
 * 
 * This component now shows a deprecation notice.
 */

interface Props {
  groupId: string;
  isAdmin?: boolean;
}

export const GroupChat: React.FC<Props> = ({ groupId, isAdmin = false }) => {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <MessageCircle className="h-6 w-6 text-purple-600" />
        <h3 className="font-semibold text-lg">Group Chat</h3>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="text-amber-800 font-medium">Feature Updated</p>
            <p className="text-amber-700 text-sm mt-1">
              Group chat has been upgraded to Live Channel chat. 
              Create or follow a Live Channel to chat during broadcasts!
            </p>
          </div>
        </div>
      </div>

      <div className="text-center py-8 text-gray-500">
        <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>Chat is now available in Live Channels</p>
        <p className="text-sm mt-1">Go to the Live Channels tab to start chatting</p>
      </div>
    </Card>
  );
};

export default GroupChat;
