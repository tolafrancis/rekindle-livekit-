import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Users, Plus, Edit, Trash2, Search, RefreshCw, CheckCircle, XCircle,
  Star, Calendar, Clock, Loader2, Upload, UserCheck, Phone, Mail,
  FileText, Eye, AlertCircle, ClipboardList, ThumbsUp, ThumbsDown,
  ExternalLink, MessageSquare, History, Award, EyeOff, Flag,
  Filter, BarChart3, TrendingUp
} from 'lucide-react';

interface Counsellor {
  id: string;
  user_id?: string;
  full_name: string;
  title?: string;
  bio?: string;
  specialization: string[];
  profile_image_url?: string;
  email?: string;
  phone?: string;
  hourly_rate?: number;
  is_active: boolean;
  is_verified: boolean;
  rating: number;
  total_sessions: number;
  languages: string[];
  availability?: Record<string, boolean>;
  created_at: string;
  updated_at?: string;
}

interface CounsellingSession {
  id: string;
  counsellor_id: string;
  user_id: string;
  user_name?: string;
  scheduled_at: string;
  duration: number;
  topic?: string;
  notes?: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  created_at: string;
  counsellor?: Counsellor;
}

interface CounsellorApplication {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone?: string;
  bio: string;
  testimony?: string;
  specializations: string[];
  ministry_affiliation?: string;
  church_name?: string;
  years_of_experience: number;
  certification_urls: string[];
  languages: string[];
  status: 'pending' | 'approved' | 'rejected' | 'under_review';
  admin_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at?: string;
}

interface UserActivity {
  id: string;
  action_type: string;
  description: string;
  created_at: string;
}

interface CounsellorReview {
  id: string;
  session_id: string;
  counsellor_id: string;
  user_id: string;
  user_name?: string;
  rating: number;
  review_text?: string;
  is_anonymous: boolean;
  is_visible: boolean;
  created_at: string;
  updated_at?: string;
  counsellor?: Counsellor;
  session?: CounsellingSession;
}

const SPECIALIZATIONS = [
  'Discipleship', 'Prayer', 'Counseling', 'Youth', 'Leadership',
  'Healing', 'Deliverance', 'Marriage', 'Family', 'Women\'s Ministry',
  'Men\'s Ministry', 'Evangelism', 'Worship', 'Intercession', 'Teaching',
  'Mentorship', 'Recovery', 'Grief Support', 'Career Guidance', 'Spiritual Growth'
];

const LANGUAGES = [
  'English', 'Spanish', 'French', 'Mandarin', 'Korean', 'Vietnamese',
  'Portuguese', 'Yoruba', 'Swahili', 'Arabic', 'Hindi', 'German'
];

export const AdminCounsellorManager: React.FC = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('applications');
  const [counsellors, setCounsellors] = useState<Counsellor[]>([]);
  const [sessions, setSessions] = useState<CounsellingSession[]>([]);
  const [applications, setApplications] = useState<CounsellorApplication[]>([]);
  const [reviews, setReviews] = useState<CounsellorReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [counsellorFilter, setCounsellorFilter] = useState<string>('all');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showReviewDetailModal, setShowReviewDetailModal] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<CounsellorApplication | null>(null);
  const [selectedReview, setSelectedReview] = useState<CounsellorReview | null>(null);
  const [userActivity, setUserActivity] = useState<UserActivity[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewAdminNotes, setReviewAdminNotes] = useState('');
  const [editingCounsellor, setEditingCounsellor] = useState<Counsellor | null>(null);
  const [formData, setFormData] = useState<Partial<Counsellor>>({
    full_name: '',
    title: '',
    bio: '',
    specialization: [],
    profile_image_url: '',
    email: '',
    phone: '',
    hourly_rate: undefined,
    is_active: true,
    is_verified: false,
    languages: ['English']
  });

  const isMounted = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    isMounted.current = true;
    loadData();
    return () => {
      isMounted.current = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [counsellorsRes, sessionsRes, applicationsRes, reviewsRes] = await Promise.all([
        supabase
          .from('counsellors')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('counselling_sessions')
          .select('*, counsellor:counsellors(*)')
          .order('scheduled_at', { ascending: false })
          .limit(100),
        supabase
          .from('counsellor_applications')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('counsellor_reviews')
          .select('*, counsellor:counsellors(*), session:counselling_sessions(*)')
          .order('created_at', { ascending: false })
      ]);

      if (isMounted.current) {
        setCounsellors(counsellorsRes.data || []);
        setSessions(sessionsRes.data || []);
        setApplications(applicationsRes.data || []);
        setReviews(reviewsRes.data || []);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      toast({ title: t('adminCounsellorManager', 'error', 'Error'), description: t('adminCounsellorManager', 'failedLoadData', 'Failed to load data'), variant: 'destructive' });
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  const loadUserActivity = async (userId: string) => {
    setLoadingActivity(true);
    try {
      const { data } = await supabase
        .from('user_activity_log')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      
      setUserActivity(data || []);
    } catch (err) {
      console.error('Failed to load user activity:', err);
    } finally {
      setLoadingActivity(false);
    }
  };

  const handleOpenReview = async (application: CounsellorApplication) => {
    setSelectedApplication(application);
    setAdminNotes(application.admin_notes || '');
    setRejectionReason(application.rejection_reason || '');
    setShowReviewModal(true);
    
    // Mark as under review if pending
    if (application.status === 'pending') {
      await supabase
        .from('counsellor_applications')
        .update({ status: 'under_review', updated_at: new Date().toISOString() })
        .eq('id', application.id);
      
      loadData();
    }
    
    // Load user activity
    loadUserActivity(application.user_id);
  };

  const handleOpenReviewDetail = (review: CounsellorReview) => {
    setSelectedReview(review);
    setReviewAdminNotes('');
    setShowReviewDetailModal(true);
  };

  const handleToggleReviewVisibility = async (reviewId: string, currentVisibility: boolean) => {
    try {
      const { error } = await supabase
        .from('counsellor_reviews')
        .update({ 
          is_visible: !currentVisibility,
          updated_at: new Date().toISOString()
        })
        .eq('id', reviewId);

      if (error) throw error;

      toast({
        title: t('adminCounsellorManager', 'success', 'Success'),
        description: currentVisibility
          ? t('adminCounsellorManager', 'reviewHiddenSuccess', 'Review hidden successfully')
          : t('adminCounsellorManager', 'reviewShownSuccess', 'Review shown successfully')
      });
      loadData();
    } catch (err: any) {
      toast({ title: t('adminCounsellorManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!confirm(t('adminCounsellorManager', 'confirmDeleteReview', 'Are you sure you want to permanently delete this review?'))) return;

    try {
      const { error } = await supabase
        .from('counsellor_reviews')
        .delete()
        .eq('id', reviewId);

      if (error) throw error;

      toast({ title: t('adminCounsellorManager', 'success', 'Success'), description: t('adminCounsellorManager', 'reviewDeletedSuccess', 'Review deleted successfully') });
      loadData();
      setShowReviewDetailModal(false);
    } catch (err: any) {
      toast({ title: t('adminCounsellorManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleApproveApplication = async () => {
    if (!selectedApplication) return;
    
    setSaving(true);
    try {
      // OPTION 1: Try using database function (if created)
      // This bypasses RLS issues by using SECURITY DEFINER
      try {
        const { data, error: rpcError } = await supabase.rpc('approve_counsellor_application', {
          application_id: selectedApplication.id,
          p_admin_notes: adminNotes
        });

        if (rpcError) {
          // If function doesn't exist, fall back to direct insert
          if (rpcError.code === '42883') {
            console.log('Database function not found, using direct insert method');
            throw rpcError;
          } else {
            throw rpcError;
          }
        }

        toast({
          title: t('adminCounsellorManager', 'applicationApproved', 'Application Approved'),
          description: t('adminCounsellorManager', 'nowVerifiedCounsellor', '{name} is now a verified counsellor.').replace('{name}', String(selectedApplication.full_name))
        });

        setShowReviewModal(false);
        setSelectedApplication(null);
        loadData();
        return;
      } catch (rpcError: any) {
        // Continue to fallback method if RPC fails
        console.log('Falling back to direct insert method');
      }

      // OPTION 2: Direct insert (requires proper RLS policies)
      // Check if counsellor already exists for this user
      const { data: existingCounsellor } = await supabase
        .from('counsellors')
        .select('id')
        .eq('user_id', selectedApplication.user_id)
        .maybeSingle();

      if (existingCounsellor) {
        toast({
          title: t('adminCounsellorManager', 'error', 'Error'),
          description: t('adminCounsellorManager', 'duplicateCounsellorProfile', 'This user already has a counsellor profile. Cannot approve duplicate application.'),
          variant: 'destructive'
        });
        setSaving(false);
        return;
      }

      // Create counsellor profile
      const { data: newCounsellor, error: counsellorError } = await supabase
        .from('counsellors')
        .insert({
          user_id: selectedApplication.user_id,
          full_name: selectedApplication.full_name,
          email: selectedApplication.email,
          phone: selectedApplication.phone,
          bio: selectedApplication.bio,
          specialization: selectedApplication.specializations,
          languages: selectedApplication.languages,
          is_active: true,
          is_verified: true,
          rating: 0,
          total_sessions: 0,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (counsellorError) {
        // Provide more helpful error message for RLS violations
        if (counsellorError.code === '42501') {
          throw new Error(
            'Permission denied: Unable to create counsellor profile. ' +
            'This is likely due to Row-Level Security policies. ' +
            'Please ensure:\n' +
            '1. You have admin privileges\n' +
            '2. RLS policies allow admins to insert into counsellors table\n' +
            '3. Or create the database function: approve_counsellor_application()\n\n' +
            'Technical details: ' + counsellorError.message
          );
        }
        throw counsellorError;
      }

      // Update application status
      const { error: appError } = await supabase
        .from('counsellor_applications')
        .update({
          status: 'approved',
          admin_notes: adminNotes,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedApplication.id);

      if (appError) throw appError;

      // Update user profile if table exists
      await supabase
        .from('user_profiles')
        .update({
          is_counsellor: true,
          counsellor_id: newCounsellor.id
        })
        .eq('user_id', selectedApplication.user_id);

      toast({
        title: t('adminCounsellorManager', 'applicationApproved', 'Application Approved'),
        description: t('adminCounsellorManager', 'nowVerifiedCounsellor', '{name} is now a verified counsellor.').replace('{name}', String(selectedApplication.full_name))
      });

      setShowReviewModal(false);
      setSelectedApplication(null);
      loadData();
    } catch (err: any) {
      console.error('Approval error:', err);
      
      // Enhanced error display
      const errorMessage = err.message || t('adminCounsellorManager', 'failedApproveApplication', 'Failed to approve application');
      const errorDetails = err.details || err.hint || '';

      toast({
        title: t('adminCounsellorManager', 'errorApprovingApplication', 'Error Approving Application'),
        description: (
          <div className="space-y-2">
            <p>{errorMessage}</p>
            {errorDetails && <p className="text-xs opacity-75">{errorDetails}</p>}
          </div>
        ),
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRejectApplication = async () => {
    if (!selectedApplication) return;
    if (!rejectionReason.trim()) {
      toast({
        title: t('adminCounsellorManager', 'rejectionReasonRequired', 'Rejection Reason Required'),
        description: t('adminCounsellorManager', 'provideRejectionReason', 'Please provide a reason for rejecting this application.'),
        variant: 'destructive'
      });
      return;
    }
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('counsellor_applications')
        .update({
          status: 'rejected',
          admin_notes: adminNotes,
          rejection_reason: rejectionReason,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedApplication.id);

      if (error) throw error;

      toast({
        title: t('adminCounsellorManager', 'applicationRejected', 'Application Rejected'),
        description: t('adminCounsellorManager', 'applicantWillBeNotified', 'The applicant will be notified of the decision.')
      });

      setShowReviewModal(false);
      setSelectedApplication(null);
      loadData();
    } catch (err: any) {
      toast({
        title: t('adminCounsellorManager', 'error', 'Error'),
        description: err.message || t('adminCounsellorManager', 'failedRejectApplication', 'Failed to reject application'),
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = () => {
    setEditingCounsellor(null);
    setFormData({
      full_name: '',
      title: '',
      bio: '',
      specialization: [],
      profile_image_url: '',
      email: '',
      phone: '',
      hourly_rate: undefined,
      is_active: true,
      is_verified: false,
      languages: ['English']
    });
    setShowModal(true);
  };

  const handleEdit = (counsellor: Counsellor) => {
    setEditingCounsellor(counsellor);
    setFormData({
      full_name: counsellor.full_name,
      title: counsellor.title || '',
      bio: counsellor.bio || '',
      specialization: counsellor.specialization || [],
      profile_image_url: counsellor.profile_image_url || '',
      email: counsellor.email || '',
      phone: counsellor.phone || '',
      hourly_rate: counsellor.hourly_rate,
      is_active: counsellor.is_active,
      is_verified: counsellor.is_verified,
      languages: counsellor.languages || ['English']
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('adminCounsellorManager', 'confirmDeleteCounsellor', 'Are you sure you want to delete this counsellor?'))) return;

    try {
      const { error } = await supabase.from('counsellors').delete().eq('id', id);
      if (error) throw error;

      toast({ title: t('adminCounsellorManager', 'success', 'Success'), description: t('adminCounsellorManager', 'counsellorDeletedSuccess', 'Counsellor deleted successfully') });
      loadData();
    } catch (err: any) {
      toast({ title: t('adminCounsellorManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleActive = async (counsellor: Counsellor) => {
    try {
      const { error } = await supabase
        .from('counsellors')
        .update({ is_active: !counsellor.is_active, updated_at: new Date().toISOString() })
        .eq('id', counsellor.id);
      
      if (error) throw error;
      
      toast({
        title: t('adminCounsellorManager', 'success', 'Success'),
        description: counsellor.is_active
          ? t('adminCounsellorManager', 'counsellorDeactivatedSuccess', 'Counsellor deactivated successfully')
          : t('adminCounsellorManager', 'counsellorActivatedSuccess', 'Counsellor activated successfully')
      });
      loadData();
    } catch (err: any) {
      toast({ title: t('adminCounsellorManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleVerified = async (counsellor: Counsellor) => {
    try {
      const { error } = await supabase
        .from('counsellors')
        .update({ is_verified: !counsellor.is_verified, updated_at: new Date().toISOString() })
        .eq('id', counsellor.id);
      
      if (error) throw error;
      
      toast({
        title: t('adminCounsellorManager', 'success', 'Success'),
        description: counsellor.is_verified
          ? t('adminCounsellorManager', 'counsellorUnverifiedSuccess', 'Counsellor unverified successfully')
          : t('adminCounsellorManager', 'counsellorVerifiedSuccess', 'Counsellor verified successfully')
      });
      loadData();
    } catch (err: any) {
      toast({ title: t('adminCounsellorManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (!formData.full_name?.trim()) {
      toast({ title: t('adminCounsellorManager', 'error', 'Error'), description: t('adminCounsellorManager', 'fullNameRequired', 'Full name is required'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        full_name: formData.full_name,
        title: formData.title || null,
        bio: formData.bio || null,
        specialization: formData.specialization || [],
        profile_image_url: formData.profile_image_url || null,
        email: formData.email || null,
        phone: formData.phone || null,
        hourly_rate: formData.hourly_rate || null,
        is_active: formData.is_active ?? true,
        is_verified: formData.is_verified ?? false,
        languages: formData.languages || ['English'],
        updated_at: new Date().toISOString()
      };

      if (editingCounsellor) {
        const { error } = await supabase
          .from('counsellors')
          .update(dataToSave)
          .eq('id', editingCounsellor.id);
        
        if (error) throw error;
        toast({ title: t('adminCounsellorManager', 'success', 'Success'), description: t('adminCounsellorManager', 'counsellorUpdatedSuccess', 'Counsellor updated successfully') });
      } else {
        const { error } = await supabase
          .from('counsellors')
          .insert({ ...dataToSave, rating: 0, total_sessions: 0, created_at: new Date().toISOString() });
        
        if (error) throw error;
        toast({ title: t('adminCounsellorManager', 'success', 'Success'), description: t('adminCounsellorManager', 'counsellorCreatedSuccess', 'Counsellor created successfully') });
      }

      setShowModal(false);
      loadData();
    } catch (err: any) {
      toast({ title: t('adminCounsellorManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileName = `counsellors/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const { data, error } = await supabase.storage
        .from('admin-content')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('admin-content')
        .getPublicUrl(fileName);

      setFormData({ ...formData, profile_image_url: urlData.publicUrl });
      toast({ title: t('adminCounsellorManager', 'success', 'Success'), description: t('adminCounsellorManager', 'imageUploadedSuccess', 'Image uploaded successfully') });
    } catch (err: any) {
      toast({ title: t('adminCounsellorManager', 'uploadError', 'Upload Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleUpdateSessionStatus = async (sessionId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('counselling_sessions')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', sessionId);
      
      if (error) throw error;
      
      toast({ title: t('adminCounsellorManager', 'success', 'Success'), description: t('adminCounsellorManager', 'sessionStatusUpdated', 'Session {status}').replace('{status}', String(status)) });
      loadData();
    } catch (err: any) {
      toast({ title: t('adminCounsellorManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const toggleSpecialization = (spec: string) => {
    const current = formData.specialization || [];
    if (current.includes(spec)) {
      setFormData({ ...formData, specialization: current.filter(s => s !== spec) });
    } else {
      setFormData({ ...formData, specialization: [...current, spec] });
    }
  };

  const toggleLanguage = (lang: string) => {
    const current = formData.languages || [];
    if (current.includes(lang)) {
      setFormData({ ...formData, languages: current.filter(l => l !== lang) });
    } else {
      setFormData({ ...formData, languages: [...current, lang] });
    }
  };

  const filteredCounsellors = counsellors.filter(c => 
    c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.specialization?.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredApplications = applications.filter(app => {
    const matchesSearch = app.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredReviews = reviews.filter(review => {
    const matchesSearch = 
      review.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      review.review_text?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      review.counsellor?.full_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCounsellor = counsellorFilter === 'all' || review.counsellor_id === counsellorFilter;
    const matchesRating = ratingFilter === 'all' || review.rating === parseInt(ratingFilter);
    const matchesVisibility = 
      visibilityFilter === 'all' || 
      (visibilityFilter === 'visible' && review.is_visible) ||
      (visibilityFilter === 'hidden' && !review.is_visible);

    return matchesSearch && matchesCounsellor && matchesRating && matchesVisibility;
  });

  const applicationStats = {
    total: applications.length,
    pending: applications.filter(a => a.status === 'pending').length,
    underReview: applications.filter(a => a.status === 'under_review').length,
    approved: applications.filter(a => a.status === 'approved').length,
    rejected: applications.filter(a => a.status === 'rejected').length
  };

  const reviewStats = {
    total: reviews.length,
    visible: reviews.filter(r => r.is_visible).length,
    hidden: reviews.filter(r => !r.is_visible).length,
    averageRating: reviews.length > 0 
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : '0.0',
    fiveStars: reviews.filter(r => r.rating === 5).length,
    fourStars: reviews.filter(r => r.rating === 4).length,
    threeStars: reviews.filter(r => r.rating === 3).length,
    twoStars: reviews.filter(r => r.rating === 2).length,
    oneStar: reviews.filter(r => r.rating === 1).length,
  };

  const stats = {
    total: counsellors.length,
    active: counsellors.filter(c => c.is_active).length,
    verified: counsellors.filter(c => c.is_verified).length,
    pendingSessions: sessions.filter(s => s.status === 'pending').length
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
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-6 w-6 mx-auto mb-1 text-purple-500" />
            <p className="text-xl font-bold">{stats.total}</p>
            <p className="text-xs text-gray-500">{t('adminCounsellorManager', 'counsellors', 'Counsellors')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-6 w-6 mx-auto mb-1 text-green-500" />
            <p className="text-xl font-bold">{stats.active}</p>
            <p className="text-xs text-gray-500">{t('adminCounsellorManager', 'active', 'Active')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <UserCheck className="h-6 w-6 mx-auto mb-1 text-blue-500" />
            <p className="text-xl font-bold">{stats.verified}</p>
            <p className="text-xs text-gray-500">{t('adminCounsellorManager', 'verified', 'Verified')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="h-6 w-6 mx-auto mb-1 text-orange-500" />
            <p className="text-xl font-bold">{stats.pendingSessions}</p>
            <p className="text-xs text-gray-500">{t('adminCounsellorManager', 'sessions', 'Sessions')}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 mx-auto mb-1 text-amber-500" />
            <p className="text-xl font-bold text-amber-700">{applicationStats.pending}</p>
            <p className="text-xs text-amber-600">{t('adminCounsellorManager', 'pending', 'Pending')}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 text-center">
            <Eye className="h-6 w-6 mx-auto mb-1 text-blue-500" />
            <p className="text-xl font-bold text-blue-700">{applicationStats.underReview}</p>
            <p className="text-xs text-blue-600">{t('adminCounsellorManager', 'reviewing', 'Reviewing')}</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4 text-center">
            <ThumbsUp className="h-6 w-6 mx-auto mb-1 text-green-500" />
            <p className="text-xl font-bold text-green-700">{applicationStats.approved}</p>
            <p className="text-xs text-green-600">{t('adminCounsellorManager', 'approved', 'Approved')}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4 text-center">
            <ThumbsDown className="h-6 w-6 mx-auto mb-1 text-red-500" />
            <p className="text-xl font-bold text-red-700">{applicationStats.rejected}</p>
            <p className="text-xs text-red-600">{t('adminCounsellorManager', 'rejected', 'Rejected')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="applications" className="relative">
            {t('adminCounsellorManager', 'applicationsTab', 'Applications')}
            {applicationStats.pending > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {applicationStats.pending}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="counsellors">{t('adminCounsellorManager', 'counsellors', 'Counsellors')}</TabsTrigger>
          <TabsTrigger value="sessions">{t('adminCounsellorManager', 'sessions', 'Sessions')}</TabsTrigger>
          <TabsTrigger value="reviews">{t('adminCounsellorManager', 'reviewsTab', 'Reviews')}</TabsTrigger>
        </TabsList>

        {/* Applications Tab */}
        <TabsContent value="applications" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('adminCounsellorManager', 'searchApplicationsPlaceholder', 'Search applications...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t('adminCounsellorManager', 'filterByStatus', 'Filter by status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('adminCounsellorManager', 'allStatus', 'All Status')}</SelectItem>
                  <SelectItem value="pending">{t('adminCounsellorManager', 'pending', 'Pending')}</SelectItem>
                  <SelectItem value="under_review">{t('adminCounsellorManager', 'underReview', 'Under Review')}</SelectItem>
                  <SelectItem value="approved">{t('adminCounsellorManager', 'approved', 'Approved')}</SelectItem>
                  <SelectItem value="rejected">{t('adminCounsellorManager', 'rejected', 'Rejected')}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={loadData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('adminCounsellorManager', 'refresh', 'Refresh')}
              </Button>
            </div>
          </div>

          {/* Applications List */}
          <div className="space-y-4">
            {filteredApplications.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ClipboardList className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">{t('adminCounsellorManager', 'noApplicationsFound', 'No applications found')}</p>
                </CardContent>
              </Card>
            ) : (
              filteredApplications.map(application => (
                <Card key={application.id} className={`hover:shadow-md transition-shadow ${
                  application.status === 'pending' ? 'border-l-4 border-l-amber-500' :
                  application.status === 'under_review' ? 'border-l-4 border-l-blue-500' :
                  application.status === 'approved' ? 'border-l-4 border-l-green-500' :
                  'border-l-4 border-l-red-500'
                }`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                          <span className="text-lg font-semibold text-purple-600">
                            {application.full_name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-semibold flex items-center gap-2">
                            {application.full_name}
                            <Badge variant={
                              application.status === 'pending' ? 'outline' :
                              application.status === 'under_review' ? 'secondary' :
                              application.status === 'approved' ? 'default' : 'destructive'
                            } className="capitalize">
                              {application.status.replace('_', ' ')}
                            </Badge>
                          </h3>
                          <p className="text-sm text-gray-500">{application.email}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {application.specializations.slice(0, 3).map(spec => (
                              <Badge key={spec} variant="outline" className="text-xs">
                                {spec}
                              </Badge>
                            ))}
                            {application.specializations.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{application.specializations.length - 3}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-sm text-gray-500">
                          <Calendar className="h-4 w-4 inline mr-1" />
                          {new Date(application.created_at).toLocaleDateString()}
                        </div>
                        <div className="text-sm text-gray-500">
                          <Award className="h-4 w-4 inline mr-1" />
                          {t('adminCounsellorManager', 'yearsExp', '{years} years exp.').replace('{years}', String(application.years_of_experience))}
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() => handleOpenReview(application)}
                          className={application.status === 'pending' ? 'bg-amber-500 hover:bg-amber-600' : ''}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          {application.status === 'pending'
                            ? t('adminCounsellorManager', 'review', 'Review')
                            : t('adminCounsellorManager', 'viewDetails', 'View Details')}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="counsellors" className="space-y-4">
          {/* Search and Actions */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('adminCounsellorManager', 'searchCounsellorsPlaceholder', 'Search counsellors...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('adminCounsellorManager', 'refresh', 'Refresh')}
              </Button>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                {t('adminCounsellorManager', 'addCounsellor', 'Add Counsellor')}
              </Button>
            </div>
          </div>

          {/* Counsellors Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-4 font-medium">{t('adminCounsellorManager', 'counsellor', 'Counsellor')}</th>
                      <th className="text-left p-4 font-medium">{t('adminCounsellorManager', 'specialization', 'Specialization')}</th>
                      <th className="text-left p-4 font-medium">{t('adminCounsellorManager', 'rating', 'Rating')}</th>
                      <th className="text-left p-4 font-medium">{t('adminCounsellorManager', 'sessions', 'Sessions')}</th>
                      <th className="text-left p-4 font-medium">{t('adminCounsellorManager', 'status', 'Status')}</th>
                      <th className="text-left p-4 font-medium">{t('adminCounsellorManager', 'actions', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCounsellors.map(counsellor => (
                      <tr key={counsellor.id} className="border-b hover:bg-gray-50">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <img 
                              src={counsellor.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(counsellor.full_name)}&background=7c3aed&color=fff`}
                              alt={counsellor.full_name}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                            <div>
                              <p className="font-medium flex items-center gap-1">
                                {counsellor.full_name}
                                {counsellor.is_verified && (
                                  <CheckCircle className="h-4 w-4 text-blue-500 fill-blue-500" />
                                )}
                              </p>
                              <p className="text-sm text-gray-500">{counsellor.title}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1">
                            {counsellor.specialization?.slice(0, 2).map(spec => (
                              <Badge key={spec} variant="secondary" className="text-xs">
                                {spec}
                              </Badge>
                            ))}
                            {(counsellor.specialization?.length || 0) > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{counsellor.specialization!.length - 2}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            <span>{counsellor.rating?.toFixed(1) || '0.0'}</span>
                          </div>
                        </td>
                        <td className="p-4">{counsellor.total_sessions || 0}</td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            <Badge variant={counsellor.is_active ? 'default' : 'secondary'}>
                              {counsellor.is_active ? t('adminCounsellorManager', 'active', 'Active') : t('adminCounsellorManager', 'inactive', 'Inactive')}
                            </Badge>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleToggleActive(counsellor)}
                              title={counsellor.is_active ? t('adminCounsellorManager', 'deactivate', 'Deactivate') : t('adminCounsellorManager', 'activate', 'Activate')}
                            >
                              {counsellor.is_active ? (
                                <XCircle className="h-4 w-4 text-red-500" />
                              ) : (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleToggleVerified(counsellor)}
                              title={counsellor.is_verified ? t('adminCounsellorManager', 'unverify', 'Unverify') : t('adminCounsellorManager', 'verify', 'Verify')}
                            >
                              <UserCheck className={`h-4 w-4 ${counsellor.is_verified ? 'text-blue-500' : 'text-gray-400'}`} />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(counsellor)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(counsellor.id)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('adminCounsellorManager', 'counsellingSessions', 'Counselling Sessions')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-4 font-medium">{t('adminCounsellorManager', 'user', 'User')}</th>
                      <th className="text-left p-4 font-medium">{t('adminCounsellorManager', 'counsellor', 'Counsellor')}</th>
                      <th className="text-left p-4 font-medium">{t('adminCounsellorManager', 'scheduled', 'Scheduled')}</th>
                      <th className="text-left p-4 font-medium">{t('adminCounsellorManager', 'topic', 'Topic')}</th>
                      <th className="text-left p-4 font-medium">{t('adminCounsellorManager', 'status', 'Status')}</th>
                      <th className="text-left p-4 font-medium">{t('adminCounsellorManager', 'actions', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(session => (
                      <tr key={session.id} className="border-b hover:bg-gray-50">
                        <td className="p-4">{session.user_name || t('adminCounsellorManager', 'anonymous', 'Anonymous')}</td>
                        <td className="p-4">{session.counsellor?.full_name || t('adminCounsellorManager', 'unknown', 'Unknown')}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            {new Date(session.scheduled_at).toLocaleDateString()}
                          </div>
                          <div className="flex items-center gap-1 text-sm text-gray-500">
                            <Clock className="h-3 w-3" />
                            {new Date(session.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="p-4">{session.topic || '-'}</td>
                        <td className="p-4">
                          <Badge variant={
                            session.status === 'confirmed' ? 'default' :
                            session.status === 'completed' ? 'secondary' :
                            session.status === 'cancelled' ? 'destructive' : 'outline'
                          }>
                            {session.status}
                          </Badge>
                        </td>
                        <td className="p-4">
                          {session.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleUpdateSessionStatus(session.id, 'confirmed')}
                              >
                                {t('adminCounsellorManager', 'confirm', 'Confirm')}
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => handleUpdateSessionStatus(session.id, 'cancelled')}
                              >
                                {t('adminCounsellorManager', 'cancel', 'Cancel')}
                              </Button>
                            </div>
                          )}
                          {session.status === 'confirmed' && (
                            <Button 
                              size="sm"
                              onClick={() => handleUpdateSessionStatus(session.id, 'completed')}
                            >
                              {t('adminCounsellorManager', 'markComplete', 'Mark Complete')}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {sessions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-500">
                          {t('adminCounsellorManager', 'noSessionsFound', 'No sessions found')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reviews Tab */}
        <TabsContent value="reviews" className="space-y-4">
          {/* Review Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <MessageSquare className="h-6 w-6 mx-auto mb-1 text-purple-500" />
                <p className="text-xl font-bold">{reviewStats.total}</p>
                <p className="text-xs text-gray-500">{t('adminCounsellorManager', 'totalReviews', 'Total Reviews')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Star className="h-6 w-6 mx-auto mb-1 text-amber-500 fill-amber-500" />
                <p className="text-xl font-bold">{reviewStats.averageRating}</p>
                <p className="text-xs text-gray-500">{t('adminCounsellorManager', 'avgRating', 'Avg Rating')}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 text-center">
                <Eye className="h-6 w-6 mx-auto mb-1 text-green-500" />
                <p className="text-xl font-bold text-green-700">{reviewStats.visible}</p>
                <p className="text-xs text-green-600">{t('adminCounsellorManager', 'visible', 'Visible')}</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4 text-center">
                <EyeOff className="h-6 w-6 mx-auto mb-1 text-red-500" />
                <p className="text-xl font-bold text-red-700">{reviewStats.hidden}</p>
                <p className="text-xs text-red-600">{t('adminCounsellorManager', 'hidden', 'Hidden')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingUp className="h-6 w-6 mx-auto mb-1 text-blue-500" />
                <p className="text-xl font-bold">{reviewStats.fiveStars}</p>
                <p className="text-xs text-gray-500">{t('adminCounsellorManager', 'fiveStar', '5-Star')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <BarChart3 className="h-6 w-6 mx-auto mb-1 text-gray-500" />
                <p className="text-xl font-bold">{reviewStats.oneStar}</p>
                <p className="text-xs text-gray-500">{t('adminCounsellorManager', 'oneStar', '1-Star')}</p>
              </CardContent>
            </Card>
          </div>

          {/* Rating Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('adminCounsellorManager', 'ratingDistribution', 'Rating Distribution')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map(rating => {
                  const count = reviews.filter(r => r.rating === rating).length;
                  const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                  return (
                    <div key={rating} className="flex items-center gap-3">
                      <div className="flex items-center gap-1 w-12">
                        <span className="text-sm font-medium">{rating}</span>
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      </div>
                      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-amber-500 h-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-500 w-12 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('adminCounsellorManager', 'searchReviewsPlaceholder', 'Search reviews...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={counsellorFilter} onValueChange={setCounsellorFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t('adminCounsellorManager', 'allCounsellors', 'All Counsellors')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('adminCounsellorManager', 'allCounsellors', 'All Counsellors')}</SelectItem>
                  {counsellors.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ratingFilter} onValueChange={setRatingFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder={t('adminCounsellorManager', 'allRatings', 'All Ratings')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('adminCounsellorManager', 'allRatings', 'All Ratings')}</SelectItem>
                  <SelectItem value="5">{t('adminCounsellorManager', 'fiveStars', '5 Stars')}</SelectItem>
                  <SelectItem value="4">{t('adminCounsellorManager', 'fourStars', '4 Stars')}</SelectItem>
                  <SelectItem value="3">{t('adminCounsellorManager', 'threeStars', '3 Stars')}</SelectItem>
                  <SelectItem value="2">{t('adminCounsellorManager', 'twoStars', '2 Stars')}</SelectItem>
                  <SelectItem value="1">{t('adminCounsellorManager', 'oneStarOption', '1 Star')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder={t('adminCounsellorManager', 'visibility', 'Visibility')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('adminCounsellorManager', 'allReviews', 'All Reviews')}</SelectItem>
                  <SelectItem value="visible">{t('adminCounsellorManager', 'visible', 'Visible')}</SelectItem>
                  <SelectItem value="hidden">{t('adminCounsellorManager', 'hidden', 'Hidden')}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={loadData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('adminCounsellorManager', 'refresh', 'Refresh')}
              </Button>
            </div>
          </div>

          {/* Reviews List */}
          <div className="space-y-4">
            {filteredReviews.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">{t('adminCounsellorManager', 'noReviewsFound', 'No reviews found')}</p>
                </CardContent>
              </Card>
            ) : (
              filteredReviews.map(review => (
                <Card key={review.id} className={`hover:shadow-md transition-shadow ${
                  !review.is_visible ? 'border-l-4 border-l-red-500 bg-red-50/30' : ''
                }`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              {[...Array(5)].map((_, i) => (
                                <Star 
                                  key={i} 
                                  className={`h-4 w-4 ${
                                    i < review.rating 
                                      ? 'fill-amber-400 text-amber-400' 
                                      : 'text-gray-300'
                                  }`} 
                                />
                              ))}
                              {!review.is_visible && (
                                <Badge variant="destructive" className="ml-2">
                                  <EyeOff className="h-3 w-3 mr-1" />
                                  {t('adminCounsellorManager', 'hidden', 'Hidden')}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">
                              <strong>{t('adminCounsellorManager', 'counsellorLabel', 'Counsellor:')}</strong> {review.counsellor?.full_name || t('adminCounsellorManager', 'unknown', 'Unknown')}
                            </p>
                            <p className="text-sm text-gray-600">
                              <strong>{t('adminCounsellorManager', 'reviewerLabel', 'Reviewer:')}</strong> {review.is_anonymous ? t('adminCounsellorManager', 'anonymous', 'Anonymous') : review.user_name || t('adminCounsellorManager', 'userFallback', 'User')}
                            </p>
                            <p className="text-xs text-gray-400">
                              {new Date(review.created_at).toLocaleDateString()} at{' '}
                              {new Date(review.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        
                        {review.review_text && (
                          <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg mt-2">
                            {review.review_text}
                          </p>
                        )}

                        {review.session && (
                          <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
                            <ExternalLink className="h-3 w-3" />
                            <span>{t('adminCounsellorManager', 'sessionIdLabel', 'Session ID:')} {review.session_id.slice(0, 8)}...</span>
                            <span>•</span>
                            <span>{review.session.topic || t('adminCounsellorManager', 'noTopic', 'No topic')}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleOpenReviewDetail(review)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          {t('adminCounsellorManager', 'details', 'Details')}
                        </Button>
                        <Button 
                          size="sm"
                          variant={review.is_visible ? 'destructive' : 'default'}
                          onClick={() => handleToggleReviewVisibility(review.id, review.is_visible)}
                        >
                          {review.is_visible ? (
                            <>
                              <EyeOff className="h-4 w-4 mr-1" />
                              {t('adminCounsellorManager', 'hide', 'Hide')}
                            </>
                          ) : (
                            <>
                              <Eye className="h-4 w-4 mr-1" />
                              {t('adminCounsellorManager', 'show', 'Show')}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Application Review Modal */}
      <Dialog open={showReviewModal} onOpenChange={setShowReviewModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              {t('adminCounsellorManager', 'reviewApplicationTitle', 'Review Application - {name}').replace('{name}', String(selectedApplication?.full_name ?? ''))}
            </DialogTitle>
            <DialogDescription>
              {t('adminCounsellorManager', 'reviewApplicationDesc', "Review the applicant's information and make a decision")}
            </DialogDescription>
          </DialogHeader>
          
          {selectedApplication && (
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-6">
                {/* Applicant Info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {t('adminCounsellorManager', 'personalInformation', 'Personal Information')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">{t('adminCounsellorManager', 'fullName', 'Full Name')}</p>
                      <p className="font-medium">{selectedApplication.full_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">{t('adminCounsellorManager', 'email', 'Email')}</p>
                      <p className="font-medium">{selectedApplication.email}</p>
                    </div>
                    {selectedApplication.phone && (
                      <div>
                        <p className="text-sm text-gray-500">{t('adminCounsellorManager', 'phone', 'Phone')}</p>
                        <p className="font-medium">{selectedApplication.phone}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-gray-500">{t('adminCounsellorManager', 'appliedOn', 'Applied On')}</p>
                      <p className="font-medium">
                        {new Date(selectedApplication.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Bio & Testimony */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {t('adminCounsellorManager', 'bioAndTestimony', 'Bio & Testimony')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">{t('adminCounsellorManager', 'professionalBio', 'Professional Bio')}</p>
                      <p className="text-sm bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">
                        {selectedApplication.bio}
                      </p>
                    </div>
                    {selectedApplication.testimony && (
                      <div>
                        <p className="text-sm text-gray-500 mb-1">{t('adminCounsellorManager', 'personalTestimony', 'Personal Testimony')}</p>
                        <p className="text-sm bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">
                          {selectedApplication.testimony}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Qualifications */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Award className="h-4 w-4" />
                      {t('adminCounsellorManager', 'qualifications', 'Qualifications')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-500 mb-2">{t('adminCounsellorManager', 'specializations', 'Specializations')}</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedApplication.specializations.map(spec => (
                          <Badge key={spec} variant="secondary">{spec}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">{t('adminCounsellorManager', 'yearsOfExperience', 'Years of Experience')}</p>
                        <p className="font-medium">{t('adminCounsellorManager', 'yearsCount', '{years} years').replace('{years}', String(selectedApplication.years_of_experience))}</p>
                      </div>
                      {selectedApplication.ministry_affiliation && (
                        <div>
                          <p className="text-sm text-gray-500">{t('adminCounsellorManager', 'ministryAffiliation', 'Ministry Affiliation')}</p>
                          <p className="font-medium">{selectedApplication.ministry_affiliation}</p>
                        </div>
                      )}
                      {selectedApplication.church_name && (
                        <div>
                          <p className="text-sm text-gray-500">{t('adminCounsellorManager', 'church', 'Church')}</p>
                          <p className="font-medium">{selectedApplication.church_name}</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-2">{t('adminCounsellorManager', 'languages', 'Languages')}</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedApplication.languages.map(lang => (
                          <Badge key={lang} variant="outline">{lang}</Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Certifications */}
                {selectedApplication.certification_urls.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        {t('adminCounsellorManager', 'certificationsDocuments', 'Certifications & Documents')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedApplication.certification_urls.map((url, index) => (
                          <a
                            key={index}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <FileText className="h-5 w-5 text-purple-600" />
                            <span className="flex-1">{t('adminCounsellorManager', 'certificate', 'Certificate {number}').replace('{number}', String(index + 1))}</span>
                            <ExternalLink className="h-4 w-4 text-gray-400" />
                          </a>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* User Activity History */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <History className="h-4 w-4" />
                      {t('adminCounsellorManager', 'userActivityHistory', 'User Activity History')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingActivity ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                      </div>
                    ) : userActivity.length > 0 ? (
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {userActivity.map(activity => (
                          <div key={activity.id} className="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded">
                            <span className="text-gray-400">
                              {new Date(activity.created_at).toLocaleDateString()}
                            </span>
                            <Badge variant="outline" className="text-xs">{activity.action_type}</Badge>
                            <span className="text-gray-600 truncate">{activity.description}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-4">{t('adminCounsellorManager', 'noActivityHistory', 'No activity history found')}</p>
                    )}
                  </CardContent>
                </Card>

                {/* Admin Notes */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      {t('adminCounsellorManager', 'adminNotes', 'Admin Notes')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder={t('adminCounsellorManager', 'adminNotesApplicationPlaceholder', 'Add internal notes about this application...')}
                      rows={3}
                    />
                  </CardContent>
                </Card>

                {/* Rejection Reason (if rejecting) */}
                {selectedApplication.status !== 'approved' && (
                  <Card className="border-red-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-red-600">
                        <AlertCircle className="h-4 w-4" />
                        {t('adminCounsellorManager', 'rejectionReasonHeader', 'Rejection Reason (Required if rejecting)')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder={t('adminCounsellorManager', 'rejectionReasonPlaceholder', 'Provide a reason for rejection that will be shared with the applicant...')}
                        rows={3}
                        className="border-red-200 focus:border-red-400"
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="border-t pt-4 mt-4">
            <Button variant="outline" onClick={() => setShowReviewModal(false)}>
              {t('adminCounsellorManager', 'close', 'Close')}
            </Button>
            {selectedApplication?.status !== 'approved' && selectedApplication?.status !== 'rejected' && (
              <>
                <Button 
                  variant="destructive" 
                  onClick={handleRejectApplication}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ThumbsDown className="h-4 w-4 mr-2" />}
                  {t('adminCounsellorManager', 'reject', 'Reject')}
                </Button>
                <Button 
                  onClick={handleApproveApplication}
                  disabled={saving}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ThumbsUp className="h-4 w-4 mr-2" />}
                  {t('adminCounsellorManager', 'approve', 'Approve')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Detail Modal */}
      <Dialog open={showReviewDetailModal} onOpenChange={setShowReviewDetailModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {t('adminCounsellorManager', 'reviewDetails', 'Review Details')}
            </DialogTitle>
          </DialogHeader>

          {selectedReview && (
            <div className="space-y-4">
              {/* Rating */}
              <div>
                <Label className="text-gray-500 text-xs">{t('adminCounsellorManager', 'rating', 'Rating')}</Label>
                <div className="flex items-center gap-1 mt-1">
                  {[...Array(5)].map((_, i) => (
                    <Star 
                      key={i} 
                      className={`h-5 w-5 ${
                        i < selectedReview.rating 
                          ? 'fill-amber-400 text-amber-400' 
                          : 'text-gray-300'
                      }`} 
                    />
                  ))}
                  <span className="ml-2 text-lg font-semibold">{selectedReview.rating}/5</span>
                </div>
              </div>

              {/* Counsellor & Reviewer */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500 text-xs">{t('adminCounsellorManager', 'counsellor', 'Counsellor')}</Label>
                  <p className="font-medium mt-1">{selectedReview.counsellor?.full_name || t('adminCounsellorManager', 'unknown', 'Unknown')}</p>
                </div>
                <div>
                  <Label className="text-gray-500 text-xs">{t('adminCounsellorManager', 'reviewer', 'Reviewer')}</Label>
                  <p className="font-medium mt-1">
                    {selectedReview.is_anonymous ? t('adminCounsellorManager', 'anonymous', 'Anonymous') : selectedReview.user_name || t('adminCounsellorManager', 'userFallback', 'User')}
                  </p>
                </div>
              </div>

              {/* Review Text */}
              {selectedReview.review_text && (
                <div>
                  <Label className="text-gray-500 text-xs">{t('adminCounsellorManager', 'review', 'Review')}</Label>
                  <p className="bg-gray-50 p-3 rounded-lg mt-1 text-sm whitespace-pre-wrap">
                    {selectedReview.review_text}
                  </p>
                </div>
              )}

              {/* Session Info */}
              <div>
                <Label className="text-gray-500 text-xs">{t('adminCounsellorManager', 'relatedSession', 'Related Session')}</Label>
                <div className="bg-gray-50 p-3 rounded-lg mt-1 text-sm">
                  <p><strong>{t('adminCounsellorManager', 'sessionIdLabel', 'Session ID:')}</strong> {selectedReview.session_id}</p>
                  {selectedReview.session && (
                    <>
                      <p><strong>{t('adminCounsellorManager', 'topicLabel', 'Topic:')}</strong> {selectedReview.session.topic || t('adminCounsellorManager', 'noTopic', 'No topic')}</p>
                      <p><strong>{t('adminCounsellorManager', 'dateLabel', 'Date:')}</strong> {new Date(selectedReview.session.scheduled_at).toLocaleDateString()}</p>
                    </>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-gray-500 text-xs">{t('adminCounsellorManager', 'created', 'Created')}</Label>
                  <p className="mt-1">{new Date(selectedReview.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-gray-500 text-xs">{t('adminCounsellorManager', 'visibility', 'Visibility')}</Label>
                  <Badge variant={selectedReview.is_visible ? 'default' : 'destructive'} className="mt-1">
                    {selectedReview.is_visible ? t('adminCounsellorManager', 'visible', 'Visible') : t('adminCounsellorManager', 'hidden', 'Hidden')}
                  </Badge>
                </div>
              </div>

              {/* Admin Notes */}
              <div>
                <Label>{t('adminCounsellorManager', 'adminNotesInternal', 'Admin Notes (Internal)')}</Label>
                <Textarea
                  value={reviewAdminNotes}
                  onChange={(e) => setReviewAdminNotes(e.target.value)}
                  placeholder={t('adminCounsellorManager', 'adminNotesReviewPlaceholder', 'Add internal notes about this review...')}
                  rows={3}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowReviewDetailModal(false)}>
              {t('adminCounsellorManager', 'close', 'Close')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedReview && handleDeleteReview(selectedReview.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('adminCounsellorManager', 'deleteReview', 'Delete Review')}
            </Button>
            <Button
              variant={selectedReview?.is_visible ? 'secondary' : 'default'}
              onClick={() => selectedReview && handleToggleReviewVisibility(selectedReview.id, selectedReview.is_visible)}
            >
              {selectedReview?.is_visible ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  {t('adminCounsellorManager', 'hideReview', 'Hide Review')}
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  {t('adminCounsellorManager', 'showReview', 'Show Review')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Counsellor Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCounsellor ? t('adminCounsellorManager', 'editCounsellor', 'Edit Counsellor') : t('adminCounsellorManager', 'addNewCounsellor', 'Add New Counsellor')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Profile Image */}
            <div className="flex items-center gap-4">
              <img 
                src={formData.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.full_name || 'New')}&background=7c3aed&color=fff`}
                alt="Profile"
                className="w-20 h-20 rounded-full object-cover border-4 border-purple-100"
              />
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {t('adminCounsellorManager', 'uploadPhoto', 'Upload Photo')}
                </Button>
                <p className="text-xs text-gray-500 mt-1">{t('adminCounsellorManager', 'orPasteImageUrl', 'Or paste image URL below')}</p>
              </div>
            </div>

            <div>
              <Label>{t('adminCounsellorManager', 'profileImageUrl', 'Profile Image URL')}</Label>
              <Input 
                value={formData.profile_image_url || ''} 
                onChange={(e) => setFormData({ ...formData, profile_image_url: e.target.value })}
                placeholder="https://example.com/image.jpg"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminCounsellorManager', 'fullNameRequired2', 'Full Name *')}</Label>
                <Input
                  value={formData.full_name || ''}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder={t('adminCounsellorManager', 'fullNamePlaceholder', 'Pastor John Doe')}
                />
              </div>
              <div>
                <Label>{t('adminCounsellorManager', 'title', 'Title')}</Label>
                <Input
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('adminCounsellorManager', 'titlePlaceholder', 'Senior Pastor')}
                />
              </div>
            </div>

            <div>
              <Label>{t('adminCounsellorManager', 'bio', 'Bio')}</Label>
              <Textarea
                value={formData.bio || ''}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder={t('adminCounsellorManager', 'bioPlaceholder', 'Brief description of experience and ministry focus...')}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('adminCounsellorManager', 'email', 'Email')}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input 
                    type="email"
                    value={formData.email || ''} 
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="counsellor@example.com"
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label>{t('adminCounsellorManager', 'phone', 'Phone')}</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input 
                    value={formData.phone || ''} 
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 234 567 8900"
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>{t('adminCounsellorManager', 'hourlyRate', 'Hourly Rate ($)')}</Label>
              <Input
                type="number"
                value={formData.hourly_rate || ''}
                onChange={(e) => setFormData({ ...formData, hourly_rate: parseFloat(e.target.value) || undefined })}
                placeholder={t('adminCounsellorManager', 'hourlyRatePlaceholder', '0 for free sessions')}
              />
            </div>

            <div>
              <Label>{t('adminCounsellorManager', 'specializations', 'Specializations')}</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {SPECIALIZATIONS.map(spec => (
                  <Badge 
                    key={spec}
                    variant={formData.specialization?.includes(spec) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleSpecialization(spec)}
                  >
                    {spec}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label>{t('adminCounsellorManager', 'languages', 'Languages')}</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {LANGUAGES.map(lang => (
                  <Badge 
                    key={lang}
                    variant={formData.languages?.includes(lang) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleLanguage(lang)}
                  >
                    {lang}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch 
                    checked={formData.is_active ?? true} 
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label>{t('adminCounsellorManager', 'active', 'Active')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch 
                    checked={formData.is_verified ?? false} 
                    onCheckedChange={(checked) => setFormData({ ...formData, is_verified: checked })}
                  />
                  <Label>{t('adminCounsellorManager', 'verified', 'Verified')}</Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              {t('adminCounsellorManager', 'cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('adminCounsellorManager', 'saving', 'Saving...')}
                </>
              ) : (
                t('adminCounsellorManager', 'saveCounsellor', 'Save Counsellor')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCounsellorManager;