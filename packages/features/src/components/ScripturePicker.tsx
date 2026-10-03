import React, { useState } from 'react';
import { Book, Download, Loader2, X } from 'lucide-react';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { toast } from '@rekindle/ui/use-toast';
import { useLanguage } from '../LanguageContext';
import { fetchScripture } from '../bibleApi';

export interface PickedScripture {
  reference: string;
  text: string;
  version: string;
}

interface Props {
  value: PickedScripture[];
  onChange: (scriptures: PickedScripture[]) => void;
}

const VERSION = 'KJV';

/**
 * Scripture references for a revelation, with the real verse text looked up
 * through bibleApi (bible-api.com, KJV). Shared by the consumer and ministry
 * revelation forms so both require and store scriptures the same way.
 */
export const ScripturePicker: React.FC<Props> = ({ value, onChange }) => {
  const { t } = useLanguage();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const add = async () => {
    const reference = input.trim();
    if (!reference || loading) return;
    if (value.some((s) => s.reference.toLowerCase() === reference.toLowerCase())) {
      toast({ title: t('scripturePicker', 'alreadyAdded', 'Already added'), description: t('scripturePicker', 'alreadyInList', 'This scripture is already in your list') });
      return;
    }
    setLoading(true);
    try {
      const text = await fetchScripture(reference, VERSION.toLowerCase());
      onChange([...value, { reference, text, version: VERSION }]);
      setInput('');
    } catch (err) {
      toast({
        title: t('scripturePicker', 'notFound', 'Scripture not found'),
        description: err instanceof Error ? err.message : t('scripturePicker', 'checkReference', 'Check the reference (e.g. John 3:16)'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-purple-700">{t('scripturePicker', 'required', 'Scripture References (Required)')}</p>
      <div className="flex gap-2">
        <Input
          placeholder={t('scripturePicker', 'placeholder', 'e.g. John 3:16 or Romans 8:28-30')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
          className="flex-1 bg-white"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 px-3 gap-1 border-purple-300 text-purple-700 hover:bg-purple-50"
          onClick={() => void add()}
          disabled={loading || !input.trim()}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="text-xs">{t('scripturePicker', 'add', 'Add')}</span>
        </Button>
      </div>

      {value.length > 0 ? (
        <div className="space-y-2">
          {value.map((s, index) => (
            <div key={s.reference} className="flex items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-800">
                  <Book className="mr-1 inline h-3 w-3" />{s.reference} ({s.version})
                </p>
                <p className="mt-1 text-sm italic text-gray-700">"{s.text}"</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t('scripturePicker', 'remove', 'Remove')}
                className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-500"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-red-500">{t('scripturePicker', 'atLeastOne', 'Add at least one scripture to post')}</p>
      )}
    </div>
  );
};

export default ScripturePicker;
