import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Badge } from '@rekindle/ui/badge';
import { Label } from '@rekindle/ui/label';
import { Switch } from '@rekindle/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import {
  Heart, Search, Loader2, CheckCircle, Clock, Eye, EyeOff, User, UserX,
  MessageSquare, AlertTriangle, Filter, Tag, Download, X, Send, Mail,
  BarChart3, TrendingUp, Users, Calendar, Star, Copy
} from 'lucide-react';

interface MinistryPrayerRequestsManagerProps {
  ministryId: string;
}

interface PrayerRequest {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  is_anonymous: boolean;
  is_urgent: boolean;
  visibility: string;
  status: string;
  prayer_count: number;
  assigned_to: string;
  follow_up_notes: string;
  testimony_linked: boolean;
  answered_at: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

interface Analytics {
  totalRequests: number;
  activeRequests: number;
  answeredRequests: number;
  answerRate: number;
  avgResponseTime: number;
  urgentPending: number;
  totalPrayers: number;
  categoriesDistribution: any[];
}

const CATEGORIES = [
  'Health & Healing', 'Family', 'Financial', 'Spiritual Growth', 'Work & Career',
  'Relationships', 'Guidance', 'Protection', 'Salvation', 'Breakthrough',
  'Marriage', 'Children', 'Mental Health', 'Grief & Loss', 'Other'
];

export const MinistryPrayerRequestsManager: React.FC<MinistryPrayerRequestsManagerProps> = ({
  ministryId
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showBulkActionModal, setShowBulkActionModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PrayerRequest | null>(null);
  const [selectedRequests, setSelectedRequests] = useState<string[]>([]);
  const [followUpNote, setFollowUpNote] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRequests();
    loadMembers();
    loadAnalytics();
  }, [ministryId]);

  const loadRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_prayer_requests')
        .select('*')
        .eq('ministry_id', ministryId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error('Error loading prayer requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async () => {
    try {
      const { data } = await supabase
        .from('ministry_group_members')
        .select('user_id')
        .eq('group_id', ministryId)
        .in('role', ['admin', 'leader', 'prayer_lead']);

      if (data && data.length > 0) {
        const userIds = data.map(m => m.user_id);
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('user_id, full_name')
          .in('user_id', userIds);
        setMembers(profiles || []);
      }
    } catch (err) {
      console.error('Error loading members:', err);
    }
  };

  const loadAnalytics = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_prayer_requests')
        .select('*')
        .eq('ministry_id', ministryId);

      if (error) throw error;

      const requestsData = data || [];
      const activeRequests = requestsData.filter(r => r.status === 'active');
      const answeredRequests = requestsData.filter(r => r.status === 'answered');
      const urgentPending = requestsData.filter(r => r.is_urgent && r.status === 'active');
      
      // Calculate average response time
      const answeredWithTime = answeredRequests.filter(r => r.answered_at);
      const avgResponseTime = answeredWithTime.length > 0
        ? answeredWithTime.reduce((sum, r) => {
            const created = new Date(r.created_at).getTime();
            const answered = new Date(r.answered_at).getTime();
            return sum + (answered - created);
          }, 0) / answeredWithTime.length / (1000 * 60 * 60 * 24) // Convert to days
        : 0;

      // Categories distribution
      const categoryDist = CATEGORIES.map(cat => ({
        category: cat,
        count: requestsData.filter(r => r.category === cat).length
      })).filter(c => c.count > 0).sort((a, b) => b.count - a.count);

      setAnalytics({
        totalRequests: requestsData.length,
        activeRequests: activeRequests.length,
        answeredRequests: answeredRequests.length,
        answerRate: requestsData.length > 0 
          ? (answeredRequests.length / requestsData.length) * 100 
          : 0,
        avgResponseTime: Math.round(avgResponseTime),
        urgentPending: urgentPending.length,
        totalPrayers: requestsData.reduce((sum, r) => sum + (r.prayer_count || 0), 0),
        categoriesDistribution: categoryDist
      });
    } catch (err) {
      console.error('Error loading analytics:', err);
    }
  };

  const handleViewDetails = (request: PrayerRequest) => {
    setSelectedRequest(request);
    setFollowUpNote(request.follow_up_notes || '');
    setShowDetailsModal(true);
  };

  const handleUpdateStatus = async (requestId: string, newStatus: string) => {
    try {
      const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
      if (newStatus === 'answered') {
        updates.answered_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('ministry_prayer_requests')
        .update(updates)
        .eq('id', requestId);

      if (error) throw error;
      toast({ title: t('ministryPrayerRequestsManager', 'success', 'Success'), description: t('ministryPrayerRequestsManager', 'requestMarkedAsStatus', 'Request marked as {status}').replace('{status}', String(newStatus)) });
      loadRequests();
      loadAnalytics();
      if (showDetailsModal) setShowDetailsModal(false);
    } catch (err: any) {
      toast({ title: t('ministryPrayerRequestsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleBulkUpdateStatus = async (newStatus: string) => {
    if (selectedRequests.length === 0) return;

    try {
      const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
      if (newStatus === 'answered') {
        updates.answered_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('ministry_prayer_requests')
        .update(updates)
        .in('id', selectedRequests);

      if (error) throw error;
      toast({
        title: t('ministryPrayerRequestsManager', 'success', 'Success'),
        description: t('ministryPrayerRequestsManager', 'requestsUpdatedToStatus', '{count} request(s) updated to {status}').replace('{count}', String(selectedRequests.length)).replace('{status}', String(newStatus))
      });
      setSelectedRequests([]);
      setShowBulkActionModal(false);
      loadRequests();
      loadAnalytics();
    } catch (err: any) {
      toast({ title: t('ministryPrayerRequestsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleAssign = async (requestId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('ministry_prayer_requests')
        .update({ assigned_to: userId || null })
        .eq('id', requestId);

      if (error) throw error;
      toast({ title: t('ministryPrayerRequestsManager', 'success', 'Success'), description: t('ministryPrayerRequestsManager', 'requestAssigned', 'Request assigned') });
      loadRequests();
    } catch (err: any) {
      toast({ title: t('ministryPrayerRequestsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleUpdateVisibility = async (requestId: string, visibility: string) => {
    try {
      const { error } = await supabase
        .from('ministry_prayer_requests')
        .update({ visibility })
        .eq('id', requestId);

      if (error) throw error;
      toast({ title: t('ministryPrayerRequestsManager', 'success', 'Success'), description: t('ministryPrayerRequestsManager', 'visibilityUpdated', 'Visibility updated') });
      loadRequests();
    } catch (err: any) {
      toast({ title: t('ministryPrayerRequestsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleSaveFollowUp = async () => {
    if (!selectedRequest) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('ministry_prayer_requests')
        .update({ follow_up_notes: followUpNote })
        .eq('id', selectedRequest.id);

      if (error) throw error;
      toast({ title: t('ministryPrayerRequestsManager', 'success', 'Success'), description: t('ministryPrayerRequestsManager', 'followUpNotesSaved', 'Follow-up notes saved') });
      loadRequests();
    } catch (err: any) {
      toast({ title: t('ministryPrayerRequestsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    if (!selectedRequest || !tagInput.trim()) return;
    const currentTags = selectedRequest.tags || [];
    if (currentTags.includes(tagInput.trim())) return;

    const newTags = [...currentTags, tagInput.trim()];
    updateRequestTags(selectedRequest.id, newTags);
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    if (!selectedRequest) return;
    const newTags = (selectedRequest.tags || []).filter(item => item !== tag);
    updateRequestTags(selectedRequest.id, newTags);
  };

  const updateRequestTags = async (requestId: string, tags: string[]) => {
    try {
      const { error } = await supabase
        .from('ministry_prayer_requests')
        .update({ tags })
        .eq('id', requestId);

      if (error) throw error;
      loadRequests();
    } catch (err: any) {
      toast({ title: t('ministryPrayerRequestsManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleExport = () => {
    const csv = [
      ['Title', 'Category', 'Status', 'Urgent', 'Prayer Count', 'Created', 'Answered'].join(','),
      ...filteredRequests.map(r => [
        `"${r.title}"`,
        r.category || '',
        r.status,
        r.is_urgent ? 'Yes' : 'No',
        r.prayer_count || 0,
        new Date(r.created_at).toLocaleDateString(),
        r.answered_at ? new Date(r.answered_at).toLocaleDateString() : ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prayer-requests-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelection = (id: string) => {
    setSelectedRequests(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedRequests(prev =>
      prev.length === filteredRequests.length ? [] : filteredRequests.map(r => r.id)
    );
  };

  const filteredRequests = requests.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.content?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || r.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-blue-100 text-blue-700">{t('ministryPrayerRequestsManager', 'active', 'Active')}</Badge>;
      case 'answered':
        return <Badge className="bg-green-100 text-green-700">{t('ministryPrayerRequestsManager', 'answered', 'Answered')}</Badge>;
      case 'archived':
        return <Badge className="bg-gray-100 text-gray-700">{t('ministryPrayerRequestsManager', 'archived', 'Archived')}</Badge>;
      case 'pending_moderation':
        return <Badge className="bg-amber-100 text-amber-700">{t('ministryPrayerRequestsManager', 'pending', 'Pending')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const stats = {
    total: requests.length,
    active: requests.filter(r => r.status === 'active').length,
    answered: requests.filter(r => r.status === 'answered').length,
    pending: requests.filter(r => r.status === 'pending_moderation').length,
    urgent: requests.filter(r => r.is_urgent && r.status === 'active').length
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t('ministryPrayerRequestsManager', 'searchRequestsPlaceholder', 'Search requests...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-80"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ministryPrayerRequestsManager', 'allStatus', 'All Status')}</SelectItem>
              <SelectItem value="active">{t('ministryPrayerRequestsManager', 'active', 'Active')}</SelectItem>
              <SelectItem value="answered">{t('ministryPrayerRequestsManager', 'answered', 'Answered')}</SelectItem>
              <SelectItem value="archived">{t('ministryPrayerRequestsManager', 'archived', 'Archived')}</SelectItem>
              <SelectItem value="pending_moderation">{t('ministryPrayerRequestsManager', 'pending', 'Pending')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ministryPrayerRequestsManager', 'allCategories', 'All Categories')}</SelectItem>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          {selectedRequests.length > 0 && (
            <Button variant="outline" onClick={() => setShowBulkActionModal(true)}>
              {t('ministryPrayerRequestsManager', 'bulkActionsCount', 'Bulk Actions ({count})').replace('{count}', String(selectedRequests.length))}
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowAnalyticsModal(true)}>
            <BarChart3 className="h-4 w-4 mr-2" />
            {t('ministryPrayerRequestsManager', 'analytics', 'Analytics')}
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            {t('ministryPrayerRequestsManager', 'export', 'Export')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryPrayerRequestsManager', 'total', 'Total')}</p>
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
                <p className="text-sm text-gray-500">{t('ministryPrayerRequestsManager', 'active', 'Active')}</p>
                <p className="text-2xl font-bold">{stats.active}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryPrayerRequestsManager', 'answered', 'Answered')}</p>
                <p className="text-2xl font-bold">{stats.answered}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryPrayerRequestsManager', 'pendingReview', 'Pending Review')}</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryPrayerRequestsManager', 'urgent', 'Urgent')}</p>
                <p className="text-2xl font-bold">{stats.urgent}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Requests List */}
      <Card>
        <CardContent className="p-0">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12">
              <Heart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-700">{t('ministryPrayerRequestsManager', 'noPrayerRequests', 'No Prayer Requests')}</h3>
              <p className="text-gray-500">{t('ministryPrayerRequestsManager', 'noPrayerRequestsDesc', 'Prayer requests from members will appear here')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredRequests.length > 0 && (
                <div className="p-3 bg-gray-50 border-b flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedRequests.length === filteredRequests.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <span className="text-sm text-gray-600">
                    {selectedRequests.length > 0
                      ? t('ministryPrayerRequestsManager', 'countSelected', '{count} selected').replace('{count}', String(selectedRequests.length))
                      : t('ministryPrayerRequestsManager', 'selectAll', 'Select all')}
                  </span>
                </div>
              )}
              {filteredRequests.map(request => (
                <div key={request.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedRequests.includes(request.id)}
                      onChange={() => toggleSelection(request.id)}
                      className="mt-1 w-4 h-4 cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {request.is_urgent && <AlertTriangle className="h-4 w-4 text-red-500" />}
                        {request.is_anonymous ? (
                          <UserX className="h-4 w-4 text-gray-400" />
                        ) : (
                          <User className="h-4 w-4 text-gray-400" />
                        )}
                        <h3 className="font-semibold">{request.title}</h3>
                        {getStatusBadge(request.status)}
                        {request.category && (
                          <Badge variant="outline" className="text-xs">{request.category}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2 mb-2">{request.content}</p>
                      <div className="flex flex-wrap gap-2 items-center text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" /> {t('ministryPrayerRequestsManager', 'prayersCount', '{count} prayers').replace('{count}', String(request.prayer_count || 0))}
                        </span>
                        <span>{new Date(request.created_at).toLocaleDateString()}</span>
                        <Badge variant="outline" className="text-xs">
                          {request.visibility === 'public' ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
                          {request.visibility}
                        </Badge>
                        {request.assigned_to && (
                          <span className="text-purple-600">
                            {t('ministryPrayerRequestsManager', 'assignedLabel', 'Assigned:')} {members.find(m => m.user_id === request.assigned_to)?.full_name || t('ministryPrayerRequestsManager', 'team', 'Team')}
                          </span>
                        )}
                        {request.tags && request.tags.length > 0 && (
                          <div className="flex gap-1">
                            {request.tags.slice(0, 2).map(tag => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                <Tag className="h-2 w-2 mr-1" />{tag}
                              </Badge>
                            ))}
                            {request.tags.length > 2 && (
                              <Badge variant="secondary" className="text-xs">+{request.tags.length - 2}</Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleViewDetails(request)}>
                        <MessageSquare className="h-4 w-4 mr-1" />
                        {t('ministryPrayerRequestsManager', 'details', 'Details')}
                      </Button>
                      {request.status === 'active' && (
                        <Button 
                          size="sm" 
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleUpdateStatus(request.id, 'answered')}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          {t('ministryPrayerRequestsManager', 'markAnswered', 'Mark Answered')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('ministryPrayerRequestsManager', 'prayerRequestDetails', 'Prayer Request Details')}</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">{t('ministryPrayerRequestsManager', 'detailsAndActions', 'Details & Actions')}</TabsTrigger>
                <TabsTrigger value="notes">{t('ministryPrayerRequestsManager', 'followUpAndTags', 'Follow-up & Tags')}</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    {selectedRequest.is_urgent && (
                      <Badge className="bg-red-100 text-red-700">{t('ministryPrayerRequestsManager', 'urgent', 'Urgent')}</Badge>
                    )}
                    {selectedRequest.is_anonymous && (
                      <Badge variant="secondary">{t('ministryPrayerRequestsManager', 'anonymous', 'Anonymous')}</Badge>
                    )}
                    {getStatusBadge(selectedRequest.status)}
                    {selectedRequest.category && (
                      <Badge variant="outline">{selectedRequest.category}</Badge>
                    )}
                  </div>
                  <h3 className="font-semibold text-lg">{selectedRequest.title}</h3>
                  <p className="text-gray-600 mt-2 whitespace-pre-wrap">{selectedRequest.content}</p>
                  <div className="mt-3 flex gap-3 text-sm text-gray-500">
                    <span>{t('ministryPrayerRequestsManager', 'submittedLabel', 'Submitted:')} {new Date(selectedRequest.created_at).toLocaleString()}</span>
                    {selectedRequest.answered_at && (
                      <span className="text-green-600">
                        {t('ministryPrayerRequestsManager', 'answeredLabel', 'Answered:')} {new Date(selectedRequest.answered_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('ministryPrayerRequestsManager', 'status', 'Status')}</Label>
                    <Select
                      value={selectedRequest.status}
                      onValueChange={(v) => handleUpdateStatus(selectedRequest.id, v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{t('ministryPrayerRequestsManager', 'active', 'Active')}</SelectItem>
                        <SelectItem value="answered">{t('ministryPrayerRequestsManager', 'answered', 'Answered')}</SelectItem>
                        <SelectItem value="archived">{t('ministryPrayerRequestsManager', 'archived', 'Archived')}</SelectItem>
                        <SelectItem value="pending_moderation">{t('ministryPrayerRequestsManager', 'pendingModeration', 'Pending Moderation')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t('ministryPrayerRequestsManager', 'visibility', 'Visibility')}</Label>
                    <Select
                      value={selectedRequest.visibility}
                      onValueChange={(v) => handleUpdateVisibility(selectedRequest.id, v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">{t('ministryPrayerRequestsManager', 'public', 'Public')}</SelectItem>
                        <SelectItem value="leaders">{t('ministryPrayerRequestsManager', 'leadersOnly', 'Leaders Only')}</SelectItem>
                        <SelectItem value="private">{t('ministryPrayerRequestsManager', 'private', 'Private')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>{t('ministryPrayerRequestsManager', 'assignToPrayerTeam', 'Assign to Prayer Team')}</Label>
                  <Select
                    value={selectedRequest.assigned_to || '__none__'}
                    onValueChange={(v) => handleAssign(selectedRequest.id, v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('ministryPrayerRequestsManager', 'selectTeamMember', 'Select team member')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t('ministryPrayerRequestsManager', 'unassigned', 'Unassigned')}</SelectItem>
                      {members.map(m => (
                        <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="notes" className="space-y-4 mt-4">
                <div>
                  <Label>{t('ministryPrayerRequestsManager', 'followUpNotes', 'Follow-up Notes')}</Label>
                  <Textarea
                    value={followUpNote}
                    onChange={(e) => setFollowUpNote(e.target.value)}
                    placeholder={t('ministryPrayerRequestsManager', 'followUpNotesPlaceholder', 'Add notes about follow-up actions, updates, or communication with the requester...')}
                    rows={6}
                  />
                  <Button 
                    size="sm" 
                    className="mt-2"
                    onClick={handleSaveFollowUp}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    {t('ministryPrayerRequestsManager', 'saveNotes', 'Save Notes')}
                  </Button>
                </div>

                <div>
                  <Label>{t('ministryPrayerRequestsManager', 'tags', 'Tags')}</Label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      placeholder={t('ministryPrayerRequestsManager', 'addTagPlaceholder', 'Add tag')}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    />
                    <Button type="button" variant="outline" onClick={addTag}>{t('ministryPrayerRequestsManager', 'add', 'Add')}</Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedRequest.tags?.map(tag => (
                      <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                        {tag} ×
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                  <Heart className="h-5 w-5 text-pink-500" />
                  <div>
                    <p className="font-medium">{t('ministryPrayerRequestsManager', 'prayerCount', 'Prayer Count')}</p>
                    <p className="text-sm text-gray-600">
                      {t('ministryPrayerRequestsManager', 'peoplePrayedForRequest', '{count} people have prayed for this request').replace('{count}', String(selectedRequest.prayer_count || 0))}
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsModal(false)}>{t('ministryPrayerRequestsManager', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Actions Modal */}
      <Dialog open={showBulkActionModal} onOpenChange={setShowBulkActionModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ministryPrayerRequestsManager', 'bulkActionsSelected', 'Bulk Actions ({count} selected)').replace('{count}', String(selectedRequests.length))}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button 
              className="w-full justify-start bg-green-600 hover:bg-green-700"
              onClick={() => handleBulkUpdateStatus('answered')}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {t('ministryPrayerRequestsManager', 'markAllAsAnswered', 'Mark All as Answered')}
            </Button>
            <Button 
              className="w-full justify-start bg-gray-600 hover:bg-gray-700"
              onClick={() => handleBulkUpdateStatus('archived')}
            >
              {t('ministryPrayerRequestsManager', 'archiveSelected', 'Archive Selected')}
            </Button>
            <Button 
              className="w-full justify-start bg-blue-600 hover:bg-blue-700"
              onClick={() => handleBulkUpdateStatus('active')}
            >
              <Clock className="h-4 w-4 mr-2" />
              {t('ministryPrayerRequestsManager', 'setAsActive', 'Set as Active')}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkActionModal(false)}>{t('ministryPrayerRequestsManager', 'cancel', 'Cancel')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analytics Modal */}
      <Dialog open={showAnalyticsModal} onOpenChange={setShowAnalyticsModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('ministryPrayerRequestsManager', 'prayerRequestsAnalytics', 'Prayer Requests Analytics')}</DialogTitle>
          </DialogHeader>
          {analytics && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <p className="text-sm text-gray-500 mb-1">{t('ministryPrayerRequestsManager', 'answerRate', 'Answer Rate')}</p>
                      <p className="text-3xl font-bold text-green-600">
                        {analytics.answerRate.toFixed(0)}%
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <p className="text-sm text-gray-500 mb-1">{t('ministryPrayerRequestsManager', 'avgResponseTime', 'Avg Response Time')}</p>
                      <p className="text-3xl font-bold text-blue-600">
                        {t('ministryPrayerRequestsManager', 'daysCount', '{count} days').replace('{count}', String(analytics.avgResponseTime))}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <p className="text-sm text-gray-500 mb-1">{t('ministryPrayerRequestsManager', 'totalPrayers', 'Total Prayers')}</p>
                      <p className="text-3xl font-bold text-pink-600">
                        {analytics.totalPrayers.toLocaleString()}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('ministryPrayerRequestsManager', 'categoriesDistribution', 'Categories Distribution')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analytics.categoriesDistribution.map(cat => (
                      <div key={cat.category} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium">{cat.category}</span>
                        <Badge>{t('ministryPrayerRequestsManager', 'requestsCount', '{count} requests').replace('{count}', String(cat.count))}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-pink-50 to-purple-50">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">{t('ministryPrayerRequestsManager', 'urgentRequestsPending', 'Urgent Requests Pending')}</p>
                      <p className="text-3xl font-bold text-red-600">
                        {analytics.urgentPending}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">{t('ministryPrayerRequestsManager', 'requireImmediateAttention', 'Require immediate attention')}</p>
                    </div>
                    <AlertTriangle className="h-16 w-16 text-red-400 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowAnalyticsModal(false)}>{t('ministryPrayerRequestsManager', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistryPrayerRequestsManager;