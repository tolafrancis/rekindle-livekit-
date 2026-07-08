import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { getLocalDateString } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { RefreshCw, Share2, Heart, BookOpen, Shield, Volume2, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { canNativeShare } from '@/lib/webShare';
import { HighQualityAudioPlayer } from './HighQualityAudioPlayer';

interface Declaration {
  id: string;
  title?: string | null;
  declaration_number?: number | null;
  text: string;
  category: string;
  scripture_reference: string;
  schedule_date: string | null;
  is_daily: boolean;
  is_published: boolean;
  translations?: Record<string, any>;
  language?: string;
}

interface DeclarationCardProps {
  category?: string;
  showDaily?: boolean;
}

export const DeclarationCard: React.FC<DeclarationCardProps> = ({
  category,
  showDaily = true
}) => {
  const { profile } = useAuth();
  const { t, getLocalizedContent } = useLanguage();
  const [declaration, setDeclaration]         = useState<Declaration | null>(null);
  const [liked, setLiked]                     = useState(false);
  const [isAnimating, setIsAnimating]         = useState(false);
  const [loading, setLoading]                 = useState(true);
  const [allDeclarations, setAllDeclarations] = useState<Declaration[]>([]);
  const [showAudioPreview, setShowAudioPreview] = useState(false);

  useEffect(() => { loadDeclarations(); }, [category]);

  const loadDeclarations = async () => {
    try {
      let query = supabase
        .from('declarations')
        .select('*')
        .eq('is_published', true);

      if (category) query = query.eq('category', category);

      const { data, error } = await query.order('created_at', { ascending: true });
      if (error) throw error;

      if (data && data.length > 0) {
        setAllDeclarations(data);
        if (showDaily) {
          const today = getLocalDateString();
          const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
          // A declaration scheduled for today wins; otherwise rotate through all published daily
          const daily = data.find(d => d.schedule_date === today)
            || data[dayOfYear % data.length];
          setDeclaration(daily);
        } else {
          setDeclaration(data[Math.floor(Math.random() * data.length)]);
        }
      } else {
        setDeclaration({
          id: 'default', title: 'Divine Protection',
          text: 'Today, I speak over my life and my household that no weapon formed against us shall prosper.\n\nI am not stranded, nor am I lost in confusion. The light of His countenance illuminates my path, and darkness is as light before me.\n\nI stand tall in the midst of every challenge, and I overcome by the power of the Spirit.\n\nIn Jesus\'s name, I believe and say amen.',
          category: 'protection', scripture_reference: 'Isaiah 54:17',
          schedule_date: null, is_daily: true, is_published: true
        });
      }
    } catch (err) {
      console.error('Error loading declarations:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshDeclaration = () => {
    setIsAnimating(true);
    setTimeout(() => {
      if (allDeclarations.length > 0) {
        const current = declaration ? allDeclarations.findIndex(d => d.id === declaration.id) : 0;
        const next = (current + 1) % allDeclarations.length;
        setDeclaration(allDeclarations[next]);
      }
      setLiked(false);
      setIsAnimating(false);
    }, 300);
  };

  const shareDeclaration = async () => {
    if (!declaration) return;
    const lz = getLocalizedContent(declaration, ['title', 'text', 'scripture_reference']);
    const title = lz.title ? `${lz.title}\n\n` : '';
    const text = `${title}${lz.text}${lz.scripture_reference ? `\n\n— ${lz.scripture_reference}` : ''}\n\nFrom ReKindle BC Daily Declarations`;
    if (canNativeShare()) {
      await navigator.share({ title: lz.title || t('cards', 'dailyDeclaration', 'Daily Declaration'), text });
    } else {
      await navigator.clipboard.writeText(text);
      toast({ title: t('cards', 'copiedToClipboard', 'Copied to clipboard!'), description: t('cards', 'shareWithOthers', 'Share this with others') });
    }
  };

  const saveDeclaration = async () => {
    if (!declaration) return;
    try {
      if (liked) {
        await supabase.from('bookmarks').delete().eq('content_id', declaration.id).eq('content_type', 'declaration');
        setLiked(false);
        toast({ title: t('cards', 'removedFromSaved', 'Removed from saved') });
      } else {
        await supabase.from('bookmarks').insert({ content_id: declaration.id, content_type: 'declaration', created_at: new Date().toISOString() });
        setLiked(true);
        toast({ title: t('cards', 'saved', 'Saved!') });
      }
    } catch (err) { console.error('Error saving:', err); }
  };

  const categoryGradients: Record<string, string> = {
    protection:   'from-indigo-600 to-indigo-800',
    victory:      'from-emerald-600 to-green-800',
    prosperity:   'from-amber-500 to-yellow-700',
    health:       'from-rose-500 to-pink-700',
    authority:    'from-violet-600 to-purple-800',
    breakthrough: 'from-cyan-600 to-blue-700',
    faith:        'from-blue-600 to-blue-800',
    wisdom:       'from-indigo-600 to-violet-700',
    identity:     'from-purple-600 to-purple-800',
    family:       'from-orange-500 to-rose-600',
    love:         'from-red-500 to-rose-700',
    purpose:      'from-teal-600 to-emerald-700',
  };

  if (loading) {
    return (
      <Card className="overflow-hidden shadow-xl">
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-5 animate-pulse">
          <div className="h-4 bg-white/20 rounded w-1/3 mb-3"></div>
          <div className="h-6 bg-white/20 rounded w-2/3 mb-3"></div>
          <div className="h-20 bg-white/20 rounded"></div>
        </div>
      </Card>
    );
  }

  if (!declaration) return null;

  const lz = getLocalizedContent(declaration, ['title', 'text', 'scripture_reference']);
  const gradient = categoryGradients[declaration.category] || 'from-indigo-600 to-indigo-800';
  const paragraphs = (lz.text || '').split('\n').filter(p => p.trim());

  return (
    <Card className={`overflow-hidden shadow-xl transition-all duration-300 ${isAnimating ? 'scale-95 opacity-50' : 'scale-100 opacity-100'}`}>

      {/* Category header */}
      <div className={`bg-gradient-to-br ${gradient} px-6 pt-5 pb-4 text-white`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 opacity-80">
            <Shield className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">
              {showDaily ? t('cards', 'dailyDeclaration', 'Daily Declaration') : (declaration.category?.replace('_', ' ') || t('cards', 'declaration', 'Declaration'))}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={refreshDeclaration} className="text-white hover:bg-white/20 h-8 w-8">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Title */}
        {lz.title && (
          <div className="text-center mt-3">
            <h2 className="text-2xl font-bold underline leading-tight">{lz.title}</h2>
          </div>
        )}
      </div>

      {/* Declaration body — white, justified */}
      <div className="bg-white px-6 py-5 space-y-4">
        {paragraphs.map((para, idx) => (
          <p
            key={idx}
            className={`leading-relaxed text-justify text-gray-800 text-base ${
              para.toLowerCase().includes('in jesus') || para.toLowerCase().includes('amen')
                ? 'font-medium text-gray-600'
                : ''
            }`}
          >
            {para}
          </p>
        ))}

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
          <Button variant="ghost" size="sm" onClick={saveDeclaration} className={liked ? 'text-red-500' : 'text-gray-500'}>
            <Heart className={`h-4 w-4 mr-1 ${liked ? 'fill-current' : ''}`} />
            {liked ? 'Saved' : 'Save'}
          </Button>
          <Button variant="ghost" size="sm" onClick={shareDeclaration} className="text-gray-500">
            <Share2 className="h-4 w-4 mr-1" />Share
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAudioPreview(!showAudioPreview)} className="text-gray-500">
            <Volume2 className="h-4 w-4 mr-1" />Audio
          </Button>
        </div>

        {showAudioPreview && (
          <div className="bg-white rounded-lg p-3 mt-2 border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-700">{t('cards', 'listenToDeclaration', 'Listen to Declaration')}</span>
              <Button variant="ghost" size="sm" onClick={() => setShowAudioPreview(false)} className="h-6 w-6 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <HighQualityAudioPlayer
              text={`${lz.title ? lz.title + '.\n\n' : ''}${lz.text}`}
              contentId={declaration.id}
              contentType="declaration"
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
