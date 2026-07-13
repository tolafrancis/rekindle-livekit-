import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Label } from '@rekindle/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import {
  ScrollText, Sparkles, Plus, Trash2, Loader2, Globe, Building2, Layers,
} from 'lucide-react';
import {
  getFeatureSource,
  setMinistryFeatureSource,
  type FeatureContentSource,
} from '@rekindle/features/contentSource';

// Phase 7 — leader "Content" surface for the ministry space. Per feature (declarations,
// affirmations) a leader picks the SOURCE (ReKindle content / our own / both) and manages
// the ministry's OWN items (rows with ministry_id set; RLS gates them to group admins).

interface ContentItem {
  id: string;
  text: string;
  title?: string | null;
  scripture_reference?: string | null;
  ministry_id?: string | null;
  created_at?: string;
}

const SOURCE_OPTIONS: { value: FeatureContentSource; label: string; icon: typeof Globe; hint: string }[] = [
  { value: 'rekindle', label: 'ReKindle content', icon: Globe, hint: "Use ReKindle's library" },
  { value: 'own', label: 'Our own', icon: Building2, hint: 'Only what you create below' },
  { value: 'both', label: 'Both', icon: Layers, hint: 'ReKindle library + your own' },
];

function FeatureEditor({
  ministryId,
  feature,
  table,
  noun,
  icon: Icon,
  initialSettings,
  themeColor,
  onSourceChange,
}: {
  ministryId: string;
  feature: 'declarations' | 'affirmations';
  table: 'declarations' | 'affirmations';
  noun: string; // e.g. "declaration"
  icon: typeof Sparkles;
  initialSettings: Record<string, any> | null | undefined;
  themeColor: string;
  onSourceChange?: () => void;
}) {
  const [source, setSource] = useState<FeatureContentSource>(() => getFeatureSource(initialSettings, feature));
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ text: '', title: '', scripture_reference: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from(table)
      .select('id, text, title, scripture_reference, ministry_id, created_at')
      .eq('ministry_id', ministryId)
      .order('created_at', { ascending: false });
    if (error) console.error(`[content] load ${table}`, error);
    setItems((data as ContentItem[]) ?? []);
    setLoading(false);
  }, [table, ministryId]);

  useEffect(() => { void load(); }, [load]);

  const changeSource = async (next: FeatureContentSource) => {
    const prev = source;
    setSource(next);
    try {
      await setMinistryFeatureSource(ministryId, feature, next);
      onSourceChange?.();
      toast({ title: 'Source updated', description: `${noun[0].toUpperCase()}${noun.slice(1)}s now show: ${SOURCE_OPTIONS.find(o => o.value === next)?.label}.` });
    } catch (e: any) {
      setSource(prev);
      toast({ title: 'Could not update source', description: e?.message, variant: 'destructive' });
    }
  };

  const add = async () => {
    if (!form.text.trim()) {
      toast({ title: 'Text required', description: `Enter the ${noun} text.`, variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from(table).insert({
      ministry_id: ministryId,
      text: form.text.trim(),
      title: form.title.trim() || null,
      scripture_reference: form.scripture_reference.trim() || null,
      is_published: true,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    setForm({ text: '', title: '', scripture_reference: '' });
    toast({ title: 'Added', description: `Your ${noun} was published to your ministry.` });
    void load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from(table).delete().eq('id', id).eq('ministry_id', ministryId);
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const showsOwn = source === 'own' || source === 'both';

  return (
    <div className="space-y-5">
      {/* Source selector */}
      <div>
        <Label className="text-sm">Where {noun}s come from</Label>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SOURCE_OPTIONS.map((opt) => {
            const OptIcon = opt.icon;
            const active = source === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => changeSource(opt.value)}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${active ? 'text-white' : 'bg-white hover:bg-gray-50'}`}
                style={active ? { backgroundColor: themeColor, borderColor: themeColor } : {}}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <OptIcon className="h-4 w-4" /> {opt.label}
                </span>
                <span className={`text-xs ${active ? 'text-white/80' : 'text-gray-500'}`}>{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Own-content editor */}
      {showsOwn ? (
        <div className="space-y-4">
          <div className="rounded-xl border p-4 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add your own {noun}
            </p>
            <div className="space-y-2">
              <Input
                placeholder="Title (optional)"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <Textarea
                placeholder={`${noun[0].toUpperCase()}${noun.slice(1)} text…`}
                rows={3}
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
              />
              <Input
                placeholder="Scripture reference (optional, e.g. Philippians 4:13)"
                value={form.scripture_reference}
                onChange={(e) => setForm({ ...form, scripture_reference: e.target.value })}
              />
            </div>
            <Button onClick={add} disabled={saving || !form.text.trim()} style={{ backgroundColor: themeColor }}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Publish {noun}
            </Button>
          </div>

          {/* List of own items */}
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No {noun}s yet. Add your first above{source === 'both' ? ' — it shows alongside ReKindle content.' : '.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => (
                <li key={it.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    {it.title && <p className="text-sm font-medium truncate">{it.title}</p>}
                    <p className="text-sm text-gray-700 line-clamp-2">{it.text}</p>
                    {it.scripture_reference && (
                      <p className="text-xs text-gray-400 mt-0.5">{it.scripture_reference}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="shrink-0 text-red-500 hover:text-red-600" onClick={() => remove(it.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-4 text-sm text-gray-500 flex items-center gap-2">
          <Icon className="h-4 w-4" />
          Showing ReKindle's {noun}s. Switch to <span className="font-medium">Our own</span> or <span className="font-medium">Both</span> to add your own.
        </div>
      )}
    </div>
  );
}

export default function MinistryContentManager({
  ministryId,
  settings,
  themeColor,
  onSourceChange,
}: {
  ministryId: string;
  settings: Record<string, any> | null | undefined;
  themeColor: string;
  onSourceChange?: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" style={{ color: themeColor }} />
          Declarations &amp; Affirmations
        </CardTitle>
        <p className="text-sm text-gray-500">
          Choose whether your homepage shows ReKindle's content or your own — and create your own here.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="declarations">
          <TabsList>
            <TabsTrigger value="declarations" className="flex items-center gap-1.5">
              <ScrollText className="h-4 w-4" /> Declarations
            </TabsTrigger>
            <TabsTrigger value="affirmations" className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4" /> Affirmations
            </TabsTrigger>
          </TabsList>
          <TabsContent value="declarations" className="mt-4">
            <FeatureEditor
              ministryId={ministryId}
              feature="declarations"
              table="declarations"
              noun="declaration"
              icon={ScrollText}
              initialSettings={settings}
              themeColor={themeColor}
              onSourceChange={onSourceChange}
            />
          </TabsContent>
          <TabsContent value="affirmations" className="mt-4">
            <FeatureEditor
              ministryId={ministryId}
              feature="affirmations"
              table="affirmations"
              noun="affirmation"
              icon={Sparkles}
              initialSettings={settings}
              themeColor={themeColor}
              onSourceChange={onSourceChange}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
