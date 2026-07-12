import React, { useState } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { supabase } from '@/lib/supabase';
import { toast } from './ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { Upload, Sparkles, Loader2, Image as ImageIcon } from 'lucide-react';

interface CoverImageFieldProps {
  value: string;
  onChange: (url: string) => void;
  /** Used to build the AI prompt and as a hint to the generator (e.g. the title). */
  promptSubject?: string;
  label?: string;
  /** Storage bucket for uploads (must be public). */
  bucket?: string;
  /** Preview shape. */
  aspect?: 'square' | 'wide';
}

export const CoverImageField: React.FC<CoverImageFieldProps> = ({
  value,
  onChange,
  promptSubject = '',
  label,
  bucket = 'channel-featured',
  aspect = 'wide',
}) => {
  const { t } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `cover-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
      onChange(publicUrl);
      toast({ title: t('coverImageField', 'imageUploaded', 'Image uploaded') });
    } catch (err: any) {
      toast({ title: t('coverImageField', 'uploadFailed', 'Upload failed'), description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    const subject = promptSubject.trim();
    if (!subject) {
      toast({ title: t('coverImageField', 'addTitleFirst', 'Add a title first'), description: t('coverImageField', 'titleUsedToGenerate', 'The title is used to generate a fitting image.'), variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const prompt =
        `A beautiful, reverent cover image for "${subject}". ` +
        `Soft inspirational lighting, uplifting and faith-themed, spiritual and serene, ` +
        `high quality digital illustration. No text, no words, no letters.`;
      const { data, error } = await supabase.functions.invoke('generate-cover-image', {
        body: { prompt, bucket },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error('No image returned');
      onChange(data.url);
      toast({ title: t('coverImageField', 'coverImageGenerated', 'Cover image generated ✨') });
    } catch (err: any) {
      toast({ title: t('coverImageField', 'generationFailed', 'Generation failed'), description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const previewClass = aspect === 'square' ? 'w-16 h-16' : 'w-full h-28';

  return (
    <div>
      <Label>{label ?? t('coverImageField', 'coverImage', 'Cover Image')}</Label>
      <div className="mt-1 space-y-2">
        {value ? (
          <img src={value} alt={t('coverImageField', 'coverPreview', 'Cover preview')} className={`${previewClass} rounded-lg object-cover border`} />
        ) : (
          <div className={`${previewClass} rounded-lg border flex items-center justify-center bg-gray-50`}>
            <ImageIcon className="h-5 w-5 text-gray-300" />
          </div>
        )}

        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('coverImageField', 'pasteImageUrl', 'Paste image URL…')}
        />

        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer hover:text-gray-800">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? t('coverImageField', 'uploading', 'Uploading…') : t('coverImageField', 'uploadFile', 'Upload file')}
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 hover:text-purple-700 disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generating ? t('coverImageField', 'generating', 'Generating…') : t('coverImageField', 'aiGenerate', 'AI generate')}
          </button>
        </div>
      </div>
    </div>
  );
};
