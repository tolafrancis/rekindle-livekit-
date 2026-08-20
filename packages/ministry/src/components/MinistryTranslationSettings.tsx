import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Switch } from '@rekindle/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@rekindle/ui/popover';
import { Badge } from '@rekindle/ui/badge';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { Languages, Loader2, Lock, Plus, X, Check, Play, Square, ChevronsUpDown } from 'lucide-react';

interface MinistryTranslationSettingsProps {
  ministryId: string;
}

interface VoiceOption {
  voice_id: string;
  name: string;
  preview_url: string | null;
  category: string | null;
}

// Shared by both the ministry-default picker and every per-language picker
// (RLT Phase 1, docs/rlt-voice-cloning-plan.md) — a real list with preview
// audio, not a bare "paste an ID you already know" field. Voices are
// fetched once (on first open, any picker) via the translation-list-voices
// Edge Function, which proxies the TTS provider's catalog server-side so
// its API key never reaches the browser. Falls back to letting an admin
// type an ID directly if the catalog can't be loaded — the underlying
// value is always just a plain voice_id string either way, so nothing
// downstream (save(), the bot) needs to know or care which path set it.
const VoicePicker: React.FC<{
  value: string;
  onChange: (voiceId: string) => void;
  voices: VoiceOption[] | null;
  voicesLoading: boolean;
  onOpen: () => void;
  placeholder: string;
  className?: string;
}> = ({ value, onChange, voices, voicesLoading, onOpen, placeholder, className }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState('');
  const selected = voices?.find(v => v.voice_id === value);

  const playPreview = (voice: VoiceOption, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!voice.preview_url || !audioRef.current) return;
    if (playingId === voice.voice_id) {
      audioRef.current.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current.src = voice.preview_url;
    audioRef.current.play().catch(() => {});
    setPlayingId(voice.voice_id);
  };

  const row = 'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left transition-colors cursor-pointer';
  const sel = (on: boolean) => (on ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100');

  return (
    <Popover onOpenChange={open => { if (open) onOpen(); }}>
      <audio ref={audioRef} className="hidden" onEnded={() => setPlayingId(null)} />
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={`justify-between font-normal ${className || ''}`}>
          <span className="truncate">{selected ? selected.name : value ? value : placeholder}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <button type="button" onClick={() => onChange('')} className={`${row} ${sel(!value)}`}>
          <span className="flex-1">{placeholder}</span>
          {!value && <Check className="h-3.5 w-3.5" />}
        </button>

        {voicesLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : voices && voices.length > 0 ? (
          <div className="max-h-64 overflow-y-auto space-y-0.5 mt-1">
            {voices.map(v => (
              <div key={v.voice_id} onClick={() => onChange(v.voice_id)} className={`${row} ${sel(value === v.voice_id)}`}>
                <button
                  type="button"
                  onClick={e => playPreview(v, e)}
                  disabled={!v.preview_url}
                  title={v.preview_url ? 'Preview' : 'No preview available'}
                  className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  {playingId === v.voice_id ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
                <span className="flex-1 truncate">{v.name}</span>
                {v.category && <span className="text-[10px] text-muted-foreground uppercase">{v.category}</span>}
                {value === v.voice_id && <Check className="h-3.5 w-3.5 shrink-0" />}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground px-2.5 py-2">
            Couldn't load the voice catalog — paste a voice ID directly below instead.
          </p>
        )}

        <div className="border-t mt-2 pt-2 px-0.5">
          <Input
            value={manualEntry}
            onChange={e => setManualEntry(e.target.value)}
            onBlur={() => { if (manualEntry.trim()) { onChange(manualEntry.trim()); setManualEntry(''); } }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
            placeholder="Or paste a voice ID directly"
            className="text-xs h-8"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface LanguageConfigState {
  source_language: string;
  target_language: string | null;
  supported_target_languages: string[];
  elevenlabs_voice_id: string | null;
  bot_enabled: boolean;
  is_public: boolean;
  speaker_identity: string | null;
}

// RLT pilots Asia first (see docs/rlt-build-checklist.md) — this list just
// seeds the dropdown. "Add a language" below takes any code, this isn't an
// enforced whitelist.
const COMMON_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'vi', label: 'Vietnamese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'id', label: 'Indonesian' },
  { code: 'th', label: 'Thai' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'ja', label: 'Japanese' },
];

const languageLabel = (code: string) => COMMON_LANGUAGES.find(l => l.code === code)?.label || code.toUpperCase();

const DEFAULT_CONFIG: LanguageConfigState = {
  source_language: 'en',
  target_language: null,
  supported_target_languages: [],
  elevenlabs_voice_id: null,
  bot_enabled: false,
  is_public: true,
  speaker_identity: null,
};

export const MinistryTranslationSettings: React.FC<MinistryTranslationSettingsProps> = ({ ministryId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<LanguageConfigState>(DEFAULT_CONFIG);
  const [newLanguageCode, setNewLanguageCode] = useState('');
  const [pin, setPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [hasPin, setHasPin] = useState(false);

  // RLT Phase 1 (docs/rlt-voice-cloning-plan.md) — optional per-language
  // voice override. `perLanguageVoices` is the live-edited draft;
  // `savedPerLanguageVoices` is the last-loaded-from-DB snapshot, kept
  // separately so save() can tell which languages actually changed (and
  // which need their translation_voices row DELETED, not just left blank —
  // an empty input means "use the ministry default above", which only
  // happens if there's no row at all).
  const [perLanguageVoices, setPerLanguageVoices] = useState<Record<string, string>>({});
  const [savedPerLanguageVoices, setSavedPerLanguageVoices] = useState<Record<string, string>>({});

  // Voice catalog is shared across every picker on this page (the ministry
  // default plus one per language) — fetched once, lazily, on whichever
  // picker gets opened first. `null` = not yet requested; `[]` = requested
  // and failed/empty (pickers fall back to manual entry in that case).
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const loadVoicesOnce = async () => {
    if (voices !== null || voicesLoading) return;
    setVoicesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('translation-list-voices');
      if (error) throw error;
      setVoices(data?.voices || []);
    } catch (err: any) {
      console.error('[MinistryTranslationSettings] loading voice catalog failed:', err);
      setVoices([]);
    } finally {
      setVoicesLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data: voiceRows, error: voiceError } = await supabase
        .from('translation_voices')
        .select('target_language, voice_id')
        .eq('ministry_id', ministryId);
      if (voiceError) throw voiceError;
      const voiceMap: Record<string, string> = {};
      (voiceRows || []).forEach(row => { voiceMap[row.target_language] = row.voice_id; });
      setPerLanguageVoices(voiceMap);
      setSavedPerLanguageVoices(voiceMap);

      const { data, error } = await supabase
        .from('language_configs')
        .select('source_language, target_language, supported_target_languages, elevenlabs_voice_id, bot_enabled, is_public, speaker_identity, pin_hash')
        .eq('ministry_id', ministryId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setConfig({
          source_language: data.source_language,
          target_language: data.target_language,
          supported_target_languages: data.supported_target_languages || [],
          elevenlabs_voice_id: data.elevenlabs_voice_id,
          bot_enabled: data.bot_enabled,
          is_public: data.is_public,
          speaker_identity: data.speaker_identity,
        });
        setHasPin(!!data.pin_hash);
      }
    } catch (err: any) {
      console.error('[MinistryTranslationSettings] load failed:', err);
      toast({ title: 'Could not load translation settings', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('upsert_language_config', {
        p_ministry_id: ministryId,
        p_source_language: config.source_language,
        p_target_language: config.target_language,
        p_supported_target_languages: config.supported_target_languages,
        p_elevenlabs_voice_id: config.elevenlabs_voice_id,
        p_bot_enabled: config.bot_enabled,
        p_is_public: config.is_public,
        p_speaker_identity: config.speaker_identity,
      });
      if (error) throw error;

      // RLT Phase 1 — per-language voice overrides. Covers every language
      // that's EITHER currently supported OR had a saved voice before (the
      // latter case is a language that got removed above in this same
      // save — its now-orphaned translation_voices row needs cleaning up,
      // not leaving behind for a language that's no longer offered).
      const relevantCodes = new Set([
        ...config.supported_target_languages,
        ...Object.keys(savedPerLanguageVoices),
      ]);
      const nextSaved: Record<string, string> = {};
      for (const code of relevantCodes) {
        const stillSupported = config.supported_target_languages.includes(code);
        const value = stillSupported ? (perLanguageVoices[code] || '').trim() : '';
        const hadSaved = !!savedPerLanguageVoices[code];
        if (stillSupported && value) {
          const { error: voiceErr } = await supabase.rpc('upsert_language_voice', {
            p_ministry_id: ministryId,
            p_target_language: code,
            p_voice_id: value,
          });
          if (voiceErr) throw voiceErr;
          nextSaved[code] = value;
        } else if (hadSaved) {
          const { error: removeErr } = await supabase.rpc('remove_language_voice', {
            p_ministry_id: ministryId,
            p_target_language: code,
          });
          if (removeErr) throw removeErr;
        }
      }
      setSavedPerLanguageVoices(nextSaved);
      setPerLanguageVoices(nextSaved);

      toast({ title: 'Translation settings saved' });
    } catch (err: any) {
      console.error('[MinistryTranslationSettings] save failed:', err);
      toast({ title: 'Could not save settings', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const addLanguage = (codeRaw?: string) => {
    const code = (codeRaw ?? newLanguageCode).trim().toLowerCase();
    if (!code || config.supported_target_languages.includes(code)) { setNewLanguageCode(''); return; }
    setConfig(c => ({ ...c, supported_target_languages: [...c.supported_target_languages, code] }));
    setNewLanguageCode('');
  };

  const removeLanguage = (code: string) => {
    setConfig(c => ({
      ...c,
      supported_target_languages: c.supported_target_languages.filter(l => l !== code),
      target_language: c.target_language === code ? null : c.target_language,
    }));
  };

  const savePin = async () => {
    if (!pin.trim()) return;
    setPinSaving(true);
    try {
      const { error } = await supabase.rpc('set_display_pin', { p_ministry_id: ministryId, p_pin: pin.trim() });
      if (error) throw error;
      setHasPin(true);
      setPin('');
      toast({ title: 'Display PIN saved' });
    } catch (err: any) {
      toast({ title: 'Could not save PIN', description: err.message, variant: 'destructive' });
    } finally {
      setPinSaving(false);
    }
  };

  const removePin = async () => {
    setPinSaving(true);
    try {
      const { error } = await supabase.rpc('set_display_pin', { p_ministry_id: ministryId, p_pin: null });
      if (error) throw error;
      setHasPin(false);
      toast({ title: 'Display PIN removed' });
    } catch (err: any) {
      toast({ title: 'Could not remove PIN', description: err.message, variant: 'destructive' });
    } finally {
      setPinSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Languages className="h-5 w-5 text-indigo-600" />
            Languages
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Source language (what the speaker speaks)</Label>
            <Input
              value={config.source_language}
              onChange={e => setConfig(c => ({ ...c, source_language: e.target.value.toLowerCase() }))}
              placeholder="en"
              className="max-w-[160px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Supported target languages</Label>
            <p className="text-xs text-muted-foreground">
              Every language pair this ministry may run in a service (Tier 2 multi-language).
            </p>
            <div className="flex flex-wrap gap-1.5">
              {config.supported_target_languages.map(code => (
                <Badge key={code} variant="secondary" className="gap-1">
                  {languageLabel(code)}
                  <button onClick={() => removeLanguage(code)} aria-label={`Remove ${code}`} type="button">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {config.supported_target_languages.length === 0 && (
                <span className="text-xs text-muted-foreground">None yet</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center pt-1">
              <Select value="" onValueChange={v => addLanguage(v)}>
                <SelectTrigger className="max-w-[220px]"><SelectValue placeholder="Add a common language" /></SelectTrigger>
                <SelectContent>
                  {COMMON_LANGUAGES.filter(l => !config.supported_target_languages.includes(l.code)).map(l => (
                    <SelectItem key={l.code} value={l.code}>{l.label} ({l.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={newLanguageCode}
                onChange={e => setNewLanguageCode(e.target.value)}
                placeholder="or type a code, e.g. tl"
                className="max-w-[160px]"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLanguage(); } }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => addLanguage()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {config.supported_target_languages.length > 0 && (
            <div className="space-y-1.5">
              <Label>Per-language voices (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Give a language its own voice — e.g. a different voice for Vietnamese than for Korean.
                Leave blank to use the ministry's default voice below for that language.
              </p>
              <div className="space-y-2">
                {config.supported_target_languages.map(code => (
                  <div key={code} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-sm text-muted-foreground">{languageLabel(code)}</span>
                    <VoicePicker
                      value={perLanguageVoices[code] || ''}
                      onChange={voiceId => setPerLanguageVoices(v => ({ ...v, [code]: voiceId }))}
                      voices={voices}
                      voicesLoading={voicesLoading}
                      onOpen={loadVoicesOnce}
                      placeholder="Uses the default voice below"
                      className="max-w-[280px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Default target language</Label>
            <Select
              value={config.target_language || ''}
              onValueChange={v => setConfig(c => ({ ...c, target_language: v }))}
            >
              <SelectTrigger className="max-w-[240px]"><SelectValue placeholder="Choose a language" /></SelectTrigger>
              <SelectContent>
                {config.supported_target_languages.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Add a supported language above first</div>
                ) : config.supported_target_languages.map(code => (
                  <SelectItem key={code} value={code}>{languageLabel(code)} ({code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Default voice (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Used for any language above that doesn't have its own voice set.
            </p>
            <VoicePicker
              value={config.elevenlabs_voice_id || ''}
              onChange={voiceId => setConfig(c => ({ ...c, elevenlabs_voice_id: voiceId || null }))}
              voices={voices}
              voicesLoading={voicesLoading}
              onOpen={loadVoicesOnce}
              placeholder="Uses the ministry's standard voice"
              className="max-w-[320px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Default speaker identity (optional)</Label>
            <p className="text-xs text-muted-foreground">
              LiveKit participant identity the bot subscribes to by default. Leave blank to auto-detect the first
              active speaker.
            </p>
            <Input
              value={config.speaker_identity || ''}
              onChange={e => setConfig(c => ({ ...c, speaker_identity: e.target.value || null }))}
              placeholder="e.g. the pastor's meeting participant ID"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm">Enable live translation by default</Label>
              <p className="text-xs text-muted-foreground">Auto-starts the bot when a meeting begins (Phase 2+).</p>
            </div>
            <Switch checked={config.bot_enabled} onCheckedChange={v => setConfig(c => ({ ...c, bot_enabled: v }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-5 w-5 text-amber-600" />
            Display Visibility
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm">Public</Label>
              <p className="text-xs text-muted-foreground">
                {config.is_public
                  ? 'Anyone with the /display link can view — no PIN required.'
                  : 'Visitors need the PIN below to view /display.'}
              </p>
            </div>
            <Switch
              checked={config.is_public}
              onCheckedChange={v => setConfig(c => ({ ...c, is_public: v }))}
            />
          </div>

          {!config.is_public && (
            <div className="space-y-1.5">
              <Label>{hasPin ? 'Change PIN' : 'Set a PIN'}</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  placeholder="4–6 digits"
                  className="max-w-[160px]"
                />
                <Button type="button" variant="outline" size="sm" onClick={savePin} disabled={pinSaving || !pin.trim()}>
                  Save PIN
                </Button>
                {hasPin && (
                  <Button type="button" variant="ghost" size="sm" onClick={removePin} disabled={pinSaving}>
                    Remove PIN
                  </Button>
                )}
              </div>
              {hasPin && <p className="text-xs text-muted-foreground">A PIN is currently set.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        Save Settings
      </Button>
    </div>
  );
};

export default MinistryTranslationSettings;
