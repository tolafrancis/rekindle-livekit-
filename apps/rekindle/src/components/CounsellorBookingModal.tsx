import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, Loader2, Lock, Crown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notify';
import { useUpgradePrompt } from '@/hooks/useUpgradePrompt';
import { UpgradePromptModal } from './UpgradePromptModal';
import { toast } from '@/components/ui/use-toast';
import { Counsellor } from './CounsellorCard';

interface Props {
  counsellor: Counsellor | null;
  open: boolean;
  onClose: () => void;
  onBooked: () => void;
}

const topics = ['Discipleship', 'Prayer Life', 'Bible Study', 'Spiritual Growth', 'Marriage', 'Family', 'Career', 'Healing', 'Deliverance', 'Leadership'];
const timeSlots = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00', '19:00', '20:00'];

export const CounsellorBookingModal: React.FC<Props> = ({ counsellor, open, onClose, onBooked }) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const entitlements = useUserEntitlements();
  
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const canBookCounsellor = entitlements.canBookCounsellor;
  const { activePrompt, show: showUpgradePrompt, dismiss: dismissUpgradePrompt } = useUpgradePrompt();

  const handleBook = async () => {
    if (!date || !time || !topic || !counsellor) {
      toast({ title: t('counsellorBookingModal', 'error', 'Error'), description: t('counsellorBookingModal', 'fillRequiredFields', 'Please fill all required fields'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
      
      // Insert directly into counselling_sessions table
      const { data, error } = await supabase
        .from('counselling_sessions')
        .insert({
          counsellor_id: counsellor.id,
          user_id: user?.id,
          user_name: profile?.full_name || 'Anonymous',
          scheduled_at: scheduledAt,
          duration: 30,
          topic,
          notes,
          status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      
      // Notify the counsellor
      try {
        notify({
          type: 'devotional_reminder',
          title: '\U0001f4c5 ' + t('counsellorBookingModal', 'newSessionBooking', 'New Session Booking'),
          body: t('counsellorBookingModal', 'sessionRequestedBody', '{name} has requested a session on {date} at {time}').replace('{name}', String(profile?.full_name || t('counsellorBookingModal', 'aUser', 'A user'))).replace('{date}', String(date)).replace('{time}', String(time)),
          userId: counsellor.user_id || counsellor.id,
          senderName: profile?.full_name,
        });
      } catch (notifyError) {
        console.error('Failed to send counsellor notification:', notifyError);
      }
      
      toast({ title: t('counsellorBookingModal', 'bookingRequested', 'Booking Requested'), description: t('counsellorBookingModal', 'bookingRequestedDesc', 'Session with {name} requested for {date} at {time}').replace('{name}', String(counsellor.name)).replace('{date}', String(date)).replace('{time}', String(time)) });
      onBooked();
      onClose();
      setDate(''); setTime(''); setTopic(''); setNotes('');
    } catch (err: any) {
      console.error('Booking error:', err);
      toast({ title: t('counsellorBookingModal', 'error', 'Error'), description: err.message || t('counsellorBookingModal', 'failedToBook', 'Failed to book session'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!counsellor) return null;

  
  const imageUrl = counsellor.avatar_url || counsellor.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(counsellor.name)}&background=7c3aed&color=fff`;
  const specializations = counsellor.specialty ? [counsellor.specialty] : (counsellor.specializations || []);
  const minDate = new Date().toISOString().split('T')[0];

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('counsellorBookingModal', 'bookSessionWith', 'Book Session with {name}').replace('{name}', String(counsellor.name))}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
            <img 
              src={imageUrl} 
              alt={counsellor.name} 
              className="w-12 h-12 rounded-full object-cover" 
            />
            <div>
              <p className="font-semibold">{counsellor.name}</p>
              <p className="text-sm text-gray-600">
                {specializations.join(', ') || t('counsellorBookingModal', 'spiritualCounselling', 'Spiritual Counselling')}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('counsellorBookingModal', 'date', 'Date')}</Label>
              <Input 
                type="date" 
                min={minDate} 
                value={date} 
                onChange={e => setDate(e.target.value)}
                disabled={!canBookCounsellor}
              />
            </div>
            <div>
              <Label>{t('counsellorBookingModal', 'time', 'Time')}</Label>
              <Select value={time} onValueChange={setTime} disabled={!canBookCounsellor}>
                <SelectTrigger>
                  <SelectValue placeholder={t('counsellorBookingModal', 'select', 'Select')} />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map(slot => (
                    <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label>{t('counsellorBookingModal', 'topic', 'Topic')}</Label>
            <Select value={topic} onValueChange={setTopic} disabled={!canBookCounsellor}>
              <SelectTrigger>
                <SelectValue placeholder={t('counsellorBookingModal', 'selectTopic', 'Select topic')} />
              </SelectTrigger>
              <SelectContent>
                {topics.map(topicOption => (
                  <SelectItem key={topicOption} value={topicOption}>{topicOption}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label>{t('counsellorBookingModal', 'notesOptional', 'Notes (optional)')}</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t('counsellorBookingModal', 'notesPlaceholder', "Any specific questions or topics you'd like to discuss...")}
              rows={3}
              disabled={!canBookCounsellor}
            />
          </div>
          
          <Button 
            onClick={handleBook} 
            disabled={loading || !canBookCounsellor} 
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('counsellorBookingModal', 'booking', 'Booking...')}
              </>
            ) : !canBookCounsellor ? (
              <>
                <Lock className="h-4 w-4 mr-2" />
                {t('counsellorBookingModal', 'premiumRequired', 'Premium Required')}
              </>
            ) : (
              <>
                <Calendar className="h-4 w-4 mr-2" />
                {t('counsellorBookingModal', 'requestBooking', 'Request Booking')}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <UpgradePromptModal
      prompt={activePrompt}
      onClose={dismissUpgradePrompt}
      onUpgrade={() => {}}
    />
    </>
  );
};

// Backward compatibility - export as MentorBookingModal alias
export { CounsellorBookingModal as MentorBookingModal };