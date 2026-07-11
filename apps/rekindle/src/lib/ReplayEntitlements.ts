// =====================================================
// REPLAY ENTITLEMENTS
// Utility functions for determining replay access permissions
// =====================================================

export interface ReplayUser {
  id: string;
  subscription?: {
    active: boolean;
    type: 'free' | 'premium' | 'premium_plus' | 'ministry' | null;
    tier?: {
      can_access_replays?: boolean;
      can_download_replays?: boolean;
      max_replay_access?: number | null;
    };
  };
}

export interface LiveReplay {
  id: string;
  channelId: string;
  title?: string;
  recordingUrl?: string;
  storageKey?: string;
  duration?: number;
  replayAccessLevel: 'none' | 'stream' | 'download';
  createdAt?: string;
}

export interface ReplayEntitlements {
  canStream: boolean;
  canDownload: boolean;
}

/**
 * Resolves what replay access a user has based on their subscription
 * and the replay's access level settings
 */
export function resolveReplayEntitlements(
  user: ReplayUser | null,
  replay: LiveReplay
): ReplayEntitlements {
  // No user = no access
  if (!user) {
    return {
      canStream: false,
      canDownload: false,
    };
  }

  // Check if user has an active subscription
  const isSubscriber = user.subscription?.active ?? false;
  const subscriptionType = user.subscription?.type;
  
  // Ministry subscribers get full access
  const is_ministry_Subscriber = subscriptionType === 'ministry';
  
  // Premium Plus subscribers can stream
  const isPremiumPlus = subscriptionType === 'premium_plus' || subscriptionType === 'ministry';

  // Determine streaming access
  const canStream = 
    isSubscriber && 
    isPremiumPlus &&
    (replay.replayAccessLevel === 'stream' || replay.replayAccessLevel === 'download');

  // Determine download access (ministry only)
  const canDownload = 
    is_ministry_Subscriber && 
    replay.replayAccessLevel === 'download';

  return {
    canStream,
    canDownload,
  };
}

/**
 * Check if a user can access any replays based on their subscription
 */
export function canUserAccessReplays(user: ReplayUser | null): boolean {
  if (!user) return false;
  
  const subscriptionType = user.subscription?.type;
  const isActive = user.subscription?.active ?? false;
  
  // Premium Plus and Ministry can access replays
  return isActive && (subscriptionType === 'premium_plus' || subscriptionType === 'ministry');
}

/**
 * Get the maximum number of replays a user can access
 */
export function getMaxReplayAccess(user: ReplayUser | null): number | null {
  if (!user) return 0;
  
  const subscriptionType = user.subscription?.type;
  const isActive = user.subscription?.active ?? false;
  
  if (!isActive) return 0;
  
  switch (subscriptionType) {
    case 'ministry':
      return null; // Unlimited
    case 'premium_plus':
      return 5; // Last 5 replays
    default:
      return 0;
  }
}

/**
 * Check if user can download replays
 */
export function canUserDownloadReplays(user: ReplayUser | null): boolean {
  if (!user) return false;
  
  const subscriptionType = user.subscription?.type;
  const isActive = user.subscription?.active ?? false;
  
  // Only Ministry subscribers can download
  return isActive && subscriptionType === 'ministry';
}
