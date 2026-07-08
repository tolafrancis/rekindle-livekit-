import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Send, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export interface Comment {
  id: string;
  author: string;
  avatar: string;
  content: string;
  timestamp: string;
}

interface CommentSectionProps {
  comments: Comment[];
  onAddComment: (content: string) => void;
  onDeleteComment: (id: string) => void;
}

export const CommentSection: React.FC<CommentSectionProps> = ({ comments, onAddComment, onDeleteComment }) => {
  const { profile } = useAuth();
  const [newComment, setNewComment] = useState('');

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    onAddComment(newComment);
    setNewComment('');
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <h5 className="text-sm font-semibold text-gray-700 mb-3">Comments ({comments.length})</h5>
      <div className="space-y-3 max-h-60 overflow-y-auto mb-3">
        {comments.map(comment => (
          <div key={comment.id} className="flex gap-2 p-2 bg-gray-50 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {comment.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{comment.author}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{comment.timestamp}</span>
                  {profile?.full_name === comment.author && (
                    <button onClick={() => onDeleteComment(comment.id)} className="text-gray-400 hover:text-red-500">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-600 break-words">{comment.content}</p>
            </div>
          </div>
        ))}
        {comments.length === 0 && <p className="text-sm text-gray-500 text-center py-2">No comments yet. Be the first!</p>}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Write a comment..." value={newComment} onChange={e => setNewComment(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSubmit()} className="flex-1" />
        <Button size="sm" onClick={handleSubmit} disabled={!newComment.trim()}><Send className="h-4 w-4" /></Button>
      </div>
    </div>
  );
};
