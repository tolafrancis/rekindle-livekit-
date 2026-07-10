import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { toast } from './ui/use-toast';
import { BookOpen, Building2, Layers, Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { listPublicStreams, type DevotionalStream } from '@/lib/devotionalStreams';

type DevotionalSource = 'platform' | 'ministry' | 'both';

interface Ministry {
  id: string;
  name: string;
  logo_url?: string;
}

interface Props {
  /** Called after preference is saved so parent can refresh widget */
  onSaved?: (source: DevotionalSource, ministryId: string | null, streamId?: string | null) => void;
}

export const DevotionalSourceSettings: React.FC<Props> = ({ onSaved }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [source, setSource] = useState<DevotionalSource>('platform');
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [selectedMinistryId, setSelectedMinistryId] = useState<string | null>(null);
  // Daily-devotional stream (0149) — which platform feed to show.
  const [streams, setStreams] = useState<DevotionalStream[]>([]);
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      // Load current preference
      const { data: pref } = await supabase
        .from('user_profiles')
        .select('devotional_source, devotional_ministry_id, devotional_stream_id')
        .eq('user_id', user.id)
        .single();
      if (pref) {
        setSource((pref.devotional_source as DevotionalSource) || 'platform');
        setSelectedMinistryId(pref.devotional_ministry_id || null);
        setSelectedStreamId((pref as any).devotional_stream_id || null);
      }

      // Public streams for the platform-feed picker (best-effort).
      listPublicStreams().then(setStreams).catch(() => setStreams([]));

      // Ministries the user can pick from = ones they're a MEMBER of PLUS ones they
      // OWN or LEAD. Pastors who create a ministry usually have no member row for it
      // (they're the owner/leader on ministry_groups), so membership alone showed nothing.
      // Member rows: group_id is canonical, but older rows only set ministry_id — accept either.
      const { data: memberships } = await supabase
        .from('ministry_group_members')
        .select('group_id, ministry_id')
        .eq('user_id', user.id);
      const memberIds = (memberships || [])
        .map((m: any) => m.group_id || m.ministry_id)
        .filter(Boolean);

      // Ministries owned or led by the user
      const { data: ownedLed } = await supabase
        .from('ministry_groups')
        .select('id, name, logo_url')
        .or(`owner_id.eq.${user.id},leader_id.eq.${user.id}`);

      // Member ministries' details
      let memberMinistries: Ministry[] = [];
      if (memberIds.length > 0) {
        const { data: ministryData } = await supabase
          .from('ministry_groups')
          .select('id, name, logo_url')
          .in('id', memberIds);
        memberMinistries = ministryData || [];
      }

      // Merge + de-duplicate by id
      const byId = new Map<string, Ministry>();
      [...(ownedLed || []), ...memberMinistries].forEach((m: Ministry) => byId.set(m.id, m));
      const mins = Array.from(byId.values());
      setMinistries(mins);
      // If only one ministry, auto-select it
      if (mins.length === 1 && !selectedMinistryId) {
        setSelectedMinistryId(mins[0].id);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const save = async () => {
    if (!user) return;
    if ((source === 'ministry' || source === 'both') && !selectedMinistryId) {
      toast({ title: t('devotionalSourceSettings', 'selectMinistryTitle', 'Select a ministry'), description: t('devotionalSourceSettings', 'selectMinistryDesc', 'Please choose which ministry devotional to show.'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    // The stream applies to the platform feed (platform or both). For ministry-only,
    // keep it null so we don't imply a platform stream is in use.
    const streamToSave = (source === 'ministry') ? null : selectedStreamId;
    const { error } = await supabase
      .from('user_profiles')
      .update({
        devotional_source: source,
        devotional_ministry_id: (source === 'platform') ? null : selectedMinistryId,
        devotional_stream_id: streamToSave,
      })
      .eq('user_id', user.id);
    setSaving(false);
    if (error) {
      toast({ title: t('devotionalSourceSettings', 'errorSaving', 'Error saving preference'), variant: 'destructive' });
      return;
    }
    toast({ title: t('devotionalSourceSettings', 'prefSaved', 'Devotional preference saved!') });
    setExpanded(false);
    onSaved?.(source, source === 'platform' ? null : selectedMinistryId, streamToSave);
  };

  const options: { value: DevotionalSource; label: string; description: string; icon: React.ElementType; color: string }[] = [
    { value: 'platform',  label: t('devotionalSourceSettings', 'labelPlatform', 'ReKindle BC'),      description: t('devotionalSourceSettings', 'descPlatform', 'Daily devotionals curated by the ReKindle BC team'),   icon: BookOpen,   color: 'text-purple-600' },
    { value: 'ministry',  label: t('devotionalSourceSettings', 'labelMinistry', 'My Ministry'),      description: t('devotionalSourceSettings', 'descMinistry', 'Daily devotionals from your ministry leader'),         icon: Building2,  color: 'text-blue-600' },
    { value: 'both',      label: t('devotionalSourceSettings', 'labelBoth', 'Both'),             description: t('devotionalSourceSettings', 'descBoth', 'Platform devotional + ministry devotional side by side'), icon: Layers,   color: 'text-green-600' },
  ];

  if (loading) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-1"
      >
        <BookOpen className="h-3.5 w-3.5" />
        {t('devotionalSourceSettings', 'devotionalSourceLabel', 'Devotional source:')} <span className="font-medium text-gray-600 capitalize">{source === 'both' ? t('devotionalSourceSettings', 'labelBoth', 'Both') : source === 'ministry' ? t('devotionalSourceSettings', 'labelMinistry', 'My Ministry') : t('devotionalSourceSettings', 'labelPlatform', 'ReKindle BC')}</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <Card className="border border-gray-100 shadow-sm mb-3">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-gray-700">{t('devotionalSourceSettings', 'chooseSourceTitle', 'Choose your devotional source')}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {/* Source options */}
            <div className="grid grid-cols-1 gap-2">
              {options.map(opt => {
                // Hide ministry/both if not in any ministry
                if ((opt.value === 'ministry' || opt.value === 'both') && ministries.length === 0) return null;
                const isSelected = source === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setSource(opt.value)}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'border-purple-400 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <opt.icon className={`h-5 w-5 shrink-0 ${isSelected ? opt.color : 'text-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>{opt.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{opt.description}</p>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-purple-600 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Ministry selector — shown when ministry or both is selected */}
            {(source === 'ministry' || source === 'both') && ministries.length >= 1 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-600">{t('devotionalSourceSettings', 'whichMinistry', 'Which ministry?')}</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {ministries.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMinistryId(m.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-all ${
                        selectedMinistryId === m.id
                          ? 'border-blue-400 bg-blue-50 text-blue-800'
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                    >
                      {m.logo_url
                        ? <img src={m.logo_url} className="w-5 h-5 rounded-full object-cover" alt="" />
                        : <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                      }
                      <span className="truncate">{m.name}</span>
                      {selectedMinistryId === m.id && <Check className="h-3.5 w-3.5 ml-auto text-blue-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Platform stream selector — which daily-devotional feed to show. Only
                meaningful when the platform feed is in play, and only if admins have
                published more than one stream. */}
            {(source === 'platform' || source === 'both') && streams.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-600">{t('devotionalSourceSettings', 'whichStream', 'Which daily devotional?')}</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {streams.map(s => {
                    const isSel = (selectedStreamId ?? streams.find(x => x.is_default)?.id) === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedStreamId(s.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-all ${
                          isSel ? 'border-purple-400 bg-purple-50 text-purple-800' : 'border-gray-200 hover:border-gray-300 text-gray-600'
                        }`}
                      >
                        {s.cover_image_url
                          ? <img src={s.cover_image_url} className="w-5 h-5 rounded object-cover" alt="" />
                          : <BookOpen className="h-4 w-4 text-gray-400 shrink-0" />
                        }
                        <span className="truncate">{s.name}</span>
                        {isSel && <Check className="h-3.5 w-3.5 ml-auto text-purple-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <Button
              size="sm"
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              onClick={save}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('devotionalSourceSettings', 'savePreference', 'Save Preference')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DevotionalSourceSettings;
