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

type ContentType = 'book' | 'daily_devotional' | 'devotional_series' | 'prayer_series';

// Superset of fields across a devotional Entry (AdminDevotionalLibraryManager's
// Entry interface) and a PrayerDay (AdminPrayerLibrary's PrayerDay interface) —
// which fields render is decided per contentType below, so a writer only ever
// sees the ones that actually apply to what they're submitting.
interface DayEntry {
  day: number;
  title: string;
  subtitle: string;
  scriptureReference: string;
  scriptureVersion: string;
  introduction: string;
  mainContent: string;
  reflectionQuestions: string;
  guidedPrayer: string;
  actionSteps: string;
  additionalThoughts: string;
  prayerFocus: string;
  prayerPoints: string;
}

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  book: 'Book Summary',
  daily_devotional: 'Daily Devotional',
  devotional_series: 'Devotional Series',
  prayer_series: 'Prayer Library Series',
};

const BIBLE_VERSIONS = ['KJV', 'NIV', 'ESV', 'NLT', 'NKJV'];

const emptyDay = (day: number): DayEntry => ({
  day, title: '', subtitle: '', scriptureReference: '', scriptureVersion: 'KJV',
  introduction: '', mainContent: '', reflectionQuestions: '', guidedPrayer: '',
  actionSteps: '', additionalThoughts: '', prayerFocus: '', prayerPoints: '',
});

const toList = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

/**
 * "Write for Us" — a public, no-account-needed link ministries/platform
 * admins send to writers and authors so they can submit a Book Summary,
 * Daily Devotional, Devotional Series, or Prayer Library series. Lands in
 * public.content_submissions (migrations 0378/0379) as 'pending'; a
 * platform admin then reviews it from the admin queue (Approve /
 * Recommend changes / Reject — see AdminContentSubmissions.tsx).
 *
 * Field sets per category are pulled straight from the real destination
 * schemas so a writer fills in exactly what publishing needs and nothing
 * gets lost in translation later: AdminDevotionalLibraryManager's Entry
 * (title, subtitle, scripture reference + version, introduction,
 * main_content, reflection_questions, guided_prayer, action_steps,
 * additional_thoughts) for devotionals, and AdminPrayerLibrary's PrayerDay
 * (title, scripture_reference, prayer_focus, prayer_text, prayer_points)
 * for prayer series. A Daily Devotional is exactly one Entry, not wrapped
 * in a series.
 */
export const SubmitContentPage: React.FC = () => {
  const [contentType, setContentType] = useState<ContentType>('daily_devotional');
  const [title, setTitle] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [takeaways, setTakeaways] = useState('');
  const [days, setDays] = useState<DayEntry[]>([emptyDay(1)]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isMultiDay = contentType === 'devotional_series' || contentType === 'prayer_series';
  const isSingleEntry = contentType === 'daily_devotional';
  const usesEntryFields = isMultiDay || isSingleEntry; // vs. book, which has none of this
  const isDevotionalShape = contentType === 'devotional_series' || contentType === 'daily_devotional';
  const isPrayerShape = contentType === 'prayer_series';

  const updateDay = (idx: number, patch: Partial<DayEntry>) => {
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };
  const addDay = () => setDays((prev) => [...prev, emptyDay(prev.length + 1)]);
  const removeDay = (idx: number) => setDays((prev) => prev.filter((_, i) => i !== idx).map((d, i) => ({ ...d, day: i + 1 })));

  const dayValid = (d: DayEntry) => d.title.trim() && d.mainContent.trim();

  const canSubmit = title.trim() && authorName.trim() && authorEmail.trim()
    && (usesEntryFields ? days.every(dayValid) : description.trim());

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const daysPayload = usesEntryFields ? days.map((d) => ({
        day: d.day,
        title: d.title.trim(),
        subtitle: d.subtitle.trim() || null,
        scripture_reference: d.scriptureReference.trim() || null,
        scripture_version: d.scriptureVersion,
        introduction: isDevotionalShape ? (d.introduction.trim() || null) : null,
        main_content: d.mainContent.trim(),
        reflection_questions: isDevotionalShape ? toList(d.reflectionQuestions) : [],
        guided_prayer: isDevotionalShape ? (d.guidedPrayer.trim() || null) : null,
        action_steps: isDevotionalShape ? toList(d.actionSteps) : [],
        additional_thoughts: isDevotionalShape ? (d.additionalThoughts.trim() || null) : null,
        prayer_focus: isPrayerShape ? (d.prayerFocus.trim() || null) : null,
        prayer_points: isPrayerShape ? toList(d.prayerPoints) : [],
      })) : [];

      const { error } = await supabase.from('content_submissions').insert({
        content_type: contentType,
        title: title.trim(),
        author_name: authorName.trim(),
        author_email: authorEmail.trim(),
        category: category.trim() || null,
        description: usesEntryFields ? (description.trim() || null) : description.trim(),
        key_takeaways: contentType === 'book'
          ? takeaways.split('\n').map((t) => t.trim()).filter(Boolean)
          : [],
        days: daysPayload,
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

  const dayLabel = (d: DayEntry, i: number) => (
    <div key={i} className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{isSingleEntry ? 'Content' : `Day ${d.day}`}</span>
        {isMultiDay && days.length > 1 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => removeDay(i)}><Trash2 className="h-4 w-4" /></Button>
        )}
      </div>
      <div><Label>Title</Label><Input value={d.title} onChange={(e) => updateDay(i, { title: e.target.value })} placeholder="Title" /></div>
      {isDevotionalShape && (
        <div><Label>Subtitle (optional)</Label><Input value={d.subtitle} onChange={(e) => updateDay(i, { subtitle: e.target.value })} /></div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Scripture reference</Label><Input value={d.scriptureReference} onChange={(e) => updateDay(i, { scriptureReference: e.target.value })} placeholder="John 3:16" /></div>
        <div>
          <Label>Bible version</Label>
          <Select value={d.scriptureVersion} onValueChange={(v) => updateDay(i, { scriptureVersion: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{BIBLE_VERSIONS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {isDevotionalShape && (
        <div><Label>Introduction (optional)</Label><Textarea value={d.introduction} onChange={(e) => updateDay(i, { introduction: e.target.value })} rows={2} /></div>
      )}
      {isPrayerShape && (
        <div><Label>Prayer focus (optional)</Label><Input value={d.prayerFocus} onChange={(e) => updateDay(i, { prayerFocus: e.target.value })} placeholder="e.g. Healing, Guidance" /></div>
      )}
      <div>
        <Label>{isPrayerShape ? 'Prayer text' : 'Main content / message'}</Label>
        <Textarea value={d.mainContent} onChange={(e) => updateDay(i, { mainContent: e.target.value })} rows={5} />
      </div>
      {isDevotionalShape && (
        <>
          <div><Label>Reflection questions (one per line, optional)</Label><Textarea value={d.reflectionQuestions} onChange={(e) => updateDay(i, { reflectionQuestions: e.target.value })} rows={2} /></div>
          <div><Label>Guided prayer (optional)</Label><Textarea value={d.guidedPrayer} onChange={(e) => updateDay(i, { guidedPrayer: e.target.value })} rows={2} /></div>
          <div><Label>Action steps (one per line, optional)</Label><Textarea value={d.actionSteps} onChange={(e) => updateDay(i, { actionSteps: e.target.value })} rows={2} /></div>
          <div><Label>Additional thoughts (optional)</Label><Textarea value={d.additionalThoughts} onChange={(e) => updateDay(i, { additionalThoughts: e.target.value })} rows={2} /></div>
        </>
      )}
      {isPrayerShape && (
        <div><Label>Prayer points (one per line, optional)</Label><Textarea value={d.prayerPoints} onChange={(e) => updateDay(i, { prayerPoints: e.target.value })} rows={2} /></div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-1">
          <BookOpen className="h-8 w-8 text-purple-600 mx-auto" />
          <h1 className="text-2xl font-bold">Write for ReKindle</h1>
          <p className="text-muted-foreground">
            Submit a book summary, daily devotional, devotional series, or prayer library series for our team to review.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">What are you submitting?</CardTitle></CardHeader>
          <CardContent>
            <Select value={contentType} onValueChange={(v) => { setContentType(v as ContentType); setDays([emptyDay(1)]); }}>
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
            <div><Label>{isSingleEntry ? 'Title' : usesEntryFields ? 'Series title' : 'Title'}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" /></div>
            <div><Label>Category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Faith, Leadership, Family" /></div>
            {!isSingleEntry && (
              <div>
                <Label>{contentType === 'book' ? 'Summary' : 'Series description'}</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
                  placeholder={usesEntryFields ? 'What is this series about? (shown on the series page)' : 'The full book summary'} />
              </div>
            )}
            {contentType === 'book' && (
              <div>
                <Label>Key takeaways (one per line)</Label>
                <Textarea value={takeaways} onChange={(e) => setTakeaways(e.target.value)} rows={4} placeholder={'Takeaway one\nTakeaway two'} />
              </div>
            )}
          </CardContent>
        </Card>

        {usesEntryFields && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{isSingleEntry ? "Today's content" : 'Days'}</CardTitle>
              {isMultiDay && (
                <Button type="button" size="sm" variant="outline" onClick={addDay}><Plus className="h-4 w-4 mr-1" /> Add day</Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {days.map((d, i) => dayLabel(d, i))}
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
