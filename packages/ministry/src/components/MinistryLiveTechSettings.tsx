import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { Radio, Loader2, Save } from 'lucide-react';
import { MinistryTranslationHub } from './MinistryTranslationHub';
import { MinistryTranslationSettings } from './MinistryTranslationSettings';

interface Ministry {
  id: string;
  name: string;
  settings: any;
}

interface MinistryLiveTechSettingsProps {
  ministry: Ministry;
  onUpdate: () => void;
}

// Split out of MinistrySettingsHub (2026-09-14, per the user's request):
// Live Translation + restream config used to live under Settings > Live &
// Tech; moved to live directly under the "Live" nav group instead, next to
// the live channel itself, since that's where an admin actually thinks to
// look for it. Keeps its own restream-defaults form state rather than
// sharing MinistrySettingsHub's, since it no longer renders inside that hub.
export const MinistryLiveTechSettings: React.FC<MinistryLiveTechSettingsProps> = ({ ministry, onUpdate }) => {
  const { t } = useLanguage();
  const [savingRestream, setSavingRestream] = useState(false);
  const [ytKey, setYtKey] = useState<string>(() => ministry.settings?.restream_defaults?.youtube || '');
  const [fbKey, setFbKey] = useState<string>(() => ministry.settings?.restream_defaults?.facebook || '');

  useEffect(() => {
    const rd = ministry.settings?.restream_defaults;
    if (rd) {
      setYtKey(rd.youtube || '');
      setFbKey(rd.facebook || '');
    }
  }, [ministry.settings]);

  const handleSaveRestream = async () => {
    setSavingRestream(true);
    try {
      const updatedSettings = {
        ...(ministry.settings || {}),
        restream_defaults: {
          youtube: ytKey.trim(),
          facebook: fbKey.trim()
        }
      };
      const { error } = await supabase
        .from('ministry_groups')
        .update({
          settings: updatedSettings,
          updated_at: new Date().toISOString()
        })
        .eq('id', ministry.id);

      if (error) throw error;
      toast({ title: t('ministrySettingsHub', 'restreamSaved', 'Restream defaults saved') });
      onUpdate();
    } catch (err: any) {
      toast({ title: t('ministrySettingsHub', 'saveFailed', 'Save failed'), description: err.message, variant: 'destructive' });
    } finally {
      setSavingRestream(false);
    }
  };

  return (
    <div className="space-y-6">
      <MinistryTranslationHub ministryId={ministry.id} ministryName={ministry.name} />
      <MinistryTranslationSettings ministryId={ministry.id} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-purple-600" />
            Restream Defaults
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure default RTMP stream keys for broadcasting to external platforms.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>YouTube Stream Key</Label>
              <Input
                type="password"
                value={ytKey}
                onChange={(e) => setYtKey(e.target.value)}
                placeholder="xxxx-xxxx-xxxx-xxxx"
              />
            </div>
            <div>
              <Label>Facebook Stream Key</Label>
              <Input
                type="password"
                value={fbKey}
                onChange={(e) => setFbKey(e.target.value)}
                placeholder="FB-xxxx-xxxx-xxxx"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveRestream} disabled={savingRestream}>
              {savingRestream ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Restream Defaults
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MinistryLiveTechSettings;
