import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Progress } from './ui/progress';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { TranslateNowButton } from '@/components/TranslateNowButton';
import { 
  Plus, Edit, Trash2, Save, BookOpen, Clock, 
  Users, BarChart3, Loader2, Search, RefreshCw,
  Star, Eye, EyeOff, Calendar, ChevronRight,
  CheckCircle, AlertCircle, BookMarked, X
} from 'lucide-react';

interface DevotionalSeries {
  id: string;
  title: string;
  description: string;
  ministry_id?: string;
  total_days: number;
  cover_image_url?: string;
  difficulty_level: string;
  start_behavior: string;
  fixed_start_date?: string;
  is_featured: boolean;
  is_published: boolean;
  created_at: string;
}

interface DevotionalDay {
  id?: string;
  series_id: string;
  day_number: number;
  title: string;
  scripture_reference: string;
  scripture_text: string;
  main_content: string;
  reflection: string;
  audio_url: string;
  image_url: string;
  action_step: string;
  is_published: boolean;
}

interface Ministry {
  id: string;
  name: string;
}

interface SeriesStats {
  total_series: number;
  published_series: number;
  total_users: number;
  completion_rate: number;
}

const AdminSeriesManager: React.FC = () => {
  const { t } = useLanguage();
  const [series, setSeries] = useState<DevotionalSeries[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<SeriesStats | null>(null);
  
  // Modal states
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [showDaysModal, setShowDaysModal] = useState(false);
  const [editingSeries, setEditingSeries] = useState<DevotionalSeries | null>(null);
  const [selectedSeriesForDays, setSelectedSeriesForDays] = useState<DevotionalSeries | null>(null);
  const [seriesDays, setSeriesDays] = useState<DevotionalDay[]>([]);
  const [savingDays, setSavingDays] = useState(false);
  
  // Form state
  const [seriesForm, setSeriesForm] = useState({
    title: '',
    description: '',
    ministry_id: '',
    total_days: 7,
    cover_image_url: '',
    difficulty_level: 'beginner',
    start_behavior: 'user_based',
    fixed_start_date: '',
    is_featured: false,
    is_published: false
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [seriesRes, ministriesRes, progressRes] = await Promise.all([
        supabase.from('devotional_series').select('*').order('created_at', { ascending: false }),
        supabase.from('ministry_groups').select('id, name').eq('is_active', true),
        supabase.from('devotional_user_progress').select('*')
      ]);

      if (seriesRes.data) setSeries(seriesRes.data);
      if (ministriesRes.data) setMinistries(ministriesRes.data);

      // Calculate stats
      const totalSeries = seriesRes.data?.length || 0;
      const publishedSeries = seriesRes.data?.filter(s => s.is_published).length || 0;
      const uniqueUsers = new Set(progressRes.data?.map(p => p.user_id) || []).size;
      const completedCount = progressRes.data?.filter(p => p.is_completed).length || 0;
      const completionRate = progressRes.data?.length ? Math.round((completedCount / progressRes.data.length) * 100) : 0;

      setStats({
        total_series: totalSeries,
        published_series: publishedSeries,
        total_users: uniqueUsers,
        completion_rate: completionRate
      });
    } catch (err) {
      console.error('Error loading data:', err);
      toast({ title: t('adminSeriesManager', 'error', 'Error'), description: t('adminSeriesManager', 'failedLoadData', 'Failed to load data'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const resetSeriesForm = () => {
    setSeriesForm({
      title: '',
      description: '',
      ministry_id: '',
      total_days: 7,
      cover_image_url: '',
      difficulty_level: 'beginner',
      start_behavior: 'user_based',
      fixed_start_date: '',
      is_featured: false,
      is_published: false
    });
  };

  const openEditSeries = (s: DevotionalSeries) => {
    setEditingSeries(s);
    setSeriesForm({
      title: s.title,
      description: s.description || '',
      ministry_id: s.ministry_id || '',
      total_days: s.total_days,
      cover_image_url: s.cover_image_url || '',
      difficulty_level: s.difficulty_level || 'beginner',
      start_behavior: s.start_behavior || 'user_based',
      fixed_start_date: s.fixed_start_date ? s.fixed_start_date.split('T')[0] : '',
      is_featured: s.is_featured,
      is_published: s.is_published
    });
    setShowSeriesModal(true);
  };

  const saveSeries = async () => {
    if (!seriesForm.title.trim()) {
      toast({ title: t('adminSeriesManager', 'error', 'Error'), description: t('adminSeriesManager', 'titleRequired', 'Title is required'), variant: 'destructive' });
      return;
    }

    try {
      const data = {
        ...seriesForm,
        ministry_id: seriesForm.ministry_id || null,
        fixed_start_date: seriesForm.start_behavior === 'fixed_date' && seriesForm.fixed_start_date 
          ? new Date(seriesForm.fixed_start_date).toISOString() 
          : null,
        updated_at: new Date().toISOString()
      };

      if (editingSeries) {
        const { error } = await supabase
          .from('devotional_series')
          .update(data)
          .eq('id', editingSeries.id);
        if (error) throw error;
        toast({ title: t('adminSeriesManager', 'success', 'Success'), description: t('adminSeriesManager', 'seriesUpdated', 'Series updated successfully') });
      } else {
        const { data: newSeries, error } = await supabase
          .from('devotional_series')
          .insert(data)
          .select()
          .single();
        if (error) throw error;
        
        // Auto-generate day records
        if (newSeries) {
          const days = Array.from({ length: seriesForm.total_days }, (_, i) => ({
            series_id: newSeries.id,
            day_number: i + 1,
            title: `Day ${i + 1}`,
            scripture_reference: '',
            scripture_text: '',
            main_content: '',
            reflection: '',
            audio_url: '',
            image_url: '',
            action_step: '',
            is_published: false
          }));
          
          await supabase.from('devotional_entries').insert(days);
        }
        
        toast({ title: t('adminSeriesManager', 'success', 'Success'), description: t('adminSeriesManager', 'seriesCreated', 'Series created with day templates') });
      }

      setShowSeriesModal(false);
      setEditingSeries(null);
      resetSeriesForm();
      loadData();
    } catch (err: any) {
      toast({ title: t('adminSeriesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const deleteSeries = async (id: string) => {
    if (!confirm(t('adminSeriesManager', 'confirmDeleteSeries', 'Are you sure? This will delete all day content and user progress.'))) return;
    
    try {
      const { error } = await supabase.from('devotional_series').delete().eq('id', id);
      if (error) throw error;
      toast({ title: t('adminSeriesManager', 'deleted', 'Deleted'), description: t('adminSeriesManager', 'seriesRemoved', 'Series removed') });
      loadData();
    } catch (err: any) {
      toast({ title: t('adminSeriesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const openDaysManager = async (s: DevotionalSeries) => {
    setSelectedSeriesForDays(s);
    setShowDaysModal(true);
    
    try {
      const { data, error } = await supabase
        .from('devotional_entries')
        .select('*')
        .eq('series_id', s.id)
        .order('day_number');
      
      if (error) throw error;
      
      // If no days exist, create templates
      if (!data || data.length === 0) {
        const days = Array.from({ length: s.total_days }, (_, i) => ({
          series_id: s.id,
          day_number: i + 1,
          title: `Day ${i + 1}`,
          scripture_reference: '',
          scripture_text: '',
          main_content: '',
          reflection: '',
          audio_url: '',
          image_url: '',
          action_step: '',
          is_published: false
        }));
        setSeriesDays(days);
      } else {
        // Fill in any missing days
        const existingDays = new Map(data.map(d => [d.day_number, d]));
        const allDays = Array.from({ length: s.total_days }, (_, i) => {
          const dayNum = i + 1;
          return existingDays.get(dayNum) || {
            series_id: s.id,
            day_number: dayNum,
            title: `Day ${dayNum}`,
            scripture_reference: '',
            scripture_text: '',
            main_content: '',
            reflection: '',
            audio_url: '',
            image_url: '',
            action_step: '',
            is_published: false
          };
        });
        setSeriesDays(allDays);
      }
    } catch (err) {
      console.error('Error loading days:', err);
      toast({ title: t('adminSeriesManager', 'error', 'Error'), description: t('adminSeriesManager', 'failedLoadDays', 'Failed to load day content'), variant: 'destructive' });
    }
  };

  const updateDayField = (dayNumber: number, field: keyof DevotionalDay, value: any) => {
    setSeriesDays(prev => prev.map(d => 
      d.day_number === dayNumber ? { ...d, [field]: value } : d
    ));
  };

  const saveDays = async () => {
    if (!selectedSeriesForDays) return;
    setSavingDays(true);

    try {
      // Upsert all days
      for (const day of seriesDays) {
        if (day.id) {
          await supabase
            .from('devotional_entries')
            .update({
              title: day.title,
              scripture_reference: day.scripture_reference,
              scripture_text: day.scripture_text,
              main_content: day.main_content,
              reflection: day.reflection,
              audio_url: day.audio_url,
              image_url: day.image_url,
              action_step: day.action_step,
              is_published: day.is_published,
              updated_at: new Date().toISOString()
            })
            .eq('id', day.id);
        } else {
          await supabase
            .from('devotional_entries')
            .insert({
              series_id: selectedSeriesForDays.id,
              day_number: day.day_number,
              title: day.title,
              scripture_reference: day.scripture_reference,
              scripture_text: day.scripture_text,
              main_content: day.main_content,
              reflection: day.reflection,
              audio_url: day.audio_url,
              image_url: day.image_url,
              action_step: day.action_step,
              is_published: day.is_published
            });
        }
      }

      toast({ title: t('adminSeriesManager', 'success', 'Success'), description: t('adminSeriesManager', 'allDaysSaved', 'All days saved successfully') });
    } catch (err: any) {
      toast({ title: t('adminSeriesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSavingDays(false);
    }
  };

  const validateSeriesForPublish = () => {
    if (!seriesDays.length) return { valid: false, message: t('adminSeriesManager', 'noDaysConfigured', 'No days configured') };

    const incompleteDays = seriesDays.filter(d =>
      !d.title.trim() || !d.main_content.trim()
    );

    if (incompleteDays.length > 0) {
      return {
        valid: false,
        message: t('adminSeriesManager', 'daysMissingContent', 'Days {days} are missing required content (title and main content)').replace('{days}', incompleteDays.map(d => d.day_number).join(', '))
      };
    }
    
    return { valid: true, message: '' };
  };

  const publishSeries = async () => {
    if (!selectedSeriesForDays) return;
    
    const validation = validateSeriesForPublish();
    if (!validation.valid) {
      toast({ title: t('adminSeriesManager', 'cannotPublish', 'Cannot Publish'), description: validation.message, variant: 'destructive' });
      return;
    }

    try {
      // Publish all days
      await supabase
        .from('devotional_entries')
        .update({ is_published: true })
        .eq('series_id', selectedSeriesForDays.id);

      // Publish series
      await supabase
        .from('devotional_series')
        .update({ is_published: true, updated_at: new Date().toISOString() })
        .eq('id', selectedSeriesForDays.id);

      toast({ title: t('adminSeriesManager', 'published', 'Published!'), description: t('adminSeriesManager', 'seriesNowLive', 'Series is now live') });
      setShowDaysModal(false);
      loadData();
    } catch (err: any) {
      toast({ title: t('adminSeriesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const getDayCompletionStatus = (day: DevotionalDay) => {
    const hasTitle = !!day.title.trim();
    const hasContent = !!day.main_content.trim();
    const hasScripture = !!day.scripture_reference.trim();
    
    if (hasTitle && hasContent && hasScripture) return 'complete';
    if (hasTitle && hasContent) return 'partial';
    return 'empty';
  };

  const filteredSeries = series.filter(s =>
    s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('adminSeriesManager', 'heading', 'Devotional Series Manager')}</h2>
          <p className="text-gray-500">{t('adminSeriesManager', 'subheading', 'Create and manage multi-day devotional content')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('adminSeriesManager', 'refresh', 'Refresh')}
          </Button>
          <Button onClick={() => { resetSeriesForm(); setEditingSeries(null); setShowSeriesModal(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            {t('adminSeriesManager', 'newSeries', 'New Series')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <BookOpen className="h-6 w-6 mx-auto text-purple-500 mb-2" />
              <p className="text-2xl font-bold">{stats.total_series}</p>
              <p className="text-xs text-gray-500">{t('adminSeriesManager', 'totalSeries', 'Total Series')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Eye className="h-6 w-6 mx-auto text-green-500 mb-2" />
              <p className="text-2xl font-bold">{stats.published_series}</p>
              <p className="text-xs text-gray-500">{t('adminSeriesManager', 'publishedLabel', 'Published')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="h-6 w-6 mx-auto text-blue-500 mb-2" />
              <p className="text-2xl font-bold">{stats.total_users}</p>
              <p className="text-xs text-gray-500">{t('adminSeriesManager', 'activeReaders', 'Active Readers')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <BarChart3 className="h-6 w-6 mx-auto text-amber-500 mb-2" />
              <p className="text-2xl font-bold">{stats.completion_rate}%</p>
              <p className="text-xs text-gray-500">{t('adminSeriesManager', 'completionRate', 'Completion Rate')}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder={t('adminSeriesManager', 'searchSeries', 'Search series...')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Series Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSeries.map(s => (
          <Card key={s.id} className="overflow-hidden hover:shadow-lg transition-shadow">
            {s.cover_image_url && (
              <div className="h-32 bg-gradient-to-br from-purple-500 to-pink-500">
                <img src={s.cover_image_url} alt={s.title} className="w-full h-full object-cover" />
              </div>
            )}
            {!s.cover_image_url && (
              <div className="h-32 bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <BookMarked className="h-12 w-12 text-white/50" />
              </div>
            )}
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{s.title}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2">{s.description}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <Badge variant="outline">
                  <Calendar className="h-3 w-3 mr-1" />
                  {s.total_days} {t('adminSeriesManager', 'days', 'Days')}
                </Badge>
                <Badge className={s.difficulty_level === 'beginner' ? 'bg-green-100 text-green-700' : s.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}>
                  {s.difficulty_level}
                </Badge>
                {s.is_featured && (
                  <Badge className="bg-amber-500">
                    <Star className="h-3 w-3 mr-1" />
                    {t('adminSeriesManager', 'featured', 'Featured')}
                  </Badge>
                )}
                <Badge variant={s.is_published ? 'default' : 'secondary'}>
                  {s.is_published ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
                  {s.is_published ? t('adminSeriesManager', 'publishedLabel', 'Published') : t('adminSeriesManager', 'draft', 'Draft')}
                </Badge>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => openDaysManager(s)}>
                  <BookOpen className="h-4 w-4 mr-1" />
                  {t('adminSeriesManager', 'days', 'Days')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEditSeries(s)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => deleteSeries(s.id)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
                <TranslateNowButton contentType="devotional_series" contentId={s.id} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredSeries.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('adminSeriesManager', 'noSeriesFound', 'No Series Found')}</h3>
            <p className="text-gray-500 mb-4">{t('adminSeriesManager', 'createFirstSeries', 'Create your first devotional series to get started')}</p>
            <Button onClick={() => { resetSeriesForm(); setEditingSeries(null); setShowSeriesModal(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              {t('adminSeriesManager', 'createSeries', 'Create Series')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Series Modal */}
      <Dialog open={showSeriesModal} onOpenChange={setShowSeriesModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSeries ? t('adminSeriesManager', 'editSeries', 'Edit Series') : t('adminSeriesManager', 'createNewSeries', 'Create New Series')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{t('adminSeriesManager', 'titleLabel', 'Title *')}</Label>
              <Input
                value={seriesForm.title}
                onChange={(e) => setSeriesForm({ ...seriesForm, title: e.target.value })}
                placeholder={t('adminSeriesManager', 'titlePlaceholder', 'e.g., 21 Days of Prayer and Fasting')}
              />
            </div>

            <div>
              <Label>{t('adminSeriesManager', 'descriptionLabel', 'Description')}</Label>
              <Textarea
                value={seriesForm.description}
                onChange={(e) => setSeriesForm({ ...seriesForm, description: e.target.value })}
                placeholder={t('adminSeriesManager', 'descriptionPlaceholder', 'Describe what readers will gain from this series...')}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminSeriesManager', 'totalDaysLabel', 'Total Days *')}</Label>
                <Select
                  value={seriesForm.total_days.toString()} 
                  onValueChange={(v) => setSeriesForm({ ...seriesForm, total_days: parseInt(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 {t('adminSeriesManager', 'days', 'Days')}</SelectItem>
                    <SelectItem value="7">7 {t('adminSeriesManager', 'days', 'Days')}</SelectItem>
                    <SelectItem value="14">14 {t('adminSeriesManager', 'days', 'Days')}</SelectItem>
                    <SelectItem value="21">21 {t('adminSeriesManager', 'days', 'Days')}</SelectItem>
                    <SelectItem value="30">30 {t('adminSeriesManager', 'days', 'Days')}</SelectItem>
                    <SelectItem value="40">40 {t('adminSeriesManager', 'days', 'Days')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('adminSeriesManager', 'difficultyLabel', 'Difficulty')}</Label>
                <Select 
                  value={seriesForm.difficulty_level} 
                  onValueChange={(v) => setSeriesForm({ ...seriesForm, difficulty_level: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">{t('adminSeriesManager', 'beginner', 'Beginner')}</SelectItem>
                    <SelectItem value="intermediate">{t('adminSeriesManager', 'intermediate', 'Intermediate')}</SelectItem>
                    <SelectItem value="advanced">{t('adminSeriesManager', 'advanced', 'Advanced')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminSeriesManager', 'ministryLabel', 'Ministry (Optional)')}</Label>
                <Select
                  value={seriesForm.ministry_id || 'main-app'}
                  onValueChange={(v) => setSeriesForm({ ...seriesForm, ministry_id: v === 'main-app' ? '' : v })}
                >
                  <SelectTrigger><SelectValue placeholder={t('adminSeriesManager', 'mainApp', 'Main App')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main-app">{t('adminSeriesManager', 'mainApp', 'Main App')}</SelectItem>
                    {ministries.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('adminSeriesManager', 'startBehaviorLabel', 'Start Behavior')}</Label>
                <Select 
                  value={seriesForm.start_behavior} 
                  onValueChange={(v) => setSeriesForm({ ...seriesForm, start_behavior: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user_based">{t('adminSeriesManager', 'userBased', 'User-based (starts when joined)')}</SelectItem>
                    <SelectItem value="fixed_date">{t('adminSeriesManager', 'fixedDate', 'Fixed start date')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {seriesForm.start_behavior === 'fixed_date' && (
              <div>
                <Label>{t('adminSeriesManager', 'fixedStartDateLabel', 'Fixed Start Date')}</Label>
                <Input
                  type="date"
                  value={seriesForm.fixed_start_date}
                  onChange={(e) => setSeriesForm({ ...seriesForm, fixed_start_date: e.target.value })}
                />
              </div>
            )}

            <div>
              <Label>{t('adminSeriesManager', 'coverImageUrlLabel', 'Cover Image URL')}</Label>
              <Input
                value={seriesForm.cover_image_url}
                onChange={(e) => setSeriesForm({ ...seriesForm, cover_image_url: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={seriesForm.is_featured}
                  onCheckedChange={(v) => setSeriesForm({ ...seriesForm, is_featured: v })}
                />
                <Label>{t('adminSeriesManager', 'featured', 'Featured')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={seriesForm.is_published}
                  onCheckedChange={(v) => setSeriesForm({ ...seriesForm, is_published: v })}
                />
                <Label>{t('adminSeriesManager', 'publishedLabel', 'Published')}</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSeriesModal(false)}>{t('adminSeriesManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={saveSeries}>
              <Save className="h-4 w-4 mr-2" />
              {editingSeries ? t('adminSeriesManager', 'updateSeries', 'Update Series') : t('adminSeriesManager', 'createSeries', 'Create Series')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Days Manager Modal */}
      <Dialog open={showDaysModal} onOpenChange={setShowDaysModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{t('adminSeriesManager', 'manageDaysTitle', 'Manage Days: {title}').replace('{title}', selectedSeriesForDays?.title || '')}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {seriesDays.filter(d => getDayCompletionStatus(d) === 'complete').length} / {seriesDays.length} {t('adminSeriesManager', 'complete', 'Complete')}
                </Badge>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <Accordion type="single" collapsible className="space-y-2">
              {seriesDays.map((day) => {
                const status = getDayCompletionStatus(day);
                return (
                  <AccordionItem key={day.day_number} value={`day-${day.day_number}`} className="border rounded-lg">
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-3 w-full">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          status === 'complete' ? 'bg-green-100 text-green-700' :
                          status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {day.day_number}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium">{day.title || t('adminSeriesManager', 'dayN', 'Day {n}').replace('{n}', String(day.day_number))}</p>
                          <p className="text-xs text-gray-500">
                            {day.scripture_reference || t('adminSeriesManager', 'noScriptureSet', 'No scripture set')}
                          </p>
                        </div>
                        {status === 'complete' && <CheckCircle className="h-5 w-5 text-green-500" />}
                        {status === 'partial' && <AlertCircle className="h-5 w-5 text-yellow-500" />}
                        {day.is_published && <Badge className="bg-green-600 text-xs">{t('adminSeriesManager', 'publishedLabel', 'Published')}</Badge>}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-4 pt-2">
                        <div>
                          <Label>{t('adminSeriesManager', 'dayTitleLabel', 'Day Title *')}</Label>
                          <Input
                            value={day.title}
                            onChange={(e) => updateDayField(day.day_number, 'title', e.target.value)}
                            placeholder={t('adminSeriesManager', 'dayTitlePlaceholder', 'e.g., The Power of Gratitude')}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>{t('adminSeriesManager', 'scriptureReferenceLabel', 'Scripture Reference')}</Label>
                            <Input
                              value={day.scripture_reference}
                              onChange={(e) => updateDayField(day.day_number, 'scripture_reference', e.target.value)}
                              placeholder={t('adminSeriesManager', 'scriptureReferencePlaceholder', 'e.g., Psalm 100:1-5')}
                            />
                          </div>
                          <div>
                            <Label>{t('adminSeriesManager', 'audioUrlLabel', 'Audio URL (Optional)')}</Label>
                            <Input
                              value={day.audio_url}
                              onChange={(e) => updateDayField(day.day_number, 'audio_url', e.target.value)}
                              placeholder="https://..."
                            />
                          </div>
                        </div>

                        <div>
                          <Label>{t('adminSeriesManager', 'scriptureTextLabel', 'Scripture Text')}</Label>
                          <Textarea
                            value={day.scripture_text}
                            onChange={(e) => updateDayField(day.day_number, 'scripture_text', e.target.value)}
                            placeholder={t('adminSeriesManager', 'scriptureTextPlaceholder', 'Enter the full scripture text...')}
                            rows={3}
                          />
                        </div>

                        <div>
                          <Label>{t('adminSeriesManager', 'mainContentLabel', 'Main Devotional Content *')}</Label>
                          <Textarea
                            value={day.main_content}
                            onChange={(e) => updateDayField(day.day_number, 'main_content', e.target.value)}
                            placeholder={t('adminSeriesManager', 'mainContentPlaceholder', 'Write the main devotional message...')}
                            rows={6}
                          />
                        </div>

                        <div>
                          <Label>{t('adminSeriesManager', 'reflectionLabel', 'Reflection / Application')}</Label>
                          <Textarea
                            value={day.reflection}
                            onChange={(e) => updateDayField(day.day_number, 'reflection', e.target.value)}
                            placeholder={t('adminSeriesManager', 'reflectionPlaceholder', 'Questions or thoughts for reflection...')}
                            rows={3}
                          />
                        </div>

                        <div>
                          <Label>{t('adminSeriesManager', 'actionStepLabel', 'Action Step / Challenge (Optional)')}</Label>
                          <Input
                            value={day.action_step}
                            onChange={(e) => updateDayField(day.day_number, 'action_step', e.target.value)}
                            placeholder={t('adminSeriesManager', 'actionStepPlaceholder', "e.g., Write down 5 things you're grateful for today")}
                          />
                        </div>

                        <div>
                          <Label>{t('adminSeriesManager', 'imageUrlLabel', 'Image URL (Optional)')}</Label>
                          <Input
                            value={day.image_url}
                            onChange={(e) => updateDayField(day.day_number, 'image_url', e.target.value)}
                            placeholder="https://..."
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <Switch
                            checked={day.is_published}
                            onCheckedChange={(v) => updateDayField(day.day_number, 'is_published', v)}
                          />
                          <Label>{t('adminSeriesManager', 'publishThisDay', 'Publish this day')}</Label>
                          {day.id && (
                            <TranslateNowButton contentType="devotional_entry" contentId={day.id} className="ml-auto" />
                          )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>

          <DialogFooter className="border-t pt-4">
            <div className="flex items-center gap-2 w-full">
              <Button variant="outline" onClick={() => setShowDaysModal(false)}>
                {t('adminSeriesManager', 'close', 'Close')}
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={saveDays} disabled={savingDays}>
                {savingDays ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                {t('adminSeriesManager', 'saveAllDays', 'Save All Days')}
              </Button>
              <Button onClick={publishSeries} disabled={savingDays}>
                <Eye className="h-4 w-4 mr-2" />
                {t('adminSeriesManager', 'publishSeries', 'Publish Series')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSeriesManager;
