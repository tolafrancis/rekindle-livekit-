// PrayerSeriesViewer Community Activity Integration
// This file contains the updates needed for PrayerSeriesViewer.tsx

import { 
  postPrayerSeriesStarted,
  postPrayerSeriesCompleted,
  postPrayerSeriesDayCompleted
} from '@/lib/communityActivityService';

// ====== ADD THESE IMPORTS TO PrayerSeriesViewer.tsx ======
/*
import { 
  postPrayerSeriesStarted,
  postPrayerSeriesCompleted,
  postPrayerSeriesDayCompleted
} from '@/lib/communityActivityService';
*/

// ====== ADD THIS STATE VARIABLE ======
/*
const [hasPostedSeriesStart, setHasPostedSeriesStart] = useState(false);
*/

// ====== ADD THIS FUNCTION TO THE COMPONENT ======

/**
 * Post community activity when starting a series (first time only)
 */
const handleSeriesStart = async (series: PrayerSeries, progress: UserProgress) => {
  if (!user || !profile) return;
  
  // Only post if this is the first time starting (no completed days yet)
  if (!hasPostedSeriesStart && progress.completed_days.length === 0) {
    try {
      await postPrayerSeriesStarted(
        user.id,
        profile.full_name || profile.email || 'Anonymous',
        profile.avatar_url,
        series.id,
        series.title,
        series.total_days
      );
      setHasPostedSeriesStart(true);
    } catch (error) {
      console.error('Error posting series start:', error);
    }
  }
};

/**
 * Post community activity when completing a series day
 */
const handleDayComplete = async (
  day: PrayerDay,
  series: PrayerSeries,
  progress: UserProgress
) => {
  if (!user || !profile) return;

  try {
    // Post day completion
    await postPrayerSeriesDayCompleted(
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
      await postPrayerSeriesCompleted(
        user.id,
        profile.full_name || profile.email || 'Anonymous',
        profile.avatar_url,
        series.id,
        series.title,
        series.total_days
      );
    }
  } catch (error) {
    console.error('Error posting day completion:', error);
  }
};

// ====== MODIFY completePrayerInteractive FUNCTION ======
// Replace the existing completePrayerInteractive function with this updated version:

const completePrayerInteractive = async (duration?: number, pointsCompleted?: number) => {
  console.log('✅ Completing interactive prayer');
  if (!user || !currentDay || !selectedSeries || !progress) return;

  try {
    const completionTimestamp = new Date().toISOString();
    const nextDay = currentDay.day_number + 1;
    const newCompletedDays = [...new Set([...progress.completed_days, currentDay.day_number])];
    const isSeriesComplete = newCompletedDays.length >= selectedSeries.total_days;

    // Update completion timestamps
    const updatedTimestamps = {
      ...progress.day_completion_timestamps,
      [currentDay.day_number]: completionTimestamp
    };

    // Calculate days observed
    const daysObserved = calculateDaysObserved(updatedTimestamps);

    await supabase.from('prayer_user_progress').upsert({
      user_id: user.id,
      series_id: selectedSeries.id,
      current_day: Math.min(nextDay, selectedSeries.total_days),
      completed_days: newCompletedDays,
      day_completion_timestamps: updatedTimestamps,
      last_prayed_at: completionTimestamp,
      is_completed: isSeriesComplete
    }).eq('user_id', user.id).eq('series_id', selectedSeries.id);

    // Record prayer session with actual duration and points completed
    await supabase.from('prayer_sessions').insert({
      user_id: user.id,
      prayer_id: currentDay.id,
      series_id: selectedSeries.id,
      duration_selected: SESSION_DURATIONS[sessionType].minutes * 60,
      duration_actual: duration || SESSION_DURATIONS[sessionType].minutes * 60,
      status: 'completed',
      points_completed: pointsCompleted || generatedPrayerPoints.length,
      total_points: generatedPrayerPoints.length,
      completed_at: completionTimestamp
    });

    // *** NEW: Post to community activity feed ***
    await handleDayComplete(currentDay, selectedSeries, progress);

    // Update local progress state
    setProgress({
      ...progress,
      current_day: Math.min(nextDay, selectedSeries.total_days),
      completed_days: newCompletedDays,
      day_completion_timestamps: updatedTimestamps,
      is_completed: isSeriesComplete,
      last_prayed_at: completionTimestamp,
      days_observed: daysObserved
    });

    // Show completion feedback with unlock status
    if (isSeriesComplete) {
      setShowCompletionModal(true);
    } else {
      // Check if next day can be unlocked
      const nextDayUnlockCheck = canUnlockDay(nextDay, {
        ...progress,
        completed_days: newCompletedDays,
        day_completion_timestamps: updatedTimestamps,
        days_observed: daysObserved
      }, selectedSeries);

      let feedbackMessage = `Day ${currentDay.day_number} completed. God bless you!`;
      
      if (nextDay <= selectedSeries.total_days) {
        if (nextDayUnlockCheck.canUnlock) {
          feedbackMessage += ' Next day is now available.';
        } else if (nextDayUnlockCheck.reason?.includes('tomorrow')) {
          feedbackMessage += ' Next day unlocks tomorrow.';
        }
      }

      toast({ 
        title: '✓ Prayer Complete!', 
        description: feedbackMessage,
        duration: 5000
      });
    }

    // Reset ALL states after completion
    setShowModeSelectionModal(false);
    setShowDurationModal(false);
    setCurrentDay(null);
    setGeneratedPrayerPoints([]);
    setSessionType('standard');
    setView('series');
  } catch (err) {
    console.error('Error completing prayer:', err);
    toast({ title: 'Error', description: 'Failed to save progress', variant: 'destructive' });
  }
};

// ====== MODIFY completePrayer FUNCTION ======
// Replace the existing completePrayer function with this updated version:

const completePrayer = async () => {
  console.log('✅ Completing traditional prayer');
  if (!user || !currentDay || !selectedSeries || !progress) return;

  try {
    const completionTimestamp = new Date().toISOString();
    const nextDay = currentDay.day_number + 1;
    const newCompletedDays = [...new Set([...progress.completed_days, currentDay.day_number])];
    const isSeriesComplete = newCompletedDays.length >= selectedSeries.total_days;

    // Update completion timestamps
    const updatedTimestamps = {
      ...progress.day_completion_timestamps,
      [currentDay.day_number]: completionTimestamp
    };

    // Calculate days observed
    const daysObserved = calculateDaysObserved(updatedTimestamps);

    await supabase.from('prayer_user_progress').upsert({
      user_id: user.id,
      series_id: selectedSeries.id,
      current_day: Math.min(nextDay, selectedSeries.total_days),
      completed_days: newCompletedDays,
      day_completion_timestamps: updatedTimestamps,
      last_prayed_at: completionTimestamp,
      is_completed: isSeriesComplete
    }).eq('user_id', user.id).eq('series_id', selectedSeries.id);

    // Record prayer session
    await supabase.from('prayer_sessions').insert({
      user_id: user.id,
      prayer_id: currentDay.id,
      series_id: selectedSeries.id,
      duration_selected: selectedDuration * 60,
      duration_actual: selectedDuration * 60,
      status: 'completed',
      points_completed: generatedPrayerPoints.length,
      total_points: generatedPrayerPoints.length,
      completed_at: completionTimestamp
    });

    // *** NEW: Post to community activity feed ***
    await handleDayComplete(currentDay, selectedSeries, progress);

    // Continue with existing code...
    // [Rest of the function remains the same]
    
    setProgress({
      ...progress,
      current_day: Math.min(nextDay, selectedSeries.total_days),
      completed_days: newCompletedDays,
      day_completion_timestamps: updatedTimestamps,
      is_completed: isSeriesComplete,
      last_prayed_at: completionTimestamp,
      days_observed: daysObserved
    });

    if (isSeriesComplete) {
      setShowCompletionModal(true);
    } else {
      const nextDayUnlockCheck = canUnlockDay(nextDay, {
        ...progress,
        completed_days: newCompletedDays,
        day_completion_timestamps: updatedTimestamps,
        days_observed: daysObserved
      }, selectedSeries);

      let feedbackMessage = `Day ${currentDay.day_number} completed. God bless you!`;
      
      if (nextDay <= selectedSeries.total_days) {
        if (nextDayUnlockCheck.canUnlock) {
          feedbackMessage += ' Next day is now available.';
        } else if (nextDayUnlockCheck.reason?.includes('tomorrow')) {
          feedbackMessage += ' Next day unlocks tomorrow.';
        }
      }

      toast({ 
        title: '✓ Prayer Complete!', 
        description: feedbackMessage,
        duration: 5000
      });
    }

    setShowDurationModal(false);
    setCurrentDay(null);
    setView('series');
  } catch (err) {
    console.error('Error completing prayer:', err);
    toast({ title: 'Error', description: 'Failed to save progress', variant: 'destructive' });
  }
};

// ====== ADD THIS useEffect TO CHECK AND POST SERIES START ======
/*
useEffect(() => {
  if (selectedSeries && progress && user && profile) {
    handleSeriesStart(selectedSeries, progress);
  }
}, [selectedSeries, progress, user, profile]);
*/

export {
  handleSeriesStart,
  handleDayComplete
};