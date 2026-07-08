import React from 'react';
import { LiveChannels } from './LiveChannels';

/**
 * EnhancedPrayerGroups has been replaced with LiveChannels.
 * Live Channels provide a follow-based broadcast system instead of group-based rooms.
 * 
 * Features:
 * - Create and manage your own channels
 * - Follow channels to get notified when they go live
 * - Watch live audio or video broadcasts
 * - Real-time side chat during broadcasts
 * - Host controls for going live, recording, and inviting co-hosts
 */
export const EnhancedPrayerGroups: React.FC = () => {
  return <LiveChannels />;
};

export default EnhancedPrayerGroups;
