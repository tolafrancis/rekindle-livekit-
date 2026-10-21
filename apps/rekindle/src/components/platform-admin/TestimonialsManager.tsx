import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { supabase } from '@/lib/supabase';
import { toast } from '../ui/use-toast';
import { Copy, Trash2, Loader2 } from 'lucide-react';
import { fetchTestimonials, TESTIMONIAL_PATH, type AppTestimonial } from '@rekindle/features/testimonials';
import { confirmAction } from '@/components/ui/confirm-dialog';

// Platform-admin moderation for public.app_testimonials (0412): people submit
// from /testimonial, and nothing shows on the landing page until it is
// published here.

const CONSUMER_APP_URL = import.meta.env.VITE_CONSUMER_APP_URL || 'https://app.rekindlebc.com';
const SHARE_LINK = `${CONSUMER_APP_URL}${TESTIMONIAL_PATH}`;

export const TestimonialsManager: React.FC = () => {
  const [items, setItems] = useState<AppTestimonial[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await fetchTestimonials(true));
    } catch (e: any) {
      toast({ title: 'Could not load testimonials', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const togglePublished = async (item: AppTestimonial) => {
    const { error } = await supabase.from('app_testimonials').update({ is_published: !item.is_published, updated_at: new Date().toISOString() }).eq('id', item.id);
    if (error) return toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
    load();
  };

  const remove = async (item: AppTestimonial) => {
    if (!await confirmAction({ title: `Delete ${item.name}'s testimonial?`, confirmLabel: 'Delete', destructive: true })) return;
    const { error } = await supabase.from('app_testimonials').delete().eq('id', item.id);
    if (error) return toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
    load();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_LINK);
      toast({ title: 'Link copied' });
    } catch {
      toast({ title: 'Could not copy', description: SHARE_LINK, variant: 'destructive' });
    }
  };

  const pending = items.filter((i) => !i.is_published);
  const published = items.filter((i) => i.is_published);

  const row = (item: AppTestimonial) => (
    <div key={item.id} className="flex items-start gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm">“{item.quote}”</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.name}{item.role ? ` · ${item.role}` : ''} · {new Date(item.created_at).toLocaleDateString()}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Switch checked={item.is_published} onCheckedChange={() => togglePublished(item)} aria-label="Published" />
        <Button size="icon" variant="ghost" onClick={() => remove(item)} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>
    </div>
  );

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-purple-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Testimonials</h2>
          <p className="text-sm text-muted-foreground">Send people the link below. Switch a testimonial on to show it on the landing page.</p>
        </div>
        <Button variant="outline" onClick={copyLink}><Copy className="h-4 w-4 mr-2" />Copy link</Button>
      </div>
      <p className="rounded-md bg-muted px-3 py-2 text-sm font-mono break-all">{SHARE_LINK}</p>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <CardTitle className="text-base">Waiting for review</CardTitle>
          {pending.length > 0 && <Badge>{pending.length}</Badge>}
        </CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 ? <p className="text-sm text-muted-foreground">Nothing new.</p> : pending.map(row)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-0">
          <CardTitle className="text-base">On the landing page <span className="text-muted-foreground font-normal">({published.length})</span></CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {published.length === 0 ? <p className="text-sm text-muted-foreground">None published yet.</p> : published.map(row)}
        </CardContent>
      </Card>
    </div>
  );
};
