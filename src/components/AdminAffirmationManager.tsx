import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { UniversalTTSExportButton } from './UniversalTTSExportButton';
import { TranslateNowButton } from '@/components/TranslateNowButton';
import { HighQualityAudioPlayer } from './HighQualityAudioPlayer';
import {
  Star, Plus, Edit, Trash2, Search, Loader2, 
  AlertTriangle, RefreshCw, Volume2, X, Sparkles
} from 'lucide-react';

// Types
interface Affirmation {
  id: string;
  title?: string;
  declaration_number?: number | null;
  text: string;
  category: string;
  scripture_reference?: string;
  is_daily: boolean;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
}

interface AdminAffirmationManagerProps {
  onUpdate?: () => void;
}

// Affirmation Categories
const AFFIRMATION_CATEGORIES = [
  { value: 'faith',      label: 'Faith' },
  { value: 'healing',    label: 'Healing' },
  { value: 'provision',  label: 'Provision' },
  { value: 'peace',      label: 'Peace' },
  { value: 'wisdom',     label: 'Wisdom' },
  { value: 'identity',   label: 'Identity' },
  { value: 'family',     label: 'Family' },
  { value: 'strength',   label: 'Strength' },
  { value: 'love',       label: 'Love' },
  { value: 'prosperity', label: 'Prosperity' },
  { value: 'protection', label: 'Protection' },
  { value: 'purpose',    label: 'Purpose' },
];

export const AdminAffirmationManager: React.FC<AdminAffirmationManagerProps> = ({ onUpdate }) => {
  const { t } = useLanguage();
  // State
  const [affirmations, setAffirmations] = useState<Affirmation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Affirmation | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedAffirmation, setSelectedAffirmation] = useState<Affirmation | null>(null);
  const [showAudioPreview, setShowAudioPreview] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    declaration_number: null as number | null,
    text: '',
    category: 'faith',
    scripture_reference: '',
    is_daily: false,
    is_published: true
  });

  // AI generation state
  const [generating, setGenerating] = useState(false);

  // Load affirmations
  useEffect(() => {
    loadAffirmations();
  }, []);

  const loadAffirmations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('affirmations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAffirmations(data || []);
    } catch (err: any) {
      console.error('Error loading affirmations:', err);
      toast({
        title: t('adminAffirmationManager', 'error', 'Error'),
        description: t('adminAffirmationManager', 'failedToLoad', 'Failed to load affirmations'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle create
  const handleCreate = () => {
    setEditingItem(null);
    setFormData({
      title: '',
      declaration_number: null,
      text: '',
      category: 'faith',
      scripture_reference: '',
      is_daily: false,
      is_published: true
    });
    setShowModal(true);
  };

  // Handle edit
  const handleEdit = (affirmation: Affirmation) => {
    setEditingItem(affirmation);
    setFormData({
      title: affirmation.title || '',
      declaration_number: affirmation.declaration_number ?? null,
      text: affirmation.text,
      category: affirmation.category,
      scripture_reference: affirmation.scripture_reference || '',
      is_daily: affirmation.is_daily,
      is_published: affirmation.is_published
    });
    setShowModal(true);
  };

  // Handle save
  const handleSave = async () => {
    if (!formData.text.trim()) {
      toast({
        title: t('adminAffirmationManager', 'validationError', 'Validation Error'),
        description: t('adminAffirmationManager', 'textRequired', 'Affirmation text is required'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);

      const affirmationData = {
        title: formData.title.trim() || null,
        declaration_number: formData.declaration_number || null,
        text: formData.text.trim(),
        category: formData.category,
        scripture_reference: formData.scripture_reference.trim() || null,
        is_daily: formData.is_daily,
        is_published: formData.is_published,
        updated_at: new Date().toISOString()
      };

      if (editingItem) {
        // Update existing
        const { error } = await supabase
          .from('affirmations')
          .update(affirmationData)
          .eq('id', editingItem.id);

        if (error) throw error;
        toast({
          title: t('adminAffirmationManager', 'success', 'Success'),
          description: t('adminAffirmationManager', 'updatedSuccess', 'Affirmation updated successfully')
        });
      } else {
        // Create new
        const { error } = await supabase
          .from('affirmations')
          .insert({
            ...affirmationData,
            created_at: new Date().toISOString()
          });

        if (error) throw error;
        toast({
          title: t('adminAffirmationManager', 'success', 'Success'),
          description: t('adminAffirmationManager', 'createdSuccess', 'Affirmation created successfully')
        });
      }

      setShowModal(false);
      loadAffirmations();
      onUpdate?.();
    } catch (err: any) {
      console.error('Error saving affirmation:', err);
      toast({
        title: t('adminAffirmationManager', 'error', 'Error'),
        description: err.message || t('adminAffirmationManager', 'failedToSave', 'Failed to save affirmation'),
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!confirm(t('adminAffirmationManager', 'confirmDelete', 'Are you sure you want to delete this affirmation?'))) return;

    try {
      const { error } = await supabase
        .from('affirmations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: t('adminAffirmationManager', 'success', 'Success'),
        description: t('adminAffirmationManager', 'deletedSuccess', 'Affirmation deleted successfully')
      });

      loadAffirmations();
      onUpdate?.();
    } catch (err: any) {
      console.error('Error deleting affirmation:', err);
      toast({
        title: t('adminAffirmationManager', 'error', 'Error'),
        description: err.message || t('adminAffirmationManager', 'failedToDelete', 'Failed to delete affirmation'),
        variant: 'destructive'
      });
    }
  };

  // Toggle audio preview
  const toggleAudioPreview = (affirmationId: string) => {
    setShowAudioPreview(showAudioPreview === affirmationId ? null : affirmationId);
  };

  // AI Declaration Generator
  const generateDeclaration = async () => {
    const category = formData.category || 'faith';
    const scripture = formData.scripture_reference || '';
    const title = formData.title || '';
    setGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-declaration', {
        body: { category, title, scripture },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const text = data?.text || '';
      if (!text) throw new Error('Empty response');
      setFormData(prev => ({ ...prev, text }));
    } catch (err: any) {
      console.error('AI generation error:', err);
      let msg = err instanceof Error ? err.message : t('adminAffirmationManager', 'failedToGenerate', 'Failed to generate declaration');
      try { const body = await err?.context?.json?.(); if (body?.error) msg = body.error; } catch {}
      toast({ title: t('adminAffirmationManager', 'error', 'Error'), description: msg, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  // Filter affirmations
  const filteredAffirmations = affirmations.filter((item) =>
    Object.values(item).some((val) =>
      String(val).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            <span className="ml-2 text-gray-600">{t('adminAffirmationManager', 'loadingAffirmations', 'Loading affirmations...')}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-6 w-6 text-amber-500" />
            {t('adminAffirmationManager', 'title', 'Affirmation Manager')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="relative flex-1 w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('adminAffirmationManager', 'searchPlaceholder', 'Search affirmations...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={handleCreate} className="bg-amber-600 hover:bg-amber-700">
              <Plus className="h-4 w-4 mr-2" />
              {t('adminAffirmationManager', 'addAffirmation', 'Add Affirmation')}
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <Card className="bg-amber-50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-amber-600">{affirmations.length}</p>
                <p className="text-xs text-gray-600">{t('adminAffirmationManager', 'total', 'Total')}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {affirmations.filter(a => a.is_published).length}
                </p>
                <p className="text-xs text-gray-600">{t('adminAffirmationManager', 'published', 'Published')}</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {affirmations.filter(a => a.is_daily).length}
                </p>
                <p className="text-xs text-gray-600">{t('adminAffirmationManager', 'daily', 'Daily')}</p>
              </CardContent>
            </Card>
            <Card className="bg-purple-50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {new Set(affirmations.map(a => a.category)).size}
                </p>
                <p className="text-xs text-gray-600">{t('adminAffirmationManager', 'categories', 'Categories')}</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Affirmations Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('adminAffirmationManager', 'text', 'Text')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('adminAffirmationManager', 'titleNumber', 'Title / #')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('adminAffirmationManager', 'category', 'Category')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('adminAffirmationManager', 'scripture', 'Scripture')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('adminAffirmationManager', 'daily', 'Daily')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('adminAffirmationManager', 'published', 'Published')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('adminAffirmationManager', 'actions', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAffirmations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      {searchTerm ? t('adminAffirmationManager', 'noMatch', 'No affirmations found matching your search') : t('adminAffirmationManager', 'noAffirmations', 'No affirmations yet. Create your first one!')}
                    </td>
                  </tr>
                ) : (
                  filteredAffirmations.map((affirmation) => (
                    <React.Fragment key={affirmation.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm max-w-md">
                          <p className="line-clamp-2">{affirmation.text}</p>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {affirmation.title ? (
                            <div>
                              <p className="font-medium text-blue-700 truncate max-w-[140px]">{affirmation.title}</p>
                              {affirmation.declaration_number && (
                                <p className="text-xs text-gray-400">#{affirmation.declaration_number}</p>
                              )}
                            </div>
                          ) : affirmation.declaration_number ? (
                            <span className="text-xs text-gray-400">#{affirmation.declaration_number}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Badge variant="outline" className="capitalize">
                            {affirmation.category.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {affirmation.scripture_reference || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Badge variant={affirmation.is_daily ? 'default' : 'secondary'}>
                            {affirmation.is_daily ? t('adminAffirmationManager', 'yes', 'Yes') : t('adminAffirmationManager', 'no', 'No')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Badge variant={affirmation.is_published ? 'default' : 'secondary'}>
                            {affirmation.is_published ? t('adminAffirmationManager', 'yes', 'Yes') : t('adminAffirmationManager', 'no', 'No')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <div className="flex justify-end gap-2">
                            {/* TTS Preview Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleAudioPreview(affirmation.id)}
                              title={t('adminAffirmationManager', 'previewTTS', 'Preview TTS Audio')}
                            >
                              <Volume2 className="h-4 w-4 text-blue-500" />
                            </Button>

                            {/* Edit Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(affirmation)}
                              title={t('adminAffirmationManager', 'edit', 'Edit')}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>

                            {/* TTS Export Button */}
                            <UniversalTTSExportButton
                              contentType="affirmation"
                              contentId={affirmation.id}
                              contentTitle={affirmation.text.substring(0, 30) + '...'}
                              size="sm"
                            />

                            {/* Translate Button */}
                            <TranslateNowButton
                              contentType="affirmation"
                              contentId={affirmation.id}
                            />

                            {/* Delete Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(affirmation.id)}
                              title={t('adminAffirmationManager', 'delete', 'Delete')}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {/* Audio Preview Row */}
                      {showAudioPreview === affirmation.id && (
                        <tr>
                          <td colSpan={7} className="px-4 py-4 bg-gray-50">
                            <div className="bg-white rounded-lg p-4 shadow-sm">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <Volume2 className="h-5 w-5 text-blue-600" />
                                  <span className="text-sm font-medium text-gray-700">
                                    {t('adminAffirmationManager', 'ttsAudioPreview', 'TTS Audio Preview')}
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowAudioPreview(null)}
                                  className="h-6 w-6 p-0"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                              <HighQualityAudioPlayer
                                text={`${affirmation.text}${affirmation.scripture_reference ? `\n\nScripture: ${affirmation.scripture_reference}` : ''}`}
                                contentId={affirmation.id}
                                contentType="affirmation"
                                title={affirmation.text.substring(0, 50)}
                                autoLoad={true}
                                className="w-full"
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500" />
              {editingItem ? t('adminAffirmationManager', 'editAffirmation', 'Edit Affirmation') : t('adminAffirmationManager', 'createAffirmation', 'Create New Affirmation')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Title & Number row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label htmlFor="title">{t('adminAffirmationManager', 'titleLabel', 'Title')}</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('adminAffirmationManager', 'titlePlaceholder', 'e.g. The Spirit of Wisdom')}
                />
              </div>
              <div>
                <Label htmlFor="declaration_number">{t('adminAffirmationManager', 'numberLabel', 'Number')}</Label>
                <Input
                  id="declaration_number"
                  type="number"
                  value={formData.declaration_number ?? ''}
                  onChange={(e) => setFormData({ ...formData, declaration_number: parseInt(e.target.value) || null })}
                  placeholder={t('adminAffirmationManager', 'numberPlaceholder', 'e.g. 36')}
                />
              </div>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">{t('adminAffirmationManager', 'category', 'Category')}</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AFFIRMATION_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Scripture Reference */}
            <div className="space-y-2">
              <Label htmlFor="scripture">{t('adminAffirmationManager', 'scriptureRefLabel', 'Scripture Reference (Optional)')}</Label>
              <Input
                id="scripture"
                placeholder={t('adminAffirmationManager', 'scripturePlaceholder', 'e.g., Proverbs 4:7')}
                value={formData.scripture_reference}
                onChange={(e) => setFormData({ ...formData, scripture_reference: e.target.value })}
              />
            </div>

            {/* Declaration Text with AI Generate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="text">
                  {t('adminAffirmationManager', 'declarationText', 'Declaration Text')} <span className="text-red-500">*</span>
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={generateDeclaration}
                  disabled={generating}
                  className="gap-1.5 text-purple-600 border-purple-200 hover:bg-purple-50"
                >
                  {generating ? (
                    <><Loader2 className="h-3 w-3 animate-spin" />{t('adminAffirmationManager', 'generating', 'Generating...')}</>
                  ) : (
                    <><Sparkles className="h-3 w-3" />{t('adminAffirmationManager', 'aiGenerate', 'AI Generate')}</>
                  )}
                </Button>
              </div>
              <Textarea
                id="text"
                placeholder={t('adminAffirmationManager', 'declarationPlaceholder', "Today, I speak over my life and my household that...\n\nI am not stranded, nor am I lost in confusion...\n\nIn Jesus's name, I believe and say amen.")}
                value={formData.text}
                onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                rows={10}
                className="font-serif text-base leading-relaxed"
              />
              <p className="text-xs text-gray-400">
                {t('adminAffirmationManager', 'patternHelp', 'Pattern: Opening sentence → Declarations (I am, I have, I walk...) → "In Jesus\'s name, I believe and say amen."')}
              </p>
            </div>

            {/* Preview */}
            {(formData.title || formData.text) && (
              <div className="pt-4 border-t">
                <Label className="mb-2 block text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('adminAffirmationManager', 'preview', 'Preview')}</Label>
                <div className="border rounded-lg p-4 bg-white space-y-3">
                  {formData.declaration_number && (
                    <p className="text-xs text-gray-400">#{formData.declaration_number}</p>
                  )}
                  {formData.title && (
                    <h3 className="text-xl font-bold text-blue-700 underline text-center">{formData.title}</h3>
                  )}
                  {formData.text && (
                    <p className="text-sm leading-relaxed whitespace-pre-line text-justify">{formData.text}</p>
                  )}
                  {formData.scripture_reference && (
                    <p className="text-sm text-amber-600 italic text-center">— {formData.scripture_reference}</p>
                  )}
                </div>
              </div>
            )}

            {/* Switches */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t('adminAffirmationManager', 'includeDaily', 'Include in daily rotation')}</p>
                  <p className="text-xs text-gray-500">{t('adminAffirmationManager', 'includeDailyDesc', 'Show this in the daily affirmation widget')}</p>
                </div>
                <Switch
                  id="is_daily"
                  checked={formData.is_daily}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_daily: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t('adminAffirmationManager', 'published', 'Published')}</p>
                  <p className="text-xs text-gray-500">{t('adminAffirmationManager', 'makeVisible', 'Make visible to users')}</p>
                </div>
                <Switch
                  id="is_published"
                  checked={formData.is_published}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowModal(false)}
              className="w-full sm:w-auto"
            >
              {t('adminAffirmationManager', 'cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('adminAffirmationManager', 'saving', 'Saving...')}
                </>
              ) : (
                t('adminAffirmationManager', 'saveAffirmation', 'Save Affirmation')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAffirmationManager;