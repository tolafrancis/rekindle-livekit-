// Platform Admin > Bulk TTS > Daily audio.
// Settings for the prewarm-devotional-audio job, which prepares read-aloud
// audio for each day's devotional so the first listener doesn't wait for it.
// English is on by default; other languages are switched on here.

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { getPlatformSetting, setPlatformSetting } from '@rekindle/features/platformSettings';
import { Loader2, Play } from 'lucide-react';

const SETTINGS_KEY = 'daily_audio_prewarm';
const LAST_RUN_KEY = 'daily_audio_prewarm_last_run';

interface PrewarmSettings {
  enabled: boolean;
  languages: string[];
}

interface LastRun {
  at: string;
  trigger: 'schedule' | 'admin';
  languages: string[];
  devotionals: number;
  slides: number;
  alreadyReady: number;
  generated: number;
  failed: number;
  remaining: number;
}

interface AppLanguage {
  code: string;
  name: string;
  native_name: string | null;
}

const DEFAULT_SETTINGS: PrewarmSettings = { enabled: true, languages: ['en'] };

export const DailyAudioPrewarmSettings: React.FC = () => {
  const [settings, setSettings] = useState<PrewarmSettings>(DEFAULT_SETTINGS);
  const [languages, setLanguages] = useState<AppLanguage[]>([]);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const loadLastRun = async () => setLastRun(await getPlatformSetting<LastRun | null>(LAST_RUN_KEY, null));

  useEffect(() => {
    (async () => {
      const [saved, { data: langs }] = await Promise.all([
        getPlatformSetting<Partial<PrewarmSettings> | null>(SETTINGS_KEY, null),
        supabase
          .from('app_languages')
          .select('code, name, native_name')
          .eq('enabled', true)
          .eq('ui_status', 'published')
          .order('sort_order', { ascending: true }),
        loadLastRun(),
      ]);
      setSettings({
        enabled: saved?.enabled !== false,
        languages: Array.isArray(saved?.languages) && saved.languages.length ? saved.languages : ['en'],
      });
      setLanguages((langs as AppLanguage[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const save = async (next: PrewarmSettings) => {
    const previous = settings;
    setSettings(next);
    setSaving(true);
    // platform_settings.value is a text column, so store the JSON string.
    const { error } = await setPlatformSetting(SETTINGS_KEY, JSON.stringify(next));
    setSaving(false);
    if (error) {
      setSettings(previous);
      toast({ title: 'Could not save', description: error, variant: 'destructive' });
    }
  };

  const toggleLanguage = (code: string, on: boolean) => {
    const set = new Set(settings.languages);
    if (on) set.add(code); else set.delete(code);
    // Keep the order of the language list.
    const ordered = languages.map((l) => l.code).filter((c) => set.has(c));
    save({ ...settings, languages: ordered.length ? ordered : ['en'] });
  };

  const allOn = languages.length > 0 && languages.every((l) => settings.languages.includes(l.code));

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke('prewarm-devotional-audio', { body: {} });
    setRunning(false);
    if (error || data?.error) {
      toast({ title: 'Run failed', description: error?.message || data?.error, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Daily audio prepared',
      description: `${data.generated} new, ${data.alreadyReady} already ready${data.remaining ? `, ${data.remaining} left for the next run` : ''}${data.failed ? `, ${data.failed} failed` : ''}.`,
    });
    loadLastRun();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Prepare daily devotional audio</CardTitle>
          <CardDescription>
            Every hour, the read-aloud audio for today's and tomorrow's devotionals is made ahead of time in the
            languages below, so the first person to tap Read aloud doesn't wait for it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <span>
              <span className="block font-medium">Run automatically</span>
              <span className="block text-sm text-muted-foreground">Turn off to stop the scheduled job. Run now still works.</span>
            </span>
            <Switch checked={settings.enabled} disabled={saving} onCheckedChange={(on) => save({ ...settings, enabled: on })} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={runNow} disabled={running} className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? 'Preparing audio…' : 'Run now'}
            </Button>
            {lastRun && (
              <p className="text-sm text-muted-foreground">
                Last run {new Date(lastRun.at).toLocaleString()} ({lastRun.trigger === 'admin' ? 'manual' : 'scheduled'}):{' '}
                {lastRun.generated} new, {lastRun.alreadyReady} already ready
                {lastRun.remaining ? `, ${lastRun.remaining} left` : ''}
                {lastRun.failed ? `, ${lastRun.failed} failed` : ''}.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Languages</CardTitle>
              <CardDescription>English is on by default. Each extra language adds audio generation cost every day.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => save({ ...settings, languages: allOn ? ['en'] : languages.map((l) => l.code) })}
            >
              {allOn ? 'English only' : 'Turn on all'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {languages.map((lang) => (
              <label key={lang.code} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <span className="min-w-0 truncate text-sm">
                  {lang.name}
                  {lang.native_name && lang.native_name !== lang.name && (
                    <span className="ml-1.5 text-muted-foreground">{lang.native_name}</span>
                  )}
                </span>
                <Switch
                  checked={settings.languages.includes(lang.code)}
                  disabled={saving}
                  onCheckedChange={(on) => toggleLanguage(lang.code, on)}
                  aria-label={`Prepare ${lang.name} audio`}
                />
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
