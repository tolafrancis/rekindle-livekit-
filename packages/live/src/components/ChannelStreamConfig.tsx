import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { Switch } from '@rekindle/ui/switch';
import { Loader2, Copy, Check, Radio, Eye, EyeOff, ExternalLink, ChevronDown, AlertTriangle } from 'lucide-react';
import {
  provisionChannelStream, getChannelStreamCreds, deleteChannelStream, reprovisionChannelStream, type MuxProvision,
  addSimulcastTarget, removeSimulcastTarget, listSimulcastTargets,
  startChannelBroadcast, stopChannelBroadcast,
  type SimulcastPlatform, type SimulcastTarget,
} from '../muxStream';
import { SIMULCAST_DESTINATIONS, SIMULCAST_PLATFORMS } from '../simulcastDestinations';
import { useLanguage } from '@rekindle/features/LanguageContext';

interface ChannelStreamConfigProps {
  channel: any;
  open: boolean;
  onClose: () => void;
}

/**
 * Resolve to null if the promise doesn't settle within `ms`. Prevents the dialog
 * from hanging on a slow/unreachable streaming backend — the UI falls back to the
 * "not available" state instead of spinning forever.
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

// ── RestreamSection ───────────────────────────────────────────────────────────
// "Restream to YouTube & Facebook" — manage Mux simulcast targets per channel.
// Stream keys are write-only: existing keys are never rendered back (the server
// returns only `hasKey`). Targets can only change while the stream is idle, so
// the controls are disabled while the channel is live.
const STATUS_DOT: Record<SimulcastTarget['status'], string> = {
  idle: 'bg-gray-400',
  active: 'bg-green-500',
  error: 'bg-red-500',
};

const RestreamSection: React.FC<{ channelId: string; isLive: boolean }> = ({ channelId, isLive }) => {
  const { t } = useLanguage();
  const blank = <T,>(v: T) => ({ youtube: v, facebook: v } as Record<SimulcastPlatform, T>);

  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState<Record<SimulcastPlatform, SimulcastTarget | undefined>>(blank(undefined));
  const [serverUrls, setServerUrls] = useState<Record<SimulcastPlatform, string>>({
    youtube: SIMULCAST_DESTINATIONS.youtube.defaultServerUrl,
    facebook: SIMULCAST_DESTINATIONS.facebook.defaultServerUrl,
  });
  const [keys, setKeys] = useState<Record<SimulcastPlatform, string>>(blank(''));
  const [showKey, setShowKey] = useState<Record<SimulcastPlatform, boolean>>(blank(false));
  const [enabled, setEnabled] = useState<Record<SimulcastPlatform, boolean>>(blank(true));
  const [advanced, setAdvanced] = useState<Record<SimulcastPlatform, boolean>>(blank(false));
  const [replacing, setReplacing] = useState<Record<SimulcastPlatform, boolean>>(blank(false));
  const [busy, setBusy] = useState<SimulcastPlatform | null>(null);

  const load = async () => {
    const res = await listSimulcastTargets(channelId);
    if (res.ok && res.data) {
      const byPlatform = blank<SimulcastTarget | undefined>(undefined);
      const su = { ...serverUrls };
      const en = blank(true);
      for (const row of res.data.targets) {
        byPlatform[row.platform] = row;
        su[row.platform] = row.server_url;
        en[row.platform] = row.enabled;
      }
      setTargets(byPlatform);
      setServerUrls(su);
      setEnabled(en);
    }
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    listSimulcastTargets(channelId).then((res) => {
      if (!active) return;
      if (res.ok && res.data) {
        const byPlatform = { youtube: undefined, facebook: undefined } as Record<SimulcastPlatform, SimulcastTarget | undefined>;
        const su = {
          youtube: SIMULCAST_DESTINATIONS.youtube.defaultServerUrl,
          facebook: SIMULCAST_DESTINATIONS.facebook.defaultServerUrl,
        };
        const en = { youtube: true, facebook: true };
        for (const row of res.data.targets) {
          byPlatform[row.platform] = row;
          su[row.platform] = row.server_url;
          en[row.platform] = row.enabled;
        }
        setTargets(byPlatform);
        setServerUrls(su);
        setEnabled(en);
      }
      setLoading(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const save = async (platform: SimulcastPlatform) => {
    const key = keys[platform].trim();
    const url = serverUrls[platform].trim();
    if (!url) {
      toast({ title: t('channelStreamConfig', 'serverUrlRequired', 'Server URL required'), variant: 'destructive' });
      return;
    }
    if (!key) {
      toast({ title: t('channelStreamConfig', 'streamKeyRequired', 'Stream key required'), description: t('channelStreamConfig', 'streamKeyRequiredDesc', 'Paste the stream key from the platform dashboard.'), variant: 'destructive' });
      return;
    }
    setBusy(platform);
    try {
      const res = await addSimulcastTarget(channelId, platform, url, key);
      if (!res.ok) {
        toast({
          title: t('channelStreamConfig', 'couldNotConnectRestream', 'Could not connect restream'),
          description: res.error === 'stream_active'
            ? t('channelStreamConfig', 'stopBroadcastFirst', 'Stop the broadcast first, then try again.')
            : (res.message || res.error || t('channelStreamConfig', 'unknownError', 'Unknown error')),
          variant: 'destructive',
        });
        return;
      }
      setKeys((k) => ({ ...k, [platform]: '' }));
      setReplacing((r) => ({ ...r, [platform]: false }));
      setShowKey((s) => ({ ...s, [platform]: false }));
      await load();
      toast({ title: t('channelStreamConfig', 'restreamConnectedX', '{platform} restream connected').replace('{platform}', String(SIMULCAST_DESTINATIONS[platform].label)) });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (platform: SimulcastPlatform) => {
    setBusy(platform);
    try {
      const res = await removeSimulcastTarget(channelId, platform);
      if (!res.ok) {
        toast({
          title: t('channelStreamConfig', 'couldNotRemoveRestream', 'Could not remove restream'),
          description: res.error === 'stream_active'
            ? t('channelStreamConfig', 'stopBroadcastFirst', 'Stop the broadcast first, then try again.')
            : (res.message || res.error || t('channelStreamConfig', 'unknownError', 'Unknown error')),
          variant: 'destructive',
        });
        return;
      }
      setTargets((prev) => ({ ...prev, [platform]: undefined }));
      setKeys((k) => ({ ...k, [platform]: '' }));
      setServerUrls((su) => ({ ...su, [platform]: SIMULCAST_DESTINATIONS[platform].defaultServerUrl }));
      toast({ title: t('channelStreamConfig', 'restreamRemovedX', '{platform} restream removed').replace('{platform}', String(SIMULCAST_DESTINATIONS[platform].label)) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 pt-2 border-t">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">{t('channelStreamConfig', 'restreamHeading', 'Restream to YouTube & Facebook')}</h3>
        <p className="text-xs text-gray-500">
          {t('channelStreamConfig', 'restreamDescription', "Mirror this channel's broadcast to YouTube Live and Facebook Live at the same time — the feed is forwarded for you, so there's nothing extra to run. You still create the broadcast and press “Go Live” on each platform.")}
        </p>
      </div>

      {isLive && (
        <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {t('channelStreamConfig', 'stopBroadcastToChange', 'Stop the broadcast to change restream destinations.')}
        </div>
      )}

      {loading ? (
        <div className="py-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-purple-500" /></div>
      ) : (
        SIMULCAST_PLATFORMS.map((platform) => {
          const meta = SIMULCAST_DESTINATIONS[platform];
          const target = targets[platform];
          const connected = !!target?.hasKey;
          const isBusy = busy === platform;
          const status = target?.status ?? 'idle';
          const showKeyInput = !connected || replacing[platform];

          return (
            <div key={platform} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[status]}`} title={t('channelStreamConfig', 'statusX', 'Status: {status}').replace('{status}', String(status))} />
                  <span className="text-sm font-medium">{meta.label}</span>
                  {connected && (
                    <span className="text-[10px] uppercase tracking-wide rounded bg-green-100 text-green-700 px-1.5 py-0.5">
                      {t('channelStreamConfig', 'connected', 'Connected')}
                    </span>
                  )}
                </div>
                <a
                  href={meta.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-600 hover:underline inline-flex items-center gap-1"
                >
                  {t('channelStreamConfig', 'dashboard', 'Dashboard')} <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <p className="text-xs text-gray-500">{meta.keyHint}</p>

              {status === 'error' && target?.last_error && (
                <p className="text-xs text-red-600">{t('channelStreamConfig', 'lastErrorX', 'Last error: {error}').replace('{error}', String(target.last_error))}</p>
              )}

              {/* Stream key (primary field) */}
              {showKeyInput ? (
                <div>
                  <Label className="text-xs">{t('channelStreamConfig', 'streamKey', 'Stream key')}</Label>
                  <div className="flex gap-2">
                    <Input
                      type={showKey[platform] ? 'text' : 'password'}
                      value={keys[platform]}
                      onChange={(e) => setKeys((k) => ({ ...k, [platform]: e.target.value }))}
                      placeholder={t('channelStreamConfig', 'pasteStreamKey', 'Paste stream key')}
                      className="font-mono text-sm"
                      disabled={isLive || isBusy}
                    />
                    <Button
                      variant="outline" size="icon" type="button"
                      onClick={() => setShowKey((s) => ({ ...s, [platform]: !s[platform] }))}
                      title={showKey[platform] ? t('channelStreamConfig', 'hide', 'Hide') : t('channelStreamConfig', 'show', 'Show')}
                    >
                      {showKey[platform] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="font-mono">{t('channelStreamConfig', 'streamKeySaved', 'Stream key saved ••••••••')}</span>
                  <Button
                    variant="ghost" size="sm" type="button"
                    onClick={() => setReplacing((r) => ({ ...r, [platform]: true }))}
                    disabled={isLive || isBusy}
                    className="h-7 text-purple-600"
                  >
                    {t('channelStreamConfig', 'replaceKey', 'Replace key')}
                  </Button>
                </div>
              )}

              {/* Server URL (advanced, pre-filled, editable) */}
              <div>
                <button
                  type="button"
                  onClick={() => setAdvanced((a) => ({ ...a, [platform]: !a[platform] }))}
                  className="text-xs text-gray-500 inline-flex items-center gap-1 hover:text-gray-700"
                >
                  <ChevronDown className={`h-3 w-3 transition-transform ${advanced[platform] ? 'rotate-180' : ''}`} />
                  {t('channelStreamConfig', 'advancedServerUrl', 'Advanced — Server URL')}
                </button>
                {advanced[platform] && (
                  <div className="mt-1">
                    <Input
                      value={serverUrls[platform]}
                      onChange={(e) => setServerUrls((su) => ({ ...su, [platform]: e.target.value }))}
                      className="font-mono text-sm"
                      disabled={isLive || isBusy}
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      {t('channelStreamConfig', 'serverUrlHint', 'Pre-filled to the standard ingest URL. Override only if your dashboard shows a different one.')}
                    </p>
                  </div>
                )}
              </div>

              {/* Enable + actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={enabled[platform]}
                    disabled={isLive || isBusy}
                    onCheckedChange={(v) => setEnabled((en) => ({ ...en, [platform]: v }))}
                  />
                  <span className="text-xs text-gray-600">{t('channelStreamConfig', 'enableRestream', 'Enable restream')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {connected && (
                    <Button
                      variant="ghost" size="sm" type="button"
                      onClick={() => remove(platform)}
                      disabled={isLive || isBusy}
                      className="h-8 text-red-600"
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('channelStreamConfig', 'remove', 'Remove')}
                    </Button>
                  )}
                  <Button
                    size="sm" type="button"
                    onClick={() => save(platform)}
                    disabled={isLive || isBusy || !enabled[platform]}
                    className="h-8 bg-purple-600 hover:bg-purple-700"
                  >
                    {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('channelStreamConfig', 'save', 'Save')}
                  </Button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

/**
 * Per-channel low-latency Mux live stream.
 * The platform auto-mints a Mux live stream (no dashboards, no pasting). The
 * owner can either:
 *   • Broadcast: paste the Server URL + Stream Key below into OBS/encoder, or
 *   • Interactive: just go live from the Daily room — the same Mux ingest is
 *     used automatically.
 * Either way, viewers watch the channel via the Mux HLS playback URL.
 */
export const ChannelStreamConfig: React.FC<ChannelStreamConfigProps> = ({ channel, open, onClose }) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prov, setProv] = useState<MuxProvision | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [recordEnabled, setRecordEnabled] = useState<boolean>(channel?.enable_recording !== false);
  const [recBusy, setRecBusy] = useState(false);
  const [errDetail, setErrDetail] = useState<string | null>(null);
  const [showEncoder, setShowEncoder] = useState(false);
  const [obsBusy, setObsBusy] = useState(false);
  const [isObsBroadcasting, setIsObsBroadcasting] = useState<boolean>(!!channel?.is_live);

  useEffect(() => {
    if (!open || !channel?.id) return;
    let active = true;
    setLoading(true);
    setErrDetail(null);
    setRecordEnabled(channel.enable_recording !== false);
    (async () => {
      // Reuse the channel's existing live stream if it already has one (exactly
      // what "Go Live" does), and only create a new one when there isn't one yet.
      // Calling create on a channel that already has a stream can fail — that was
      // the cause of "Streaming temporarily unavailable" here while Go Live worked.
      let p = await withTimeout(getChannelStreamCreds(channel.id), 20000);
      if (!active) return;
      if (!p?.rtmpUrl) {
        p = await withTimeout(provisionChannelStream(channel.id, channel.enable_recording !== false), 20000);
      }
      if (!active) return;
      if (p) {
        setProv(p);
        try {
          await supabase.from('live_channel_broadcast_config').upsert({
            channel_id: channel.id,
            owner_id: channel.owner_id,
            rtmps_url: p.serverUrl,
            stream_key: p.streamKey,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'channel_id' });
          await supabase.from('live_channels')
            .update({ hls_playback_url: p.playbackUrl || null })
            .eq('id', channel.id);
        } catch { /* surfaced on Save if it matters */ }
      } else {
        // Provisioning failed. The call() helper swallows the underlying reason,
        // so make ONE direct call to surface exactly what the backend said — this
        // is what we need to see in the console to know why streaming won't set up.
        let reason = t('channelStreamConfig', 'noResponseFromService', 'No response from the streaming service.');
        try {
          const { data: raw, error: rawErr } = await supabase.functions.invoke('livekit-ingress', {
            body: { action: 'create', channelId: channel.id, roomName: `channel-${channel.id}` },
          });
          if (rawErr) {
            reason = rawErr.message || reason;
            // FunctionsHttpError carries the JSON body on .context (a Response).
            const ctx = (rawErr as any).context;
            if (ctx?.json) { try { const b = await ctx.json(); reason = b?.error || b?.message || reason; } catch { /* not json */ } }
          } else if (raw && !raw.rtmpUrl) {
            reason = raw.error || raw.message || `Backend returned no ingest URL (keys: ${Object.keys(raw).join(', ') || 'none'}).`;
          }
          console.error('[Broadcast setup] provisioning failed:', { reason, raw, rawErr });
        } catch (diagErr: any) {
          reason = diagErr?.message || reason;
          console.error('[Broadcast setup] provisioning diagnostic threw:', diagErr);
        }
        if (!active) return;
        setErrDetail(reason);
        toast({
          title: t('channelStreamConfig', 'couldNotSetUpStream', 'Could not set up the stream'),
          description: reason,
          variant: 'destructive',
        });
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [open, channel?.id]);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* clipboard blocked */ }
  };

  const disableStream = async () => {
    setSaving(true);
    try {
      // Bounded so a slow/unreachable backend can't trap the user in the dialog.
      await withTimeout(deleteChannelStream(channel.id), 10000);
      await supabase.from('live_channels').update({ hls_playback_url: null }).eq('id', channel.id);
      await supabase.from('live_channel_broadcast_config').delete().eq('channel_id', channel.id);
      toast({ title: t('channelStreamConfig', 'streamingDisabled', 'Streaming disabled'), description: t('channelStreamConfig', 'streamingDisabledDesc', 'Viewers will use the standard participant mode.') });
    } catch (e: any) {
      toast({ title: t('channelStreamConfig', 'couldNotDisable', 'Could not disable'), description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
      onClose(); // always close — never leave the dialog stuck
    }
  };

  const Field = ({ label, value, secret }: { label: string; value: string; secret?: boolean }) => (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly type={secret ? 'password' : 'text'} value={value} className="font-mono text-sm" />
        <Button variant="outline" size="icon" onClick={() => copy(label, value)} title={t('channelStreamConfig', 'copy', 'Copy')}>
          {copied === label ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );

  const toggleRecording = async (next: boolean) => {
    setRecBusy(true);
    try {
      await supabase.from('live_channels').update({ enable_recording: next }).eq('id', channel.id);
      // Recording can't be toggled on an existing stream — re-provision (bounded).
      const p = await withTimeout(reprovisionChannelStream(channel.id, next), 20000);
      if (p) {
        setProv(p);
        await supabase.from('live_channel_broadcast_config').upsert({
          channel_id: channel.id, owner_id: channel.owner_id,
          rtmps_url: p.serverUrl, stream_key: p.streamKey, updated_at: new Date().toISOString(),
        }, { onConflict: 'channel_id' });
        await supabase.from('live_channels').update({ hls_playback_url: p.playbackUrl || null }).eq('id', channel.id);
      }
      setRecordEnabled(next);
      toast({ title: next ? t('channelStreamConfig', 'recordingOn', 'Recording on') : t('channelStreamConfig', 'recordingOff', 'Recording off'),
        description: next ? t('channelStreamConfig', 'recordingOnDesc', 'Broadcasts will be recorded.') : t('channelStreamConfig', 'recordingOffDesc', 'Broadcasts will not be recorded at all.') });
    } catch (e: any) {
      toast({ title: t('channelStreamConfig', 'couldNotChangeRecording', 'Could not change recording'), description: e?.message, variant: 'destructive' });
    } finally {
      setRecBusy(false);
    }
  };

  const handleStartObsBroadcast = async () => {
    setObsBusy(true);
    try {
      const res = await startChannelBroadcast(channel.id);
      if (res?.playbackUrl) {
        setIsObsBroadcasting(true);
        if (prov) {
          setProv({ ...prov, playbackUrl: res.playbackUrl });
        }
        toast({
          title: t('channelStreamConfig', 'broadcastStarted', 'Broadcast started'),
          description: t('channelStreamConfig', 'broadcastStartedDesc', 'Your OBS stream is now live for viewers.'),
        });
      } else {
        toast({
          title: t('channelStreamConfig', 'couldNotStartBroadcast', 'Could not start broadcast'),
          description: t('channelStreamConfig', 'obsStartFailedDesc', 'Make sure OBS is actively streaming before starting the broadcast.'),
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({
        title: t('channelStreamConfig', 'couldNotStartBroadcast', 'Could not start broadcast'),
        description: e?.message || t('channelStreamConfig', 'obsStartFailedDesc', 'Make sure OBS is actively streaming before starting the broadcast.'),
        variant: 'destructive',
      });
    } finally {
      setObsBusy(false);
    }
  };

  const handleStopObsBroadcast = async () => {
    setObsBusy(true);
    try {
      await stopChannelBroadcast(channel.id);
      setIsObsBroadcasting(false);
      toast({
        title: t('channelStreamConfig', 'broadcastStopped', 'Broadcast stopped'),
      });
    } catch (e: any) {
      toast({
        title: t('channelStreamConfig', 'couldNotStopBroadcast', 'Could not stop broadcast'),
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setObsBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <Radio className="h-5 w-5 text-purple-600" />
            {t('channelStreamConfig', 'broadcastSetup', 'Broadcast setup')}{channel?.name ? ` — ${channel.name}` : ''}
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            {t('channelStreamConfig', 'broadcastSetupDesc', 'Your channel is ready to stream. To go live straight from the browser, just press “Go Live” — no setup needed. Below you can also mirror your broadcast to YouTube & Facebook, turn recording on/off, or (under Advanced) use external software like OBS.')}
          </p>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
          </div>
        ) : prov ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>{t('channelStreamConfig', 'recordBroadcasts', 'Record broadcasts')}</Label>
                <p className="text-xs text-gray-500">
                  {t('channelStreamConfig', 'recordBroadcastsDesc', "Records the whole broadcast automatically; the recording appears in this channel's Recordings a few minutes after you end. Change it before going live.")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {recBusy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                <Switch checked={recordEnabled} disabled={recBusy} onCheckedChange={toggleRecording} />
              </div>
            </div>

            <RestreamSection channelId={channel.id} isLive={!!channel?.is_live} />

            {/* Advanced — external encoder details. Collapsed by default so the
                technical ingest URLs aren't shown unless someone actually uses OBS. */}
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => setShowEncoder((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-gray-500" />
                  {t('channelStreamConfig', 'advancedExternalSoftware', 'Advanced — broadcast with external software (OBS)')}
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showEncoder ? 'rotate-180' : ''}`} />
              </button>
              {showEncoder && (
                <div className="px-3 pb-3 space-y-3 border-t pt-3">
                  <Field label={t('channelStreamConfig', 'serverUrl', 'Server URL')} value={prov.serverUrl} />
                  <Field label={t('channelStreamConfig', 'streamKeySecret', 'Stream Key (secret)')} value={prov.streamKey} secret />
                  <Field label={t('channelStreamConfig', 'playbackUrl', 'Playback URL')} value={prov.playbackUrl} />
                  <p className="text-xs text-gray-400">
                    {t('channelStreamConfig', 'obsInstructions', 'In OBS: Settings → Stream → Service "Custom", paste the Server URL and Stream Key. Keep the Stream Key private. Low-latency mode (~5s).')}
                  </p>
                  <div className="pt-2 border-t flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                      {isObsBroadcasting
                        ? t('channelStreamConfig', 'obsBroadcastingActive', 'Broadcast is currently live.')
                        : t('channelStreamConfig', 'obsBroadcastingIdle', 'Start stream in OBS first, then click Start Broadcast.')}
                    </div>
                    {isObsBroadcasting ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={handleStopObsBroadcast}
                        disabled={obsBusy}
                      >
                        {obsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('channelStreamConfig', 'stopBroadcast', 'Stop Broadcast')}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleStartObsBroadcast}
                        disabled={obsBusy}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {obsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('channelStreamConfig', 'startBroadcast', 'Start Broadcast')}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-gray-500 space-y-2">
            <p>{t('channelStreamConfig', 'streamingUnavailable', 'Streaming is temporarily unavailable. Please close and reopen this window to try again.')}</p>
            {errDetail && (
              <p className="text-xs text-red-500 font-mono break-words px-4">{t('channelStreamConfig', 'reasonX', 'Reason: {reason}').replace('{reason}', String(errDetail))}</p>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={disableStream} disabled={saving} className="w-full sm:w-auto text-red-600">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('channelStreamConfig', 'disableStreaming', 'Disable streaming')}
          </Button>
          <Button onClick={onClose} disabled={saving || loading} className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700">
            {t('channelStreamConfig', 'done', 'Done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChannelStreamConfig;
