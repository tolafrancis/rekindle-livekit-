import React from 'react';
import { Check } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { NAV_FOCUS_OPTIONS } from '../navFocus';

/** Large tick-tiles for "What would you like help with?" (navFocus.ts). */
export const NavFocusPicker: React.FC<{ value: string[]; onChange: (next: string[]) => void }> = ({ value, onChange }) => {
  const { t } = useLanguage();
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="space-y-2">
      {NAV_FOCUS_OPTIONS.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => toggle(o.id)}
            className={`flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left transition-all ${on ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-purple-300'}`}
          >
            <span className="text-2xl leading-none" aria-hidden>{o.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-gray-900">{t('navFocus', `label_${o.id}`, o.label)}</span>
              <span className="block text-sm text-gray-500">{t('navFocus', `desc_${o.id}`, o.description)}</span>
            </span>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300'}`}>
              {on && <Check className="h-4 w-4" />}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default NavFocusPicker;
