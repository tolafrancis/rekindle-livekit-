import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@rekindle/supabase';
import { toast } from 'sonner';

export type QuestionStatus = 'pending' | 'approved' | 'rejected' | 'answered';

export interface WebinarQuestion {
  id: string;
  webinar_id: string;
  user_id: string;
  user_name: string | null;
  question: string;
  status: QuestionStatus;
  is_pinned: boolean;
  upvote_count: number;
  answered_at: string | null;
  created_at: string;
}

/** Q&A moderation queue — mirrors useWebinarSpeakerRequests.ts's realtime +
 *  polling-fallback shape. Pending/rejected rows are only visible to their
 *  asker and the host (RLS-enforced), so `questions` here naturally reflects
 *  "everything I'm allowed to see" per viewer. */
export function useWebinarQuestions(webinarId: string, userId: string, userName: string, isHost: boolean) {
  const [questions, setQuestions] = useState<WebinarQuestion[]>([]);
  const [myVoteIds, setMyVoteIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('webinar_questions')
        .select('*')
        .eq('webinar_id', webinarId)
        .order('is_pinned', { ascending: false })
        .order('upvote_count', { ascending: false })
        .order('created_at', { ascending: true });
      setQuestions((data ?? []) as WebinarQuestion[]);
    } catch {
      setQuestions([]);
    }
  }, [webinarId]);

  const loadMyVotes = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await supabase.from('webinar_question_votes').select('question_id').eq('user_id', userId);
      setMyVoteIds(new Set((data ?? []).map((v: { question_id: string }) => v.question_id)));
    } catch {
      setMyVoteIds(new Set());
    }
  }, [userId]);

  useEffect(() => {
    if (!webinarId) return;
    load();
    loadMyVotes();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`webinar-questions-${webinarId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'webinar_questions', filter: `webinar_id=eq.${webinarId}` },
          load)
        .subscribe();
    } catch {
      channel = null;
    }

    const poll = setInterval(load, 5000);
    return () => {
      clearInterval(poll);
      try { if (channel) supabase.removeChannel(channel); } catch { /* noop */ }
    };
  }, [webinarId, load, loadMyVotes]);

  const askQuestion = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const { error } = await supabase.from('webinar_questions').insert({
      webinar_id: webinarId, user_id: userId, user_name: userName, question: trimmed,
    });
    if (error) {
      console.error('[useWebinarQuestions] askQuestion failed:', error.message);
      toast.error(`Couldn't send your question: ${error.message}`);
    } else load();
  }, [webinarId, userId, userName, load]);

  const withdrawQuestion = useCallback(async (id: string) => {
    const { error } = await supabase.from('webinar_questions').delete().eq('id', id);
    if (error) console.error('[useWebinarQuestions] withdrawQuestion failed:', error.message);
    else load();
  }, [load]);

  const toggleUpvote = useCallback(async (id: string) => {
    if (myVoteIds.has(id)) {
      await supabase.from('webinar_question_votes').delete().eq('question_id', id).eq('user_id', userId);
    } else {
      await supabase.from('webinar_question_votes').insert({ question_id: id, user_id: userId });
    }
    await loadMyVotes();
    load();
  }, [myVoteIds, userId, loadMyVotes, load]);

  const setStatus = useCallback(async (id: string, status: QuestionStatus) => {
    if (!isHost) return;
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'answered') patch.answered_at = new Date().toISOString();
    const { error } = await supabase.from('webinar_questions').update(patch).eq('id', id);
    if (error) console.error('[useWebinarQuestions] setStatus failed:', error.message);
    else load();
  }, [isHost, load]);

  const togglePin = useCallback(async (id: string, pinned: boolean) => {
    if (!isHost) return;
    const { error } = await supabase.from('webinar_questions').update({ is_pinned: !pinned }).eq('id', id);
    if (error) console.error('[useWebinarQuestions] togglePin failed:', error.message);
    else load();
  }, [isHost, load]);

  const visibleQuestions = questions.filter((q) => q.status === 'approved' || q.status === 'answered');
  const pendingQuestions = questions.filter((q) => q.status === 'pending');
  const myQuestions = questions.filter((q) => q.user_id === userId);

  return {
    questions, visibleQuestions, pendingQuestions, myQuestions, myVoteIds,
    askQuestion, withdrawQuestion, toggleUpvote,
    approve: (id: string) => setStatus(id, 'approved'),
    reject: (id: string) => setStatus(id, 'rejected'),
    markAnswered: (id: string) => setStatus(id, 'answered'),
    togglePin,
  };
}
