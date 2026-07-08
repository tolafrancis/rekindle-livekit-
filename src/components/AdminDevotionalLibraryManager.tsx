import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from './ui/use-toast';
import { UniversalTTSExportButton } from '@/components/UniversalTTSExportButton';
import { TranslateNowButton } from '@/components/TranslateNowButton';
import {
  BookOpen, Plus, Edit, Trash2, Search, Calendar, Clock, Upload,
  Save, X, AlertCircle, CheckCircle, Star, Eye, EyeOff, Loader2,
  List, Grid, Filter, SortAsc, RefreshCw, Copy, FileText, Download, Link, Image as ImageIcon
} from 'lucide-react';

// Inline cover-image field: paste a URL or upload a file
const CoverImageField: React.FC<{
  value: string;
  onChange: (url: string) => void;
  label?: string;
  bucket?: string;
  aspect?: 'square' | 'wide';
  promptSubject?: string;
}> = ({ value, onChange, label, bucket = 'channel-featured', aspect = 'wide' }) => {
  const { t } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const resolvedLabel = label ?? t('adminDevotionalLibraryManager', 'coverImage', 'Cover Image');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `cover-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
      onChange(publicUrl);
      toast({ title: t('adminDevotionalLibraryManager', 'imageUploaded', 'Image uploaded') });
    } catch (err: any) {
      toast({ title: t('adminDevotionalLibraryManager', 'uploadFailed', 'Upload failed'), description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const previewClass = aspect === 'square' ? 'w-16 h-16' : 'w-full h-28';

  return (
    <div>
      <Label>{resolvedLabel}</Label>
      <div className="mt-1 space-y-2">
        {value ? (
          <img src={value} alt="Cover preview" className={`${previewClass} rounded-lg object-cover border`} />
        ) : (
          <div className={`${previewClass} rounded-lg border flex items-center justify-center bg-gray-50`}>
            <ImageIcon className="h-5 w-5 text-gray-300" />
          </div>
        )}
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={t('adminDevotionalLibraryManager', 'pasteImageUrl', 'Paste image URL…')} />
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 cursor-pointer hover:text-purple-700">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? t('adminDevotionalLibraryManager', 'uploading', 'Uploading…') : t('adminDevotionalLibraryManager', 'uploadFile', 'Upload file')}
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
    </div>
  );
};

// Bible API utility for fetching scripture
const fetchScripture = async (reference: string, version: string = 'kjv'): Promise<{ text: string; reference: string } | null> => {
  try {
    // Clean up the reference
    const cleanRef = reference.trim();
    
    // Bible API doesn't require version in URL, it uses default translation
    // For simplicity, we'll use bible-api.com which provides KJV by default
    const response = await fetch(`https://bible-api.com/${encodeURIComponent(cleanRef)}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch scripture');
    }
    
    const data = await response.json();
    
    return {
      text: data.text?.trim() || '',
      reference: data.reference || cleanRef
    };
  } catch (error) {
    console.error('Error fetching scripture:', error);
    return null;
  }
};

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  display_order: number;
  is_active: boolean;
}

interface Series {
  id: string;
  category_id: string;
  title: string;
  subtitle?: string;
  description: string;
  author?: string;
  author_social_url?: string;
  cover_image_url?: string;
  background_music_url?: string;
  total_days: number;
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
  target_audience?: string;
  ministry_id?: string;
  tags?: string[];
  keywords?: string[];
  is_featured: boolean;
  is_published: boolean;
  published_at?: string;
  created_at: string;
}

interface ScriptureReference {
  reference: string;
  text: string;
  version: string;
  is_primary: boolean;
}

interface Entry {
  id: string;
  series_id: string;
  day_number: number;
  title: string;
  subtitle?: string;
  scripture_references?: ScriptureReference[];
  introduction?: string;
  main_content: string;
  reflection_questions?: string[];
  guided_prayer?: string;
  action_steps?: string[];
  additional_thoughts?: string;
  audio_url?: string;
  video_url?: string;
  image_url?: string;
  estimated_reading_time: number;
  themes?: string[];
  is_published: boolean;
}

export const AdminDevotionalLibraryManager: React.FC = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'series' | 'entries' | 'categories'>('series');
  const [categories, setCategories] = useState<Category[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Modals
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingSeries, setEditingSeries] = useState<Series | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    loadCategories();
    loadSeries();
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (selectedSeries) {
      loadEntries(selectedSeries.id);
    }
  }, [selectedSeries]);

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('devotional_categories')
        .select('*')
        .order('display_order');
      
      if (error) throw error;
      if (isMounted.current) setCategories(data || []);
    } catch (err: any) {
      console.error('Error loading categories:', err);
      toast({ title: t('adminDevotionalLibraryManager', 'error', 'Error'), description: t('adminDevotionalLibraryManager', 'failedLoadCategories', 'Failed to load categories'), variant: 'destructive' });
    }
  };

  const loadSeries = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('devotional_series')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterCategory !== 'all') {
        query = query.eq('category_id', filterCategory);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (isMounted.current) setSeries(data || []);
    } catch (err: any) {
      console.error('Error loading series:', err);
      toast({ title: t('adminDevotionalLibraryManager', 'error', 'Error'), description: t('adminDevotionalLibraryManager', 'failedLoadSeries', 'Failed to load series'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadEntries = async (seriesId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('devotional_entries')
        .select('*')
        .eq('series_id', seriesId)
        .order('day_number');
      
      if (error) throw error;
      if (isMounted.current) setEntries(data || []);
    } catch (err: any) {
      console.error('Error loading entries:', err);
      toast({ title: t('adminDevotionalLibraryManager', 'error', 'Error'), description: t('adminDevotionalLibraryManager', 'failedLoadEntries', 'Failed to load entries'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCategory = async (categoryData: Partial<Category>) => {
    try {
      if (editingCategory) {
        const { error } = await supabase
          .from('devotional_categories')
          .update(categoryData)
          .eq('id', editingCategory.id);
        
        if (error) throw error;
        toast({ title: t('adminDevotionalLibraryManager', 'success', 'Success'), description: t('adminDevotionalLibraryManager', 'categoryUpdated', 'Category updated successfully') });
      } else {
        const { error } = await supabase
          .from('devotional_categories')
          .insert(categoryData);
        
        if (error) throw error;
        toast({ title: t('adminDevotionalLibraryManager', 'success', 'Success'), description: t('adminDevotionalLibraryManager', 'categoryCreated', 'Category created successfully') });
      }

      setShowCategoryModal(false);
      setEditingCategory(null);
      loadCategories();
    } catch (err: any) {
      console.error('Error saving category:', err);
      toast({ title: t('adminDevotionalLibraryManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (!window.confirm(t('adminDevotionalLibraryManager', 'confirmDeleteCategory', 'Delete category "{name}"? Series in this category will become uncategorized.').replace('{name}', String(cat.name)))) {
      return;
    }
    try {
      // Detach any series first so the delete isn't blocked by the foreign key.
      const { error: detachError } = await supabase
        .from('devotional_series')
        .update({ category_id: null })
        .eq('category_id', cat.id);

      if (detachError) {
        // The column is likely still NOT NULL — ask the admin to reassign first.
        toast({
          title: t('adminDevotionalLibraryManager', 'reassignSeriesFirst', 'Reassign series first'),
          description: t('adminDevotionalLibraryManager', 'reassignSeriesDesc', 'This category still has series assigned. Move them to another category, then delete.'),
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('devotional_categories')
        .delete()
        .eq('id', cat.id);

      if (error) throw error;

      toast({ title: t('adminDevotionalLibraryManager', 'deleted', 'Deleted'), description: t('adminDevotionalLibraryManager', 'categoryRemoved', 'Category "{name}" removed').replace('{name}', String(cat.name)) });
      loadCategories();
      loadSeries();
    } catch (err: any) {
      console.error('Error deleting category:', err);
      toast({ title: t('adminDevotionalLibraryManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleSaveSeries = async (seriesData: Partial<Series>) => {
    try {
      if (editingSeries) {
        const { error } = await supabase
          .from('devotional_series')
          .update(seriesData)
          .eq('id', editingSeries.id);
        
        if (error) throw error;
        toast({ title: t('adminDevotionalLibraryManager', 'success', 'Success'), description: t('adminDevotionalLibraryManager', 'seriesUpdated', 'Series updated successfully') });
      } else {
        const { error } = await supabase
          .from('devotional_series')
          .insert(seriesData);
        
        if (error) throw error;
        toast({ title: t('adminDevotionalLibraryManager', 'success', 'Success'), description: t('adminDevotionalLibraryManager', 'seriesCreated', 'Series created successfully') });
      }

      setShowSeriesModal(false);
      setEditingSeries(null);
      loadSeries();
    } catch (err: any) {
      console.error('Error saving series:', err);
      toast({ title: t('adminDevotionalLibraryManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteSeries = async (seriesId: string) => {
    if (!confirm(t('adminDevotionalLibraryManager', 'confirmDeleteSeries', 'Are you sure you want to delete this series? This will also delete all entries.'))) {
      return;
    }

    try {
      const { error } = await supabase
        .from('devotional_series')
        .delete()
        .eq('id', seriesId);

      if (error) throw error;
      toast({ title: t('adminDevotionalLibraryManager', 'success', 'Success'), description: t('adminDevotionalLibraryManager', 'seriesDeleted', 'Series deleted successfully') });
      loadSeries();
    } catch (err: any) {
      console.error('Error deleting series:', err);
      toast({ title: t('adminDevotionalLibraryManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const filteredSeries = series.filter(s => 
    s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t('adminDevotionalLibraryManager', 'title', 'Devotional Library Manager')}</h1>
          <p className="text-gray-500 mt-1">{t('adminDevotionalLibraryManager', 'pageSubtitle', 'Manage devotional categories, series, and entries')}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setEditingCategory(null); setShowCategoryModal(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            {t('adminDevotionalLibraryManager', 'newCategory', 'New Category')}
          </Button>
          <Button onClick={() => { setEditingSeries(null); setShowSeriesModal(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            {t('adminDevotionalLibraryManager', 'newSeries', 'New Series')}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'series' | 'entries' | 'categories')}>
        <TabsList>
          <TabsTrigger value="series">{t('adminDevotionalLibraryManager', 'seriesTab', 'Series')} ({series.length})</TabsTrigger>
          <TabsTrigger value="entries">{t('adminDevotionalLibraryManager', 'entriesTab', 'Entries')} ({entries.length})</TabsTrigger>
          <TabsTrigger value="categories">{t('adminDevotionalLibraryManager', 'categoriesTab', 'Categories')} ({categories.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-3">
          {categories.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {t('adminDevotionalLibraryManager', 'noCategoriesYet', 'No categories yet. Click "New Category" to add one.')}
            </div>
          ) : (
            categories.map(cat => (
              <div
                key={cat.id}
                className="flex items-center justify-between gap-4 rounded-lg border bg-white p-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: cat.color || '#7c3aed' }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{cat.name}</p>
                      {!cat.is_active && (
                        <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">{t('adminDevotionalLibraryManager', 'hidden', 'Hidden')}</span>
                      )}
                    </div>
                    {cat.description && (
                      <p className="text-sm text-gray-500 truncate">{cat.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setEditingCategory(cat); setShowCategoryModal(true); }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => handleDeleteCategory(cat)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="series" className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4 items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('adminDevotionalLibraryManager', 'searchSeries', 'Search series...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={t('adminDevotionalLibraryManager', 'filterByCategory', 'Filter by category')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('adminDevotionalLibraryManager', 'allCategories', 'All Categories')}</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Series List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
              {filteredSeries.map(item => (
                <Card key={item.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{item.title}</CardTitle>
                        {item.subtitle && (
                          <p className="text-sm text-gray-500 mt-1">{item.subtitle}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {item.is_featured && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                        {item.is_published ? (
                          <Eye className="h-4 w-4 text-green-500" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <p className="text-sm text-gray-600 line-clamp-2">{item.description}</p>
                      
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{t('adminDevotionalLibraryManager', 'daysCount', '{count} days').replace('{count}', String(item.total_days))}</Badge>
                        {item.difficulty_level && (
                          <Badge variant="secondary">{item.difficulty_level}</Badge>
                        )}
                        {item.tags?.slice(0, 2).map(tag => (
                          <Badge key={tag} variant="outline">{tag}</Badge>
                        ))}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedSeries(item);
                            setActiveTab('entries');
                          }}
                        >
                          <BookOpen className="h-4 w-4 mr-1" />
                          {t('adminDevotionalLibraryManager', 'viewEntries', 'View Entries')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingSeries(item);
                            setShowSeriesModal(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        
                        {/* TTS Export Button */}
                        <UniversalTTSExportButton
                          contentType="devotional_series"
                          contentId={item.id}
                          contentTitle={item.title}
                          size="sm"
                        />

                        <TranslateNowButton contentType="devotional_series" contentId={item.id} />

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSeries(item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {filteredSeries.length === 0 && !loading && (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">{t('adminDevotionalLibraryManager', 'noSeriesFound', 'No series found')}</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => { setEditingSeries(null); setShowSeriesModal(true); }}
              >
                {t('adminDevotionalLibraryManager', 'createFirstSeries', 'Create Your First Series')}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="entries" className="space-y-4">
          {selectedSeries ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>{selectedSeries.title}</CardTitle>
                      <p className="text-sm text-gray-500 mt-1">
                        {t('adminDevotionalLibraryManager', 'entriesOfTotal', '{count} of {total} entries').replace('{count}', String(entries.length)).replace('{total}', String(selectedSeries.total_days))}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          setEditingEntry(null);
                          setShowEntryModal(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {t('adminDevotionalLibraryManager', 'newEntry', 'New Entry')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedSeries(null)}
                      >
                        <X className="h-4 w-4 mr-2" />
                        {t('adminDevotionalLibraryManager', 'close', 'Close')}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {entries.map(entry => (
                    <Card key={entry.id}>
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <Badge variant="outline" className="mb-2">{t('adminDevotionalLibraryManager', 'dayLabel', 'Day {number}').replace('{number}', String(entry.day_number))}</Badge>
                            <CardTitle className="text-base">{entry.title}</CardTitle>
                            {entry.subtitle && (
                              <p className="text-xs text-gray-500 mt-1">{entry.subtitle}</p>
                            )}
                          </div>
                          {entry.is_published ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {entry.scripture_references && entry.scripture_references.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {entry.scripture_references.map((ref, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {ref.reference}
                                </Badge>
                              ))}
                            </div>
                          )}
                          
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Clock className="h-3 w-3" />
                            <span>{t('adminDevotionalLibraryManager', 'minRead', '{count} min read').replace('{count}', String(entry.estimated_reading_time))}</span>
                          </div>

                          <div className="flex gap-2 pt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingEntry(entry);
                                setShowEntryModal(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <TranslateNowButton contentType="devotional_entry" contentId={entry.id} />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                // Handle delete
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {entries.length === 0 && !loading && (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">{t('adminDevotionalLibraryManager', 'noEntriesYet', 'No entries yet')}</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => {
                      setEditingEntry(null);
                      setShowEntryModal(true);
                    }}
                  >
                    {t('adminDevotionalLibraryManager', 'createFirstEntry', 'Create First Entry')}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">{t('adminDevotionalLibraryManager', 'selectSeriesToView', 'Select a series to view entries')}</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setActiveTab('series')}
              >
                {t('adminDevotionalLibraryManager', 'viewSeries', 'View Series')}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Category Modal */}
      <CategoryModal
        show={showCategoryModal}
        category={editingCategory}
        onClose={() => {
          setShowCategoryModal(false);
          setEditingCategory(null);
        }}
        onSave={handleSaveCategory}
      />

      {/* Series Modal */}
      <SeriesModal
        show={showSeriesModal}
        series={editingSeries}
        categories={categories}
        onClose={() => {
          setShowSeriesModal(false);
          setEditingSeries(null);
        }}
        onSave={handleSaveSeries}
      />

      {/* Entry Modal */}
      <EntryModal
        show={showEntryModal}
        entry={editingEntry}
        seriesId={selectedSeries?.id || ''}
        onClose={() => {
          setShowEntryModal(false);
          setEditingEntry(null);
        }}
        onSave={(entryData) => {
          // Handle save entry
          loadEntries(selectedSeries!.id);
        }}
      />
    </div>
  );
};

// Category Modal Component
const CategoryModal: React.FC<{
  show: boolean;
  category: Category | null;
  onClose: () => void;
  onSave: (data: Partial<Category>) => void;
}> = ({ show, category, onClose, onSave }) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<Partial<Category>>({});

  useEffect(() => {
    if (category) {
      setFormData(category);
    } else {
      setFormData({
        name: '',
        description: '',
        icon: '',
        color: '#3b82f6',
        display_order: 0,
        is_active: true
      });
    }
  }, [category]);

  const handleSubmit = () => {
    if (!formData.name) {
      toast({ title: t('adminDevotionalLibraryManager', 'error', 'Error'), description: t('adminDevotionalLibraryManager', 'nameRequired', 'Name is required'), variant: 'destructive' });
      return;
    }
    onSave(formData);
  };

  return (
    <Dialog open={show} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? t('adminDevotionalLibraryManager', 'editCategory', 'Edit Category') : t('adminDevotionalLibraryManager', 'newCategory', 'New Category')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t('adminDevotionalLibraryManager', 'nameRequiredLabel', 'Name *')}</Label>
            <Input
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('adminDevotionalLibraryManager', 'categoryNamePlaceholder', 'e.g., Faith Journey')}
            />
          </div>
          <div>
            <Label>{t('adminDevotionalLibraryManager', 'description', 'Description')}</Label>
            <Textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('adminDevotionalLibraryManager', 'briefDescription', 'Brief description...')}
            />
          </div>
          <div>
            <Label>{t('adminDevotionalLibraryManager', 'color', 'Color')}</Label>
            <Input
              type="color"
              value={formData.color || '#3b82f6'}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              className="h-10 w-20 p-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={formData.is_active || false}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
            <Label>{t('adminDevotionalLibraryManager', 'active', 'Active')}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('adminDevotionalLibraryManager', 'cancel', 'Cancel')}</Button>
          <Button onClick={handleSubmit}>
            <Save className="h-4 w-4 mr-2" />
            {t('adminDevotionalLibraryManager', 'save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Series Modal Component
const SeriesModal: React.FC<{
  show: boolean;
  series: Series | null;
  categories: Category[];
  onClose: () => void;
  onSave: (data: Partial<Series>) => void;
}> = ({ show, series, categories, onClose, onSave }) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<Partial<Series>>({});

  useEffect(() => {
    if (series) {
      setFormData(series);
    } else {
      setFormData({
        title: '',
        description: '',
        cover_image_url: '',
        total_days: 7,
        is_featured: false,
        is_published: false,
        tags: [],
        keywords: []
      });
    }
  }, [series]);

  const handleSubmit = () => {
    if (!formData.title || !formData.category_id) {
      toast({ title: t('adminDevotionalLibraryManager', 'error', 'Error'), description: t('adminDevotionalLibraryManager', 'titleCategoryRequired', 'Title and category are required'), variant: 'destructive' });
      return;
    }
    onSave(formData);
  };

  return (
    <Dialog open={show} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{series ? t('adminDevotionalLibraryManager', 'editSeries', 'Edit Series') : t('adminDevotionalLibraryManager', 'newSeries', 'New Series')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t('adminDevotionalLibraryManager', 'categoryRequiredLabel', 'Category *')}</Label>
            <Select
              value={formData.category_id || ''}
              onValueChange={(value) => setFormData({ ...formData, category_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('adminDevotionalLibraryManager', 'selectCategory', 'Select category')} />
              </SelectTrigger>
              <SelectContent>
                {categories.filter(cat => cat.is_active).map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('adminDevotionalLibraryManager', 'titleRequiredLabel', 'Title *')}</Label>
            <Input
              value={formData.title || ''}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder={t('adminDevotionalLibraryManager', 'seriesTitlePlaceholder', 'e.g., 30 Days of Faith')}
            />
          </div>
          <div>
            <Label>{t('adminDevotionalLibraryManager', 'subtitle', 'Subtitle')}</Label>
            <Input
              value={formData.subtitle || ''}
              onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
              placeholder={t('adminDevotionalLibraryManager', 'optionalSubtitle', 'Optional subtitle')}
            />
          </div>
          <div>
            <Label>{t('adminDevotionalLibraryManager', 'description', 'Description')}</Label>
            <Textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('adminDevotionalLibraryManager', 'seriesDescriptionPlaceholder', 'Series description...')}
              rows={4}
            />
          </div>
          <CoverImageField
            label={t('adminDevotionalLibraryManager', 'coverImage', 'Cover Image')}
            value={formData.cover_image_url || ''}
            onChange={(url) => setFormData({ ...formData, cover_image_url: url })}
            promptSubject={formData.title || ''}
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('adminDevotionalLibraryManager', 'totalDaysRequiredLabel', 'Total Days *')}</Label>
              <Input
                type="number"
                value={formData.total_days || 7}
                onChange={(e) => setFormData({ ...formData, total_days: parseInt(e.target.value) })}
                min={1}
              />
            </div>
            <div>
              <Label>{t('adminDevotionalLibraryManager', 'difficultyLevel', 'Difficulty Level')}</Label>
              <Select
                value={formData.difficulty_level || ''}
                onValueChange={(value) => setFormData({ ...formData, difficulty_level: value as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('adminDevotionalLibraryManager', 'selectLevel', 'Select level')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">{t('adminDevotionalLibraryManager', 'beginner', 'Beginner')}</SelectItem>
                  <SelectItem value="intermediate">{t('adminDevotionalLibraryManager', 'intermediate', 'Intermediate')}</SelectItem>
                  <SelectItem value="advanced">{t('adminDevotionalLibraryManager', 'advanced', 'Advanced')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{t('adminDevotionalLibraryManager', 'tags', 'Tags')}</Label>
            {(() => {
              const tags: string[] = formData.tags || [];
              return (
                <div
                  className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm flex flex-wrap gap-1.5 items-center cursor-text focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
                  onClick={(e) => {
                    const input = (e.currentTarget as HTMLDivElement).querySelector('input');
                    if (input) input.focus();
                  }}
                >
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="flex items-center gap-1 pr-1">
                      {tag}
                      <button
                        type="button"
                        className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5 leading-none"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormData({ ...formData, tags: tags.filter(item => item !== tag) });
                        }}
                        title={t('adminDevotionalLibraryManager', 'removeTag', 'Remove "{tag}"').replace('{tag}', String(tag))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <input
                    className="flex-1 min-w-[120px] outline-none bg-transparent placeholder:text-muted-foreground text-sm"
                    placeholder={tags.length === 0 ? t('adminDevotionalLibraryManager', 'tagInputEmpty', 'Type a tag, then press comma, Enter or Space…') : t('adminDevotionalLibraryManager', 'tagInputAdd', 'Add another tag…')}
                    onKeyDown={(e) => {
                      const val = (e.target as HTMLInputElement).value.trim();
                      // Commit on comma, Enter, or Space
                      if ((e.key === ',' || e.key === 'Enter' || e.key === ' ') && val) {
                        e.preventDefault();
                        const newTag = val.replace(/,/g, '').trim();
                        if (newTag && !tags.includes(newTag)) {
                          setFormData({ ...formData, tags: [...tags, newTag] });
                        }
                        (e.target as HTMLInputElement).value = '';
                      }
                      // Backspace on empty input removes last tag
                      if (e.key === 'Backspace' && !val && tags.length > 0) {
                        setFormData({ ...formData, tags: tags.slice(0, -1) });
                      }
                    }}
                    onBlur={(e) => {
                      // Commit whatever is left when focus leaves
                      const val = e.target.value.trim().replace(/,/g, '').trim();
                      if (val && !tags.includes(val)) {
                        setFormData({ ...formData, tags: [...tags, val] });
                      }
                      e.target.value = '';
                    }}
                  />
                </div>
              );
            })()}
            <p className="text-xs text-muted-foreground mt-1">{t('adminDevotionalLibraryManager', 'tagHelper', 'Press comma, Enter, or Space to add a tag. Backspace removes the last tag.')}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_featured || false}
                onCheckedChange={(checked) => setFormData({ ...formData, is_featured: checked })}
              />
              <Label>{t('adminDevotionalLibraryManager', 'featured', 'Featured')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_published || false}
                onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
              />
              <Label>{t('adminDevotionalLibraryManager', 'published', 'Published')}</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('adminDevotionalLibraryManager', 'cancel', 'Cancel')}</Button>
          <Button onClick={handleSubmit}>
            <Save className="h-4 w-4 mr-2" />
            {t('adminDevotionalLibraryManager', 'saveSeries', 'Save Series')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Entry Modal Component
const EntryModal: React.FC<{
  show: boolean;
  entry: Entry | null;
  seriesId: string;
  onClose: () => void;
  onSave: (data: Partial<Entry>) => void;
}> = ({ show, entry, seriesId, onClose, onSave }) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<Partial<Entry>>({});
  const [scriptureInput, setScriptureInput] = useState('');
  const [scriptureVersion, setScriptureVersion] = useState('kjv');
  const [loadingScripture, setLoadingScripture] = useState(false);

  useEffect(() => {
    if (entry) {
      // DB stores content in "content" column — map it to "main_content" for the form
      setFormData({
        ...entry,
        main_content: entry.main_content || (entry as any).content || '',
      });
    } else {
      setFormData({
        series_id: seriesId,
        day_number: 1,
        title: '',
        main_content: '',
        image_url: '',
        estimated_reading_time: 5,
        is_published: false,
        scheduled_date: null,
        scripture_references: [],
        reflection_questions: [],
        action_steps: []
      });
    }
  }, [entry, seriesId]);

  const handleLoadScripture = async () => {
    if (!scriptureInput.trim()) return;
    
    setLoadingScripture(true);
    try {
      const result = await fetchScripture(scriptureInput, scriptureVersion);
      if (result) {
        const newRef: ScriptureReference = {
          reference: result.reference,
          text: result.text,
          version: scriptureVersion.toUpperCase(),
          is_primary: (formData.scripture_references?.length || 0) === 0
        };
        
        setFormData({
          ...formData,
          scripture_references: [...(formData.scripture_references || []), newRef]
        });
        
        setScriptureInput('');
        toast({ title: t('adminDevotionalLibraryManager', 'success', 'Success'), description: t('adminDevotionalLibraryManager', 'scriptureLoaded', 'Scripture loaded successfully') });
      } else {
        toast({ title: t('adminDevotionalLibraryManager', 'error', 'Error'), description: t('adminDevotionalLibraryManager', 'failedLoadScripture', 'Failed to load scripture'), variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: t('adminDevotionalLibraryManager', 'error', 'Error'), description: t('adminDevotionalLibraryManager', 'failedLoadScripture', 'Failed to load scripture'), variant: 'destructive' });
    } finally {
      setLoadingScripture(false);
    }
  };

  const handleSetPrimaryScripture = (index: number) => {
    const updated = formData.scripture_references?.map((ref, i) => ({
      ...ref,
      is_primary: i === index
    })) || [];
    setFormData({ ...formData, scripture_references: updated });
  };

  const handleRemoveScripture = (index: number) => {
    const updated = formData.scripture_references?.filter((_, i) => i !== index) || [];
    setFormData({ ...formData, scripture_references: updated });
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.main_content) {
      toast({ title: t('adminDevotionalLibraryManager', 'error', 'Error'), description: t('adminDevotionalLibraryManager', 'titleContentRequired', 'Title and main content are required'), variant: 'destructive' });
      return;
    }

    // The DB column is "content" (NOT NULL) but the form uses "main_content".
    // Always send both so the constraint is satisfied regardless of column name.
    const payload = {
      ...formData,
      content: formData.main_content,
    };

    try {
      if (entry) {
        const { error } = await supabase
          .from('devotional_entries')
          .update(payload)
          .eq('id', entry.id);
        
        if (error) throw error;
        toast({ title: t('adminDevotionalLibraryManager', 'success', 'Success'), description: t('adminDevotionalLibraryManager', 'entryUpdated', 'Entry updated successfully') });
      } else {
        const { error } = await supabase
          .from('devotional_entries')
          .insert(payload);
        
        if (error) throw error;
        toast({ title: t('adminDevotionalLibraryManager', 'success', 'Success'), description: t('adminDevotionalLibraryManager', 'entryCreated', 'Entry created successfully') });
      }

      onSave(formData);
      onClose();
    } catch (err: any) {
      console.error('Error saving entry:', err);
      toast({ title: t('adminDevotionalLibraryManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={show} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? t('adminDevotionalLibraryManager', 'editEntry', 'Edit Entry') : t('adminDevotionalLibraryManager', 'newEntry', 'New Entry')}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">{t('adminDevotionalLibraryManager', 'basicTab', 'Basic')}</TabsTrigger>
            <TabsTrigger value="scripture">{t('adminDevotionalLibraryManager', 'scriptureTab', 'Scripture')}</TabsTrigger>
            <TabsTrigger value="content">{t('adminDevotionalLibraryManager', 'contentTab', 'Content')}</TabsTrigger>
            <TabsTrigger value="media">{t('adminDevotionalLibraryManager', 'mediaTab', 'Media')}</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminDevotionalLibraryManager', 'dayNumberLabel', 'Day Number *')}</Label>
                <Input
                  type="number"
                  value={formData.day_number || 1}
                  onChange={(e) => setFormData({ ...formData, day_number: parseInt(e.target.value) })}
                  min={1}
                />
              </div>
              <div>
                <Label>{t('adminDevotionalLibraryManager', 'readingTimeLabel', 'Reading Time (minutes) *')}</Label>
                <Input
                  type="number"
                  value={formData.estimated_reading_time || 5}
                  onChange={(e) => setFormData({ ...formData, estimated_reading_time: parseInt(e.target.value) })}
                  min={1}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 items-end">
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  checked={formData.is_published || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
                />
                <Label>{t('adminDevotionalLibraryManager', 'published', 'Published')}</Label>
              </div>
              <div>
                <Label>{t('adminDevotionalLibraryManager', 'scheduleDate', 'Schedule Date (optional)')}</Label>
                <Input
                  type="date"
                  value={formData.scheduled_date || ''}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value || null })}
                />
                <p className="text-xs text-gray-500 mt-1">{t('adminDevotionalLibraryManager', 'leaveEmptyPublish', 'Leave empty to publish immediately')}</p>
              </div>
            </div>
            <div>
              <Label>{t('adminDevotionalLibraryManager', 'titleRequiredLabel', 'Title *')}</Label>
              <Input
                value={formData.title || ''}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('adminDevotionalLibraryManager', 'entryTitlePlaceholder', 'e.g., The Foundation of Faith')}
              />
            </div>
            <div>
              <Label>{t('adminDevotionalLibraryManager', 'subtitle', 'Subtitle')}</Label>
              <Input
                value={formData.subtitle || ''}
                onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                placeholder={t('adminDevotionalLibraryManager', 'optionalSubtitle', 'Optional subtitle')}
              />
            </div>
            <div>
              <Label>{t('adminDevotionalLibraryManager', 'themesLabel', 'Themes (comma-separated)')}</Label>
              <Input
                value={formData.themes?.join(', ') || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  themes: e.target.value.split(',').map(item => item.trim()).filter(Boolean)
                })}
                placeholder={t('adminDevotionalLibraryManager', 'themesPlaceholder', 'faith, hope, love')}
              />
            </div>
          </TabsContent>

          <TabsContent value="scripture" className="space-y-4">
            <div className="border rounded-lg p-4 bg-gray-50">
              <Label className="mb-2 block">{t('adminDevotionalLibraryManager', 'loadScriptureFromApi', 'Load Scripture from Bible API')}</Label>
              <div className="flex gap-2">
                <Input
                  value={scriptureInput}
                  onChange={(e) => setScriptureInput(e.target.value)}
                  placeholder={t('adminDevotionalLibraryManager', 'scriptureRefPlaceholder', 'e.g., John 3:16 or Psalm 23:1-6')}
                  onKeyDown={(e) => e.key === 'Enter' && handleLoadScripture()}
                />
                <Select value={scriptureVersion} onValueChange={setScriptureVersion}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kjv">KJV</SelectItem>
                    <SelectItem value="niv">NIV</SelectItem>
                    <SelectItem value="esv">ESV</SelectItem>
                    <SelectItem value="nkjv">NKJV</SelectItem>
                    <SelectItem value="nlt">NLT</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleLoadScripture} disabled={loadingScripture}>
                  {loadingScripture ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {t('adminDevotionalLibraryManager', 'supportedFormats', 'Supported formats: "John 3:16", "Psalm 23:1-6", "Romans 8:28,31", "Genesis 1"')}
              </p>
            </div>

            {formData.scripture_references && formData.scripture_references.length > 0 && (
              <div className="space-y-3">
                <Label>{t('adminDevotionalLibraryManager', 'scriptureReferences', 'Scripture References')} ({formData.scripture_references.length})</Label>
                {formData.scripture_references.map((scripture, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={scripture.is_primary ? "default" : "outline"}>
                          {scripture.is_primary ? t('adminDevotionalLibraryManager', 'primary', 'Primary') : t('adminDevotionalLibraryManager', 'secondary', 'Secondary')}
                        </Badge>
                        <span className="font-semibold">{scripture.reference}</span>
                        <Badge variant="secondary">{scripture.version}</Badge>
                      </div>
                      <div className="flex gap-1">
                        {!scripture.is_primary && (
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleSetPrimaryScripture(index)}
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => handleRemoveScripture(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={scripture.text}
                      onChange={(e) => {
                        const updated = [...(formData.scripture_references || [])];
                        updated[index] = { ...updated[index], text: e.target.value };
                        setFormData({ ...formData, scripture_references: updated });
                      }}
                      rows={3}
                      className="text-sm"
                    />
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="content" className="space-y-4">
            <div>
              <Label>{t('adminDevotionalLibraryManager', 'introduction', 'Introduction')}</Label>
              <Textarea
                value={formData.introduction || ''}
                onChange={(e) => setFormData({ ...formData, introduction: e.target.value })}
                placeholder={t('adminDevotionalLibraryManager', 'introductionPlaceholder', 'Opening thoughts or context...')}
                rows={3}
              />
            </div>
            <div>
              <Label>{t('adminDevotionalLibraryManager', 'mainContentLabel', 'Main Content *')}</Label>
              <Textarea
                value={formData.main_content || ''}
                onChange={(e) => setFormData({ ...formData, main_content: e.target.value })}
                placeholder={t('adminDevotionalLibraryManager', 'mainContentPlaceholder', 'Core devotional teaching...')}
                rows={10}
              />
            </div>
            <div>
              <Label>{t('adminDevotionalLibraryManager', 'reflectionQuestionsLabel', 'Reflection Questions (one per line)')}</Label>
              <Textarea
                value={formData.reflection_questions?.join('\n') || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  reflection_questions: e.target.value.split('\n').filter(Boolean)
                })}
                placeholder={t('adminDevotionalLibraryManager', 'reflectionQuestionsPlaceholder', 'What does this mean to you?\nHow can you apply this today?')}
                rows={4}
              />
            </div>
            <div>
              <Label>{t('adminDevotionalLibraryManager', 'guidedPrayer', 'Guided Prayer')}</Label>
              <Textarea
                value={formData.guided_prayer || ''}
                onChange={(e) => setFormData({ ...formData, guided_prayer: e.target.value })}
                placeholder={t('adminDevotionalLibraryManager', 'guidedPrayerPlaceholder', 'Prayer to close the devotional...')}
                rows={3}
              />
            </div>
            <div>
              <Label>{t('adminDevotionalLibraryManager', 'actionStepsLabel', 'Action Steps (one per line)')}</Label>
              <Textarea
                value={formData.action_steps?.join('\n') || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  action_steps: e.target.value.split('\n').filter(Boolean)
                })}
                placeholder={t('adminDevotionalLibraryManager', 'actionStepsPlaceholder', 'Practical steps to take today\nWays to live this out')}
                rows={3}
              />
            </div>
            <div>
              <Label>{t('adminDevotionalLibraryManager', 'additionalThoughts', 'Additional Thoughts')}</Label>
              <Textarea
                value={formData.additional_thoughts || ''}
                onChange={(e) => setFormData({ ...formData, additional_thoughts: e.target.value })}
                placeholder={t('adminDevotionalLibraryManager', 'additionalThoughtsPlaceholder', 'Extra insights or resources...')}
                rows={3}
              />
            </div>
          </TabsContent>

          <TabsContent value="media" className="space-y-4">
            <div>
              <Label>{t('adminDevotionalLibraryManager', 'audioUrl', 'Audio URL')}</Label>
              <Input
                value={formData.audio_url || ''}
                onChange={(e) => setFormData({ ...formData, audio_url: e.target.value })}
                placeholder="https://example.com/audio.mp3"
              />
            </div>
            <div>
              <Label>{t('adminDevotionalLibraryManager', 'videoUrl', 'Video URL')}</Label>
              <Input
                value={formData.video_url || ''}
                onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                placeholder="https://youtube.com/watch?v=..."
              />
            </div>
            <div>
              <CoverImageField
                label={t('adminDevotionalLibraryManager', 'image', 'Image')}
                value={formData.image_url || ''}
                onChange={(url) => setFormData({ ...formData, image_url: url })}
                promptSubject={formData.title || ''}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('adminDevotionalLibraryManager', 'cancel', 'Cancel')}</Button>
          <Button onClick={handleSubmit}>
            <Save className="h-4 w-4 mr-2" />
            {t('adminDevotionalLibraryManager', 'saveEntry', 'Save Entry')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminDevotionalLibraryManager;