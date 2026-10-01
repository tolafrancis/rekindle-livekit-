import React, { useState, useEffect } from 'react';
import { Button } from '@rekindle/ui/button';
import { Checkbox } from '@rekindle/ui/checkbox';
import { BarChart3 } from 'lucide-react';
import { useWebinarPolls, type WebinarPoll } from './useWebinarPolls';

interface WebinarPollPanelProps {
  webinarId: string;
  userId: string;
}

function ResultBars({ poll }: { poll: WebinarPoll }) {
  const total = poll.options.reduce((sum, o) => sum + o.vote_count, 0);
  return (
    <div className="space-y-2">
      {poll.options.map((o) => {
        const pct = total > 0 ? Math.round((o.vote_count / total) * 100) : 0;
        return (
          <div key={o.id} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span>{o.option_text}</span>
              <span className="text-gray-400">{pct}% ({o.vote_count})</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-purple-600" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PollCard({ poll, userId, vote, myVotes, interactive }: {
  poll: WebinarPoll; userId: string; vote: (pollId: string, optionIds: string[]) => Promise<boolean>;
  myVotes: Map<string, Set<string>>; interactive: boolean;
}) {
  const myVoteSet = myVotes.get(poll.id) ?? new Set<string>();
  const hasVoted = myVoteSet.size > 0;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { setSelected(new Set()); }, [poll.id]);

  const showResults = !interactive || hasVoted;

  const toggleOption = (optionId: string) => {
    setSelected((prev) => {
      const next = new Set(poll.allow_multiple_choice ? prev : []);
      if (prev.has(optionId) && poll.allow_multiple_choice) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <p className="text-sm font-medium">{poll.question}</p>
      {showResults ? (
        <ResultBars poll={poll} />
      ) : (
        <div className="space-y-2">
          {poll.options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggleOption(o.id)} />
              {o.option_text}
            </label>
          ))}
          <Button
            size="sm"
            className="w-full"
            disabled={selected.size === 0}
            onClick={() => vote(poll.id, Array.from(selected))}
          >
            Vote
          </Button>
        </div>
      )}
      {!interactive && <p className="text-xs text-gray-400">Poll closed</p>}
    </div>
  );
}

/** Attendee-facing polls: the active poll as radio/checkbox (results hidden
 *  until you vote, to avoid biasing later voters), plus past closed polls
 *  below it showing final results. */
export function WebinarPollPanel({ webinarId, userId }: WebinarPollPanelProps) {
  const { activePoll, pastPolls, myVotes, vote } = useWebinarPolls(webinarId, userId, false);

  if (!activePoll && pastPolls.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-sm text-gray-400 gap-2 p-6 text-center">
        <BarChart3 className="h-5 w-5" />
        No polls yet — the host hasn't launched one.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {activePoll && <PollCard poll={activePoll} userId={userId} vote={vote} myVotes={myVotes} interactive />}
      {pastPolls.map((p) => (
        <PollCard key={p.id} poll={p} userId={userId} vote={vote} myVotes={myVotes} interactive={false} />
      ))}
    </div>
  );
}

export default WebinarPollPanel;
