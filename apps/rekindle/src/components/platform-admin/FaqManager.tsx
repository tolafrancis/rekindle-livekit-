import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from '../ui/use-toast';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { fetchFaqItems, FAQ_AUDIENCE_LABELS, type FaqAudience, type FaqItem } from '@rekindle/features/faq';

// Platform-admin editor for public.faq_items (0393) — the FAQ shown on the
// landing page and at /faq for individuals and ministry leaders.

type Draft = Omit<FaqItem, 'id'> & { id?: string };
const AUDIENCES: FaqAudience[] = ['general', 'individual', 'ministry'];
const emptyDraft = (audience: FaqAudience, order: number): Draft => ({
  audience, question: '', answer: '', display_order: order, is_published: true,
});

export const FaqManager: React.FC = () => {
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await fetchFaqItems(true));
    } catch (e: any) {
      toast({ title: 'Could not load FAQ', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const byAudience = (a: FaqAudience) => items.filter((i) => i.audience === a).sort((x, y) => x.display_order - y.display_order);
  const nextOrder = (a: FaqAudience) => {
    const list = byAudience(a);
    return (list.length ? list[list.length - 1].display_order : 0) + 10;
  };

  const save = async () => {
    if (!draft || !draft.question.trim() || !draft.answer.trim()) {
      toast({ title: 'Question and answer are both required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const row = {
      audience: draft.audience,
      question: draft.question.trim(),
      answer: draft.answer.trim(),
      display_order: draft.display_order,
      is_published: draft.is_published,
      updated_at: new Date().toISOString(),
    };
    const { error } = draft.id
      ? await supabase.from('faq_items').update(row).eq('id', draft.id)
      : await supabase.from('faq_items').insert(row);
    setSaving(false);
    if (error) return toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    toast({ title: draft.id ? 'FAQ updated' : 'FAQ added' });
    setDraft(null);
    load();
  };

  const remove = async (item: FaqItem) => {
    if (!window.confirm(`Delete "${item.question}"?`)) return;
    const { error } = await supabase.from('faq_items').delete().eq('id', item.id);
    if (error) return toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
    load();
  };

  const togglePublished = async (item: FaqItem) => {
    const { error } = await supabase.from('faq_items').update({ is_published: !item.is_published, updated_at: new Date().toISOString() }).eq('id', item.id);
    if (error) return toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
    load();
  };

  // Swap display_order with the neighbour in the same audience.
  const move = async (item: FaqItem, dir: -1 | 1) => {
    const list = byAudience(item.audience);
    const idx = list.findIndex((i) => i.id === item.id);
    const other = list[idx + dir];
    if (!other) return;
    const a = item.display_order === other.display_order ? other.display_order + dir : other.display_order;
    const results = await Promise.all([
      supabase.from('faq_items').update({ display_order: a }).eq('id', item.id),
      supabase.from('faq_items').update({ display_order: item.display_order }).eq('id', other.id),
    ]);
    const err = results.find((r) => r.error)?.error;
    if (err) toast({ title: 'Could not reorder', description: err.message, variant: 'destructive' });
    load();
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-purple-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">FAQ</h2>
          <p className="text-sm text-muted-foreground">Shown on the landing page and at /faq. "Everyone" questions appear for both individuals and ministry leaders.</p>
        </div>
        <Button onClick={() => setDraft(emptyDraft('general', nextOrder('general')))}><Plus className="h-4 w-4 mr-2" />Add question</Button>
      </div>

      {AUDIENCES.map((aud) => {
        const list = byAudience(aud);
        return (
          <Card key={aud}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{FAQ_AUDIENCE_LABELS[aud]} <span className="text-muted-foreground font-normal">({list.length})</span></CardTitle>
              <Button size="sm" variant="outline" onClick={() => setDraft(emptyDraft(aud, nextOrder(aud)))}><Plus className="h-4 w-4 mr-1" />Add</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {list.length === 0 && <p className="text-sm text-muted-foreground">No questions yet.</p>}
              {list.map((item, idx) => (
                <div key={item.id} className="flex items-start gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{item.question}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{item.answer}</p>
                  </div>
                  {!item.is_published && <Badge variant="outline">Hidden</Badge>}
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch checked={item.is_published} onCheckedChange={() => togglePublished(item)} aria-label="Published" />
                    <Button size="icon" variant="ghost" disabled={idx === 0} onClick={() => move(item, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" disabled={idx === list.length - 1} onClick={() => move(item, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDraft({ ...item })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(item)} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{draft?.id ? 'Edit question' : 'Add question'}</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Who is it for?</Label>
                <Select value={draft.audience} onValueChange={(v) => setDraft({ ...draft, audience: v as FaqAudience })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCES.map((a) => <SelectItem key={a} value={a}>{FAQ_AUDIENCE_LABELS[a]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Question</Label>
                <Input value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Answer</Label>
                <Textarea rows={6} value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Published</Label>
                <Switch checked={draft.is_published} onCheckedChange={(v) => setDraft({ ...draft, is_published: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FaqManager;
