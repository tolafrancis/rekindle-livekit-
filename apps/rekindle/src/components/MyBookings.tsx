import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/components/ui/use-toast';
import { SessionRatingModal } from './SessionRatingModal';
import CounsellingVideoSession from './CounsellingVideoSession';
import { 
  Calendar, Clock, User, MessageSquare, XCircle, CheckCircle, 
  Loader2, RefreshCw, Video, Star, AlertCircle 
} from 'lucide-react';

interface CounsellingSession {
  id: string;
  counsellor_id: string;
  user_id: string;
  user_name?: string;
  scheduled_at: string;
  duration: number;
  topic?: string;
  notes?: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'in_progress';
  daily_room_url?: string;
  daily_room_name?: string;
  created_at: string;
  counsellor?: {
    id: string;
    full_name: string;
    title?: string;
    profile_image_url?: string;
    specialization?: string[];
  };
  has_review?: boolean;
}

export const MyBookings: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [bookings, setBookings] = useState<CounsellingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [joiningSession, setJoiningSession] = useState<string | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<CounsellingSession | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [sessionToRate, setSessionToRate] = useState<CounsellingSession | null>(null);

  const loadBookings = useCallback(async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('counselling_sessions')
        .select(`
          *,
          counsellor:counsellors(id, full_name, title, profile_image_url, specialization)
        `)
        .eq('user_id', user.id)
        .order('scheduled_at', { ascending: false });

      if (error) throw error;

      // Check which sessions have reviews
      const sessionIds = data?.map(s => s.id) || [];
      let reviewedSessionIds: string[] = [];
      
      if (sessionIds.length > 0) {
        const { data: reviews } = await supabase
          .from('counsellor_reviews')
          .select('session_id')
          .eq('user_id', user.id)
          .in('session_id', sessionIds);
        
        reviewedSessionIds = reviews?.map(r => r.session_id) || [];
      }

      const bookingsWithReviewStatus = data?.map(booking => ({
        ...booking,
        has_review: reviewedSessionIds.includes(booking.id)
      })) || [];

      setBookings(bookingsWithReviewStatus);

      // Check for completed sessions without reviews to prompt rating
      const unratedCompletedSession = bookingsWithReviewStatus.find(
        b => b.status === 'completed' && !b.has_review
      );
      
      if (unratedCompletedSession) {
        setSessionToRate(unratedCompletedSession);
        setShowRatingModal(true);
      }
    } catch (err: any) {
      console.error('Failed to load bookings:', err);
      toast({ title: t('myBookings', 'error', 'Error'), description: t('myBookings', 'failedLoad', 'Failed to load bookings'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const handleCancelBooking = async (bookingId: string) => {
    if (!confirm(t('myBookings', 'confirmCancel', 'Are you sure you want to cancel this booking?'))) return;

    try {
      const { error } = await supabase
        .from('counselling_sessions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', bookingId);

      if (error) throw error;

      toast({ title: t('myBookings', 'success', 'Success'), description: t('myBookings', 'bookingCancelled', 'Booking cancelled successfully') });
      loadBookings();
    } catch (err: any) {
      toast({ title: t('myBookings', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleJoinSession = (booking: CounsellingSession) => {
    if (!user) return;
    // LiveKit-only: the session joins via CounsellingVideoSession (useDailyRoom ->
    // livekit-token, role derived server-side). No Daily room / iframe.
    setSelectedSession(booking);
    setShowVideoModal(true);
  };

  const handleLeaveSession = () => {
    setShowVideoModal(false);
    setSelectedSession(null);
    loadBookings();
  };

  const canJoinSession = (booking: CounsellingSession) => {
    if (booking.status !== 'confirmed' && booking.status !== 'in_progress') return false;
    const scheduledTime = new Date(booking.scheduled_at).getTime();
    const now = Date.now();
    const fiveMinutesBefore = scheduledTime - 5 * 60 * 1000;
    const twoHoursAfter = scheduledTime + 2 * 60 * 60 * 1000;
    return now >= fiveMinutesBefore && now <= twoHoursAfter;
  };

  const getTimeUntilSession = (booking: CounsellingSession) => {
    const scheduledTime = new Date(booking.scheduled_at).getTime();
    const now = Date.now();
    const diff = scheduledTime - now;
    
    if (diff <= 0) return t('myBookings', 'now', 'Now');
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const upcomingBookings = bookings.filter(b => 
    ['pending', 'confirmed', 'in_progress'].includes(b.status) && 
    new Date(b.scheduled_at) >= new Date(Date.now() - 2 * 60 * 60 * 1000)
  );
  
  const pastBookings = bookings.filter(b => 
    b.status === 'completed' || 
    (b.status === 'confirmed' && new Date(b.scheduled_at) < new Date(Date.now() - 2 * 60 * 60 * 1000))
  );
  
  const cancelledBookings = bookings.filter(b => b.status === 'cancelled');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">{t('myBookings', 'statusPending', 'Pending')}</Badge>;
      case 'confirmed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{t('myBookings', 'statusConfirmed', 'Confirmed')}</Badge>;
      case 'in_progress':
        return <Badge className="bg-green-500">{t('myBookings', 'statusInProgress', 'In Progress')}</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{t('myBookings', 'statusCompleted', 'Completed')}</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{t('myBookings', 'statusCancelled', 'Cancelled')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const BookingCard: React.FC<{ booking: CounsellingSession }> = ({ booking }) => {
    const counsellor = booking.counsellor;
    const imageUrl = counsellor?.profile_image_url || 
      `https://ui-avatars.com/api/?name=${encodeURIComponent(counsellor?.full_name || 'Counsellor')}&background=7c3aed&color=fff`;
    const scheduledDate = new Date(booking.scheduled_at);
    const isPast = scheduledDate < new Date(Date.now() - 2 * 60 * 60 * 1000);
    const canCancel = ['pending', 'confirmed'].includes(booking.status) && !isPast;
    const canJoin = canJoinSession(booking);
    const showRateButton = booking.status === 'completed' && !booking.has_review;

    return (
      <Card className={`hover:shadow-md transition-shadow ${booking.status === 'in_progress' ? 'border-green-500 bg-green-50' : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <img 
              src={imageUrl}
              alt={counsellor?.full_name || t('myBookings', 'counsellor', 'Counsellor')}
              className="w-14 h-14 rounded-full object-cover border-2 border-purple-100"
            />
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {counsellor?.full_name || t('myBookings', 'unknownCounsellor', 'Unknown Counsellor')}
                  </h3>
                  {counsellor?.title && (
                    <p className="text-sm text-purple-600">{counsellor.title}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(booking.status)}
                  {canJoin && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      {getTimeUntilSession(booking)}
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4" />
                  <span>{scheduledDate.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric'
                  })}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4" />
                  <span>{scheduledDate.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })} ({booking.duration} {t('myBookings', 'minShort', 'min')})</span>
                </div>
                {booking.topic && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MessageSquare className="h-4 w-4" />
                    <span>{booking.topic}</span>
                  </div>
                )}
              </div>

              {booking.notes && (
                <p className="mt-2 text-sm text-gray-500 bg-gray-50 p-2 rounded">
                  {booking.notes}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {canJoin && (
                  <Button 
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleJoinSession(booking)}
                    disabled={joiningSession === booking.id}
                  >
                    {joiningSession === booking.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Video className="h-4 w-4 mr-1" />
                    )}
                    {booking.status === 'in_progress' ? t('myBookings', 'rejoinSession', 'Rejoin Session') : t('myBookings', 'joinSession', 'Join Session')}
                  </Button>
                )}
                
                {showRateButton && (
                  <Button 
                    size="sm"
                    variant="outline"
                    className="text-amber-600 hover:bg-amber-50"
                    onClick={() => {
                      setSessionToRate(booking);
                      setShowRatingModal(true);
                    }}
                  >
                    <Star className="h-4 w-4 mr-1" />
                    {t('myBookings', 'rateSession', 'Rate Session')}
                  </Button>
                )}

                {booking.has_review && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    {t('myBookings', 'reviewed', 'Reviewed')}
                  </Badge>
                )}

                {canCancel && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleCancelBooking(booking.id)}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    {t('myBookings', 'cancel', 'Cancel')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
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
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600">
            {(upcomingBookings.length !== 1
              ? t('myBookings', 'upcomingCountPlural', 'You have {count} upcoming sessions')
              : t('myBookings', 'upcomingCountSingular', 'You have {count} upcoming session')
            ).replace('{count}', String(upcomingBookings.length))}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadBookings}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('myBookings', 'refresh', 'Refresh')}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="upcoming">
            {t('myBookings', 'tabUpcoming', 'Upcoming')} ({upcomingBookings.length})
          </TabsTrigger>
          <TabsTrigger value="past">
            {t('myBookings', 'tabPast', 'Past')} ({pastBookings.length})
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            {t('myBookings', 'tabCancelled', 'Cancelled')} ({cancelledBookings.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          {upcomingBookings.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('myBookings', 'noUpcomingTitle', 'No Upcoming Sessions')}</h3>
                <p className="text-gray-500">
                  {t('myBookings', 'noUpcomingDesc', 'Book a session with a counsellor to get started on your spiritual journey.')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {upcomingBookings.map(booking => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-4">
          {pastBookings.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('myBookings', 'noPastTitle', 'No Past Sessions')}</h3>
                <p className="text-gray-500">
                  {t('myBookings', 'noPastDesc', 'Your completed sessions will appear here.')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pastBookings.map(booking => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cancelled" className="mt-4">
          {cancelledBookings.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <XCircle className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('myBookings', 'noCancelledTitle', 'No Cancelled Sessions')}</h3>
                <p className="text-gray-500">
                  {t('myBookings', 'noCancelledDesc', 'Cancelled sessions will appear here.')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {cancelledBookings.map(booking => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Video Call Modal */}
      <Dialog open={showVideoModal} onOpenChange={(open) => {
        if (!open) handleLeaveSession();
      }}>
        <DialogContent className="max-w-5xl h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-green-500" />
              {t('myBookings', 'sessionWith', 'Counselling Session with {name}').replace('{name}', String(selectedSession?.counsellor?.full_name || t('myBookings', 'counsellor', 'Counsellor')))}
            </DialogTitle>
          </DialogHeader>
          {selectedSession && user && (
            <div className="flex-1 h-full">
              <CounsellingVideoSession
                sessionId={selectedSession.id}
                roomName={`counselling-${selectedSession.id}`}
                userName={user.user_metadata?.full_name || user.email || 'User'}
                userId={user.id}
                isHost={false}
                autoJoin
                onCallEnd={handleLeaveSession}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleLeaveSession}>
              {t('myBookings', 'leaveSession', 'Leave Session')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rating Modal */}
      {sessionToRate && (
        <SessionRatingModal
          isOpen={showRatingModal}
          onClose={() => {
            setShowRatingModal(false);
            setSessionToRate(null);
          }}
          sessionId={sessionToRate.id}
          counsellorId={sessionToRate.counsellor_id}
          counsellorName={sessionToRate.counsellor?.full_name || t('myBookings', 'counsellor', 'Counsellor')}
          onRatingSubmitted={loadBookings}
        />
      )}
    </div>
  );
};

export default MyBookings;
