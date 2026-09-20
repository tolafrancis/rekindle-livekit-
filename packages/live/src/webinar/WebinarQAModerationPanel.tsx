import React from 'react';
import { Button } from '@rekindle/ui/button';
import { Check, X, Pin, PinOff, CheckCircle2 } from 'lucide-react';
import { useWebinarQuestions } from './useWebinarQuestions';

interface WebinarQAModerationPanelProps {
  webinarId: string;
  userId: string;
  userName: string;
}

/** Host-facing Q&A moderation: pending queue (approve/reject), approved/
 *  answered list (pin/mark-answered). Mounted inside WebinarStage's popover. */
export function WebinarQAModerationPanel({ webinarId, userId, userName }: WebinarQAModerationPanelProps) {
  const qa = useWebinarQuestions(webinarId, userId, userName, true);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-gray-300 mb-1">Pending ({qa.pendingQuestions.length})</p>
        {qa.pendingQuestions.length === 0 ? (
          <p className="text-xs text-gray-500">No questions waiting for review.</p>
        ) : (
          <div className="space-y-1.5">
            {qa.pendingQuestions.map((q) => (
              <div key={q.id} className="bg-white/5 rounded p-2 space-y-1">
                <p className="text-sm truncate">{q.question}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{q.user_name || 'Attendee'}</span>
                  <div className="flex gap-1">
                    <Button size="icon" className="h-6 w-6 bg-green-600 hover:bg-green-700" onClick={() => qa.approve(q.id)} title="Approve">
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400 hover:text-white" onClick={() => qa.reject(q.id)} title="Reject">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-gray-300 mb-1">Approved</p>
        {qa.visibleQuestions.length === 0 ? (
          <p className="text-xs text-gray-500">Nothing approved yet.</p>
        ) : (
          <div className="space-y-1.5">
            {qa.visibleQuestions.map((q) => (
              <div key={q.id} className="bg-white/5 rounded p-2 space-y-1">
                <p className="text-sm truncate">{q.question}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{q.upvote_count} upvotes</span>
                  <div className="flex gap-1">
                    <Button
                      size="icon" variant="ghost" className="h-6 w-6 text-gray-400 hover:text-white"
                      onClick={() => qa.togglePin(q.id, q.is_pinned)} title={q.is_pinned ? 'Unpin' : 'Pin'}
                    >
                      {q.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </Button>
                    {q.status !== 'answered' && (
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400 hover:text-white" onClick={() => qa.markAnswered(q.id)} title="Mark answered">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default WebinarQAModerationPanel;
