import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Switch } from '@rekindle/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { toast } from '@rekindle/ui/use-toast';
import { BookOpen } from 'lucide-react';
import { listApiBibleVersions, type ApiBibleVersion } from '@rekindle/features/scripture/providers';
import { useScriptureSettings } from './liveScriptureSettings';

/**
 * Live Translation › Settings: Live Scripture preferences. Each change saves
 * on its own (like a toggle), separate from the page's Save Settings button,
 * which only covers the translation settings above it.
 */
export const LiveScriptureSettingsCard: React.FC<{ ministryId: string }> = ({ ministryId }) => {
  const { settings, loaded, save } = useScriptureSettings(ministryId);
  const [versions, setVersions] = useState<ApiBibleVersion[] | null>(null);
  const [versionsNote, setVersionsNote] = useState<string | null>(null);
  const [seconds, setSeconds] = useState('');

  useEffect(() => { if (loaded) setSeconds(String(settings.display_seconds)); }, [loaded, settings.display_seconds]);

  useEffect(() => {
    let cancelled = false;
    listApiBibleVersions(ministryId)
      .then(v => { if (!cancelled) { setVersions(v); setVersionsNote(v.length ? null : 'No licensed versions available yet.'); } })
      .catch(() => { if (!cancelled) { setVersions([]); setVersionsNote('Licensed versions (NIV, ESV and others) appear here once API.Bible is connected.'); } });
    return () => { cancelled = true; };
  }, [ministryId]);

  const update = async (patch: Parameters<typeof save>[0]) => {
    try {
      await save(patch);
    } catch (err: any) {
      toast({ title: 'Could not save Scripture settings', description: err?.message, variant: 'destructive' });
    }
  };

  const options = [
    { value: 'KJV', label: 'KJV · King James Version (public domain)' },
    ...(versions || []).map(v => ({ value: `apibible:${v.id}`, label: `${v.abbreviation} · ${v.name}`, short: v.abbreviation })),
  ];
  // Keep the saved choice selectable even while the list is loading or if
  // API.Bible is unreachable right now.
  if (!options.some(o => o.value === settings.preferred_version)) {
    options.push({ value: settings.preferred_version, label: settings.preferred_version_label });
  }

  // Opened from a meeting's "Open settings" tip: bring this card into view.
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let scroll = false;
    try { scroll = sessionStorage.getItem('rk-scroll-live-scripture') === '1'; sessionStorage.removeItem('rk-scroll-live-scripture'); } catch { /* non-fatal */ }
    if (scroll) setTimeout(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }, []);

  return (
    <Card ref={cardRef} id="live-scripture-settings">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-600" /> Live Scripture
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          When the speaker says a Bible reference, like "John 3:16", it's picked up from the captions and the verse is shown on
          the listener screen and the OBS captions overlay, in this version and, where there's a published translation for it,
          the listener's language (Vietnamese uses the 1926 Bible).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Bible version</Label>
          <Select
            value={settings.preferred_version}
            disabled={!loaded}
            onValueChange={(value) => {
              const picked = versions?.find(v => `apibible:${v.id}` === value);
              update({ preferred_version: value, preferred_version_label: value === 'KJV' ? 'KJV' : picked?.abbreviation || value });
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {versionsNote && <p className="text-xs text-muted-foreground">{versionsNote}</p>}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Detect references automatically</Label>
            <p className="text-xs text-muted-foreground">Watches the captions for Bible references while a service runs.</p>
          </div>
          <Switch checked={settings.auto_detect} disabled={!loaded} onCheckedChange={(v) => update({ auto_detect: v })} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Show confirmed verses automatically</Label>
            <p className="text-xs text-muted-foreground">
              On (the default): a full reference like "Romans 8:28" goes up by itself, including during speaker-link services
              with no dashboard open. Off: you tap Show for each verse. A chapter on its own, like "Psalm 23", always waits for you.
            </p>
          </div>
          <Switch checked={settings.auto_show} disabled={!loaded} onCheckedChange={(v) => update({ auto_show: v })} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="scripture-seconds">Keep a verse on screen for (seconds)</Label>
          <Input
            id="scripture-seconds"
            type="number"
            min={0}
            max={3600}
            className="w-32"
            value={seconds}
            disabled={!loaded}
            onChange={(e) => setSeconds(e.target.value)}
            onBlur={() => {
              const n = Math.round(Number(seconds));
              if (!Number.isFinite(n) || n < 0 || n > 3600) { setSeconds(String(settings.display_seconds)); return; }
              if (n !== settings.display_seconds) update({ display_seconds: n });
            }}
          />
          <p className="text-xs text-muted-foreground">0 keeps it up until you hide it or show the next verse.</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveScriptureSettingsCard;
