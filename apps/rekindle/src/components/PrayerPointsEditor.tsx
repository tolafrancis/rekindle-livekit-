import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { toast } from './ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { Plus, X, BookOpen, Loader2 } from 'lucide-react';

export interface PrayerPointFormValue {
  title?: string;
  content?: string;
  scripture?: string;
  scriptureText?: string;
  duration?: number;
}

interface PrayerPointsEditorProps {
  points: PrayerPointFormValue[];
  onChange: (points: PrayerPointFormValue[]) => void;
}

/**
 * Shared "Prayer Points" editor used by the Prayer Topic, Prayer Series (per-day),
 * and Prayer Watch admin forms. Each point is just two meaningful fields — the
 * prayer point text and its scripture — plus a small duration control used to
 * pace the live InteractivePrayerSession. `title` is kept in the stored value for
 * backward compatibility with existing rows but is no longer editable here.
 */
export const PrayerPointsEditor: React.FC<PrayerPointsEditorProps> = ({ points, onChange }) => {
  const { t } = useLanguage();
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);

  const updatePoint = (idx: number, field: keyof PrayerPointFormValue, value: string | number) => {
    const next = [...points];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  };

  const addPoint = () => {
    onChange([...points, { title: '', content: '', scripture: '', scriptureText: '', duration: 60 }]);
  };

  const removePoint = (idx: number) => {
    onChange(points.filter((_, i) => i !== idx));
  };

  const fetchScripture = async (idx: number) => {
    const reference = points[idx]?.scripture?.trim();
    if (!reference) {
      toast({
        title: t('adminPrayerLibrary', 'error', 'Error'),
        description: t('adminPrayerLibrary', 'enterScriptureRefFirst', 'Please enter a scripture reference first'),
        variant: 'destructive',
      });
      return;
    }

    setLoadingIndex(idx);
    try {
      const response = await fetch(`https://bible-api.com/${encodeURIComponent(reference)}`);
      if (!response.ok) throw new Error('Scripture not found');
      const data = await response.json();
      updatePoint(idx, 'scriptureText', data.text || data.verses?.[0]?.text || '');
      toast({ title: t('adminPrayerLibrary', 'success', 'Success'), description: t('adminPrayerLibrary', 'scriptureLoaded', 'Scripture text loaded successfully') });
    } catch (err) {
      console.error('Error loading scripture:', err);
      toast({
        title: t('adminPrayerLibrary', 'note', 'Note'),
        description: t('adminPrayerLibrary', 'couldNotAutoLoadScriptureLong', 'Could not auto-load scripture. Please enter manually or check the reference format (e.g., "John 3:16" or "Psalm 23:1-6")'),
        variant: 'default',
      });
    } finally {
      setLoadingIndex(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label>{t('adminPrayerLibrary', 'prayerPoints', 'Prayer Points')}</Label>
        <Button type="button" variant="outline" size="sm" onClick={addPoint}>
          <Plus className="h-3 w-3 mr-1" />
          {t('adminPrayerLibrary', 'addPoint', 'Add Point')}
        </Button>
      </div>
      <div className="space-y-3">
        {points.map((point, idx) => (
          <div key={idx} className="p-3 border rounded-lg bg-gray-50 space-y-2">
            <div className="flex items-start gap-2">
              <Textarea
                className="flex-1 bg-white"
                value={point.content || ''}
                onChange={(e) => updatePoint(idx, 'content', e.target.value)}
                placeholder={t('adminPrayerLibrary', 'prayerPointPlaceholder', 'Prayer point…')}
                rows={2}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => removePoint(idx)}>
                <X className="h-4 w-4 text-red-500" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Input
                className="flex-1 bg-white"
                value={point.scripture || ''}
                onChange={(e) => updatePoint(idx, 'scripture', e.target.value)}
                placeholder={t('adminPrayerLibrary', 'scriptureRefPlaceholder', 'Scripture reference (e.g., John 3:16)')}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fetchScripture(idx)}
                disabled={loadingIndex === idx}
              >
                {loadingIndex === idx ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
              </Button>
            </div>
            {point.scripture && (
              <Textarea
                className="bg-white text-sm"
                value={point.scriptureText || ''}
                onChange={(e) => updatePoint(idx, 'scriptureText', e.target.value)}
                placeholder={t('adminPrayerLibrary', 'scriptureWillLoadHere', 'Scripture text will load here...')}
                rows={2}
              />
            )}

            <div className="flex items-center gap-2">
              <Label className="text-xs">{t('adminPrayerLibrary', 'durationSec', 'Duration (sec):')}</Label>
              <Input
                type="number"
                className="w-20 bg-white"
                value={point.duration ?? 60}
                onChange={(e) => updatePoint(idx, 'duration', parseInt(e.target.value, 10) || 60)}
                min="1"
              />
            </div>
          </div>
        ))}
        {points.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">
            {t('adminPrayerLibrary', 'noPrayerPointsYet', 'No prayer points yet. Click "Add Point" to create one.')}
          </p>
        )}
      </div>
    </div>
  );
};

export default PrayerPointsEditor;
