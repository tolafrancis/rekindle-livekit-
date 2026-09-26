import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@rekindle/ui/dialog';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Switch } from '@rekindle/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { toast } from '@rekindle/ui/use-toast';
import { Copy, ExternalLink } from 'lucide-react';

interface Props {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Builds the /obs-captions/:sessionId Browser Source URL for OBS (see
 * ObsCaptionOverlay.tsx and docs/obs-live-captions.md). The obs-websocket
 * password, if any, goes in the URL fragment so it is never sent to a server.
 */
export const ObsCaptionSetupDialog: React.FC<Props> = ({ sessionId, open, onOpenChange }) => {
  const [show, setShow] = useState<'translated' | 'original' | 'both'>('translated');
  const [pos, setPos] = useState<'bottom' | 'top'>('bottom');
  const [size, setSize] = useState('44');
  const [style, setStyle] = useState<'box' | 'outline'>('box');
  const [cc, setCc] = useState(false);
  const [obsPort, setObsPort] = useState('4455');
  const [obsPassword, setObsPassword] = useState('');

  const url = useMemo(() => {
    const q = new URLSearchParams({ show, pos, size: size || '44', style });
    if (cc) {
      q.set('cc', '1');
      if (obsPort && obsPort !== '4455') q.set('obsport', obsPort);
    }
    const hash = cc && obsPassword ? `#${new URLSearchParams({ obsws: obsPassword })}` : '';
    return `${window.location.origin}/obs-captions/${sessionId}?${q}${hash}`;
  }, [sessionId, show, pos, size, style, cc, obsPort, obsPassword]);

  const copy = () => {
    navigator.clipboard.writeText(url).then(
      () => toast({ title: 'OBS caption link copied' }),
      () => toast({ title: 'Could not copy link', description: url, variant: 'destructive' }),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Captions in OBS</DialogTitle>
          <DialogDescription>
            Adds these live captions to your OBS video, so they're part of everything OBS streams and records.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Show</Label>
              <Select value={show} onValueChange={(v) => setShow(v as typeof show)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="translated">Translation</SelectItem>
                  <SelectItem value="original">Original speech</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Position</Label>
              <Select value={pos} onValueChange={(v) => setPos(v as typeof pos)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom">Bottom</SelectItem>
                  <SelectItem value="top">Top</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Text size (px)</Label>
              <Input type="number" min={16} max={120} value={size} onChange={(e) => setSize(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Style</Label>
              <Select value={style} onValueChange={(v) => setStyle(v as typeof style)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="box">Dark box</SelectItem>
                  <SelectItem value="outline">Outlined text</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Also send as closed captions (CC)</p>
                <p className="text-xs text-muted-foreground">
                  Viewers on YouTube/Twitch can switch these on or off. Only when OBS streams straight to that
                  platform, and only for Latin-script languages.
                </p>
              </div>
              <Switch checked={cc} onCheckedChange={setCc} />
            </div>
            {cc && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>OBS WebSocket port</Label>
                  <Input value={obsPort} onChange={(e) => setObsPort(e.target.value.replace(/\D/g, ''))} />
                </div>
                <div className="space-y-1.5">
                  <Label>OBS WebSocket password</Label>
                  <Input type="password" value={obsPassword} onChange={(e) => setObsPassword(e.target.value)} />
                </div>
                <p className="col-span-2 text-xs text-muted-foreground">
                  From OBS → Tools → WebSocket Server Settings (enable the server there). The password stays in
                  the link on this computer and is never sent to ReKindle.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Browser Source URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button type="button" variant="outline" size="icon" onClick={copy} title="Copy">
                <Copy className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="icon" asChild title="Preview (with timing info)">
                <a href={`${url.split('#')[0]}${url.includes('?') ? '&' : '?'}debug=1`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>

          <ol className="list-decimal pl-5 space-y-1 text-xs text-muted-foreground">
            <li>In OBS, add a <b>Browser</b> source to your scene and paste the URL. Set width/height to your canvas (e.g. 1920×1080).</li>
            <li>Keep it at the top of the source list so captions sit over your video.</li>
            <li>
              Captions follow speech by the time it takes to recognise and translate it (usually 1.5–3 s). If the
              translation is listening to your OBS stream itself, that's how they'll appear — like TV live captions,
              and delaying OBS won't change it (the translation would hear the delay too).
            </li>
            <li>
              For captions exactly in sync, start this translation from a <b>Speaker Link</b> on this computer using
              the same microphone, so it hears the speaker before OBS. Then open the preview (↗) to see the measured
              lag and delay your camera by that much (Filters → <b>Video Delay (Async)</b> / <b>Render Delay</b>) with
              the same <b>Sync Offset</b> on your OBS audio.
            </li>
            <li>Hide the source (eye icon) any time to take captions off the stream.</li>
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ObsCaptionSetupDialog;
