import React, { useState, useEffect, useCallback } from 'react';
import { useViewHistory } from '@rekindle/features/hooks/useViewHistory';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Label } from '@rekindle/ui/label';
import { Badge } from '@rekindle/ui/badge';
import { Switch } from '@rekindle/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@rekindle/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { getLocalDateString } from '@rekindle/ui/utils';
import { toast } from '@rekindle/ui/use-toast';
import { ImageUpload } from './ImageUpload';
import {
  Crown,
  Lock,
  BookOpen,
  Upload,
  Image as ImageIcon,
  Music,
  Send,
  MessageCircle,
  Bell,
  Mail,
  Smartphone,
  Check,
  AlertTriangle,
  Loader2,
  Plus,
  Edit,
  Trash2,
  Eye,
  Share2,
  ExternalLink,
  Copy,
  Users,
  Calendar,
  Download
} from 'lucide-react';
import { fetchScripture, BIBLE_VERSIONS } from '@rekindle/features/bibleApi';

interface MinistryDevotional {
  id: string;
  creator_id: string;
  title: string;
  scripture_reference: string | null;
  scripture_text: string | null;
  content: string;
  image_url: string | null;
  audio_url: string | null;
  consumption_location: 'main_app' | 'ministry_space';
  is_published: boolean;
  scheduled_date: string | null;
  created_at: string;
  updated_at: string;
}

interface MinistryGroup {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  member_count: number;
  created_at: string;
}

interface BroadcastChannel {
  id: 'whatsapp' | 'push' | 'email' | 'sms';
  name: string;
  icon: React.ReactNode;
  enabled: boolean;
  available: boolean;
  description: string;
}

interface MinistryDevotionalCreatorProps {
  onClose?: () => void;
}

export const MinistryDevotionalCreator: React.FC<MinistryDevotionalCreatorProps> = ({ onClose }) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();

  // Check if user has ministry subscription
  const hasMinistrySubscription = profile?.subscription_tier === 'ministry';
  
  // State
  const [activeTab, setActiveTab] = useViewHistory<'create' | 'manage' | 'groups'>('ministry-devotional-creator', 'create');
  const [devotionals, setDevotionals] = useState<MinistryDevotional[]>([]);
  const [groups, setGroups] = useState<MinistryGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingScripture, setLoadingScripture] = useState(false);
  const [scriptureVersion, setScriptureVersion] = useState('kjv');
  const [broadcasting, setBroadcasting] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    scriptureReference: '',
    scriptureText: '',
    content: '',
    imageUrl: '',
    audioUrl: '',
    consumptionLocation: 'main_app' as 'main_app' | 'ministry_space',
    scheduledDate: getLocalDateString(), // defaults to today
  });
  
  // Broadcast state
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [selectedDevotional, setSelectedDevotional] = useState<MinistryDevotional | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [broadcastChannels, setBroadcastChannels] = useState<BroadcastChannel[]>([
    { id: 'whatsapp', name: 'WhatsApp', icon: <MessageCircle className="h-4 w-4" />, enabled: false, available: true, description: t('ministryDevotionalCreator', 'channelWhatsappDesc', 'Share via WhatsApp with deep link') },
    { id: 'push', name: t('ministryDevotionalCreator', 'channelPushName', 'Push Notification'), icon: <Bell className="h-4 w-4" />, enabled: false, available: true, description: t('ministryDevotionalCreator', 'channelPushDesc', 'Send in-app push notification') },
    { id: 'email', name: t('ministryDevotionalCreator', 'channelEmailName', 'Email'), icon: <Mail className="h-4 w-4" />, enabled: false, available: false, description: t('ministryDevotionalCreator', 'comingSoon', 'Coming soon') },
    { id: 'sms', name: 'SMS', icon: <Smartphone className="h-4 w-4" />, enabled: false, available: false, description: t('ministryDevotionalCreator', 'comingSoon', 'Coming soon') }
  ]);
  const [showConfirmBroadcast, setShowConfirmBroadcast] = useState(false);
  
  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [editingDevotional, setEditingDevotional] = useState<MinistryDevotional | null>(null);

  // Load devotionals and groups
  const loadData = useCallback(async () => {
    if (!user?.id || !hasMinistrySubscription) return;
    
    setLoading(true);
    try {
      const [devotionalsRes, groupsRes] = await Promise.all([
        supabase
          .from('ministry_devotionals')
          .select('*')
          .eq('creator_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('ministry_groups')
          .select('*')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
      ]);

      if (devotionalsRes.data) setDevotionals(devotionalsRes.data);
      if (groupsRes.data) setGroups(groupsRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, hasMinistrySubscription]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle form input changes
  const handleLoadScripture = async () => {
    setLoadingScripture(true);
    try {
      const text = await fetchScripture(formData.scriptureReference, scriptureVersion);
      setFormData((prev) => ({ ...prev, scriptureText: text }));
      toast({ title: t('ministryDevotionalCreator', 'success', 'Success'), description: t('ministryDevotionalCreator', 'scriptureLoaded', 'Scripture text loaded') });
    } catch (err: any) {
      toast({ title: t('ministryDevotionalCreator', 'note', 'Note'), description: err.message || t('ministryDevotionalCreator', 'couldNotLoadScripture', 'Could not load scripture'), variant: 'destructive' });
    } finally {
      setLoadingScripture(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Save devotional
  const handleSaveDevotional = async (publish: boolean = false) => {
    if (!user?.id) return;
    
    if (!formData.title.trim() || !formData.content.trim()) {
      toast({
        title: t('ministryDevotionalCreator', 'missingFields', 'Missing Fields'),
        description: t('ministryDevotionalCreator', 'titleContentRequired', 'Title and content are required'),
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      const devotionalData = {
        creator_id: user.id,
        title: formData.title.trim(),
        scripture_reference: formData.scriptureReference.trim() || null,
        scripture_text: formData.scriptureText.trim() || null,
        content: formData.content.trim(),
        image_url: formData.imageUrl.trim() || null,
        audio_url: formData.audioUrl.trim() || null,
        consumption_location: formData.consumptionLocation,
        scheduled_date: formData.scheduledDate || null,
        is_published: publish,
        updated_at: new Date().toISOString()
      };

      let result;
      if (editingDevotional) {
        result = await supabase
          .from('ministry_devotionals')
          .update(devotionalData)
          .eq('id', editingDevotional.id)
          .select()
          .single();
      } else {
        result = await supabase
          .from('ministry_devotionals')
          .insert(devotionalData)
          .select()
          .single();
      }

      if (result.error) throw result.error;

      toast({
        title: editingDevotional ? t('ministryDevotionalCreator', 'devotionalUpdated', 'Devotional Updated') : t('ministryDevotionalCreator', 'devotionalCreated', 'Devotional Created'),
        description: publish ? t('ministryDevotionalCreator', 'devotionalPublished', 'Your devotional is now published') : t('ministryDevotionalCreator', 'devotionalSavedDraft', 'Your devotional has been saved as draft')
      });

      // Reset form
      setFormData({
        title: '',
        scriptureReference: '',
        scriptureText: '',
        content: '',
        imageUrl: '',
        audioUrl: '',
        consumptionLocation: 'main_app',
        scheduledDate: getLocalDateString(),
      });
      setEditingDevotional(null);
      loadData();
      setActiveTab('manage');
    } catch (error: any) {
      toast({
        title: t('ministryDevotionalCreator', 'error', 'Error'),
        description: error.message || t('ministryDevotionalCreator', 'failedSaveDevotional', 'Failed to save devotional'),
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete devotional
  const handleDeleteDevotional = async (id: string) => {
    if (!confirm(t('ministryDevotionalCreator', 'confirmDelete', 'Are you sure you want to delete this devotional?'))) return;

    try {
      const { error } = await supabase
        .from('ministry_devotionals')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: t('ministryDevotionalCreator', 'deleted', 'Deleted'), description: t('ministryDevotionalCreator', 'devotionalDeleted', 'Devotional has been deleted') });
      loadData();
    } catch (error: any) {
      toast({
        title: t('ministryDevotionalCreator', 'error', 'Error'),
        description: error.message || t('ministryDevotionalCreator', 'failedDeleteDevotional', 'Failed to delete devotional'),
        variant: 'destructive'
      });
    }
  };

  // Edit devotional
  const handleEditDevotional = (devotional: MinistryDevotional) => {
    setEditingDevotional(devotional);
    setFormData({
      title: devotional.title,
      scriptureReference: devotional.scripture_reference || '',
      scriptureText: devotional.scripture_text || '',
      content: devotional.content,
      imageUrl: devotional.image_url || '',
      audioUrl: devotional.audio_url || '',
      consumptionLocation: devotional.consumption_location,
      scheduledDate: devotional.scheduled_date || getLocalDateString(),
    });
    setActiveTab('create');
  };

  // Open broadcast modal
  const handleOpenBroadcast = (devotional: MinistryDevotional) => {
    setSelectedDevotional(devotional);
    setBroadcastChannels(prev => prev.map(ch => ({ ...ch, enabled: false })));
    setShowBroadcastModal(true);
  };

  // Toggle broadcast channel
  const toggleChannel = (channelId: string) => {
    setBroadcastChannels(prev => prev.map(ch => 
      ch.id === channelId && ch.available ? { ...ch, enabled: !ch.enabled } : ch
    ));
  };

  // Generate deep link
  const generateDeepLink = (devotionalId: string, location: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/devotional/${devotionalId}?source=ministry&location=${location}`;
  };

  // Handle broadcast confirmation
  const handleConfirmBroadcast = () => {
    const enabledChannels = broadcastChannels.filter(ch => ch.enabled);
    if (enabledChannels.length === 0) {
      toast({
        title: t('ministryDevotionalCreator', 'noChannelSelected', 'No Channel Selected'),
        description: t('ministryDevotionalCreator', 'selectChannel', 'Please select at least one broadcast channel'),
        variant: 'destructive'
      });
      return;
    }
    setShowConfirmBroadcast(true);
  };

  // Execute broadcast
  const executeBroadcast = async () => {
    if (!selectedDevotional) return;

    setBroadcasting(true);
    setShowConfirmBroadcast(false);

    const enabledChannels = broadcastChannels.filter(ch => ch.enabled);
    const deepLink = generateDeepLink(selectedDevotional.id, selectedDevotional.consumption_location);

    try {
      for (const channel of enabledChannels) {
        if (channel.id === 'whatsapp') {
          // Generate WhatsApp share link
            const message = encodeURIComponent(
            `📖 *${selectedDevotional.title}*\n\n${selectedDevotional.content.substring(0, 200)}${selectedDevotional.content.length > 200 ? '...' : ''}\n\n🔗 Read more: ${deepLink}\n\n_Shared via Rekindle_`
          );
          const whatsappUrl = `https://wa.me/?text=${message}`;
          window.open(whatsappUrl, '_blank');
        }

        if (channel.id === 'push') {
          // Send push notification via edge function
          const { data, error } = await supabase.functions.invoke('broadcast-message', {
            body: {
              message: {
                title: `New Devotional: ${selectedDevotional.title}`,
                body: selectedDevotional.content.substring(0, 100) + '...',
                data: {
                  type: 'ministry_devotional',
                  devotionalId: selectedDevotional.id,
                  deepLink,
                  consumptionLocation: selectedDevotional.consumption_location
                }
              },
              recipients: [], // Would be populated from ministry group members
              channel: 'push'
            }
          });

          if (error) {
            console.error('Push notification error:', error);
          }
        }

        // Log broadcast
        await supabase.from('ministry_devotional_broadcasts').insert({
          devotional_id: selectedDevotional.id,
          channel: channel.id,
          recipient_count: 0, // Would be actual count from group
          status: 'sent',
          sent_at: new Date().toISOString()
        });
      }

      toast({
        title: t('ministryDevotionalCreator', 'broadcastSent', 'Broadcast Sent'),
        description: t('ministryDevotionalCreator', 'broadcastSentVia', 'Your devotional has been broadcast via {channels}').replace('{channels}', enabledChannels.map(ch => ch.name).join(', '))
      });

      setShowBroadcastModal(false);
    } catch (error: any) {
      toast({
        title: t('ministryDevotionalCreator', 'broadcastError', 'Broadcast Error'),
        description: error.message || t('ministryDevotionalCreator', 'failedSendBroadcast', 'Failed to send broadcast'),
        variant: 'destructive'
      });
    } finally {
      setBroadcasting(false);
    }
  };

  // Copy deep link
  const copyDeepLink = (devotionalId: string, location: string) => {
    const link = generateDeepLink(devotionalId, location);
    navigator.clipboard.writeText(link);
    toast({ title: t('ministryDevotionalCreator', 'copied', 'Copied'), description: t('ministryDevotionalCreator', 'deepLinkCopied', 'Deep link copied to clipboard') });
  };

  // Locked state for non-ministry users
  if (!hasMinistrySubscription) {
    return (
      <div className="space-y-6">
        <Card className="border-2 border-dashed border-gray-300">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="h-10 w-10 text-gray-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-700 mb-3">{t('ministryDevotionalCreator', 'ministryFeature', 'Ministry Feature')}</h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              {t('ministryDevotionalCreator', 'ministryFeatureDesc', 'Create and broadcast personalized devotionals to your ministry group. This premium feature is available exclusively for Ministry subscribers.')}
            </p>
            
            <div className="bg-purple-50 rounded-xl p-6 mb-6 max-w-lg mx-auto">
              <h3 className="font-semibold text-purple-800 mb-4 flex items-center justify-center gap-2">
                <Crown className="h-5 w-5" />
                {t('ministryDevotionalCreator', 'subscriptionIncludes', 'Ministry Subscription Includes:')}
              </h3>
              <ul className="text-left space-y-2 text-sm text-purple-700">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  {t('ministryDevotionalCreator', 'featureUnlimitedDevotionals', 'Create unlimited personalized devotionals')}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  {t('ministryDevotionalCreator', 'featureWhatsappBroadcast', 'Broadcast via WhatsApp with deep links')}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  {t('ministryDevotionalCreator', 'featurePushNotifications', 'Send in-app push notifications')}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  {t('ministryDevotionalCreator', 'featureChooseLocation', 'Choose where devotionals are consumed')}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  {t('ministryDevotionalCreator', 'featureManageGroups', 'Manage ministry groups')}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  {t('ministryDevotionalCreator', 'featureAnalytics', 'Analytics and engagement tracking')}
                </li>
              </ul>
            </div>

            <Button 
              size="lg" 
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
              onClick={() => {
                // Open the subscription (sponsor) tab via the app-native event —
                // the old hash write no longer drives navigation (tabs are paths now).
                window.dispatchEvent(new CustomEvent('openSubscription'));
              }}
            >
              <Crown className="h-5 w-5 mr-2" />
              {t('ministryDevotionalCreator', 'upgradeToMinistry', 'Upgrade to Ministry - $19.99/month')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">{t('ministryDevotionalCreator', 'ministryDevotionals', 'Ministry Devotionals')}</h1>
          <p className="text-gray-600">{t('ministryDevotionalCreator', 'headerSubtitle', 'Create and broadcast personalized devotionals to your ministry')}</p>
        </div>
        <Badge className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
          <Crown className="h-3 w-3 mr-1" />
          {t('ministryDevotionalCreator', 'ministry', 'Ministry')}
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="create" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {editingDevotional ? t('ministryDevotionalCreator', 'edit', 'Edit') : t('ministryDevotionalCreator', 'create', 'Create')}
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            {t('ministryDevotionalCreator', 'myDevotionals', 'My Devotionals')}
          </TabsTrigger>
          <TabsTrigger value="groups" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('ministryDevotionalCreator', 'groups', 'Groups')}
          </TabsTrigger>
        </TabsList>

        {/* Create/Edit Tab */}
        <TabsContent value="create" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                {editingDevotional ? t('ministryDevotionalCreator', 'editDevotional', 'Edit Devotional') : t('ministryDevotionalCreator', 'createNewDevotional', 'Create New Devotional')}
              </CardTitle>
              <CardDescription>
                {t('ministryDevotionalCreator', 'createCardDesc', 'Fill in the details below to create a personalized devotional for your ministry')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">{t('ministryDevotionalCreator', 'titleLabel', 'Title *')}</Label>
                <Input
                  id="title"
                  placeholder={t('ministryDevotionalCreator', 'titlePlaceholder', 'Enter devotional title')}
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                />
              </div>

              {/* Scripture Reference */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="scriptureRef">{t('ministryDevotionalCreator', 'scriptureReference', 'Scripture Reference')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="scriptureRef"
                      className="flex-1"
                      placeholder={t('ministryDevotionalCreator', 'scriptureRefPlaceholder', 'e.g., John 3:16')}
                      value={formData.scriptureReference}
                      onChange={(e) => handleInputChange('scriptureReference', e.target.value)}
                    />
                    <Button type="button" variant="outline" onClick={handleLoadScripture} disabled={loadingScripture} title={t('ministryDevotionalCreator', 'loadScriptureText', 'Load scripture text')}>
                      {loadingScripture ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Select value={scriptureVersion} onValueChange={setScriptureVersion}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BIBLE_VERSIONS.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scriptureText">{t('ministryDevotionalCreator', 'scriptureText', 'Scripture Text')}</Label>
                  <Textarea
                    id="scriptureText"
                    placeholder={t('ministryDevotionalCreator', 'scriptureTextPlaceholder', 'Enter the scripture text')}
                    value={formData.scriptureText}
                    onChange={(e) => handleInputChange('scriptureText', e.target.value)}
                    rows={2}
                  />
                </div>
              </div>

              {/* Content */}
              <div className="space-y-2">
                <Label htmlFor="content">{t('ministryDevotionalCreator', 'contentLabel', 'Devotional Content *')}</Label>
                <Textarea
                  id="content"
                  placeholder={t('ministryDevotionalCreator', 'contentPlaceholder', 'Write your devotional content here...')}
                  value={formData.content}
                  onChange={(e) => handleInputChange('content', e.target.value)}
                  rows={8}
                />
              </div>

              {/* Media */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="imageUrl" className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    {t('ministryDevotionalCreator', 'imageUrlLabel', 'Image URL (Optional)')}
                  </Label>
                  <ImageUpload
                    value={formData.imageUrl}
                    onChange={(url) => handleInputChange('imageUrl', url)}
                    folder="devotionals"
                    placeholder="Upload image"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="audioUrl" className="flex items-center gap-2">
                    <Music className="h-4 w-4" />
                    {t('ministryDevotionalCreator', 'audioUrlLabel', 'Audio URL (Optional)')}
                  </Label>
                  <Input
                    id="audioUrl"
                    placeholder="https://example.com/audio.mp3"
                    value={formData.audioUrl}
                    onChange={(e) => handleInputChange('audioUrl', e.target.value)}
                  />
                </div>

                {/* Schedule Date */}
                <div className="space-y-2">
                  <Label htmlFor="scheduledDate" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {t('ministryDevotionalCreator', 'publishDate', 'Publish Date')}
                    <span className="text-xs text-gray-400 font-normal">{t('ministryDevotionalCreator', 'publishDateHint', '— members can only read on or after this date')}</span>
                  </Label>
                  <Input
                    id="scheduledDate"
                    type="date"
                    value={formData.scheduledDate}
                    min={editingDevotional ? undefined : getLocalDateString()}
                    onChange={(e) => handleInputChange('scheduledDate', e.target.value)}
                    className="w-auto"
                  />
                  <p className="text-xs text-gray-400">
                    {formData.scheduledDate === getLocalDateString()
                      ? t('ministryDevotionalCreator', 'publishingToday', '📅 Publishing today — members can read immediately')
                      : t('ministryDevotionalCreator', 'scheduledForDate', '📅 Scheduled for {date} — hidden from members until then').replace('{date}', new Date(formData.scheduledDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
                    }
                  </p>
                </div>
              </div>

              {/* Consumption Location Toggle */}
              <div className="space-y-3">
                <Label>{t('ministryDevotionalCreator', 'consumptionLocationLabel', 'Where should recipients read this devotional?')}</Label>
                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant={formData.consumptionLocation === 'main_app' ? 'default' : 'outline'}
                    onClick={() => handleInputChange('consumptionLocation', 'main_app')}
                    className="flex-1"
                  >
                    <BookOpen className="h-4 w-4 mr-2" />
                    {t('ministryDevotionalCreator', 'mainApp', 'Main App')}
                  </Button>
                  <Button
                    type="button"
                    variant={formData.consumptionLocation === 'ministry_space' ? 'default' : 'outline'}
                    onClick={() => handleInputChange('consumptionLocation', 'ministry_space')}
                    className="flex-1"
                  >
                    <Crown className="h-4 w-4 mr-2" />
                    {t('ministryDevotionalCreator', 'ministrySpace', 'Ministry Space')}
                  </Button>
                </div>
                <p className="text-sm text-gray-500">
                  {formData.consumptionLocation === 'main_app'
                    ? t('ministryDevotionalCreator', 'mainAppDesc', 'Recipients will read the devotional in the main ReKindle app')
                    : t('ministryDevotionalCreator', 'ministrySpaceDesc', 'Recipients will read the devotional in your dedicated ministry space')}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowPreview(true)}
                  disabled={!formData.title || !formData.content}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  {t('ministryDevotionalCreator', 'preview', 'Preview')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleSaveDevotional(false)}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {t('ministryDevotionalCreator', 'saveAsDraft', 'Save as Draft')}
                </Button>
                <Button
                  onClick={() => handleSaveDevotional(true)}
                  disabled={saving}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {editingDevotional ? t('ministryDevotionalCreator', 'updatePublish', 'Update & Publish') : t('ministryDevotionalCreator', 'createPublish', 'Create & Publish')}
                </Button>
                {editingDevotional && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingDevotional(null);
                      setFormData({
                        title: '',
                        scriptureReference: '',
                        scriptureText: '',
                        content: '',
                        imageUrl: '',
                        audioUrl: '',
                        consumptionLocation: 'main_app'
                      });
                    }}
                  >
                    {t('ministryDevotionalCreator', 'cancelEdit', 'Cancel Edit')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manage Tab */}
        <TabsContent value="manage" className="space-y-4">
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-600" />
              <p className="text-gray-500 mt-2">{t('ministryDevotionalCreator', 'loadingDevotionals', 'Loading devotionals...')}</p>
            </div>
          ) : devotionals.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('ministryDevotionalCreator', 'noDevotionalsYet', 'No Devotionals Yet')}</h3>
                <p className="text-gray-500 mb-4">{t('ministryDevotionalCreator', 'noDevotionalsDesc', 'Create your first ministry devotional to get started')}</p>
                <Button onClick={() => setActiveTab('create')}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('ministryDevotionalCreator', 'createDevotional', 'Create Devotional')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {devotionals.map((devotional) => (
                <Card key={devotional.id} className="overflow-hidden">
                  <div className="flex">
                    {devotional.image_url && (
                      <div className="w-32 h-32 flex-shrink-0">
                        <img 
                          src={devotional.image_url} 
                          alt={devotional.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-lg">{devotional.title}</h3>
                          {devotional.scripture_reference && (
                            <p className="text-sm text-purple-600">{devotional.scripture_reference}</p>
                          )}
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                            {devotional.content}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={devotional.is_published ? 'default' : 'secondary'}>
                            {devotional.is_published ? t('ministryDevotionalCreator', 'published', 'Published') : t('ministryDevotionalCreator', 'draft', 'Draft')}
                          </Badge>
                          <Badge variant="outline">
                            {devotional.consumption_location === 'main_app' ? t('ministryDevotionalCreator', 'mainApp', 'Main App') : t('ministryDevotionalCreator', 'ministrySpace', 'Ministry Space')}
                          </Badge>
                          {devotional.scheduled_date && (
                            <Badge variant="outline" className="text-blue-600 border-blue-200">
                              <Calendar className="h-3 w-3 mr-1" />
                              {devotional.scheduled_date <= getLocalDateString()
                                ? t('ministryDevotionalCreator', 'live', 'Live')
                                : t('ministryDevotionalCreator', 'goesLiveDate', 'Goes live {date}').replace('{date}', new Date(devotional.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
                              }
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-4">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleEditDevotional(devotional)}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          {t('ministryDevotionalCreator', 'edit', 'Edit')}
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => copyDeepLink(devotional.id, devotional.consumption_location)}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          {t('ministryDevotionalCreator', 'copyLink', 'Copy Link')}
                        </Button>
                        {devotional.is_published && (
                          <Button 
                            size="sm"
                            onClick={() => handleOpenBroadcast(devotional)}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            <Send className="h-3 w-3 mr-1" />
                            {t('ministryDevotionalCreator', 'broadcast', 'Broadcast')}
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteDevotional(devotional.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Groups Tab */}
        <TabsContent value="groups" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t('ministryDevotionalCreator', 'ministryGroups', 'Ministry Groups')}
              </CardTitle>
              <CardDescription>
                {t('ministryDevotionalCreator', 'ministryGroupsDesc', 'Manage your ministry groups and members for targeted broadcasts')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {groups.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('ministryDevotionalCreator', 'noGroupsYet', 'No Groups Yet')}</h3>
                  <p className="text-gray-500 mb-4">{t('ministryDevotionalCreator', 'noGroupsDesc', 'Create a ministry group to organize your broadcast recipients')}</p>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('ministryDevotionalCreator', 'createGroup', 'Create Group')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {groups.map((group) => (
                    <div key={group.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h4 className="font-semibold">{group.name}</h4>
                        <p className="text-sm text-gray-500">{t('ministryDevotionalCreator', 'membersCount', '{count} members').replace('{count}', String(group.member_count))}</p>
                      </div>
                      <Button variant="outline" size="sm">
                        {t('ministryDevotionalCreator', 'manage', 'Manage')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Broadcast Modal */}
      <Dialog open={showBroadcastModal} onOpenChange={setShowBroadcastModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              {t('ministryDevotionalCreator', 'broadcastDevotional', 'Broadcast Devotional')}
            </DialogTitle>
            <DialogDescription>
              {t('ministryDevotionalCreator', 'broadcastModalDesc', 'Select how you want to share "{title}" with your ministry').replace('{title}', selectedDevotional?.title || '')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Channel Selection */}
            <div className="space-y-3">
              <Label>{t('ministryDevotionalCreator', 'selectBroadcastChannels', 'Select Broadcast Channels')}</Label>
              {broadcastChannels.map((channel) => (
                <div 
                  key={channel.id}
                  className={`flex items-center justify-between p-4 border rounded-lg ${
                    !channel.available ? 'opacity-50' : channel.enabled ? 'border-purple-500 bg-purple-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      channel.enabled ? 'bg-purple-600 text-white' : 'bg-gray-100'
                    }`}>
                      {channel.icon}
                    </div>
                    <div>
                      <p className="font-medium">{channel.name}</p>
                      <p className="text-sm text-gray-500">{channel.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={channel.enabled}
                    onCheckedChange={() => toggleChannel(channel.id)}
                    disabled={!channel.available}
                  />
                </div>
              ))}
            </div>

            {/* Group Selection */}
            {groups.length > 0 && (
              <div className="space-y-2">
                <Label>{t('ministryDevotionalCreator', 'selectMinistryGroup', 'Select Ministry Group')}</Label>
                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('ministryDevotionalCreator', 'allMembersPlaceholder', 'All members')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('ministryDevotionalCreator', 'allMembers', 'All Members')}</SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {t('ministryDevotionalCreator', 'groupWithCount', '{name} ({count} members)').replace('{name}', group.name).replace('{count}', String(group.member_count))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Deep Link Preview */}
            {selectedDevotional && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <Label className="text-xs text-gray-500">{t('ministryDevotionalCreator', 'deepLink', 'Deep Link')}</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs flex-1 truncate">
                    {generateDeepLink(selectedDevotional.id, selectedDevotional.consumption_location)}
                  </code>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => copyDeepLink(selectedDevotional.id, selectedDevotional.consumption_location)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBroadcastModal(false)}>
              {t('ministryDevotionalCreator', 'cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleConfirmBroadcast}
              disabled={!broadcastChannels.some(ch => ch.enabled)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Send className="h-4 w-4 mr-2" />
              {t('ministryDevotionalCreator', 'continueToConfirm', 'Continue to Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmBroadcast} onOpenChange={setShowConfirmBroadcast}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              {t('ministryDevotionalCreator', 'confirmBroadcast', 'Confirm Broadcast')}
            </DialogTitle>
            <DialogDescription>
              {t('ministryDevotionalCreator', 'confirmBroadcastDesc', 'Please confirm you want to send this broadcast. This action cannot be undone.')}
            </DialogDescription>
          </DialogHeader>

          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              {t('ministryDevotionalCreator', 'aboutToBroadcast', 'You are about to broadcast "{title}" via').replace('{title}', selectedDevotional?.title || '')}{' '}
              <strong>{broadcastChannels.filter(ch => ch.enabled).map(ch => ch.name).join(', ')}</strong>.
              {selectedGroup ? ` ${t('ministryDevotionalCreator', 'sentToSelectedGroup', 'This will be sent to the selected group.')}` : ` ${t('ministryDevotionalCreator', 'sentToAllMembers', 'This will be sent to all members.')}`}
            </AlertDescription>
          </Alert>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowConfirmBroadcast(false)}>
              {t('ministryDevotionalCreator', 'goBack', 'Go Back')}
            </Button>
            <Button 
              onClick={executeBroadcast}
              disabled={broadcasting}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {broadcasting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('ministryDevotionalCreator', 'broadcasting', 'Broadcasting...')}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  {t('ministryDevotionalCreator', 'confirmSend', 'Confirm & Send')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('ministryDevotionalCreator', 'devotionalPreview', 'Devotional Preview')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {formData.imageUrl && (
              <img 
                src={formData.imageUrl} 
                alt="Devotional" 
                className="w-full h-48 object-cover rounded-lg"
              />
            )}
            <h2 className="text-2xl font-serif font-bold">{formData.title || t('ministryDevotionalCreator', 'untitled', 'Untitled')}</h2>
            {formData.scriptureReference && (
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-purple-700 font-medium">{formData.scriptureReference}</p>
                {formData.scriptureText && (
                  <p className="text-purple-600 italic mt-2">"{formData.scriptureText}"</p>
                )}
              </div>
            )}
            <div className="prose prose-purple">
              <p className="whitespace-pre-wrap">{formData.content || t('ministryDevotionalCreator', 'noContentYet', 'No content yet...')}</p>
            </div>
            {formData.audioUrl && (
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <Music className="h-5 w-5 text-purple-600" />
                <span className="text-sm">{t('ministryDevotionalCreator', 'audioAttached', 'Audio attached')}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setShowPreview(false)}>{t('ministryDevotionalCreator', 'closePreview', 'Close Preview')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistryDevotionalCreator;
