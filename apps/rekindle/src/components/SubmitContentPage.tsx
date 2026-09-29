import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { BookOpen, Plus, Trash2, CheckCircle2, Loader2 } from 'lucide-react';

type ContentType = 'book' | 'devotional_series' | 'prayer_series';

interface DayEntry {
  day: number;
  title: string;
  scripture: string;
  content: string;
}

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  book: 'Book Summary',
  devotional_series: 'Devotional Series',
  prayer_series: 'Prayer Library Series',
};

const emptyDay = (day: number): DayEntry => ({ day, title: '', scripture: '', content: '' });

/**
 * "Write for Us" — a public, no-account-needed link ministries/platform
 * admins send to writers and authors so they can submit a Book Summary,
 * Devotional Series, or Prayer Library series. Lands in
 * public.content_submissions (migration 0378) as 'pending'; a platform
 * admin then reviews it from the admin queue (Approve / Recommend changes
 * / Reject — see AdminContentSubmissions.tsx).
 */
export const SubmitContentPage: React.FC = () => {
  const [contentType, setContentType] = useState<ContentType>('book');
  const [title, setTitle] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [takeaways, setTakeaways] = useState('');
  const [days, setDays] = useState<DayEntry[]>([emptyDay(1)]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isSeries = contentType !== 'book';

  const updateDay = (idx: number, patch: Partial<DayEntry>) => {
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };
  const addDay = () => setDays((prev) => [...prev, emptyDay(prev.length + 1)]);
  const removeDay = (idx: number) => setDays((prev) => prev.filter((_, i) => i !== idx).map((d, i) => ({ ...d, day: i + 1 })));

  const canSubmit = title.trim() && authorName.trim() && authorEmail.trim() && description.trim()
    && (!isSeries || days.every((d) => d.title.trim() && d.content.trim()));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('content_submissions').insert({
        content_type: contentType,
        title: title.trim(),
        author_name: authorName.trim(),
        author_email: authorEmail.trim(),
        category: category.trim() || null,
        description: description.trim(),
        key_takeaways: contentType === 'book'
          ? takeaways.split('\n').map((t) => t.trim()).filter(Boolean)
          : [],
        days: isSeries ? days : [],
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: 'Could not submit', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <h2 className="text-xl font-semibold">Thank you!</h2>
            <p className="text-muted-foreground">
              Your {CONTENT_TYPE_LABELS[contentType].toLowerCase()} has been submitted for review.
              We'll be in touch at {authorEmail} once it's reviewed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-1">
          <BookOpen className="h-8 w-8 text-purple-600 mx-auto" />
          <h1 className="text-2xl font-bold">Write for ReKindle</h1>
          <p className="text-muted-foreground">
            Submit a book summary, devotional series, or prayer library series for our team to review.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">What are you submitting?</CardTitle></CardHeader>
          <CardContent>
            <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CONTENT_TYPE_LABELS) as ContentType[]).map((k) => (
                  <SelectItem key={k} value={k}>{CONTENT_TYPE_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">About you</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Your Name</Label><Input value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="Jane Doe" /></div>
            <div><Label>Your Email</Label><Input type="email" value={authorEmail} onChange={(e) => setAuthorEmail(e.target.value)} placeholder="jane@example.com" /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{CONTENT_TYPE_LABELS[contentType]}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" /></div>
            <div><Label>Category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Faith, Leadership, Family" /></div>
            <div>
              <Label>{isSeries ? 'Series description' : 'Summary'}</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5}
                placeholder={isSeries ? 'What is this series about?' : 'The full book summary'} />
            </div>
            {contentType === 'book' && (
              <div>
                <Label>Key takeaways (one per line)</Label>
                <Textarea value={takeaways} onChange={(e) => setTakeaways(e.target.value)} rows={4} placeholder={'Takeaway one\nTakeaway two'} />
              </div>
            )}
          </CardContent>
        </Card>

        {isSeries && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Days</CardTitle>
              <Button type="button" size="sm" variant="outline" onClick={addDay}><Plus className="h-4 w-4 mr-1" /> Add day</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {days.map((d, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Day {d.day}</span>
                    {days.length > 1 && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeDay(i)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                  <Input value={d.title} onChange={(e) => updateDay(i, { title: e.target.value })} placeholder="Day title" />
                  <Input value={d.scripture} onChange={(e) => updateDay(i, { scripture: e.target.value })} placeholder="Scripture reference (optional)" />
                  <Textarea value={d.content} onChange={(e) => updateDay(i, { content: e.target.value })} rows={4} placeholder="Day content" />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Button className="w-full" size="lg" disabled={!canSubmit || submitting} onClick={handleSubmit}>
          {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Submit for review
        </Button>
      </div>
    </div>
  );
};

export default SubmitContentPage;
