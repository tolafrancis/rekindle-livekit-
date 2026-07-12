import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Badge } from '@rekindle/ui/badge';
import { Label } from '@rekindle/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import {
  Star, Search, Loader2, CheckCircle, Clock, Eye, Trash2, User, UserX,
  Edit, ThumbsUp, MessageSquare, Share2, Download, BarChart3, TrendingUp,
  Video, Image, Tag, X, Filter, Send, Mail, Award, Heart, Calendar
} from 'lucide-react';

interface MinistryTestimoniesManagerProps {
  ministryId: string;
}

interface Testimony {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  is_anonymous: boolean;
  is_approved: boolean;
  is_featured: boolean;
  linked_prayer_request_id: string;
  image_url: string;
  video_url: string;
  user_id: string;
  user_name: string;
  user_email: string;
  view_count: number;
  like_count: number;
  share_count: number;
  created_at: string;
  approved_at: string;
  approved_by: string;
}

interface Analytics {
  totalTestimonies: number;
  approvedTestimonies: number;
  pendingTestimonies: number;
  featuredTestimonies: number;
  totalViews: number;
  totalLikes: number;
  avgEngagement: number;
  topTestimony: Testimony | null;
  categoriesDistribution: any[];
}

const CATEGORIES = [
  'Healing', 'Provision', 'Deliverance', 'Salvation', 'Restoration',
  'Breakthrough', 'Protection', 'Guidance', 'Miracle', 'Answered Prayer',
  'Family', 'Career', 'Financial', 'Relationship', 'Other'
];

export const MinistryTestimoniesManager: React.FC<MinistryTestimoniesManagerProps> = ({
  ministryId
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [testimonies, setTestimonies] = useState<Testimony[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showBulkActionModal, setShowBulkActionModal] = useState(false);
  const [selectedTestimony, setSelectedTestimony] = useState<Testimony | null>(null);
  const [selectedTestimonies, setSelectedTestimonies] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  const [editForm, setEditForm] = useState({
    title: '',
    content: '',
    category: 'Healing',
    tags: [] as string[],
    image_url: '',
    video_url: ''
  });

  useEffect(() => {
    loadTestimonies();
    loadAnalytics();
  }, [ministryId]);

  const loadTestimonies = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_testimonies')
        .select('*')
        .eq('ministry_id', ministryId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTestimonies(data || []);
    } catch (err) {
      console.error('Error loading testimonies:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_testimonies')
        .select('*')
        .eq('ministry_id', ministryId);

      if (error) throw error;

      const testimoniesData = data || [];
      const approvedTestimonies = testimoniesData.filter(item => item.is_approved);
      const totalViews = testimoniesData.reduce((sum, item) => sum + (item.view_count || 0), 0);
      const totalLikes = testimoniesData.reduce((sum, item) => sum + (item.like_count || 0), 0);

      const categoriesDistribution = CATEGORIES.map(cat => ({
        category: cat,
        count: testimoniesData.filter(item => item.category === cat).length
      })).filter(c => c.count > 0).sort((a, b) => b.count - a.count);

      const topTestimony = [...approvedTestimonies]
        .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))[0] || null;

      setAnalytics({
        totalTestimonies: testimoniesData.length,
        approvedTestimonies: approvedTestimonies.length,
        pendingTestimonies: testimoniesData.filter(item => !item.is_approved).length,
        featuredTestimonies: testimoniesData.filter(item => item.is_featured).length,
        totalViews,
        totalLikes,
        avgEngagement: approvedTestimonies.length > 0 
          ? ((totalLikes + totalViews) / approvedTestimonies.length)
          : 0,
        topTestimony,
        categoriesDistribution
      });
    } catch (err) {
      console.error('Error loading analytics:', err);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const { error } = await supabase
        .from('ministry_testimonies')
        .update({ 
          is_approved: true,
          approved_by: user?.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
      toast({ title: t('ministryTestimoniesManager', 'success', 'Success'), description: t('ministryTestimoniesManager', 'testimonyApproved', 'Testimony approved') });
      loadTestimonies();
      loadAnalytics();
    } catch (err: any) {
      toast({ title: t('ministryTestimoniesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleBulkApprove = async () => {
    if (selectedTestimonies.length === 0) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('ministry_testimonies')
        .update({ 
          is_approved: true,
          approved_by: user?.id,
          approved_at: new Date().toISOString()
        })
        .in('id', selectedTestimonies);

      if (error) throw error;
      toast({
        title: t('ministryTestimoniesManager', 'success', 'Success'),
        description: t('ministryTestimoniesManager', 'countTestimoniesApproved', '{count} testimonies approved').replace('{count}', String(selectedTestimonies.length))
      });
      setSelectedTestimonies([]);
      setShowBulkActionModal(false);
      loadTestimonies();
      loadAnalytics();
    } catch (err: any) {
      toast({ title: t('ministryTestimoniesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm(t('ministryTestimoniesManager', 'confirmRejectTestimony', 'Are you sure you want to reject this testimony?'))) return;

    try {
      const { error } = await supabase
        .from('ministry_testimonies')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: t('ministryTestimoniesManager', 'success', 'Success'), description: t('ministryTestimoniesManager', 'testimonyRejectedRemoved', 'Testimony rejected and removed') });
      loadTestimonies();
      loadAnalytics();
    } catch (err: any) {
      toast({ title: t('ministryTestimoniesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleBulkReject = async () => {
    if (selectedTestimonies.length === 0) return;
    if (!confirm(t('ministryTestimoniesManager', 'confirmRejectCountTestimonies', 'Are you sure you want to reject {count} testimonies?').replace('{count}', String(selectedTestimonies.length)))) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('ministry_testimonies')
        .delete()
        .in('id', selectedTestimonies);

      if (error) throw error;
      toast({
        title: t('ministryTestimoniesManager', 'success', 'Success'),
        description: t('ministryTestimoniesManager', 'countTestimoniesRejected', '{count} testimonies rejected').replace('{count}', String(selectedTestimonies.length))
      });
      setSelectedTestimonies([]);
      setShowBulkActionModal(false);
      loadTestimonies();
      loadAnalytics();
    } catch (err: any) {
      toast({ title: t('ministryTestimoniesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFeatured = async (testimony: Testimony) => {
    try {
      const { error } = await supabase
        .from('ministry_testimonies')
        .update({ is_featured: !testimony.is_featured })
        .eq('id', testimony.id);

      if (error) throw error;
      loadTestimonies();
      loadAnalytics();
    } catch (err: any) {
      toast({ title: t('ministryTestimoniesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleViewDetails = (testimony: Testimony) => {
    setSelectedTestimony(testimony);
    setShowDetailsModal(true);
  };

  const handleEdit = (testimony: Testimony) => {
    setSelectedTestimony(testimony);
    setEditForm({
      title: testimony.title,
      content: testimony.content,
      category: testimony.category || 'Healing',
      tags: testimony.tags || [],
      image_url: testimony.image_url || '',
      video_url: testimony.video_url || ''
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedTestimony) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('ministry_testimonies')
        .update({
          title: editForm.title,
          content: editForm.content,
          category: editForm.category,
          tags: editForm.tags,
          image_url: editForm.image_url,
          video_url: editForm.video_url
        })
        .eq('id', selectedTestimony.id);

      if (error) throw error;
      toast({ title: t('ministryTestimoniesManager', 'success', 'Success'), description: t('ministryTestimoniesManager', 'testimonyUpdated', 'Testimony updated') });
      setShowEditModal(false);
      loadTestimonies();
    } catch (err: any) {
      toast({ title: t('ministryTestimoniesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    if (!tagInput.trim()) return;
    if (editForm.tags.includes(tagInput.trim())) return;
    setEditForm({ ...editForm, tags: [...editForm.tags, tagInput.trim()] });
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setEditForm({ ...editForm, tags: editForm.tags.filter(item => item !== tag) });
  };

  const handleExport = () => {
    const csv = [
      ['Title', 'Category', 'Status', 'Views', 'Likes', 'Created', 'Approved'].join(','),
      ...filteredTestimonies.map(item => [
        `"${item.title}"`,
        item.category || '',
        item.is_approved ? 'Approved' : 'Pending',
        item.view_count || 0,
        item.like_count || 0,
        new Date(item.created_at).toLocaleDateString(),
        item.approved_at ? new Date(item.approved_at).toLocaleDateString() : ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `testimonies-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelection = (id: string) => {
    setSelectedTestimonies(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedTestimonies(prev =>
      prev.length === filteredTestimonies.length ? [] : filteredTestimonies.map(t => t.id)
    );
  };

  const filteredTestimonies = testimonies.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = statusFilter === 'all' ||
      (statusFilter === 'pending' && !item.is_approved) ||
      (statusFilter === 'approved' && item.is_approved) ||
      (statusFilter === 'featured' && item.is_featured);
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesFilter && matchesCategory;
  });

  const stats = {
    total: testimonies.length,
    pending: testimonies.filter(item => !item.is_approved).length,
    approved: testimonies.filter(item => item.is_approved).length,
    featured: testimonies.filter(item => item.is_featured).length
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
              placeholder={t('ministryTestimoniesManager', 'searchTestimoniesPlaceholder', 'Search testimonies...')}
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
              <SelectItem value="all">{t('ministryTestimoniesManager', 'allStatus', 'All Status')}</SelectItem>
              <SelectItem value="pending">{t('ministryTestimoniesManager', 'pendingApproval', 'Pending Approval')}</SelectItem>
              <SelectItem value="approved">{t('ministryTestimoniesManager', 'approved', 'Approved')}</SelectItem>
              <SelectItem value="featured">{t('ministryTestimoniesManager', 'featured', 'Featured')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ministryTestimoniesManager', 'allCategories', 'All Categories')}</SelectItem>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          {selectedTestimonies.length > 0 && (
            <Button variant="outline" onClick={() => setShowBulkActionModal(true)}>
              {t('ministryTestimoniesManager', 'bulkActionsCount', 'Bulk Actions ({count})').replace('{count}', String(selectedTestimonies.length))}
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowAnalyticsModal(true)}>
            <BarChart3 className="h-4 w-4 mr-2" />
            {t('ministryTestimoniesManager', 'analytics', 'Analytics')}
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            {t('ministryTestimoniesManager', 'export', 'Export')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryTestimoniesManager', 'total', 'Total')}</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Star className="h-8 w-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryTestimoniesManager', 'pending', 'Pending')}</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryTestimoniesManager', 'approved', 'Approved')}</p>
                <p className="text-2xl font-bold">{stats.approved}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('ministryTestimoniesManager', 'featured', 'Featured')}</p>
                <p className="text-2xl font-bold">{stats.featured}</p>
              </div>
              <Star className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Testimonies List */}
      <Card>
        <CardContent className="p-0">
          {filteredTestimonies.length === 0 ? (
            <div className="text-center py-12">
              <Star className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-700">{t('ministryTestimoniesManager', 'noTestimonies', 'No Testimonies')}</h3>
              <p className="text-gray-500">{t('ministryTestimoniesManager', 'noTestimoniesDesc', 'Testimonies from members will appear here')}</p>
            </div>
          ) : (
            <div>
              {filteredTestimonies.length > 0 && (
                <div className="p-3 bg-gray-50 border-b flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedTestimonies.length === filteredTestimonies.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <span className="text-sm text-gray-600">
                    {selectedTestimonies.length > 0
                      ? t('ministryTestimoniesManager', 'countSelected', '{count} selected').replace('{count}', String(selectedTestimonies.length))
                      : t('ministryTestimoniesManager', 'selectAll', 'Select all')}
                  </span>
                </div>
              )}
              <div className="divide-y">
                {filteredTestimonies.map(testimony => (
                  <div key={testimony.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedTestimonies.includes(testimony.id)}
                        onChange={() => toggleSelection(testimony.id)}
                        className="mt-1 w-4 h-4 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {testimony.is_anonymous ? (
                            <UserX className="h-4 w-4 text-gray-400" />
                          ) : (
                            <User className="h-4 w-4 text-gray-400" />
                          )}
                          <h3 className="font-semibold">{testimony.title}</h3>
                          {testimony.is_featured && (
                            <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                          )}
                          {testimony.is_approved ? (
                            <Badge className="bg-green-100 text-green-700">{t('ministryTestimoniesManager', 'approved', 'Approved')}</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700">{t('ministryTestimoniesManager', 'pending', 'Pending')}</Badge>
                          )}
                          {testimony.category && (
                            <Badge variant="outline">{testimony.category}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2 mb-2">{testimony.content}</p>
                        <div className="flex flex-wrap gap-2 items-center text-sm text-gray-500">
                          {testimony.image_url && (
                            <Badge variant="secondary" className="text-xs">
                              <Image className="h-3 w-3 mr-1" />
                              {t('ministryTestimoniesManager', 'image', 'Image')}
                            </Badge>
                          )}
                          {testimony.video_url && (
                            <Badge variant="secondary" className="text-xs">
                              <Video className="h-3 w-3 mr-1" />
                              {t('ministryTestimoniesManager', 'video', 'Video')}
                            </Badge>
                          )}
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" /> {testimony.view_count || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <ThumbsUp className="h-3 w-3" /> {testimony.like_count || 0}
                          </span>
                          <span>{new Date(testimony.created_at).toLocaleDateString()}</span>
                          {testimony.tags && testimony.tags.length > 0 && (
                            <div className="flex gap-1">
                              {testimony.tags.slice(0, 2).map(tag => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  <Tag className="h-2 w-2 mr-1" />{tag}
                                </Badge>
                              ))}
                              {testimony.tags.length > 2 && (
                                <Badge variant="outline" className="text-xs">+{testimony.tags.length - 2}</Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleViewDetails(testimony)}>
                          <Eye className="h-4 w-4 mr-1" />
                          {t('ministryTestimoniesManager', 'view', 'View')}
                        </Button>
                        {!testimony.is_approved ? (
                          <>
                            <Button 
                              size="sm" 
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleApprove(testimony.id)}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              {t('ministryTestimoniesManager', 'approve', 'Approve')}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => handleReject(testimony.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleEdit(testimony)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleFeatured(testimony)}
                            >
                              <Star className={`h-4 w-4 ${testimony.is_featured ? 'text-amber-500 fill-amber-500' : ''}`} />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('ministryTestimoniesManager', 'testimonyDetails', 'Testimony Details')}</DialogTitle>
          </DialogHeader>
          {selectedTestimony && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {selectedTestimony.is_approved ? (
                  <Badge className="bg-green-100 text-green-700">{t('ministryTestimoniesManager', 'approved', 'Approved')}</Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-700">{t('ministryTestimoniesManager', 'pending', 'Pending')}</Badge>
                )}
                {selectedTestimony.is_featured && (
                  <Badge className="bg-purple-100 text-purple-700">{t('ministryTestimoniesManager', 'featured', 'Featured')}</Badge>
                )}
                {selectedTestimony.category && (
                  <Badge variant="outline">{selectedTestimony.category}</Badge>
                )}
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-2">{selectedTestimony.title}</h3>
                <p className="text-gray-600 whitespace-pre-wrap">{selectedTestimony.content}</p>
              </div>

              {selectedTestimony.image_url && (
                <div>
                  <Label>{t('ministryTestimoniesManager', 'image', 'Image')}</Label>
                  <img
                    src={selectedTestimony.image_url} 
                    alt={selectedTestimony.title}
                    className="w-full rounded-lg mt-2"
                  />
                </div>
              )}

              {selectedTestimony.video_url && (
                <div>
                  <Label>{t('ministryTestimoniesManager', 'video', 'Video')}</Label>
                  <div className="mt-2 p-4 bg-gray-100 rounded-lg">
                    <a 
                      href={selectedTestimony.video_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-2"
                    >
                      <Video className="h-4 w-4" />
                      {selectedTestimony.video_url}
                    </a>
                  </div>
                </div>
              )}

              {selectedTestimony.tags && selectedTestimony.tags.length > 0 && (
                <div>
                  <Label>{t('ministryTestimoniesManager', 'tags', 'Tags')}</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedTestimony.tags.map(tag => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <Eye className="h-6 w-6 mx-auto text-gray-500 mb-1" />
                  <p className="text-2xl font-bold">{selectedTestimony.view_count || 0}</p>
                  <p className="text-xs text-gray-500">{t('ministryTestimoniesManager', 'views', 'Views')}</p>
                </div>
                <div className="text-center">
                  <ThumbsUp className="h-6 w-6 mx-auto text-gray-500 mb-1" />
                  <p className="text-2xl font-bold">{selectedTestimony.like_count || 0}</p>
                  <p className="text-xs text-gray-500">{t('ministryTestimoniesManager', 'likes', 'Likes')}</p>
                </div>
                <div className="text-center">
                  <Share2 className="h-6 w-6 mx-auto text-gray-500 mb-1" />
                  <p className="text-2xl font-bold">{selectedTestimony.share_count || 0}</p>
                  <p className="text-xs text-gray-500">{t('ministryTestimoniesManager', 'shares', 'Shares')}</p>
                </div>
              </div>

              <div className="text-sm text-gray-500">
                <p>{t('ministryTestimoniesManager', 'submittedLabel', 'Submitted:')} {new Date(selectedTestimony.created_at).toLocaleString()}</p>
                {selectedTestimony.approved_at && (
                  <p>{t('ministryTestimoniesManager', 'approvedLabel', 'Approved:')} {new Date(selectedTestimony.approved_at).toLocaleString()}</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsModal(false)}>{t('ministryTestimoniesManager', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('ministryTestimoniesManager', 'editTestimony', 'Edit Testimony')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('ministryTestimoniesManager', 'title', 'Title')}</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('ministryTestimoniesManager', 'content', 'Content')}</Label>
              <Textarea
                value={editForm.content}
                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                rows={6}
              />
            </div>
            <div>
              <Label>{t('ministryTestimoniesManager', 'category', 'Category')}</Label>
              <Select
                value={editForm.category}
                onValueChange={(v) => setEditForm({ ...editForm, category: v })}
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('ministryTestimoniesManager', 'imageUrlOptional', 'Image URL (Optional)')}</Label>
                <Input
                  value={editForm.image_url}
                  onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label>{t('ministryTestimoniesManager', 'videoUrlOptional', 'Video URL (Optional)')}</Label>
                <Input
                  value={editForm.video_url}
                  onChange={(e) => setEditForm({ ...editForm, video_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>
            <div>
              <Label>{t('ministryTestimoniesManager', 'tags', 'Tags')}</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder={t('ministryTestimoniesManager', 'addTagPlaceholder', 'Add tag')}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" variant="outline" onClick={addTag}>{t('ministryTestimoniesManager', 'add', 'Add')}</Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {editForm.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                    {tag} ×
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>{t('ministryTestimoniesManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('ministryTestimoniesManager', 'saveChanges', 'Save Changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Actions Modal */}
      <Dialog open={showBulkActionModal} onOpenChange={setShowBulkActionModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ministryTestimoniesManager', 'bulkActionsSelectedCount', 'Bulk Actions ({count} selected)').replace('{count}', String(selectedTestimonies.length))}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button 
              className="w-full justify-start bg-green-600 hover:bg-green-700"
              onClick={handleBulkApprove}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {t('ministryTestimoniesManager', 'approveAllSelected', 'Approve All Selected')}
            </Button>
            <Button 
              className="w-full justify-start bg-red-600 hover:bg-red-700 text-white"
              onClick={handleBulkReject}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('ministryTestimoniesManager', 'rejectAllSelected', 'Reject All Selected')}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkActionModal(false)}>{t('ministryTestimoniesManager', 'cancel', 'Cancel')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analytics Modal */}
      <Dialog open={showAnalyticsModal} onOpenChange={setShowAnalyticsModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('ministryTestimoniesManager', 'testimoniesAnalytics', 'Testimonies Analytics')}</DialogTitle>
          </DialogHeader>
          {analytics && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <Eye className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                      <p className="text-2xl font-bold">{analytics.totalViews.toLocaleString()}</p>
                      <p className="text-sm text-gray-500">{t('ministryTestimoniesManager', 'totalViews', 'Total Views')}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <ThumbsUp className="h-8 w-8 mx-auto text-green-500 mb-2" />
                      <p className="text-2xl font-bold">{analytics.totalLikes.toLocaleString()}</p>
                      <p className="text-sm text-gray-500">{t('ministryTestimoniesManager', 'totalLikes', 'Total Likes')}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <TrendingUp className="h-8 w-8 mx-auto text-purple-500 mb-2" />
                      <p className="text-2xl font-bold">{analytics.avgEngagement.toFixed(0)}</p>
                      <p className="text-sm text-gray-500">{t('ministryTestimoniesManager', 'avgEngagement', 'Avg Engagement')}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('ministryTestimoniesManager', 'categoriesDistribution', 'Categories Distribution')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analytics.categoriesDistribution.map(cat => (
                      <div key={cat.category} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium">{cat.category}</span>
                        <Badge>{t('ministryTestimoniesManager', 'countTestimonies', '{count} testimonies').replace('{count}', String(cat.count))}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {analytics.topTestimony && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Award className="h-5 w-5 text-amber-500" />
                      {t('ministryTestimoniesManager', 'topTestimony', 'Top Testimony')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-semibold mb-2">{analytics.topTestimony.title}</h4>
                      <p className="text-sm text-gray-600 mb-3">{analytics.topTestimony.content.slice(0, 150)}...</p>
                      <div className="flex gap-4 text-sm">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" /> {t('ministryTestimoniesManager', 'countViews', '{count} views').replace('{count}', String(analytics.topTestimony.view_count))}
                        </span>
                        <span className="flex items-center gap-1">
                          <ThumbsUp className="h-3 w-3" /> {t('ministryTestimoniesManager', 'countLikes', '{count} likes').replace('{count}', String(analytics.topTestimony.like_count))}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowAnalyticsModal(false)}>{t('ministryTestimoniesManager', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistryTestimoniesManager;