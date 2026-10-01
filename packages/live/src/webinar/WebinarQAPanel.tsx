import React, { useState } from 'react';
import { Button } from '@rekindle/ui/button';
import { Textarea } from '@rekindle/ui/textarea';
import { Badge } from '@rekindle/ui/badge';
import { ThumbsUp, Pin, CheckCircle2, X, Send } from 'lucide-react';
import { useWebinarQuestions } from './useWebinarQuestions';

interface WebinarQAPanelProps {
  webinarId: string;
  userId: string;
  userName: string;
}

/** Attendee-facing Q&A: ask a question, browse the approved/answered queue,
 *  upvote. Pending/rejected questions only render for their own asker (RLS
 *  already limits what useWebinarQuestions loads). */
export function WebinarQAPanel({ webinarId, userId, userName }: WebinarQAPanelProps) {
  const qa = useWebinarQuestions(webinarId, userId, userName, false);
  const [draft, setDraft] = useState('');

  const handleAsk = () => {
    if (!draft.trim()) return;
    qa.askQuestion(draft);
    setDraft('');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a question…"
          rows={2}
          maxLength={500}
          className="resize-none text-sm"
        />
        <Button size="sm" className="w-full" onClick={handleAsk} disabled={!draft.trim()}>
          <Send className="h-3.5 w-3.5 mr-1.5" /> Ask
        </Button>
      </div>

      {qa.myQuestions.some((q) => q.status === 'pending') && (
        <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-b">
          Your question is awaiting the host's review.
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {qa.visibleQuestions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No questions yet — be the first to ask.</p>
        ) : (
          qa.visibleQuestions.map((q) => (
            <div key={q.id} className="rounded-md border p-2.5 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm flex-1">{q.question}</p>
                {q.is_pinned && <Pin className="h-3.5 w-3.5 text-purple-600 shrink-0 mt-0.5" />}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{q.user_name || 'Attendee'}</span>
                <div className="flex items-center gap-2">
                  {q.status === 'answered' && (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Answered
                    </Badge>
                  )}
                  <button
                    onClick={() => qa.toggleUpvote(q.id)}
                    className={`flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${
                      qa.myVoteIds.has(q.id) ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    <ThumbsUp className="h-3 w-3" /> {q.upvote_count}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        {qa.myQuestions.filter((q) => q.status === 'pending').map((q) => (
          <div key={q.id} className="rounded-md border border-dashed p-2.5 space-y-1.5 opacity-70">
            <p className="text-sm">{q.question}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Pending review</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => qa.withdrawQuestion(q.id)} title="Withdraw">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default WebinarQAPanel;
