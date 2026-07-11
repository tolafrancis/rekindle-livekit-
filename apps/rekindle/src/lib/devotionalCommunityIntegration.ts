// DevotionalLibrary and DevotionalSeriesViewer Community Activity Integration
// This file contains the updates needed for devotional components

import { 
  postDevotionalStarted,
  postDevotionalCompleted,
  postDevotionalDayCompleted
} from '@/lib/communityActivityService';

// ====== ADD THESE IMPORTS TO DevotionalSeriesViewer.tsx ======
/*
import { 
  postDevotionalStarted,
  postDevotionalCompleted,
  postDevotionalDayCompleted
} from '@/lib/communityActivityService';
*/

// ====== ADD THIS STATE VARIABLE TO DevotionalSeriesViewer ======
/*
const [hasPostedSeriesStart, setHasPostedSeriesStart] = useState(false);
*/

// ====== ADD THESE FUNCTIONS TO DevotionalSeriesViewer COMPONENT ======

/**
 * Post community activity when starting a devotional series (first time only)
 */
const handleDevotionalSeriesStart = async (series: Series, progress: UserProgress) => {
  if (!user || !profile) return;
  
  // Only post if this is the first time starting (no completed days yet)
  if (!hasPostedSeriesStart && progress.completed_days.length === 0) {
    try {
      await postDevotionalStarted(
        user.id,
        profile.full_name || profile.email || 'Anonymous',
        profile.avatar_url,
        series.id,
        series.title,
        series.total_days
      );
      setHasPostedSeriesStart(true);
    } catch (error) {
      console.error('Error posting devotional start:', error);
    }
  }
};

/**
 * Post community activity when completing a devotional day
 */
const handleDevotionalDayComplete = async (
  day: SeriesDay,
  series: Series,
  progress: UserProgress
) => {
  if (!user || !profile) return;

  try {
    // Post day completion
    await postDevotionalDayCompleted(
      user.id,
      profile.full_name || profile.email || 'Anonymous',
      profile.avatar_url,
      series.id,
      series.title,
      day.day_number,
      series.total_days
    );

    // Check if series is now complete
    const newCompletedDays = [...new Set([...progress.completed_days, day.day_number])];
    const isSeriesComplete = newCompletedDays.length >= series.total_days;

    if (isSeriesComplete) {
      await postDevotionalCompleted(
        user.id,
        profile.full_name || profile.email || 'Anonymous',
        profile.avatar_url,
        series.id,
        series.title,
        series.total_days
      );
    }
  } catch (error) {
    console.error('Error posting devotional day completion:', error);
  }
};

// ====== MODIFY markDayComplete FUNCTION IN DevotionalSeriesViewer ======
// Replace the existing markDayComplete function with this updated version:

const markDayComplete = async () => {
  if (!user || !selectedSeries || !currentDay || !progress) return;

  try {
    const completedAt = new Date().toISOString();
    const completionEntry = { day: currentDay.day_number, completed_at: completedAt };
    
    // Update completed days arrays
    const newCompletedDays = [...new Set([...progress.completed_days, currentDay.day_number])];
    const newCompletedDaysData = [
      ...(progress.completed_days_data || []).filter(d => d.day !== currentDay.day_number),
      completionEntry
    ];
    
    const isSeriesComplete = newCompletedDays.length >= selectedSeries.total_days;
    const nextDay = currentDay.day_number + 1;

    // Update database with completion timestamp
    await supabase.from('devotional_user_progress').update({
      completed_days: newCompletedDays,
      completed_days_data: newCompletedDaysData,
      current_day: isSeriesComplete ? currentDay.day_number : nextDay,
      is_completed: isSeriesComplete,
      last_read_at: completedAt
    }).eq('user_id', user.id).eq('series_id', selectedSeries.id);

    // *** NEW: Post to community activity feed ***
    await handleDevotionalDayComplete(currentDay, selectedSeries, progress);

    // Update local state
    const updatedProgress = {
      ...progress,
      completed_days: newCompletedDays,
      completed_days_data: newCompletedDaysData,
      current_day: isSeriesComplete ? currentDay.day_number : nextDay,
      is_completed: isSeriesComplete,
      last_read_at: completedAt
    };
    
    setProgress(updatedProgress);

    // Determine feedback message
    if (isSeriesComplete) {
      toast({ 
        title: '🎉 Series Complete!', 
        description: `Congratulations! You've completed "${selectedSeries.title}"` 
      });
      setShowCompletionModal(true);
      setTimeout(() => setView('series'), 1000);
    } else {
      // Check if next day can be unlocked now
      const canUnlockNext = nextDay <= selectedSeries.total_days;
      
      if (canUnlockNext) {
        // Next day exists, check if it's unlocked due to time
        const daysSinceToday = 0; // Just completed today
        const willUnlockTomorrow = daysSinceToday < 1;
        
        if (willUnlockTomorrow) {
          toast({ 
            title: '✅ Day Complete!', 
            description: `Day ${currentDay.day_number} complete. Next day unlocks tomorrow.`,
            duration: 4000
          });
          setUnlockMessage('Next day unlocks tomorrow at midnight');
        } else {
          toast({ 
            title: '✅ Day Complete!', 
            description: `Day ${currentDay.day_number} complete. Day ${nextDay} is now available!`,
            duration: 4000
          });
          setUnlockMessage('Next day is now available');
        }
      } else {
        toast({ 
          title: '✅ Day Complete!', 
          description: `Day ${currentDay.day_number} complete.` 
        });
      }

      // Return to series view
      setTimeout(() => setView('series'), 1500);
    }
  } catch (err) {
    console.error('Error marking day complete:', err);
    toast({ 
      title: 'Error', 
      description: 'Failed to save progress',
      variant: 'destructive'
    });
  }
};

// ====== ADD THIS useEffect TO CHECK AND POST DEVOTIONAL SERIES START ======
/*
useEffect(() => {
  if (selectedSeries && progress && user && profile) {
    handleDevotionalSeriesStart(selectedSeries, progress);
  }
}, [selectedSeries, progress, user, profile]);
*/

// ====== FOR DevotionalLibrary.tsx ======
// Add similar functionality when users start a series from the library view

/**
 * Handle when user starts a devotional from the library
 * Add this to DevotionalLibrary.tsx when user selects a series
 */
const handleStartDevotionalFromLibrary = async (
  series: Series,
  userId: string,
  userName: string,
  userAvatar: string | undefined
) => {
  // Check if this is the first time starting
  const { data: existingProgress } = await supabase
    .from('devotional_user_progress')
    .select('completed_days')
    .eq('user_id', userId)
    .eq('series_id', series.id)
    .single();

  // Only post if no existing progress or no completed days
  if (!existingProgress || existingProgress.completed_days.length === 0) {
    try {
      await postDevotionalStarted(
        userId,
        userName,
        userAvatar,
        series.id,
        series.title,
        series.total_days
      );
    } catch (error) {
      console.error('Error posting devotional start:', error);
    }
  }
};

export {
  handleDevotionalSeriesStart,
  handleDevotionalDayComplete,
  handleStartDevotionalFromLibrary
};