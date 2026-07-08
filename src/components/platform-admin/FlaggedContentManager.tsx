import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from '../ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Flag, Search, Loader2, CheckCircle, XCircle, Eye,
  RefreshCw, Building2, Calendar, AlertTriangle, Shield,
  MessageSquare, Image, FileText, Video
} from 'lucide-react';

interface FlaggedContent {
  id: string;
  ministry_id: string;
  content_type: string;
  content_id: string;
  content_preview: string;
  reason: string;
  reported_by: string;
  status: string;
  reviewed_by: string;
  reviewed_at: string;
  action_taken: string;
  notes: string;
  created_at: string;
}

interface Ministry {
  id: string;
  name: string;
  theme_color: string;
}

interface FlaggedContentManagerProps {
  onUpdate: () => void;
}

export const FlaggedContentManager: React.FC<FlaggedContentManagerProps> = ({ onUpdate }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [flaggedContent, setFlaggedContent] = useState<FlaggedContent[]>([]);
  const [ministries, setMinistries] = useState<Record<string, Ministry>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('all');
  
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedContent, setSelectedContent] = useState<FlaggedContent | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [contentRes, ministriesRes] = await Promise.all([
        supabase.from('ministry_flagged_content').select('*').order('created_at', { ascending: false }),
        supabase.from('ministry_groups').select('id, name, theme_color')
      ]);

      setFlaggedContent(contentRes.data || []);

      const ministryMap: Record<string, Ministry> = {};
      (ministriesRes.data || []).forEach(m => { ministryMap[m.id] = m; });
      setMinistries(ministryMap);
    } catch (err) {
      console.error('Error loading flagged content:', err);
      toast({ title: t('flaggedContentManager', 'error', 'Error'), description: t('flaggedContentManager', 'loadFailed', 'Failed to load flagged content'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleReview = (content: FlaggedContent) => {
    setSelectedContent(content);
    setReviewNotes(content.notes || '');
    setShowReviewModal(true);
  };

  const handleTakeAction = async (action: 'approve' | 'remove' | 'dismiss') => {
    if (!selectedContent) return;
    setSaving(true);

    try {
      const updates = {
        status: action === 'dismiss' ? 'dismissed' : action === 'approve' ? 'approved' : 'removed',
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        action_taken: action,
        notes: reviewNotes
      };

      await supabase
        .from('ministry_flagged_content')
        .update(updates)
        .eq('id', selectedContent.id);

      // Log audit
      await supabase.from('ministry_audit_logs').insert({
        ministry_id: selectedContent.ministry_id,
        actor_id: user?.id,
        actor_type: 'platform_admin',
        action: `flagged_content_${action}`,
        resource_type: 'flagged_content',
        resource_id: selectedContent.id,
        new_values: updates,
        metadata: { content_type: selectedContent.content_type, reason: selectedContent.reason }
      });

      const actionLabel = action === 'dismiss'
        ? t('flaggedContentManager', 'contentDismissed', 'Content dismissed')
        : action === 'approve'
        ? t('flaggedContentManager', 'contentApproved', 'Content approved')
        : t('flaggedContentManager', 'contentRemoved', 'Content removed');
      toast({ title: t('flaggedContentManager', 'success', 'Success'), description: actionLabel });
      setShowReviewModal(false);
      loadData();
      onUpdate();
    } catch (err: any) {
      toast({ title: t('flaggedContentManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case 'message':
        return <MessageSquare className="h-4 w-4" />;
      case 'image':
        return <Image className="h-4 w-4" />;
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'post':
        return <FileText className="h-4 w-4" />;
      default:
        return <Flag className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-700">{t('flaggedContentManager', 'pendingReview', 'Pending Review')}</Badge>;
      case 'approved':
        return <Badge className="bg-green-100 text-green-700">{t('flaggedContentManager', 'approved', 'Approved')}</Badge>;
      case 'removed':
        return <Badge className="bg-red-100 text-red-700">{t('flaggedContentManager', 'removed', 'Removed')}</Badge>;
      case 'dismissed':
        return <Badge variant="secondary">{t('flaggedContentManager', 'dismissed', 'Dismissed')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getReasonBadge = (reason: string) => {
    const colors: Record<string, string> = {
      'spam': 'bg-gray-100 text-gray-700',
      'harassment': 'bg-red-100 text-red-700',
      'inappropriate': 'bg-orange-100 text-orange-700',
      'misinformation': 'bg-amber-100 text-amber-700',
      'hate_speech': 'bg-red-100 text-red-700',
      'violence': 'bg-red-100 text-red-700',
      'other': 'bg-gray-100 text-gray-700'
    };
    return <Badge className={colors[reason] || colors.other}>{reason.replace('_', ' ')}</Badge>;
  };

  const filteredContent = flaggedContent.filter(content => {
    const ministry = ministries[content.ministry_id];
    const matchesSearch = content.content_preview?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ministry?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      content.reason?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || content.status === statusFilter;
    const matchesType = typeFilter === 'all' || content.content_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const stats = {
    pending: flaggedContent.filter(c => c.status === 'pending').length,
    removed: flaggedContent.filter(c => c.status === 'removed').length,
    approved: flaggedContent.filter(c => c.status === 'approved').length,
    dismissed: flaggedContent.filter(c => c.status === 'dismissed').length
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
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-sm text-amber-600">{t('flaggedContentManager', 'pending', 'Pending')}</p>
                <p className="text-2xl font-bold text-amber-700">{stats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-sm text-red-600">{t('flaggedContentManager', 'removed', 'Removed')}</p>
                <p className="text-2xl font-bold text-red-700">{stats.removed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-green-600">{t('flaggedContentManager', 'approved', 'Approved')}</p>
                <p className="text-2xl font-bold text-green-700">{stats.approved}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600">{t('flaggedContentManager', 'dismissed', 'Dismissed')}</p>
                <p className="text-2xl font-bold text-gray-700">{stats.dismissed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('flaggedContentManager', 'searchPlaceholder', 'Search flagged content...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t('flaggedContentManager', 'status', 'Status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('flaggedContentManager', 'allStatus', 'All Status')}</SelectItem>
                <SelectItem value="pending">{t('flaggedContentManager', 'pending', 'Pending')}</SelectItem>
                <SelectItem value="removed">{t('flaggedContentManager', 'removed', 'Removed')}</SelectItem>
                <SelectItem value="approved">{t('flaggedContentManager', 'approved', 'Approved')}</SelectItem>
                <SelectItem value="dismissed">{t('flaggedContentManager', 'dismissed', 'Dismissed')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t('flaggedContentManager', 'type', 'Type')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('flaggedContentManager', 'allTypes', 'All Types')}</SelectItem>
                <SelectItem value="message">{t('flaggedContentManager', 'message', 'Message')}</SelectItem>
                <SelectItem value="post">{t('flaggedContentManager', 'post', 'Post')}</SelectItem>
                <SelectItem value="image">{t('flaggedContentManager', 'image', 'Image')}</SelectItem>
                <SelectItem value="video">{t('flaggedContentManager', 'video', 'Video')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('flaggedContentManager', 'refresh', 'Refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Content List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            {t('flaggedContentManager', 'flaggedContentTitle', 'Flagged Content ({count})').replace('{count}', String(filteredContent.length))}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredContent.length === 0 ? (
            <div className="text-center py-12">
              <Flag className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">{t('flaggedContentManager', 'noFlaggedContent', 'No flagged content found')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredContent.map(content => {
                const ministry = ministries[content.ministry_id];
                return (
                  <div key={content.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getContentTypeIcon(content.content_type)}
                          <Badge variant="outline">{content.content_type}</Badge>
                          {getReasonBadge(content.reason)}
                          {getStatusBadge(content.status)}
                        </div>
                        <p className="text-gray-700 line-clamp-2 mb-2">
                          {content.content_preview || t('flaggedContentManager', 'noPreview', 'No preview available')}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {ministry?.name || t('flaggedContentManager', 'unknownMinistry', 'Unknown Ministry')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(content.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      {content.status === 'pending' && (
                        <Button size="sm" onClick={() => handleReview(content)}>
                          <Eye className="h-4 w-4 mr-1" />
                          {t('flaggedContentManager', 'review', 'Review')}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Modal */}
      <Dialog open={showReviewModal} onOpenChange={setShowReviewModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('flaggedContentManager', 'reviewFlaggedContent', 'Review Flagged Content')}</DialogTitle>
          </DialogHeader>
          {selectedContent && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {getContentTypeIcon(selectedContent.content_type)}
                <Badge variant="outline">{selectedContent.content_type}</Badge>
                {getReasonBadge(selectedContent.reason)}
              </div>

              <div>
                <Label className="text-gray-500">{t('flaggedContentManager', 'contentPreview', 'Content Preview')}</Label>
                <div className="p-3 bg-gray-100 rounded-lg mt-1">
                  <p className="text-gray-700">{selectedContent.content_preview || t('flaggedContentManager', 'noPreview', 'No preview available')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500">{t('flaggedContentManager', 'ministry', 'Ministry')}</Label>
                  <p className="font-medium">{ministries[selectedContent.ministry_id]?.name || t('flaggedContentManager', 'unknown', 'Unknown')}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('flaggedContentManager', 'reported', 'Reported')}</Label>
                  <p className="font-medium">{new Date(selectedContent.created_at).toLocaleString()}</p>
                </div>
              </div>

              <div>
                <Label>{t('flaggedContentManager', 'reviewNotes', 'Review Notes')}</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder={t('flaggedContentManager', 'notesPlaceholder', 'Add notes about your decision...')}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowReviewModal(false)}>{t('flaggedContentManager', 'cancel', 'Cancel')}</Button>
            <Button 
              variant="outline" 
              onClick={() => handleTakeAction('dismiss')}
              disabled={saving}
            >
              {t('flaggedContentManager', 'dismissReport', 'Dismiss Report')}
            </Button>
            <Button 
              className="bg-green-600 hover:bg-green-700"
              onClick={() => handleTakeAction('approve')}
              disabled={saving}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              {t('flaggedContentManager', 'approveContent', 'Approve Content')}
            </Button>
            <Button 
              variant="destructive"
              onClick={() => handleTakeAction('remove')}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
              {t('flaggedContentManager', 'removeContent', 'Remove Content')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FlaggedContentManager;
