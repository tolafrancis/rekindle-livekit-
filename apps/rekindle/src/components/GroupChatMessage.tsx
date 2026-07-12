import React from 'react';
import { GroupMessage } from '@rekindle/types/prayerTypes';
import { Heart, Pin, Trash2 } from 'lucide-react';
import { Button } from './ui/button';

/**
 * GroupChatMessage has been deprecated.
 * 
 * This component is kept for backward compatibility but the group chat
 * system has been replaced with Live Channel chat.
 */

interface Props {
  message: GroupMessage;
  isOwn: boolean;
  isAdmin: boolean;
  onAmen: () => void;
  onPin: () => void;
  onDelete: () => void;
  hasAmened: boolean;
}

export const GroupChatMessage: React.FC<Props> = ({
  message,
  isOwn,
  isAdmin,
  onAmen,
  onPin,
  onDelete,
  hasAmened
}) => {
  const getMessageTypeStyle = () => {
    switch (message.message_type) {
      case 'prayer_request':
        return 'bg-purple-50 border-l-4 border-purple-500';
      case 'testimony':
        return 'bg-green-50 border-l-4 border-green-500';
      case 'scripture':
        return 'bg-blue-50 border-l-4 border-blue-500';
      case 'announcement':
        return 'bg-amber-50 border-l-4 border-amber-500';
      default:
        return isOwn ? 'bg-purple-100' : 'bg-gray-100';
    }
  };

  return (
    <div className={`group rounded-lg p-3 ${getMessageTypeStyle()}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">{message.user_name}</span>
            <span className="text-xs text-gray-500">
              {new Date(message.created_at).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </span>
            {message.is_pinned && (
              <Pin className="h-3 w-3 text-amber-500" />
            )}
          </div>
          <p className="text-sm text-gray-700">{message.content}</p>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onAmen}
          >
            <Heart className={`h-4 w-4 ${hasAmened ? 'fill-red-500 text-red-500' : ''}`} />
          </Button>
          
          {isAdmin && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onPin}
              >
                <Pin className={`h-4 w-4 ${message.is_pinned ? 'text-amber-500' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-500"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {message.amen_count > 0 && (
        <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
          <Heart className="h-3 w-3 fill-red-500 text-red-500" />
          <span>{message.amen_count} Amen{message.amen_count > 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
};

export default GroupChatMessage;
