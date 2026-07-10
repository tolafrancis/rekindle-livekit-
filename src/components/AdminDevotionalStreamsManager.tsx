// Admin: manage daily-devotional STREAMS (migration 0149).
//
// A stream is a named feed of the main-app `devotionals`. Admins create streams
// here; each daily devotional is assigned to one in the Devotionals tab. Ministries
// and users then pick a public stream to display. The default "ReKindle BC" stream
// is seeded by the migration and can't be deleted (it's the fallback).

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { toast } from './ui/use-toast';
import { Layers, Plus, Edit, Trash2, Loader2, Star, Eye, EyeOff, Save } from 'lucide-react';

interface Stream {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  is_public: boolean;
  is_default: boolean;
  sort_order: number;
  count?: number; // devotionals assigned
}

const empty = (): Partial<Stream> => ({ name: '', description: '', cover_image_url: '', is_public: true, sort_order: 0 });

export const AdminDevotionalStreamsManager: React.FC = () => {
  const { t } = useLanguage();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<Stream> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: streamRows } = await supabase
      .from('devotional_streams')
      .select('*')
      .order('is_default', { ascending: false })
      .order('sort_order', { ascending: true });

    // Count devotionals per stream so admins see which feeds actually have content.
    const rows = (streamRows as Stream[]) ?? [];
    await Promise.all(rows.map(async (s) => {
      const { count } = await supabase
        .from('devotionals')
        .select('id', { count: 'exact', head: true })
        .eq('stream_id', s.id);
      s.count = count ?? 0;
    }));
    setStreams(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(empty()); setShowModal(true); };
  const openEdit = (s: Stream) => { setEditing({ ...s }); setShowModal(true); };

  const save = async () => {
    if (!editing?.name?.trim()) {
      toast({ title: t('adminDevotionalStreams', 'nameRequired', 'Stream name is required'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      name: editing.name.trim(),
      description: editing.description || null,
      cover_image_url: editing.cover_image_url || null,
      is_public: editing.is_public ?? true,
      sort_order: editing.sort_order ?? 0,
    };
    const { error } = editing.id
      ? await supabase.from('devotional_streams').update(payload).eq('id', editing.id)
      : await supabase.from('devotional_streams').insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: t('adminDevotionalStreams', 'saveFailed', 'Could not save stream'), description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: t('adminDevotionalStreams', 'saved', 'Stream saved') });
    setShowModal(false);
    setEditing(null);
    load();
  };

  const remove = async (s: Stream) => {
    if (s.is_default) {
      toast({ title: t('adminDevotionalStreams', 'cannotDeleteDefault', 'The default stream cannot be deleted'), variant: 'destructive' });
      return;
    }
    if (!confirm(t('adminDevotionalStreams', 'confirmDelete', 'Delete this stream? Its devotionals are kept and fall back to the default stream.'))) return;
    const { error } = await supabase.from('devotional_streams').delete().eq('id', s.id);
    if (error) {
      toast({ title: t('adminDevotionalStreams', 'deleteFailed', 'Could not delete stream'), description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: t('adminDevotionalStreams', 'deleted', 'Stream deleted') });
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-purple-600" />
          {t('adminDevotionalStreams', 'title', 'Devotional Streams')}
        </CardTitle>
        <Button size="sm" onClick={openNew} className="bg-purple-600 hover:bg-purple-700">
          <Plus className="h-4 w-4 mr-1" />{t('adminDevotionalStreams', 'newStream', 'New Stream')}
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 mb-4">
          {t('adminDevotionalStreams', 'blurb', 'Named feeds of the daily devotional. Assign each devotional to a stream in the Devotionals tab; ministries and users pick a public stream to display.')}
        </p>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : (
          <div className="space-y-2">
            {streams.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border bg-white p-3">
                {s.cover_image_url
                  ? <img src={s.cover_image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                  : <div className="w-10 h-10 rounded bg-purple-50 flex items-center justify-center shrink-0"><Layers className="h-5 w-5 text-purple-300" /></div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 truncate">{s.name}</p>
                    {s.is_default && <Badge variant="outline" className="text-amber-600 border-amber-300"><Star className="h-3 w-3 mr-1" />{t('adminDevotionalStreams', 'default', 'Default')}</Badge>}
                    {s.is_public
                      ? <Badge variant="outline" className="text-green-600 border-green-300"><Eye className="h-3 w-3 mr-1" />{t('adminDevotionalStreams', 'public', 'Public')}</Badge>
                      : <Badge variant="outline" className="text-gray-500"><EyeOff className="h-3 w-3 mr-1" />{t('adminDevotionalStreams', 'hidden', 'Hidden')}</Badge>}
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    {t('adminDevotionalStreams', 'countLabel', '{n} devotionals').replace('{n}', String(s.count ?? 0))}
                    {s.description ? ` · ${s.description}` : ''}
                  </p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Edit className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(s)} disabled={s.is_default}>
                  <Trash2 className={`h-4 w-4 ${s.is_default ? 'text-gray-300' : 'text-red-500'}`} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? t('adminDevotionalStreams', 'editStream', 'Edit Stream') : t('adminDevotionalStreams', 'newStream', 'New Stream')}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>{t('adminDevotionalStreams', 'name', 'Name')}</Label>
                <Input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t('adminDevotionalStreams', 'namePlaceholder', 'e.g. Morning Manna')} />
              </div>
              <div>
                <Label>{t('adminDevotionalStreams', 'description', 'Description')}</Label>
                <Textarea value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} />
              </div>
              <div>
                <Label>{t('adminDevotionalStreams', 'coverUrl', 'Cover image URL')}</Label>
                <Input value={editing.cover_image_url || ''} onChange={(e) => setEditing({ ...editing, cover_image_url: e.target.value })} placeholder="https://…" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('adminDevotionalStreams', 'publicLabel', 'Listed publicly')}</Label>
                  <p className="text-xs text-gray-400">{t('adminDevotionalStreams', 'publicHint', 'Ministries and users can select this stream')}</p>
                </div>
                <Switch checked={editing.is_public ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_public: v })} />
              </div>
              <div>
                <Label>{t('adminDevotionalStreams', 'sortOrder', 'Sort order')}</Label>
                <Input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t('adminDevotionalStreams', 'cancel', 'Cancel')}</Button>
            <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              {t('adminDevotionalStreams', 'save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AdminDevotionalStreamsManager;
