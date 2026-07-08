import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { UniversalTTSExportButton } from '@/components/UniversalTTSExportButton';
import { TranslateNowButton } from '@/components/TranslateNowButton';
import { HighQualityAudioPlayer } from '@/components/HighQualityAudioPlayer';
import { Plus, Edit, Trash2, Save, X, Shield, Volume2, Sparkles, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Declaration {
  id: string;
  title?: string | null;
  declaration_number?: number | null;
  text: string;
  category: string;
  scripture_reference: string;
  schedule_date: string | null;
  is_daily: boolean;
  is_published: boolean;
  created_at: string;
}

const categories = [
  { value: 'protection',   label: 'Protection' },
  { value: 'victory',      label: 'Victory' },
  { value: 'prosperity',   label: 'Prosperity' },
  { value: 'health',       label: 'Health' },
  { value: 'authority',    label: 'Authority' },
  { value: 'breakthrough', label: 'Breakthrough' },
  { value: 'faith',        label: 'Faith' },
  { value: 'wisdom',       label: 'Wisdom' },
  { value: 'identity',     label: 'Identity' },
  { value: 'family',       label: 'Family' },
  { value: 'love',         label: 'Love' },
  { value: 'purpose',      label: 'Purpose' },
];

const emptyForm = {
  title: '',
  text: '',
  category: 'protection',
  scripture_reference: '',
  schedule_date: '',
  is_daily: false,
  is_published: true,
};

export const AdminDeclarationManager: React.FC = () => {
  const { t } = useLanguage();
  const [declarations, setDeclarations]     = useState<Declaration[]>([]);
  const [loading, setLoading]               = useState(true);
  const [editingId, setEditingId]           = useState<string | null>(null);
  const [isCreating, setIsCreating]         = useState(false);
  const [showAudioPreview, setShowAudioPreview] = useState<string | null>(null);
  const [generating, setGenerating]         = useState(false);
  const [formData, setFormData]             = useState({ ...emptyForm });

  useEffect(() => { loadDeclarations(); }, []);

  const loadDeclarations = async () => {
    try {
      const { data, error } = await supabase
        .from('declarations')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setDeclarations(data || []);
    } catch (err) {
      toast({ title: t('adminDeclarationManager', 'error', 'Error'), description: t('adminDeclarationManager', 'failedToLoad', 'Failed to load declarations'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const generateDeclaration = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-declaration', {
        body: {
          category: formData.category,
          title: formData.title,
          scripture: formData.scripture_reference,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const text = data?.text || '';
      if (!text) throw new Error('Empty response');
      setFormData(f => ({ ...f, text }));
      toast({ title: t('adminDeclarationManager', 'declarationGenerated', 'Declaration generated!') });
    } catch (err: any) {
      console.error('Declaration generation error:', err);
      let msg = err instanceof Error ? err.message : 'Could not generate declaration';
      try { const body = await err?.context?.json?.(); if (body?.error) msg = body.error; } catch {}
      toast({ title: t('adminDeclarationManager', 'generationFailed', 'Generation failed'), description: msg, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        title: formData.title || null,
        schedule_date: formData.schedule_date || null,
      };

      if (editingId) {
        const { error } = await supabase.from('declarations').update(payload).eq('id', editingId);
        if (error) throw error;
        toast({ title: t('adminDeclarationManager', 'declarationUpdated', 'Declaration updated successfully') });
      } else {
        const { error } = await supabase.from('declarations').insert([payload]);
        if (error) throw error;
        toast({ title: t('adminDeclarationManager', 'declarationCreated', 'Declaration created successfully') });
      }
      resetForm();
      loadDeclarations();
    } catch (err: any) {
      toast({ title: t('adminDeclarationManager', 'error', 'Error'), description: err.message || t('adminDeclarationManager', 'failedToSave', 'Failed to save'), variant: 'destructive' });
    }
  };

  const handleEdit = (d: Declaration) => {
    setEditingId(d.id);
    setFormData({
      title: d.title || '',
      text: d.text,
      category: d.category,
      scripture_reference: d.scripture_reference || '',
      schedule_date: d.schedule_date || '',
      is_daily: d.is_daily,
      is_published: d.is_published,
    });
    setIsCreating(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('adminDeclarationManager', 'areYouSure', 'Are you sure?'))) return;
    try {
      const { error } = await supabase.from('declarations').delete().eq('id', id);
      if (error) throw error;
      toast({ title: t('adminDeclarationManager', 'declarationDeleted', 'Declaration deleted') });
      loadDeclarations();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setFormData({ ...emptyForm });
    setEditingId(null);
    setIsCreating(false);
  };

  const categoryColors: Record<string, string> = {
    protection: 'bg-indigo-100 text-indigo-800',
    victory: 'bg-emerald-100 text-emerald-800',
    prosperity: 'bg-yellow-100 text-yellow-800',
    health: 'bg-rose-100 text-rose-800',
    authority: 'bg-violet-100 text-violet-800',
    breakthrough: 'bg-cyan-100 text-cyan-800',
    faith: 'bg-blue-100 text-blue-800',
    wisdom: 'bg-purple-100 text-purple-800',
    identity: 'bg-pink-100 text-pink-800',
    family: 'bg-orange-100 text-orange-800',
    love: 'bg-red-100 text-red-800',
    purpose: 'bg-teal-100 text-teal-800',
  };

  // Split text into paragraphs for preview
  const previewParagraphs = (formData.text || '').split('\n').filter(p => p.trim());

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-indigo-600" />
            {t('adminDeclarationManager', 'declarationManager', 'Declaration Manager')}
          </h2>
          <p className="text-gray-600 mt-1">{t('adminDeclarationManager', 'createManageDaily', 'Create and manage daily declarations')}</p>
        </div>
        <Button onClick={() => { if (isCreating) resetForm(); else setIsCreating(true); }}>
          {isCreating ? <><X className="h-4 w-4 mr-2" />{t('adminDeclarationManager', 'cancel', 'Cancel')}</> : <><Plus className="h-4 w-4 mr-2" />{t('adminDeclarationManager', 'newDeclaration', 'New Declaration')}</>}
        </Button>
      </div>

      {/* Form */}
      {isCreating && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? t('adminDeclarationManager', 'editDeclaration', 'Edit Declaration') : t('adminDeclarationManager', 'createNewDeclaration', 'Create New Declaration')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Title */}
              <div className="space-y-1">
                <Label>{t('adminDeclarationManager', 'title', 'Title')}</Label>
                <Input
                  value={formData.title}
                  onChange={e => setFormData(f => ({ ...f, title: e.target.value }))}
                  placeholder={t('adminDeclarationManager', 'titlePlaceholder', 'e.g. The Spirit of Wisdom')}
                />
              </div>

              {/* Category + Scripture */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>{t('adminDeclarationManager', 'category', 'Category')}</Label>
                  <Select value={formData.category} onValueChange={v => setFormData(f => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.value} value={c.value}>{t('adminDeclarationManager', `category_${c.value}`, c.label)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('adminDeclarationManager', 'scriptureReference', 'Scripture Reference')}</Label>
                  <Input
                    value={formData.scripture_reference}
                    onChange={e => setFormData(f => ({ ...f, scripture_reference: e.target.value }))}
                    placeholder={t('adminDeclarationManager', 'scripturePlaceholder', 'e.g. Isaiah 54:17')}
                  />
                </div>
              </div>

              {/* Declaration Text + AI Generate */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>{t('adminDeclarationManager', 'declarationText', 'Declaration Text')}</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={generateDeclaration}
                    disabled={generating}
                    className="gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                  >
                    {generating
                      ? <><Loader2 className="h-3 w-3 animate-spin" />{t('adminDeclarationManager', 'generating', 'Generating...')}</>
                      : <><Sparkles className="h-3 w-3" />{t('adminDeclarationManager', 'aiGenerate', 'AI Generate')}</>
                    }
                  </Button>
                </div>
                <Textarea
                  value={formData.text}
                  onChange={e => setFormData(f => ({ ...f, text: e.target.value }))}
                  placeholder={t('adminDeclarationManager', 'textPlaceholder', "Today, I speak over my life and my household that...\n\nI am not stranded, nor am I lost in confusion...\n\nIn Jesus's name, I believe and say amen.")}
                  rows={10}
                  className="font-serif text-base leading-relaxed"
                  required
                />
                <p className="text-xs text-gray-400">
                  {t('adminDeclarationManager', 'patternHint', 'Pattern: Opening → Declarations (I am, I have, I walk...) → "In Jesus\'s name, I believe and say amen."')}
                </p>
              </div>

              {/* Preview */}
              {(formData.title || formData.text) && (
                <div className="border rounded-xl p-5 bg-white space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('adminDeclarationManager', 'preview', 'Preview')}</p>
                  {formData.title && (
                    <h3 className="text-xl font-bold text-blue-700 underline text-center">{formData.title}</h3>
                  )}
                  <div className="space-y-3">
                    {previewParagraphs.map((para, i) => (
                      <p key={i} className="text-sm leading-relaxed text-justify text-gray-800">{para}</p>
                    ))}
                  </div>
                  {formData.scripture_reference && (
                    <p className="text-sm text-amber-600 italic text-center pt-2 border-t">— {formData.scripture_reference}</p>
                  )}
                </div>
              )}

              {/* Schedule + Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>{t('adminDeclarationManager', 'scheduleDateOptional', 'Schedule Date (Optional)')}</Label>
                  <Input
                    type="date"
                    value={formData.schedule_date}
                    onChange={e => setFormData(f => ({ ...f, schedule_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{t('adminDeclarationManager', 'includeDailyRotation', 'Include in daily rotation')}</p>
                      <p className="text-xs text-gray-500">{t('adminDeclarationManager', 'showDailyWidget', 'Show in daily declaration widget')}</p>
                    </div>
                    <Switch checked={formData.is_daily} onCheckedChange={v => setFormData(f => ({ ...f, is_daily: v }))} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{t('adminDeclarationManager', 'published', 'Published')}</p>
                      <p className="text-xs text-gray-500">{t('adminDeclarationManager', 'makeVisible', 'Make visible to users')}</p>
                    </div>
                    <Switch checked={formData.is_published} onCheckedChange={v => setFormData(f => ({ ...f, is_published: v }))} />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit">
                  <Save className="h-4 w-4 mr-2" />
                  {editingId ? t('adminDeclarationManager', 'updateDeclaration', 'Update Declaration') : t('adminDeclarationManager', 'createDeclaration', 'Create Declaration')}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    <X className="h-4 w-4 mr-2" />{t('adminDeclarationManager', 'cancel', 'Cancel')}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Declaration List */}
      <div className="grid grid-cols-1 gap-4">
        {declarations.map(d => {
          const paras = d.text.split('\n').filter(p => p.trim());
          return (
            <Card key={d.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${categoryColors[d.category] || 'bg-gray-100 text-gray-700'}`}>
                        {d.category}
                      </span>
                      {d.is_daily && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">{t('adminDeclarationManager', 'daily', 'Daily')}</span>}
                      {!d.is_published && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{t('adminDeclarationManager', 'draft', 'Draft')}</span>}
                    </div>

                    {d.title && (
                      <h3 className="font-bold text-blue-700 underline">{d.title}</h3>
                    )}

                    {/* Show first paragraph only in list view */}
                    <p className="text-gray-800 leading-relaxed text-sm line-clamp-2">{paras[0]}</p>
                    {paras.length > 1 && (
                      <p className="text-xs text-gray-400">+{paras.length - 1} more paragraph{paras.length > 2 ? 's' : ''}</p>
                    )}

                    {d.scripture_reference && (
                      <p className="text-sm text-amber-600 italic">— {d.scripture_reference}</p>
                    )}
                    {d.schedule_date && (
                      <p className="text-xs text-gray-500">{t('adminDeclarationManager', 'scheduledOn', 'Scheduled: {date}').replace('{date}', new Date(d.schedule_date).toLocaleDateString())}</p>
                    )}
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    <Button variant="outline" size="sm"
                      onClick={() => setShowAudioPreview(showAudioPreview === d.id ? null : d.id)}
                      title={t('adminDeclarationManager', 'previewAudio', 'Preview audio')}
                    >
                      <Volume2 className="h-4 w-4 text-blue-500" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleEdit(d)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <UniversalTTSExportButton
                      contentType="declaration"
                      contentId={d.id}
                      contentTitle={`${d.title || d.category} - ${d.text.substring(0, 30)}...`}
                      size="sm"
                    />
                    <TranslateNowButton contentType="declaration" contentId={d.id} />
                    <Button variant="outline" size="sm" onClick={() => handleDelete(d.id)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>

                {showAudioPreview === d.id && (
                  <div className="mt-4 bg-gray-50 rounded-lg p-4 border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">{t('adminDeclarationManager', 'ttsAudioPreview', 'TTS Audio Preview')}</span>
                      <Button variant="ghost" size="sm" onClick={() => setShowAudioPreview(null)} className="h-6 w-6 p-0">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <HighQualityAudioPlayer
                      text={`${d.title ? d.title + '.\n\n' : ''}${d.text}${d.scripture_reference ? `\n\n— ${d.scripture_reference}` : ''}`}
                      contentId={d.id}
                      contentType="declaration"
                      title={d.title || d.text.substring(0, 50)}
                      autoLoad={true}
                      className="w-full"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {declarations.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">{t('adminDeclarationManager', 'noDeclarations', 'No declarations yet. Create your first one!')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
