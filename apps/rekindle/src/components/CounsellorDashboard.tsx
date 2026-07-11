import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { toast } from '@/components/ui/use-toast';
import {
  Calendar, Clock, User, Video, CheckCircle, XCircle, Star, MessageSquare,
  Settings, History, Users, Loader2, RefreshCw, Phone, Mail, Globe,
  Edit, Save, AlertCircle, Play, ChevronRight, Award, TrendingUp, Lock, Crown
} from 'lucide-react';
import { CounsellingVideoSession } from './CounsellingVideoSession';

interface CounsellingSession {
  id: string;
  counsellor_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  user_phone?: string;
  scheduled_at: string;
  duration: number;
  topic?: string;
  notes?: string;
  status: 'pending' | 'confirmed' | 'scheduled' | 'live' | 'completed' | 'cancelled' | 'in_progress';
  daily_room_url?: string;
  daily_room_name?: string;
  session_started_at?: string;
  session_ended_at?: string;
  actual_duration?: number;
  created_at: string;
}

interface CounsellorProfile {
  id: string;
  user_id: string;
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
  availability_schedule?: Record<string, { enabled: boolean; start: string; end: string }>;
  timezone?: string;
}

interface Review {
  id: string;
  session_id: string;
  user_id: string;
  rating: number;
  review_text?: string;
  is_anonymous: boolean;
  created_at: string;
  user_name?: string;
}

const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

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

export const CounsellorDashboard: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const entitlements = useUserEntitlements();
  
  const [activeTab, setActiveTab] = useState('sessions');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<CounsellorProfile | null>(null);
  const [sessions, setSessions] = useState<CounsellingSession[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<CounsellingSession | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [joiningSession, setJoiningSession] = useState(false);
  const [videoCallData, setVideoCallData] = useState<{ url: string; token: string } | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Profile editing state
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<Partial<CounsellorProfile>>({});

  // Availability state
  const [availability, setAvailability] = useState<Record<string, { enabled: boolean; start: string; end: string }>>({});
  
  // Check if user can access counsellor dashboard (Premium+ feature)
  const canAccessCounsellorDashboard = entitlements.canAccessCounsellorDashboard;

  const loadData = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // Get counsellor profile
      const { data: profileData, error: profileError } = await supabase
        .from('counsellors')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileError) {
        if (profileError.code === 'PGRST116') {
          toast({
            title: t('counsellorDashboard', 'notCounsellorTitle', 'Not a Counsellor'),
            description: t('counsellorDashboard', 'notCounsellorDesc', 'You are not registered as a counsellor.'),
            variant: 'destructive'
          });
        }
        throw profileError;
      }

      setProfile(profileData);
      setProfileForm(profileData);
      setAvailability(profileData.availability_schedule || {});

      // Get sessions
      const { data: sessionsData } = await supabase
        .from('counselling_sessions')
        .select('*')
        .eq('counsellor_id', profileData.id)
        .order('scheduled_at', { ascending: false });

      setSessions(sessionsData || []);

      // Get reviews
      const { data: reviewsData } = await supabase
        .from('counsellor_reviews')
        .select('*')
        .eq('counsellor_id', profileData.id)
        .eq('is_visible', true)
        .order('created_at', { ascending: false });

      setReviews(reviewsData || []);

    } catch (err: any) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAcceptSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('counselling_sessions')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) throw error;

      toast({ title: t('counsellorDashboard', 'success', 'Success'), description: t('counsellorDashboard', 'sessionConfirmed', 'Session confirmed!') });
      loadData();
    } catch (err: any) {
      toast({ title: t('counsellorDashboard', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleDeclineSession = async () => {
    if (!selectedSession) return;

    try {
      const { error } = await supabase
        .from('counselling_sessions')
        .update({ 
          status: 'cancelled', 
          notes: declineReason ? `Declined: ${declineReason}` : 'Declined by counsellor',
          updated_at: new Date().toISOString() 
        })
        .eq('id', selectedSession.id);

      if (error) throw error;

      toast({ title: t('counsellorDashboard', 'sessionDeclinedTitle', 'Session Declined'), description: t('counsellorDashboard', 'sessionDeclinedDesc', 'The user will be notified.') });
      setShowDeclineModal(false);
      setSelectedSession(null);
      setDeclineReason('');
      loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleJoinSession = async (session: CounsellingSession) => {
    if (!profile) return;

    setJoiningSession(true);
    setSelectedSession(session);
    setActiveSessionId(session.id);

    try {
      // Room name based on session ID
      const roomName = `counselling-${session.id}`;
      
      // The room will be created by the video component via the edge function
      // Just open the video modal
      setShowVideoModal(true);
      
      // Update session status to live (will be done by the video component too, but we can pre-update)
      await supabase
        .from('counselling_sessions')
        .update({
          status: 'live',
          updated_at: new Date().toISOString()
        })
        .eq('id', session.id);

      loadData();
    } catch (err: any) {
      console.error('Failed to join session:', err);
      toast({ title: t('counsellorDashboard', 'error', 'Error'), description: t('counsellorDashboard', 'failedStartVideo', 'Failed to start video session'), variant: 'destructive' });
      setShowVideoModal(false);
      setActiveSessionId(null);
    } finally {
      setJoiningSession(false);
    }
  };

  const handleEndSession = async (duration?: number) => {
    if (!selectedSession) return;

    try {
      const startTime = selectedSession.session_started_at 
        ? new Date(selectedSession.session_started_at).getTime() 
        : Date.now();
      const actualDuration = duration || Math.round((Date.now() - startTime) / 60000);

      await supabase
        .from('counselling_sessions')
        .update({
          status: 'completed',
          session_ended_at: new Date().toISOString(),
          actual_duration: Math.ceil(actualDuration / 60), // Convert seconds to minutes
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedSession.id);

      // Update total sessions count
      if (profile) {
        await supabase
          .from('counsellors')
          .update({ total_sessions: (profile.total_sessions || 0) + 1 })
          .eq('id', profile.id);
      }

      setShowVideoModal(false);
      setVideoCallData(null);
      setSelectedSession(null);
      setActiveSessionId(null);
      toast({ title: t('counsellorDashboard', 'sessionCompletedTitle', 'Session Completed'), description: t('counsellorDashboard', 'sessionCompletedDesc', 'Session completed. Duration: {minutes} minutes').replace('{minutes}', String(Math.ceil(actualDuration / 60))) });
      loadData();
    } catch (err: any) {
      toast({ title: t('counsellorDashboard', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleSaveProfile = async () => {
    if (!profile) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('counsellors')
        .update({
          full_name: profileForm.full_name,
          title: profileForm.title,
          bio: profileForm.bio,
          specialization: profileForm.specialization,
          email: profileForm.email,
          phone: profileForm.phone,
          hourly_rate: profileForm.hourly_rate,
          languages: profileForm.languages,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      if (error) throw error;

      toast({ title: t('counsellorDashboard', 'success', 'Success'), description: t('counsellorDashboard', 'profileUpdated', 'Profile updated successfully!') });
      setEditingProfile(false);
      loadData();
    } catch (err: any) {
      toast({ title: t('counsellorDashboard', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAvailability = async () => {
    if (!profile) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('counsellors')
        .update({
          availability_schedule: availability,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      if (error) throw error;

      toast({ title: t('counsellorDashboard', 'success', 'Success'), description: t('counsellorDashboard', 'availabilityUpdated', 'Availability updated!') });
      loadData();
    } catch (err: any) {
      toast({ title: t('counsellorDashboard', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!profile) return;

    try {
      const { error } = await supabase
        .from('counsellors')
        .update({ is_active: !profile.is_active, updated_at: new Date().toISOString() })
        .eq('id', profile.id);

      if (error) throw error;

      toast({
        title: profile.is_active ? t('counsellorDashboard', 'deactivated', 'Deactivated') : t('counsellorDashboard', 'activated', 'Activated'),
        description: profile.is_active
          ? t('counsellorDashboard', 'deactivatedDesc', 'You will not receive new booking requests.')
          : t('counsellorDashboard', 'activatedDesc', 'You are now available for bookings.')
      });
      loadData();
    } catch (err: any) {
      toast({ title: t('counsellorDashboard', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const canJoinSession = (session: CounsellingSession) => {
    if (session.status !== 'confirmed' && session.status !== 'in_progress') return false;
    const scheduledTime = new Date(session.scheduled_at).getTime();
    const now = Date.now();
    const fiveMinutesBefore = scheduledTime - 5 * 60 * 1000;
    const twoHoursAfter = scheduledTime + 2 * 60 * 60 * 1000;
    return now >= fiveMinutesBefore && now <= twoHoursAfter;
  };

  const getTimeUntilSession = (session: CounsellingSession) => {
    const scheduledTime = new Date(session.scheduled_at).getTime();
    const now = Date.now();
    const diff = scheduledTime - now;
    
    if (diff <= 0) return t('counsellorDashboard', 'now', 'Now');
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  // Filter sessions
  const pendingSessions = sessions.filter(s => s.status === 'pending');
  const upcomingSessions = sessions.filter(s => 
    (s.status === 'confirmed' || s.status === 'in_progress') && 
    new Date(s.scheduled_at) >= new Date(Date.now() - 2 * 60 * 60 * 1000)
  );
  const pastSessions = sessions.filter(s => 
    s.status === 'completed' || 
    (s.status === 'confirmed' && new Date(s.scheduled_at) < new Date(Date.now() - 2 * 60 * 60 * 1000))
  );

  // Stats
  const averageRating = reviews.length > 0 
    ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length 
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t('counsellorDashboard', 'notCounsellorTitle', 'Not a Counsellor')}</h3>
          <p className="text-gray-500">
            {t('counsellorDashboard', 'notCounsellorAccess', 'You need to be an approved counsellor to access this dashboard.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="h-6 w-6 mx-auto mb-1 text-purple-500" />
            <p className="text-2xl font-bold">{pendingSessions.length}</p>
            <p className="text-xs text-gray-500">{t('counsellorDashboard', 'pendingRequests', 'Pending Requests')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-6 w-6 mx-auto mb-1 text-blue-500" />
            <p className="text-2xl font-bold">{profile.total_sessions || 0}</p>
            <p className="text-xs text-gray-500">{t('counsellorDashboard', 'totalSessions', 'Total Sessions')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Star className="h-6 w-6 mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold">{averageRating.toFixed(1)}</p>
            <p className="text-xs text-gray-500">{t('counsellorDashboard', 'averageRating', 'Average Rating')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MessageSquare className="h-6 w-6 mx-auto mb-1 text-green-500" />
            <p className="text-2xl font-bold">{reviews.length}</p>
            <p className="text-xs text-gray-500">{t('counsellorDashboard', 'reviews', 'Reviews')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Toggle */}
      <Card className={profile.is_active ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${profile.is_active ? 'bg-green-100' : 'bg-red-100'}`}>
                {profile.is_active ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
              </div>
              <div>
                <p className="font-medium">
                  {profile.is_active ? t('counsellorDashboard', 'availableForBookings', 'You are available for bookings') : t('counsellorDashboard', 'currentlyUnavailable', 'You are currently unavailable')}
                </p>
                <p className="text-sm text-gray-600">
                  {profile.is_active
                    ? t('counsellorDashboard', 'usersCanBook', 'Users can book sessions with you')
                    : t('counsellorDashboard', 'toggleToAccept', 'Toggle to start accepting new bookings')}
                </p>
              </div>
            </div>
            <Switch 
              checked={profile.is_active}
              onCheckedChange={handleToggleActive}
            />
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="sessions" className="relative">
            {t('counsellorDashboard', 'tabSessions', 'Sessions')}
            {pendingSessions.length > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {pendingSessions.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="availability">{t('counsellorDashboard', 'tabAvailability', 'Availability')}</TabsTrigger>
          <TabsTrigger value="reviews">{t('counsellorDashboard', 'tabReviews', 'Reviews')}</TabsTrigger>
          <TabsTrigger value="profile">{t('counsellorDashboard', 'tabProfile', 'Profile')}</TabsTrigger>
        </TabsList>

        {/* Sessions Tab */}
        <TabsContent value="sessions" className="space-y-6 mt-6">
          {/* Pending Requests */}
          {pendingSessions.length > 0 && (
            <div>
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                {t('counsellorDashboard', 'pendingRequestsCount', 'Pending Requests ({count})').replace('{count}', String(pendingSessions.length))}
              </h3>
              <div className="space-y-3">
                {pendingSessions.map(session => (
                  <Card key={session.id} className="border-l-4 border-l-amber-500">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{session.user_name || t('counsellorDashboard', 'anonymousUser', 'Anonymous User')}</h4>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {new Date(session.scheduled_at).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {new Date(session.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span>{session.duration} min</span>
                          </div>
                          {session.topic && (
                            <p className="mt-2 text-sm bg-gray-50 p-2 rounded">
                              <strong>{t('counsellorDashboard', 'topicLabel', 'Topic:')}</strong> {session.topic}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => {
                              setSelectedSession(session);
                              setShowDeclineModal(true);
                            }}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            {t('counsellorDashboard', 'decline', 'Decline')}
                          </Button>
                          <Button 
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => handleAcceptSession(session.id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            {t('counsellorDashboard', 'accept', 'Accept')}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Sessions */}
          <div>
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <Video className="h-5 w-5 text-blue-500" />
              {t('counsellorDashboard', 'upcomingSessionsCount', 'Upcoming Sessions ({count})').replace('{count}', String(upcomingSessions.length))}
            </h3>
            {upcomingSessions.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Calendar className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">{t('counsellorDashboard', 'noUpcomingSessions', 'No upcoming sessions')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {upcomingSessions.map(session => (
                  <Card key={session.id} className={`${session.status === 'in_progress' ? 'border-green-500 bg-green-50' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{session.user_name || t('counsellorDashboard', 'anonymousUser', 'Anonymous User')}</h4>
                            {session.status === 'in_progress' && (
                              <Badge className="bg-green-500">{t('counsellorDashboard', 'inProgress', 'In Progress')}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {new Date(session.scheduled_at).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {new Date(session.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <Badge variant="outline">
                              {getTimeUntilSession(session)}
                            </Badge>
                          </div>
                          {session.topic && (
                            <p className="mt-2 text-sm text-gray-600">
                              <strong>{t('counsellorDashboard', 'topicLabel', 'Topic:')}</strong> {session.topic}
                            </p>
                          )}
                        </div>
                        <div>
                          {canJoinSession(session) ? (
                            <Button 
                              onClick={() => handleJoinSession(session)}
                              disabled={joiningSession}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              {joiningSession ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Video className="h-4 w-4 mr-2" />
                              )}
                              {session.status === 'in_progress' ? t('counsellorDashboard', 'rejoin', 'Rejoin') : t('counsellorDashboard', 'joinSession', 'Join Session')}
                            </Button>
                          ) : (
                            <Badge variant="secondary">
                              {t('counsellorDashboard', 'startsIn', 'Starts in {time}').replace('{time}', getTimeUntilSession(session))}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Past Sessions */}
          <div>
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <History className="h-5 w-5 text-gray-500" />
              {t('counsellorDashboard', 'sessionHistoryCount', 'Session History ({count})').replace('{count}', String(pastSessions.length))}
            </h3>
            {pastSessions.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <History className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">{t('counsellorDashboard', 'noPastSessions', 'No past sessions')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {pastSessions.slice(0, 10).map(session => (
                  <Card key={session.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{session.user_name || t('counsellorDashboard', 'anonymousUser', 'Anonymous User')}</h4>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                            <span>{new Date(session.scheduled_at).toLocaleDateString()}</span>
                            <span>{session.actual_duration || session.duration} min</span>
                            {session.topic && <span>{session.topic}</span>}
                          </div>
                        </div>
                        <Badge variant={session.status === 'completed' ? 'default' : 'secondary'}>
                          {session.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Availability Tab */}
        <TabsContent value="availability" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('counsellorDashboard', 'weeklyAvailability', 'Weekly Availability')}</CardTitle>
              <CardDescription>{t('counsellorDashboard', 'weeklyAvailabilityDesc', 'Set your available hours for each day of the week')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {DAYS_OF_WEEK.map(day => (
                <div key={day} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                  <div className="w-28">
                    <span className="font-medium capitalize">{day}</span>
                  </div>
                  <Switch
                    checked={availability[day]?.enabled || false}
                    onCheckedChange={(checked) => {
                      setAvailability({
                        ...availability,
                        [day]: {
                          ...availability[day],
                          enabled: checked,
                          start: availability[day]?.start || '09:00',
                          end: availability[day]?.end || '17:00'
                        }
                      });
                    }}
                  />
                  {availability[day]?.enabled && (
                    <>
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={availability[day]?.start || '09:00'}
                          onChange={(e) => {
                            setAvailability({
                              ...availability,
                              [day]: { ...availability[day], start: e.target.value }
                            });
                          }}
                          className="w-32"
                        />
                        <span>{t('counsellorDashboard', 'to', 'to')}</span>
                        <Input
                          type="time"
                          value={availability[day]?.end || '17:00'}
                          onChange={(e) => {
                            setAvailability({
                              ...availability,
                              [day]: { ...availability[day], end: e.target.value }
                            });
                          }}
                          className="w-32"
                        />
                      </div>
                    </>
                  )}
                  {!availability[day]?.enabled && (
                    <span className="text-gray-400">{t('counsellorDashboard', 'unavailable', 'Unavailable')}</span>
                  )}
                </div>
              ))}

              <Button onClick={handleSaveAvailability} disabled={saving} className="w-full mt-4">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {t('counsellorDashboard', 'saveAvailability', 'Save Availability')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reviews Tab */}
        <TabsContent value="reviews" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-500" />
                {t('counsellorDashboard', 'yourReviewsCount', 'Your Reviews ({count})').replace('{count}', String(reviews.length))}
              </CardTitle>
              <CardDescription>
                {t('counsellorDashboard', 'averageRatingValue', 'Average Rating: {rating} / 5.0').replace('{rating}', averageRating.toFixed(1))}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reviews.length === 0 ? (
                <div className="py-8 text-center">
                  <Star className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">{t('counsellorDashboard', 'noReviewsYet', 'No reviews yet')}</p>
                  <p className="text-sm text-gray-400">{t('counsellorDashboard', 'reviewsAppearHere', 'Reviews will appear here after completed sessions')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reviews.map(review => (
                    <div key={review.id} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            {[...Array(5)].map((_, i) => (
                              <Star 
                                key={i} 
                                className={`h-4 w-4 ${i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} 
                              />
                            ))}
                          </div>
                          {review.review_text && (
                            <p className="mt-2 text-gray-700">{review.review_text}</p>
                          )}
                          <p className="mt-2 text-sm text-gray-500">
                            {review.is_anonymous ? t('counsellorDashboard', 'anonymous', 'Anonymous') : review.user_name || t('counsellorDashboard', 'user', 'User')} • {new Date(review.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t('counsellorDashboard', 'yourProfile', 'Your Profile')}</CardTitle>
                  <CardDescription>{t('counsellorDashboard', 'yourProfileDesc', 'Manage your counsellor profile information')}</CardDescription>
                </div>
                <Button 
                  variant={editingProfile ? 'default' : 'outline'}
                  onClick={() => {
                    if (editingProfile) {
                      handleSaveProfile();
                    } else {
                      setEditingProfile(true);
                    }
                  }}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : editingProfile ? (
                    <Save className="h-4 w-4 mr-2" />
                  ) : (
                    <Edit className="h-4 w-4 mr-2" />
                  )}
                  {editingProfile ? t('counsellorDashboard', 'saveChanges', 'Save Changes') : t('counsellorDashboard', 'editProfile', 'Edit Profile')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Profile Image */}
              <div className="flex items-center gap-4">
                <img
                  src={profile.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.full_name)}&background=7c3aed&color=fff`}
                  alt={profile.full_name}
                  className="w-20 h-20 rounded-full object-cover border-4 border-purple-100"
                />
                <div>
                  <h3 className="font-semibold text-lg">{profile.full_name}</h3>
                  <p className="text-purple-600">{profile.title}</p>
                  {profile.is_verified && (
                    <Badge className="mt-1 bg-blue-100 text-blue-700">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {t('counsellorDashboard', 'verifiedCounsellor', 'Verified Counsellor')}
                    </Badge>
                  )}
                </div>
              </div>

              {editingProfile ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{t('counsellorDashboard', 'fullName', 'Full Name')}</Label>
                      <Input
                        value={profileForm.full_name || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>{t('counsellorDashboard', 'title', 'Title')}</Label>
                      <Input
                        value={profileForm.title || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, title: e.target.value })}
                        placeholder={t('counsellorDashboard', 'titlePlaceholder', 'e.g., Senior Pastor')}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>{t('counsellorDashboard', 'bio', 'Bio')}</Label>
                    <Textarea
                      value={profileForm.bio || ''}
                      onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                      rows={4}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{t('counsellorDashboard', 'email', 'Email')}</Label>
                      <Input
                        type="email"
                        value={profileForm.email || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>{t('counsellorDashboard', 'phone', 'Phone')}</Label>
                      <Input
                        value={profileForm.phone || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>{t('counsellorDashboard', 'hourlyRateDollar', 'Hourly Rate ($)')}</Label>
                    <Input
                      type="number"
                      value={profileForm.hourly_rate || ''}
                      onChange={(e) => setProfileForm({ ...profileForm, hourly_rate: parseFloat(e.target.value) || 0 })}
                      placeholder={t('counsellorDashboard', 'hourlyRatePlaceholder', '0 for free sessions')}
                    />
                  </div>

                  <div>
                    <Label>{t('counsellorDashboard', 'specializations', 'Specializations')}</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {SPECIALIZATIONS.map(spec => (
                        <Badge
                          key={spec}
                          variant={profileForm.specialization?.includes(spec) ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => {
                            const current = profileForm.specialization || [];
                            if (current.includes(spec)) {
                              setProfileForm({ ...profileForm, specialization: current.filter(s => s !== spec) });
                            } else {
                              setProfileForm({ ...profileForm, specialization: [...current, spec] });
                            }
                          }}
                        >
                          {spec}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label>{t('counsellorDashboard', 'languages', 'Languages')}</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {LANGUAGES.map(lang => (
                        <Badge
                          key={lang}
                          variant={profileForm.languages?.includes(lang) ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => {
                            const current = profileForm.languages || [];
                            if (current.includes(lang)) {
                              setProfileForm({ ...profileForm, languages: current.filter(l => l !== lang) });
                            } else {
                              setProfileForm({ ...profileForm, languages: [...current, lang] });
                            }
                          }}
                        >
                          {lang}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <Button variant="outline" onClick={() => setEditingProfile(false)}>
                    {t('counsellorDashboard', 'cancel', 'Cancel')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label className="text-gray-500">{t('counsellorDashboard', 'bio', 'Bio')}</Label>
                    <p className="mt-1">{profile.bio || t('counsellorDashboard', 'noBioProvided', 'No bio provided')}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-500">{t('counsellorDashboard', 'email', 'Email')}</Label>
                      <p className="mt-1 flex items-center gap-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        {profile.email || t('counsellorDashboard', 'notProvided', 'Not provided')}
                      </p>
                    </div>
                    <div>
                      <Label className="text-gray-500">{t('counsellorDashboard', 'phone', 'Phone')}</Label>
                      <p className="mt-1 flex items-center gap-2">
                        <Phone className="h-4 w-4 text-gray-400" />
                        {profile.phone || t('counsellorDashboard', 'notProvided', 'Not provided')}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-gray-500">{t('counsellorDashboard', 'hourlyRate', 'Hourly Rate')}</Label>
                    <p className="mt-1">
                      {profile.hourly_rate ? t('counsellorDashboard', 'ratePerHour', '${rate}/hour').replace('{rate}', String(profile.hourly_rate)) : t('counsellorDashboard', 'freeSessions', 'Free sessions')}
                    </p>
                  </div>

                  <div>
                    <Label className="text-gray-500">{t('counsellorDashboard', 'specializations', 'Specializations')}</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {profile.specialization?.map(spec => (
                        <Badge key={spec} variant="secondary">{spec}</Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-gray-500">{t('counsellorDashboard', 'languages', 'Languages')}</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {profile.languages?.map(lang => (
                        <Badge key={lang} variant="outline">{lang}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Decline Modal */}
      <Dialog open={showDeclineModal} onOpenChange={setShowDeclineModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('counsellorDashboard', 'declineSessionRequest', 'Decline Session Request')}</DialogTitle>
            <DialogDescription>
              {t('counsellorDashboard', 'declineReasonPrompt', 'Please provide a reason for declining this session (optional)')}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder={t('counsellorDashboard', 'declineReasonPlaceholder', 'e.g., Schedule conflict, not available during this time...')}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeclineModal(false)}>
              {t('counsellorDashboard', 'cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeclineSession}>
              {t('counsellorDashboard', 'declineSession', 'Decline Session')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video Call Modal */}
      {showVideoModal && selectedSession && activeSessionId && profile && (
        <div className="fixed inset-0 z-50 bg-black">
          <CounsellingVideoSession
            sessionId={activeSessionId}
            roomName={`counselling-${activeSessionId}`}
            userName={profile.full_name}
            userId={profile.user_id}
            isHost={true}
            onCallEnd={() => {
              setShowVideoModal(false);
              setActiveSessionId(null);
              setSelectedSession(null);
              loadData();
            }}
            onSessionComplete={(duration) => {
              handleEndSession(duration);
            }}
            autoJoin={true}
          />
        </div>
      )}
    </div>
  );
};

export default CounsellorDashboard;