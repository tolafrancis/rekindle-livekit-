import React, { useState } from 'react';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Switch } from '@rekindle/ui/switch';
import { Plus, X, Play, Square } from 'lucide-react';
import type { useWebinarPolls } from './useWebinarPolls';

interface WebinarPollHostPanelProps {
  /** Lifted from WebinarStage (2026-09-22), same reasoning as
   *  WebinarQAModerationPanel's qa prop — WebinarStage needs its own
   *  instance for the control bar's Polls button badge (new-votes count),
   *  which has to exist whether or not this panel is currently mounted. */
  polls: ReturnType<typeof useWebinarPolls>;
}

/** Host-facing polls: create-poll form + open/close controls + live tallies.
 *  Mounted inside WebinarStage's popover. */
export function WebinarPollHostPanel({ polls: pollsState }: WebinarPollHostPanelProps) {
  const { polls, activePoll, createPoll, openPoll, closePoll } = pollsState;
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const draftPolls = polls.filter((p) => p.status === 'draft');

  const addOption = () => setOptions((o) => [...o, '']);
  const updateOption = (i: number, value: string) => setOptions((o) => o.map((v, idx) => (idx === i ? value : v)));
  const removeOption = (i: number) => setOptions((o) => o.filter((_, idx) => idx !== i));

  const handleCreate = async () => {
    await createPoll(question, options, multi);
    setQuestion('');
    setOptions(['', '']);
    setMulti(false);
    setShowForm(false);
  };

  return (
    <div className="space-y-3">
      {activePoll && (
        <div>
          <p className="text-xs font-medium text-gray-300 mb-1">Live now</p>
          <div className="bg-white/5 rounded p-2 space-y-1.5">
            <p className="text-sm">{activePoll.question}</p>
            {activePoll.options.map((o) => (
              <div key={o.id} className="flex items-center justify-between text-xs text-gray-400">
                <span>{o.option_text}</span><span>{o.vote_count}</span>
              </div>
            ))}
            <Button size="sm" variant="ghost" className="w-full text-gray-300 hover:text-white" onClick={() => closePoll(activePoll.id)}>
              <Square className="h-3.5 w-3.5 mr-1.5" /> Close poll
            </Button>
          </div>
        </div>
      )}

      {draftPolls.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-300 mb-1">Drafts</p>
          <div className="space-y-1.5">
            {draftPolls.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-white/5 rounded p-2">
                <span className="text-sm truncate">{p.question}</span>
                <Button size="sm" className="h-6 px-2 bg-purple-600 hover:bg-purple-700" onClick={() => openPoll(p.id)} disabled={!!activePoll}>
                  <Play className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm ? (
        <div className="space-y-2 bg-white/5 rounded p-2">
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Poll question" className="h-8 text-sm" />
          {options.map((opt, i) => (
            <div key={i} className="flex gap-1">
              <Input value={opt} onChange={(e) => updateOption(i, e.target.value)} placeholder={`Option ${i + 1}`} className="h-8 text-sm" />
              {options.length > 2 && (
                <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" onClick={() => removeOption(i)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
          <Button size="sm" variant="ghost" className="text-gray-300 hover:text-white" onClick={addOption}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add option
          </Button>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">Allow multiple choices</span>
            <Switch checked={multi} onCheckedChange={setMulti} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="flex-1 text-gray-300" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" className="flex-1 bg-purple-600 hover:bg-purple-700" onClick={handleCreate}>Save</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="w-full text-gray-300 hover:text-white" onClick={() => setShowForm(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> New poll
        </Button>
      )}
    </div>
  );
}

export default WebinarPollHostPanel;
