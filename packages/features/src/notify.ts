/**
 * notify.ts — unified notification dispatcher
 *
 * Implements the recommended channel matrix:
 *
 * Event                    | Push | Email | In-app
 * -------------------------|------|-------|-------
 * new_revelation           |  ✓   |       |   ✓
 * new_question             |  ✓   |       |
 * announcement             |  ✓   |   ✓   |   ✓
 * event_reminder_1hr       |  ✓   |       |
 * event_reminder_24hr      |  ✓   |   ✓   |
 * live_session_starting    |  ✓   |       |
 * prayer_request           |      |       |   ✓
 * devotional_reminder      |  ✓   |       |   ✓
 * answer_posted            |  ✓   |       |   ✓
 * answer_accepted          |      |       |   ✓
 * leader_broadcast         |  ✓   |   ✓   |   ✓
 */

import { supabase } from '@rekindle/supabase';

export type NotifyEventType =
  | 'new_revelation'
  | 'new_question'
  | 'announcement'
  | 'event_reminder_1hr'
  | 'event_reminder_24hr'
  | 'live_session_starting'
  | 'prayer_request'
  | 'devotional_reminder'
  | 'answer_posted'
  | 'answer_accepted'
  | 'leader_broadcast'
  | 'onboarding_tip'
  | 'pastor_video_message';

export interface NotifyPayload {
  type: NotifyEventType;
  title: string;
  body: string;
  /** Target a specific user (answer_posted, answer_accepted, prayer_request) */
  userId?: string;
  /** Target all members of a ministry */
  ministryId?: string;
  /** Fallback: 'all' sends to all users */
  targetAudience?: 'all' | 'ministry_members' | 'premium' | 'leaders';
  /** Deep link shown in the in-app notification */
  link?: string;
  /** Sender display name */
  senderName?: string;
  /** Template id for email (matches email_templates table) */
  emailTemplateId?: string;
  /** Extra variables for email template */
  emailVariables?: Record<string, string>;
}

// Channel rules per event type
const CHANNELS: Record<NotifyEventType, { push: boolean; email: boolean; inApp: boolean }> = {
  new_revelation:        { push: true,  email: false, inApp: true  },
  new_question:          { push: true,  email: false, inApp: false },
  announcement:          { push: true,  email: true,  inApp: true  },
  event_reminder_1hr:    { push: true,  email: false, inApp: false },
  event_reminder_24hr:   { push: true,  email: true,  inApp: false },
  live_session_starting: { push: true,  email: false, inApp: false },
  prayer_request:        { push: false, email: false, inApp: true  },
  devotional_reminder:   { push: true,  email: false, inApp: true  },
  answer_posted:         { push: true,  email: false, inApp: true  },
  answer_accepted:       { push: false, email: false, inApp: true  },
  leader_broadcast:      { push: true,  email: true,  inApp: true  },
  onboarding_tip:        { push: true,  email: false, inApp: true  },
  // Email for this event is sent directly via send-email-broadcast (see
  // MinistryVideoMessagesManager/process-scheduled-video-messages), not through
  // this dispatcher's own (broken) email path — so email stays false here.
  pastor_video_message:  { push: true,  email: false, inApp: true  },
};

export async function notify(payload: NotifyPayload): Promise<void> {
  const channels = CHANNELS[payload.type];
  const audience = payload.targetAudience
    ?? (payload.ministryId ? 'ministry_members' : 'all');

  // ── Push + In-app ───────────────────────────────────────────────────
  // Both are handled server-side by send-push-notification, which resolves the
  // audience and writes with the service role. This is required because RLS
  // blocks a client from inserting notifications for other users.
  if (channels.push || channels.inApp) {
    supabase.functions.invoke('send-push-notification', {
      body: {
        title:            payload.title,
        body:             payload.body,
        link:             payload.link,
        senderName:       payload.senderName,
        // A userId target means a single recipient — signal that explicitly so
        // the function targets one person instead of broadcasting.
        targetAudience:   payload.userId ? 'specific_user' : audience,
        ministryId:       payload.ministryId,
        userId:           payload.userId,
        notificationType: payload.type,
        push:             channels.push,
        inApp:            channels.inApp,
      }
    }).catch(err => console.error('[notify] push/in-app failed:', err));
  }

  // ── Email ───────────────────────────────────────────────────────────
  if (channels.email) {
    supabase.functions.invoke('send-email', {
      body: {
        type:           payload.type,
        subject:        payload.title,
        body:           payload.body,
        targetAudience: audience,
        ministryId:     payload.ministryId,
        userId:         payload.userId,
        templateId:     payload.emailTemplateId,
        variables:      {
          title:      payload.title,
          message:    payload.body,
          senderName: payload.senderName ?? 'ReKindle BC',
          siteUrl:    typeof window !== 'undefined' ? window.location.origin : '',
          ...(payload.emailVariables ?? {}),
        },
      }
    }).catch(err => console.error('[notify] email failed:', err));
  }
}
