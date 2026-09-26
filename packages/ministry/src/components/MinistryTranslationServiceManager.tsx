import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Badge } from '@rekindle/ui/badge';
import { Switch } from '@rekindle/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { RadioGroup, RadioGroupItem } from '@rekindle/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { generateBroadcastOverlayPng, downloadUrl } from '@rekindle/features/qrCode';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { Radio, Plus, X, Loader2, Copy, Square, Play, Cast, QrCode, Share2, Mic, AlertTriangle, Trash2, Captions } from 'lucide-react';
import { ObsCaptionSetupDialog } from '@rekindle/live/components/ObsCaptionSetupDialog';
import type { BadgeProps } from '@rekindle/ui/badge';
import { COMMON_LANGUAGES, languageLabel } from './MinistryTranslationSettings';

interface MinistryTranslationServiceManagerProps {
  ministryId: string;
}

interface SessionRow {
  id: string;
  service_id: string | null;
  source_type: 'livekit_room' | 'pa_mixer' | 'browser_speaker';
  source_language: string;
  target_language: string;
  status: string;
  created_at: string;
}

interface ServiceRow {
  id: string;
  name: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

// Named Speaker Links (see createSpeakerLink) now attach a service_id, so
// their 'browser_speaker' rows can land in this same per-service list, not
// just the standalone "Speaker Links" card below — needs its own label,
// same as the other two source_types already had.
const SOURCE_TYPE_LABEL: Record<string, string> = {
  livekit_room: 'LiveKit Room',
  pa_mixer: 'PA Mixer',
  browser_speaker: 'Speaker Link',
};

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  initialising: 'secondary',
  joining: 'warning',
  active: 'success',
  paused: 'warning',
  ended: 'outline',
  error: 'destructive',
};

export const MinistryTranslationServiceManager: React.FC<MinistryTranslationServiceManagerProps> = ({ ministryId }) => {
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>([]);
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [speakerIdentityDefault, setSpeakerIdentityDefault] = useState<string | null>(null);

  // Billing (2026-09-13) — informational only, nothing here gates
  // client-side; the actual requirement is enforced server-side in
  // start_speaker_session/start_bot_session. Reversed from Phase 1's
  // original tier-bundled design (migration 0343) to a standalone add-on
  // (migration 0345, same shape as storage_pack/member_block/gift_aid) —
  // "hasActiveTranslationPlan" now really means "has bought the Live
  // Translation add-on", not "is on any paid tier". This is just
  // visibility so an admin isn't surprised by the RPC's error.
  const [hasActiveTranslationPlan, setHasActiveTranslationPlan] = useState<boolean | null>(null);
  const [translationHoursIncluded, setTranslationHoursIncluded] = useState<number | null>(null);
  const [translationMinutesUsed, setTranslationMinutesUsed] = useState<number | null>(null);

  const [showStart, setShowStart] = useState(false);
  const [starting, setStarting] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [pairs, setPairs] = useState<string[]>(['']);

  // "Speaker Link" (migration 0288) — a browser-only alternative to a full
  // Meeting or the PA edge agent: pick one target language, get back a
  // speaker link (opens a mic-publish page, no login) and the usual
  // listener link. One language pair per link, by design — see that
  // migration's header comment.
  const [showSpeaker, setShowSpeaker] = useState(false);
  const [speakerServiceName, setSpeakerServiceName] = useState('');
  const [speakerLanguage, setSpeakerLanguage] = useState('');
  // The language the SPEAKER will talk in for this specific link — distinct
  // from the ministry-wide `sourceLanguage` above, which may be 'auto'.
  // Defaults to a real pinned language, never 'auto': manual selection gives
  // Deepgram stronger context than auto-detect and measurably cuts errors
  // like "praise" -> "press" (explicit product decision, not just a UI
  // nicety) — auto-detect stays available in the dropdown, just not
  // pre-selected. Independent of the Settings tab's own Auto-detect toggle,
  // which is the ministry-wide default for every OTHER pipeline
  // (Meetings/PA/etc.) — this only affects speaker links created here.
  const [speakerSourceLanguage, setSpeakerSourceLanguage] = useState('en');
  // "Translation Engine" (2026-09-13). 'realtime_live' trades some accuracy
  // for much lower latency (a genuine speech-to-speech model, not a
  // transcribe->translate->synthesize relay); 'auto' resolves server-side to
  // 'realtime_live' for a normal live session. Whatever vendor actually
  // powers "Realtime Live" is deliberately never named in this UI — only in
  // code/migrations, which is developer-facing, not admin-facing.
  const [speakerEngine, setSpeakerEngine] = useState<'rekindle_ai' | 'realtime_live' | 'auto'>('auto');
  const [creatingSpeaker, setCreatingSpeaker] = useState(false);
  // The raw speaker token only ever exists in the RPC's response — shown
  // once here, same discipline as the device-registration dialog's raw key.
  const [newSpeakerLink, setNewSpeakerLink] = useState<{ speakerLink: string; listenerLink: string } | null>(null);
  // The translation_services row created alongside the speaker session —
  // gives this flow a name and, via landingUrlFor below, the same Broadcast
  // mode (QR overlay / copy / share) the multi-language "Start Service"
  // cards already have.
  const [newSpeakerService, setNewSpeakerService] = useState<{ id: string; name: string } | null>(null);

  // Broadcast Companion Link (build plan §2.6) — "Broadcast mode" is UI-only,
  // not persisted. It doesn't change anything about the service itself; it
  // just reveals the QR-overlay download for services being pushed to
  // YouTube/OBS, where multi-audio-track selection isn't available so
  // multilingual viewers instead scan a QR to open /display on their phone.
  const [broadcastMode, setBroadcastMode] = useState<Set<string>>(new Set());
  const [generatingQrFor, setGeneratingQrFor] = useState<string | null>(null);
  const [qrPreview, setQrPreview] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: cfg }, { data: svc, error: svcErr }, { data: sess, error: sessErr }, { data: addonRows }, { data: minutesUsed }] = await Promise.all([
        supabase.from('language_configs').select('source_language, supported_target_languages, speaker_identity').eq('ministry_id', ministryId).maybeSingle(),
        supabase.from('translation_services').select('id, name, started_at, ended_at, created_at').eq('ministry_id', ministryId).order('created_at', { ascending: false }).limit(20),
        supabase.from('translation_sessions').select('id, service_id, source_type, source_language, target_language, status, created_at').eq('ministry_id', ministryId).order('created_at', { ascending: false }).limit(100),
        supabase.from('ministry_addons').select('quantity, unit_hours').eq('ministry_id', ministryId).eq('addon_type', 'live_translation').eq('status', 'active'),
        supabase.rpc('get_ministry_translation_minutes_used', { p_ministry_id: ministryId }),
      ]);
      if (svcErr) throw svcErr;
      if (sessErr) throw sessErr;
      if (cfg) {
        setSourceLanguage(cfg.source_language || 'en');
        setSupportedLanguages(cfg.supported_target_languages || []);
        setSpeakerIdentityDefault(cfg.speaker_identity);
      }
      setServices(svc || []);
      setSessions(sess || []);
      setTranslationMinutesUsed(typeof minutesUsed === 'number' ? minutesUsed : null);

      // Standalone add-on now (migration 0345), not a tier perk — "has the
      // feature" means "has at least one active live_translation add-on",
      // and "included hours" is the sum of what's actually been bought,
      // not something derived from ministry_partner_plans anymore.
      const hoursPurchased = (addonRows || []).reduce((sum, a) => sum + (a.quantity ?? 1) * (a.unit_hours ?? 0), 0);
      setHasActiveTranslationPlan((addonRows?.length ?? 0) > 0);
      setTranslationHoursIncluded((addonRows?.length ?? 0) > 0 ? hoursPurchased : null);
    } catch (err: any) {
      console.error('[MinistryTranslationServiceManager] load failed:', err);
      toast({ title: 'Could not load translation services', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [ministryId]);

  useEffect(() => { load(); }, [load]);

  // Phase 1.4 — "Wire Supabase Realtime on translation_sessions for live
  // dashboard status."
  useEffect(() => {
    const channel = supabase
      .channel(`translation-sessions-${ministryId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'translation_sessions', filter: `ministry_id=eq.${ministryId}` },
        (payload) => {
          setSessions(prev => {
            if (payload.eventType === 'DELETE') {
              return prev.filter(s => s.id !== (payload.old as { id: string }).id);
            }
            const row = payload.new as SessionRow;
            const exists = prev.some(s => s.id === row.id);
            return exists ? prev.map(s => (s.id === row.id ? row : s)) : [row, ...prev];
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ministryId]);

  const openStartDialog = () => {
    setServiceName('');
    setRoomName('');
    setPairs([supportedLanguages[0] || '']);
    setShowStart(true);
  };

  const addPairRow = () => setPairs(p => [...p, '']);
  const removePairRow = (idx: number) => setPairs(p => p.filter((_, i) => i !== idx));
  const setPairAt = (idx: number, value: string) => setPairs(p => p.map((row, i) => (i === idx ? value : row)));

  const startService = async () => {
    const validPairs = Array.from(new Set(pairs.map(p => p.trim()).filter(Boolean)));
    if (!serviceName.trim() || !roomName.trim() || validPairs.length === 0) {
      toast({ title: 'Fill in a service name, room name, and at least one language', variant: 'destructive' });
      return;
    }
    setStarting(true);
    try {
      const { data: service, error: svcErr } = await supabase
        .from('translation_services')
        .insert({ ministry_id: ministryId, name: serviceName.trim(), started_at: new Date().toISOString() })
        .select('id')
        .single();
      if (svcErr) throw svcErr;

      for (const targetLanguage of validPairs) {
        const { error } = await supabase.rpc('start_bot_session', {
          p_ministry_id: ministryId,
          p_room_name: roomName.trim(),
          p_source_language: sourceLanguage,
          p_target_language: targetLanguage,
          p_speaker_identity: speakerIdentityDefault,
          p_service_id: service.id,
        });
        if (error) throw error;
      }

      toast({ title: 'Service started', description: `${validPairs.length} language session(s) dispatched.` });
      setShowStart(false);
      load();
    } catch (err: any) {
      console.error('[MinistryTranslationServiceManager] start failed:', err);
      toast({ title: 'Could not start service', description: err.message, variant: 'destructive' });
    } finally {
      setStarting(false);
    }
  };

  const openSpeakerDialog = () => {
    setSpeakerServiceName('');
    setSpeakerLanguage(supportedLanguages[0] || '');
    // Start from the ministry's pinned language if it has one; only fall
    // back to 'en' when the ministry-wide setting is itself 'auto' — never
    // pre-select Auto-detect for a new speaker link.
    setSpeakerSourceLanguage(sourceLanguage && sourceLanguage !== 'auto' ? sourceLanguage : 'en');
    setSpeakerEngine('auto');
    setNewSpeakerLink(null);
    setNewSpeakerService(null);
    setShowSpeaker(true);
  };

  const createSpeakerLink = async () => {
    if (!speakerLanguage || !speakerServiceName.trim()) return;
    setCreatingSpeaker(true);
    try {
      // A named translation_services row, same as multi-language "Start
      // Service" — unlocks Broadcast mode (QR/copy/share, via
      // landingUrlFor) for this speaker link too, and gives /display
      // something to show at the top besides the bare target language.
      const { data: service, error: svcErr } = await supabase
        .from('translation_services')
        .insert({ ministry_id: ministryId, name: speakerServiceName.trim(), started_at: new Date().toISOString() })
        .select('id, name')
        .single();
      if (svcErr) throw svcErr;

      const { data, error } = await supabase.rpc('start_speaker_session', {
        p_ministry_id: ministryId,
        p_source_language: speakerSourceLanguage,
        p_target_language: speakerLanguage,
        p_service_id: service.id,
        p_engine: speakerEngine,
      });
      if (error) throw error;
      const { session_id, speaker_token } = data as { session_id: string; speaker_token: string };
      setNewSpeakerLink({
        speakerLink: `${window.location.origin}/speak/${session_id}?t=${speaker_token}`,
        listenerLink: `${window.location.origin}/display/${session_id}`,
      });
      setNewSpeakerService({ id: service.id, name: service.name });
      load();
    } catch (err: any) {
      console.error('[MinistryTranslationServiceManager] speaker link creation failed:', err);
      toast({ title: 'Could not create speaker link', description: err.message, variant: 'destructive' });
    } finally {
      setCreatingSpeaker(false);
    }
  };

  const copyToClipboard = (label: string, url: string) => {
    navigator.clipboard.writeText(url).then(
      () => toast({ title: `${label} copied` }),
      () => toast({ title: `Could not copy ${label.toLowerCase()}`, description: url, variant: 'destructive' }),
    );
  };

  const stopSession = async (sessionId: string) => {
    try {
      const { error } = await supabase.rpc('stop_bot_session', { p_session_id: sessionId });
      if (error) throw error;
      toast({ title: 'Session stopped' });
    } catch (err: any) {
      toast({ title: 'Could not stop session', description: err.message, variant: 'destructive' });
    }
  };

  const stopService = async (service: ServiceRow) => {
    const active = sessions.filter(s => s.service_id === service.id && s.status !== 'ended');
    try {
      await Promise.all(active.map(s => supabase.rpc('stop_bot_session', { p_session_id: s.id })));
      await supabase.from('translation_services').update({ ended_at: new Date().toISOString() }).eq('id', service.id);
      toast({ title: 'Service ended' });
      load();
    } catch (err: any) {
      toast({ title: 'Could not end service', description: err.message, variant: 'destructive' });
    }
  };

  // Removes the service label itself (e.g. a test/typo entry) — not a
  // stronger version of "End Service". translation_sessions.service_id is
  // "on delete set null" (migration 0273), so any past session under it
  // just loses its grouping label rather than being deleted itself.
  // Blocked while a session is still active so nobody deletes a service
  // out from under a live translation session — end it first.
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  const deleteService = async (service: ServiceRow) => {
    const active = sessions.filter(s => s.service_id === service.id && s.status !== 'ended');
    if (active.length > 0) {
      toast({ title: 'Cannot delete', description: 'This service still has an active session — end it first.', variant: 'destructive' });
      return;
    }
    if (!confirm(`Delete "${service.name}"? Past sessions stay, just no longer grouped under this name. This cannot be undone.`)) return;
    setDeletingServiceId(service.id);
    try {
      const { error } = await supabase.from('translation_services').delete().eq('id', service.id);
      if (error) throw error;
      toast({ title: 'Service deleted' });
      load();
    } catch (err: any) {
      toast({ title: 'Could not delete service', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingServiceId(null);
    }
  };

  // Session whose "Captions in OBS" setup dialog is open (Browser Source link
  // for burning translated captions into the OBS output).
  const [obsCaptionSessionId, setObsCaptionSessionId] = useState<string | null>(null);

  const copyDisplayLink = (sessionId: string) => {
    const url = `${window.location.origin}/display/${sessionId}`;
    navigator.clipboard.writeText(url).then(
      () => toast({ title: 'Display link copied' }),
      () => toast({ title: 'Could not copy link', description: url, variant: 'destructive' }),
    );
  };

  // Speaker Link (browser_speaker) sessions only. The raw speaker token is
  // deliberately never stored past its one-time reveal (migration 0288), so
  // "Copy" here can't just re-copy something already on the row like
  // copyDisplayLink does — speaker_session_get_link mints a fresh one, either
  // refreshing the existing session (still running) or restarting it as a
  // brand-new session under the same service (already ended). Either way the
  // primary link this button hands the admin is the speaker link, not the
  // listener link — that's the one whoever's actually speaking needs.
  const [copyingSpeakerLinkFor, setCopyingSpeakerLinkFor] = useState<string | null>(null);
  const copySpeakerLink = async (session: SessionRow) => {
    setCopyingSpeakerLinkFor(session.id);
    try {
      const { data, error } = await supabase.rpc('speaker_session_get_link', { p_session_id: session.id });
      if (error) throw error;
      const { session_id, speaker_token, restarted } = data as { session_id: string; speaker_token: string; restarted: boolean };
      const url = `${window.location.origin}/speak/${session_id}?t=${speaker_token}`;
      await navigator.clipboard.writeText(url);
      toast({
        title: restarted ? 'Restarted — speaker link copied' : 'Speaker link copied',
        description: restarted ? 'A new session was started to replace the ended one.' : undefined,
      });
      if (restarted) load();
    } catch (err: any) {
      toast({ title: 'Could not get speaker link', description: err.message, variant: 'destructive' });
    } finally {
      setCopyingSpeakerLinkFor(null);
    }
  };

  const toggleBroadcastMode = (serviceId: string, on: boolean) => {
    setBroadcastMode(prev => {
      const next = new Set(prev);
      if (on) next.add(serviceId); else next.delete(serviceId);
      return next;
    });
  };

  // Landing page (not a single language's /display link) — viewers self-select
  // their language after scanning, same URL the service-level QR always uses.
  // Shared by the QR/copy/share actions below so all three always agree.
  // Takes {id, name} rather than the full ServiceRow so the Speaker Link
  // flow's result screen (which only ever has those two fields) can reuse
  // these too, not just the multi-language "Start Service" cards.
  const landingUrlFor = (service: { id: string; name: string }) => `${window.location.origin}/display?service_id=${service.id}`;

  const downloadQrOverlay = async (service: { id: string; name: string }) => {
    setGeneratingQrFor(service.id);
    try {
      const pngDataUrl = await generateBroadcastOverlayPng(landingUrlFor(service));
      setQrPreview(prev => ({ ...prev, [service.id]: pngDataUrl }));
      const filename = `${service.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-broadcast-qr.png`;
      downloadUrl(pngDataUrl, filename);
      toast({ title: 'QR overlay downloaded', description: 'Drop it into OBS as an image source.' });
    } catch (err: any) {
      console.error('[MinistryTranslationServiceManager] QR overlay generation failed:', err);
      toast({ title: 'Could not generate QR overlay', description: err.message, variant: 'destructive' });
    } finally {
      setGeneratingQrFor(null);
    }
  };

  const copyBroadcastLink = (service: { id: string; name: string }) => {
    const url = landingUrlFor(service);
    navigator.clipboard.writeText(url).then(
      () => toast({ title: 'Broadcast link copied' }),
      () => toast({ title: 'Could not copy link', description: url, variant: 'destructive' }),
    );
  };

  // Web Share API — mobile/OS share sheet (text/WhatsApp/email/etc.), not a
  // social-network integration. Falls back to copy on desktop browsers that
  // don't implement it (Firefox/most desktop Chrome) rather than showing a
  // dead button.
  const shareBroadcastLink = async (service: { id: string; name: string }) => {
    const url = landingUrlFor(service);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Follow ${service.name} in your language`, url });
      } catch (err: any) {
        if (err?.name !== 'AbortError') { // user cancelling the share sheet isn't an error
          toast({ title: 'Could not share link', description: err.message, variant: 'destructive' });
        }
      }
    } else {
      copyBroadcastLink(service);
    }
  };

  const sessionsFor = (serviceId: string) => sessions.filter(s => s.service_id === serviceId);
  // Speaker Link sessions aren't attached to a translation_services row —
  // there's no "name this service" step, by design (see openSpeakerDialog's
  // comment) — so they're listed on their own instead of nested under a
  // service card.
  const speakerSessions = sessions.filter(s => s.source_type === 'browser_speaker' && !s.service_id);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Radio className="h-5 w-5 text-indigo-600" />
            Live Translation Services
          </h3>
          <p className="text-sm text-muted-foreground">
            Start a live translation session with a speaker link that works for sermons, meetings, classes, and community events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openSpeakerDialog} disabled={supportedLanguages.length === 0}>
            <Mic className="h-4 w-4 mr-1.5" /> Start Service
          </Button>
        </div>
      </div>

      {hasActiveTranslationPlan === false && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Live Translation requires the Live Translation add-on. Buy hours in Billing settings → Add-ons to start a service.
          </AlertDescription>
        </Alert>
      )}

      {hasActiveTranslationPlan === true && translationMinutesUsed !== null && (
        <p className="text-xs text-muted-foreground">
          {(translationMinutesUsed / 60).toFixed(1)}h used this month
          {translationHoursIncluded !== null ? ` of ${translationHoursIncluded}h purchased` : ''}.
        </p>
      )}

      {supportedLanguages.length === 0 && (
        <Card><CardContent className="py-4 text-sm text-muted-foreground">
          Add at least one supported target language in the Settings tab before starting a service.
        </CardContent></Card>
      )}

      {speakerSessions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="h-4 w-4 text-indigo-600" /> Speaker Links
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Browser-based sessions started from a speaker link instead of a Meeting or PA device.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {speakerSessions.map(session => (
              <div key={session.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant={STATUS_VARIANT[session.status] || 'secondary'}>{session.status}</Badge>
                  <span className="text-sm font-medium truncate">
                    {session.source_language.toUpperCase()} → {session.target_language.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copySpeakerLink(session)}
                    disabled={copyingSpeakerLinkFor === session.id}
                    title={session.status === 'ended' ? 'Restart and copy a new speaker link' : 'Copy speaker link'}
                  >
                    {copyingSpeakerLinkFor === session.id ? <Loader2 className="h-4 w-4 animate-spin" /> : session.status === 'ended' ? <Play className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => copyDisplayLink(session.id)} title="Copy listener link">
                    <Copy className="h-4 w-4" />
                  </Button>
                  {session.status !== 'ended' && (
                    <Button variant="ghost" size="sm" onClick={() => setObsCaptionSessionId(session.id)} title="Captions in OBS">
                      <Captions className="h-4 w-4" />
                    </Button>
                  )}
                  {session.status !== 'ended' && (
                    <Button variant="ghost" size="sm" onClick={() => stopSession(session.id)} title="Stop this speaker link">
                      <Square className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {services.length === 0 && supportedLanguages.length > 0 && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          No live services yet. Use Start Service to create a stream for your next meeting, class, sermon, or community event.
        </CardContent></Card>
      )}

      {services.map(service => {
        const rows = sessionsFor(service.id);
        return (
          <Card key={service.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{service.name}</CardTitle>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <Cast className="h-3.5 w-3.5" />
                    Broadcast mode
                    <Switch
                      checked={broadcastMode.has(service.id)}
                      onCheckedChange={(v) => toggleBroadcastMode(service.id, v)}
                    />
                  </label>
                  {!service.ended_at && rows.some(r => r.status !== 'ended') && (
                    <Button variant="outline" size="sm" onClick={() => stopService(service)}>
                      <Square className="h-3.5 w-3.5 mr-1.5" /> End Service
                    </Button>
                  )}
                  {!rows.some(r => r.status !== 'ended') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteService(service)}
                      disabled={deletingServiceId === service.id}
                      title="Delete this service"
                    >
                      {deletingServiceId === service.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {service.ended_at
                  ? `Ended ${new Date(service.ended_at).toLocaleString()}`
                  : `Started ${service.started_at ? new Date(service.started_at).toLocaleString() : ''}`}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {broadcastMode.has(service.id) && (
                <div className="flex items-start gap-3 rounded-lg border border-dashed p-3 bg-muted/30">
                  {qrPreview[service.id] && (
                    <img
                      src={qrPreview[service.id]}
                      alt="Broadcast QR overlay preview"
                      className="h-16 rounded border shrink-0"
                    />
                  )}
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <p className="text-xs text-muted-foreground">
                      For YouTube/OBS broadcasts, which can't offer a language picker like the meeting can. Viewers
                      scan this QR to open <code className="text-[11px]">/display</code> on their own phone and pick
                      their language — audio there runs ~2–8s behind the room, and a broadcast platform typically
                      adds another 5–40s on top of that; both are normal for a live stream with captions, not a bug.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => downloadQrOverlay(service)} disabled={generatingQrFor === service.id}>
                        {generatingQrFor === service.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5 mr-1.5" />}
                        Download QR overlay
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => copyBroadcastLink(service)}>
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy link
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => shareBroadcastLink(service)}>
                        <Share2 className="h-3.5 w-3.5 mr-1.5" />
                        Share
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {rows.map(session => (
                <div key={session.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={STATUS_VARIANT[session.status] || 'secondary'}>{session.status}</Badge>
                    <span className="text-sm font-medium truncate">
                      {session.source_language.toUpperCase()} → {session.target_language.toUpperCase()}
                    </span>
                    <Badge variant="outline" className="hidden sm:inline-flex">
                      {SOURCE_TYPE_LABEL[session.source_type] || session.source_type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {session.source_type === 'browser_speaker' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copySpeakerLink(session)}
                        disabled={copyingSpeakerLinkFor === session.id}
                        title={session.status === 'ended' ? 'Restart and copy a new speaker link' : 'Copy speaker link'}
                      >
                        {copyingSpeakerLinkFor === session.id ? <Loader2 className="h-4 w-4 animate-spin" /> : session.status === 'ended' ? <Play className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => copyDisplayLink(session.id)} title="Copy display link">
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                    {session.status !== 'ended' && (
                      <Button variant="ghost" size="sm" onClick={() => setObsCaptionSessionId(session.id)} title="Captions in OBS">
                        <Captions className="h-4 w-4" />
                      </Button>
                    )}
                    {session.status !== 'ended' && (
                      <Button variant="ghost" size="sm" onClick={() => stopSession(session.id)} title="Stop this language">
                        <Square className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {rows.length === 0 && <p className="text-xs text-muted-foreground">No sessions under this service.</p>}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={showStart} onOpenChange={setShowStart}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Start Service</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Service name</Label>
              <Input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="e.g. Community Gathering, Live Talk, Sunday Talk, Conference Session" />
              <p className="text-xs text-muted-foreground">
                Recommended: use a general name that works across church, community, school, and public events.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>LiveKit room name</Label>
              <p className="text-xs text-muted-foreground">
                Use a neutral room name that is easy to share. This is only for a dedicated LiveKit room flow.
              </p>
              <Input value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="e.g. community-gathering-2026-08-16" />
            </div>
            <div className="space-y-2">
              <Label>Language pairs ({sourceLanguage.toUpperCase()} → target)</Label>
              {pairs.map((value, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select value={value} onValueChange={v => setPairAt(idx, v)}>
                    <SelectTrigger><SelectValue placeholder="Choose a language" /></SelectTrigger>
                    <SelectContent>
                      {supportedLanguages.map(code => (
                        <SelectItem key={code} value={code}>{languageLabel(code)} ({code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {pairs.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removePairRow(idx)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addPairRow}>
                <Plus className="h-4 w-4 mr-1.5" /> Add language
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStart(false)}>Cancel</Button>
            <Button onClick={startService} disabled={starting}>
              {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create Service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSpeaker} onOpenChange={(open) => { setShowSpeaker(open); if (!open) { setNewSpeakerLink(null); setNewSpeakerService(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a Speaker Link</DialogTitle>
          </DialogHeader>
          {!newSpeakerLink ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                A link a speaker opens in any browser to publish their mic straight into a translated session — no
                Meeting, no installed software. One target language per link; create another for a second language.
              </p>
              <div className="space-y-1.5">
                <Label>Service name</Label>
                <Input
                  value={speakerServiceName}
                  onChange={e => setSpeakerServiceName(e.target.value)}
                  placeholder="e.g. Sunday Service, Community Talk, Bible Study"
                />
                <p className="text-xs text-muted-foreground">
                  Shown at the top of the listener page, and used for the Broadcast mode QR/link below.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Speaker's language</Label>
                <Select value={speakerSourceLanguage} onValueChange={setSpeakerSourceLanguage}>
                  <SelectTrigger><SelectValue placeholder="Choose a language" /></SelectTrigger>
                  <SelectContent>
                    {COMMON_LANGUAGES.map(l => (
                      <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                    ))}
                    <SelectItem value="auto">Auto-detect language</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Picking the actual language (recommended) gives speech recognition stronger context and cuts
                  errors like hearing "praise" as "press" — Auto-detect is available but a manual pick is more
                  accurate.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Target language ({speakerSourceLanguage === 'auto' ? 'auto' : speakerSourceLanguage.toUpperCase()} → )</Label>
                <Select value={speakerLanguage} onValueChange={setSpeakerLanguage}>
                  <SelectTrigger><SelectValue placeholder="Choose a language" /></SelectTrigger>
                  <SelectContent>
                    {supportedLanguages.map(code => (
                      <SelectItem key={code} value={code}>{languageLabel(code)} ({code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Translation Engine</Label>
                {/* "Realtime Live" removed from this list (2026-09-13) --
                    confirmed non-functional against a real Gemini Live
                    session (audio verifiably reaches the model, it never
                    once generates a response) through two fix attempts with
                    zero error feedback to chase further. The engine and its
                    'auto' server-side resolution both still exist
                    (BotSession.ts/GeminiLiveEngine.ts, migration 0344 now
                    resolves 'auto' -> 'rekindle_ai' instead) -- just not
                    reachable from this dialog until it's actually fixed.
                    Re-add the RadioGroupItem for 'realtime_live' here once
                    it's confirmed working again. */}
                <RadioGroup value={speakerEngine} onValueChange={(v) => setSpeakerEngine(v as typeof speakerEngine)} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="rekindle_ai" id="engine-rekindle-ai" className="mt-0.5" />
                    <Label htmlFor="engine-rekindle-ai" className="cursor-pointer font-normal">
                      <span className="font-medium">Rekindle AI</span> — High Accuracy
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="auto" id="engine-auto" className="mt-0.5" />
                    <Label htmlFor="engine-auto" className="cursor-pointer font-normal">
                      <span className="font-medium">Auto</span> — Recommended
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  The speaker link is shown once. Copy it now and send it to whoever's speaking — it can't be
                  retrieved again after you close this dialog (create a new speaker link instead if it's lost).
                </AlertDescription>
              </Alert>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Speaker link — send to whoever's speaking</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-2 py-1.5 text-xs break-all">{newSpeakerLink.speakerLink}</code>
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard('Speaker link', newSpeakerLink.speakerLink)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Listener link — send to anyone following along</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-2 py-1.5 text-xs break-all">{newSpeakerLink.listenerLink}</code>
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard('Listener link', newSpeakerLink.listenerLink)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {newSpeakerService && (
                <div className="flex items-start gap-3 rounded-lg border border-dashed p-3 bg-muted/30">
                  {qrPreview[newSpeakerService.id] && (
                    <img
                      src={qrPreview[newSpeakerService.id]}
                      alt="Broadcast QR overlay preview"
                      className="h-16 rounded border shrink-0"
                    />
                  )}
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <p className="text-xs font-medium flex items-center gap-1.5"><Cast className="h-3.5 w-3.5" /> Broadcast mode</p>
                    <p className="text-xs text-muted-foreground">
                      For projecting or printing a QR code, or sharing a link so anyone can open the listener page
                      on their own phone.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => downloadQrOverlay(newSpeakerService)} disabled={generatingQrFor === newSpeakerService.id}>
                        {generatingQrFor === newSpeakerService.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5 mr-1.5" />}
                        Download QR overlay
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => copyBroadcastLink(newSpeakerService)}>
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy link
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => shareBroadcastLink(newSpeakerService)}>
                        <Share2 className="h-3.5 w-3.5 mr-1.5" />
                        Share
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {!newSpeakerLink ? (
              <>
                <Button variant="outline" onClick={() => setShowSpeaker(false)}>Cancel</Button>
                <Button onClick={createSpeakerLink} disabled={creatingSpeaker || !speakerLanguage || !speakerServiceName.trim()}>
                  {creatingSpeaker ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Create Speaker Link
                </Button>
              </>
            ) : (
              <Button onClick={() => setShowSpeaker(false)}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {obsCaptionSessionId && (
        <ObsCaptionSetupDialog
          sessionId={obsCaptionSessionId}
          open
          onOpenChange={(o) => { if (!o) setObsCaptionSessionId(null); }}
        />
      )}
    </div>
  );
};

export default MinistryTranslationServiceManager;
