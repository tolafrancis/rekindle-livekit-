import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from './ui/use-toast';
import { usePushNotifications, registerPush } from '@/hooks/usePushNotifications';
import { 
  Bell, 
  BellOff, 
  Clock, 
  BookOpen, 
  Users, 
  Calendar, 
  Heart, 
  Flame, 
  CheckCircle,
  Radio,
  Loader2,
  Info,
  Video,
} from 'lucide-react';

interface NotificationSettings {
  enabled: boolean;
  dailyDevotional: boolean;
  devotionalTime: string;
  prayerReminders: boolean;
  prayerTimes: string[];
  groupMessages: boolean;
  challengeUpdates: boolean;
  liveSessionReminders: boolean;
  reminderMinutesBefore: number;
  weeklyDigest: boolean;
  streakReminders: boolean;
  
  // Counselling session reminders
  counsellingReminders: boolean;
  counsellingReminder15min: boolean;
  counsellingReminder5min: boolean;
  
  // Event reminder settings
  eventRemindersEnabled: boolean;
  eventReminders24hr: boolean;
  eventReminders1hr: boolean;
  eventReminders15min: boolean;
  channelLiveNotifications: boolean;
  channelFollowerNotifications: boolean;
  
  // Delivery preferences
  emailNotifications: boolean;
  pushNotifications: boolean;
  inAppNotifications: boolean;
}

export const PushNotificationSettings: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { isSubscribed, subscribe, permission: pushPermission, checkStatus } = usePushNotifications();

  // All users have access to all notification preferences
  const isPaid = true;

  // Wrapper — kept for future gating but currently passes through for all users
  const PaidOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return <>{children}</>;
  };
  
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: false,
    dailyDevotional: true,
    devotionalTime: '07:00',
    prayerReminders: true,
    prayerTimes: ['06:00', '12:00', '21:00'],
    groupMessages: true,
    challengeUpdates: true,
    liveSessionReminders: true,
    reminderMinutesBefore: 15,
    weeklyDigest: true,
    streakReminders: true,
    
    // Counselling session reminders
    counsellingReminders: true,
    counsellingReminder15min: true,
    counsellingReminder5min: true,
    
    // Event reminders
    eventRemindersEnabled: true,
    eventReminders24hr: true,
    eventReminders1hr: true,
    eventReminders15min: true,
    channelLiveNotifications: true,
    channelFollowerNotifications: true,
    
    // Delivery
    emailNotifications: true,
    pushNotifications: true,
    inAppNotifications: true,
  });
  
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  // Load settings from database
  useEffect(() => {
    if (!user) return;

    const loadSettings = async () => {
      setLoading(true);
      try {
        // localStorage first for instant render
        const saved = localStorage.getItem('notificationSettings');
        if (saved) {
          setSettings(prev => ({ ...prev, ...JSON.parse(saved) }));
        }

        // Sync ALL prefs from DB — source of truth across all devices
        if (user) {
          const { data: dbProfile } = await supabase
            .from('user_profiles')
            .select(`
              notif_enabled, notif_daily_devotional, notif_devotional_time,
              notif_prayer_reminders, notif_prayer_times,
              notif_group_messages, notif_challenge_updates,
              notif_live_session_reminders, notif_reminder_minutes_before,
              notif_weekly_digest, notif_streak_reminders,
              notif_counselling_reminders, notif_counselling_15min, notif_counselling_5min,
              notif_event_reminders, notif_event_24hr, notif_event_1hr, notif_event_15min,
              notif_channel_live, notif_channel_follower,
              notif_email, notif_push, notif_in_app,
              notif_community_revelations, notif_community_questions
            `)
            .eq('user_id', user.id)
            .single();

          if (dbProfile) {
            setSettings(prev => ({
              ...prev,
              ...(dbProfile.notif_enabled                != null && { enabled:                     dbProfile.notif_enabled }),
              ...(dbProfile.notif_daily_devotional       != null && { dailyDevotional:              dbProfile.notif_daily_devotional }),
              ...(dbProfile.notif_devotional_time        != null && { devotionalTime:               dbProfile.notif_devotional_time }),
              ...(dbProfile.notif_prayer_reminders       != null && { prayerReminders:              dbProfile.notif_prayer_reminders }),
              ...(dbProfile.notif_prayer_times           != null && { prayerTimes:                  dbProfile.notif_prayer_times }),
              ...(dbProfile.notif_group_messages         != null && { groupMessages:                dbProfile.notif_group_messages }),
              ...(dbProfile.notif_challenge_updates      != null && { challengeUpdates:             dbProfile.notif_challenge_updates }),
              ...(dbProfile.notif_live_session_reminders != null && { liveSessionReminders:         dbProfile.notif_live_session_reminders }),
              ...(dbProfile.notif_reminder_minutes_before != null && { reminderMinutesBefore:       dbProfile.notif_reminder_minutes_before }),
              ...(dbProfile.notif_weekly_digest          != null && { weeklyDigest:                 dbProfile.notif_weekly_digest }),
              ...(dbProfile.notif_streak_reminders       != null && { streakReminders:              dbProfile.notif_streak_reminders }),
              ...(dbProfile.notif_counselling_reminders  != null && { counsellingReminders:         dbProfile.notif_counselling_reminders }),
              ...(dbProfile.notif_counselling_15min      != null && { counsellingReminder15min:     dbProfile.notif_counselling_15min }),
              ...(dbProfile.notif_counselling_5min       != null && { counsellingReminder5min:      dbProfile.notif_counselling_5min }),
              ...(dbProfile.notif_event_reminders        != null && { eventRemindersEnabled:        dbProfile.notif_event_reminders }),
              ...(dbProfile.notif_event_24hr             != null && { eventReminders24hr:           dbProfile.notif_event_24hr }),
              ...(dbProfile.notif_event_1hr              != null && { eventReminders1hr:            dbProfile.notif_event_1hr }),
              ...(dbProfile.notif_event_15min            != null && { eventReminders15min:          dbProfile.notif_event_15min }),
              ...(dbProfile.notif_channel_live           != null && { channelLiveNotifications:     dbProfile.notif_channel_live }),
              ...(dbProfile.notif_channel_follower       != null && { channelFollowerNotifications: dbProfile.notif_channel_follower }),
              ...(dbProfile.notif_email                  != null && { emailNotifications:           dbProfile.notif_email }),
              ...(dbProfile.notif_push                   != null && { pushNotifications:            dbProfile.notif_push }),
              ...(dbProfile.notif_in_app                 != null && { inAppNotifications:           dbProfile.notif_in_app }),
              ...(dbProfile.notif_community_revelations  != null && { communityRevelations:         dbProfile.notif_community_revelations }),
              ...(dbProfile.notif_community_questions    != null && { communityQuestions:           dbProfile.notif_community_questions }),
            }));
          }
        }

        await checkStatus();
      } catch (err) {
        console.error('[Notifications] Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [user, checkStatus]);

  // Check browser notification permission
  useEffect(() => {
    if ('Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
  }, []);

  // Ensure this device has a stored FCM token whenever permission is already
  // granted. Covers users who enabled notifications on the previous (Web Push)
  // build — their permission is 'granted' but no FCM token was ever minted, so
  // pushes would report "no device found" until we register here.
  const autoRegisteredRef = useRef(false);
  useEffect(() => {
    if (!user || permissionStatus !== 'granted' || autoRegisteredRef.current) return;
    autoRegisteredRef.current = true;
    registerPush('user')
      .then((ok) => {
        if (ok) checkStatus();
        else console.warn('[Notifications] device auto-register returned false — check Firebase config/VAPID');
      })
      .catch((e) => console.error('[Notifications] device auto-register failed:', e));
  }, [user, permissionStatus, checkStatus]);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      toast({
        title: t('pushNotificationSettings', 'notSupportedTitle', 'Not Supported'),
        description: t('pushNotificationSettings', 'notSupportedDesc', 'Push notifications are not supported in this browser'),
        variant: 'destructive'
      });
      return;
    }

    try {
      // Use the hook's subscribe function which handles everything
      const success = await subscribe('user');
      
      if (success) {
        setPermissionStatus('granted');
        setSettings(prev => ({ ...prev, enabled: true, pushNotifications: true }));
        
        toast({
          title: t('pushNotificationSettings', 'notificationsEnabledTitle', 'Notifications Enabled'),
          description: t('pushNotificationSettings', 'notificationsEnabledDesc', 'You will now receive push notifications for counselling sessions and more!')
        });
        
        // Show test notification
        new Notification('Kindled', {
          body: t('pushNotificationSettings', 'testNotificationBody', "Notifications are now enabled! You'll receive reminders for counselling sessions, devotionals, and more."),
          icon: '/favicon.ico'
        });
      } else {
        const perm = await Notification.requestPermission();
        setPermissionStatus(perm);
        if (perm === 'denied') {
          toast({
            title: t('pushNotificationSettings', 'permissionDeniedTitle', 'Permission Denied'),
            description: t('pushNotificationSettings', 'permissionDeniedDesc', 'Please enable notifications in your browser settings'),
            variant: 'destructive'
          });
        }
      }
    } catch (error) {
      console.error('[Notifications] Permission error:', error);
      toast({
        title: t('pushNotificationSettings', 'errorTitle', 'Error'),
        description: t('pushNotificationSettings', 'requestPermissionFailed', 'Failed to request notification permission'),
        variant: 'destructive'
      });
    }
  };

  // End-to-end self-test: round-trips through the edge function → FCM v1 → this
  // device's service worker. Confirms the secret/env/token pipeline is live.
  const sendTestPush = async () => {
    if (!user) return;
    setTesting(true);
    try {
      // Fire both channels server-side (service role): push + an in-app row for
      // this user. In-app via the function bypasses RLS and blips the bell badge
      // through the realtime INSERT subscription in useNotifications.
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          title: t('pushNotificationSettings', 'testPushTitle', '🔔 Test notification'),
          body: t('pushNotificationSettings', 'testPushBody', 'If you can see this, push is working end-to-end.'),
          link: '/home',
          userId: user.id,
          targetAudience: 'specific_user',
          notificationType: 'test',
          push: true,
          inApp: true,
        },
      });
      if (error) {
        // supabase-js wraps non-2xx as FunctionsHttpError with the Response in
        // .context — read it so the toast shows the REAL server error, not just
        // "non-2xx status code".
        let serverMsg = error.message;
        try {
          const body = await (error as any)?.context?.json?.();
          if (body?.error) serverMsg = body.error + (body.details ? ` — ${body.details}` : '');
        } catch { /* body not JSON */ }
        throw new Error(serverMsg);
      }

      const sent = data?.sent ?? 0;
      const inAppCount = data?.inApp ?? 0;
      if (sent > 0 || inAppCount > 0) {
        toast({
          title: t('pushNotificationSettings', 'testSentTitle', 'Test sent'),
          description: t('pushNotificationSettings', 'testSentDesc2', 'Push: {p} device(s) · in-app: {n}. Check the bell.').replace('{p}', String(sent)).replace('{n}', String(inAppCount)),
        });
      } else {
        toast({
          title: t('pushNotificationSettings', 'testNoDeviceTitle', 'No device reached'),
          description: data?.message || t('pushNotificationSettings', 'testNoDeviceDesc', 'No push token found for your account — enable push on this device first, then retry.'),
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      console.error('[Notifications] Test push failed:', err);
      toast({
        title: t('pushNotificationSettings', 'testFailedTitle', 'Test failed'),
        description: err?.message || t('pushNotificationSettings', 'testFailedDesc', 'Could not send test push. Check that the edge function is deployed and FCM_SERVICE_ACCOUNT is set.'),
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const updateSetting = (key: keyof NotificationSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    if (!user) {
      toast({
        title: t('pushNotificationSettings', 'notSignedInTitle', 'Not Signed In'),
        description: t('pushNotificationSettings', 'notSignedInDesc', 'Please sign in to save settings'),
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      // localStorage as fast local cache
      localStorage.setItem('notificationSettings', JSON.stringify(settings));

      // Persist ALL prefs to DB — synced across every device
      if (user) {
        await supabase
          .from('user_profiles')
          .update({
            notif_enabled:                 settings.enabled,
            notif_daily_devotional:        settings.dailyDevotional,
            notif_devotional_time:         settings.devotionalTime,
            notif_prayer_reminders:        settings.prayerReminders,
            notif_prayer_times:            settings.prayerTimes,
            notif_group_messages:          settings.groupMessages,
            notif_challenge_updates:       settings.challengeUpdates,
            notif_live_session_reminders:  settings.liveSessionReminders,
            notif_reminder_minutes_before: settings.reminderMinutesBefore,
            notif_weekly_digest:           settings.weeklyDigest,
            notif_streak_reminders:        settings.streakReminders,
            notif_counselling_reminders:   settings.counsellingReminders,
            notif_counselling_15min:       settings.counsellingReminder15min,
            notif_counselling_5min:        settings.counsellingReminder5min,
            notif_event_reminders:         settings.eventRemindersEnabled,
            notif_event_24hr:              settings.eventReminders24hr,
            notif_event_1hr:               settings.eventReminders1hr,
            notif_event_15min:             settings.eventReminders15min,
            notif_channel_live:            settings.channelLiveNotifications,
            notif_channel_follower:        settings.channelFollowerNotifications,
            notif_email:                   settings.emailNotifications,
            notif_push:                    settings.pushNotifications,
            notif_in_app:                  settings.inAppNotifications,
            notif_community_revelations:   settings.communityRevelations,
            notif_community_questions:     settings.communityQuestions,
          })
          .eq('user_id', user.id);
      }

      toast({
        title: t('pushNotificationSettings', 'settingsSavedTitle', 'Settings Saved'),
        description: t('pushNotificationSettings', 'settingsSavedDesc', 'Your notification preferences have been updated')
      });
    } catch (err: any) {
      console.error('[Notifications] Save error:', err);
      toast({
        title: t('pushNotificationSettings', 'errorTitle', 'Error'),
        description: err.message || t('pushNotificationSettings', 'saveSettingsFailed', 'Failed to save settings'),
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const addPrayerTime = () => {
    if (settings.prayerTimes.length < 5) {
      updateSetting('prayerTimes', [...settings.prayerTimes, '12:00']);
    }
  };

  const removePrayerTime = (index: number) => {
    updateSetting('prayerTimes', settings.prayerTimes.filter((_, i) => i !== index));
  };

  const updatePrayerTime = (index: number, time: string) => {
    const newTimes = [...settings.prayerTimes];
    newTimes[index] = time;
    updateSetting('prayerTimes', newTimes);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-purple-600" />
            {t('pushNotificationSettings', 'pushNotificationsHeading', 'Push Notifications')}
          </CardTitle>
          <CardDescription>
            {t('pushNotificationSettings', 'cardDescription', 'Manage your notification preferences for counselling sessions, devotionals, prayers, and community updates')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Permission Status */}
          <div className={`p-4 rounded-lg ${
            permissionStatus === 'granted' 
              ? 'bg-green-50 border border-green-200' 
              : permissionStatus === 'denied' 
              ? 'bg-red-50 border border-red-200' 
              : 'bg-amber-50 border border-amber-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {permissionStatus === 'granted' ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : permissionStatus === 'denied' ? (
                  <BellOff className="h-5 w-5 text-red-600" />
                ) : (
                  <Bell className="h-5 w-5 text-amber-600" />
                )}
                <div>
                  <p className="font-medium">
                    {permissionStatus === 'granted'
                      ? t('pushNotificationSettings', 'statusEnabledTitle', 'Notifications Enabled')
                      : permissionStatus === 'denied'
                      ? t('pushNotificationSettings', 'statusBlockedTitle', 'Notifications Blocked')
                      : t('pushNotificationSettings', 'statusNotEnabledTitle', 'Notifications Not Enabled')
                    }
                  </p>
                  <p className="text-sm text-gray-600">
                    {permissionStatus === 'granted'
                      ? t('pushNotificationSettings', 'statusEnabledDesc', 'You will receive notifications for counselling sessions and more')
                      : permissionStatus === 'denied'
                      ? t('pushNotificationSettings', 'statusBlockedDesc', 'Enable in browser settings')
                      : t('pushNotificationSettings', 'statusNotEnabledDesc', 'Click to enable notifications')
                    }
                  </p>
                </div>
              </div>
              {permissionStatus === 'granted' ? (
                <Button onClick={sendTestPush} size="sm" variant="outline" disabled={testing}>
                  {testing
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : t('pushNotificationSettings', 'sendTestButton', 'Send test')}
                </Button>
              ) : (
                <Button onClick={requestPermission} size="sm">
                  {t('pushNotificationSettings', 'enableButton', 'Enable')}
                </Button>
              )}
            </div>
          </div>

          {/* Master Toggle */}
          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-gray-500" />
              <div>
                <Label className="font-medium">{t('pushNotificationSettings', 'allNotificationsLabel', 'All Notifications')}</Label>
                <p className="text-sm text-gray-500">{t('pushNotificationSettings', 'allNotificationsDesc', 'Enable or disable all notifications')}</p>
              </div>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => updateSetting('enabled', checked)}
              disabled={permissionStatus !== 'granted'}
            />
          </div>

          {/* === COUNSELLING SESSION REMINDERS === */}
          <PaidOnly>
          <div className="border-t pt-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Video className="h-5 w-5 text-purple-600" />
              <h3 className="font-semibold text-lg">{t('pushNotificationSettings', 'counsellingSessionsHeading', 'Counselling Sessions')}</h3>
            </div>

            {/* Counselling Reminders Master Toggle */}
            <div className="flex items-center justify-between py-3 bg-purple-50 rounded-lg px-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-purple-600" />
                <div>
                  <Label className="font-medium">{t('pushNotificationSettings', 'sessionRemindersLabel', 'Session Reminders')}</Label>
                  <p className="text-sm text-gray-500">{t('pushNotificationSettings', 'sessionRemindersDesc', 'Get notified before your counselling sessions')}</p>
                </div>
              </div>
              <Switch
                checked={settings.counsellingReminders}
                onCheckedChange={(checked) => updateSetting('counsellingReminders', checked)}
                disabled={!settings.enabled}
              />
            </div>

            {/* Counselling Reminder Types */}
            {settings.counsellingReminders && (
              <div className="ml-4 space-y-3">
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <Label className="text-sm">{t('pushNotificationSettings', 'session15minLabel', '15 minutes before session')}</Label>
                  </div>
                  <Switch
                    checked={settings.counsellingReminder15min}
                    onCheckedChange={(checked) => updateSetting('counsellingReminder15min', checked)}
                    disabled={!settings.enabled}
                  />
                </div>

                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <Label className="text-sm">{t('pushNotificationSettings', 'session5minLabel', '5 minutes before session')}</Label>
                  </div>
                  <Switch
                    checked={settings.counsellingReminder5min}
                    onCheckedChange={(checked) => updateSetting('counsellingReminder5min', checked)}
                    disabled={!settings.enabled}
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500 ml-4">
              {t('pushNotificationSettings', 'counsellorsNotifiedNote', 'Counsellors will also receive notifications when you book a new session')}
            </p>
          </div>
          </PaidOnly>

          {/* Devotional + Prayer daily reminders were DUPLICATED here and in the
              Daily Reminders tab, writing different columns and handled by a
              different (unscheduled) worker — so nothing was delivered. They now
              live ONLY in the Daily Reminders tab (in-app), which is the single
              source of truth. This card keeps only what's unique to push:
              counselling sessions (above) and live-channel events (below). */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-purple-400 shrink-0" />
              <p className="text-sm text-gray-500">
                {t('pushNotificationSettings', 'movedToDailyReminders', 'Devotional and prayer reminders are now managed in the Daily Reminders tab.')}
              </p>
            </div>
          </div>

          {/* === LIVE CHANNEL EVENT REMINDERS === */}
          <PaidOnly>
          <div className="border-t pt-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Radio className="h-5 w-5 text-purple-600" />
              <h3 className="font-semibold text-lg">{t('pushNotificationSettings', 'liveChannelEventsHeading', 'Live Channel Events')}</h3>
            </div>

            {/* Event Reminders Master Toggle */}
            <div className="flex items-center justify-between py-3 bg-purple-50 rounded-lg px-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-purple-600" />
                <div>
                  <Label className="font-medium">{t('pushNotificationSettings', 'eventRemindersLabel', 'Event Reminders')}</Label>
                  <p className="text-sm text-gray-500">{t('pushNotificationSettings', 'eventRemindersDesc', 'Get notified about registered events')}</p>
                </div>
              </div>
              <Switch
                checked={settings.eventRemindersEnabled}
                onCheckedChange={(checked) => updateSetting('eventRemindersEnabled', checked)}
                disabled={!settings.enabled}
              />
            </div>

            {/* Event Reminder Types */}
            {settings.eventRemindersEnabled && (
              <div className="ml-4 space-y-3">
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <Label className="text-sm">{t('pushNotificationSettings', 'event24hrLabel', '24 hours before event')}</Label>
                  </div>
                  <Switch
                    checked={settings.eventReminders24hr}
                    onCheckedChange={(checked) => updateSetting('eventReminders24hr', checked)}
                    disabled={!settings.enabled}
                  />
                </div>

                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <Label className="text-sm">{t('pushNotificationSettings', 'event1hrLabel', '1 hour before event')}</Label>
                  </div>
                  <Switch
                    checked={settings.eventReminders1hr}
                    onCheckedChange={(checked) => updateSetting('eventReminders1hr', checked)}
                    disabled={!settings.enabled}
                  />
                </div>

                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <Label className="text-sm">{t('pushNotificationSettings', 'event15minLabel', '15 minutes before event')}</Label>
                  </div>
                  <Switch
                    checked={settings.eventReminders15min}
                    onCheckedChange={(checked) => updateSetting('eventReminders15min', checked)}
                    disabled={!settings.enabled}
                  />
                </div>
              </div>
            )}

            {/* Channel Live Notifications */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Radio className="h-5 w-5 text-red-500" />
                <div>
                  <Label className="font-medium">{t('pushNotificationSettings', 'channelLiveAlertsLabel', 'Channel Live Alerts')}</Label>
                  <p className="text-sm text-gray-500">{t('pushNotificationSettings', 'channelLiveAlertsDesc', 'Get notified when followed channels go live')}</p>
                </div>
              </div>
              <Switch
                checked={settings.channelLiveNotifications}
                onCheckedChange={(checked) => updateSetting('channelLiveNotifications', checked)}
                disabled={!settings.enabled}
              />
            </div>

            {/* New Follower Notifications */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-blue-500" />
                <div>
                  <Label className="font-medium">{t('pushNotificationSettings', 'newFollowersLabel', 'New Followers')}</Label>
                  <p className="text-sm text-gray-500">{t('pushNotificationSettings', 'newFollowersDesc', 'Get notified when someone follows your channel')}</p>
                </div>
              </div>
              <Switch
                checked={settings.channelFollowerNotifications}
                onCheckedChange={(checked) => updateSetting('channelFollowerNotifications', checked)}
                disabled={!settings.enabled}
              />
            </div>
          </div>
          </PaidOnly>

          {/* Group Messages */}
          <PaidOnly>
          <div className="flex items-center justify-between py-3 border-t">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <Label className="font-medium">{t('pushNotificationSettings', 'groupMessagesLabel', 'Group Messages')}</Label>
                <p className="text-sm text-gray-500">{t('pushNotificationSettings', 'groupMessagesDesc', 'Notifications for new messages in prayer groups')}</p>
              </div>
            </div>
            <Switch
              checked={settings.groupMessages}
              onCheckedChange={(checked) => updateSetting('groupMessages', checked)}
              disabled={!settings.enabled}
            />
          </div>

          {/* Challenge Updates */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Flame className="h-5 w-5 text-orange-500" />
              <div>
                <Label className="font-medium">{t('pushNotificationSettings', 'challengeUpdatesLabel', 'Challenge Updates')}</Label>
                <p className="text-sm text-gray-500">{t('pushNotificationSettings', 'challengeUpdatesDesc', "Updates on prayer challenges you've joined")}</p>
              </div>
            </div>
            <Switch
              checked={settings.challengeUpdates}
              onCheckedChange={(checked) => updateSetting('challengeUpdates', checked)}
              disabled={!settings.enabled}
            />
          </div>
          </PaidOnly>

          {/* Streak Reminders */}
          <PaidOnly>
          <div className="flex items-center justify-between py-3 border-t">
            <div className="flex items-center gap-3">
              <Flame className="h-5 w-5 text-amber-500" />
              <div>
                <Label className="font-medium">{t('pushNotificationSettings', 'streakRemindersLabel', 'Streak Reminders')}</Label>
                <p className="text-sm text-gray-500">{t('pushNotificationSettings', 'streakRemindersDesc', "Don't break your streak! Get reminded if you haven't prayed today")}</p>
              </div>
            </div>
            <Switch
              checked={settings.streakReminders}
              onCheckedChange={(checked) => updateSetting('streakReminders', checked)}
              disabled={!settings.enabled}
            />
          </div>

          {/* Weekly Digest */}
          <div className="flex items-center justify-between py-3 border-t">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-purple-500" />
              <div>
                <Label className="font-medium">{t('pushNotificationSettings', 'weeklyDigestLabel', 'Weekly Digest')}</Label>
                <p className="text-sm text-gray-500">{t('pushNotificationSettings', 'weeklyDigestDesc', 'Receive a weekly summary of your spiritual journey')}</p>
              </div>
            </div>
            <Switch
              checked={settings.weeklyDigest}
              onCheckedChange={(checked) => updateSetting('weeklyDigest', checked)}
              disabled={!settings.enabled}
            />
          </div>
          </PaidOnly>

          {/* === DELIVERY PREFERENCES === */}
          <PaidOnly>
          <div className="border-t pt-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-5 w-5 text-gray-600" />
              <h3 className="font-semibold text-lg">{t('pushNotificationSettings', 'deliveryPreferencesHeading', 'Delivery Preferences')}</h3>
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-blue-500" />
                <div>
                  <Label className="font-medium">{t('pushNotificationSettings', 'inAppNotificationsLabel', 'In-App Notifications')}</Label>
                  <p className="text-sm text-gray-500">{t('pushNotificationSettings', 'inAppNotificationsDesc', 'See notifications while using the app')}</p>
                </div>
              </div>
              <Switch
                checked={settings.inAppNotifications}
                onCheckedChange={(checked) => updateSetting('inAppNotifications', checked)}
                disabled={!settings.enabled}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-green-500" />
                <div>
                  <Label className="font-medium">{t('pushNotificationSettings', 'pushNotificationsLabel', 'Push Notifications')}</Label>
                  <p className="text-sm text-gray-500">{t('pushNotificationSettings', 'pushNotificationsDesc', 'Receive browser/device notifications')}</p>
                </div>
              </div>
              <Switch
                checked={settings.pushNotifications}
                onCheckedChange={(checked) => updateSetting('pushNotifications', checked)}
                disabled={!settings.enabled || permissionStatus !== 'granted'}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-purple-500" />
                <div>
                  <Label className="font-medium">{t('pushNotificationSettings', 'emailNotificationsLabel', 'Email Notifications')}</Label>
                  <p className="text-sm text-gray-500">{t('pushNotificationSettings', 'emailNotificationsDesc', 'Receive notifications via email')}</p>
                </div>
              </div>
              <Switch
                checked={settings.emailNotifications}
                onCheckedChange={(checked) => updateSetting('emailNotifications', checked)}
                disabled={!settings.enabled}
              />
            </div>
          </div>
          </PaidOnly>

          {/* Save Button */}
          <Button 
            onClick={saveSettings} 
            className="w-full" 
            disabled={saving || !user}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('pushNotificationSettings', 'savingButton', 'Saving...')}
              </>
            ) : (
              t('pushNotificationSettings', 'saveButton', 'Save Notification Settings')
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PushNotificationSettings;
