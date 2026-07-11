/**
 * ============================================================================
 * SKELETON.TSX - Meeting Share Link Join Page
 * ============================================================================
 * 
 * PURPOSE:
 * This component handles the complete flow for users clicking on shared
 * meeting links. It resolves meeting URLs, validates access, handles 
 * authentication, and redirects users to the appropriate meeting interface.
 * 
 * ROUTES HANDLED:
 * - /channel/:channelId/meeting/:meetingId (Channel meetings)
 * - /ministry/:ministryId/meeting/:meetingId (Ministry meetings)
 * 
 * KEY FUNCTIONS:
 * 
 * 1. MEETING VALIDATION
 *    - Fetches meeting data from database using meeting ID
 *    - Validates meeting exists and belongs to specified channel/ministry
 *    - Calculates meeting status (scheduled/live/ended)
 *    - Retrieves host information
 * 
 * 2. AUTHENTICATION HANDLING
 *    - Detects if user is authenticated
 *    - Shows login/signup forms for unauthenticated users
 *    - Preserves meeting context during auth flow
 *    - Auto-redirects after successful authentication
 * 
 * 3. MEETING ACCESS CONTROL
 *    - Prevents joining expired/ended meetings
 *    - Shows appropriate UI for scheduled meetings
 *    - Enables join button only for live meetings
 *    - Displays meeting status with visual badges
 * 
 * 4. ERROR HANDLING
 *    - Invalid meeting IDs
 *    - Meeting not found
 *    - Expired meetings
 *    - Network failures
 *    - Database errors
 * 
 * 5. USER REDIRECTION
 *    - Authenticated users: Auto-join after 1 second
 *    - After auth: Redirects to Live Channels or Ministry with meeting context
 *    - Preserves meeting ID in navigation state
 *    - Seamless transition to meeting interface
 * 
 * WORKFLOW:
 * 
 * Unauthenticated User:
 * 1. User clicks shared meeting link
 * 2. Component loads and validates meeting
 * 3. Displays meeting info + login/signup forms
 * 4. User authenticates
 * 5. Auto-redirects to meeting
 * 6. Meeting opens automatically
 * 
 * Authenticated User:
 * 1. User clicks shared meeting link
 * 2. Component validates meeting and user
 * 3. Shows "Join Meeting Now" button
 * 4. User clicks join (or auto-joins after 1s)
 * 5. Redirects to appropriate interface
 * 6. Meeting opens automatically
 * 
 * PREVENTS:
 * - 404 errors on meeting links
 * - Unauthorized meeting access
 * - Joining expired meetings
 * - Malformed URL handling
 * - Environment mismatched links
 * 
 * INTEGRATIONS:
 * - LiveChannelInteractiveMeetings: Generates channel meeting links
 * - MinistryInteractiveMeetings: Generates ministry meeting links
 * - AppLayout: Receives meeting context for auto-opening
 * - AuthContext: Handles authentication state
 * - Supabase: Validates meetings and fetches data
 * 
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/components/ui/use-toast';
import {
  Loader2,
  Video,
  Calendar,
  Clock,
  Users,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  Home,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Shield,
  Sparkles
} from 'lucide-react';

interface MeetingData {
  id: string;
  title: string;
  description: string;
  scheduled_time: string | null;
  duration_minutes: number;
  room_name: string;
  channel_id?: string;
  ministry_id?: string;
  host_name?: string;
  status: 'scheduled' | 'live' | 'ended';
  max_participants?: number;
  enable_chat: boolean;
  enable_recording: boolean;
  enable_screenshare: boolean;
  is_active: boolean;
  ended_at?: string | null;
}

const Skeleton: React.FC = () => {
  const { channelId, ministryId, meetingId } = useParams<{ 
    channelId?: string; 
    ministryId?: string; 
    meetingId: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading: authLoading, signIn, signUp } = useAuth();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meetingData, setMeetingData] = useState<MeetingData | null>(null);
  
  // Auth form state
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading2, setAuthLoading2] = useState(false);
  // Guest join state
  const [guestName, setGuestName] = useState('');

  const meetingType = channelId ? 'channel' : 'ministry';

  // Fetch meeting data
  useEffect(() => {
    if (!meetingId) {
      setError(t('skeleton', 'invalidMeetingLink', 'Invalid meeting link'));
      setLoading(false);
      return;
    }

    console.log('[Skeleton] Fetching meeting:', { meetingId, channelId, ministryId });

    const fetchMeetingData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Use the correct table based on meeting type
        const tableName = channelId ? 'live_channel_video_meetings' : 'ministry_video_meetings';
        
        console.log('[Skeleton] Querying table:', tableName);

        // First, fetch the meeting by ID only
        const { data: meeting, error: meetingError } = await supabase
          .from(tableName)
          .select('*')
          .eq('id', meetingId)
          .maybeSingle();

        console.log('[Skeleton] Meeting query result:', { meeting, meetingError });

        if (meetingError) {
          console.error('Meeting fetch error:', meetingError);
          throw meetingError;
        }

        if (!meeting) {
          setError(t('skeleton', 'meetingNotFoundOrInvalid', 'Meeting not found or link is invalid'));
          setLoading(false);
          return;
        }

        // Validate that meeting belongs to the specified channel/ministry
        if (channelId && meeting.channel_id !== channelId) {
          setError(t('skeleton', 'meetingNotInChannel', 'Meeting does not belong to this channel'));
          setLoading(false);
          return;
        }

        if (ministryId && meeting.ministry_id !== ministryId) {
          setError(t('skeleton', 'meetingNotInMinistry', 'Meeting does not belong to this ministry'));
          setLoading(false);
          return;
        }

        // Check if meeting exists and is valid
        const now = new Date();
        const startTime = meeting.scheduled_time ? new Date(meeting.scheduled_time) : new Date();
        const endTime = new Date(startTime.getTime() + (meeting.duration_minutes || 60) * 60000);

        let status: 'scheduled' | 'live' | 'ended' = 'scheduled';
        
        // If meeting is currently active in database, it's live
        if (meeting.is_active) {
          status = 'live';
        } else if (now >= startTime && now <= endTime) {
          status = 'live';
        } else if (now > endTime || meeting.ended_at) {
          status = 'ended';
        }

        // Fetch host name
        let hostName = t('skeleton', 'unknownHost', 'Unknown Host');
        if (channelId || meeting.channel_id) {
          const { data: channel } = await supabase
            .from('live_channels')
            .select('owner_name')
            .eq('id', channelId || meeting.channel_id)
            .maybeSingle();
          hostName = channel?.owner_name || t('skeleton', 'unknownHost', 'Unknown Host');
        } else if (ministryId || meeting.ministry_id) {
          const { data: ministry } = await supabase
            .from('ministries')
            .select('name')
            .eq('id', ministryId || meeting.ministry_id)
            .maybeSingle();
          hostName = ministry?.name || 'Unknown Host';
        }

        setMeetingData({
          ...meeting,
          status,
          host_name: hostName
        });

      } catch (err: any) {
        console.error('[Skeleton] Error fetching meeting:', err);
        console.error('[Skeleton] Error details:', {
          message: err.message,
          code: err.code,
          details: err.details,
          hint: err.hint
        });
        setError(
          t('skeleton', 'failedToLoadMeeting', 'Failed to load meeting: {error}').replace(
            '{error}',
            String(err.message || t('skeleton', 'unknownError', 'Unknown error'))
          )
        );
      } finally {
        setLoading(false);
      }
    };

    fetchMeetingData();
  }, [meetingId, channelId, ministryId]);

  // Auto-join removed - let users click the button to join
  // This prevents unexpected redirects and gives users time to see meeting details

  // Handle login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: t('skeleton', 'error', 'Error'),
        description: t('skeleton', 'fillAllFields', 'Please fill in all fields'),
        variant: 'destructive'
      });
      return;
    }

    setAuthLoading2(true);
    try {
      const { error } = await signIn(email, password);
      if (error) throw error;

      toast({
        title: t('skeleton', 'welcomeBack', 'Welcome back!'),
        description: t('skeleton', 'nowSignedIn', 'You are now signed in')
      });
    } catch (error: any) {
      toast({
        title: t('skeleton', 'loginFailed', 'Login Failed'),
        description: error.message || t('skeleton', 'invalidCredentials', 'Invalid credentials'),
        variant: 'destructive'
      });
    } finally {
      setAuthLoading2(false);
    }
  };

  // Handle signup
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
      toast({
        title: t('skeleton', 'error', 'Error'),
        description: t('skeleton', 'fillAllFields', 'Please fill in all fields'),
        variant: 'destructive'
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: t('skeleton', 'error', 'Error'),
        description: t('skeleton', 'passwordMinLength', 'Password must be at least 6 characters'),
        variant: 'destructive'
      });
      return;
    }

    setAuthLoading2(true);
    try {
      const { error } = await signUp(email, password, fullName);
      if (error) throw error;

      toast({
        title: t('skeleton', 'accountCreated', 'Account Created!'),
        description: t('skeleton', 'checkEmailVerify', 'Please check your email to verify your account')
      });
    } catch (error: any) {
      toast({
        title: t('skeleton', 'signupFailed', 'Signup Failed'),
        description: error.message || t('skeleton', 'couldNotCreateAccount', 'Could not create account'),
        variant: 'destructive'
      });
    } finally {
      setAuthLoading2(false);
    }
  };

  // Handle joining the meeting (works for both authenticated and guest users)
  const handleJoinMeeting = async (overrideGuestName?: string) => {
    if (!meetingData) return;

    if (meetingData.status === 'ended') {
      toast({
        title: t('skeleton', 'meetingEnded', 'Meeting Ended'),
        description: t('skeleton', 'meetingAlreadyEnded', 'This meeting has already ended'),
        variant: 'destructive'
      });
      return;
    }

    if (meetingData.status === 'scheduled') {
      toast({
        title: t('skeleton', 'meetingNotStarted', 'Meeting Not Started'),
        description: t('skeleton', 'meetingNotStartedYet', 'This meeting has not started yet'),
        variant: 'destructive'
      });
      return;
    }

    // For guests: require a name before joining
    if (!user) {
      const nameToUse = overrideGuestName || guestName.trim();
      if (!nameToUse) {
        toast({
          title: t('skeleton', 'nameRequired', 'Name Required'),
          description: t('skeleton', 'enterNameToJoin', 'Please enter your name to join'),
          variant: 'destructive'
        });
        return;
      }
      // Store guest name so meeting components can use it after navigation
      sessionStorage.setItem('guestDisplayName', nameToUse);
    }

    setJoining(true);

    try {
      if (channelId) {
        navigate(`/?tab=live-channels&channelId=${channelId}&meetingId=${meetingId}&autoJoin=true`);
      } else if (ministryId) {
        navigate(`/ministries/${ministryId}/live?meetingId=${meetingId}&autoJoin=true`);
      }

      toast({
        title: t('skeleton', 'openingMeeting', 'Opening Meeting'),
        description: t('skeleton', 'takingYouToRoom', 'Taking you to the meeting room...')
      });
    } catch (error: any) {
      console.error('Error joining meeting:', error);
      toast({
        title: t('skeleton', 'failedToJoin', 'Failed to Join'),
        description: error.message || t('skeleton', 'couldNotJoinMeeting', 'Could not join meeting'),
        variant: 'destructive'
      });
    } finally {
      setJoining(false);
    }
  };

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-purple-600 mx-auto mb-4" />
            <p className="text-muted-foreground">{t('skeleton', 'loadingMeeting', 'Loading meeting...')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error || !meetingData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-6 w-6" />
              {t('skeleton', 'meetingNotFound', 'Meeting Not Found')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              {error || t('skeleton', 'linkInvalidOrExpired', 'This meeting link is invalid or has expired.')}
            </p>
            <div className="flex flex-col gap-2">
              <Button 
                onClick={() => navigate('/')}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600"
              >
                <Home className="h-4 w-4 mr-2" />
                {t('skeleton', 'goToHome', 'Go to Home')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not authenticated - show guest join + optional sign-in
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card className="overflow-hidden">
            {/* Meeting Header */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white">
              <div className="flex items-center gap-2 mb-2">
                <Video className="h-6 w-6" />
                <span className={`text-xs px-2 py-1 rounded-full ${
                  meetingData.status === 'live' ? 'bg-red-500 animate-pulse' :
                  meetingData.status === 'scheduled' ? 'bg-blue-500' : 'bg-gray-500'
                }`}>
                  {meetingData.status === 'live' ? t('skeleton', 'liveNow', 'LIVE NOW') :
                   meetingData.status === 'scheduled' ? t('skeleton', 'upcoming', 'UPCOMING') : t('skeleton', 'endedBadge', 'ENDED')}
                </span>
              </div>
              <h2 className="text-2xl font-bold mb-1">{meetingData.title}</h2>
              <p className="text-purple-100">{meetingData.description}</p>
            </div>

            <CardContent className="p-6 space-y-5">
              {/* Meeting Info */}
              <div className="space-y-2 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-purple-600" />
                  <span className="font-medium">{t('skeleton', 'hostedBy', 'Hosted by {name}').replace('{name}', String(meetingData.host_name))}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-purple-600" />
                  <span>
                    {meetingData.scheduled_time
                      ? new Date(meetingData.scheduled_time).toLocaleTimeString()
                      : t('skeleton', 'startTimeTbd', 'Start time TBD')}
                    {' '}{t('skeleton', 'durationMin', '({minutes} min)').replace('{minutes}', String(meetingData.duration_minutes))}
                  </span>
                </div>
              </div>

              {/* Guest Join Section */}
              {meetingData.status === 'live' && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-center">{t('skeleton', 'joinAsGuest', 'Join as Guest')}</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    {t('skeleton', 'enterNameNoAccount', 'Enter your name to join — no account needed')}
                  </p>
                  <Input
                    type="text"
                    placeholder={t('skeleton', 'yourNamePlaceholder', 'Your name (e.g. John Smith)')}
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleJoinMeeting(); }}
                    autoFocus
                  />
                  <Button
                    onClick={() => handleJoinMeeting()}
                    className="w-full h-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                    disabled={joining || !guestName.trim()}
                  >
                    {joining ? (
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    ) : (
                      <Video className="h-5 w-5 mr-2" />
                    )}
                    {t('skeleton', 'joinMeetingNow', 'Join Meeting Now')}
                  </Button>
                </div>
              )}

              {meetingData.status === 'scheduled' && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                  <Clock className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                  <p className="font-medium">{t('skeleton', 'meetingScheduled', 'Meeting Scheduled')}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {meetingData.scheduled_time
                      ? t('skeleton', 'startsAt', 'Starts at {time}').replace('{time}', new Date(meetingData.scheduled_time).toLocaleTimeString())
                      : t('skeleton', 'timeToBeAnnounced', 'Meeting time to be announced')}
                  </p>
                </div>
              )}

              {meetingData.status === 'ended' && (
                <div className="p-4 bg-gray-50 dark:bg-gray-900/20 rounded-lg text-center">
                  <AlertCircle className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                  <p className="font-medium">{t('skeleton', 'meetingEnded', 'Meeting Ended')}</p>
                </div>
              )}

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white dark:bg-gray-950 px-2 text-muted-foreground">
                    {t('skeleton', 'orSignInFullAccess', 'or sign in for full access')}
                  </span>
                </div>
              </div>

              {/* Auth Tabs */}
              <Tabs value={authTab} onValueChange={(v) => setAuthTab(v as 'login' | 'signup')}>
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="login">{t('skeleton', 'signIn', 'Sign In')}</TabsTrigger>
                  <TabsTrigger value="signup">{t('skeleton', 'createAccount', 'Create Account')}</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form onSubmit={handleLogin} className="space-y-3">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder={t('skeleton', 'emailAddress', 'Email address')}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder={t('skeleton', 'password', 'Password')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-purple-600 to-indigo-600"
                      disabled={authLoading2}
                    >
                      {authLoading2 ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                      {t('skeleton', 'signInAndJoin', 'Sign In & Join Meeting')}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup">
                  <form onSubmit={handleSignup} className="space-y-3">
                    <Input
                      type="text"
                      placeholder={t('skeleton', 'fullName', 'Full name')}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder={t('skeleton', 'emailAddress', 'Email address')}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder={t('skeleton', 'passwordMin6', 'Password (min 6 characters)')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-purple-600 to-indigo-600"
                      disabled={authLoading2}
                    >
                      {authLoading2 ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                      {t('skeleton', 'createAccountAndJoin', 'Create Account & Join')}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>

              <div className="text-center">
                <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                  <Home className="h-4 w-4 mr-2" />
                  {t('skeleton', 'goToHome', 'Go to Home')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // User authenticated - show join button
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md overflow-hidden">
        {/* Meeting Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Video className="h-6 w-6" />
            <span className={`text-xs px-2 py-1 rounded-full ${
              meetingData.status === 'live' ? 'bg-red-500 animate-pulse' : 
              meetingData.status === 'scheduled' ? 'bg-blue-500' : 'bg-gray-500'
            }`}>
              {meetingData.status === 'live' ? t('skeleton', 'liveNow', 'LIVE NOW') :
               meetingData.status === 'scheduled' ? t('skeleton', 'upcoming', 'UPCOMING') : t('skeleton', 'endedBadge', 'ENDED')}
            </span>
          </div>
          <h2 className="text-2xl font-bold mb-1">{meetingData.title}</h2>
          <p className="text-purple-100">{meetingData.description}</p>
        </div>

        <CardContent className="p-6 space-y-6">
          {/* Meeting Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Video className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="font-medium">{t('skeleton', 'hostedBy', 'Hosted by {name}').replace('{name}', String(meetingData.host_name))}</p>
                <div className="text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  {meetingData.scheduled_time ? new Date(meetingData.scheduled_time).toLocaleDateString() : t('skeleton', 'notScheduled', 'Not scheduled')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                {meetingData.scheduled_time ? new Date(meetingData.scheduled_time).toLocaleTimeString() : t('skeleton', 'startTimeTbd', 'Start time TBD')}
                {' '}{t('skeleton', 'durationMinutes', '({minutes} minutes)').replace('{minutes}', String(meetingData.duration_minutes))}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {meetingData.status === 'live' && (
              <Button
                onClick={handleJoinMeeting}
                className="w-full h-14 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                disabled={joining}
              >
                {joining ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <Video className="h-5 w-5 mr-2" />
                )}
                {t('skeleton', 'joinMeetingNow', 'Join Meeting Now')}
              </Button>
            )}

            {meetingData.status === 'scheduled' && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                <Clock className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <p className="font-medium">{t('skeleton', 'meetingScheduled', 'Meeting Scheduled')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {meetingData.scheduled_time
                    ? t('skeleton', 'willStartAt', 'This meeting will start at {time}').replace('{time}', new Date(meetingData.scheduled_time).toLocaleTimeString())
                    : t('skeleton', 'timeToBeAnnounced', 'Meeting time to be announced')}
                </p>
              </div>
            )}

            {meetingData.status === 'ended' && (
              <div className="p-4 bg-gray-50 dark:bg-gray-900/20 rounded-lg text-center">
                <AlertCircle className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                <p className="font-medium">{t('skeleton', 'meetingEnded', 'Meeting Ended')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('skeleton', 'meetingConcluded', 'This meeting has concluded')}
                </p>
              </div>
            )}
          </div>

          {/* Success indicator */}
          {meetingData.status === 'live' && (
            <div className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              <span>{t('skeleton', 'readyToJoin', 'Ready to join')}</span>
            </div>
          )}

          {/* Back to home */}
          <Button 
            variant="ghost" 
            className="w-full"
            onClick={() => navigate('/')}
          >
            <Home className="h-4 w-4 mr-2" />
            {t('skeleton', 'goToHome', 'Go to Home')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Skeleton;