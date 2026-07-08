import React, { useState, useEffect, useCallback } from 'react';
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
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLocalDateString } from '@/lib/utils';
import { TranslateNowButton } from '@/components/TranslateNowButton';
import { TranslationProgressIndicator } from '@/components/TranslationProgressIndicator';
import { translationQueueService } from '@/lib/translationQueueService';
import {
  BookOpen, Plus, Edit, Trash2, Eye, EyeOff, Clock, Star,
  Search, Loader2, BarChart3, Image, Music, Globe,
  Download, TrendingUp, Users, Heart, MessageSquare, Share2,
  FileText, List, Grid, Save, X, Copy, CheckCircle
} from 'lucide-react';

interface MinistryDevotionalsManagerProps {
  ministryId: string;
}

interface Devotional {
  id: string;
  title: string;
  content: string;
  scripture_reference: string;
  scripture_text: string;
  bible_passage_reference?: string;
  bible_passage_text?: string;
  reflection_questions: string[];
  prayer_focus: string;
  featured_image: string;
  audio_url: string;
  author_name: string;
  series_id: string;
  is_published: boolean;
  is_featured: boolean;
  scheduled_date: string;
  visibility: string;
  view_count: number;
  like_count: number;
  share_count: number;
  comment_count: number;
  created_at: string;
}

interface DevotionalSeries {
  id: string;
  title: string;
  description: string;
  image_url: string;
  devotional_count: number;
  total_views: number;
  is_active: boolean;
  created_at: string;
}

interface Analytics {
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  totalComments: number;
  averageEngagement: number;
  topDevotional: Devotional | null;
  seriesPerformance: any[];
}

const initialFormData = {
  title: '',
  content: '',
  scripture_reference: '',
  scripture_text: '',
  bible_passage_reference: '',
  bible_passage_text: '',
  reflection_questions: [''],
  prayer_focus: '',
  featured_image: '',
  audio_url: '',
  author_name: '',
  series_id: '',
  is_published: false,
  is_featured: false,
  scheduled_date: '',
  visibility: 'public'
};

// Translations supported by bible-api.com (same set used across the app)
const BIBLE_VERSIONS = [
  { id: 'kjv', name: 'King James Version (KJV)' },
  { id: 'web', name: 'World English Bible (WEB)' },
  { id: 'oeb-us', name: 'Open English Bible (US)' },
  { id: 'clementine', name: 'Clementine Latin Vulgate' },
  { id: 'almeida', name: 'Almeida (Portuguese)' },
  { id: 'rccv', name: 'Romanian Cornilescu' },
];

const initialSeriesForm = {
  title: '',
  description: '',
  image_url: '',
  is_active: true
};

export const MinistryDevotionalsManager: React.FC<MinistryDevotionalsManagerProps> = ({
  ministryId
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [devotionals, setDevotionals] = useState<Devotional[]>([]);
  const [series, setSeries] = useState<DevotionalSeries[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showModal, setShowModal] = useState(false);
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [editingDevotional, setEditingDevotional] = useState<Devotional | null>(null);
  const [editingSeries, setEditingSeries] = useState<DevotionalSeries | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingScripture, setLoadingScripture] = useState(false);
  const [loadingBiblePassage, setLoadingBiblePassage] = useState(false);
  const [biblePassageVersion, setBiblePassageVersion] = useState('kjv');

  const [formData, setFormData] = useState(initialFormData);
  const [seriesForm, setSeriesForm] = useState(initialSeriesForm);

  useEffect(() => {
    loadDevotionals();
    loadSeries();
  }, [ministryId]);

  const loadDevotionals = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_devotionals')
        .select('*')
        .eq('ministry_id', ministryId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDevotionals(data || []);
    } catch (err) {
      console.error('Error loading devotionals:', err);
      toast({ title: t('ministryDevotionalsManager', 'error', 'Error'), description: t('ministryDevotionalsManager', 'failedLoadDevotionals', 'Failed to load devotionals'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadSeries = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_devotional_series')
        .select('*')
        .eq('ministry_id', ministryId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const seriesWithCounts = await Promise.all((data || []).map(async (s) => {
        const { count } = await supabase
          .from('ministry_devotionals')
          .select('*', { count: 'exact', head: true })
          .eq('series_id', s.id);

        const { data: viewData } = await supabase
          .from('ministry_devotionals')
          .select('view_count')
          .eq('series_id', s.id);

        const totalViews = viewData?.reduce((sum, d) => sum + (d.view_count || 0), 0) || 0;

        return {
          ...s,
          devotional_count: count || 0,
          total_views: totalViews
        };
      }));

      setSeries(seriesWithCounts);
    } catch (err) {
      console.error('Error loading series:', err);
      toast({ title: t('ministryDevotionalsManager', 'error', 'Error'), description: t('ministryDevotionalsManager', 'failedLoadSeries', 'Failed to load series'), variant: 'destructive' });
    }
  };

  const loadAnalytics = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_devotionals')
        .select('*')
        .eq('ministry_id', ministryId);

      if (error) throw error;

      const devotionalData = data || [];
      const totalViews = devotionalData.reduce((sum, d) => sum + (d.view_count || 0), 0);
      const totalLikes = devotionalData.reduce((sum, d) => sum + (d.like_count || 0), 0);
      const totalShares = devotionalData.reduce((sum, d) => sum + (d.share_count || 0), 0);
      const totalComments = devotionalData.reduce((sum, d) => sum + (d.comment_count || 0), 0);

      const topDevotional = [...devotionalData].sort((a, b) => 
        (b.view_count || 0) - (a.view_count || 0)
      )[0] || null;

      const seriesPerf = await Promise.all(series.map(async (s) => {
        const seriesDevotionals = devotionalData.filter(d => d.series_id === s.id);
        const views = seriesDevotionals.reduce((sum, d) => sum + (d.view_count || 0), 0);
        const engagement = seriesDevotionals.reduce((sum, d) => 
          sum + (d.like_count || 0) + (d.share_count || 0) + (d.comment_count || 0), 0
        );
        return {
          series: s,
          views,
          engagement,
          count: seriesDevotionals.length
        };
      }));

      setAnalytics({
        totalViews,
        totalLikes,
        totalShares,
        totalComments,
        averageEngagement: devotionalData.length > 0 
          ? (totalLikes + totalShares + totalComments) / devotionalData.length 
          : 0,
        topDevotional,
        seriesPerformance: seriesPerf
      });
    } catch (err) {
      console.error('Error loading analytics:', err);
      toast({ title: t('ministryDevotionalsManager', 'error', 'Error'), description: t('ministryDevotionalsManager', 'failedLoadAnalytics', 'Failed to load analytics'), variant: 'destructive' });
    }
  }, [ministryId, series]);

  useEffect(() => {
    if (showAnalyticsModal) {
      loadAnalytics();
    }
  }, [showAnalyticsModal, loadAnalytics]);

  const loadScriptureText = async () => {
    if (!formData.scripture_reference.trim()) {
      toast({ title: t('ministryDevotionalsManager', 'error', 'Error'), description: t('ministryDevotionalsManager', 'enterScriptureRefFirst', 'Please enter a scripture reference first'), variant: 'destructive' });
      return;
    }

    setLoadingScripture(true);
    try {
      const response = await fetch(
        `https://bible-api.com/${encodeURIComponent(formData.scripture_reference)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        setFormData({ 
          ...formData, 
          scripture_text: data.text || data.verses?.[0]?.text || ''
        });
        toast({ title: t('ministryDevotionalsManager', 'success', 'Success'), description: t('ministryDevotionalsManager', 'scriptureLoaded', 'Scripture text loaded successfully') });
      } else {
        throw new Error('Scripture not found');
      }
    } catch (err) {
      console.error('Error loading scripture:', err);
      toast({
        title: t('ministryDevotionalsManager', 'note', 'Note'),
        description: t('ministryDevotionalsManager', 'couldNotAutoLoadScripture', 'Could not auto-load scripture. Please enter manually or check the reference format (e.g., "John 3:16" or "Psalm 23:1-6")'),
        variant: 'default'
      });
    } finally {
      setLoadingScripture(false);
    }
  };

  const handleCreate = () => {
    setEditingDevotional(null);
    setFormData(initialFormData);
    setShowModal(true);
  };

  const loadBiblePassageText = async () => {
    if (!formData.bible_passage_reference.trim()) {
      toast({ title: t('ministryDevotionalsManager', 'error', 'Error'), description: t('ministryDevotionalsManager', 'enterBiblePassageRefFirst', 'Please enter a Bible passage reference first'), variant: 'destructive' });
      return;
    }
    setLoadingBiblePassage(true);
    try {
      const url = biblePassageVersion === 'web'
        ? `https://bible-api.com/${encodeURIComponent(formData.bible_passage_reference)}`
        : `https://bible-api.com/${encodeURIComponent(formData.bible_passage_reference)}?translation=${biblePassageVersion}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const text = data.text || (Array.isArray(data.verses) ? data.verses.map((v: any) => v.text).join(' ') : '');
        setFormData((prev) => ({ ...prev, bible_passage_text: (text || '').trim() }));
        toast({ title: t('ministryDevotionalsManager', 'success', 'Success'), description: t('ministryDevotionalsManager', 'biblePassageLoaded', 'Bible passage loaded successfully') });
      } else {
        throw new Error('Passage not found');
      }
    } catch (err) {
      console.error('Error loading Bible passage:', err);
      toast({
        title: t('ministryDevotionalsManager', 'note', 'Note'),
        description: t('ministryDevotionalsManager', 'couldNotAutoLoadPassage', 'Could not auto-load the passage. Enter it manually or check the format (e.g., "Romans 8:1-11").'),
      });
    } finally {
      setLoadingBiblePassage(false);
    }
  };

  const handleEdit = (devotional: Devotional) => {
    setEditingDevotional(devotional);
    setFormData({
      title: devotional.title || '',
      content: devotional.content || '',
      scripture_reference: devotional.scripture_reference || '',
      scripture_text: devotional.scripture_text || '',
      bible_passage_reference: devotional.bible_passage_reference || '',
      bible_passage_text: devotional.bible_passage_text || '',
      reflection_questions: devotional.reflection_questions || [''],
      prayer_focus: devotional.prayer_focus || '',
      featured_image: devotional.featured_image || '',
      audio_url: devotional.audio_url || '',
      author_name: devotional.author_name || '',
      series_id: devotional.series_id || '',
      is_published: devotional.is_published || false,
      is_featured: devotional.is_featured || false,
      scheduled_date: devotional.scheduled_date || '',
      visibility: devotional.visibility || 'public'
    });
    setShowModal(true);
  };

  const handleDuplicate = (devotional: Devotional) => {
    setEditingDevotional(null);
    setFormData({
      title: t('ministryDevotionalsManager', 'copySuffix', '{title} (Copy)').replace('{title}', String(devotional.title)),
      content: devotional.content || '',
      scripture_reference: devotional.scripture_reference || '',
      scripture_text: devotional.scripture_text || '',
      bible_passage_reference: devotional.bible_passage_reference || '',
      bible_passage_text: devotional.bible_passage_text || '',
      reflection_questions: devotional.reflection_questions || [''],
      prayer_focus: devotional.prayer_focus || '',
      featured_image: devotional.featured_image || '',
      audio_url: devotional.audio_url || '',
      author_name: devotional.author_name || '',
      series_id: devotional.series_id || '',
      is_published: false,
      is_featured: false,
      scheduled_date: '',
      visibility: devotional.visibility || 'public'
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({ title: t('ministryDevotionalsManager', 'error', 'Error'), description: t('ministryDevotionalsManager', 'titleRequired', 'Title is required'), variant: 'destructive' });
      return;
    }

    if (!user?.id) {
      toast({ title: t('ministryDevotionalsManager', 'error', 'Error'), description: t('ministryDevotionalsManager', 'userNotAuthenticated', 'User not authenticated'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const dataToSave: any = {
        ministry_id: ministryId,
        title: formData.title.trim(),
        content: formData.content.trim(),
        scripture_reference: formData.scripture_reference,
        scripture_text: formData.scripture_text,
        bible_passage_reference: formData.bible_passage_reference || null,
        bible_passage_text: formData.bible_passage_text || null,
        reflection_questions: formData.reflection_questions.filter(q => q.trim()),
        prayer_focus: formData.prayer_focus,
        featured_image: formData.featured_image,
        audio_url: formData.audio_url,
        author_name: formData.author_name || 'Ministry Team',
        series_id: formData.series_id || null,
        is_published: formData.is_published,
        is_featured: formData.is_featured,
        scheduled_date: formData.scheduled_date || null,
        visibility: formData.visibility
      };

      if (!editingDevotional) {
        dataToSave.creator_id = user.id;
        dataToSave.created_by = user.id;
      }

      if (editingDevotional) {
        const { error } = await supabase
          .from('ministry_devotionals')
          .update(dataToSave)
          .eq('id', editingDevotional.id);
        if (error) throw error;
        toast({ title: t('ministryDevotionalsManager', 'success', 'Success'), description: t('ministryDevotionalsManager', 'devotionalUpdated', 'Devotional updated successfully') });
      } else {
        const { error } = await supabase
          .from('ministry_devotionals')
          .insert(dataToSave);
        if (error) throw error;
        toast({ title: t('ministryDevotionalsManager', 'success', 'Success'), description: t('ministryDevotionalsManager', 'devotionalCreated', 'Devotional created successfully') });
      }

      setShowModal(false);
      loadDevotionals();
      loadAnalytics();
    } catch (err: any) {
      console.error('Save error:', err);
      toast({ title: t('ministryDevotionalsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('ministryDevotionalsManager', 'confirmDeleteDevotional', 'Are you sure you want to delete this devotional?'))) return;

    try {
      const { error } = await supabase
        .from('ministry_devotionals')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast({ title: t('ministryDevotionalsManager', 'success', 'Success'), description: t('ministryDevotionalsManager', 'devotionalDeleted', 'Devotional deleted') });
      loadDevotionals();
      loadAnalytics();
    } catch (err: any) {
      toast({ title: t('ministryDevotionalsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleFeatured = async (devotional: Devotional) => {
    try {
      const { error } = await supabase
        .from('ministry_devotionals')
        .update({ is_featured: !devotional.is_featured })
        .eq('id', devotional.id);
      if (error) throw error;
      loadDevotionals();
    } catch (err: any) {
      toast({ title: t('ministryDevotionalsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleTogglePublish = async (devotional: Devotional) => {
    try {
      const { error } = await supabase
        .from('ministry_devotionals')
        .update({ is_published: !devotional.is_published })
        .eq('id', devotional.id);
      if (error) throw error;
      toast({
        title: t('ministryDevotionalsManager', 'success', 'Success'),
        description: devotional.is_published ? t('ministryDevotionalsManager', 'devotionalUnpublished', 'Devotional unpublished') : t('ministryDevotionalsManager', 'devotionalPublishedToast', 'Devotional published')
      });
      loadDevotionals();
    } catch (err: any) {
      toast({ title: t('ministryDevotionalsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const addReflectionQuestion = () => {
    setFormData({ ...formData, reflection_questions: [...formData.reflection_questions, ''] });
  };

  const updateReflectionQuestion = (index: number, value: string) => {
    const updated = [...formData.reflection_questions];
    updated[index] = value;
    setFormData({ ...formData, reflection_questions: updated });
  };

  const removeReflectionQuestion = (index: number) => {
    if (formData.reflection_questions.length === 1) return;
    const updated = formData.reflection_questions.filter((_, i) => i !== index);
    setFormData({ ...formData, reflection_questions: updated });
  };

  const handleCreateSeries = async () => {
    if (!seriesForm.title.trim()) {
      toast({ title: t('ministryDevotionalsManager', 'error', 'Error'), description: t('ministryDevotionalsManager', 'seriesTitleRequired', 'Series title is required'), variant: 'destructive' });
      return;
    }

    if (!user?.id) {
      toast({ title: t('ministryDevotionalsManager', 'error', 'Error'), description: t('ministryDevotionalsManager', 'userNotAuthenticated', 'User not authenticated'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const dataToSave: any = {
        ministry_id: ministryId,
        title: seriesForm.title.trim(),
        description: seriesForm.description.trim(),
        image_url: seriesForm.image_url,
        is_active: seriesForm.is_active
      };

      if (!editingSeries) {
        dataToSave.creator_id = user.id;
        dataToSave.created_by = user.id;
      }

      if (editingSeries) {
        const { error } = await supabase
          .from('ministry_devotional_series')
          .update(dataToSave)
          .eq('id', editingSeries.id);
        if (error) throw error;
        toast({ title: t('ministryDevotionalsManager', 'success', 'Success'), description: t('ministryDevotionalsManager', 'seriesUpdated', 'Series updated successfully') });
      } else {
        const { error } = await supabase
          .from('ministry_devotional_series')
          .insert(dataToSave);
        if (error) throw error;
        toast({ title: t('ministryDevotionalsManager', 'success', 'Success'), description: t('ministryDevotionalsManager', 'seriesCreated', 'Series created successfully') });
      }

      setShowSeriesModal(false);
      setSeriesForm(initialSeriesForm);
      setEditingSeries(null);
      loadSeries();
    } catch (err: any) {
      console.error('Save series error:', err);
      toast({ title: t('ministryDevotionalsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleEditSeries = (s: DevotionalSeries) => {
    setEditingSeries(s);
    setSeriesForm({
      title: s.title,
      description: s.description || '',
      image_url: s.image_url || '',
      is_active: s.is_active
    });
    setShowSeriesModal(true);
  };

  const handleDeleteSeries = async (id: string) => {
    if (!confirm(t('ministryDevotionalsManager', 'confirmDeleteSeries', 'Are you sure? This will remove the series association from all devotionals.'))) return;

    try {
      await supabase
        .from('ministry_devotionals')
        .update({ series_id: null })
        .eq('series_id', id);

      const { error } = await supabase
        .from('ministry_devotional_series')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: t('ministryDevotionalsManager', 'success', 'Success'), description: t('ministryDevotionalsManager', 'seriesDeleted', 'Series deleted') });
      loadSeries();
      loadDevotionals();
    } catch (err: any) {
      toast({ title: t('ministryDevotionalsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const filteredDevotionals = devotionals.filter(d => {
    const matchesSearch = d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' ||
      (filterStatus === 'published' && d.is_published) ||
      (filterStatus === 'draft' && !d.is_published) ||
      (filterStatus === 'scheduled' && d.scheduled_date && d.scheduled_date > getLocalDateString()) ||
      (filterStatus === 'featured' && d.is_featured);
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: devotionals.length,
    published: devotionals.filter(d => d.is_published).length,
    drafts: devotionals.filter(d => !d.is_published).length,
    scheduled: devotionals.filter(d => d.scheduled_date && d.scheduled_date > getLocalDateString()).length,
    featured: devotionals.filter(d => d.is_featured).length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t('ministryDevotionalsManager', 'searchDevotionalsPlaceholder', 'Search devotionals...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-80"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ministryDevotionalsManager', 'allStatus', 'All Status')}</SelectItem>
              <SelectItem value="published">{t('ministryDevotionalsManager', 'published', 'Published')}</SelectItem>
              <SelectItem value="draft">{t('ministryDevotionalsManager', 'drafts', 'Drafts')}</SelectItem>
              <SelectItem value="scheduled">{t('ministryDevotionalsManager', 'scheduled', 'Scheduled')}</SelectItem>
              <SelectItem value="featured">{t('ministryDevotionalsManager', 'featured', 'Featured')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" onClick={() => setShowAnalyticsModal(true)}>
            <BarChart3 className="h-4 w-4 mr-2" />
            {t('ministryDevotionalsManager', 'analytics', 'Analytics')}
          </Button>
          <Button variant="outline" onClick={() => {
            setEditingSeries(null);
            setSeriesForm(initialSeriesForm);
            setShowSeriesModal(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            {t('ministryDevotionalsManager', 'newSeries', 'New Series')}
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {t('ministryDevotionalsManager', 'newDevotional', 'New Devotional')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryDevotionalsManager', 'total', 'Total')}</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <BookOpen className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryDevotionalsManager', 'published', 'Published')}</p>
                <p className="text-2xl font-bold">{stats.published}</p>
              </div>
              <Eye className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryDevotionalsManager', 'drafts', 'Drafts')}</p>
                <p className="text-2xl font-bold">{stats.drafts}</p>
              </div>
              <FileText className="h-8 w-8 text-gray-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryDevotionalsManager', 'scheduled', 'Scheduled')}</p>
                <p className="text-2xl font-bold">{stats.scheduled}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryDevotionalsManager', 'featured', 'Featured')}</p>
                <p className="text-2xl font-bold">{stats.featured}</p>
              </div>
              <Star className="h-8 w-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Series Section */}
      {series.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('ministryDevotionalsManager', 'devotionalSeries', 'Devotional Series')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {series.map(s => (
                <div key={s.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="font-semibold">{s.title}</h4>
                      <p className="text-sm text-gray-500 line-clamp-2">{s.description}</p>
                    </div>
                    {s.image_url && (
                      <img src={s.image_url} alt={s.title} className="w-12 h-12 rounded object-cover ml-2" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                    <span>{t('ministryDevotionalsManager', 'countDevotionals', '{count} devotionals').replace('{count}', String(s.devotional_count))}</span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {s.total_views}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleEditSeries(s)}>
                      <Edit className="h-3 w-3 mr-1" /> {t('ministryDevotionalsManager', 'edit', 'Edit')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteSeries(s.id)}>
                      <Trash2 className="h-3 w-3 mr-1 text-red-500" /> {t('ministryDevotionalsManager', 'delete', 'Delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Devotionals List/Grid */}
      <Card>
        <CardContent className="p-0">
          {filteredDevotionals.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-700">{t('ministryDevotionalsManager', 'noDevotionals', 'No Devotionals')}</h3>
              <p className="text-gray-500 mb-4">{t('ministryDevotionalsManager', 'getStartedFirstDevotional', 'Get started by creating your first devotional')}</p>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                {t('ministryDevotionalsManager', 'createDevotional', 'Create Devotional')}
              </Button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-3 gap-4 p-4">
              {filteredDevotionals.map(dev => (
                <Card key={dev.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    {dev.featured_image && (
                      <img src={dev.featured_image} alt={dev.title} className="w-full h-32 object-cover rounded mb-3" />
                    )}
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold line-clamp-2 flex-1">{dev.title}</h3>
                      {dev.is_featured && <Star className="h-4 w-4 text-amber-500 fill-amber-500 flex-shrink-0 ml-1" />}
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 mb-2">{dev.content}</p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      <Badge variant={dev.is_published ? 'default' : 'secondary'}>
                        {dev.is_published ? t('ministryDevotionalsManager', 'publishedBadge', 'Published') : t('ministryDevotionalsManager', 'draftBadge', 'Draft')}
                      </Badge>
                      {dev.scripture_reference && (
                        <Badge variant="outline" className="text-xs">{dev.scripture_reference}</Badge>
                      )}
                      {dev.series_id && (
                        <Badge variant="outline" className="text-xs">
                          {series.find(s => s.id === dev.series_id)?.title}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mb-2">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {dev.view_count || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="h-3 w-3" /> {dev.like_count || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <Share2 className="h-3 w-3" /> {dev.share_count || 0}
                      </span>
                    </div>
                    {/* Translation Progress */}
                    <div className="mb-2">
                      <TranslationProgressIndicator
                        contentType="ministry_devotional"
                        contentId={dev.id}
                        variant="compact"
                      />
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(dev)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDuplicate(dev)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                      <TranslateNowButton
                        contentType="ministry_devotional"
                        contentId={dev.id}
                        ministryId={ministryId}
                        size="sm"
                        variant="ghost"
                        showDropdown={false}
                      />
                      <Button variant="ghost" size="sm" onClick={() => handleToggleFeatured(dev)}>
                        <Star className={`h-3 w-3 ${dev.is_featured ? 'text-amber-500 fill-amber-500' : ''}`} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(dev.id)}>
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="divide-y">
              {filteredDevotionals.map(dev => (
                <div key={dev.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-4 flex-1">
                      {dev.featured_image && (
                        <img src={dev.featured_image} alt={dev.title} className="w-24 h-24 rounded object-cover" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{dev.title}</h3>
                          {dev.is_featured && <Star className="h-4 w-4 text-amber-500 fill-amber-500" />}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2 mb-2">{dev.content}</p>
                        <div className="flex flex-wrap gap-2 mb-2">
                          <Badge variant={dev.is_published ? 'default' : 'secondary'}>
                            {dev.is_published ? (
                              <><Eye className="h-3 w-3 mr-1" /> {t('ministryDevotionalsManager', 'publishedBadge', 'Published')}</>
                            ) : (
                              <><EyeOff className="h-3 w-3 mr-1" /> {t('ministryDevotionalsManager', 'draftBadge', 'Draft')}</>
                            )}
                          </Badge>
                          {dev.scheduled_date && dev.scheduled_date > getLocalDateString() && (
                            <Badge className="bg-blue-100 text-blue-700">
                              <Clock className="h-3 w-3 mr-1" />
                              {t('ministryDevotionalsManager', 'scheduledLabel', 'Scheduled:')} {new Date(dev.scheduled_date + 'T00:00:00').toLocaleDateString()}
                            </Badge>
                          )}
                          {dev.scripture_reference && (
                            <Badge variant="outline">{dev.scripture_reference}</Badge>
                          )}
                          {dev.series_id && (
                            <Badge variant="outline">
                              {series.find(s => s.id === dev.series_id)?.title || t('ministryDevotionalsManager', 'seriesFallback', 'Series')}
                            </Badge>
                          )}
                          {dev.audio_url && (
                            <Badge variant="outline"><Music className="h-3 w-3 mr-1" /> {t('ministryDevotionalsManager', 'audio', 'Audio')}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" /> {dev.view_count || 0} {t('ministryDevotionalsManager', 'views', 'views')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3" /> {dev.like_count || 0} {t('ministryDevotionalsManager', 'likes', 'likes')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Share2 className="h-3 w-3" /> {dev.share_count || 0} {t('ministryDevotionalsManager', 'shares', 'shares')}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" /> {dev.comment_count || 0} {t('ministryDevotionalsManager', 'comments', 'comments')}
                          </span>
                          <span className="text-gray-400">{t('ministryDevotionalsManager', 'byAuthor', 'by {author}').replace('{author}', String(dev.author_name || 'Ministry Team'))}</span>
                        </div>
                        {/* Translation Progress */}
                        <TranslationProgressIndicator
                          contentType="ministry_devotional"
                          contentId={dev.id}
                          variant="compact"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <TranslateNowButton
                        contentType="ministry_devotional"
                        contentId={dev.id}
                        ministryId={ministryId}
                        size="sm"
                        variant="outline"
                      />
                      <Button variant="outline" size="sm" onClick={() => handleTogglePublish(dev)}>
                        {dev.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(dev)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDuplicate(dev)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleToggleFeatured(dev)}>
                        <Star className={`h-4 w-4 ${dev.is_featured ? 'text-amber-500 fill-amber-500' : ''}`} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(dev.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Devotional Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingDevotional ? t('ministryDevotionalsManager', 'editDevotional', 'Edit Devotional') : t('ministryDevotionalsManager', 'createDevotional', 'Create Devotional')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>{t('ministryDevotionalsManager', 'titleLabel', 'Title *')}</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('ministryDevotionalsManager', 'devotionalTitlePlaceholder', 'Devotional title')}
                />
              </div>

              <div>
                <Label>{t('ministryDevotionalsManager', 'scriptureReference', 'Scripture Reference')}</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.scripture_reference}
                    onChange={(e) => setFormData({ ...formData, scripture_reference: e.target.value })}
                    placeholder={t('ministryDevotionalsManager', 'scriptureRefPlaceholder', 'e.g., John 3:16 or Psalm 23:1-6')}
                  />
                  <Button 
                    type="button"
                    variant="outline" 
                    onClick={loadScriptureText}
                    disabled={loadingScripture}
                  >
                    {loadingScripture ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {t('ministryDevotionalsManager', 'clickDownloadScripture', 'Click the download button to auto-load scripture text')}
                </p>
              </div>

              <div>
                <Label>{t('ministryDevotionalsManager', 'series', 'Series')}</Label>
                <Select
                  value={formData.series_id || '__none__'}
                  onValueChange={(v) => setFormData({ ...formData, series_id: v === '__none__' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('ministryDevotionalsManager', 'selectSeriesPlaceholder', 'Select series')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('ministryDevotionalsManager', 'noSeries', 'No Series')}</SelectItem>
                    {series.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2">
                <Label>{t('ministryDevotionalsManager', 'scripturePassage', 'Scripture Passage')}</Label>
                <Textarea
                  value={formData.scripture_text}
                  onChange={(e) => setFormData({ ...formData, scripture_text: e.target.value })}
                  placeholder={t('ministryDevotionalsManager', 'scripturePassagePlaceholder', 'Full scripture text will appear here...')}
                  rows={3}
                />
              </div>

              <div className="col-span-2 rounded-lg border p-3 space-y-2">
                <Label className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" /> {t('ministryDevotionalsManager', 'biblePassage', 'Bible Passage')}
                </Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    className="flex-1"
                    value={formData.bible_passage_reference}
                    onChange={(e) => setFormData({ ...formData, bible_passage_reference: e.target.value })}
                    placeholder={t('ministryDevotionalsManager', 'biblePassageRefPlaceholder', 'e.g., Romans 8:1-11')}
                  />
                  <Select value={biblePassageVersion} onValueChange={setBiblePassageVersion}>
                    <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BIBLE_VERSIONS.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={loadBiblePassageText} disabled={loadingBiblePassage}>
                    {loadingBiblePassage
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <><Download className="h-4 w-4 mr-1" /> {t('ministryDevotionalsManager', 'loadScripture', 'Load scripture')}</>}
                  </Button>
                </div>
                <Textarea
                  value={formData.bible_passage_text}
                  onChange={(e) => setFormData({ ...formData, bible_passage_text: e.target.value })}
                  placeholder={t('ministryDevotionalsManager', 'biblePassageTextPlaceholder', 'Load from the reference above, or paste the passage here. Long passages scroll.')}
                  rows={6}
                  className="max-h-64 overflow-y-auto"
                />
                <p className="text-xs text-gray-500">
                  {t('ministryDevotionalsManager', 'bibleApiHelp', 'Loads public-domain translations from bible-api.com. Editable — paste another version (e.g. NKJV) if you prefer.')}
                </p>
              </div>

              <div className="col-span-2">
                <Label>{t('ministryDevotionalsManager', 'contentLabel', 'Content *')}</Label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder={t('ministryDevotionalsManager', 'contentPlaceholder', 'Write your devotional message here...')}
                  rows={8}
                />
              </div>

              <div className="col-span-2">
                <Label>{t('ministryDevotionalsManager', 'reflectionQuestions', 'Reflection Questions')}</Label>
                <div className="space-y-2">
                  {formData.reflection_questions.map((q, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={q}
                        onChange={(e) => updateReflectionQuestion(i, e.target.value)}
                        placeholder={t('ministryDevotionalsManager', 'questionN', 'Question {n}').replace('{n}', String(i + 1))}
                      />
                      {formData.reflection_questions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeReflectionQuestion(i)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addReflectionQuestion}>
                    <Plus className="h-4 w-4 mr-1" /> {t('ministryDevotionalsManager', 'addQuestion', 'Add Question')}
                  </Button>
                </div>
              </div>

              <div className="col-span-2">
                <Label>{t('ministryDevotionalsManager', 'prayerFocus', 'Prayer Focus')}</Label>
                <Textarea
                  value={formData.prayer_focus}
                  onChange={(e) => setFormData({ ...formData, prayer_focus: e.target.value })}
                  placeholder={t('ministryDevotionalsManager', 'prayerFocusPlaceholder', 'Suggested prayer points for this devotional...')}
                  rows={2}
                />
              </div>

              <div>
                <Label>{t('ministryDevotionalsManager', 'featuredImageUrl', 'Featured Image URL')}</Label>
                <Input
                  value={formData.featured_image}
                  onChange={(e) => setFormData({ ...formData, featured_image: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              <div>
                <Label>{t('ministryDevotionalsManager', 'audioUrlOptional', 'Audio URL (Optional)')}</Label>
                <Input
                  value={formData.audio_url}
                  onChange={(e) => setFormData({ ...formData, audio_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              <div>
                <Label>{t('ministryDevotionalsManager', 'authorName', 'Author Name')}</Label>
                <Input
                  value={formData.author_name}
                  onChange={(e) => setFormData({ ...formData, author_name: e.target.value })}
                  placeholder={t('ministryDevotionalsManager', 'authorNamePlaceholder', 'Pastor John Doe or Ministry Team')}
                />
              </div>

              <div>
                <Label>{t('ministryDevotionalsManager', 'visibility', 'Visibility')}</Label>
                <Select
                  value={formData.visibility}
                  onValueChange={(v) => setFormData({ ...formData, visibility: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">{t('ministryDevotionalsManager', 'visibilityPublic', 'Public')}</SelectItem>
                    <SelectItem value="members">{t('ministryDevotionalsManager', 'visibilityMembers', 'Members Only')}</SelectItem>
                    <SelectItem value="premium">{t('ministryDevotionalsManager', 'visibilityPremium', 'Premium Members')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2">
                <Label>{t('ministryDevotionalsManager', 'schedulePublishDate', 'Schedule Publish Date (Optional)')}</Label>
                <Input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('ministryDevotionalsManager', 'scheduleHelp', 'Leave empty to publish immediately when you mark as published')}
                </p>
              </div>

              <div className="col-span-2 flex items-center gap-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_published}
                    onCheckedChange={(v) => setFormData({ ...formData, is_published: v })}
                  />
                  <Label>{t('ministryDevotionalsManager', 'published', 'Published')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_featured}
                    onCheckedChange={(v) => setFormData({ ...formData, is_featured: v })}
                  />
                  <Label>{t('ministryDevotionalsManager', 'featured', 'Featured')}</Label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t('ministryDevotionalsManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {editingDevotional ? t('ministryDevotionalsManager', 'updateDevotional', 'Update Devotional') : t('ministryDevotionalsManager', 'createDevotional', 'Create Devotional')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Series Modal */}
      <Dialog open={showSeriesModal} onOpenChange={setShowSeriesModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSeries ? t('ministryDevotionalsManager', 'editSeries', 'Edit Series') : t('ministryDevotionalsManager', 'createDevotionalSeries', 'Create Devotional Series')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('ministryDevotionalsManager', 'seriesTitleLabel', 'Series Title *')}</Label>
              <Input
                value={seriesForm.title}
                onChange={(e) => setSeriesForm({ ...seriesForm, title: e.target.value })}
                placeholder={t('ministryDevotionalsManager', 'seriesTitlePlaceholder', 'e.g., Walking in Faith')}
              />
            </div>
            <div>
              <Label>{t('ministryDevotionalsManager', 'description', 'Description')}</Label>
              <Textarea
                value={seriesForm.description}
                onChange={(e) => setSeriesForm({ ...seriesForm, description: e.target.value })}
                placeholder={t('ministryDevotionalsManager', 'seriesDescriptionPlaceholder', 'Series description...')}
                rows={3}
              />
            </div>
            <div>
              <Label>{t('ministryDevotionalsManager', 'seriesImageUrlOptional', 'Series Image URL (Optional)')}</Label>
              <Input
                value={seriesForm.image_url}
                onChange={(e) => setSeriesForm({ ...seriesForm, image_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={seriesForm.is_active}
                onCheckedChange={(v) => setSeriesForm({ ...seriesForm, is_active: v })}
              />
              <Label>{t('ministryDevotionalsManager', 'activeSeries', 'Active Series')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSeriesModal(false)}>{t('ministryDevotionalsManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleCreateSeries} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingSeries ? t('ministryDevotionalsManager', 'updateSeries', 'Update Series') : t('ministryDevotionalsManager', 'createSeries', 'Create Series')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analytics Modal */}
      <Dialog open={showAnalyticsModal} onOpenChange={setShowAnalyticsModal}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('ministryDevotionalsManager', 'devotionalsAnalytics', 'Devotionals Analytics')}</DialogTitle>
          </DialogHeader>
          {analytics ? (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <Eye className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                      <p className="text-2xl font-bold">{analytics.totalViews.toLocaleString()}</p>
                      <p className="text-sm text-gray-500">{t('ministryDevotionalsManager', 'totalViews', 'Total Views')}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <Heart className="h-8 w-8 mx-auto text-pink-500 mb-2" />
                      <p className="text-2xl font-bold">{analytics.totalLikes.toLocaleString()}</p>
                      <p className="text-sm text-gray-500">{t('ministryDevotionalsManager', 'totalLikes', 'Total Likes')}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <Share2 className="h-8 w-8 mx-auto text-purple-500 mb-2" />
                      <p className="text-2xl font-bold">{analytics.totalShares.toLocaleString()}</p>
                      <p className="text-sm text-gray-500">{t('ministryDevotionalsManager', 'totalShares', 'Total Shares')}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <MessageSquare className="h-8 w-8 mx-auto text-green-500 mb-2" />
                      <p className="text-2xl font-bold">{analytics.totalComments.toLocaleString()}</p>
                      <p className="text-sm text-gray-500">{t('ministryDevotionalsManager', 'totalComments', 'Total Comments')}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {analytics.topDevotional && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-amber-500" />
                      {t('ministryDevotionalsManager', 'topPerformingDevotional', 'Top Performing Devotional')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-start gap-4">
                      {analytics.topDevotional.featured_image && (
                        <img 
                          src={analytics.topDevotional.featured_image} 
                          alt={analytics.topDevotional.title}
                          className="w-24 h-24 rounded object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <h4 className="font-semibold mb-1">{analytics.topDevotional.title}</h4>
                        <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                          {analytics.topDevotional.content}
                        </p>
                        <div className="flex gap-4 text-sm">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" /> {analytics.topDevotional.view_count} {t('ministryDevotionalsManager', 'views', 'views')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3" /> {analytics.topDevotional.like_count} {t('ministryDevotionalsManager', 'likes', 'likes')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Share2 className="h-3 w-3" /> {analytics.topDevotional.share_count} {t('ministryDevotionalsManager', 'shares', 'shares')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowAnalyticsModal(false)}>{t('ministryDevotionalsManager', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistryDevotionalsManager;