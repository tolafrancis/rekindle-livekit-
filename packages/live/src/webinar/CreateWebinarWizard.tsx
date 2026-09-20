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
import { zonedWallTimeToUtcISO, guessUserTimeZone, commonTimeZones } from '@rekindle/features/meetingTime';
import { getMinistryEntitlements } from '@rekindle/auth/ministryEntitlements';
import { FREE_TIER_MEETING_LIMITS } from '@rekindle/auth/subscriptionEnforcement';
import { checkWebinarQuota, createWebinarSpeaker, type MinistryWebinar } from './webinarControl';

interface CreateWebinarWizardProps {
  ministryId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (webinar: MinistryWebinar) => void;
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

/** Phase 1 webinar creation — schema/toggles are already forward-compatible with
 *  Phase 2+ (chat/Q&A/polls/registration), but those toggles are marked "coming
 *  soon" here since only recording/captions/translation actually do anything yet. */
export function CreateWebinarWizard({ ministryId, isOpen, onClose, onSuccess }: CreateWebinarWizardProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [accessReason, setAccessReason] = useState<string | undefined>();
  const [isFreeTier, setIsFreeTier] = useState(false);

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
  const [defaultLanguage, setDefaultLanguage] = useState('en');
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
        if (freePlan) {
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
  }, [isOpen, user?.id, ministryId]);

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

    const scheduledUtc = scheduledTime ? zonedWallTimeToUtcISO(scheduledTime, timezone) : null;
    if (scheduledTime && !scheduledUtc) { toast.error('Please pick a valid date/time'); return; }

    setIsLoading(true);
    try {
      const roomName = `webinar-${ministryId}-${Date.now()}`;
      const { data, error } = await supabase
        .from('ministry_webinars')
        .insert({
          ministry_id: ministryId,
          host_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          cover_image_url: coverImageUrl.trim() || null,
          scheduled_start_at: scheduledUtc,
          timezone: scheduledUtc ? timezone : null,
          duration_minutes: durationMinutes,
          room_name: roomName,
          max_attendees: maxAttendees,
          registration_required: registrationRequired,
          is_public: isPublic,
          access_level: isPublic ? 'public' : 'members',
          enable_recording: isFreeTier ? false : enableRecording,
          enable_captions: enableCaptions,
          enable_translation: enableTranslation,
          default_language: defaultLanguage,
          status: scheduledUtc ? 'scheduled' : 'draft',
        })
        .select()
        .single();
      if (error) throw error;

      for (const s of speakers) {
        await createWebinarSpeaker({ webinarId: data.id, invitedEmail: s.email, invitedName: s.name || null, role: s.role });
      }

      toast.success('Webinar created');
      onSuccess(data as MinistryWebinar);
      onClose();
    } catch (err) {
      console.error('[CreateWebinarWizard] create failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create webinar');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Radio className="h-5 w-5 text-purple-600" /> New Webinar</DialogTitle>
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
              <p className="text-xs text-gray-500">Coming soon — reminders/RSVP tracking ship in a later update.</p>
            </div>
            <Switch checked={registrationRequired} onCheckedChange={setRegistrationRequired} disabled />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="text-sm">Recording</Label>
              <Switch checked={enableRecording} onCheckedChange={setEnableRecording} disabled={isFreeTier} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="text-sm">Captions</Label>
              <Switch checked={enableCaptions} onCheckedChange={setEnableCaptions} />
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isLoading || !!accessReason}>
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create webinar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateWebinarWizard;
