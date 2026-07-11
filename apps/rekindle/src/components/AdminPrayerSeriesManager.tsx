import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { TranslateNowButton } from "@/components/TranslateNowButton";
import { 
  Plus, Edit, Trash2, Save, BookOpen, Clock, 
  Loader2, Search, RefreshCw, Star, Eye, EyeOff, 
  Calendar, CheckCircle, AlertCircle, X
} from 'lucide-react';

interface PrayerSeries {
  id: string;
  category_id?: string;
  title: string;
  subtitle?: string;
  description: string;
  cover_image_url?: string;
  total_days: number;
  difficulty_level: string;
  start_behavior: string;
  fixed_start_date?: string;
  ministry_id?: string;
  is_featured: boolean;
  is_published: boolean;
  created_at: string;
}

interface PrayerDay {
  id?: string;
  series_id: string;
  day_number: number;
  title: string;
  prayer_text: string;
  scripture_reference: string;
  scripture_text: string;
  audio_url: string;
  prayer_focus: string;
  prayer_points: any[];
  duration_minutes: number;
  is_published: boolean;
}

interface PrayerCategory {
  id: string;
  name: string;
}

interface Ministry {
  id: string;
  name: string;
}

const AdminPrayerSeriesManager: React.FC = () => {
  const { t } = useLanguage();
  const [series, setSeries] = useState<PrayerSeries[]>([]);
  const [categories, setCategories] = useState<PrayerCategory[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [showDaysModal, setShowDaysModal] = useState(false);
  const [editingSeries, setEditingSeries] = useState<PrayerSeries | null>(null);
  const [selectedSeriesForDays, setSelectedSeriesForDays] = useState<PrayerSeries | null>(null);
  const [seriesDays, setSeriesDays] = useState<PrayerDay[]>([]);
  const [savingDays, setSavingDays] = useState(false);
  
  // Form state
  const [seriesForm, setSeriesForm] = useState({
    category_id: '',
    title: '',
    subtitle: '',
    description: '',
    cover_image_url: '',
    total_days: 7,
    difficulty_level: 'beginner',
    start_behavior: 'user_based',
    fixed_start_date: '',
    ministry_id: '',
    is_featured: false,
    is_published: false
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [seriesRes, categoriesRes, ministriesRes] = await Promise.all([
        supabase.from('prayer_series').select('*').order('created_at', { ascending: false }),
        supabase.from('prayer_categories').select('id, name').eq('is_active', true),
        supabase.from('ministry_groups').select('id, name').eq('is_active', true)
      ]);

      if (seriesRes.data) setSeries(seriesRes.data);
      if (categoriesRes.data) setCategories(categoriesRes.data);
      if (ministriesRes.data) setMinistries(ministriesRes.data);
    } catch (err) {
      console.error('Error loading data:', err);
      toast({ title: t('adminPrayerSeriesManager', 'errorTitle', 'Error'), description: t('adminPrayerSeriesManager', 'failedLoadData', 'Failed to load data'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const resetSeriesForm = () => {
    setSeriesForm({
      category_id: '',
      title: '',
      subtitle: '',
      description: '',
      cover_image_url: '',
      total_days: 7,
      difficulty_level: 'beginner',
      start_behavior: 'user_based',
      fixed_start_date: '',
      ministry_id: '',
      is_featured: false,
      is_published: false
    });
  };

  const openEditSeries = (s: PrayerSeries) => {
    setEditingSeries(s);
    setSeriesForm({
      category_id: s.category_id || '',
      title: s.title,
      subtitle: s.subtitle || '',
      description: s.description || '',
      cover_image_url: s.cover_image_url || '',
      total_days: s.total_days,
      difficulty_level: s.difficulty_level || 'beginner',
      start_behavior: s.start_behavior || 'user_based',
      fixed_start_date: s.fixed_start_date ? s.fixed_start_date.split('T')[0] : '',
      ministry_id: s.ministry_id || '',
      is_featured: s.is_featured,
      is_published: s.is_published
    });
    setShowSeriesModal(true);
  };

  const saveSeries = async () => {
    if (!seriesForm.title.trim()) {
      toast({ title: t('adminPrayerSeriesManager', 'errorTitle', 'Error'), description: t('adminPrayerSeriesManager', 'titleRequired', 'Title is required'), variant: 'destructive' });
      return;
    }

    try {
      const data = {
        category_id: seriesForm.category_id || null,
        title: seriesForm.title,
        subtitle: seriesForm.subtitle || null,
        description: seriesForm.description,
        cover_image_url: seriesForm.cover_image_url || null,
        total_days: seriesForm.total_days,
        difficulty_level: seriesForm.difficulty_level,
        start_behavior: seriesForm.start_behavior,
        fixed_start_date: seriesForm.start_behavior === 'fixed_date' && seriesForm.fixed_start_date 
          ? new Date(seriesForm.fixed_start_date).toISOString() 
          : null,
        ministry_id: seriesForm.ministry_id || null,
        is_featured: seriesForm.is_featured,
        is_published: seriesForm.is_published
      };

      if (editingSeries) {
        const { error } = await supabase
          .from('prayer_series')
          .update(data)
          .eq('id', editingSeries.id);
        if (error) throw error;
        toast({ title: t('adminPrayerSeriesManager', 'successTitle', 'Success'), description: t('adminPrayerSeriesManager', 'seriesUpdated', 'Series updated successfully') });
      } else {
        const { data: newSeries, error } = await supabase
          .from('prayer_series')
          .insert(data)
          .select()
          .single();
        if (error) throw error;
        
        // Auto-generate day records
        if (newSeries) {
          const days = Array.from({ length: seriesForm.total_days }, (_, i) => ({
            series_id: newSeries.id,
            day_number: i + 1,
            title: `Day ${i + 1} Prayer`,
            prayer_text: '',
            scripture_reference: '',
            scripture_text: '',
            audio_url: '',
            prayer_focus: '',
            prayer_points: [],
            duration_minutes: 10,
            is_published: false
          }));
          
          await supabase.from('prayer_series_days').insert(days);
        }
        
        toast({ title: t('adminPrayerSeriesManager', 'successTitle', 'Success'), description: t('adminPrayerSeriesManager', 'seriesCreated', 'Series created with day templates') });
      }

      setShowSeriesModal(false);
      setEditingSeries(null);
      resetSeriesForm();
      loadData();
    } catch (err: any) {
      toast({ title: t('adminPrayerSeriesManager', 'errorTitle', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const deleteSeries = async (id: string) => {
    if (!confirm(t('adminPrayerSeriesManager', 'confirmDelete', 'Are you sure? This will delete all day content and user progress.'))) return;
    
    try {
      const { error } = await supabase.from('prayer_series').delete().eq('id', id);
      if (error) throw error;
      toast({ title: t('adminPrayerSeriesManager', 'deletedTitle', 'Deleted'), description: t('adminPrayerSeriesManager', 'seriesRemoved', 'Series removed') });
      loadData();
    } catch (err: any) {
      toast({ title: t('adminPrayerSeriesManager', 'errorTitle', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const openDaysManager = async (s: PrayerSeries) => {
    setSelectedSeriesForDays(s);
    setShowDaysModal(true);
    
    try {
      const { data, error } = await supabase
        .from('prayer_series_days')
        .select('*')
        .eq('series_id', s.id)
        .order('day_number');
      
      if (error) throw error;
      
      // If no days exist, create templates
      if (!data || data.length === 0) {
        const days = Array.from({ length: s.total_days }, (_, i) => ({
          series_id: s.id,
          day_number: i + 1,
          title: `Day ${i + 1} Prayer`,
          prayer_text: '',
          scripture_reference: '',
          scripture_text: '',
          audio_url: '',
          prayer_focus: '',
          prayer_points: [],
          duration_minutes: 10,
          is_published: false
        }));
        setSeriesDays(days);
      } else {
        // Parse prayer_points if needed
        const parsedDays = data.map(d => ({
          ...d,
          prayer_points: typeof d.prayer_points === 'string' 
            ? JSON.parse(d.prayer_points) 
            : d.prayer_points || []
        }));
        
        // Fill in any missing days
        const existingDays = new Map(parsedDays.map(d => [d.day_number, d]));
        const allDays = Array.from({ length: s.total_days }, (_, i) => {
          const dayNum = i + 1;
          return existingDays.get(dayNum) || {
            series_id: s.id,
            day_number: dayNum,
            title: `Day ${dayNum} Prayer`,
            prayer_text: '',
            scripture_reference: '',
            scripture_text: '',
            audio_url: '',
            prayer_focus: '',
            prayer_points: [],
            duration_minutes: 10,
            is_published: false
          };
        });
        setSeriesDays(allDays);
      }
    } catch (err) {
      console.error('Error loading days:', err);
      toast({ title: t('adminPrayerSeriesManager', 'errorTitle', 'Error'), description: t('adminPrayerSeriesManager', 'failedLoadDays', 'Failed to load day content'), variant: 'destructive' });
    }
  };

  const updateDayField = (dayNumber: number, field: keyof PrayerDay, value: any) => {
    setSeriesDays(prev => prev.map(d => 
      d.day_number === dayNumber ? { ...d, [field]: value } : d
    ));
  };

  const addPrayerPoint = (dayNumber: number) => {
    setSeriesDays(prev => prev.map(d => {
      if (d.day_number === dayNumber) {
        return {
          ...d,
          prayer_points: [...d.prayer_points, { title: '', content: '', duration: 60 }]
        };
      }
      return d;
    }));
  };

  const updatePrayerPoint = (dayNumber: number, pointIndex: number, field: string, value: any) => {
    setSeriesDays(prev => prev.map(d => {
      if (d.day_number === dayNumber) {
        const newPoints = [...d.prayer_points];
        newPoints[pointIndex] = { ...newPoints[pointIndex], [field]: value };
        return { ...d, prayer_points: newPoints };
      }
      return d;
    }));
  };

  const removePrayerPoint = (dayNumber: number, pointIndex: number) => {
    setSeriesDays(prev => prev.map(d => {
      if (d.day_number === dayNumber) {
        const newPoints = d.prayer_points.filter((_, i) => i !== pointIndex);
        return { ...d, prayer_points: newPoints };
      }
      return d;
    }));
  };

  const saveDays = async () => {
    if (!selectedSeriesForDays) return;
    setSavingDays(true);

    try {
      for (const day of seriesDays) {
        const dayData = {
          title: day.title,
          prayer_text: day.prayer_text,
          scripture_reference: day.scripture_reference,
          scripture_text: day.scripture_text,
          audio_url: day.audio_url,
          prayer_focus: day.prayer_focus,
          prayer_points: day.prayer_points,
          duration_minutes: day.duration_minutes,
          is_published: day.is_published,
          updated_at: new Date().toISOString()
        };

        if (day.id) {
          await supabase
            .from('prayer_series_days')
            .update(dayData)
            .eq('id', day.id);
        } else {
          await supabase
            .from('prayer_series_days')
            .insert({
              series_id: selectedSeriesForDays.id,
              day_number: day.day_number,
              ...dayData
            });
        }
      }

      toast({ title: t('adminPrayerSeriesManager', 'successTitle', 'Success'), description: t('adminPrayerSeriesManager', 'allDaysSaved', 'All days saved successfully') });
    } catch (err: any) {
      toast({ title: t('adminPrayerSeriesManager', 'errorTitle', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSavingDays(false);
    }
  };

  const validateSeriesForPublish = () => {
    if (!seriesDays.length) return { valid: false, message: t('adminPrayerSeriesManager', 'noDaysConfigured', 'No days configured') };

    const incompleteDays = seriesDays.filter(d =>
      !d.title.trim() || !d.prayer_text.trim()
    );

    if (incompleteDays.length > 0) {
      return {
        valid: false,
        message: t('adminPrayerSeriesManager', 'daysMissingContent', 'Days {days} are missing required content (title and prayer text)').replace('{days}', incompleteDays.map(d => d.day_number).join(', '))
      };
    }
    
    return { valid: true, message: '' };
  };

  const publishSeries = async () => {
    if (!selectedSeriesForDays) return;
    
    const validation = validateSeriesForPublish();
    if (!validation.valid) {
      toast({ title: t('adminPrayerSeriesManager', 'cannotPublish', 'Cannot Publish'), description: validation.message, variant: 'destructive' });
      return;
    }

    try {
      // Publish all days
      await supabase
        .from('prayer_series_days')
        .update({ is_published: true })
        .eq('series_id', selectedSeriesForDays.id);

      // Publish series
      await supabase
        .from('prayer_series')
        .update({ is_published: true })
        .eq('id', selectedSeriesForDays.id);

      toast({ title: t('adminPrayerSeriesManager', 'publishedTitle', 'Published!'), description: t('adminPrayerSeriesManager', 'seriesLive', 'Series is now live') });
      setShowDaysModal(false);
      loadData();
    } catch (err: any) {
      toast({ title: t('adminPrayerSeriesManager', 'errorTitle', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const getDayCompletionStatus = (day: PrayerDay) => {
    const hasTitle = !!day.title.trim();
    const hasContent = !!day.prayer_text.trim();
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
          <h2 className="text-2xl font-bold">{t('adminPrayerSeriesManager', 'managerTitle', 'Prayer Series Manager')}</h2>
          <p className="text-gray-500">{t('adminPrayerSeriesManager', 'managerSubtitle', 'Create and manage multi-day prayer series with day-level content')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('adminPrayerSeriesManager', 'refresh', 'Refresh')}
          </Button>
          <Button onClick={() => { resetSeriesForm(); setEditingSeries(null); setShowSeriesModal(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            {t('adminPrayerSeriesManager', 'newSeries', 'New Series')}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder={t('adminPrayerSeriesManager', 'searchPlaceholder', 'Search series...')}
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
              <div className="h-32 bg-gradient-to-br from-indigo-500 to-purple-500">
                <img src={s.cover_image_url} alt={s.title} className="w-full h-full object-cover" />
              </div>
            )}
            {!s.cover_image_url && (
              <div className="h-32 bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                <BookOpen className="h-12 w-12 text-white/50" />
              </div>
            )}
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{s.title}</h3>
                  {s.subtitle && <p className="text-sm text-gray-600">{s.subtitle}</p>}
                  <p className="text-sm text-gray-500 line-clamp-2">{s.description}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <Badge variant="outline">
                  <Calendar className="h-3 w-3 mr-1" />
                  {t('adminPrayerSeriesManager', 'daysCount', '{count} Days').replace('{count}', String(s.total_days))}
                </Badge>
                <Badge className={s.difficulty_level === 'beginner' ? 'bg-green-100 text-green-700' : s.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}>
                  {s.difficulty_level}
                </Badge>
                {s.is_featured && (
                  <Badge className="bg-amber-500">
                    <Star className="h-3 w-3 mr-1" />
                    {t('adminPrayerSeriesManager', 'featured', 'Featured')}
                  </Badge>
                )}
                <Badge variant={s.is_published ? 'default' : 'secondary'}>
                  {s.is_published ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
                  {s.is_published ? t('adminPrayerSeriesManager', 'published', 'Published') : t('adminPrayerSeriesManager', 'draft', 'Draft')}
                </Badge>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => openDaysManager(s)}>
                  <BookOpen className="h-4 w-4 mr-1" />
                  {t('adminPrayerSeriesManager', 'days', 'Days')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEditSeries(s)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => deleteSeries(s.id)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
                <TranslateNowButton contentType="prayer_series" contentId={s.id} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredSeries.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('adminPrayerSeriesManager', 'noSeriesFound', 'No Prayer Series Found')}</h3>
            <p className="text-gray-500 mb-4">{t('adminPrayerSeriesManager', 'noSeriesHint', 'Create your first prayer series to get started')}</p>
            <Button onClick={() => { resetSeriesForm(); setEditingSeries(null); setShowSeriesModal(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              {t('adminPrayerSeriesManager', 'createSeries', 'Create Series')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Series Modal */}
      <Dialog open={showSeriesModal} onOpenChange={setShowSeriesModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSeries ? t('adminPrayerSeriesManager', 'editSeries', 'Edit Series') : t('adminPrayerSeriesManager', 'createNewSeries', 'Create New Prayer Series')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{t('adminPrayerSeriesManager', 'titleLabel', 'Title *')}</Label>
              <Input
                value={seriesForm.title}
                onChange={(e) => setSeriesForm({ ...seriesForm, title: e.target.value })}
                placeholder={t('adminPrayerSeriesManager', 'titlePlaceholder', 'e.g., 7 Days of Fasting Prayer')}
              />
            </div>

            <div>
              <Label>{t('adminPrayerSeriesManager', 'subtitleLabel', 'Subtitle')}</Label>
              <Input
                value={seriesForm.subtitle}
                onChange={(e) => setSeriesForm({ ...seriesForm, subtitle: e.target.value })}
                placeholder={t('adminPrayerSeriesManager', 'subtitlePlaceholder', 'Optional subtitle')}
              />
            </div>

            <div>
              <Label>{t('adminPrayerSeriesManager', 'descriptionLabel', 'Description')}</Label>
              <Textarea
                value={seriesForm.description}
                onChange={(e) => setSeriesForm({ ...seriesForm, description: e.target.value })}
                placeholder={t('adminPrayerSeriesManager', 'descriptionPlaceholder', 'Describe what users will experience...')}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminPrayerSeriesManager', 'categoryLabel', 'Category')}</Label>
                <Select
                  value={seriesForm.category_id}
                  onValueChange={(v) => setSeriesForm({ ...seriesForm, category_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder={t('adminPrayerSeriesManager', 'selectCategory', 'Select category')} /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('adminPrayerSeriesManager', 'totalDaysLabel', 'Total Days *')}</Label>
                <Select
                  value={seriesForm.total_days.toString()}
                  onValueChange={(v) => setSeriesForm({ ...seriesForm, total_days: parseInt(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">{t('adminPrayerSeriesManager', 'days3', '3 Days')}</SelectItem>
                    <SelectItem value="7">{t('adminPrayerSeriesManager', 'days7', '7 Days')}</SelectItem>
                    <SelectItem value="14">{t('adminPrayerSeriesManager', 'days14', '14 Days')}</SelectItem>
                    <SelectItem value="21">{t('adminPrayerSeriesManager', 'days21', '21 Days')}</SelectItem>
                    <SelectItem value="30">{t('adminPrayerSeriesManager', 'days30', '30 Days')}</SelectItem>
                    <SelectItem value="40">{t('adminPrayerSeriesManager', 'days40', '40 Days')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminPrayerSeriesManager', 'difficultyLabel', 'Difficulty')}</Label>
                <Select
                  value={seriesForm.difficulty_level}
                  onValueChange={(v) => setSeriesForm({ ...seriesForm, difficulty_level: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">{t('adminPrayerSeriesManager', 'beginner', 'Beginner')}</SelectItem>
                    <SelectItem value="intermediate">{t('adminPrayerSeriesManager', 'intermediate', 'Intermediate')}</SelectItem>
                    <SelectItem value="advanced">{t('adminPrayerSeriesManager', 'advanced', 'Advanced')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('adminPrayerSeriesManager', 'ministryLabel', 'Ministry (Optional)')}</Label>
                <Select
                  value={seriesForm.ministry_id || 'main-app'}
                  onValueChange={(v) => setSeriesForm({ ...seriesForm, ministry_id: v === 'main-app' ? '' : v })}
                >
                  <SelectTrigger><SelectValue placeholder={t('adminPrayerSeriesManager', 'mainApp', 'Main App')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main-app">{t('adminPrayerSeriesManager', 'mainApp', 'Main App')}</SelectItem>
                    {ministries.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminPrayerSeriesManager', 'startBehaviorLabel', 'Start Behavior')}</Label>
                <Select
                  value={seriesForm.start_behavior}
                  onValueChange={(v) => setSeriesForm({ ...seriesForm, start_behavior: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user_based">{t('adminPrayerSeriesManager', 'startUserBased', 'User-based (starts when joined)')}</SelectItem>
                    <SelectItem value="fixed_date">{t('adminPrayerSeriesManager', 'startFixedDate', 'Fixed start date')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {seriesForm.start_behavior === 'fixed_date' && (
                <div>
                  <Label>{t('adminPrayerSeriesManager', 'fixedStartDateLabel', 'Fixed Start Date')}</Label>
                  <Input
                    type="date"
                    value={seriesForm.fixed_start_date}
                    onChange={(e) => setSeriesForm({ ...seriesForm, fixed_start_date: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div>
              <Label>{t('adminPrayerSeriesManager', 'coverImageLabel', 'Cover Image URL')}</Label>
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
                <Label>{t('adminPrayerSeriesManager', 'featured', 'Featured')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={seriesForm.is_published}
                  onCheckedChange={(v) => setSeriesForm({ ...seriesForm, is_published: v })}
                />
                <Label>{t('adminPrayerSeriesManager', 'published', 'Published')}</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSeriesModal(false)}>{t('adminPrayerSeriesManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={saveSeries}>
              <Save className="h-4 w-4 mr-2" />
              {editingSeries ? t('adminPrayerSeriesManager', 'updateSeries', 'Update Series') : t('adminPrayerSeriesManager', 'createSeries', 'Create Series')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Days Manager Modal */}
      <Dialog open={showDaysModal} onOpenChange={setShowDaysModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{t('adminPrayerSeriesManager', 'manageDaysTitle', 'Manage Days: {title}').replace('{title}', selectedSeriesForDays?.title || '')}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {t('adminPrayerSeriesManager', 'completeCount', '{complete} / {total} Complete').replace('{complete}', String(seriesDays.filter(d => getDayCompletionStatus(d) === 'complete').length)).replace('{total}', String(seriesDays.length))}
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
                          <p className="font-medium">{day.title || t('adminPrayerSeriesManager', 'dayFallback', 'Day {n}').replace('{n}', String(day.day_number))}</p>
                          <p className="text-xs text-gray-500">
                            {day.scripture_reference || t('adminPrayerSeriesManager', 'noScriptureSet', 'No scripture set')} • {t('adminPrayerSeriesManager', 'minutesShort', '{n} min').replace('{n}', String(day.duration_minutes))}
                          </p>
                        </div>
                        {status === 'complete' && <CheckCircle className="h-5 w-5 text-green-500" />}
                        {status === 'partial' && <AlertCircle className="h-5 w-5 text-yellow-500" />}
                        {day.is_published && <Badge className="bg-green-600 text-xs">{t('adminPrayerSeriesManager', 'published', 'Published')}</Badge>}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>{t('adminPrayerSeriesManager', 'prayerTitleLabel', 'Prayer Title *')}</Label>
                            <Input
                              value={day.title}
                              onChange={(e) => updateDayField(day.day_number, 'title', e.target.value)}
                              placeholder={t('adminPrayerSeriesManager', 'prayerTitlePlaceholder', 'e.g., Prayer for Breakthrough')}
                            />
                          </div>
                          <div>
                            <Label>{t('adminPrayerSeriesManager', 'durationMinutesLabel', 'Duration (minutes)')}</Label>
                            <Input
                              type="number"
                              value={day.duration_minutes}
                              onChange={(e) => updateDayField(day.day_number, 'duration_minutes', parseInt(e.target.value) || 10)}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>{t('adminPrayerSeriesManager', 'scriptureReferenceLabel', 'Scripture Reference')}</Label>
                            <Input
                              value={day.scripture_reference}
                              onChange={(e) => updateDayField(day.day_number, 'scripture_reference', e.target.value)}
                              placeholder={t('adminPrayerSeriesManager', 'scriptureRefPlaceholder', 'e.g., Isaiah 40:31')}
                            />
                          </div>
                          <div>
                            <Label>{t('adminPrayerSeriesManager', 'prayerFocusLabel', 'Prayer Focus / Theme')}</Label>
                            <Input
                              value={day.prayer_focus}
                              onChange={(e) => updateDayField(day.day_number, 'prayer_focus', e.target.value)}
                              placeholder={t('adminPrayerSeriesManager', 'prayerFocusPlaceholder', 'e.g., Strength and Renewal')}
                            />
                          </div>
                        </div>

                        <div>
                          <Label>{t('adminPrayerSeriesManager', 'scriptureTextLabel', 'Scripture Text')}</Label>
                          <Textarea
                            value={day.scripture_text}
                            onChange={(e) => updateDayField(day.day_number, 'scripture_text', e.target.value)}
                            placeholder={t('adminPrayerSeriesManager', 'scriptureTextPlaceholder', 'Enter the full scripture text...')}
                            rows={2}
                          />
                        </div>

                        <div>
                          <Label>{t('adminPrayerSeriesManager', 'mainPrayerTextLabel', 'Main Prayer Text *')}</Label>
                          <Textarea
                            value={day.prayer_text}
                            onChange={(e) => updateDayField(day.day_number, 'prayer_text', e.target.value)}
                            placeholder={t('adminPrayerSeriesManager', 'mainPrayerTextPlaceholder', 'Write the main prayer content...')}
                            rows={4}
                          />
                        </div>

                        <div>
                          <Label>{t('adminPrayerSeriesManager', 'audioUrlLabel', 'Audio URL (Optional)')}</Label>
                          <Input
                            value={day.audio_url}
                            onChange={(e) => updateDayField(day.day_number, 'audio_url', e.target.value)}
                            placeholder="https://..."
                          />
                        </div>

                        {/* Prayer Points */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label>{t('adminPrayerSeriesManager', 'prayerPointsLabel', 'Prayer Points')}</Label>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => addPrayerPoint(day.day_number)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              {t('adminPrayerSeriesManager', 'addPoint', 'Add Point')}
                            </Button>
                          </div>
                          <div className="space-y-3">
                            {day.prayer_points.map((point, idx) => (
                              <div key={idx} className="p-3 border rounded-lg bg-gray-50">
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 space-y-2">
                                    <Input
                                      value={point.title}
                                      onChange={(e) => updatePrayerPoint(day.day_number, idx, 'title', e.target.value)}
                                      placeholder={t('adminPrayerSeriesManager', 'pointTitlePlaceholder', 'Point title')}
                                    />
                                    <Textarea
                                      value={point.content}
                                      onChange={(e) => updatePrayerPoint(day.day_number, idx, 'content', e.target.value)}
                                      placeholder={t('adminPrayerSeriesManager', 'pointContentPlaceholder', 'Prayer content...')}
                                      rows={2}
                                    />
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs">{t('adminPrayerSeriesManager', 'durationSecLabel', 'Duration (sec):')}</Label>
                                      <Input
                                        type="number"
                                        value={point.duration}
                                        onChange={(e) => updatePrayerPoint(day.day_number, idx, 'duration', parseInt(e.target.value) || 60)}
                                        className="w-20"
                                      />
                                    </div>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => removePrayerPoint(day.day_number, idx)}
                                  >
                                    <X className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Switch
                            checked={day.is_published}
                            onCheckedChange={(v) => updateDayField(day.day_number, 'is_published', v)}
                          />
                          <Label>{t('adminPrayerSeriesManager', 'publishThisDay', 'Publish this day')}</Label>
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
                {t('adminPrayerSeriesManager', 'close', 'Close')}
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={saveDays} disabled={savingDays}>
                {savingDays ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                {t('adminPrayerSeriesManager', 'saveAllDays', 'Save All Days')}
              </Button>
              <Button onClick={publishSeries} disabled={savingDays}>
                <Eye className="h-4 w-4 mr-2" />
                {t('adminPrayerSeriesManager', 'publishSeries', 'Publish Series')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPrayerSeriesManager;