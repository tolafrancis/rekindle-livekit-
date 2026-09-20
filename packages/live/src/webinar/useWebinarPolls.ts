import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@rekindle/supabase';
import { toast } from 'sonner';

export type PollStatus = 'draft' | 'open' | 'closed';

export interface WebinarPollOption {
  id: string;
  poll_id: string;
  option_text: string;
  position: number;
  vote_count: number;
}

export interface WebinarPoll {
  id: string;
  webinar_id: string;
  created_by: string;
  question: string;
  status: PollStatus;
  allow_multiple_choice: boolean;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
  options: WebinarPollOption[];
}

/** Polls — mirrors useWebinarSpeakerRequests.ts's shape. All vote writes go
 *  through the cast_poll_vote() RPC (see migration 0357) rather than direct
 *  inserts, since webinar_poll_votes has no client insert policy — the RPC is
 *  what atomically enforces "poll is open" + single-vs-multiple-choice. */
export function useWebinarPolls(webinarId: string, userId: string, isHost: boolean) {
  const [polls, setPolls] = useState<WebinarPoll[]>([]);
  const [myVotes, setMyVotes] = useState<Map<string, Set<string>>>(new Map());

  const load = useCallback(async () => {
    try {
      const { data: pollRows } = await supabase
        .from('webinar_polls')
        .select('*')
        .eq('webinar_id', webinarId)
        .order('created_at', { ascending: true });
      const list = (pollRows ?? []) as Omit<WebinarPoll, 'options'>[];
      if (list.length === 0) { setPolls([]); return; }

      const { data: optionRows } = await supabase
        .from('webinar_poll_options')
        .select('*')
        .in('poll_id', list.map((p) => p.id))
        .order('position', { ascending: true });
      const options = (optionRows ?? []) as WebinarPollOption[];

      setPolls(list.map((p) => ({ ...p, options: options.filter((o) => o.poll_id === p.id) })));
    } catch {
      setPolls([]);
    }
  }, [webinarId]);

  const loadMyVotes = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await supabase.from('webinar_poll_votes').select('poll_id, option_id').eq('user_id', userId);
      const next = new Map<string, Set<string>>();
      for (const v of (data ?? []) as { poll_id: string; option_id: string }[]) {
        if (!next.has(v.poll_id)) next.set(v.poll_id, new Set());
        next.get(v.poll_id)!.add(v.option_id);
      }
      setMyVotes(next);
    } catch {
      setMyVotes(new Map());
    }
  }, [userId]);

  useEffect(() => {
    if (!webinarId) return;
    load();
    loadMyVotes();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`webinar-polls-${webinarId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'webinar_polls', filter: `webinar_id=eq.${webinarId}` },
          () => { load(); loadMyVotes(); })
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'webinar_poll_options' },
          load)
        .subscribe();
    } catch {
      channel = null;
    }

    const poll = setInterval(() => { load(); loadMyVotes(); }, 5000);
    return () => {
      clearInterval(poll);
      try { if (channel) supabase.removeChannel(channel); } catch { /* noop */ }
    };
  }, [webinarId, load, loadMyVotes]);

  const createPoll = useCallback(async (question: string, optionTexts: string[], allowMultipleChoice: boolean) => {
    if (!isHost) return;
    const q = question.trim();
    const opts = optionTexts.map((o) => o.trim()).filter(Boolean);
    if (!q || opts.length < 2) { toast.error('A poll needs a question and at least two options'); return; }

    const { data: poll, error } = await supabase
      .from('webinar_polls')
      .insert({ webinar_id: webinarId, created_by: userId, question: q, allow_multiple_choice: allowMultipleChoice })
      .select().single();
    if (error || !poll) {
      console.error('[useWebinarPolls] createPoll failed:', error?.message);
      toast.error(`Couldn't create the poll: ${error?.message ?? 'unknown error'}`);
      return;
    }
    const { error: optErr } = await supabase.from('webinar_poll_options').insert(
      opts.map((option_text, position) => ({ poll_id: poll.id, option_text, position })),
    );
    if (optErr) console.error('[useWebinarPolls] createPoll options failed:', optErr.message);
    load();
  }, [isHost, webinarId, userId, load]);

  const openPoll = useCallback(async (id: string) => {
    if (!isHost) return;
    const { error } = await supabase.from('webinar_polls').update({ status: 'open', opened_at: new Date().toISOString() }).eq('id', id);
    if (error) console.error('[useWebinarPolls] openPoll failed:', error.message);
    else load();
  }, [isHost, load]);

  const closePoll = useCallback(async (id: string) => {
    if (!isHost) return;
    const { error } = await supabase.from('webinar_polls').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', id);
    if (error) console.error('[useWebinarPolls] closePoll failed:', error.message);
    else load();
  }, [isHost, load]);

  const vote = useCallback(async (pollId: string, optionIds: string[]) => {
    const { error } = await supabase.rpc('cast_poll_vote', { p_poll_id: pollId, p_option_ids: optionIds });
    if (error) {
      console.error('[useWebinarPolls] vote failed:', error.message);
      toast.error(`Couldn't submit your vote: ${error.message}`);
      return false;
    }
    await loadMyVotes();
    load();
    return true;
  }, [loadMyVotes, load]);

  const activePoll = polls.find((p) => p.status === 'open') ?? null;
  const pastPolls = polls.filter((p) => p.status === 'closed');

  return { polls, activePoll, pastPolls, myVotes, createPoll, openPoll, closePoll, vote };
}
