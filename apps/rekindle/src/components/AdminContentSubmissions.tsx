import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Check, X, MessageSquareWarning, Loader2, Copy } from 'lucide-react';

interface DayEntry {
  day: number;
  title: string;
  subtitle: string | null;
  scripture_reference: string | null;
  scripture_version: string;
  introduction: string | null;
  main_content: string;
  reflection_questions: string[];
  guided_prayer: string | null;
  action_steps: string[];
  additional_thoughts: string | null;
  prayer_focus: string | null;
  prayer_points: string[];
}

interface Submission {
  id: string;
  content_type: 'book' | 'daily_devotional' | 'devotional_series' | 'prayer_series';
  title: string;
  author_name: string;
  author_email: string;
  category: string | null;
  description: string | null;
  key_takeaways: string[];
  days: DayEntry[];
  status: 'pending' | 'approved' | 'changes_requested' | 'rejected';
  admin_notes: string | null;
  published_table: 'book_summaries' | 'devotional_series' | 'prayer_series' | null;
  published_id: string | null;
  created_at: string;
}

const TYPE_LABELS: Record<Submission['content_type'], string> = {
  book: 'Book Summary',
  daily_devotional: 'Daily Devotional',
  devotional_series: 'Devotional Series',
  prayer_series: 'Prayer Library Series',
};

const STATUS_BADGE: Record<Submission['status'], { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pending', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'default' },
  changes_requested: { label: 'Changes requested', variant: 'outline' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

const SUBMIT_LINK = `${typeof window !== 'undefined' ? window.location.origin : ''}/write-for-us`;

/**
 * Publishes an approved submission into the real content it maps to —
 * book_summaries for a Book, or a devotional_series/devotional_entries
 * (Daily Devotional and Devotional Series alike — a daily devotional is
 * just a one-day series) or prayer_series/prayer_series_days pair for the
 * others. Field names/tables verified directly against the live schema
 * (AdminDevotionalLibraryManager.tsx / AdminPrayerLibrary.tsx /
 * AdminBookManager.tsx use the exact same tables). Throws on failure —
 * the caller keeps the submission's status unchanged so the admin can
 * retry rather than silently losing the "it's approved" state.
 */
async function publishSubmission(s: Submission): Promise<{ table: Submission['published_table']; id: string }> {
  if (s.content_type === 'book') {
    const { data, error } = await supabase.from('book_summaries').insert({
      title: s.title,
      author: s.author_name,
      category: s.category,
      summary: s.description,
      key_takeaways: s.key_takeaways,
      is_published: true,
    }).select('id').single();
    if (error) throw error;
    return { table: 'book_summaries', id: data.id };
  }

  if (s.content_type === 'daily_devotional' || s.content_type === 'devotional_series') {
    const { data: series, error: seriesErr } = await supabase.from('devotional_series').insert({
      title: s.title,
      description: s.description,
      author: s.author_name,
      total_days: s.days.length,
      is_published: true,
    }).select('id').single();
    if (seriesErr) throw seriesErr;
    const { error: entriesErr } = await supabase.from('devotional_entries').insert(s.days.map((d) => ({
      series_id: series.id,
      day_number: d.day,
      title: d.title,
      subtitle: d.subtitle,
      scripture_reference: d.scripture_reference,
      scripture_version: d.scripture_version,
      introduction: d.introduction,
      content: d.main_content, // legacy NOT NULL column, kept in sync with main_content
      main_content: d.main_content,
      reflection_questions: d.reflection_questions,
      guided_prayer: d.guided_prayer,
      action_steps: d.action_steps,
      additional_thoughts: d.additional_thoughts,
      is_published: true,
    })));
    if (entriesErr) throw entriesErr;
    return { table: 'devotional_series', id: series.id };
  }

  // prayer_series
  const { data: series, error: seriesErr } = await supabase.from('prayer_series').insert({
    title: s.title,
    description: s.description,
    author: s.author_name,
    total_days: s.days.length,
    is_published: true,
  }).select('id').single();
  if (seriesErr) throw seriesErr;
  const { error: daysErr } = await supabase.from('prayer_series_days').insert(s.days.map((d) => ({
    series_id: series.id,
    day_number: d.day,
    title: d.title,
    prayer_text: d.main_content,
    scripture_reference: d.scripture_reference,
    prayer_focus: d.prayer_focus,
    prayer_points: d.prayer_points,
    is_published: true,
  })));
  if (daysErr) throw daysErr;
  return { table: 'prayer_series', id: series.id };
}

/**
 * Review queue for public "Write for Us" submissions (SubmitContentPage.tsx
 * -> content_submissions, migrations 0378-0380). Approve publishes the
 * submission straight into the live content (see publishSubmission above);
 * Recommend changes / Reject just update status with a note for the author.
 */
export const AdminContentSubmissions: React.FC = () => {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Submission | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('content_submissions')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setSubmissions((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const review = async (id: string, status: Submission['status']) => {
    setBusy(true);
    try {
      let published: { table: Submission['published_table']; id: string } | null = null;
      if (status === 'approved') {
        const submission = submissions.find((s) => s.id === id);
        if (!submission) throw new Error('Submission not found');
        published = await publishSubmission(submission);
      }

      const { error } = await supabase
        .from('content_submissions')
        .update({
          status,
          admin_notes: notes.trim() || null,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          ...(published ? { published_table: published.table, published_id: published.id } : {}),
        })
        .eq('id', id);
      if (error) throw error;
      toast({ title: published ? 'Approved and published' : 'Submission updated' });
      setActive(null);
      setNotes('');
      await load();
    } catch (err: any) {
      toast({ title: status === 'approved' ? 'Could not publish submission' : 'Could not update submission', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(SUBMIT_LINK).then(
      () => toast({ title: 'Link copied', description: SUBMIT_LINK }),
      () => toast({ title: 'Could not copy link', variant: 'destructive' }),
    );
  };

  const isDevotionalShape = active?.content_type === 'daily_devotional' || active?.content_type === 'devotional_series';
  const isPrayerShape = active?.content_type === 'prayer_series';

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-medium">Share this link with writers and authors</p>
            <p className="text-sm text-muted-foreground break-all">{SUBMIT_LINK}</p>
          </div>
          <Button variant="outline" size="sm" onClick={copyLink}><Copy className="h-4 w-4 mr-2" /> Copy link</Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : submissions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No submissions yet.</p>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <Card key={s.id} className="cursor-pointer hover:border-purple-300" onClick={() => { setActive(s); setNotes(s.admin_notes || ''); }}>
              <CardContent className="pt-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{s.title}</span>
                    <Badge variant="outline">{TYPE_LABELS[s.content_type]}</Badge>
                    <Badge variant={STATUS_BADGE[s.status].variant}>{STATUS_BADGE[s.status].label}</Badge>
                    {s.published_id && <Badge variant="outline" className="text-green-700 border-green-300">Published</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{s.author_name} &middot; {s.author_email}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{new Date(s.created_at).toLocaleDateString()}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {active.title}
                  <Badge variant="outline">{TYPE_LABELS[active.content_type]}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p><span className="font-medium">Author:</span> {active.author_name} ({active.author_email})</p>
                {active.category && <p><span className="font-medium">Category:</span> {active.category}</p>}
                {active.description && (
                  <div>
                    <p className="font-medium mb-1">{active.content_type === 'book' ? 'Summary' : 'Series description'}</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">{active.description}</p>
                  </div>
                )}
                {active.content_type === 'book' && active.key_takeaways?.length > 0 && (
                  <div>
                    <p className="font-medium mb-1">Key takeaways</p>
                    <ul className="list-disc list-inside text-muted-foreground">
                      {active.key_takeaways.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                )}
                {active.days?.length > 0 && (
                  <div className="space-y-2">
                    {active.content_type !== 'daily_devotional' && <p className="font-medium">Days ({active.days.length})</p>}
                    {active.days.map((d) => (
                      <div key={d.day} className="border rounded-lg p-3 space-y-1.5">
                        <p className="font-medium">{active.content_type === 'daily_devotional' ? d.title : `Day ${d.day}: ${d.title}`}</p>
                        {d.subtitle && <p className="text-xs text-muted-foreground italic">{d.subtitle}</p>}
                        {d.scripture_reference && (
                          <p className="text-xs text-muted-foreground">{d.scripture_reference} ({d.scripture_version})</p>
                        )}
                        {isDevotionalShape && d.introduction && (
                          <p className="text-muted-foreground"><span className="font-medium text-foreground">Introduction: </span>{d.introduction}</p>
                        )}
                        {isPrayerShape && d.prayer_focus && (
                          <p className="text-muted-foreground"><span className="font-medium text-foreground">Focus: </span>{d.prayer_focus}</p>
                        )}
                        <p className="text-muted-foreground whitespace-pre-wrap">{d.main_content}</p>
                        {isDevotionalShape && d.reflection_questions?.length > 0 && (
                          <div>
                            <p className="font-medium text-foreground">Reflection questions</p>
                            <ul className="list-disc list-inside text-muted-foreground">{d.reflection_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                          </div>
                        )}
                        {isDevotionalShape && d.guided_prayer && (
                          <p className="text-muted-foreground"><span className="font-medium text-foreground">Guided prayer: </span>{d.guided_prayer}</p>
                        )}
                        {isDevotionalShape && d.action_steps?.length > 0 && (
                          <div>
                            <p className="font-medium text-foreground">Action steps</p>
                            <ul className="list-disc list-inside text-muted-foreground">{d.action_steps.map((a, i) => <li key={i}>{a}</li>)}</ul>
                          </div>
                        )}
                        {isDevotionalShape && d.additional_thoughts && (
                          <p className="text-muted-foreground"><span className="font-medium text-foreground">Additional thoughts: </span>{d.additional_thoughts}</p>
                        )}
                        {isPrayerShape && d.prayer_points?.length > 0 && (
                          <div>
                            <p className="font-medium text-foreground">Prayer points</p>
                            <ul className="list-disc list-inside text-muted-foreground">{d.prayer_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <p className="font-medium mb-1">Notes to the author (optional)</p>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Feedback, requested changes, or approval note..." />
                </div>
              </div>
              <DialogFooter className="gap-2 flex-wrap">
                <Button variant="destructive" disabled={busy} onClick={() => review(active.id, 'rejected')}>
                  <X className="h-4 w-4 mr-1.5" /> Reject
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => review(active.id, 'changes_requested')}>
                  <MessageSquareWarning className="h-4 w-4 mr-1.5" /> Recommend changes
                </Button>
                <Button disabled={busy} onClick={() => review(active.id, 'approved')}>
                  {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />} Approve &amp; Publish
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminContentSubmissions;
