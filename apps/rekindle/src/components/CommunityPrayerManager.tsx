import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { 
  Heart, 
  MessageSquare, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  User,
  Calendar,
  TrendingUp,
  Flag
} from 'lucide-react';

interface PrayerPost {
  id: string;
  user_id: string;
  user_name: string;
  title: string;
  content: string;
  category: string;
  is_anonymous: boolean;
  is_answered: boolean;
  is_featured: boolean;
  is_hidden: boolean;
  prayer_count: number;
  created_at: string;
  updated_at?: string;
}

interface CommunityPrayerManagerProps {
  posts: PrayerPost[];
  onUpdate: () => void;
}

export const CommunityPrayerManager: React.FC<CommunityPrayerManagerProps> = ({ posts, onUpdate }) => {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedPost, setSelectedPost] = useState<PrayerPost | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [editForm, setEditForm] = useState({
    title: '',
    content: '',
    category: '',
    is_featured: false,
    is_hidden: false,
    is_answered: false
  });

  // Stats
  const stats = {
    total: posts.length,
    answered: posts.filter(p => p.is_answered).length,
    featured: posts.filter(p => p.is_featured).length,
    hidden: posts.filter(p => p.is_hidden).length,
    totalPrayers: posts.reduce((sum, p) => sum + (p.prayer_count || 0), 0)
  };

  const categories = [
    { value: 'all', label: t('communityPrayerManager', 'allCategories', 'All Categories') },
    { value: 'healing', label: t('communityPrayerManager', 'healing', 'Healing') },
    { value: 'family', label: t('communityPrayerManager', 'family', 'Family') },
    { value: 'guidance', label: t('communityPrayerManager', 'guidance', 'Guidance') },
    { value: 'gratitude', label: t('communityPrayerManager', 'gratitude', 'Gratitude') },
    { value: 'general', label: t('communityPrayerManager', 'general', 'General') }
  ];

  const categoryColors: Record<string, string> = {
    healing: 'bg-green-100 text-green-700 border-green-300',
    family: 'bg-pink-100 text-pink-700 border-pink-300',
    guidance: 'bg-blue-100 text-blue-700 border-blue-300',
    gratitude: 'bg-amber-100 text-amber-700 border-amber-300',
    general: 'bg-gray-100 text-gray-700 border-gray-300'
  };

  // Filter posts
  const filteredPosts = posts.filter(post => {
    const matchesSearch = 
      post.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.user_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = filterCategory === 'all' || post.category === filterCategory;
    
    const matchesStatus = 
      filterStatus === 'all' ||
      (filterStatus === 'answered' && post.is_answered) ||
      (filterStatus === 'unanswered' && !post.is_answered) ||
      (filterStatus === 'featured' && post.is_featured) ||
      (filterStatus === 'hidden' && post.is_hidden);
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Load responses for a post
  const loadResponses = async (postId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('prayer_wall_responses')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setResponses(data || []);
    } catch (err: any) {
      toast({ title: t('communityPrayerManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Open details modal
  const handleViewDetails = async (post: PrayerPost) => {
    setSelectedPost(post);
    setShowDetailsModal(true);
    await loadResponses(post.id);
  };

  // Open edit modal
  const handleEdit = (post: PrayerPost) => {
    setSelectedPost(post);
    setEditForm({
      title: post.title,
      content: post.content,
      category: post.category,
      is_featured: post.is_featured || false,
      is_hidden: post.is_hidden || false,
      is_answered: post.is_answered || false
    });
    setShowEditModal(true);
  };

  // Save edited post
  const handleSave = async () => {
    if (!selectedPost) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('prayer_wall_posts')
        .update({
          title: editForm.title,
          content: editForm.content,
          category: editForm.category,
          is_featured: editForm.is_featured,
          is_hidden: editForm.is_hidden,
          is_answered: editForm.is_answered,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedPost.id);
      
      if (error) throw error;
      
      toast({ title: t('communityPrayerManager', 'success', 'Success'), description: t('communityPrayerManager', 'requestUpdated', 'Prayer request updated successfully') });
      setShowEditModal(false);
      onUpdate();
    } catch (err: any) {
      toast({ title: t('communityPrayerManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Delete post
  // Delete post
const handleDelete = async (postId: string) => {
  if (!confirm(t('communityPrayerManager', 'confirmDelete', 'Are you sure you want to delete this prayer request? This action cannot be undone.'))) {
    return;
  }
  
  setLoading(true);
  console.log('🗑️ Attempting to delete post:', postId);
  
  try {
    // First delete all responses
    const { error: responseError, data: responseData } = await supabase
      .from('prayer_wall_responses')
      .delete()
      .eq('post_id', postId);
    
    if (responseError) {
      console.error('❌ Error deleting responses:', responseError);
      throw responseError;
    }
    console.log('✅ Deleted responses:', responseData);
    
    // Then delete the post
    const { error: postError, data: postData } = await supabase
      .from('prayer_wall_posts')
      .delete()
      .eq('id', postId);
    
    if (postError) {
      console.error('❌ Error deleting post:', postError);
      throw postError;
    }
    console.log('✅ Post deleted successfully:', postData);
    
    toast({ title: t('communityPrayerManager', 'success', 'Success'), description: t('communityPrayerManager', 'requestDeleted', 'Prayer request deleted successfully') });
    
    // Force immediate update
    console.log('🔄 Calling onUpdate...');
    onUpdate();
    
    // Close modal if open
    if (selectedPost?.id === postId) {
      setShowDetailsModal(false);
      setSelectedPost(null);
    }
  } catch (err: any) {
    console.error('💥 Delete error:', err);
    toast({ title: 'Error', description: err.message, variant: 'destructive' });
  } finally {
    setLoading(false);
  }
};

  // Quick actions
  const toggleFeatured = async (post: PrayerPost) => {
    try {
      const { error } = await supabase
        .from('prayer_wall_posts')
        .update({ is_featured: !post.is_featured })
        .eq('id', post.id);
      
      if (error) throw error;
      
      toast({
        title: t('communityPrayerManager', 'success', 'Success'),
        description: !post.is_featured
          ? t('communityPrayerManager', 'requestFeatured', 'Prayer request featured')
          : t('communityPrayerManager', 'requestUnfeatured', 'Prayer request unfeatured')
      });
      onUpdate();
    } catch (err: any) {
      toast({ title: t('communityPrayerManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const toggleHidden = async (post: PrayerPost) => {
    try {
      const { error } = await supabase
        .from('prayer_wall_posts')
        .update({ is_hidden: !post.is_hidden })
        .eq('id', post.id);
      
      if (error) throw error;
      
      toast({
        title: t('communityPrayerManager', 'success', 'Success'),
        description: !post.is_hidden
          ? t('communityPrayerManager', 'requestHidden', 'Prayer request hidden')
          : t('communityPrayerManager', 'requestVisible', 'Prayer request visible')
      });
      onUpdate();
    } catch (err: any) {
      toast({ title: t('communityPrayerManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const markAnswered = async (post: PrayerPost) => {
    try {
      const { error } = await supabase
        .from('prayer_wall_posts')
        .update({ is_answered: !post.is_answered })
        .eq('id', post.id);
      
      if (error) throw error;
      
      toast({
        title: t('communityPrayerManager', 'success', 'Success'),
        description: !post.is_answered
          ? t('communityPrayerManager', 'requestMarkedAnswered', 'Prayer request marked as answered')
          : t('communityPrayerManager', 'requestMarkedUnanswered', 'Prayer request marked as unanswered')
      });
      onUpdate();
    } catch (err: any) {
      toast({ title: t('communityPrayerManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <MessageSquare className="h-6 w-6 mx-auto mb-2 text-purple-500" />
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-gray-500">{t('communityPrayerManager', 'totalRequests', 'Total Requests')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-500" />
            <p className="text-2xl font-bold">{stats.answered}</p>
            <p className="text-xs text-gray-500">{t('communityPrayerManager', 'answered', 'Answered')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-6 w-6 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold">{stats.featured}</p>
            <p className="text-xs text-gray-500">{t('communityPrayerManager', 'featured', 'Featured')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <EyeOff className="h-6 w-6 mx-auto mb-2 text-gray-500" />
            <p className="text-2xl font-bold">{stats.hidden}</p>
            <p className="text-xs text-gray-500">{t('communityPrayerManager', 'hidden', 'Hidden')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Heart className="h-6 w-6 mx-auto mb-2 text-red-500" />
            <p className="text-2xl font-bold">{stats.totalPrayers}</p>
            <p className="text-xs text-gray-500">{t('communityPrayerManager', 'totalPrayers', 'Total Prayers')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t('communityPrayerManager', 'prayerWallManagement', 'Prayer Wall Management')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input 
                placeholder={t('communityPrayerManager', 'searchPlaceholder', 'Search by title, content, or user...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger>
                <SelectValue placeholder={t('communityPrayerManager', 'filterByCategory', 'Filter by category')} />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder={t('communityPrayerManager', 'filterByStatus', 'Filter by status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('communityPrayerManager', 'allStatus', 'All Status')}</SelectItem>
                <SelectItem value="answered">{t('communityPrayerManager', 'answered', 'Answered')}</SelectItem>
                <SelectItem value="unanswered">{t('communityPrayerManager', 'unanswered', 'Unanswered')}</SelectItem>
                <SelectItem value="featured">{t('communityPrayerManager', 'featured', 'Featured')}</SelectItem>
                <SelectItem value="hidden">{t('communityPrayerManager', 'hidden', 'Hidden')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Posts List */}
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {t('communityPrayerManager', 'showingCount', 'Showing {count} of {total} prayer requests')
            .replace('{count}', String(filteredPosts.length))
            .replace('{total}', String(posts.length))}
        </p>
        
        {filteredPosts.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>{t('communityPrayerManager', 'noRequestsFound', 'No prayer requests found')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredPosts.map(post => (
              <Card 
                key={post.id} 
                className={`${post.is_answered ? 'border-green-300 bg-green-50' : ''} ${post.is_hidden ? 'opacity-60' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                        <User className="h-5 w-5 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm">{post.user_name}</p>
                          {post.is_anonymous && (
                            <Badge variant="secondary" className="text-xs">{t('communityPrayerManager', 'anonymous', 'Anonymous')}</Badge>
                          )}
                          {post.is_featured && (
                            <Badge className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300">
                              <TrendingUp className="h-3 w-3 mr-1" />
                              {t('communityPrayerManager', 'featured', 'Featured')}
                            </Badge>
                          )}
                          {post.is_hidden && (
                            <Badge variant="secondary" className="text-xs">
                              <EyeOff className="h-3 w-3 mr-1" />
                              {t('communityPrayerManager', 'hidden', 'Hidden')}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                          <Calendar className="h-3 w-3" />
                          {new Date(post.created_at).toLocaleString()}
                          <span className={`px-2 py-0.5 rounded text-xs ${categoryColors[post.category]}`}>
                            {post.category}
                          </span>
                        </div>
                        <h3 className="font-bold text-base mb-1">{post.title}</h3>
                        <p className="text-sm text-gray-600 line-clamp-2">{post.content}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-3 border-t">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Heart className="h-4 w-4 text-red-500" />
                        <span>{t('communityPrayerManager', 'prayersCount', '{count} prayers').replace('{count}', String(post.prayer_count || 0))}</span>
                      </div>
                      {post.is_answered && (
                        <Badge variant="outline" className="text-green-600 border-green-300">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {t('communityPrayerManager', 'answered', 'Answered')}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleViewDetails(post)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        {t('communityPrayerManager', 'details', 'Details')}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => toggleFeatured(post)}
                        className={post.is_featured ? 'bg-yellow-50' : ''}
                      >
                        <Flag className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => toggleHidden(post)}
                        className={post.is_hidden ? 'bg-gray-100' : ''}
                      >
                        {post.is_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => markAnswered(post)}
                        className={post.is_answered ? 'bg-green-50' : ''}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleEdit(post)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleDelete(post.id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('communityPrayerManager', 'editPrayerRequest', 'Edit Prayer Request')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('communityPrayerManager', 'title', 'Title')}</Label>
              <Input 
                value={editForm.title}
                onChange={(e) => setEditForm({...editForm, title: e.target.value})}
              />
            </div>
            <div>
              <Label>{t('communityPrayerManager', 'content', 'Content')}</Label>
              <Textarea 
                value={editForm.content}
                onChange={(e) => setEditForm({...editForm, content: e.target.value})}
                rows={6}
              />
            </div>
            <div>
              <Label>{t('communityPrayerManager', 'category', 'Category')}</Label>
              <Select value={editForm.category} onValueChange={(value) => setEditForm({...editForm, category: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="healing">{t('communityPrayerManager', 'healing', 'Healing')}</SelectItem>
                  <SelectItem value="family">{t('communityPrayerManager', 'family', 'Family')}</SelectItem>
                  <SelectItem value="guidance">{t('communityPrayerManager', 'guidance', 'Guidance')}</SelectItem>
                  <SelectItem value="gratitude">{t('communityPrayerManager', 'gratitude', 'Gratitude')}</SelectItem>
                  <SelectItem value="general">{t('communityPrayerManager', 'general', 'General')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center justify-between">
                <Label>{t('communityPrayerManager', 'featured', 'Featured')}</Label>
                <Switch 
                  checked={editForm.is_featured}
                  onCheckedChange={(checked) => setEditForm({...editForm, is_featured: checked})}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>{t('communityPrayerManager', 'hidden', 'Hidden')}</Label>
                <Switch 
                  checked={editForm.is_hidden}
                  onCheckedChange={(checked) => setEditForm({...editForm, is_hidden: checked})}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>{t('communityPrayerManager', 'answered', 'Answered')}</Label>
                <Switch 
                  checked={editForm.is_answered}
                  onCheckedChange={(checked) => setEditForm({...editForm, is_answered: checked})}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              {t('communityPrayerManager', 'cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? t('communityPrayerManager', 'saving', 'Saving...') : t('communityPrayerManager', 'saveChanges', 'Save Changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('communityPrayerManager', 'prayerRequestDetails', 'Prayer Request Details')}</DialogTitle>
          </DialogHeader>
          {selectedPost && (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={selectedPost.is_anonymous ? 'secondary' : 'outline'}>
                    {selectedPost.user_name}
                  </Badge>
                  <span className={`px-2 py-1 rounded text-xs ${categoryColors[selectedPost.category]}`}>
                    {selectedPost.category}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(selectedPost.created_at).toLocaleString()}
                  </span>
                </div>
                <h3 className="text-xl font-bold">{selectedPost.title}</h3>
                <p className="text-gray-700">{selectedPost.content}</p>
              </div>

              <div className="grid grid-cols-3 gap-4 py-4 border-y">
                <div className="text-center">
                  <Heart className="h-6 w-6 mx-auto mb-1 text-red-500" />
                  <p className="font-bold">{selectedPost.prayer_count || 0}</p>
                  <p className="text-xs text-gray-500">{t('communityPrayerManager', 'prayers', 'Prayers')}</p>
                </div>
                <div className="text-center">
                  <MessageSquare className="h-6 w-6 mx-auto mb-1 text-blue-500" />
                  <p className="font-bold">{responses.length}</p>
                  <p className="text-xs text-gray-500">{t('communityPrayerManager', 'responses', 'Responses')}</p>
                </div>
                <div className="text-center">
                  {selectedPost.is_answered ? (
                    <CheckCircle className="h-6 w-6 mx-auto mb-1 text-green-500" />
                  ) : (
                    <XCircle className="h-6 w-6 mx-auto mb-1 text-gray-400" />
                  )}
                  <p className="font-bold">{selectedPost.is_answered ? t('communityPrayerManager', 'yes', 'Yes') : t('communityPrayerManager', 'no', 'No')}</p>
                  <p className="text-xs text-gray-500">{t('communityPrayerManager', 'answered', 'Answered')}</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">{t('communityPrayerManager', 'prayerResponsesCount', 'Prayer Responses ({count})').replace('{count}', String(responses.length))}</h4>
                {loading ? (
                  <p className="text-center text-gray-500 py-4">{t('communityPrayerManager', 'loadingResponses', 'Loading responses...')}</p>
                ) : responses.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">{t('communityPrayerManager', 'noResponsesYet', 'No responses yet')}</p>
                ) : (
                  <div className="space-y-3">
                    {responses.map(response => (
                      <Card key={response.id}>
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <User className="h-4 w-4 text-gray-400" />
                            <span className="font-medium text-sm">{response.user_name}</span>
                            <span className="text-xs text-gray-500">
                              {new Date(response.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{t('communityPrayerManager', 'prayedForThisRequest', 'Prayed for this request')}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsModal(false)}>
              {t('communityPrayerManager', 'close', 'Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CommunityPrayerManager;