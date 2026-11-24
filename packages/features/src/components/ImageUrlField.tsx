/**
 * ImageUrlField: an image field that takes either a pasted URL or a file
 * uploaded from the device. Uploads go to a public Supabase storage bucket
 * and the field's value becomes the file's public URL, so callers keep
 * storing a plain URL string exactly as before.
 */
import React, { useRef, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { toast } from '@rekindle/ui/use-toast';
import { useLanguage } from '../LanguageContext';
import { Upload, Loader2, X } from 'lucide-react';

const MAX_BYTES = 5 * 1024 * 1024;

interface ImageUrlFieldProps {
  value: string;
  onChange: (url: string) => void;
  /** Public storage bucket for uploads. */
  bucket?: string;
  /** Folder inside the bucket. */
  folder?: string;
  placeholder?: string;
  /** Preview shape. */
  aspect?: 'wide' | 'square';
}

export const ImageUrlField: React.FC<ImageUrlFieldProps> = ({
  value,
  onChange,
  bucket = 'assets',
  folder = 'uploads',
  placeholder = 'https://...',
  aspect = 'wide',
}) => {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: t('imageUrlField', 'notImage', 'Please choose an image file'), variant: 'destructive' });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: t('imageUrlField', 'tooLarge', 'Image must be under 5MB'), variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(data.publicUrl);
      toast({ title: t('imageUrlField', 'uploaded', 'Image uploaded') });
    } catch (err: any) {
      toast({ title: t('imageUrlField', 'uploadFailed', 'Upload failed'), description: err?.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const previewClass = aspect === 'square' ? 'w-20 h-20' : 'w-full h-28';

  return (
    <div className="space-y-2">
      {value ? (
        <div className={`relative ${previewClass} rounded-lg overflow-hidden border bg-gray-50`}>
          <img src={value} alt={t('imageUrlField', 'preview', 'Image preview')} className="w-full h-full object-cover" />
          <button
            type="button"
            aria-label={t('imageUrlField', 'remove', 'Remove image')}
            onClick={() => onChange('')}
            className="absolute top-1.5 right-1.5 bg-black/50 rounded-full p-1 text-white hover:bg-black/70"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="shrink-0"
        >
          {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
          {uploading ? t('imageUrlField', 'uploading', 'Uploading…') : t('imageUrlField', 'upload', 'Upload')}
        </Button>
      </div>
      <p className="text-xs text-gray-400">
        {t('imageUrlField', 'hint', 'Paste an image link or upload from your device (PNG, JPG, GIF up to 5MB).')}
      </p>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
};

export default ImageUrlField;
