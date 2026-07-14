import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { supabase } from '@rekindle/supabase';
import { getLocalDateString } from '@rekindle/ui/utils';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { RefreshCw, Share2, Heart, BookOpen, Sparkles, Volume2, X } from 'lucide-react';
import { toast } from '@rekindle/ui/use-toast';
import { canNativeShare } from '../webShare';
import { HighQualityAudioPlayer } from './HighQualityAudioPlayer';
import { scopeBySource, type FeatureContentSource } from '../contentSource';

interface Affirmation {
  id: string;
  title?: string | null;
  text: string;
  category: string;
  scripture_reference: string;
  schedule_date: string | null;
  is_daily: boolean;
  is_published: boolean;
  translations?: Record<string, any>;
}

interface AffirmationCardProps {
  category?: string;
  showDaily?: boolean;
  // Ministry scoping: when `source` is set, restrict to the ministry's content.
  ministryId?: string | null;
  source?: FeatureContentSource;
}

export const AffirmationCard: React.FC<AffirmationCardProps> = ({
  category,
  showDaily = true,
  ministryId,
  source
}) => {
  const { profile } = useAuth();
  const { t, getLocalizedContent } = useLanguage();
  const [affirmation, setAffirmation]       = useState<Affirmation | null>(null);
  const [liked, setLiked]                   = useState(false);
  const [isAnimating, setIsAnimating]       = useState(false);
  const [loading, setLoading]               = useState(true);
  const [allAffirmations, setAllAffirmations] = useState<Affirmation[]>([]);
  const [showAudioPreview, setShowAudioPreview] = useState(false);

  useEffect(() => { loadAffirmations(); }, [category, profile?.affirmation_categories, ministryId, source]);

  const loadAffirmations = async () => {
    try {
      const userCategories: string[] = profile?.affirmation_categories || [];

      // Build query — prefer is_daily=true, fall back to all published
      const buildQuery = (dailyOnly: boolean) => {
        let q = supabase.from('affirmations').select('*').eq('is_published', true);
        if (dailyOnly) q = q.eq('is_daily', true);
        // In ministry mode (source set) skip the member's personal category filter.
        if (!source && userCategories.length > 0 && !category) q = q.in('category', userCategories);
        else if (category) q = q.eq('category', category);
        if (source) q = scopeBySource(q, ministryId ?? null, source);
        return q.order('created_at', { ascending: true });
      };

      let { data, error } = await buildQuery(true);
      if (error) throw error;

      // Fall back to all published if no is_daily affirmations exist yet
      if (!data || data.length === 0) {
        const res = await buildQuery(false);
        data = res.data;
        error = res.error;
        if (error) throw error;
      }

      if (data && data.length > 0) {
        setAllAffirmations(data);
        if (showDaily) {
          const today = getLocalDateString();
          const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
          const dailyAffirmation = data.find(a => a.schedule_date === today) || data[dayOfYear % data.length];
          setAffirmation(dailyAffirmation);
        } else {
          setAffirmation(data[Math.floor(Math.random() * data.length)]);
        }
      } else {
        setAffirmation({
          id: 'default', title: 'Walking in Faith',
          text: 'Today, I speak over my life and my household that God is our source and sustenance. I am a child of God, fearfully and wonderfully made. His plans for me are good, and I walk in His purpose today.\n\nIn Jesus\'s name, I believe and say amen.',
          category: 'faith', scripture_reference: 'Jeremiah 29:11',
          schedule_date: null, is_daily: true, is_published: true
        });
      }
    } catch (err: any) {
      console.error('Error loading affirmations:', err?.message || err);
    } finally {
      setLoading(false);
    }
  };

  const refreshAffirmation = () => {
    setIsAnimating(true);
    setTimeout(() => {
      if (allAffirmations.length > 0) {
        const current = affirmation ? allAffirmations.findIndex(a => a.id === affirmation.id) : 0;
        const next = (current + 1) % allAffirmations.length;
        setAffirmation(allAffirmations[next]);
      }
      setLiked(false);
      setIsAnimating(false);
    }, 300);
  };

  const shareAffirmation = async () => {
    if (!affirmation) return;
    const lz = getLocalizedContent(affirmation, ['title', 'text', 'scripture_reference']);
    const title = lz.title ? `${lz.title}\n\n` : '';
    const text = `${title}${lz.text}${lz.scripture_reference ? `\n\n— ${lz.scripture_reference}` : ''}\n\nFrom ReKindle BC Daily Affirmations`;
    if (canNativeShare()) {
      await navigator.share({ title: lz.title || t('cards', 'dailyAffirmation', 'Daily Affirmation'), text });
    } else {
      await navigator.clipboard.writeText(text);
      toast({ title: t('cards', 'copiedToClipboard', 'Copied to clipboard!'), description: t('cards', 'shareWithOthers', 'Share this with others') });
    }
  };

  const saveAffirmation = async () => {
    if (!affirmation) return;
    try {
      if (liked) {
        await supabase.from('bookmarks').delete().eq('content_id', affirmation.id).eq('content_type', 'affirmation');
        setLiked(false);
        toast({ title: t('cards', 'removedFromSaved', 'Removed from saved') });
      } else {
        await supabase.from('bookmarks').insert({ content_id: affirmation.id, content_type: 'affirmation', created_at: new Date().toISOString() });
        setLiked(true);
        toast({ title: t('cards', 'saved', 'Saved!') });
      }
    } catch (err) { console.error('Error saving:', err); }
  };

  const categoryColors: Record<string, string> = {
    faith: 'from-blue-600 to-blue-800',
    identity: 'from-purple-600 to-purple-800',
    strength: 'from-orange-500 to-red-700',
    peace: 'from-green-600 to-emerald-700',
    provision: 'from-amber-500 to-yellow-700',
    healing: 'from-cyan-600 to-teal-700',
    wisdom: 'from-indigo-600 to-violet-700',
    family: 'from-rose-500 to-pink-700',
    love: 'from-red-500 to-rose-700',
    prosperity: 'from-emerald-600 to-green-800',
    protection: 'from-slate-600 to-slate-800',
    purpose: 'from-fuchsia-600 to-purple-800',
  };

  if (loading) {
    return (
      <Card className="overflow-hidden shadow-xl">
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 p-6 animate-pulse">
          <div className="h-4 bg-white/20 rounded w-1/3 mb-4"></div>
          <div className="h-6 bg-white/20 rounded w-2/3 mb-3"></div>
          <div className="h-20 bg-white/20 rounded mb-4"></div>
        </div>
      </Card>
    );
  }

  if (!affirmation) return null;

  // Localized view of the affirmation for DISPLAY only (category stays original for logic)
  const lz = getLocalizedContent(affirmation, ['title', 'text', 'scripture_reference']);

  const gradient = categoryColors[affirmation.category] || 'from-purple-600 to-purple-800';

  // Split text into paragraphs for display
  const paragraphs = (lz.text || '').split('\n').filter(p => p.trim());

  return (
    <Card className={`overflow-hidden shadow-xl transition-all duration-300 ${isAnimating ? 'scale-95 opacity-50' : 'scale-100 opacity-100'}`}>
      {/* Header */}
      <div className={`bg-gradient-to-br ${gradient} px-6 pt-6 pb-4 text-white`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 opacity-80" />
            <span className="text-xs font-semibold uppercase tracking-widest opacity-80">
              {showDaily ? t('cards', 'dailyAffirmation', 'Daily Affirmation') : (affirmation.category?.replace('_', ' ') || t('cards', 'affirmation', 'Affirmation'))}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={refreshAffirmation} className="text-white hover:bg-white/20 h-8 w-8">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Title only — no declaration number */}
        {lz.title && (
          <div className="text-center mb-4">
            <h2 className="text-2xl font-bold underline leading-tight">{lz.title}</h2>
          </div>
        )}
      </div>

      {/* Declaration body — white background, justified text */}
      <div className="bg-white px-6 py-5 space-y-4">
        {paragraphs.map((para, idx) => (
          <p
            key={idx}
            className={`leading-relaxed text-justify text-gray-800 ${
              para.toLowerCase().includes("in jesus") || para.toLowerCase().includes("amen")
                ? 'font-medium text-gray-600 mt-2'
                : 'text-base'
            }`}
          >
            {para}
          </p>
        ))}

        {/* Scripture */}
        {lz.scripture_reference && (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100 text-amber-600">
            <BookOpen className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm italic font-medium">— {lz.scripture_reference}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <CardContent className="p-3 bg-gray-50 border-t">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={saveAffirmation} className={liked ? 'text-red-500' : 'text-gray-500'}>
            <Heart className={`h-4 w-4 mr-1 ${liked ? 'fill-current' : ''}`} />
            {liked ? 'Saved' : 'Save'}
          </Button>
          <Button variant="ghost" size="sm" onClick={shareAffirmation} className="text-gray-500">
            <Share2 className="h-4 w-4 mr-1" />Share
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAudioPreview(!showAudioPreview)} className="text-gray-500">
            <Volume2 className="h-4 w-4 mr-1" />Audio
          </Button>
        </div>

        {showAudioPreview && (
          <div className="bg-white rounded-lg p-3 mt-2 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-700">{t('cards', 'listenToAffirmation', 'Listen to Affirmation')}</span>
              <Button variant="ghost" size="sm" onClick={() => setShowAudioPreview(false)} className="h-6 w-6 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <HighQualityAudioPlayer
              text={`${lz.title ? lz.title + '.\n\n' : ''}${lz.text}`}
              contentId={affirmation.id}
              contentType="affirmation"
              title={lz.title || lz.text.substring(0, 50)}
              autoLoad={true}
              className="w-full"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
