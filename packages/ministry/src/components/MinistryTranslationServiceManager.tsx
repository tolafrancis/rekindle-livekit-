import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Badge } from '@rekindle/ui/badge';
import { Switch } from '@rekindle/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { generateBroadcastOverlayPng, downloadUrl } from '@rekindle/features/qrCode';
import { Radio, Plus, X, Loader2, Copy, Square, Play, Cast, QrCode, Share2 } from 'lucide-react';
import type { BadgeProps } from '@rekindle/ui/badge';

interface MinistryTranslationServiceManagerProps {
  ministryId: string;
}

interface SessionRow {
  id: string;
  service_id: string | null;
  source_type: 'livekit_room' | 'pa_mixer';
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

  const [showStart, setShowStart] = useState(false);
  const [starting, setStarting] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [pairs, setPairs] = useState<string[]>(['']);

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
      const [{ data: cfg }, { data: svc, error: svcErr }, { data: sess, error: sessErr }] = await Promise.all([
        supabase.from('language_configs').select('source_language, supported_target_languages, speaker_identity').eq('ministry_id', ministryId).maybeSingle(),
        supabase.from('translation_services').select('id, name, started_at, ended_at, created_at').eq('ministry_id', ministryId).order('created_at', { ascending: false }).limit(20),
        supabase.from('translation_sessions').select('id, service_id, source_type, source_language, target_language, status, created_at').eq('ministry_id', ministryId).order('created_at', { ascending: false }).limit(100),
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

  const copyDisplayLink = (sessionId: string) => {
    const url = `${window.location.origin}/display/${sessionId}`;
    navigator.clipboard.writeText(url).then(
      () => toast({ title: 'Display link copied' }),
      () => toast({ title: 'Could not copy link', description: url, variant: 'destructive' }),
    );
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
  const landingUrlFor = (service: ServiceRow) => `${window.location.origin}/display?service_id=${service.id}`;

  const downloadQrOverlay = async (service: ServiceRow) => {
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

  const copyBroadcastLink = (service: ServiceRow) => {
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
  const shareBroadcastLink = async (service: ServiceRow) => {
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
            One or more language pairs, dispatched to the translation bot for a LiveKit room.
          </p>
        </div>
        <Button onClick={openStartDialog} disabled={supportedLanguages.length === 0}>
          <Play className="h-4 w-4 mr-1.5" /> Start Service
        </Button>
      </div>

      {supportedLanguages.length === 0 && (
        <Card><CardContent className="py-4 text-sm text-muted-foreground">
          Add at least one supported target language in the Settings tab before starting a service.
        </CardContent></Card>
      )}

      {services.length === 0 && supportedLanguages.length > 0 && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          No services yet. Click "Start Service" to dispatch your first translation session.
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
                      {session.source_type === 'livekit_room' ? 'LiveKit Room' : 'PA Mixer'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => copyDisplayLink(session.id)} title="Copy display link">
                      <Copy className="h-4 w-4" />
                    </Button>
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
            <DialogTitle>Start a Translation Service</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Service name</Label>
              <Input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="Sunday 9am Service" />
            </div>
            <div className="space-y-1.5">
              <Label>LiveKit room name</Label>
              <p className="text-xs text-muted-foreground">
                The bot joins this room and subscribes to the speaker. Phase 2 auto-fills this from the actual
                meeting — for now, enter the room name the meeting will use.
              </p>
              <Input value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="e.g. sunday-service-2026-08-16" />
            </div>
            <div className="space-y-2">
              <Label>Language pairs ({sourceLanguage.toUpperCase()} → target)</Label>
              {pairs.map((value, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select value={value} onValueChange={v => setPairAt(idx, v)}>
                    <SelectTrigger><SelectValue placeholder="Choose a language" /></SelectTrigger>
                    <SelectContent>
                      {supportedLanguages.map(code => (
                        <SelectItem key={code} value={code}>{code.toUpperCase()}</SelectItem>
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
              Start Service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistryTranslationServiceManager;
