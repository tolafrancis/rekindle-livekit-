import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Switch } from '@rekindle/ui/switch';
import { toast } from '@rekindle/ui/use-toast';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { Check, Loader2 } from 'lucide-react';
import {
  MEMBER_MENU,
  MEMBER_MENU_PRESETS,
  groupKey,
  hiddenMemberMenu,
  saveHiddenMemberMenu,
} from './memberMenu';

interface Props {
  ministry: { id: string; settings?: unknown };
  onUpdate: () => void;
}

/** Settings › Ministry profile › Member menu: pick which screens the
 *  ministry's menu shows. See memberMenu.ts for how it is stored. */
export const MinistryMemberMenuSettings: React.FC<Props> = ({ ministry, onUpdate }) => {
  const { t } = useLanguage();
  const saved = useMemo(() => hiddenMemberMenu(ministry.settings), [ministry.settings]);
  const [hidden, setHidden] = useState<Set<string>>(saved);
  const [saving, setSaving] = useState(false);
  useEffect(() => setHidden(saved), [saved]);

  const dirty = hidden.size !== saved.size || [...hidden].some((k) => !saved.has(k));
  const sameAs = (keys: string[]) => keys.length === hidden.size && keys.every((k) => hidden.has(k));

  const toggle = (key: string, show: boolean) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (show) next.delete(key); else next.add(key);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    const { error } = await saveHiddenMemberMenu(ministry.id, [...hidden]);
    setSaving(false);
    if (error) {
      toast({ title: t('memberMenu', 'saveFailed', 'Could not save the menu'), description: error, variant: 'destructive' });
      return;
    }
    toast({ title: t('memberMenu', 'saved', 'Menu saved') });
    onUpdate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t('memberMenu', 'title', 'Member menu')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('memberMenu', 'subtitle', 'Choose what your members see. A shorter menu is easier to use, especially for people who are new to apps. You can change this at any time, and nothing is deleted.')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('memberMenu', 'quickStart', 'Start from a ready-made menu')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {MEMBER_MENU_PRESETS.map((preset) => {
            const active = sameAs(preset.hidden);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setHidden(new Set(preset.hidden))}
                aria-pressed={active}
                className={`rounded-lg border p-3 text-left transition-colors ${active ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30' : 'hover:bg-muted/60'}`}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  {active && <Check className="h-4 w-4 text-purple-600" />}
                  {t('memberMenu', `preset_${preset.id}`, preset.label)}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t('memberMenu', `presetDesc_${preset.id}`, preset.description)}
                </span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {MEMBER_MENU.map((group) => {
          const wholeKey = groupKey(group.id);
          return (
            <Card key={group.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{t('memberMenu', `group_${group.id}`, group.label)}</CardTitle>
                    <p className="text-xs text-muted-foreground">{t('memberMenu', `groupDesc_${group.id}`, group.description)}</p>
                  </div>
                  {group.items.length === 0 && (
                    <Switch
                      checked={!hidden.has(wholeKey)}
                      onCheckedChange={(v) => toggle(wholeKey, v)}
                      aria-label={group.label}
                    />
                  )}
                </div>
              </CardHeader>
              {group.items.length > 0 && (
                <CardContent className="space-y-2">
                  {group.items.map((item) => (
                    <label key={item.key} className="flex items-center justify-between gap-3 text-sm">
                      <span>{t('memberMenu', `item_${item.key.replace('.', '_')}`, item.label)}</span>
                      <Switch checked={!hidden.has(item.key)} onCheckedChange={(v) => toggle(item.key, v)} />
                    </label>
                  ))}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={save} disabled={!dirty || saving} size="lg" className="shadow-lg">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('memberMenu', 'save', 'Save menu')}
        </Button>
      </div>
    </div>
  );
};

export default MinistryMemberMenuSettings;
