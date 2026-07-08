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
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { TranslateNowButton } from "@/components/TranslateNowButton";
import { 
  Plus, Edit, Trash2, Save, BookOpen, Clock, 
  Loader2, Search, RefreshCw, Star, Eye, EyeOff, 
  Calendar, CheckCircle, AlertCircle, X, Timer,
  Flame, BarChart3, Users, Link, Upload, Image as ImageIcon
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
  const resolvedLabel = label ?? t('adminPrayerLibrary', 'coverImage', 'Cover Image');

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
      toast({ title: t('adminPrayerLibrary', 'imageUploaded', 'Image uploaded') });
    } catch (err: any) {
      toast({ title: t('adminPrayerLibrary', 'uploadFailed', 'Upload failed'), description: err.message, variant: 'destructive' });
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
          <img src={value} alt={t('adminPrayerLibrary', 'coverPreview', 'Cover preview')} className={`${previewClass} rounded-lg object-cover border`} />
        ) : (
          <div className={`${previewClass} rounded-lg border flex items-center justify-center bg-gray-50`}>
            <ImageIcon className="h-5 w-5 text-gray-300" />
          </div>
        )}
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={t('adminPrayerLibrary', 'pasteImageUrl', 'Paste image URL…')} />
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 cursor-pointer hover:text-purple-700">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? t('adminPrayerLibrary', 'uploading', 'Uploading…') : t('adminPrayerLibrary', 'uploadFile', 'Upload file')}
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
    </div>
  );
};

// ===== INTERFACES =====
interface ScriptureRef {
  reference: string;
  text: string;
}

interface PrayerTopic {
  id?: string;
  title: string;
  description: string;
  author?: string;
  author_social_url?: string;
  prayer_points: any[];
  scripture_reference: string; // Kept for backward compatibility
  scripture_text: string; // Kept for backward compatibility
  scriptures?: ScriptureRef[]; // New: Multiple scripture references
  cover_image_url: string;
  is_featured: boolean;
  is_published: boolean;
}

interface PrayerSeries {
  id?: string;
  title: string;
  subtitle: string;
  description: string;
  author?: string;
  author_social_url?: string;
  cover_image_url: string;
  total_days: number;
  difficulty_level: string;
  start_behavior: string;
  fixed_start_date: string;
  is_featured: boolean;
  is_published: boolean;
}

interface PrayerDay {
  id?: string;
  series_id: string;
  day_number: number;
  title: string;
  prayer_text: string;
  scripture_reference: string; // Kept for backward compatibility
  scripture_text: string; // Kept for backward compatibility
  scriptures?: ScriptureRef[]; // New: Multiple scripture references
  audio_url: string;
  prayer_focus: string;
  prayer_points: any[];
  duration_minutes: number;
  is_published: boolean;
}

interface PrayerWatchEntry {
  id?: string;
  title: string;
  content: string;
  author?: string;
  author_social_url?: string;
  scripture_reference: string; // Kept for backward compatibility
  scripture_text: string; // Kept for backward compatibility
  scriptures?: ScriptureRef[]; // New: Multiple scripture references
  prayer_points: any[];
  duration_minutes: number;
  is_prayer_watch: boolean;
  prayer_watch_time: string;
  is_active: boolean;
}

interface UsageStats {
  total_sessions: number;
  total_users: number;
  total_topics: number;
  total_series: number;
  total_prayer_watches: number;
  avg_duration: number;
  most_popular_topic: string;
  most_popular_series: string;
}

const PRAYER_WATCH_TIME_SLOTS = [
  { value: '06:00:00', label: '6:00 AM' },
  { value: '09:00:00', label: '9:00 AM' },
  { value: '12:00:00', label: '12:00 PM' },
  { value: '15:00:00', label: '3:00 PM' },
  { value: '18:00:00', label: '6:00 PM' },
  { value: '21:00:00', label: '9:00 PM' },
  { value: '00:00:00', label: '12:00 AM' },
];

export const AdminPrayerLibrary: React.FC = () => {
  const { t } = useLanguage();
  // ===== STATE =====
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'prayer-topics' | 'prayer-series' | 'statistics' | 'prayer-watch'>('prayer-topics');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Data states
  const [prayerTopics, setPrayerTopics] = useState<PrayerTopic[]>([]);
  const [prayerSeries, setPrayerSeries] = useState<PrayerSeries[]>([]);
  const [prayerWatchEntries, setPrayerWatchEntries] = useState<PrayerWatchEntry[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  
  // Modal states
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [showDaysModal, setShowDaysModal] = useState(false);
  const [showPrayerWatchModal, setShowPrayerWatchModal] = useState(false);
  
  // Editing states
  const [editingTopic, setEditingTopic] = useState<PrayerTopic | null>(null);
  const [editingSeries, setEditingSeries] = useState<PrayerSeries | null>(null);
  const [editingPrayerWatch, setEditingPrayerWatch] = useState<PrayerWatchEntry | null>(null);
  const [selectedSeriesForDays, setSelectedSeriesForDays] = useState<PrayerSeries | null>(null);
  const [seriesDays, setSeriesDays] = useState<PrayerDay[]>([]);
  const [savingDays, setSavingDays] = useState(false);
  
  // Form states
  const [topicForm, setTopicForm] = useState<PrayerTopic>({
    title: '', description: '', prayer_points: [], scripture_reference: '',
    scripture_text: '', scriptures: [], cover_image_url: '', is_featured: false, is_published: true
  });
  
  const [seriesForm, setSeriesForm] = useState<PrayerSeries>({
    title: '', subtitle: '', description: '', cover_image_url: '',
    total_days: 7, difficulty_level: 'beginner', start_behavior: 'user_based',
    fixed_start_date: '', is_featured: false, is_published: false
  });
  
  const [prayerWatchForm, setPrayerWatchForm] = useState<PrayerWatchEntry>({
    title: '', content: '', scripture_reference: '', scripture_text: '',
    scriptures: [], prayer_points: [], duration_minutes: 10, is_prayer_watch: true,
    prayer_watch_time: '06:00:00', is_active: true
  });

  // ===== EFFECTS =====
  useEffect(() => {
    loadData();
  }, []);

  // ===== DATA LOADING =====
  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadPrayerTopics(),
        loadPrayerSeries(),
        loadPrayerWatch(),
        loadUsageStats()
      ]);
    } catch (err) {
      console.error('Error loading data:', err);
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: t('adminPrayerLibrary', 'failedToLoadData', 'Failed to load data'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadPrayerTopics = async () => {
    const { data, error } = await supabase
      .from('prayer_topics')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    const parsed = (data || []).map(row => ({
      ...row,
      prayer_points: typeof row.prayer_points === 'string' ? JSON.parse(row.prayer_points) : row.prayer_points || [],
      scriptures: typeof row.scriptures === 'string' ? JSON.parse(row.scriptures) : row.scriptures || []
    }));

    setPrayerTopics(parsed);
  };

  const loadPrayerSeries = async () => {
    const { data, error } = await supabase
      .from('prayer_series')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    setPrayerSeries(data || []);
  };

  const loadPrayerWatch = async () => {
    const { data, error } = await supabase
      .from('prayer_library')
      .select('*')
      .eq('is_prayer_watch', true)
      .order('prayer_watch_time');
    
    if (error) throw error;
    
    const parsed = (data || []).map(p => ({
      ...p,
      prayer_points: typeof p.prayer_points === 'string' ? JSON.parse(p.prayer_points) : p.prayer_points || [],
      scriptures: typeof p.scriptures === 'string' ? JSON.parse(p.scriptures) : p.scriptures || []
    }));
    
    setPrayerWatchEntries(parsed);
  };

  const loadUsageStats = async () => {
    try {
      const { data: sessions } = await supabase
        .from('prayer_sessions')
        .select('*')
        .eq('status', 'completed');

      const { data: topics } = await supabase.from('prayer_topics').select('id');
      const { data: series } = await supabase.from('prayer_series').select('id');
      const { data: watches } = await supabase.from('prayer_library').select('id').eq('is_prayer_watch', true);

      const uniqueUsers = new Set(sessions?.map(s => s.user_id) || []).size;
      const avgDuration = sessions && sessions.length > 0
        ? sessions.reduce((sum, s) => sum + (s.duration_actual || 0), 0) / sessions.length
        : 0;

      setUsageStats({
        total_sessions: sessions?.length || 0,
        total_users: uniqueUsers,
        total_topics: topics?.length || 0,
        total_series: series?.length || 0,
        total_prayer_watches: watches?.length || 0,
        avg_duration: Math.round(avgDuration / 60),
        most_popular_topic: 'N/A',
        most_popular_series: 'N/A'
      });
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  // ===== SCRIPTURE LOADER =====
  const [loadingTopicScripture, setLoadingTopicScripture] = useState(false);
  const [loadingWatchScripture, setLoadingWatchScripture] = useState(false);
  const [loadingDayScripture, setLoadingDayScripture] = useState<Record<number, boolean>>({});

  const loadScriptureForTopic = async () => {
    if (!topicForm.scripture_reference.trim()) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: t('adminPrayerLibrary', 'enterScriptureRefFirst', 'Please enter a scripture reference first'), variant: 'destructive' });
      return;
    }

    setLoadingTopicScripture(true);
    try {
      const response = await fetch(
        `https://bible-api.com/${encodeURIComponent(topicForm.scripture_reference)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        setTopicForm({ 
          ...topicForm, 
          scripture_text: data.text || data.verses?.[0]?.text || ''
        });
        toast({ title: t('adminPrayerLibrary', 'success', 'Success'), description: t('adminPrayerLibrary', 'scriptureLoaded', 'Scripture text loaded successfully') });
      } else {
        throw new Error('Scripture not found');
      }
    } catch (err) {
      console.error('Error loading scripture:', err);
      toast({ 
        title: t('adminPrayerLibrary', 'note', 'Note'),
        description: t('adminPrayerLibrary', 'couldNotAutoLoadScriptureLong', 'Could not auto-load scripture. Please enter manually or check the reference format (e.g., "John 3:16" or "Psalm 23:1-6")'),
        variant: 'default'
      });
    } finally {
      setLoadingTopicScripture(false);
    }
  };

  const loadScriptureForPrayerWatch = async () => {
    if (!prayerWatchForm.scripture_reference.trim()) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: t('adminPrayerLibrary', 'enterScriptureRefFirst', 'Please enter a scripture reference first'), variant: 'destructive' });
      return;
    }

    setLoadingWatchScripture(true);
    try {
      const response = await fetch(
        `https://bible-api.com/${encodeURIComponent(prayerWatchForm.scripture_reference)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        setPrayerWatchForm({ 
          ...prayerWatchForm, 
          scripture_text: data.text || data.verses?.[0]?.text || ''
        });
        toast({ title: t('adminPrayerLibrary', 'success', 'Success'), description: t('adminPrayerLibrary', 'scriptureLoaded', 'Scripture text loaded successfully') });
      } else {
        throw new Error('Scripture not found');
      }
    } catch (err) {
      console.error('Error loading scripture:', err);
      toast({ 
        title: t('adminPrayerLibrary', 'note', 'Note'),
        description: t('adminPrayerLibrary', 'couldNotAutoLoadScriptureLong', 'Could not auto-load scripture. Please enter manually or check the reference format (e.g., "John 3:16" or "Psalm 23:1-6")'),
        variant: 'default'
      });
    } finally {
      setLoadingWatchScripture(false);
    }
  };

  const loadScriptureForDay = async (dayNumber: number) => {
    const day = seriesDays.find(d => d.day_number === dayNumber);
    if (!day || !day.scripture_reference?.trim()) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: t('adminPrayerLibrary', 'enterScriptureRefFirst', 'Please enter a scripture reference first'), variant: 'destructive' });
      return;
    }

    setLoadingDayScripture({ ...loadingDayScripture, [dayNumber]: true });
    try {
      const response = await fetch(
        `https://bible-api.com/${encodeURIComponent(day.scripture_reference)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        updateDayField(dayNumber, 'scripture_text', data.text || data.verses?.[0]?.text || '');
        toast({ title: t('adminPrayerLibrary', 'success', 'Success'), description: t('adminPrayerLibrary', 'scriptureLoadedForDay', 'Scripture loaded for Day {day}').replace('{day}', String(dayNumber)) });
      } else {
        throw new Error('Scripture not found');
      }
    } catch (err) {
      console.error('Error loading scripture:', err);
      toast({ 
        title: t('adminPrayerLibrary', 'note', 'Note'),
        description: t('adminPrayerLibrary', 'couldNotAutoLoadScriptureLong', 'Could not auto-load scripture. Please enter manually or check the reference format (e.g., "John 3:16" or "Psalm 23:1-6")'),
        variant: 'default'
      });
    } finally {
      setLoadingDayScripture({ ...loadingDayScripture, [dayNumber]: false });
    }
  };

  // ===== MULTIPLE SCRIPTURES MANAGEMENT =====
  const [loadingScriptureIndex, setLoadingScriptureIndex] = useState<{type: string, index: number} | null>(null);

  const addScriptureToTopic = () => {
    const newScriptures = [...(topicForm.scriptures || []), { reference: '', text: '' }];
    setTopicForm({ ...topicForm, scriptures: newScriptures });
  };

  const removeScriptureFromTopic = (index: number) => {
    const newScriptures = (topicForm.scriptures || []).filter((_, i) => i !== index);
    setTopicForm({ ...topicForm, scriptures: newScriptures });
  };

  const updateTopicScripture = (index: number, field: 'reference' | 'text', value: string) => {
    const newScriptures = [...(topicForm.scriptures || [])];
    newScriptures[index] = { ...newScriptures[index], [field]: value };
    setTopicForm({ ...topicForm, scriptures: newScriptures });
  };

  const loadScriptureTextForTopic = async (index: number) => {
    const scripture = topicForm.scriptures?.[index];
    if (!scripture?.reference.trim()) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: t('adminPrayerLibrary', 'enterScriptureRefFirst', 'Please enter a scripture reference first'), variant: 'destructive' });
      return;
    }

    setLoadingScriptureIndex({ type: 'topic', index });
    try {
      const response = await fetch(
        `https://bible-api.com/${encodeURIComponent(scripture.reference)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        updateTopicScripture(index, 'text', data.text || data.verses?.[0]?.text || '');
        toast({ title: t('adminPrayerLibrary', 'success', 'Success'), description: t('adminPrayerLibrary', 'scriptureLoaded', 'Scripture text loaded successfully') });
      } else {
        throw new Error('Scripture not found');
      }
    } catch (err) {
      console.error('Error loading scripture:', err);
      toast({ 
        title: t('adminPrayerLibrary', 'note', 'Note'),
        description: t('adminPrayerLibrary', 'couldNotAutoLoadScripture', 'Could not auto-load scripture. Please enter manually or check the reference format'),
        variant: 'default'
      });
    } finally {
      setLoadingScriptureIndex(null);
    }
  };

  const addScriptureToPrayerWatch = () => {
    const newScriptures = [...(prayerWatchForm.scriptures || []), { reference: '', text: '' }];
    setPrayerWatchForm({ ...prayerWatchForm, scriptures: newScriptures });
  };

  const removeScriptureFromPrayerWatch = (index: number) => {
    const newScriptures = (prayerWatchForm.scriptures || []).filter((_, i) => i !== index);
    setPrayerWatchForm({ ...prayerWatchForm, scriptures: newScriptures });
  };

  const updatePrayerWatchScripture = (index: number, field: 'reference' | 'text', value: string) => {
    const newScriptures = [...(prayerWatchForm.scriptures || [])];
    newScriptures[index] = { ...newScriptures[index], [field]: value };
    setPrayerWatchForm({ ...prayerWatchForm, scriptures: newScriptures });
  };

  const loadScriptureTextForPrayerWatch = async (index: number) => {
    const scripture = prayerWatchForm.scriptures?.[index];
    if (!scripture?.reference.trim()) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: t('adminPrayerLibrary', 'enterScriptureRefFirst', 'Please enter a scripture reference first'), variant: 'destructive' });
      return;
    }

    setLoadingScriptureIndex({ type: 'watch', index });
    try {
      const response = await fetch(
        `https://bible-api.com/${encodeURIComponent(scripture.reference)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        updatePrayerWatchScripture(index, 'text', data.text || data.verses?.[0]?.text || '');
        toast({ title: t('adminPrayerLibrary', 'success', 'Success'), description: t('adminPrayerLibrary', 'scriptureLoaded', 'Scripture text loaded successfully') });
      } else {
        throw new Error('Scripture not found');
      }
    } catch (err) {
      console.error('Error loading scripture:', err);
      toast({ 
        title: t('adminPrayerLibrary', 'note', 'Note'),
        description: t('adminPrayerLibrary', 'couldNotAutoLoadScripture', 'Could not auto-load scripture. Please enter manually or check the reference format'),
        variant: 'default'
      });
    } finally {
      setLoadingScriptureIndex(null);
    }
  };

  const addScriptureToDay = (dayNumber: number) => {
    const day = seriesDays.find(d => d.day_number === dayNumber);
    if (!day) return;
    
    const newScriptures = [...(day.scriptures || []), { reference: '', text: '' }];
    updateDayField(dayNumber, 'scriptures', newScriptures);
  };

  const removeScriptureFromDay = (dayNumber: number, scriptureIndex: number) => {
    const day = seriesDays.find(d => d.day_number === dayNumber);
    if (!day) return;
    
    const newScriptures = (day.scriptures || []).filter((_, i) => i !== scriptureIndex);
    updateDayField(dayNumber, 'scriptures', newScriptures);
  };

  const updateDayScripture = (dayNumber: number, scriptureIndex: number, field: 'reference' | 'text', value: string) => {
    const day = seriesDays.find(d => d.day_number === dayNumber);
    if (!day) return;
    
    const newScriptures = [...(day.scriptures || [])];
    newScriptures[scriptureIndex] = { ...newScriptures[scriptureIndex], [field]: value };
    updateDayField(dayNumber, 'scriptures', newScriptures);
  };

  const loadScriptureTextForDay = async (dayNumber: number, scriptureIndex: number) => {
    const day = seriesDays.find(d => d.day_number === dayNumber);
    const scripture = day?.scriptures?.[scriptureIndex];
    
    if (!scripture?.reference.trim()) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: t('adminPrayerLibrary', 'enterScriptureRefFirst', 'Please enter a scripture reference first'), variant: 'destructive' });
      return;
    }

    setLoadingScriptureIndex({ type: `day-${dayNumber}`, index: scriptureIndex });
    try {
      const response = await fetch(
        `https://bible-api.com/${encodeURIComponent(scripture.reference)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        updateDayScripture(dayNumber, scriptureIndex, 'text', data.text || data.verses?.[0]?.text || '');
        toast({ title: t('adminPrayerLibrary', 'success', 'Success'), description: t('adminPrayerLibrary', 'scriptureLoaded', 'Scripture text loaded successfully') });
      } else {
        throw new Error('Scripture not found');
      }
    } catch (err) {
      console.error('Error loading scripture:', err);
      toast({ 
        title: t('adminPrayerLibrary', 'note', 'Note'),
        description: t('adminPrayerLibrary', 'couldNotAutoLoadScripture', 'Could not auto-load scripture. Please enter manually or check the reference format'),
        variant: 'default'
      });
    } finally {
      setLoadingScriptureIndex(null);
    }
  };

  // ===== PRAYER TOPICS CRUD =====
  const saveTopic = async () => {
    if (!topicForm.title.trim()) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: t('adminPrayerLibrary', 'titleRequired', 'Title is required'), variant: 'destructive' });
      return;
    }

    try {
      if (editingTopic?.id) {
        const { error } = await supabase
          .from('prayer_topics')
          .update(topicForm)
          .eq('id', editingTopic.id);
        if (error) throw error;
        toast({ title: t('adminPrayerLibrary', 'success', 'Success'), description: t('adminPrayerLibrary', 'prayerTopicUpdated', 'Prayer topic updated') });
      } else {
        const { error } = await supabase
          .from('prayer_topics')
          .insert(topicForm);
        if (error) throw error;
        toast({ title: t('adminPrayerLibrary', 'success', 'Success'), description: t('adminPrayerLibrary', 'prayerTopicCreated', 'Prayer topic created') });
      }
      setShowTopicModal(false);
      setEditingTopic(null);
      resetTopicForm();
      loadPrayerTopics();
    } catch (err: any) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const deleteTopic = async (id: string) => {
    if (!confirm(t('adminPrayerLibrary', 'confirmDeleteTopic', 'Are you sure you want to delete this prayer topic?'))) return;
    try {
      const { error } = await supabase.from('prayer_topics').delete().eq('id', id);
      if (error) throw error;
      toast({ title: t('adminPrayerLibrary', 'deleted', 'Deleted'), description: t('adminPrayerLibrary', 'prayerTopicRemoved', 'Prayer topic removed') });
      loadPrayerTopics();
    } catch (err: any) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const resetTopicForm = () => {
    setTopicForm({
      title: '', description: '', prayer_points: [], scripture_reference: '',
      scripture_text: '', scriptures: [], cover_image_url: '', is_featured: false, is_published: true
    });
  };

  const openEditTopic = (topic: PrayerTopic) => {
    setEditingTopic(topic);
    setTopicForm({
      title: topic.title,
      description: topic.description,
      prayer_points: topic.prayer_points || [],
      scripture_reference: topic.scripture_reference || '',
      scripture_text: topic.scripture_text || '',
      scriptures: topic.scriptures || [],
      cover_image_url: topic.cover_image_url || '',
      is_featured: topic.is_featured,
      is_published: topic.is_published
    });
    setShowTopicModal(true);
  };

  // ===== PRAYER SERIES CRUD =====
  const saveSeries = async () => {
    if (!seriesForm.title.trim()) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: t('adminPrayerLibrary', 'titleRequired', 'Title is required'), variant: 'destructive' });
      return;
    }

    try {
      const data = {
        ...seriesForm,
        fixed_start_date: seriesForm.start_behavior === 'fixed_date' && seriesForm.fixed_start_date
          ? new Date(seriesForm.fixed_start_date).toISOString()
          : null
      };

      if (editingSeries?.id) {
        const { error } = await supabase
          .from('prayer_series')
          .update(data)
          .eq('id', editingSeries.id);
        if (error) throw error;
        toast({ title: t('adminPrayerLibrary', 'success', 'Success'), description: t('adminPrayerLibrary', 'seriesUpdated', 'Series updated') });
      } else {
        const { data: newSeries, error } = await supabase
          .from('prayer_series')
          .insert(data)
          .select()
          .single();
        if (error) throw error;

        // Auto-generate day templates
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
        
        toast({ title: t('adminPrayerLibrary', 'success', 'Success'), description: t('adminPrayerLibrary', 'seriesCreatedWithTemplates', 'Series created with day templates') });
      }

      setShowSeriesModal(false);
      setEditingSeries(null);
      resetSeriesForm();
      loadPrayerSeries();
    } catch (err: any) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const deleteSeries = async (id: string) => {
    if (!confirm(t('adminPrayerLibrary', 'confirmDeleteSeries', 'Are you sure? This will delete all day content and user progress.'))) return;
    try {
      const { error } = await supabase.from('prayer_series').delete().eq('id', id);
      if (error) throw error;
      toast({ title: t('adminPrayerLibrary', 'deleted', 'Deleted'), description: t('adminPrayerLibrary', 'seriesRemoved', 'Series removed') });
      loadPrayerSeries();
    } catch (err: any) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const resetSeriesForm = () => {
    setSeriesForm({
      title: '', subtitle: '', description: '', cover_image_url: '',
      total_days: 7, difficulty_level: 'beginner', start_behavior: 'user_based',
      fixed_start_date: '', is_featured: false, is_published: false
    });
  };

  const openEditSeries = (series: PrayerSeries) => {
    setEditingSeries(series);
    setSeriesForm({
      title: series.title,
      subtitle: series.subtitle || '',
      description: series.description || '',
      cover_image_url: series.cover_image_url || '',
      total_days: series.total_days,
      difficulty_level: series.difficulty_level || 'beginner',
      start_behavior: series.start_behavior || 'user_based',
      fixed_start_date: series.fixed_start_date ? series.fixed_start_date.split('T')[0] : '',
      is_featured: series.is_featured,
      is_published: series.is_published
    });
    setShowSeriesModal(true);
  };

  // ===== PRAYER SERIES DAYS MANAGEMENT =====
  const openDaysManager = async (series: PrayerSeries) => {
    setSelectedSeriesForDays(series);
    setShowDaysModal(true);
    
    try {
      const { data, error } = await supabase
        .from('prayer_series_days')
        .select('*')
        .eq('series_id', series.id)
        .order('day_number');
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        const days = Array.from({ length: series.total_days }, (_, i) => ({
          series_id: series.id!,
          day_number: i + 1,
          title: `Day ${i + 1} Prayer`,
          prayer_text: '',
          scripture_reference: '',
          scripture_text: '',
          scriptures: [],
          audio_url: '',
          prayer_focus: '',
          prayer_points: [],
          duration_minutes: 10,
          is_published: false
        }));
        setSeriesDays(days);
      } else {
        const parsedDays = data.map(d => ({
          ...d,
          prayer_points: typeof d.prayer_points === 'string' ? JSON.parse(d.prayer_points) : d.prayer_points || [],
          scriptures: typeof d.scriptures === 'string' ? JSON.parse(d.scriptures) : d.scriptures || []
        }));
        
        const existingDays = new Map(parsedDays.map(d => [d.day_number, d]));
        const allDays = Array.from({ length: series.total_days }, (_, i) => {
          const dayNum = i + 1;
          return existingDays.get(dayNum) || {
            series_id: series.id!,
            day_number: dayNum,
            title: `Day ${dayNum} Prayer`,
            prayer_text: '',
            scripture_reference: '',
            scripture_text: '',
            scriptures: [],
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
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: t('adminPrayerLibrary', 'failedToLoadDayContent', 'Failed to load day content'), variant: 'destructive' });
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
    if (!selectedSeriesForDays?.id) return;
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

      toast({ title: t('adminPrayerLibrary', 'success', 'Success'), description: t('adminPrayerLibrary', 'allDaysSaved', 'All days saved successfully') });
    } catch (err: any) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSavingDays(false);
    }
  };

  const publishSeries = async () => {
    if (!selectedSeriesForDays?.id) return;
    
    const incompleteDays = seriesDays.filter(d => !d.title.trim() || !d.prayer_text.trim());
    if (incompleteDays.length > 0) {
      toast({
        title: t('adminPrayerLibrary', 'cannotPublish', 'Cannot Publish'),
        description: t('adminPrayerLibrary', 'daysMissingContent', 'Days {days} are missing required content').replace('{days}', incompleteDays.map(d => d.day_number).join(', ')),
        variant: 'destructive'
      });
      return;
    }

    try {
      await supabase
        .from('prayer_series_days')
        .update({ is_published: true })
        .eq('series_id', selectedSeriesForDays.id);

      await supabase
        .from('prayer_series')
        .update({ is_published: true })
        .eq('id', selectedSeriesForDays.id);

      toast({ title: t('adminPrayerLibrary', 'publishedExclaim', 'Published!'), description: t('adminPrayerLibrary', 'seriesNowLive', 'Series is now live') });
      setShowDaysModal(false);
      loadPrayerSeries();
    } catch (err: any) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  // ===== PRAYER WATCH CRUD =====
  const savePrayerWatch = async () => {
    if (!prayerWatchForm.title.trim()) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: t('adminPrayerLibrary', 'titleRequired', 'Title is required'), variant: 'destructive' });
      return;
    }

    try {
      if (editingPrayerWatch?.id) {
        const { error } = await supabase
          .from('prayer_library')
          .update(prayerWatchForm)
          .eq('id', editingPrayerWatch.id);
        if (error) throw error;
        toast({ title: t('adminPrayerLibrary', 'success', 'Success'), description: t('adminPrayerLibrary', 'prayerWatchUpdated', 'Prayer watch updated') });
      } else {
        const { error } = await supabase
          .from('prayer_library')
          .insert(prayerWatchForm);
        if (error) throw error;
        toast({ title: t('adminPrayerLibrary', 'success', 'Success'), description: t('adminPrayerLibrary', 'prayerWatchCreated', 'Prayer watch created') });
      }
      setShowPrayerWatchModal(false);
      setEditingPrayerWatch(null);
      resetPrayerWatchForm();
      loadPrayerWatch();
    } catch (err: any) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const deletePrayerWatch = async (id: string) => {
    if (!confirm(t('adminPrayerLibrary', 'confirmDeleteWatch', 'Are you sure you want to delete this prayer watch entry?'))) return;
    try {
      const { error } = await supabase.from('prayer_library').delete().eq('id', id);
      if (error) throw error;
      toast({ title: t('adminPrayerLibrary', 'deleted', 'Deleted'), description: t('adminPrayerLibrary', 'prayerWatchRemoved', 'Prayer watch removed') });
      loadPrayerWatch();
    } catch (err: any) {
      toast({ title: t('adminPrayerLibrary', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const resetPrayerWatchForm = () => {
    setPrayerWatchForm({
      title: '', content: '', scripture_reference: '', scripture_text: '',
      scriptures: [], prayer_points: [], duration_minutes: 10, is_prayer_watch: true,
      prayer_watch_time: '06:00:00', is_active: true
    });
  };

  const openEditPrayerWatch = (entry: PrayerWatchEntry) => {
    setEditingPrayerWatch(entry);
    setPrayerWatchForm({
      title: entry.title,
      content: entry.content,
      scripture_reference: entry.scripture_reference || '',
      scripture_text: entry.scripture_text || '',
      scriptures: entry.scriptures || [],
      prayer_points: entry.prayer_points || [],
      duration_minutes: entry.duration_minutes,
      is_prayer_watch: true,
      prayer_watch_time: entry.prayer_watch_time || '06:00:00',
      is_active: entry.is_active
    });
    setShowPrayerWatchModal(true);
  };

  // ===== RENDER =====
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  const filteredTopics = prayerTopics.filter(topic =>
    topic.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    topic.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSeries = prayerSeries.filter(s =>
    s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('adminPrayerLibrary', 'prayerLibraryManagement', 'Prayer Library Management')}</h2>
          <p className="text-gray-500">{t('adminPrayerLibrary', 'manageLibraryDesc', 'Manage prayer topics, series, and prayer watch content')}</p>
        </div>
        <Button variant="outline" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('adminPrayerLibrary', 'refresh', 'Refresh')}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="prayer-topics">
            <Flame className="h-4 w-4 mr-1" />
            {t('adminPrayerLibrary', 'prayerTopics', 'Prayer Topics')}
          </TabsTrigger>
          <TabsTrigger value="prayer-series">
            <BookOpen className="h-4 w-4 mr-1" />
            {t('adminPrayerLibrary', 'prayerSeries', 'Prayer Series')}
          </TabsTrigger>
          <TabsTrigger value="statistics">
            <BarChart3 className="h-4 w-4 mr-1" />
            {t('adminPrayerLibrary', 'statistics', 'Statistics')}
          </TabsTrigger>
          <TabsTrigger value="prayer-watch">
            <Timer className="h-4 w-4 mr-1" />
            {t('adminPrayerLibrary', 'prayerWatch', 'Prayer Watch')}
          </TabsTrigger>
        </TabsList>

        {/* ===== PRAYER TOPICS TAB ===== */}
        <TabsContent value="prayer-topics" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('adminPrayerLibrary', 'searchPrayerTopics', 'Search prayer topics...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={() => { resetTopicForm(); setEditingTopic(null); setShowTopicModal(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              {t('adminPrayerLibrary', 'addPrayerTopic', 'Add Prayer Topic')}
            </Button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTopics.map(topic => (
              <Card key={topic.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                {topic.cover_image_url ? (
                  <div className="h-32 bg-gradient-to-br from-purple-500 to-pink-500">
                    <img src={topic.cover_image_url} alt={topic.title} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-32 bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Flame className="h-12 w-12 text-white/50" />
                  </div>
                )}
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{topic.title}</h3>
                      <p className="text-sm text-gray-500 line-clamp-2">{topic.description}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3 items-center">
                    <Badge variant="outline">
                      {t('adminPrayerLibrary', 'prayerPointsCount', '{count} Prayer Points').replace('{count}', String(topic.prayer_points?.length || 0))}
                    </Badge>
                    {topic.scripture_reference && (
                      <Badge variant="outline">{topic.scripture_reference}</Badge>
                    )}
                    {topic.author && (
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <span>{t('adminPrayerLibrary', 'byAuthor', 'by {author}').replace('{author}', String(topic.author))}</span>
                        {topic.author_social_url && (
                          <a 
                            href={topic.author_social_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center hover:text-purple-600 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link className="h-3 w-3 ml-1" />
                          </a>
                        )}
                      </div>
                    )}
                    {topic.is_featured && (
                      <Badge className="bg-amber-500">
                        <Star className="h-3 w-3 mr-1" />
                        {t('adminPrayerLibrary', 'featured', 'Featured')}
                      </Badge>
                    )}
                    <Badge variant={topic.is_published ? 'default' : 'secondary'}>
                      {topic.is_published ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
                      {topic.is_published ? t('adminPrayerLibrary', 'publishedBadge', 'Published') : t('adminPrayerLibrary', 'draft', 'Draft')}
                    </Badge>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openEditTopic(topic)}>
                      <Edit className="h-4 w-4 mr-1" />
                      {t('adminPrayerLibrary', 'edit', 'Edit')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => deleteTopic(topic.id!)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                    <TranslateNowButton contentType="prayer_topic" contentId={topic.id!} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredTopics.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <Flame className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">{t('adminPrayerLibrary', 'noPrayerTopicsFound', 'No Prayer Topics Found')}</h3>
                <p className="text-gray-500 mb-4">{t('adminPrayerLibrary', 'createFirstTopic', 'Create your first prayer topic to get started')}</p>
                <Button onClick={() => { resetTopicForm(); setEditingTopic(null); setShowTopicModal(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('adminPrayerLibrary', 'createPrayerTopic', 'Create Prayer Topic')}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== PRAYER SERIES TAB ===== */}
        <TabsContent value="prayer-series" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('adminPrayerLibrary', 'searchPrayerSeries', 'Search prayer series...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={() => { resetSeriesForm(); setEditingSeries(null); setShowSeriesModal(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              {t('adminPrayerLibrary', 'addPrayerSeries', 'Add Prayer Series')}
            </Button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSeries.map(series => (
              <Card key={series.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                {series.cover_image_url ? (
                  <div className="h-32 bg-gradient-to-br from-indigo-500 to-purple-500">
                    <img src={series.cover_image_url} alt={series.title} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-32 bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <BookOpen className="h-12 w-12 text-white/50" />
                  </div>
                )}
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{series.title}</h3>
                      {series.subtitle && <p className="text-sm text-gray-600">{series.subtitle}</p>}
                      <p className="text-sm text-gray-500 line-clamp-2">{series.description}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3 items-center">
                    <Badge variant="outline">
                      <Calendar className="h-3 w-3 mr-1" />
                      {t('adminPrayerLibrary', 'daysCount', '{count} Days').replace('{count}', String(series.total_days))}
                    </Badge>
                    {series.author && (
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <span>{t('adminPrayerLibrary', 'byAuthor', 'by {author}').replace('{author}', String(series.author))}</span>
                        {series.author_social_url && (
                          <a 
                            href={series.author_social_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center hover:text-purple-600 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link className="h-3 w-3 ml-1" />
                          </a>
                        )}
                      </div>
                    )}
                    {series.is_featured && (
                      <Badge className="bg-amber-500">
                        <Star className="h-3 w-3 mr-1" />
                        {t('adminPrayerLibrary', 'featured', 'Featured')}
                      </Badge>
                    )}
                    <Badge variant={series.is_published ? 'default' : 'secondary'}>
                      {series.is_published ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
                      {series.is_published ? t('adminPrayerLibrary', 'publishedBadge', 'Published') : t('adminPrayerLibrary', 'draft', 'Draft')}
                    </Badge>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openDaysManager(series)}>
                      <BookOpen className="h-4 w-4 mr-1" />
                      {t('adminPrayerLibrary', 'days', 'Days')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEditSeries(series)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => deleteSeries(series.id!)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                    <TranslateNowButton contentType="prayer_series" contentId={series.id!} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ===== STATISTICS TAB ===== */}
        <TabsContent value="statistics" className="space-y-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6 text-center">
                <Users className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                <p className="text-3xl font-bold">{usageStats?.total_users || 0}</p>
                <p className="text-sm text-gray-500">{t('adminPrayerLibrary', 'totalUsers', 'Total Users')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <BookOpen className="h-8 w-8 mx-auto text-purple-500 mb-2" />
                <p className="text-3xl font-bold">{usageStats?.total_sessions || 0}</p>
                <p className="text-sm text-gray-500">{t('adminPrayerLibrary', 'prayerSessions', 'Prayer Sessions')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <Clock className="h-8 w-8 mx-auto text-green-500 mb-2" />
                <p className="text-3xl font-bold">{usageStats?.avg_duration || 0} min</p>
                <p className="text-sm text-gray-500">{t('adminPrayerLibrary', 'avgDuration', 'Avg Duration')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <Flame className="h-8 w-8 mx-auto text-orange-500 mb-2" />
                <p className="text-3xl font-bold">{usageStats?.total_topics || 0}</p>
                <p className="text-sm text-gray-500">{t('adminPrayerLibrary', 'prayerTopics', 'Prayer Topics')}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('adminPrayerLibrary', 'contentOverview', 'Content Overview')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-purple-600">{usageStats?.total_topics || 0}</p>
                  <p className="text-sm text-gray-500">{t('adminPrayerLibrary', 'prayerTopics', 'Prayer Topics')}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">{usageStats?.total_series || 0}</p>
                  <p className="text-sm text-gray-500">{t('adminPrayerLibrary', 'prayerSeries', 'Prayer Series')}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-orange-600">{usageStats?.total_prayer_watches || 0}</p>
                  <p className="text-sm text-gray-500">{t('adminPrayerLibrary', 'prayerWatches', 'Prayer Watches')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== PRAYER WATCH TAB ===== */}
        <TabsContent value="prayer-watch" className="space-y-4">
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-purple-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-purple-900">{t('adminPrayerLibrary', 'prayerWatchSystem', 'Prayer Watch System')}</h3>
                  <p className="text-sm text-purple-700">
                    {t('adminPrayerLibrary', 'prayerWatchSystemDesc', 'Manage scheduled prayer times throughout the day. Each Prayer Watch entry corresponds to a specific time slot (6AM, 9AM, 12PM, 3PM, 6PM, 9PM, 12AM).')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => { 
              resetPrayerWatchForm();
              setEditingPrayerWatch(null); 
              setShowPrayerWatchModal(true); 
            }}>
              <Plus className="h-4 w-4 mr-2" />
              {t('adminPrayerLibrary', 'addPrayerWatchEntry', 'Add Prayer Watch Entry')}
            </Button>
          </div>

          <div className="space-y-3">
            {PRAYER_WATCH_TIME_SLOTS.map(timeSlot => {
              const prayer = prayerWatchEntries.find(p => p.prayer_watch_time === timeSlot.value);
              
              return (
                <Card 
                  key={timeSlot.value}
                  className={prayer ? 'bg-green-50 border-green-200' : 'border-dashed'}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-purple-600" />
                            <span className="text-xl font-bold">{timeSlot.label}</span>
                          </div>
                          
                          {prayer ? (
                            <Badge className={prayer.is_active ? "bg-green-600" : "bg-gray-400"}>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {prayer.is_active ? t('adminPrayerLibrary', 'active', 'Active') : t('adminPrayerLibrary', 'inactive', 'Inactive')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-orange-600 border-orange-300">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              {t('adminPrayerLibrary', 'noContent', 'No Content')}
                            </Badge>
                          )}
                        </div>
                        
                        {prayer ? (
                          <>
                            <h4 className="font-medium text-gray-900 mb-1">{prayer.title}</h4>
                            {prayer.scripture_reference && (
                              <p className="text-sm text-purple-600 mb-1">
                                <BookOpen className="h-3 w-3 inline mr-1" />
                                {prayer.scripture_reference}
                              </p>
                            )}
                            <p className="text-sm text-gray-600 line-clamp-2">{prayer.content}</p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                {t('adminPrayerLibrary', 'prayerPointsCount', '{count} Prayer Points').replace('{count}', String(prayer.prayer_points?.length || 0))}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                {t('adminPrayerLibrary', 'minutesShort', '{count} min').replace('{count}', String(prayer.duration_minutes))}
                              </Badge>
                              {prayer.author && (
                                <div className="flex items-center gap-1 text-xs text-gray-600">
                                  <span>{t('adminPrayerLibrary', 'byAuthor', 'by {author}').replace('{author}', String(prayer.author))}</span>
                                  {prayer.author_social_url && (
                                    <a 
                                      href={prayer.author_social_url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center hover:text-purple-600 transition-colors"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Link className="h-3 w-3 ml-1" />
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-gray-500">
                            {t('adminPrayerLibrary', 'noPrayerContentSlot', 'No prayer content for this time slot yet. Click "Add Content" to create.')}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
                        {prayer ? (
                          <>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => openEditPrayerWatch(prayer)}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              {t('adminPrayerLibrary', 'edit', 'Edit')}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => deletePrayerWatch(prayer.id!)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        ) : (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              resetPrayerWatchForm();
                              setPrayerWatchForm({
                                ...prayerWatchForm,
                                prayer_watch_time: timeSlot.value,
                                title: `Prayer Watch - ${timeSlot.label}`
                              });
                              setEditingPrayerWatch(null);
                              setShowPrayerWatchModal(true);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            {t('adminPrayerLibrary', 'addContent', 'Add Content')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-blue-900">{t('adminPrayerLibrary', 'prayerWatchCoverage', 'Prayer Watch Coverage')}</h3>
                  <p className="text-sm text-blue-700">
                    {t('adminPrayerLibrary', 'timeSlotsHaveContent', '{count} of 7 time slots have content').replace('{count}', String(prayerWatchEntries.length))}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-900">
                    {Math.round((prayerWatchEntries.length / 7) * 100)}%
                  </div>
                  <p className="text-xs text-blue-700">{t('adminPrayerLibrary', 'complete', 'Complete')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== PRAYER TOPIC MODAL ===== */}
      <Dialog open={showTopicModal} onOpenChange={setShowTopicModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTopic ? t('adminPrayerLibrary', 'editPrayerTopic', 'Edit Prayer Topic') : t('adminPrayerLibrary', 'createNewPrayerTopic', 'Create New Prayer Topic')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{t('adminPrayerLibrary', 'titleRequiredLabel', 'Title *')}</Label>
              <Input
                value={topicForm.title}
                onChange={(e) => setTopicForm({ ...topicForm, title: e.target.value })}
                placeholder={t('adminPrayerLibrary', 'topicTitlePlaceholder', 'e.g., Prayer for Healing')}
              />
            </div>

            <div>
              <Label>{t('adminPrayerLibrary', 'description', 'Description')}</Label>
              <Textarea
                value={topicForm.description}
                onChange={(e) => setTopicForm({ ...topicForm, description: e.target.value })}
                placeholder={t('adminPrayerLibrary', 'describeTopicPlaceholder', 'Describe this prayer topic...')}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminPrayerLibrary', 'author', 'Author')}</Label>
                <Input
                  value={topicForm.author || ''}
                  onChange={(e) => setTopicForm({ ...topicForm, author: e.target.value })}
                  placeholder={t('adminPrayerLibrary', 'authorNamePlaceholder', 'Author name')}
                />
              </div>
              <div>
                <Label>{t('adminPrayerLibrary', 'authorSocialUrl', 'Author Social Media URL')}</Label>
                <Input
                  value={topicForm.author_social_url || ''}
                  onChange={(e) => setTopicForm({ ...topicForm, author_social_url: e.target.value })}
                  placeholder="https://twitter.com/author"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminPrayerLibrary', 'scriptureReference', 'Scripture Reference')}</Label>
                <div className="flex gap-2">
                  <Input
                    value={topicForm.scripture_reference}
                    onChange={(e) => setTopicForm({ ...topicForm, scripture_reference: e.target.value })}
                    placeholder={t('adminPrayerLibrary', 'scriptureRefPlaceholder1', 'e.g., James 5:14-16')}
                  />
                  <Button 
                    type="button"
                    variant="outline"
                    onClick={loadScriptureForTopic}
                    disabled={loadingTopicScripture || !topicForm.scripture_reference}
                  >
                    {loadingTopicScripture ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <BookOpen className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              
              <div>
                <CoverImageField
                  label={t('adminPrayerLibrary', 'coverImage', 'Cover Image')}
                  value={topicForm.cover_image_url}
                  onChange={(url) => setTopicForm({ ...topicForm, cover_image_url: url })}
                  promptSubject={topicForm.title}
                />
              </div>
            </div>

            <div>
              <Label>{t('adminPrayerLibrary', 'scriptureText', 'Scripture Text')}</Label>
              <Textarea
                value={topicForm.scripture_text}
                onChange={(e) => setTopicForm({ ...topicForm, scripture_text: e.target.value })}
                placeholder={t('adminPrayerLibrary', 'fullScriptureTextLoad', 'Full scripture text (or use Load button above)...')}
                rows={3}
              />
            </div>

            {/* Multiple Scripture References */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{t('adminPrayerLibrary', 'additionalScriptureRefs', 'Additional Scripture References')}</Label>
                <Button 
                  type="button"
                  variant="outline" 
                  size="sm"
                  onClick={addScriptureToTopic}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('adminPrayerLibrary', 'addScripture', 'Add Scripture')}
                </Button>
              </div>
              <div className="space-y-3">
                {(topicForm.scriptures || []).map((scripture, idx) => (
                  <div key={idx} className="p-3 border rounded-lg bg-gray-50">
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={scripture.reference}
                          onChange={(e) => updateTopicScripture(idx, 'reference', e.target.value)}
                          placeholder={t('adminPrayerLibrary', 'scriptureRefPlaceholder6', 'e.g., John 3:16')}
                          className="flex-1"
                        />
                        <Button 
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => loadScriptureTextForTopic(idx)}
                          disabled={loadingScriptureIndex?.type === 'topic' && loadingScriptureIndex?.index === idx}
                        >
                          {loadingScriptureIndex?.type === 'topic' && loadingScriptureIndex?.index === idx ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <BookOpen className="h-4 w-4" />
                          )}
                        </Button>
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="icon"
                          onClick={() => removeScriptureFromTopic(idx)}
                        >
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                      <Textarea
                        value={scripture.text}
                        onChange={(e) => updateTopicScripture(idx, 'text', e.target.value)}
                        placeholder={t('adminPrayerLibrary', 'scriptureWillLoadHere', 'Scripture text will load here...')}
                        rows={2}
                      />
                    </div>
                  </div>
                ))}
                {(!topicForm.scriptures || topicForm.scriptures.length === 0) && (
                  <p className="text-sm text-gray-500 text-center py-2">
                    {t('adminPrayerLibrary', 'noAdditionalScriptures', 'No additional scriptures. Click "Add Scripture" to add more references.')}
                  </p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{t('adminPrayerLibrary', 'prayerPoints', 'Prayer Points')}</Label>
                <Button 
                  type="button"
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const newPoint = { title: '', content: '', duration: 60 };
                    setTopicForm({ ...topicForm, prayer_points: [...topicForm.prayer_points, newPoint] });
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('adminPrayerLibrary', 'addPoint', 'Add Point')}
                </Button>
              </div>
              <div className="space-y-3">
                {topicForm.prayer_points.map((point, idx) => (
                  <div key={idx} className="p-3 border rounded-lg bg-gray-50">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <Input
                          value={point.title || ''}
                          onChange={(e) => {
                            const newPoints = [...topicForm.prayer_points];
                            newPoints[idx] = { ...newPoints[idx], title: e.target.value };
                            setTopicForm({ ...topicForm, prayer_points: newPoints });
                          }}
                          placeholder={t('adminPrayerLibrary', 'pointTitlePlaceholder', 'Point title')}
                        />
                        <Textarea
                          value={point.content || ''}
                          onChange={(e) => {
                            const newPoints = [...topicForm.prayer_points];
                            newPoints[idx] = { ...newPoints[idx], content: e.target.value };
                            setTopicForm({ ...topicForm, prayer_points: newPoints });
                          }}
                          placeholder={t('adminPrayerLibrary', 'prayerContentPlaceholder', 'Prayer content...')}
                          rows={2}
                        />
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">{t('adminPrayerLibrary', 'durationSec', 'Duration (sec):')}</Label>
                          <Input
                            type="number"
                            value={point.duration || 60}
                            onChange={(e) => {
                              const newPoints = [...topicForm.prayer_points];
                              newPoints[idx] = { ...newPoints[idx], duration: parseInt(e.target.value) || 60 };
                              setTopicForm({ ...topicForm, prayer_points: newPoints });
                            }}
                            className="w-20"
                            min="1"
                          />
                        </div>
                      </div>
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="icon"
                        onClick={() => {
                          const newPoints = topicForm.prayer_points.filter((_, i) => i !== idx);
                          setTopicForm({ ...topicForm, prayer_points: newPoints });
                        }}
                      >
                        <X className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
                {topicForm.prayer_points.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    {t('adminPrayerLibrary', 'noPrayerPointsYet', 'No prayer points yet. Click "Add Point" to create one.')}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={topicForm.is_featured}
                  onCheckedChange={(v) => setTopicForm({ ...topicForm, is_featured: v })}
                />
                <Label>{t('adminPrayerLibrary', 'featured', 'Featured')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={topicForm.is_published}
                  onCheckedChange={(v) => setTopicForm({ ...topicForm, is_published: v })}
                />
                <Label>{t('adminPrayerLibrary', 'publishedBadge', 'Published')}</Label>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTopicModal(false)}>{t('adminPrayerLibrary', 'cancel', 'Cancel')}</Button>
            <Button onClick={saveTopic}>
              <Save className="h-4 w-4 mr-2" />
              {editingTopic ? t('adminPrayerLibrary', 'updateTopic', 'Update Topic') : t('adminPrayerLibrary', 'createTopic', 'Create Topic')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== PRAYER SERIES MODAL ===== */}
      <Dialog open={showSeriesModal} onOpenChange={setShowSeriesModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSeries ? t('adminPrayerLibrary', 'editSeries', 'Edit Series') : t('adminPrayerLibrary', 'createNewPrayerSeries', 'Create New Prayer Series')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{t('adminPrayerLibrary', 'titleRequiredLabel', 'Title *')}</Label>
              <Input
                value={seriesForm.title}
                onChange={(e) => setSeriesForm({ ...seriesForm, title: e.target.value })}
                placeholder={t('adminPrayerLibrary', 'seriesTitlePlaceholder', 'e.g., 7 Days of Fasting Prayer')}
              />
            </div>

            <div>
              <Label>{t('adminPrayerLibrary', 'subtitle', 'Subtitle')}</Label>
              <Input
                value={seriesForm.subtitle}
                onChange={(e) => setSeriesForm({ ...seriesForm, subtitle: e.target.value })}
                placeholder={t('adminPrayerLibrary', 'optionalSubtitle', 'Optional subtitle')}
              />
            </div>

            <div>
              <Label>{t('adminPrayerLibrary', 'description', 'Description')}</Label>
              <Textarea
                value={seriesForm.description}
                onChange={(e) => setSeriesForm({ ...seriesForm, description: e.target.value })}
                placeholder={t('adminPrayerLibrary', 'describeSeriesPlaceholder', 'Describe what users will experience...')}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminPrayerLibrary', 'author', 'Author')}</Label>
                <Input
                  value={seriesForm.author || ''}
                  onChange={(e) => setSeriesForm({ ...seriesForm, author: e.target.value })}
                  placeholder={t('adminPrayerLibrary', 'authorNamePlaceholder', 'Author name')}
                />
              </div>
              <div>
                <Label>{t('adminPrayerLibrary', 'authorSocialUrl', 'Author Social Media URL')}</Label>
                <Input
                  value={seriesForm.author_social_url || ''}
                  onChange={(e) => setSeriesForm({ ...seriesForm, author_social_url: e.target.value })}
                  placeholder="https://twitter.com/author"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminPrayerLibrary', 'totalDaysLabel', 'Total Days *')}</Label>
                <Select
                  value={seriesForm.total_days.toString()}
                  onValueChange={(v) => setSeriesForm({ ...seriesForm, total_days: parseInt(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">{t('adminPrayerLibrary', 'daysCount', '{count} Days').replace('{count}', '3')}</SelectItem>
                    <SelectItem value="7">{t('adminPrayerLibrary', 'daysCount', '{count} Days').replace('{count}', '7')}</SelectItem>
                    <SelectItem value="14">{t('adminPrayerLibrary', 'daysCount', '{count} Days').replace('{count}', '14')}</SelectItem>
                    <SelectItem value="21">{t('adminPrayerLibrary', 'daysCount', '{count} Days').replace('{count}', '21')}</SelectItem>
                    <SelectItem value="30">{t('adminPrayerLibrary', 'daysCount', '{count} Days').replace('{count}', '30')}</SelectItem>
                    <SelectItem value="40">{t('adminPrayerLibrary', 'daysCount', '{count} Days').replace('{count}', '40')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('adminPrayerLibrary', 'difficulty', 'Difficulty')}</Label>
                <Select
                  value={seriesForm.difficulty_level}
                  onValueChange={(v) => setSeriesForm({ ...seriesForm, difficulty_level: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">{t('adminPrayerLibrary', 'beginner', 'Beginner')}</SelectItem>
                    <SelectItem value="intermediate">{t('adminPrayerLibrary', 'intermediate', 'Intermediate')}</SelectItem>
                    <SelectItem value="advanced">{t('adminPrayerLibrary', 'advanced', 'Advanced')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminPrayerLibrary', 'startBehavior', 'Start Behavior')}</Label>
                <Select
                  value={seriesForm.start_behavior}
                  onValueChange={(v) => setSeriesForm({ ...seriesForm, start_behavior: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user_based">{t('adminPrayerLibrary', 'userBasedStart', 'User-based (starts when joined)')}</SelectItem>
                    <SelectItem value="fixed_date">{t('adminPrayerLibrary', 'fixedStartDateOption', 'Fixed start date')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {seriesForm.start_behavior === 'fixed_date' && (
                <div>
                  <Label>{t('adminPrayerLibrary', 'fixedStartDate', 'Fixed Start Date')}</Label>
                  <Input
                    type="date"
                    value={seriesForm.fixed_start_date}
                    onChange={(e) => setSeriesForm({ ...seriesForm, fixed_start_date: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div>
              <CoverImageField
                label={t('adminPrayerLibrary', 'coverImage', 'Cover Image')}
                value={seriesForm.cover_image_url}
                onChange={(url) => setSeriesForm({ ...seriesForm, cover_image_url: url })}
                promptSubject={seriesForm.title}
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={seriesForm.is_featured}
                  onCheckedChange={(v) => setSeriesForm({ ...seriesForm, is_featured: v })}
                />
                <Label>{t('adminPrayerLibrary', 'featured', 'Featured')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={seriesForm.is_published}
                  onCheckedChange={(v) => setSeriesForm({ ...seriesForm, is_published: v })}
                />
                <Label>{t('adminPrayerLibrary', 'publishedBadge', 'Published')}</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSeriesModal(false)}>{t('adminPrayerLibrary', 'cancel', 'Cancel')}</Button>
            <Button onClick={saveSeries}>
              <Save className="h-4 w-4 mr-2" />
              {editingSeries ? t('adminPrayerLibrary', 'updateSeries', 'Update Series') : t('adminPrayerLibrary', 'createSeries', 'Create Series')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== PRAYER SERIES DAYS MODAL ===== */}
      <Dialog open={showDaysModal} onOpenChange={setShowDaysModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{t('adminPrayerLibrary', 'manageDaysTitle', 'Manage Days: {title}').replace('{title}', String(selectedSeriesForDays?.title ?? ''))}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {t('adminPrayerLibrary', 'completeCount', '{done} / {total} Complete').replace('{done}', String(seriesDays.filter(d => d.title.trim() && d.prayer_text.trim()).length)).replace('{total}', String(seriesDays.length))}
                </Badge>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <Accordion type="single" collapsible className="space-y-2">
              {seriesDays.map((day) => {
                const isComplete = day.title.trim() && day.prayer_text.trim();
                return (
                  <AccordionItem key={day.day_number} value={`day-${day.day_number}`} className="border rounded-lg">
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-3 w-full">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          isComplete ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {day.day_number}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium">{day.title || t('adminPrayerLibrary', 'dayNumber', 'Day {num}').replace('{num}', String(day.day_number))}</p>
                          <p className="text-xs text-gray-500">
                            {day.scripture_reference || t('adminPrayerLibrary', 'noScriptureSet', 'No scripture set')} • {t('adminPrayerLibrary', 'minutesShort', '{count} min').replace('{count}', String(day.duration_minutes))}
                          </p>
                        </div>
                        {isComplete && <CheckCircle className="h-5 w-5 text-green-500" />}
                        {day.is_published && <Badge className="bg-green-600 text-xs">{t('adminPrayerLibrary', 'publishedBadge', 'Published')}</Badge>}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>{t('adminPrayerLibrary', 'prayerTitleLabel', 'Prayer Title *')}</Label>
                            <Input
                              value={day.title}
                              onChange={(e) => updateDayField(day.day_number, 'title', e.target.value)}
                              placeholder={t('adminPrayerLibrary', 'prayerTitlePlaceholder', 'e.g., Prayer for Breakthrough')}
                            />
                          </div>
                          <div>
                            <Label>{t('adminPrayerLibrary', 'durationMinutes', 'Duration (minutes)')}</Label>
                            <Input
                              type="number"
                              value={day.duration_minutes}
                              onChange={(e) => updateDayField(day.day_number, 'duration_minutes', parseInt(e.target.value) || 10)}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>{t('adminPrayerLibrary', 'scriptureReference', 'Scripture Reference')}</Label>
                            <div className="flex gap-2">
                              <Input
                                value={day.scripture_reference}
                                onChange={(e) => updateDayField(day.day_number, 'scripture_reference', e.target.value)}
                                placeholder={t('adminPrayerLibrary', 'scriptureRefPlaceholder2', 'e.g., Isaiah 40:31')}
                              />
                              <Button 
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => loadScriptureForDay(day.day_number)}
                                disabled={loadingDayScripture[day.day_number] || !day.scripture_reference}
                              >
                                {loadingDayScripture[day.day_number] ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <BookOpen className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                          <div>
                            <Label>{t('adminPrayerLibrary', 'prayerFocusTheme', 'Prayer Focus / Theme')}</Label>
                            <Input
                              value={day.prayer_focus}
                              onChange={(e) => updateDayField(day.day_number, 'prayer_focus', e.target.value)}
                              placeholder={t('adminPrayerLibrary', 'prayerFocusPlaceholder', 'e.g., Strength and Renewal')}
                            />
                          </div>
                        </div>

                        <div>
                          <Label>{t('adminPrayerLibrary', 'scriptureText', 'Scripture Text')}</Label>
                          <Textarea
                            value={day.scripture_text}
                            onChange={(e) => updateDayField(day.day_number, 'scripture_text', e.target.value)}
                            placeholder={t('adminPrayerLibrary', 'enterFullScriptureText', 'Enter the full scripture text (or use Load button above)...')}
                            rows={2}
                          />
                        </div>

                        {/* Multiple Scripture References */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label>{t('adminPrayerLibrary', 'additionalScriptureRefs', 'Additional Scripture References')}</Label>
                            <Button 
                              type="button"
                              variant="outline" 
                              size="sm"
                              onClick={() => addScriptureToDay(day.day_number)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              {t('adminPrayerLibrary', 'addScripture', 'Add Scripture')}
                            </Button>
                          </div>
                          <div className="space-y-3">
                            {(day.scriptures || []).map((scripture, idx) => (
                              <div key={idx} className="p-3 border rounded-lg bg-blue-50">
                                <div className="space-y-2">
                                  <div className="flex gap-2">
                                    <Input
                                      value={scripture.reference}
                                      onChange={(e) => updateDayScripture(day.day_number, idx, 'reference', e.target.value)}
                                      placeholder={t('adminPrayerLibrary', 'scriptureRefPlaceholder3', 'e.g., Romans 8:28')}
                                      className="flex-1"
                                    />
                                    <Button 
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() => loadScriptureTextForDay(day.day_number, idx)}
                                      disabled={loadingScriptureIndex?.type === `day-${day.day_number}` && loadingScriptureIndex?.index === idx}
                                    >
                                      {loadingScriptureIndex?.type === `day-${day.day_number}` && loadingScriptureIndex?.index === idx ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <BookOpen className="h-4 w-4" />
                                      )}
                                    </Button>
                                    <Button 
                                      type="button"
                                      variant="ghost" 
                                      size="icon"
                                      onClick={() => removeScriptureFromDay(day.day_number, idx)}
                                    >
                                      <X className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </div>
                                  <Textarea
                                    value={scripture.text}
                                    onChange={(e) => updateDayScripture(day.day_number, idx, 'text', e.target.value)}
                                    placeholder={t('adminPrayerLibrary', 'scriptureWillLoadHere', 'Scripture text will load here...')}
                                    rows={2}
                                  />
                                </div>
                              </div>
                            ))}
                            {(!day.scriptures || day.scriptures.length === 0) && (
                              <p className="text-sm text-gray-500 text-center py-2">
                                {t('adminPrayerLibrary', 'noAdditionalScriptures', 'No additional scriptures. Click "Add Scripture" to add more references.')}
                              </p>
                            )}
                          </div>
                        </div>

                        <div>
                          <Label>{t('adminPrayerLibrary', 'mainPrayerText', 'Main Prayer Text *')}</Label>
                          <Textarea
                            value={day.prayer_text}
                            onChange={(e) => updateDayField(day.day_number, 'prayer_text', e.target.value)}
                            placeholder={t('adminPrayerLibrary', 'writeMainPrayerContent', 'Write the main prayer content...')}
                            rows={4}
                          />
                        </div>

                        <div>
                          <Label>{t('adminPrayerLibrary', 'audioUrlOptional', 'Audio URL (Optional)')}</Label>
                          <Input
                            value={day.audio_url}
                            onChange={(e) => updateDayField(day.day_number, 'audio_url', e.target.value)}
                            placeholder="https://..."
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label>{t('adminPrayerLibrary', 'prayerPoints', 'Prayer Points')}</Label>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => addPrayerPoint(day.day_number)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              {t('adminPrayerLibrary', 'addPoint', 'Add Point')}
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
                                      placeholder={t('adminPrayerLibrary', 'pointTitlePlaceholder', 'Point title')}
                                    />
                                    <Textarea
                                      value={point.content}
                                      onChange={(e) => updatePrayerPoint(day.day_number, idx, 'content', e.target.value)}
                                      placeholder={t('adminPrayerLibrary', 'prayerContentPlaceholder', 'Prayer content...')}
                                      rows={2}
                                    />
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs">{t('adminPrayerLibrary', 'durationSec', 'Duration (sec):')}</Label>
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
                          <Label>{t('adminPrayerLibrary', 'publishThisDay', 'Publish this day')}</Label>
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
                {t('adminPrayerLibrary', 'close', 'Close')}
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={saveDays} disabled={savingDays}>
                {savingDays ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                {t('adminPrayerLibrary', 'saveAllDays', 'Save All Days')}
              </Button>
              <Button onClick={publishSeries} disabled={savingDays}>
                <Eye className="h-4 w-4 mr-2" />
                {t('adminPrayerLibrary', 'publishSeries', 'Publish Series')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== PRAYER WATCH MODAL ===== */}
      <Dialog open={showPrayerWatchModal} onOpenChange={setShowPrayerWatchModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPrayerWatch ? t('adminPrayerLibrary', 'editPrayerWatch', 'Edit Prayer Watch') : t('adminPrayerLibrary', 'createPrayerWatchEntry', 'Create Prayer Watch Entry')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{t('adminPrayerLibrary', 'prayerWatchTime', 'Prayer Watch Time *')}</Label>
              <Select
                value={prayerWatchForm.prayer_watch_time}
                onValueChange={(value) => setPrayerWatchForm({ ...prayerWatchForm, prayer_watch_time: value })}
              >
                <SelectTrigger><SelectValue placeholder={t('adminPrayerLibrary', 'selectTimeSlot', 'Select time slot')} /></SelectTrigger>
                <SelectContent>
                  {PRAYER_WATCH_TIME_SLOTS.map(slot => (
                    <SelectItem key={slot.value} value={slot.value}>{slot.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('adminPrayerLibrary', 'titleRequiredLabel', 'Title *')}</Label>
              <Input
                value={prayerWatchForm.title}
                onChange={(e) => setPrayerWatchForm({ ...prayerWatchForm, title: e.target.value })}
                placeholder={t('adminPrayerLibrary', 'watchTitlePlaceholder', 'e.g., Morning Prayer Watch')}
              />
            </div>

            <div>
              <Label>{t('adminPrayerLibrary', 'contentRequired', 'Content *')}</Label>
              <Textarea
                value={prayerWatchForm.content}
                onChange={(e) => setPrayerWatchForm({ ...prayerWatchForm, content: e.target.value })}
                placeholder={t('adminPrayerLibrary', 'mainPrayerContentPlaceholder', 'The main prayer content...')}
                rows={5}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminPrayerLibrary', 'author', 'Author')}</Label>
                <Input
                  value={prayerWatchForm.author || ''}
                  onChange={(e) => setPrayerWatchForm({ ...prayerWatchForm, author: e.target.value })}
                  placeholder={t('adminPrayerLibrary', 'authorNamePlaceholder', 'Author name')}
                />
              </div>
              <div>
                <Label>{t('adminPrayerLibrary', 'authorSocialUrl', 'Author Social Media URL')}</Label>
                <Input
                  value={prayerWatchForm.author_social_url || ''}
                  onChange={(e) => setPrayerWatchForm({ ...prayerWatchForm, author_social_url: e.target.value })}
                  placeholder="https://twitter.com/author"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminPrayerLibrary', 'scriptureReference', 'Scripture Reference')}</Label>
                <div className="flex gap-2">
                  <Input
                    value={prayerWatchForm.scripture_reference}
                    onChange={(e) => setPrayerWatchForm({ ...prayerWatchForm, scripture_reference: e.target.value })}
                    placeholder={t('adminPrayerLibrary', 'scriptureRefPlaceholder4', 'e.g., Psalm 63:1')}
                  />
                  <Button 
                    type="button"
                    variant="outline"
                    onClick={loadScriptureForPrayerWatch}
                    disabled={loadingWatchScripture || !prayerWatchForm.scripture_reference}
                  >
                    {loadingWatchScripture ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <BookOpen className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              
              <div>
                <Label>{t('adminPrayerLibrary', 'durationMinutes', 'Duration (minutes)')}</Label>
                <Input
                  type="number"
                  value={prayerWatchForm.duration_minutes}
                  onChange={(e) => setPrayerWatchForm({ ...prayerWatchForm, duration_minutes: parseInt(e.target.value) || 10 })}
                  min="1"
                />
              </div>
            </div>

            <div>
              <Label>{t('adminPrayerLibrary', 'scriptureText', 'Scripture Text')}</Label>
              <Textarea
                value={prayerWatchForm.scripture_text}
                onChange={(e) => setPrayerWatchForm({ ...prayerWatchForm, scripture_text: e.target.value })}
                placeholder={t('adminPrayerLibrary', 'fullScriptureText', 'Full scripture text...')}
                rows={3}
              />
            </div>

            {/* Multiple Scripture References */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{t('adminPrayerLibrary', 'additionalScriptureRefs', 'Additional Scripture References')}</Label>
                <Button 
                  type="button"
                  variant="outline" 
                  size="sm"
                  onClick={addScriptureToPrayerWatch}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('adminPrayerLibrary', 'addScripture', 'Add Scripture')}
                </Button>
              </div>
              <div className="space-y-3">
                {(prayerWatchForm.scriptures || []).map((scripture, idx) => (
                  <div key={idx} className="p-3 border rounded-lg bg-gray-50">
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={scripture.reference}
                          onChange={(e) => updatePrayerWatchScripture(idx, 'reference', e.target.value)}
                          placeholder={t('adminPrayerLibrary', 'scriptureRefPlaceholder5', 'e.g., Psalm 23:1')}
                          className="flex-1"
                        />
                        <Button 
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => loadScriptureTextForPrayerWatch(idx)}
                          disabled={loadingScriptureIndex?.type === 'watch' && loadingScriptureIndex?.index === idx}
                        >
                          {loadingScriptureIndex?.type === 'watch' && loadingScriptureIndex?.index === idx ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <BookOpen className="h-4 w-4" />
                          )}
                        </Button>
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="icon"
                          onClick={() => removeScriptureFromPrayerWatch(idx)}
                        >
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                      <Textarea
                        value={scripture.text}
                        onChange={(e) => updatePrayerWatchScripture(idx, 'text', e.target.value)}
                        placeholder={t('adminPrayerLibrary', 'scriptureWillLoadHere', 'Scripture text will load here...')}
                        rows={2}
                      />
                    </div>
                  </div>
                ))}
                {(!prayerWatchForm.scriptures || prayerWatchForm.scriptures.length === 0) && (
                  <p className="text-sm text-gray-500 text-center py-2">
                    {t('adminPrayerLibrary', 'noAdditionalScriptures', 'No additional scriptures. Click "Add Scripture" to add more references.')}
                  </p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{t('adminPrayerLibrary', 'prayerPoints', 'Prayer Points')}</Label>
                <Button 
                  type="button"
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const newPoint = { title: '', content: '', duration: 60 };
                    setPrayerWatchForm({ ...prayerWatchForm, prayer_points: [...prayerWatchForm.prayer_points, newPoint] });
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('adminPrayerLibrary', 'addPoint', 'Add Point')}
                </Button>
              </div>
              <div className="space-y-3">
                {prayerWatchForm.prayer_points.map((point, idx) => (
                  <div key={idx} className="p-3 border rounded-lg bg-gray-50">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <Input
                          value={point.title || ''}
                          onChange={(e) => {
                            const newPoints = [...prayerWatchForm.prayer_points];
                            newPoints[idx] = { ...newPoints[idx], title: e.target.value };
                            setPrayerWatchForm({ ...prayerWatchForm, prayer_points: newPoints });
                          }}
                          placeholder={t('adminPrayerLibrary', 'pointTitlePlaceholder', 'Point title')}
                        />
                        <Textarea
                          value={point.content || ''}
                          onChange={(e) => {
                            const newPoints = [...prayerWatchForm.prayer_points];
                            newPoints[idx] = { ...newPoints[idx], content: e.target.value };
                            setPrayerWatchForm({ ...prayerWatchForm, prayer_points: newPoints });
                          }}
                          placeholder={t('adminPrayerLibrary', 'prayerContentPlaceholder', 'Prayer content...')}
                          rows={2}
                        />
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">{t('adminPrayerLibrary', 'durationSec', 'Duration (sec):')}</Label>
                          <Input
                            type="number"
                            value={point.duration || 60}
                            onChange={(e) => {
                              const newPoints = [...prayerWatchForm.prayer_points];
                              newPoints[idx] = { ...newPoints[idx], duration: parseInt(e.target.value) || 60 };
                              setPrayerWatchForm({ ...prayerWatchForm, prayer_points: newPoints });
                            }}
                            className="w-20"
                            min="1"
                          />
                        </div>
                      </div>
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="icon"
                        onClick={() => {
                          const newPoints = prayerWatchForm.prayer_points.filter((_, i) => i !== idx);
                          setPrayerWatchForm({ ...prayerWatchForm, prayer_points: newPoints });
                        }}
                      >
                        <X className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
                {prayerWatchForm.prayer_points.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    {t('adminPrayerLibrary', 'noPrayerPointsYet', 'No prayer points yet. Click "Add Point" to create one.')}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={prayerWatchForm.is_active}
                onCheckedChange={(v) => setPrayerWatchForm({ ...prayerWatchForm, is_active: v })}
              />
              <Label>{t('adminPrayerLibrary', 'active', 'Active')}</Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrayerWatchModal(false)}>{t('adminPrayerLibrary', 'cancel', 'Cancel')}</Button>
            <Button onClick={savePrayerWatch}>
              <Save className="h-4 w-4 mr-2" />
              {editingPrayerWatch ? t('adminPrayerLibrary', 'updatePrayerWatch', 'Update Prayer Watch') : t('adminPrayerLibrary', 'createPrayerWatch', 'Create Prayer Watch')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};