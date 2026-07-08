import React from 'react';
import { LiveChannels } from './LiveChannels';

/**
 * SocialPrayerGroups has been replaced with LiveChannels.
 * 
 * The old group-based system has been deprecated in favor of
 * the new Live Channels feature which provides:
 * - Follow-based channels instead of membership-based groups
 * - Persistent channels that can go live anytime
 * - Audio-only or video broadcast modes
 * - Real-time side chat
 * - Recording capabilities
 * - Co-host invitations
 */
export const SocialPrayerGroups: React.FC = () => {
  return <LiveChannels />;
};

export default SocialPrayerGroups;
