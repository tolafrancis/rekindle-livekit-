import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Send, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ContentSafetyMenu } from '@rekindle/features/components/ContentSafetyMenu';
import { useModeration } from '@rekindle/features/ModerationContext';

export interface Comment {
  id: string;
  /** Author's user id. Only on comments written since report/block shipped
   *  (2026-10); older comments have just the author's name. */
  user_id?: string;
  author: string;
  avatar: string;
  content: string;
  timestamp: string;
}

/** Which table the comments live in (as a jsonb array on the post row). */
export type CommentParentType = 'community_revelations' | 'app_testimonies';

interface CommentSectionProps {
  comments: Comment[];
  onAddComment: (content: string) => void;
  onDeleteComment: (id: string) => void;
  parentType: CommentParentType;
  parentId: string;
}

const COMMENT_CONTENT_TYPE = {
  community_revelations: 'community_revelation_comments',
  app_testimonies: 'app_testimony_comments',
} as const;

export const CommentSection: React.FC<CommentSectionProps> = ({ comments, onAddComment, onDeleteComment, parentType, parentId }) => {
  const { profile, user } = useAuth();
  const { filterBlocked } = useModeration();
  const [newComment, setNewComment] = useState('');

  const visible = filterBlocked(comments, (c) => c.user_id);

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    onAddComment(newComment);
    setNewComment('');
  };

  // Older comments carry no user id, so fall back to the name match they always used.
  const isMine = (c: Comment) => (c.user_id ? c.user_id === user?.id : profile?.full_name === c.author);

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <h5 className="text-sm font-semibold text-gray-700 mb-3">Comments ({visible.length})</h5>
      <div className="space-y-3 max-h-60 overflow-y-auto mb-3">
        {visible.map(comment => (
          <div key={comment.id} className="flex gap-2 p-2 bg-gray-50 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {comment.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{comment.author}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{comment.timestamp}</span>
                  {isMine(comment) ? (
                    <button onClick={() => onDeleteComment(comment.id)} className="text-gray-400 hover:text-red-500">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : (
                    <ContentSafetyMenu
                      contentType={COMMENT_CONTENT_TYPE[parentType]}
                      contentId={`${parentId}:${comment.id}`}
                      authorId={comment.user_id ?? null}
                      authorName={comment.author}
                      className="h-5 w-5"
                    />
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-600 break-words">{comment.content}</p>
            </div>
          </div>
        ))}
        {visible.length === 0 && <p className="text-sm text-gray-500 text-center py-2">No comments yet. Be the first!</p>}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Write a comment..." value={newComment} onChange={e => setNewComment(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSubmit()} className="flex-1" />
        <Button size="sm" onClick={handleSubmit} disabled={!newComment.trim()}><Send className="h-4 w-4" /></Button>
      </div>
    </div>
  );
};
