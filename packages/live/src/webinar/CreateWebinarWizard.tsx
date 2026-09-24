import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Textarea } from '@rekindle/ui/textarea';
import { Switch } from '@rekindle/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@rekindle/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@rekindle/ui/select';
import { Loader2, Plus, X, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { zonedWallTimeToUtcISO, utcISOToZonedInputValue, guessUserTimeZone, commonTimeZones } from '@rekindle/features/meetingTime';
import { getMinistryEntitlements } from '@rekindle/auth/ministryEntitlements';
import { FREE_TIER_MEETING_LIMITS } from '@rekindle/auth/subscriptionEnforcement';
import { checkWebinarQuota, createWebinarSpeaker, type MinistryWebinar } from './webinarControl';
import { CAPTION_LANGUAGES } from '../captionLanguages';

interface CreateWebinarWizardProps {
  ministryId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (webinar: MinistryWebinar) => void;
  /** When set, edits this webinar in place instead of creating a new one —
   *  room_name/host_id/status are left untouched. */
  webinar?: MinistryWebinar | null;
}

interface DraftSpeaker {
  email: string;
  name: string;
  role: 'co-host' | 'speaker';
}

const DEFAULT_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'sw', label: 'Swahili' },
];

/** Webinar creation/edit wizard — a `webinar` prop switches this into edit mode. */
export function CreateWebinarWizard({ ministryId, isOpen, onClose, onSuccess, webinar }: CreateWebinarWizardProps) {
  const { user } = useAuth();
  const isEditing = !!webinar;
  const [isLoading, setIsLoading] = useState(false);
  const [accessReason, setAccessReason] = useState<string | undefined>();
  const [isFreeTier, setIsFreeTier] = useState(false);

  // 'now' just skips the date/time fields (saves as an unscheduled draft,
  // start it whenever from Manage Webinar); 'schedule' requires picking one
  // (saves as 'scheduled'). Saving never navigates anywhere in either case —
  // starting is always a separate, deliberate action (see handleSubmit).
  const [startMode, setStartMode] = useState<'now' | 'schedule'>('now');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [timezone, setTimezone] = useState(guessUserTimeZone());
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [maxAttendees, setMaxAttendees] = useState(200);
  const [isPublic, setIsPublic] = useState(false);
  const [registrationRequired, setRegistrationRequired] = useState(false);
  const [enableRecording, setEnableRecording] = useState(true);
  const [enableCaptions, setEnableCaptions] = useState(true);
  const [enableTranslation, setEnableTranslation] = useState(false);
  // Default checked (2026-09-22) — previously these three columns were never
  // included in sharedFields at all, so every webinar was created with them
  // stuck at their DB default of false and no way to ever turn them on: the
  // Chat/Q&A/Polls tabs weren't buggy, they were just permanently disabled.
  const [enableChat, setEnableChat] = useState(true);
  const [enableQA, setEnableQA] = useState(true);
  const [enablePolls, setEnablePolls] = useState(true);
  const [recordingVisibility, setRecordingVisibility] = useState<'public' | 'private'>('private');
  const [defaultLanguage, setDefaultLanguage] = useState('en');
  const [captionLanguage, setCaptionLanguage] = useState('en');
  const [speakers, setSpeakers] = useState<DraftSpeaker[]>([]);
  const [newSpeakerEmail, setNewSpeakerEmail] = useState('');
  const [newSpeakerName, setNewSpeakerName] = useState('');

  useEffect(() => {
    if (!isOpen || !user?.id) return;
    (async () => {
      try {
        const entitlements = await getMinistryEntitlements(ministryId);
        const freePlan = entitlements.tierSlug === 'free';
        setIsFreeTier(freePlan);
        if (!entitlements.caps.interactiveMeetings) {
          setAccessReason("This ministry's plan doesn't include live sessions — upgrade to enable webinars.");
          return;
        }
        // Quota only gates NEW webinars — re-checking it on every edit could
        // block editing something that already exists just because the
        // ministry has since used up its monthly free minutes elsewhere.
        if (freePlan && !isEditing) {
          const quota = await checkWebinarQuota(ministryId);
          if (!quota.allowed) {
            setAccessReason(`This ministry has used its free webinar time this month. Upgrade for more, or wait until next month.`);
            return;
          }
          setMaxAttendees((m) => Math.min(m, FREE_TIER_MEETING_LIMITS.maxParticipants));
          setDurationMinutes((d) => Math.min(d, FREE_TIER_MEETING_LIMITS.maxDurationMinutes));
        }
        setAccessReason(undefined);
      } catch (e) {
        console.error('[CreateWebinarWizard] access check failed:', e);
      }
    })();
  }, [isOpen, user?.id, ministryId, isEditing]);

  useEffect(() => {
    if (!isOpen) return;
    if (!webinar) {
      // Reset to a blank form each time the create dialog re-opens.
      setStartMode('now');
      setTitle(''); setDescription(''); setCoverImageUrl(''); setScheduledTime('');
      setTimezone(guessUserTimeZone()); setDurationMinutes(60); setMaxAttendees(200);
      setIsPublic(false); setRegistrationRequired(false); setEnableRecording(true);
      setEnableCaptions(true); setEnableTranslation(false); setDefaultLanguage('en'); setCaptionLanguage('en');
      setEnableChat(true); setEnableQA(true); setEnablePolls(true);
      setRecordingVisibility('private');
      setSpeakers([]);
      return;
    }
    setStartMode(webinar.scheduled_start_at ? 'schedule' : 'now');
    setTitle(webinar.title);
    setDescription(webinar.description ?? '');
    setCoverImageUrl(webinar.cover_image_url ?? '');
    setScheduledTime(webinar.scheduled_start_at ? utcISOToZonedInputValue(webinar.scheduled_start_at, webinar.timezone ?? guessUserTimeZone()) : '');
    setTimezone(webinar.timezone ?? guessUserTimeZone());
    setDurationMinutes(webinar.duration_minutes);
    setMaxAttendees(webinar.max_attendees);
    setIsPublic(webinar.is_public);
    setRegistrationRequired(webinar.registration_required);
    setEnableRecording(webinar.enable_recording);
    setEnableCaptions(webinar.enable_captions);
    setCaptionLanguage(webinar.source_language ?? 'en');
    setEnableTranslation(webinar.enable_translation);
    setEnableChat(webinar.enable_chat);
    setEnableQA(webinar.enable_qa);
    setEnablePolls(webinar.enable_polls);
    setRecordingVisibility(webinar.recording_visibility ?? 'private');
    setDefaultLanguage(webinar.default_language);
  }, [isOpen, webinar]);

  const addSpeaker = () => {
    if (!newSpeakerEmail.trim()) return;
    setSpeakers((prev) => [...prev, { email: newSpeakerEmail.trim(), name: newSpeakerName.trim(), role: 'speaker' }]);
    setNewSpeakerEmail('');
    setNewSpeakerName('');
  };

  const removeSpeaker = (email: string) => setSpeakers((prev) => prev.filter((s) => s.email !== email));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) { toast.error('You must be logged in to create a webinar'); return; }
    if (accessReason) { toast.error(accessReason); return; }
    if (!title.trim()) { toast.error('Give the webinar a title'); return; }

    if (startMode === 'schedule' && !scheduledTime) { toast.error('Pick a date and time, or switch to Start now'); return; }
    const scheduledUtc = startMode === 'schedule' && scheduledTime ? zonedWallTimeToUtcISO(scheduledTime, timezone) : null;
    if (startMode === 'schedule' && scheduledTime && !scheduledUtc) { toast.error('Please pick a valid date/time'); return; }

    setIsLoading(true);
    try {
      // No dedicated offset picker yet — a sensible default (24h/1h/15min,
      // all already-supported REMINDER_OFFSET_OPTIONS values) whenever
      // registration is required, matching the spec's 24h/1h/10-15min ask.
      const reminderOffsets = registrationRequired ? [1440, 60, 15] : [];
      const sharedFields = {
        title: title.trim(),
        description: description.trim() || null,
        cover_image_url: coverImageUrl.trim() || null,
        scheduled_start_at: scheduledUtc,
        timezone: scheduledUtc ? timezone : null,
        duration_minutes: durationMinutes,
        max_attendees: maxAttendees,
        registration_required: registrationRequired,
        reminder_offsets: reminderOffsets,
        is_public: isPublic,
        access_level: isPublic ? 'public' : 'members',
        enable_recording: isFreeTier ? false : enableRecording,
        enable_captions: enableCaptions,
        enable_translation: enableTranslation,
        enable_chat: enableChat,
        enable_qa: enableQA,
        enable_polls: enablePolls,
        recording_visibility: recordingVisibility,
        default_language: defaultLanguage,
        // Only written when the host picks a non-default caption language, so
        // saving still works on a database that hasn't run migration 0372 yet.
        ...(captionLanguage !== (webinar?.source_language ?? 'en') ? { source_language: captionLanguage } : {}),
      };

      if (isEditing && webinar) {
        const { data, error } = await supabase
          .from('ministry_webinars')
          .update({ ...sharedFields, status: webinar.status === 'draft' && scheduledUtc ? 'scheduled' : webinar.status })
          .eq('id', webinar.id)
          .select()
          .single();
        if (error) throw error;

        for (const s of speakers) {
          await createWebinarSpeaker({ webinarId: webinar.id, invitedEmail: s.email, invitedName: s.name || null, role: s.role });
        }

        toast.success('Webinar updated');
        onSuccess(data as MinistryWebinar);
        onClose();
        return;
      }

      const roomName = `webinar-${ministryId}-${Date.now()}`;
      const { data, error } = await supabase
        .from('ministry_webinars')
        .insert({
          ministry_id: ministryId,
          host_id: user.id,
          room_name: roomName,
          status: scheduledUtc ? 'scheduled' : 'draft',
          ...sharedFields,
        })
        .select()
        .single();
      if (error) throw error;

      for (const s of speakers) {
        await createWebinarSpeaker({ webinarId: data.id, invitedEmail: s.email, invitedName: s.name || null, role: s.role });
      }

      // Saving never navigates anywhere (2026-09-21, superseding the previous
      // "Start now" auto-jump into the Lobby) — Save Webinar just persists the
      // config; starting it is always a separate, deliberate action reached via
      // the dashboard's "Manage Webinar" confirm or the Lobby's "Start Webinar"
      // button. Drafts (startMode 'now') still show under Upcoming for leaders
      // (see WebinarDashboard.tsx), so it's easy to find either way.
      toast.success('Webinar saved');
      onSuccess(data as MinistryWebinar);
      onClose();
    } catch (err) {
      console.error('[CreateWebinarWizard] save failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save webinar');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-purple-600" /> {isEditing ? 'Edit Webinar' : 'New Webinar'}
          </DialogTitle>
        </DialogHeader>

        {accessReason && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="py-3 text-sm text-amber-800">{accessReason}</CardContent>
          </Card>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="webinar-title">Title</Label>
            <Input id="webinar-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunday teaching livestream" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webinar-description">Description</Label>
            <Textarea id="webinar-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webinar-cover">Cover image URL</Label>
            <Input id="webinar-cover" value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} placeholder="https://…" />
          </div>

          <div className="space-y-2">
            <Label>When</Label>
            <div className="flex gap-2">
              <Button
                type="button" variant={startMode === 'now' ? 'default' : 'outline'}
                className={startMode === 'now' ? 'bg-purple-600 hover:bg-purple-700' : ''}
                onClick={() => { setStartMode('now'); setScheduledTime(''); }}
              >
                Start now
              </Button>
              <Button
                type="button" variant={startMode === 'schedule' ? 'default' : 'outline'}
                className={startMode === 'schedule' ? 'bg-purple-600 hover:bg-purple-700' : ''}
                onClick={() => setStartMode('schedule')}
              >
                Schedule for later
              </Button>
            </div>
            {startMode === 'now' && (
              <p className="text-xs text-gray-500">
                {isEditing ? "Saving clears this webinar's scheduled time." : "Saved without a scheduled time — start it whenever you're ready from Manage Webinar."}
              </p>
            )}
          </div>

          {startMode === 'schedule' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="webinar-time">Date &amp; time</Label>
                <Input id="webinar-time" type="datetime-local" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {commonTimeZones().map((tz) => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="webinar-duration">Duration (minutes)</Label>
              <Input
                id="webinar-duration" type="number" min={5}
                max={isFreeTier ? FREE_TIER_MEETING_LIMITS.maxDurationMinutes : undefined}
                value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webinar-max">Max attendees</Label>
              <Input
                id="webinar-max" type="number" min={1}
                max={isFreeTier ? FREE_TIER_MEETING_LIMITS.maxParticipants : undefined}
                value={maxAttendees} onChange={(e) => setMaxAttendees(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Public</Label>
              <p className="text-xs text-gray-500">Anyone with the link can watch, not just ministry members.</p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Require registration</Label>
              <p className="text-xs text-gray-500">Attendees must register before joining — they'll get reminders too.</p>
            </div>
            <Switch checked={registrationRequired} onCheckedChange={setRegistrationRequired} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="text-sm">Recording</Label>
              <Switch checked={enableRecording} onCheckedChange={setEnableRecording} disabled={isFreeTier} />
            </div>
            {enableRecording && (
              <div className="space-y-1">
                <Label className="text-xs">Recording visibility</Label>
                <Select value={recordingVisibility} onValueChange={(v) => setRecordingVisibility(v as 'public' | 'private')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private — host &amp; admins only</SelectItem>
                    <SelectItem value="public">Public — in the ministry's Recordings tab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Captions are on-demand now: anyone can turn CC on during the
                webinar, so there's no host switch — just the language spoken. */}
            <div className="space-y-1">
              <Label className="text-xs">Caption language</Label>
              <Select value={captionLanguage} onValueChange={setCaptionLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAPTION_LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="text-sm">Live translation</Label>
              <Switch checked={enableTranslation} onCheckedChange={setEnableTranslation} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Default language</Label>
              <Select value={defaultLanguage} onValueChange={setDefaultLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Audience interaction</Label>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label className="text-sm">Chat</Label>
                <Switch checked={enableChat} onCheckedChange={setEnableChat} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label className="text-sm">Q&amp;A</Label>
                <Switch checked={enableQA} onCheckedChange={setEnableQA} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label className="text-sm">Polls</Label>
                <Switch checked={enablePolls} onCheckedChange={setEnablePolls} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Speakers &amp; co-hosts (optional)</Label>
            <div className="flex gap-2">
              <Input placeholder="Name" value={newSpeakerName} onChange={(e) => setNewSpeakerName(e.target.value)} className="w-1/3" />
              <Input placeholder="Email" value={newSpeakerEmail} onChange={(e) => setNewSpeakerEmail(e.target.value)} className="flex-1" />
              <Button type="button" variant="secondary" onClick={addSpeaker}><Plus className="h-4 w-4" /></Button>
            </div>
            {speakers.length > 0 && (
              <div className="space-y-1 mt-2">
                {speakers.map((s) => (
                  <div key={s.email} className="flex items-center justify-between text-sm bg-gray-50 rounded px-2 py-1">
                    <span>{s.name || s.email} <span className="text-gray-400">({s.email})</span></span>
                    <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeSpeaker(s.email)}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* sticky (2026-09-22, real report: "can no longer see the Save
              button, it's not scrolling downward") — the form grew taller
              with the audience-interaction/recording-visibility fields
              added this session, and relying on scrolling all the way to a
              footer at the natural end of a long form inside a dialog was
              fragile. Pinning it to the bottom of the dialog's own scroll
              area means Save is always visible without needing to scroll
              at all, regardless of how tall the form gets. */}
          <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-background border-t">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isLoading || !!accessReason}>
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Webinar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateWebinarWizard;
