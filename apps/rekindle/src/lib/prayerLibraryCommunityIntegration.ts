// Updated imports section for PrayerLibrary.tsx
import { 
  postPrayerSeriesStarted,
  postPrayerSeriesCompleted,
  postPrayerSeriesDayCompleted,
  postPrayerWatchJoined,
  postPrayerWatchCompleted,
  postPrayerTopicCompleted
} from '@/lib/communityActivityService';

// Add this function to be inserted into PrayerLibrary component after the existing functions

// ====== COMMUNITY ACTIVITY INTEGRATION ======

/**
 * Handle prayer session completion and post to community feed
 */
const handlePrayerSessionComplete = async (sessionData: any) => {
  if (!user || !profile) return;

  const duration = sessionData.duration_minutes || selectedDuration;
  
  try {
    // Post to community activity feed
    await postPrayerTopicCompleted(
      user.id,
      profile.full_name || profile.email || 'Anonymous',
      profile.avatar_url,
      sessionData.id,
      sessionData.title,
      duration
    );

    // Update local prayer history
    await supabase
      .from('prayer_history')
      .insert({
        user_id: user.id,
        prayer_title: sessionData.title,
        duration_minutes: duration,
        prayed_at: new Date().toISOString()
      });

    await loadPrayerHistory();
    
    toast({ 
      title: 'Prayer Completed! 🙏', 
      description: 'Your prayer activity has been shared with the community' 
    });
  } catch (error) {
    console.error('Error completing prayer session:', error);
    toast({ 
      title: 'Prayer Saved', 
      description: 'Your prayer was saved locally',
      variant: 'default'
    });
  }
};

/**
 * Handle prayer watch session completion and post to community feed
 */
const handlePrayerWatchComplete = async (sessionData: any, timeSlot: string, watchLabel: string) => {
  if (!user || !profile || !selectedPrayerWatchTopic) return;

  const duration = sessionData.duration_minutes;
  
  try {
    // Post to community activity feed
    await postPrayerWatchCompleted(
      user.id,
      profile.full_name || profile.email || 'Anonymous',
      profile.avatar_url,
      sessionData.id,
      selectedPrayerWatchTopic.name,
      duration
    );

    // Update local prayer history
    await supabase
      .from('prayer_history')
      .insert({
        user_id: user.id,
        prayer_title: `${watchLabel} - ${selectedPrayerWatchTopic.name}`,
        duration_minutes: duration,
        prayer_watch_topic: selectedPrayerWatchTopic.id,
        prayer_watch_time: timeSlot,
        prayed_at: new Date().toISOString()
      });

    await loadPrayerHistory();
    
    toast({ 
      title: 'Prayer Watch Completed! 🔥', 
      description: 'Your faithful watch has been recorded' 
    });
  } catch (error) {
    console.error('Error completing prayer watch:', error);
  }
};

/**
 * Handle joining a prayer watch - post to community
 */
const handleJoinPrayerWatch = async (timeSlot: string, watchLabel: string) => {
  if (!user || !profile || !selectedPrayerWatchTopic) return;

  try {
    // Post to community activity feed about joining
    await postPrayerWatchJoined(
      user.id,
      profile.full_name || profile.email || 'Anonymous',
      profile.avatar_url,
      selectedPrayerWatchTopic.id,
      selectedPrayerWatchTopic.name,
      watchLabel
    );

    toast({ 
      title: 'Joined Prayer Watch!', 
      description: `You've joined the ${watchLabel} watch` 
    });
  } catch (error) {
    console.error('Error joining prayer watch:', error);
  }
};

// ====== UPDATE EXISTING FUNCTIONS ======

// REPLACE the existing startPrayerSession function with this updated version:
const startPrayerSession = async () => {
  if (!selectedTopic) return;
  
  const devotionalData = {
    id: selectedTopic.id,
    title: selectedTopic.title,
    content: selectedTopic.description,
    scripture_reference: selectedTopic.scripture_reference || '',
    scripture_text: selectedTopic.scripture_text || '',
    prayer_points: selectedTopic.prayer_points,
    reflection: '',
    duration_minutes: selectedDuration,
    audio_url: '',
    image_url: selectedTopic.cover_image_url || ''
  };

  setSessionData(devotionalData);
  setShowDurationModal(false);
  setShowPrayerSession(true);
};

// REPLACE the existing startPrayerWatchSession function with this updated version:
const startPrayerWatchSession = async (timeSlot: string, watchLabel: string) => {
  if (!selectedPrayerWatchTopic) return;

  const prayer = prayerWatchEntries.find(p => 
    p.prayer_watch_time === timeSlot && 
    p.prayer_watch_topic === selectedPrayerWatchTopic.id
  );

  if (!prayer) {
    toast({ 
      title: 'No Prayer Content', 
      description: `No prayer content available for ${selectedPrayerWatchTopic.name} at this time.`,
      variant: 'destructive'
    });
    return;
  }

  // Post about joining the prayer watch
  await handleJoinPrayerWatch(timeSlot, watchLabel);

  const devotionalData = {
    id: prayer.id,
    title: `${watchLabel} - ${selectedPrayerWatchTopic.name}`,
    content: prayer.content,
    scripture_reference: prayer.scripture_reference || '',
    scripture_text: prayer.scripture_text || '',
    prayer_points: prayer.prayer_points,
    reflection: '',
    duration_minutes: prayer.duration_minutes,
    audio_url: '',
    image_url: '',
    isPrayerWatch: true,
    prayerWatchTime: timeSlot,
    prayerWatchLabel: watchLabel
  };

  setSessionData(devotionalData);
  setShowPrayerSession(true);
};

// ====== USAGE IN COMPONENT ======

// When DevotionalModule (prayer session) completes, call this:
// In the DevotionalModule onComplete handler, update to call handlePrayerSessionComplete

// Add this prop to DevotionalModule component invocation:
/*
<DevotionalModule
  data={sessionData}
  onComplete={(completedData) => {
    if (completedData.isPrayerWatch) {
      handlePrayerWatchComplete(
        completedData, 
        completedData.prayerWatchTime, 
        completedData.prayerWatchLabel
      );
    } else {
      handlePrayerSessionComplete(completedData);
    }
    setShowPrayerSession(false);
    setSessionData(null);
  }}
  onClose={() => {
    setShowPrayerSession(false);
    setSessionData(null);
  }}
/>
*/

export {
  handlePrayerSessionComplete,
  handlePrayerWatchComplete,
  handleJoinPrayerWatch
};