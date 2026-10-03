import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { toast } from '../ui/use-toast';
import {
  FEATURE_GROUPS,
  MINISTRY_FEATURE_GROUPS,
  loadGlobalFeatureFlags,
  loadMinistryFeatureFlags,
  setGlobalFeatureEnabled,
  setMinistryFeatureEnabled,
  useGlobalFeatureFlags,
  type FeatureFlags,
  type FeatureGroup,
} from '@rekindle/features/featureToggles';

// Platform admin switches for whole nav groups (migration 0394). Off hides
// the group; see packages/features/src/featureToggles.ts for precedence.

function whereItShows(g: FeatureGroup): string {
  if (g.consumerNavId && g.ministryNavId) return 'Rekindle app + ministry spaces';
  if (g.consumerNavId) return 'Rekindle app';
  return 'Ministry spaces';
}

function ToggleRow({
  group,
  checked,
  disabled,
  note,
  onChange,
}: {
  group: FeatureGroup;
  checked: boolean;
  disabled?: boolean;
  note?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{group.label}</p>
          <Badge variant="outline" className="text-[10px] font-normal">{whereItShows(group)}</Badge>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>
        {note && <p className="text-xs text-amber-600 mt-1">{note}</p>}
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

/** Global switches: off hides the group for everyone. */
export const GlobalFeatureToggles: React.FC = () => {
  const { flags, loaded } = useGlobalFeatureFlags();
  const [optimistic, setOptimistic] = useState<FeatureFlags>({});
  const [saving, setSaving] = useState<string | null>(null);

  const isOn = (key: string) => (key in optimistic ? optimistic[key] : flags[key] !== false);

  const toggle = async (key: string, checked: boolean) => {
    setSaving(key);
    setOptimistic((o) => ({ ...o, [key]: checked }));
    const res = await setGlobalFeatureEnabled(key, checked);
    if (res.error) {
      toast({ title: 'Could not save setting', description: res.error, variant: 'destructive' });
    }
    // Drop the optimistic value once the shared flags have reloaded.
    await loadGlobalFeatureFlags();
    setOptimistic((o) => {
      const next = { ...o };
      delete next[key];
      return next;
    });
    setSaving(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Feature toggles</CardTitle>
        <p className="text-xs text-gray-500">
          Switching a feature off hides it for everyone, in the Rekindle app and in every ministry space. To switch a
          feature off for one ministry only, open that ministry under Ministries and use its Features tab.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {FEATURE_GROUPS.map((g) => (
          <ToggleRow
            key={g.key}
            group={g}
            checked={isOn(g.key)}
            disabled={!loaded || saving === g.key}
            onChange={(checked) => toggle(g.key, checked)}
          />
        ))}
      </CardContent>
    </Card>
  );
};

/** Per-ministry switches: off hides the group in this ministry's space only. */
export const MinistryFeatureToggles: React.FC<{ ministryId: string }> = ({ ministryId }) => {
  const { flags: globalFlags } = useGlobalFeatureFlags();
  const [flags, setFlags] = useState<FeatureFlags>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    loadMinistryFeatureFlags(ministryId).then((f) => {
      if (!active) return;
      setFlags(f);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [ministryId]);

  const toggle = async (key: string, checked: boolean) => {
    setSaving(key);
    const previous = flags;
    setFlags((f) => ({ ...f, [key]: checked }));
    const res = await setMinistryFeatureEnabled(ministryId, key, checked);
    if (res.error) {
      setFlags(previous);
      toast({ title: 'Could not save setting', description: res.error, variant: 'destructive' });
    }
    setSaving(null);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Switching a feature off hides it in this ministry's space only. Features switched off for everyone in Platform
        Settings stay off here.
      </p>
      {MINISTRY_FEATURE_GROUPS.map((g) => {
        const offGlobally = globalFlags[g.key] === false;
        return (
          <ToggleRow
            key={g.key}
            group={g}
            checked={!offGlobally && flags[g.key] !== false}
            disabled={!loaded || offGlobally || saving === g.key}
            note={offGlobally ? 'Switched off for everyone in Platform Settings.' : undefined}
            onChange={(checked) => toggle(g.key, checked)}
          />
        );
      })}
    </div>
  );
};
