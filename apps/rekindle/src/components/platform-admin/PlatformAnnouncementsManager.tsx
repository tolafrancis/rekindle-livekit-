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
import { supabase } from '@/lib/supabase';
import { toast } from '../ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Globe, Plus, Edit, Trash2, Loader2, RefreshCw,
  AlertTriangle, Info, CheckCircle, Bell, Calendar,
  Users, Building2, Eye, EyeOff
} from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  target_audience: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
  created_by: string;
  created_at: string;
}

export const PlatformAnnouncementsManager: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'info',
    target_audience: 'all',
    is_active: true,
    starts_at: new Date().toISOString().slice(0, 16),
    ends_at: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('platform_announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (err) {
      console.error('Error loading announcements:', err);
      toast({ title: t('platformAnnouncementsManager', 'error', 'Error'), description: t('platformAnnouncementsManager', 'failedToLoad', 'Failed to load announcements'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingAnnouncement(null);
    setFormData({
      title: '',
      content: '',
      type: 'info',
      target_audience: 'all',
      is_active: true,
      starts_at: new Date().toISOString().slice(0, 16),
      ends_at: ''
    });
    setShowModal(true);
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      content: announcement.content,
      type: announcement.type,
      target_audience: announcement.target_audience,
      is_active: announcement.is_active,
      starts_at: announcement.starts_at?.slice(0, 16) || '',
      ends_at: announcement.ends_at?.slice(0, 16) || ''
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast({ title: t('platformAnnouncementsManager', 'error', 'Error'), description: t('platformAnnouncementsManager', 'titleAndContentRequired', 'Title and content are required'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        title: formData.title.trim(),
        content: formData.content.trim(),
        type: formData.type,
        target_audience: formData.target_audience,
        is_active: formData.is_active,
        starts_at: formData.starts_at || new Date().toISOString(),
        ends_at: formData.ends_at || null
      };

      if (editingAnnouncement) {
        await supabase
          .from('platform_announcements')
          .update(dataToSave)
          .eq('id', editingAnnouncement.id);
        toast({ title: t('platformAnnouncementsManager', 'success', 'Success'), description: t('platformAnnouncementsManager', 'announcementUpdated', 'Announcement updated') });
      } else {
        await supabase
          .from('platform_announcements')
          .insert({ ...dataToSave, created_by: user?.id });
        toast({ title: t('platformAnnouncementsManager', 'success', 'Success'), description: t('platformAnnouncementsManager', 'announcementCreated', 'Announcement created') });
      }

      setShowModal(false);
      loadData();
    } catch (err: any) {
      toast({ title: t('platformAnnouncementsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('platformAnnouncementsManager', 'confirmDelete', 'Are you sure you want to delete this announcement?'))) return;

    try {
      await supabase.from('platform_announcements').delete().eq('id', id);
      toast({ title: t('platformAnnouncementsManager', 'success', 'Success'), description: t('platformAnnouncementsManager', 'announcementDeleted', 'Announcement deleted') });
      loadData();
    } catch (err: any) {
      toast({ title: t('platformAnnouncementsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleActive = async (announcement: Announcement) => {
    try {
      await supabase
        .from('platform_announcements')
        .update({ is_active: !announcement.is_active })
        .eq('id', announcement.id);
      toast({ title: t('platformAnnouncementsManager', 'success', 'Success'), description: announcement.is_active ? t('platformAnnouncementsManager', 'announcementDeactivated', 'Announcement deactivated') : t('platformAnnouncementsManager', 'announcementActivated', 'Announcement activated') });
      loadData();
    } catch (err: any) {
      toast({ title: t('platformAnnouncementsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'info':
        return <Badge className="bg-blue-100 text-blue-700"><Info className="h-3 w-3 mr-1" />{t('platformAnnouncementsManager', 'typeInfo', 'Info')}</Badge>;
      case 'warning':
        return <Badge className="bg-amber-100 text-amber-700"><AlertTriangle className="h-3 w-3 mr-1" />{t('platformAnnouncementsManager', 'typeWarning', 'Warning')}</Badge>;
      case 'success':
        return <Badge className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />{t('platformAnnouncementsManager', 'success', 'Success')}</Badge>;
      case 'urgent':
        return <Badge className="bg-red-100 text-red-700"><Bell className="h-3 w-3 mr-1" />{t('platformAnnouncementsManager', 'typeUrgent', 'Urgent')}</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const getAudienceBadge = (audience: string) => {
    switch (audience) {
      case 'all':
        return <Badge variant="outline"><Users className="h-3 w-3 mr-1" />{t('platformAnnouncementsManager', 'allUsers', 'All Users')}</Badge>;
      case 'ministries':
        return <Badge variant="outline"><Building2 className="h-3 w-3 mr-1" />{t('platformAnnouncementsManager', 'ministriesOnly', 'Ministries Only')}</Badge>;
      case 'admins':
        return <Badge variant="outline"><Globe className="h-3 w-3 mr-1" />{t('platformAnnouncementsManager', 'adminsOnly', 'Admins Only')}</Badge>;
      default:
        return <Badge variant="outline">{audience}</Badge>;
    }
  };

  const activeAnnouncements = announcements.filter(a => a.is_active);
  const inactiveAnnouncements = announcements.filter(a => !a.is_active);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{t('platformAnnouncementsManager', 'platformAnnouncements', 'Platform Announcements')}</h2>
          <p className="text-sm text-gray-500">{t('platformAnnouncementsManager', 'broadcastMessages', 'Broadcast messages to all users and ministries')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('platformAnnouncementsManager', 'refresh', 'Refresh')}
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {t('platformAnnouncementsManager', 'newAnnouncement', 'New Announcement')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Globe className="h-8 w-8 mx-auto text-purple-500 mb-2" />
            <p className="text-2xl font-bold">{announcements.length}</p>
            <p className="text-sm text-gray-500">{t('platformAnnouncementsManager', 'total', 'Total')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Eye className="h-8 w-8 mx-auto text-green-500 mb-2" />
            <p className="text-2xl font-bold">{activeAnnouncements.length}</p>
            <p className="text-sm text-gray-500">{t('platformAnnouncementsManager', 'active', 'Active')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <EyeOff className="h-8 w-8 mx-auto text-gray-500 mb-2" />
            <p className="text-2xl font-bold">{inactiveAnnouncements.length}</p>
            <p className="text-sm text-gray-500">{t('platformAnnouncementsManager', 'inactive', 'Inactive')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Bell className="h-8 w-8 mx-auto text-red-500 mb-2" />
            <p className="text-2xl font-bold">{announcements.filter(a => a.type === 'urgent' && a.is_active).length}</p>
            <p className="text-sm text-gray-500">{t('platformAnnouncementsManager', 'typeUrgent', 'Urgent')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Announcements List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t('platformAnnouncementsManager', 'announcementsCount', 'Announcements ({count})').replace('{count}', String(announcements.length))}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {announcements.length === 0 ? (
            <div className="text-center py-12">
              <Globe className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">{t('platformAnnouncementsManager', 'noAnnouncementsYet', 'No announcements yet')}</p>
              <Button className="mt-4" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                {t('platformAnnouncementsManager', 'createFirstAnnouncement', 'Create First Announcement')}
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {announcements.map(announcement => (
                <div key={announcement.id} className={`p-4 ${!announcement.is_active ? 'bg-gray-50 opacity-75' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">{announcement.title}</h3>
                        {getTypeBadge(announcement.type)}
                        {getAudienceBadge(announcement.target_audience)}
                        {announcement.is_active ? (
                          <Badge className="bg-green-100 text-green-700">{t('platformAnnouncementsManager', 'active', 'Active')}</Badge>
                        ) : (
                          <Badge variant="secondary">{t('platformAnnouncementsManager', 'inactive', 'Inactive')}</Badge>
                        )}
                      </div>
                      <p className="text-gray-600 line-clamp-2">{announcement.content}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {t('platformAnnouncementsManager', 'startsLabel', 'Starts: {date}').replace('{date}', new Date(announcement.starts_at).toLocaleDateString())}
                        </span>
                        {announcement.ends_at && (
                          <span className="flex items-center gap-1">
                            {t('platformAnnouncementsManager', 'endsLabel', 'Ends: {date}').replace('{date}', new Date(announcement.ends_at).toLocaleDateString())}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleToggleActive(announcement)}
                        title={announcement.is_active ? t('platformAnnouncementsManager', 'deactivate', 'Deactivate') : t('platformAnnouncementsManager', 'activate', 'Activate')}
                      >
                        {announcement.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(announcement)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(announcement.id)}>
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

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingAnnouncement ? t('platformAnnouncementsManager', 'editAnnouncement', 'Edit Announcement') : t('platformAnnouncementsManager', 'createAnnouncement', 'Create Announcement')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('platformAnnouncementsManager', 'titleLabel', 'Title *')}</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('platformAnnouncementsManager', 'titlePlaceholder', 'Announcement title')}
              />
            </div>
            <div>
              <Label>{t('platformAnnouncementsManager', 'contentLabel', 'Content *')}</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder={t('platformAnnouncementsManager', 'contentPlaceholder', 'Announcement content...')}
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('platformAnnouncementsManager', 'typeLabel', 'Type')}</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">{t('platformAnnouncementsManager', 'typeInfo', 'Info')}</SelectItem>
                    <SelectItem value="success">{t('platformAnnouncementsManager', 'success', 'Success')}</SelectItem>
                    <SelectItem value="warning">{t('platformAnnouncementsManager', 'typeWarning', 'Warning')}</SelectItem>
                    <SelectItem value="urgent">{t('platformAnnouncementsManager', 'typeUrgent', 'Urgent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('platformAnnouncementsManager', 'targetAudienceLabel', 'Target Audience')}</Label>
                <Select value={formData.target_audience} onValueChange={(v) => setFormData({ ...formData, target_audience: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('platformAnnouncementsManager', 'allUsers', 'All Users')}</SelectItem>
                    <SelectItem value="ministries">{t('platformAnnouncementsManager', 'ministriesOnly', 'Ministries Only')}</SelectItem>
                    <SelectItem value="admins">{t('platformAnnouncementsManager', 'adminsOnly', 'Admins Only')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('platformAnnouncementsManager', 'startDate', 'Start Date')}</Label>
                <Input
                  type="datetime-local"
                  value={formData.starts_at}
                  onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                />
              </div>
              <div>
                <Label>{t('platformAnnouncementsManager', 'endDateOptional', 'End Date (Optional)')}</Label>
                <Input
                  type="datetime-local"
                  value={formData.ends_at}
                  onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
              />
              <div>
                <Label>{t('platformAnnouncementsManager', 'active', 'Active')}</Label>
                <p className="text-xs text-gray-500">{t('platformAnnouncementsManager', 'showToUsers', 'Show this announcement to users')}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t('platformAnnouncementsManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingAnnouncement ? t('platformAnnouncementsManager', 'update', 'Update') : t('platformAnnouncementsManager', 'create', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlatformAnnouncementsManager;
