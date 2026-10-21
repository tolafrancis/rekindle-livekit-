import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { Button } from '@rekindle/ui/button';
import { toast } from '@rekindle/ui/use-toast';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { NavFocusPicker } from './NavFocusPicker';
import { ALL_NAV_FOCUS, navFocusFromProfile, saveNavFocus } from '../navFocus';

/** Saves a choice and reloads the profile so the menu updates. */
function useSaveNavFocus() {
  const { user, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const save = async (focus: string[]) => {
    if (!user?.id) return false;
    setSaving(true);
    const { error } = await saveNavFocus(user.id, focus);
    if (!error) await refreshProfile();
    setSaving(false);
    if (error) {
      toast({ title: t('navFocus', 'saveFailed', 'Could not save your choice'), description: error, variant: 'destructive' });
      return false;
    }
    toast({ title: t('navFocus', 'saved', 'Menu updated'), description: t('navFocus', 'savedBody', 'Everything else is still under More.') });
    return true;
  };
  return { save, saving };
}

/** "Change what I see": pick again what the main menu shows first. */
export const NavFocusDialog: React.FC<{ open: boolean; onOpenChange: (open: boolean) => void }> = ({ open, onOpenChange }) => {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const { save, saving } = useSaveNavFocus();
  const [focus, setFocus] = useState<string[]>([]);
  useEffect(() => {
    if (open) setFocus(navFocusFromProfile(profile) ?? ALL_NAV_FOCUS);
  }, [open, profile]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('navFocus', 'title', 'What would you like help with?')}</DialogTitle>
          <DialogDescription>{t('navFocus', 'body', "Pick as many as you like. We'll put these first, and everything else stays under More.")}</DialogDescription>
        </DialogHeader>
        <NavFocusPicker value={focus} onChange={setFocus} />
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" disabled={saving} onClick={async () => { if (await save(ALL_NAV_FOCUS)) onOpenChange(false); }}>
            {t('navFocus', 'everything', 'Show me everything')}
          </Button>
          <Button disabled={saving || focus.length === 0} onClick={async () => { if (await save(focus)) onOpenChange(false); }}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('navFocus', 'save', 'Save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const homeCardDismissedKey = (userId: string) => `rk-nav-focus-card-dismissed-${userId}`;

/** Home: asks people who joined before the sign-up question once. Hidden
 *  after they choose or close it. */
export const NavFocusHomeCard: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { save, saving } = useSaveNavFocus();
  const [focus, setFocus] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return !!user?.id && localStorage.getItem(homeCardDismissedKey(user.id)) === '1'; } catch { return false; }
  });
  if (!user?.id || !profile || navFocusFromProfile(profile) || dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(homeCardDismissedKey(user.id), '1'); } catch { /* private mode */ }
    setDismissed(true);
  };

  return (
    <section className="relative rounded-2xl border border-purple-200 bg-white p-4 shadow-sm md:p-5">
      <button type="button" onClick={dismiss} aria-label={t('common', 'close', 'Close')} className="absolute right-3 top-3 rounded-md p-1 text-gray-400 hover:text-gray-600">
        <X className="h-4 w-4" />
      </button>
      <h2 className="pr-8 text-lg font-semibold text-gray-900">{t('navFocus', 'title', 'What would you like help with?')}</h2>
      <p className="mb-3 text-sm text-gray-500">{t('navFocus', 'cardBody', "Pick what you came for and we'll put it first in your menu. Everything else stays under More.")}</p>
      <NavFocusPicker value={focus} onChange={setFocus} />
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" disabled={saving} onClick={() => save(ALL_NAV_FOCUS)}>{t('navFocus', 'everything', 'Show me everything')}</Button>
        <Button disabled={saving || focus.length === 0} onClick={() => save(focus)}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('navFocus', 'save', 'Save')}
        </Button>
      </div>
    </section>
  );
};

export default NavFocusDialog;
