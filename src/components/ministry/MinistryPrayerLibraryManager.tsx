import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { supabase } from '@/lib/supabase';
import { toast } from '../ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Heart, Plus, Edit, Trash2, Search, Loader2, Music, Globe, Lock, Tag, Eye,
  Download, BookOpen, Copy, X, Folder, FolderPlus, Filter, Calendar,
  TrendingUp, Users, PlayCircle, List
} from 'lucide-react';

interface MinistryPrayerLibraryManagerProps {
  ministryId: string;
}

interface Prayer {
  id: string;
  title: string;
  content: string;
  category: string;
  scripture_reference: string;
  scripture_text: string;
  audio_url: string;
  language: string;
  tags: string[];
  is_seasonal: boolean;
  season: string;
  campaign_id: string;
  visibility: string;
  view_count: number;
  prayer_count: number;
  is_active: boolean;
  created_at: string;
}

interface PrayerCampaign {
  id: string;
  title: string;
  description: string;
  theme: string;
  start_date: string;
  end_date: string;
  banner_image: string;
  prayer_count: number;
  is_active: boolean;
  created_at: string;
}

const CATEGORIES = [
  'General', 'Morning', 'Evening', 'Thanksgiving', 'Intercession', 'Healing',
  'Protection', 'Guidance', 'Family', 'Marriage', 'Children', 'Work',
  'Finances', 'Spiritual Growth', 'Warfare', 'Deliverance', 'Praise', 'Worship',
  'Repentance', 'Blessing', 'Breakthrough', 'Nations', 'Church', 'Leaders'
];

const SEASONS = ['Advent', 'Christmas', 'Lent', 'Easter', 'Pentecost', 'Ordinary Time', 'New Year', 'Thanksgiving'];

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'de', name: 'German' },
  { code: 'sw', name: 'Swahili' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'ig', name: 'Igbo' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' }
];

const THEMES = [
  '21-Day Fast', '30-Day Challenge', 'Week of Prayer', 'Monthly Focus',
  'Harvest Campaign', 'Revival', 'Unity', 'Missions', 'Youth',
  'Women', 'Men', 'Marriage', 'Healing', 'Breakthrough'
];

export const MinistryPrayerLibraryManager: React.FC<MinistryPrayerLibraryManagerProps> = ({
  ministryId
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [campaigns, setCampaigns] = useState<PrayerCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [editingPrayer, setEditingPrayer] = useState<Prayer | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<PrayerCampaign | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingScripture, setLoadingScripture] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'General',
    scripture_reference: '',
    scripture_text: '',
    audio_url: '',
    language: 'en',
    tags: [] as string[],
    is_seasonal: false,
    season: '',
    campaign_id: '',
    visibility: 'public',
    is_active: true
  });

  const [campaignForm, setCampaignForm] = useState({
    title: '',
    description: '',
    theme: '',
    start_date: '',
    end_date: '',
    banner_image: '',
    is_active: true
  });

  useEffect(() => {
    loadPrayers();
    loadCampaigns();
  }, [ministryId]);

  const loadPrayers = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_prayer_library')
        .select('*')
        .eq('ministry_id', ministryId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPrayers(data || []);
    } catch (err) {
      console.error('Error loading prayers:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from('prayer_campaigns')
        .select('*')
        .eq('ministry_id', ministryId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Calculate prayer counts for each campaign
      const campaignsWithCounts = await Promise.all((data || []).map(async (c) => {
        const { count } = await supabase
          .from('ministry_prayer_library')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', c.id);

        return {
          ...c,
          prayer_count: count || 0
        };
      }));

      setCampaigns(campaignsWithCounts);
    } catch (err) {
      console.error('Error loading campaigns:', err);
    }
  };

  const loadScriptureText = async () => {
    if (!formData.scripture_reference.trim()) {
      toast({ title: t('ministryPrayerLibraryManager', 'error', 'Error'), description: t('ministryPrayerLibraryManager', 'enterScriptureFirst', 'Please enter a scripture reference first'), variant: 'destructive' });
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
        toast({ title: t('ministryPrayerLibraryManager', 'success', 'Success'), description: t('ministryPrayerLibraryManager', 'scriptureLoaded', 'Scripture text loaded successfully') });
      } else {
        throw new Error('Scripture not found');
      }
    } catch (err) {
      console.error('Error loading scripture:', err);
      toast({
        title: t('ministryPrayerLibraryManager', 'note', 'Note'),
        description: t('ministryPrayerLibraryManager', 'scriptureLoadFailed', 'Could not auto-load scripture. Please enter manually or check the reference format'),
        variant: 'default'
      });
    } finally {
      setLoadingScripture(false);
    }
  };

  const handleCreate = () => {
    setEditingPrayer(null);
    setFormData({
      title: '',
      content: '',
      category: 'General',
      scripture_reference: '',
      scripture_text: '',
      audio_url: '',
      language: 'en',
      tags: [],
      is_seasonal: false,
      season: '',
      campaign_id: '',
      visibility: 'public',
      is_active: true
    });
    setShowModal(true);
  };

  const handleEdit = (prayer: Prayer) => {
    setEditingPrayer(prayer);
    setFormData({
      title: prayer.title,
      content: prayer.content,
      category: prayer.category || 'General',
      scripture_reference: prayer.scripture_reference || '',
      scripture_text: prayer.scripture_text || '',
      audio_url: prayer.audio_url || '',
      language: prayer.language || 'en',
      tags: prayer.tags || [],
      is_seasonal: prayer.is_seasonal || false,
      season: prayer.season || '',
      campaign_id: prayer.campaign_id || '',
      visibility: prayer.visibility || 'public',
      is_active: prayer.is_active
    });
    setShowModal(true);
  };

  const handleDuplicate = (prayer: Prayer) => {
    setEditingPrayer(null);
    setFormData({
      title: `${prayer.title} (Copy)`,
      content: prayer.content,
      category: prayer.category || 'General',
      scripture_reference: prayer.scripture_reference || '',
      scripture_text: prayer.scripture_text || '',
      audio_url: prayer.audio_url || '',
      language: prayer.language || 'en',
      tags: prayer.tags || [],
      is_seasonal: prayer.is_seasonal || false,
      season: prayer.season || '',
      campaign_id: prayer.campaign_id || '',
      visibility: prayer.visibility || 'public',
      is_active: true
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast({ title: t('ministryPrayerLibraryManager', 'error', 'Error'), description: t('ministryPrayerLibraryManager', 'titleContentRequired', 'Title and content are required'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        ministry_id: ministryId,
        title: formData.title.trim(),
        content: formData.content.trim(),
        category: formData.category,
        scripture_reference: formData.scripture_reference,
        scripture_text: formData.scripture_text,
        audio_url: formData.audio_url,
        language: formData.language,
        tags: formData.tags,
        is_seasonal: formData.is_seasonal,
        season: formData.is_seasonal ? formData.season : null,
        campaign_id: formData.campaign_id || null,
        visibility: formData.visibility,
        is_active: formData.is_active,
        created_by: user?.id
      };

      if (editingPrayer) {
        const { error } = await supabase
          .from('ministry_prayer_library')
          .update(dataToSave)
          .eq('id', editingPrayer.id);
        if (error) throw error;
        toast({ title: t('ministryPrayerLibraryManager', 'success', 'Success'), description: t('ministryPrayerLibraryManager', 'prayerUpdated', 'Prayer updated successfully') });
      } else {
        const { error } = await supabase
          .from('ministry_prayer_library')
          .insert(dataToSave);
        if (error) throw error;
        toast({ title: t('ministryPrayerLibraryManager', 'success', 'Success'), description: t('ministryPrayerLibraryManager', 'prayerCreated', 'Prayer created successfully') });
      }

      setShowModal(false);
      loadPrayers();
      loadCampaigns();
    } catch (err: any) {
      toast({ title: t('ministryPrayerLibraryManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('ministryPrayerLibraryManager', 'confirmDeletePrayer', 'Are you sure you want to delete this prayer?'))) return;

    try {
      const { error } = await supabase
        .from('ministry_prayer_library')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast({ title: t('ministryPrayerLibraryManager', 'success', 'Success'), description: t('ministryPrayerLibraryManager', 'prayerDeleted', 'Prayer deleted') });
      loadPrayers();
    } catch (err: any) {
      toast({ title: t('ministryPrayerLibraryManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...formData.tags, tagInput.trim()] });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(item => item !== tag) });
  };

  const handleCreateCampaign = async () => {
    if (!campaignForm.title.trim()) {
      toast({ title: t('ministryPrayerLibraryManager', 'error', 'Error'), description: t('ministryPrayerLibraryManager', 'campaignTitleRequired', 'Campaign title is required'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        ministry_id: ministryId,
        title: campaignForm.title.trim(),
        description: campaignForm.description.trim(),
        theme: campaignForm.theme,
        start_date: campaignForm.start_date || null,
        end_date: campaignForm.end_date || null,
        banner_image: campaignForm.banner_image,
        is_active: campaignForm.is_active,
        created_by: user?.id
      };

      if (editingCampaign) {
        const { error } = await supabase
          .from('prayer_campaigns')
          .update(dataToSave)
          .eq('id', editingCampaign.id);
        if (error) throw error;
        toast({ title: t('ministryPrayerLibraryManager', 'success', 'Success'), description: t('ministryPrayerLibraryManager', 'campaignUpdated', 'Campaign updated successfully') });
      } else {
        const { error } = await supabase
          .from('prayer_campaigns')
          .insert(dataToSave);
        if (error) throw error;
        toast({ title: t('ministryPrayerLibraryManager', 'success', 'Success'), description: t('ministryPrayerLibraryManager', 'campaignCreated', 'Campaign created successfully') });
      }

      setShowCampaignModal(false);
      setCampaignForm({ title: '', description: '', theme: '', start_date: '', end_date: '', banner_image: '', is_active: true });
      setEditingCampaign(null);
      loadCampaigns();
    } catch (err: any) {
      toast({ title: t('ministryPrayerLibraryManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleEditCampaign = (campaign: PrayerCampaign) => {
    setEditingCampaign(campaign);
    setCampaignForm({
      title: campaign.title,
      description: campaign.description || '',
      theme: campaign.theme || '',
      start_date: campaign.start_date || '',
      end_date: campaign.end_date || '',
      banner_image: campaign.banner_image || '',
      is_active: campaign.is_active
    });
    setShowCampaignModal(true);
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm(t('ministryPrayerLibraryManager', 'confirmDeleteCampaign', 'Are you sure? This will remove campaign association from all prayers.'))) return;

    try {
      // First, update prayers to remove campaign association
      await supabase
        .from('ministry_prayer_library')
        .update({ campaign_id: null })
        .eq('campaign_id', id);

      // Then delete the campaign
      const { error } = await supabase
        .from('prayer_campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: t('ministryPrayerLibraryManager', 'success', 'Success'), description: t('ministryPrayerLibraryManager', 'campaignDeleted', 'Campaign deleted') });
      loadCampaigns();
      loadPrayers();
    } catch (err: any) {
      toast({ title: t('ministryPrayerLibraryManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const filteredPrayers = prayers.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    const matchesCampaign = campaignFilter === 'all' || p.campaign_id === campaignFilter;
    return matchesSearch && matchesCategory && matchesCampaign;
  });

  const stats = {
    total: prayers.length,
    active: prayers.filter(p => p.is_active).length,
    campaigns: campaigns.length,
    languages: new Set(prayers.map(p => p.language)).size,
    totalViews: prayers.reduce((sum, p) => sum + (p.view_count || 0), 0),
    totalPrayers: prayers.reduce((sum, p) => sum + (p.prayer_count || 0), 0)
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
              placeholder={t('ministryPrayerLibraryManager', 'searchPrayers', 'Search prayers...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-80"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('ministryPrayerLibraryManager', 'category', 'Category')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ministryPrayerLibraryManager', 'allCategories', 'All Categories')}</SelectItem>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={campaignFilter} onValueChange={setCampaignFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('ministryPrayerLibraryManager', 'campaign', 'Campaign')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ministryPrayerLibraryManager', 'allCampaigns', 'All Campaigns')}</SelectItem>
              {campaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            setEditingCampaign(null);
            setCampaignForm({ title: '', description: '', theme: '', start_date: '', end_date: '', banner_image: '', is_active: true });
            setShowCampaignModal(true);
          }}>
            <FolderPlus className="h-4 w-4 mr-2" />
            {t('ministryPrayerLibraryManager', 'newCampaign', 'New Campaign')}
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {t('ministryPrayerLibraryManager', 'addPrayer', 'Add Prayer')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryPrayerLibraryManager', 'totalPrayers', 'Total Prayers')}</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Heart className="h-8 w-8 text-pink-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryPrayerLibraryManager', 'active', 'Active')}</p>
                <p className="text-2xl font-bold">{stats.active}</p>
              </div>
              <Eye className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryPrayerLibraryManager', 'campaigns', 'Campaigns')}</p>
                <p className="text-2xl font-bold">{stats.campaigns}</p>
              </div>
              <Folder className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryPrayerLibraryManager', 'languages', 'Languages')}</p>
                <p className="text-2xl font-bold">{stats.languages}</p>
              </div>
              <Globe className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryPrayerLibraryManager', 'totalViews', 'Total Views')}</p>
                <p className="text-2xl font-bold">{stats.totalViews}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryPrayerLibraryManager', 'timesPrayed', 'Times Prayed')}</p>
                <p className="text-2xl font-bold">{stats.totalPrayers}</p>
              </div>
              <Users className="h-8 w-8 text-indigo-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns Section */}
      {campaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Folder className="h-5 w-5 text-purple-600" />
              {t('ministryPrayerLibraryManager', 'prayerCampaigns', 'Prayer Campaigns')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {campaigns.map(c => (
                <div key={c.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  {c.banner_image && (
                    <img src={c.banner_image} alt={c.title} className="w-full h-32 object-cover rounded mb-3" />
                  )}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="font-semibold">{c.title}</h4>
                      {c.theme && <Badge variant="outline" className="text-xs mt-1">{c.theme}</Badge>}
                      <p className="text-sm text-gray-500 line-clamp-2 mt-1">{c.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                    <span className="flex items-center gap-1">
                      <Heart className="h-3 w-3" /> {t('ministryPrayerLibraryManager', 'countPrayers', '{count} prayers').replace('{count}', String(c.prayer_count))}
                    </span>
                    {c.start_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> 
                        {new Date(c.start_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button variant="ghost" size="sm" onClick={() => handleEditCampaign(c)}>
                      <Edit className="h-3 w-3 mr-1" /> {t('ministryPrayerLibraryManager', 'edit', 'Edit')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteCampaign(c.id)}>
                      <Trash2 className="h-3 w-3 mr-1 text-red-500" /> {t('ministryPrayerLibraryManager', 'delete', 'Delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Prayers List */}
      <Card>
        <CardContent className="p-0">
          {filteredPrayers.length === 0 ? (
            <div className="text-center py-12">
              <Heart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-700">{t('ministryPrayerLibraryManager', 'noPrayers', 'No Prayers')}</h3>
              <p className="text-gray-500 mb-4">{t('ministryPrayerLibraryManager', 'startBuildingLibrary', 'Start building your prayer library')}</p>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                {t('ministryPrayerLibraryManager', 'addPrayer', 'Add Prayer')}
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {filteredPrayers.map(prayer => (
                <div key={prayer.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{prayer.title}</h3>
                        {!prayer.is_active && (
                          <Badge variant="secondary">{t('ministryPrayerLibraryManager', 'inactive', 'Inactive')}</Badge>
                        )}
                        {prayer.is_seasonal && (
                          <Badge variant="secondary" className="text-xs">{prayer.season}</Badge>
                        )}
                        {prayer.audio_url && (
                          <PlayCircle className="h-4 w-4 text-blue-500" />
                        )}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2 mb-2">{prayer.content}</p>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <Badge variant="outline">{prayer.category}</Badge>
                        {prayer.scripture_reference && (
                          <Badge variant="outline" className="text-purple-600">
                            <BookOpen className="h-3 w-3 mr-1" />
                            {prayer.scripture_reference}
                          </Badge>
                        )}
                        {prayer.campaign_id && (
                          <Badge variant="outline">
                            <Folder className="h-3 w-3 mr-1" />
                            {campaigns.find(c => c.id === prayer.campaign_id)?.title || t('ministryPrayerLibraryManager', 'campaign', 'Campaign')}
                          </Badge>
                        )}
                        <Badge variant={prayer.visibility === 'public' ? 'default' : 'secondary'}>
                          {prayer.visibility === 'public' ? <Globe className="h-3 w-3 mr-1" /> : <Lock className="h-3 w-3 mr-1" />}
                          {prayer.visibility}
                        </Badge>
                        <Badge variant="outline">{LANGUAGES.find(l => l.code === prayer.language)?.name || prayer.language}</Badge>
                      </div>
                      {prayer.tags?.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {prayer.tags.map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              <Tag className="h-3 w-3 mr-1" />
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" /> {t('ministryPrayerLibraryManager', 'countViews', '{count} views').replace('{count}', String(prayer.view_count || 0))}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" /> {t('ministryPrayerLibraryManager', 'countPrayed', '{count} prayed').replace('{count}', String(prayer.prayer_count || 0))}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(prayer)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDuplicate(prayer)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(prayer.id)}>
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

      {/* Create/Edit Prayer Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPrayer ? t('ministryPrayerLibraryManager', 'editPrayer', 'Edit Prayer') : t('ministryPrayerLibraryManager', 'addPrayer', 'Add Prayer')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('ministryPrayerLibraryManager', 'titleRequired', 'Title *')}</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('ministryPrayerLibraryManager', 'prayerTitle', 'Prayer title')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('ministryPrayerLibraryManager', 'category', 'Category')}</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('ministryPrayerLibraryManager', 'language', 'Language')}</Label>
                <Select
                  value={formData.language}
                  onValueChange={(v) => setFormData({ ...formData, language: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(lang => (
                      <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>{t('ministryPrayerLibraryManager', 'campaignOptional', 'Campaign (Optional)')}</Label>
              <Select
                value={formData.campaign_id || '__none__'}
                onValueChange={(v) => setFormData({ ...formData, campaign_id: v === '__none__' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('ministryPrayerLibraryManager', 'selectCampaign', 'Select campaign')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('ministryPrayerLibraryManager', 'noCampaign', 'No Campaign')}</SelectItem>
                  {campaigns.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('ministryPrayerLibraryManager', 'prayerContentRequired', 'Prayer Content *')}</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder={t('ministryPrayerLibraryManager', 'writePrayer', 'Write the prayer...')}
                rows={8}
              />
            </div>

            <div>
              <Label>{t('ministryPrayerLibraryManager', 'scriptureReference', 'Scripture Reference')}</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.scripture_reference}
                  onChange={(e) => setFormData({ ...formData, scripture_reference: e.target.value })}
                  placeholder={t('ministryPrayerLibraryManager', 'scriptureRefExample', 'e.g., Psalm 23:1 or Isaiah 40:31')}
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
                {t('ministryPrayerLibraryManager', 'clickDownloadScripture', 'Click the download button to auto-load scripture text')}
              </p>
            </div>

            <div>
              <Label>{t('ministryPrayerLibraryManager', 'scriptureText', 'Scripture Text')}</Label>
              <Textarea
                value={formData.scripture_text}
                onChange={(e) => setFormData({ ...formData, scripture_text: e.target.value })}
                placeholder={t('ministryPrayerLibraryManager', 'fullScriptureText', 'Full scripture text...')}
                rows={3}
              />
            </div>

            <div>
              <Label>{t('ministryPrayerLibraryManager', 'audioUrlOptional', 'Audio URL (Optional)')}</Label>
              <Input
                value={formData.audio_url}
                onChange={(e) => setFormData({ ...formData, audio_url: e.target.value })}
                placeholder="https://..."
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('ministryPrayerLibraryManager', 'uploadAudioHint', 'Upload audio to your hosting service and paste the URL here')}
              </p>
            </div>

            <div>
              <Label>{t('ministryPrayerLibraryManager', 'tags', 'Tags')}</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder={t('ministryPrayerLibraryManager', 'addTag', 'Add tag')}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  <Plus className="h-4 w-4 mr-1" /> {t('ministryPrayerLibraryManager', 'add', 'Add')}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {formData.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                    {tag} ×
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('ministryPrayerLibraryManager', 'visibility', 'Visibility')}</Label>
                <Select
                  value={formData.visibility}
                  onValueChange={(v) => setFormData({ ...formData, visibility: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">{t('ministryPrayerLibraryManager', 'public', 'Public')}</SelectItem>
                    <SelectItem value="members">{t('ministryPrayerLibraryManager', 'membersOnly', 'Members Only')}</SelectItem>
                    <SelectItem value="premium">{t('ministryPrayerLibraryManager', 'premiumMembers', 'Premium Members')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-4 pt-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_seasonal}
                    onCheckedChange={(v) => setFormData({ ...formData, is_seasonal: v })}
                  />
                  <Label>{t('ministryPrayerLibraryManager', 'seasonal', 'Seasonal')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
                  />
                  <Label>{t('ministryPrayerLibraryManager', 'active', 'Active')}</Label>
                </div>
              </div>
            </div>

            {formData.is_seasonal && (
              <div>
                <Label>{t('ministryPrayerLibraryManager', 'season', 'Season')}</Label>
                <Select
                  value={formData.season}
                  onValueChange={(v) => setFormData({ ...formData, season: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('ministryPrayerLibraryManager', 'selectSeason', 'Select season')} />
                  </SelectTrigger>
                  <SelectContent>
                    {SEASONS.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t('ministryPrayerLibraryManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingPrayer ? t('ministryPrayerLibraryManager', 'update', 'Update') : t('ministryPrayerLibraryManager', 'create', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Modal */}
      <Dialog open={showCampaignModal} onOpenChange={setShowCampaignModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCampaign ? t('ministryPrayerLibraryManager', 'editCampaign', 'Edit Campaign') : t('ministryPrayerLibraryManager', 'createPrayerCampaign', 'Create Prayer Campaign')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('ministryPrayerLibraryManager', 'campaignTitleRequiredLabel', 'Campaign Title *')}</Label>
              <Input
                value={campaignForm.title}
                onChange={(e) => setCampaignForm({ ...campaignForm, title: e.target.value })}
                placeholder={t('ministryPrayerLibraryManager', 'campaignTitleExample', 'e.g., 21 Days of Prayer & Fasting')}
              />
            </div>

            <div>
              <Label>{t('ministryPrayerLibraryManager', 'description', 'Description')}</Label>
              <Textarea
                value={campaignForm.description}
                onChange={(e) => setCampaignForm({ ...campaignForm, description: e.target.value })}
                placeholder={t('ministryPrayerLibraryManager', 'campaignDescription', 'Campaign description...')}
                rows={3}
              />
            </div>

            <div>
              <Label>{t('ministryPrayerLibraryManager', 'theme', 'Theme')}</Label>
              <Select
                value={campaignForm.theme}
                onValueChange={(v) => setCampaignForm({ ...campaignForm, theme: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('ministryPrayerLibraryManager', 'selectTheme', 'Select theme')} />
                </SelectTrigger>
                <SelectContent>
                  {THEMES.map(item => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('ministryPrayerLibraryManager', 'startDate', 'Start Date')}</Label>
                <Input
                  type="date"
                  value={campaignForm.start_date}
                  onChange={(e) => setCampaignForm({ ...campaignForm, start_date: e.target.value })}
                />
              </div>
              <div>
                <Label>{t('ministryPrayerLibraryManager', 'endDate', 'End Date')}</Label>
                <Input
                  type="date"
                  value={campaignForm.end_date}
                  onChange={(e) => setCampaignForm({ ...campaignForm, end_date: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>{t('ministryPrayerLibraryManager', 'bannerImageUrlOptional', 'Banner Image URL (Optional)')}</Label>
              <Input
                value={campaignForm.banner_image}
                onChange={(e) => setCampaignForm({ ...campaignForm, banner_image: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={campaignForm.is_active}
                onCheckedChange={(v) => setCampaignForm({ ...campaignForm, is_active: v })}
              />
              <Label>{t('ministryPrayerLibraryManager', 'activeCampaign', 'Active Campaign')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCampaignModal(false)}>{t('ministryPrayerLibraryManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleCreateCampaign} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingCampaign ? t('ministryPrayerLibraryManager', 'updateCampaign', 'Update Campaign') : t('ministryPrayerLibraryManager', 'createCampaign', 'Create Campaign')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistryPrayerLibraryManager;