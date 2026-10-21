import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { Button } from '@rekindle/ui/button';
import { toast } from '@rekindle/ui/use-toast';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { useTutorials } from '@rekindle/features/tutorial/TutorialProvider';
import { Loader2 } from 'lucide-react';
import { MEMBER_MENU_PRESETS, saveHiddenMemberMenu } from './memberMenu';
import { MINISTRY_INTRO_TUTORIAL_ID } from '../tutorials/ministryTourDefinitions';

interface Props {
  ministryId: string;
  open: boolean;
  /** A ready-made menu was saved. */
  onChosen: (hidden: string[]) => void;
  /** Open Settings › Ministry profile › Member menu to pick screens one by one. */
  onCustomise: () => void;
  /** Ask again next time. */
  onLater: () => void;
}

/** Shown to a ministry's leaders until they pick a member menu (no
 *  settings.member_menu stored yet). One tap saves a ready-made menu, then
 *  the ministry tour starts, covering only the screens that menu shows. */
export const MemberMenuSetupDialog: React.FC<Props> = ({ ministryId, open, onChosen, onCustomise, onLater }) => {
  const { t } = useLanguage();
  const [saving, setSaving] = useState<string | null>(null);
  const { start } = useTutorials();

  const choose = async (presetId: string, hidden: string[]) => {
    setSaving(presetId);
    const { error } = await saveHiddenMemberMenu(ministryId, hidden);
    setSaving(null);
    if (error) {
      toast({ title: t('memberMenu', 'saveFailed', 'Could not save the menu'), description: error, variant: 'destructive' });
      return;
    }
    toast({ title: t('memberMenu', 'saved', 'Menu saved'), description: t('memberMenu', 'changeLater', 'You can change it any time in Settings › Ministry profile › Member menu.') });
    onChosen(hidden);
    // Once the dialog has closed and the new menu is on screen, show them
    // around it.
    window.setTimeout(() => start(MINISTRY_INTRO_TUTORIAL_ID, { restart: true }), 600);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onLater(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('memberMenu', 'setupTitle', 'What does your ministry need?')}</DialogTitle>
          <DialogDescription>
            {t('memberMenu', 'setupBody', 'Pick a menu for your members. A shorter menu is easier to use, especially for people who are new to apps. Nothing is deleted, and you can change it at any time. Then we\'ll give you a quick tour.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {MEMBER_MENU_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={!!saving}
              onClick={() => choose(preset.id, preset.hidden)}
              className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 disabled:opacity-60"
            >
              <span className="flex-1">
                <span className="block font-medium">{t('memberMenu', `preset_${preset.id}`, preset.label)}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{t('memberMenu', `presetDesc_${preset.id}`, preset.description)}</span>
              </span>
              {saving === preset.id && <Loader2 className="mt-1 h-4 w-4 animate-spin" />}
            </button>
          ))}
        </div>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={onLater} disabled={!!saving}>{t('memberMenu', 'later', 'Not now')}</Button>
          <Button variant="outline" onClick={onCustomise} disabled={!!saving}>{t('memberMenu', 'customise', 'Choose screens one by one')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MemberMenuSetupDialog;
