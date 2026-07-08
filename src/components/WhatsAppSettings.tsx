// WhatsAppSettings.tsx
// This component previously saved to the `whatsapp_profiles` table which was
// disconnected from the broadcast system. WhatsApp opt-in is now handled by
// PlatformWhatsAppOptIn inside Profile Settings, which correctly writes to
// user_profiles and whatsapp_channel_subscribers.
//
// This file is kept to avoid import errors but the WhatsApp tab has been
// removed from AppLayout — this component is no longer rendered.

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';

export const WhatsAppSettings: React.FC = () => {
  return null;
};

export default WhatsAppSettings;
