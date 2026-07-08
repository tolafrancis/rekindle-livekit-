import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '../ui/use-toast';
import {
  Cake, Save, Loader2, Plus, Trash2, Play, RefreshCw, Info, CheckCircle2, XCircle, Clock,
} from 'lucide-react';

interface Props {
  ministryId: string;
  ministryName?: string;
}

interface Settings {
  enabled: boolean;
  template_name: string;
  template_language: string;
  variable_mapping: string[];
  timezone: string;
  send_hour: number;
}

interface LogRow {
  id: string;
  member_name: string | null;
  phone: string | null;
  status: string;
  error: string | null;
  send_year: number;
  sent_at: string;
}

const TOKEN_OPTIONS = [
  { value: 'member_name', labelKey: 'tokenMemberFullName', label: 'Member full name' },
  { value: 'member_first_name', labelKey: 'tokenMemberFirstName', label: 'Member first name' },
  { value: 'ministry_name', labelKey: 'tokenMinistryName', label: 'Ministry name' },
];

// A short, friendly list of common IANA timezones. Admins can also type their own.
const COMMON_TIMEZONES = [
  'Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Manila', 'Asia/Tokyo',
  'Asia/Kolkata', 'Asia/Dubai', 'Africa/Lagos', 'Europe/London', 'Europe/Paris',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'UTC',
];

const DEFAULT_SETTINGS: Settings = {
  enabled: false,
  template_name: '',
  template_language: 'en_US',
  variable_mapping: ['member_name', 'ministry_name'],
  timezone: 'Asia/Ho_Chi_Minh',
  send_hour: 9,
};

export const MinistryBirthdayWishes: React.FC<Props> = ({ ministryId, ministryName }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [log, setLog] = useState<LogRow[]>([]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('ministry_birthday_settings')
        .select('*')
        .eq('ministry_id', ministryId)
        .maybeSingle();

      if (data) {
        setSettings({
          enabled: !!data.enabled,
          template_name: data.template_name || '',
          template_language: data.template_language || 'en_US',
          variable_mapping: Array.isArray(data.variable_mapping)
            ? data.variable_mapping
            : ['member_name', 'ministry_name'],
          timezone: data.timezone || 'Asia/Ho_Chi_Minh',
          send_hour: typeof data.send_hour === 'number' ? data.send_hour : 9,
        });
      }
      await loadLog();
    } catch (err) {
      console.error('Error loading birthday settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadLog = async () => {
    const { data } = await supabase
      .from('ministry_birthday_send_log')
      .select('id, member_name, phone, status, error, send_year, sent_at')
      .eq('ministry_id', ministryId)
      .order('sent_at', { ascending: false })
      .limit(50);
    setLog(data || []);
  };

  const save = async () => {
    if (settings.enabled && !settings.template_name.trim()) {
      toast({ title: t('ministryBirthdayWishes', 'templateRequired', 'Template required'), description: t('ministryBirthdayWishes', 'templateRequiredDesc', 'Enter your approved WhatsApp template name before enabling.'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('ministry_birthday_settings')
        .upsert({
          ministry_id: ministryId,
          enabled: settings.enabled,
          template_name: settings.template_name.trim(),
          template_language: settings.template_language.trim() || 'en_US',
          variable_mapping: settings.variable_mapping,
          timezone: settings.timezone,
          send_hour: settings.send_hour,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'ministry_id' });

      if (error) throw error;
      toast({ title: t('ministryBirthdayWishes', 'saved', 'Saved'), description: t('ministryBirthdayWishes', 'savedDesc', 'Birthday wishes settings updated.') });
    } catch (err: any) {
      toast({ title: t('ministryBirthdayWishes', 'error', 'Error'), description: err.message || t('ministryBirthdayWishes', 'failedSave', 'Failed to save settings'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Manual run — bypasses the send-hour gate and processes today's birthdays now.
  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-birthday-wishes', {
        body: { ministryId, force: true },
      });
      if (error) throw error;
      const mine = (data?.ministries || []).find((m: any) => m.ministry_id === ministryId);
      const sent = mine?.sent ?? 0;
      const birthdays = mine?.birthdays ?? 0;
      toast({
        title: t('ministryBirthdayWishes', 'runComplete', 'Birthday run complete'),
        description: birthdays === 0
          ? t('ministryBirthdayWishes', 'noBirthdaysToday', 'No members have a birthday today.')
          : t('ministryBirthdayWishes', 'messagesSent', '{sent} of {birthdays} birthday message(s) sent.').replace('{sent}', String(sent)).replace('{birthdays}', String(birthdays)),
      });
      await loadLog();
    } catch (err: any) {
      toast({ title: t('ministryBirthdayWishes', 'error', 'Error'), description: err.message || t('ministryBirthdayWishes', 'failedRun', 'Failed to run birthday wishes'), variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const updateMapping = (idx: number, value: string) => {
    setSettings((s) => {
      const next = [...s.variable_mapping];
      next[idx] = value;
      return { ...s, variable_mapping: next };
    });
  };
  const addMapping = () => setSettings((s) => ({ ...s, variable_mapping: [...s.variable_mapping, 'member_name'] }));
  const removeMapping = (idx: number) =>
    setSettings((s) => ({ ...s, variable_mapping: s.variable_mapping.filter((_, i) => i !== idx) }));

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Cake className="h-5 w-5 text-pink-500" />
            {t('ministryBirthdayWishes', 'birthdayWishes', 'Birthday Wishes')}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t('ministryBirthdayWishes', 'headerDesc', 'Automatically wish {name} a happy birthday on their day, via your own WhatsApp Business template.').replace('{name}', String(ministryName || t('ministryBirthdayWishes', 'yourMembers', 'your members')))}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={runNow} disabled={running || !settings.enabled}>
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          {t('ministryBirthdayWishes', 'sendTodaysNow', "Send today's now")}
        </Button>
      </div>

      {/* Enable + how it works */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="font-medium">{t('ministryBirthdayWishes', 'enableBirthdayWishes', 'Enable birthday wishes')}</Label>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('ministryBirthdayWishes', 'enableDesc', 'Every member with a birthday on file is wished automatically — no action needed from them.')}
              </p>
            </div>
            <Switch checked={settings.enabled} onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))} />
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              {t('ministryBirthdayWishes', 'metaInfo', 'Get your own "Happy Birthday" template approved in Meta Business Manager (a few-day Meta review), then enter its exact approved name below. We never author or own the template — it stays inside your WABA.')}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Template config */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('ministryBirthdayWishes', 'template', 'Template')}</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-2 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tpl">{t('ministryBirthdayWishes', 'approvedTemplateName', 'Approved template name')}</Label>
              <Input
                id="tpl"
                placeholder={t('ministryBirthdayWishes', 'templateNamePlaceholder', 'e.g. happy_birthday')}
                value={settings.template_name}
                onChange={(e) => setSettings((s) => ({ ...s, template_name: e.target.value }))}
              />
              <p className="text-[11px] text-gray-400 mt-1">{t('ministryBirthdayWishes', 'twilioHint', 'Twilio users: paste the Content SID (HX…).')}</p>
            </div>
            <div>
              <Label htmlFor="lang">{t('ministryBirthdayWishes', 'templateLanguage', 'Template language')}</Label>
              <Input
                id="lang"
                placeholder="en_US"
                value={settings.template_language}
                onChange={(e) => setSettings((s) => ({ ...s, template_language: e.target.value }))}
              />
              <p className="text-[11px] text-gray-400 mt-1">{t('ministryBirthdayWishes', 'languageHint', 'Match the language code of the approved template (e.g. en_US, vi).')}</p>
            </div>
          </div>

          {/* Variable mapping */}
          <div>
            <Label>{t('ministryBirthdayWishes', 'variableMapping', 'Variable mapping')}</Label>
            <p className="text-[11px] text-gray-400 mb-2">
              {t('ministryBirthdayWishes', 'variableMappingDesc', 'Map each template variable slot in order: the first row fills {slot1}, the second {slot2}, and so on.').replace('{slot1}', '{{1}}').replace('{slot2}', '{{2}}')}
            </p>
            <div className="space-y-2">
              {settings.variable_mapping.map((token, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-500 w-10 flex-shrink-0">{`{{${idx + 1}}}`}</span>
                  <Select value={token} onValueChange={(v) => updateMapping(idx, v)}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TOKEN_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{t('ministryBirthdayWishes', o.labelKey, o.label)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => removeMapping(idx)} className="text-gray-400 hover:text-red-500 flex-shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addMapping} className="mt-2">
              <Plus className="h-4 w-4 mr-1" /> {t('ministryBirthdayWishes', 'addVariable', 'Add variable')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Timing */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('ministryBirthdayWishes', 'timing', 'Timing')}</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-2 grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="tz">{t('ministryBirthdayWishes', 'timezone', 'Timezone')}</Label>
            <Select value={settings.timezone} onValueChange={(v) => setSettings((s) => ({ ...s, timezone: v }))}>
              <SelectTrigger id="tz">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
                {!COMMON_TIMEZONES.includes(settings.timezone) && (
                  <SelectItem value={settings.timezone}>{settings.timezone}</SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-gray-400 mt-1">{t('ministryBirthdayWishes', 'timezoneHint', '"Today" is decided in this timezone.')}</p>
          </div>
          <div>
            <Label htmlFor="hour" className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {t('ministryBirthdayWishes', 'sendAtLocalHour', 'Send at (local hour)')}
            </Label>
            <Select value={String(settings.send_hour)} onValueChange={(v) => setSettings((s) => ({ ...s, send_hour: Number(v) }))}>
              <SelectTrigger id="hour">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }).map((_, h) => (
                  <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-gray-400 mt-1">{t('ministryBirthdayWishes', 'sendHourHint', 'Messages go out around this hour, in the timezone above.')}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {t('ministryBirthdayWishes', 'saveSettings', 'Save settings')}
        </Button>
      </div>

      {/* Send log */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t('ministryBirthdayWishes', 'recentSends', 'Recent sends')}</CardTitle>
          <Button variant="ghost" size="sm" onClick={loadLog}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-5 pt-2">
          {log.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">{t('ministryBirthdayWishes', 'noMessagesYet', 'No birthday messages sent yet.')}</p>
          ) : (
            <div className="divide-y">
              {log.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{row.member_name || row.phone || t('ministryBirthdayWishes', 'member', 'Member')}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(row.sent_at).toLocaleString()} · {row.send_year}
                    </p>
                    {row.error && <p className="text-xs text-red-500 truncate">{row.error}</p>}
                  </div>
                  {row.status === 'sent' ? (
                    <Badge className="bg-green-100 text-green-700 border-0 flex-shrink-0">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> {t('ministryBirthdayWishes', 'sent', 'Sent')}
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="flex-shrink-0">
                      <XCircle className="h-3 w-3 mr-1" /> {row.status}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MinistryBirthdayWishes;
