import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { useUpgradePrompt } from '@/hooks/useUpgradePrompt';
import { UpgradePromptModal } from './UpgradePromptModal';
import { BookOpen, Plus, RotateCcw, Check, X, Brain, Trophy, Search, ChevronRight, Download, Loader2, Lock, Crown } from 'lucide-react';
import { toast } from './ui/use-toast';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

/**
 * Scripture Memory Component with Bible API Integration
 * 
 * Uses bible-api.com - a free, no-authentication-required Bible API
 * Supports multiple translations and verse ranges
 * Same API used by the Ministry Devotionals Manager
 */

interface ScriptureCard {
  id: string;
  reference: string;
  verse_text: string;
  translation: string;
  mastery_level: number;
  times_reviewed: number;
  times_correct: number;
}

// Bible books for selection
const bibleBooks = {
  oldTestament: [
    'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
    'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
    '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles',
    'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs',
    'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah',
    'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel',
    'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk',
    'Zephaniah', 'Haggai', 'Zechariah', 'Malachi'
  ],
  newTestament: [
    'Matthew', 'Mark', 'Luke', 'John', 'Acts',
    'Romans', '1 Corinthians', '2 Corinthians', 'Galatians',
    'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians',
    '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus',
    'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter',
    '1 John', '2 John', '3 John', 'Jude', 'Revelation'
  ]
};

const allBooks = [...bibleBooks.oldTestament, ...bibleBooks.newTestament];

// Bible versions supported by bible-api.com
const bibleVersions = [
  { id: 'kjv', name: 'King James Version (KJV)' },
  { id: 'web', name: 'World English Bible (WEB)' },
  { id: 'oeb-us', name: 'Open English Bible (US)' },
  { id: 'clementine', name: 'Clementine Latin Vulgate' },
  { id: 'almeida', name: 'Almeida (Portuguese)' },
  { id: 'rccv', name: 'Romanian Corrected Cornilescu Version' }
];

// Popular verses for quick selection
const popularVerses = [
  'John 3:16', 'Philippians 4:13', 'Jeremiah 29:11',
  'Romans 8:28', 'Psalm 23:1', 'Matthew 6:33'
];

export function ScriptureMemory() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const entitlements = useUserEntitlements();
  const { activePrompt, show: showUpgradePrompt, dismiss: dismissUpgradePrompt } = useUpgradePrompt();
  
  const [cards, setCards] = useState<ScriptureCard[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState('kjv'); // KJV as default
  const [scriptureReference, setScriptureReference] = useState('');
  const [scriptureText, setScriptureText] = useState('');
  const [currentCard, setCurrentCard] = useState<ScriptureCard | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [mode, setMode] = useState<'list' | 'review'>('list');
  const [loading, setLoading] = useState(false);
  const [loadingScripture, setLoadingScripture] = useState(false);
  
  // Get verse limit from subscription
  const verseLimit = null; // Scripture memory is free and unlimited

  useEffect(() => { fetchCards(); }, [user]);

  const fetchCards = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('scripture_memory_cards')
      .select('*')
      .eq('user_id', user.id)
      .order('next_review_date');
    if (data) setCards(data);
  };

  // Fetch scripture from bible-api.com (free, no API key required)
  const fetchScriptureFromAPI = async (reference: string, translation: string = 'kjv'): Promise<string> => {
    try {
      // bible-api.com supports format: "John 3:16", "Romans 8:28-30", etc.
      // Add translation parameter if not KJV
      const url = translation === 'kjv' 
        ? `https://bible-api.com/${encodeURIComponent(reference)}`
        : `https://bible-api.com/${encodeURIComponent(reference)}?translation=${translation}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Scripture not found');
      }

      const data = await response.json();
      
      // Extract text from response
      const text = data.text || data.verses?.[0]?.text || '';
      
      // Clean up the text (remove verse numbers, extra whitespace, etc.)
      return text
        .replace(/\[\d+:\d+\]/g, '') // Remove [1:1] style verse numbers
        .replace(/\d+:\d+/g, '') // Remove 1:1 style verse numbers  
        .trim();
    } catch (error) {
      console.error('Error fetching scripture:', error);
      throw error;
    }
  };

  const handleLoadScripture = async () => {
    if (!scriptureReference.trim()) {
      toast({
        title: t('scriptureMemory', 'referenceRequiredTitle', 'Reference Required'),
        description: t('scriptureMemory', 'referenceRequiredDesc', 'Please enter a scripture reference (e.g., John 3:16)'),
        variant: 'destructive'
      });
      return;
    }

    const reference = scriptureReference.trim();
    
    // Validate format - flexible to handle various formats
    const hasValidFormat = /^(\d?\s?[A-Za-z\s]+)\s+(\d+):(\d+)(?:-(\d+))?$/.test(reference);
    if (!hasValidFormat) {
      toast({
        title: t('scriptureMemory', 'invalidFormatTitle', 'Invalid Format'),
        description: t('scriptureMemory', 'invalidFormatDesc', 'Please use format: Book Chapter:Verse (e.g., John 3:16, Romans 8:28-30)'),
        variant: 'destructive'
      });
      return;
    }

    setLoadingScripture(true);

    try {
      const text = await fetchScriptureFromAPI(reference, selectedVersion);
      
      if (text) {
        setScriptureText(text);
        
        const versionName = bibleVersions.find(v => v.id === selectedVersion)?.name || selectedVersion.toUpperCase();
        toast({
          title: t('scriptureMemory', 'scriptureLoadedTitle', 'Scripture Loaded'),
          description: t('scriptureMemory', 'scriptureLoadedDesc', 'Successfully loaded {reference} ({versionName})').replace('{reference}', reference).replace('{versionName}', versionName),
        });
      } else {
        toast({
          title: t('scriptureMemory', 'verseNotFoundTitle', 'Verse Not Found'),
          description: t('scriptureMemory', 'verseNotFoundDesc', 'Could not find {reference}. Please check the reference or enter the text manually.').replace('{reference}', reference),
        });
      }
    } catch (error: any) {
      toast({
        title: t('scriptureMemory', 'noteTitle', 'Note'),
        description: t('scriptureMemory', 'autoLoadFailedDesc', 'Could not auto-load scripture. Please enter manually or check the reference format.'),
        variant: 'default'
      });
    } finally {
      setLoadingScripture(false);
    }
  };

  const handleQuickSelect = async (reference: string) => {
    setScriptureReference(reference);
    setLoadingScripture(true);
    
    try {
      const text = await fetchScriptureFromAPI(reference, selectedVersion);
      if (text) {
        setScriptureText(text);
        
        const versionName = bibleVersions.find(v => v.id === selectedVersion)?.name || selectedVersion.toUpperCase();
        toast({
          title: t('scriptureMemory', 'scriptureLoadedTitle', 'Scripture Loaded'),
          description: t('scriptureMemory', 'referenceVersionDesc', '{reference} ({versionName})').replace('{reference}', reference).replace('{versionName}', versionName),
        });
      }
    } catch (error) {
      console.error('Error loading quick select:', error);
      toast({
        title: t('scriptureMemory', 'noteTitle', 'Note'),
        description: t('scriptureMemory', 'loadFailedDesc', 'Could not load scripture. Please try entering manually.'),
        variant: 'default'
      });
    } finally {
      setLoadingScripture(false);
    }
  };

  const handleVersionChange = async (version: string) => {
    setSelectedVersion(version);
    // If we have a reference already, reload with new version
    if (scriptureReference.trim() && scriptureText.trim()) {
      setLoadingScripture(true);
      try {
        const text = await fetchScriptureFromAPI(scriptureReference.trim(), version);
        if (text) {
          setScriptureText(text);
        }
      } catch (error) {
        console.error('Error reloading with new version:', error);
      } finally {
        setLoadingScripture(false);
      }
    }
  };

  const addCard = async () => {
    if (!scriptureReference.trim() || !scriptureText.trim() || !user) {
      toast({
        title: t('scriptureMemory', 'missingInfoTitle', 'Missing Information'),
        description: t('scriptureMemory', 'missingInfoDesc', 'Please provide both scripture reference and text'),
        variant: 'destructive'
      });
      return;
    }

    // Scripture memory is free and unlimited for all users

    setLoading(true);
    
    try {
      const { error } = await supabase.from('scripture_memory_cards').insert({
        user_id: user.id,
        reference: scriptureReference.trim(),
        verse_text: scriptureText.trim(),
        translation: selectedVersion,
        mastery_level: 0,
        times_reviewed: 0,
        times_correct: 0,
        next_review_date: new Date().toISOString().split('T')[0]
      });

      if (error) throw error;

      toast({
        title: t('scriptureMemory', 'successTitle', 'Success'),
        description: t('scriptureMemory', 'verseAddedDesc', 'Verse added to memory cards!')
      });
      
      // Reset form
      setScriptureReference('');
      setScriptureText('');
      setSelectedVersion('kjv'); // Reset to KJV
      setShowAdd(false);
      fetchCards();
    } catch (err: any) {
      toast({
        title: t('scriptureMemory', 'errorTitle', 'Error'),
        description: err.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const startReview = () => {
    if (cards.length === 0) return;
    setCurrentCard(cards[0]);
    setShowAnswer(false);
    setMode('review');
  };

  const handleAnswer = async (correct: boolean) => {
    if (!currentCard) return;
    const newMastery = correct ? Math.min(currentCard.mastery_level + 1, 5) : Math.max(currentCard.mastery_level - 1, 0);
    const daysUntilReview = Math.pow(2, newMastery);
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + daysUntilReview);

    await supabase.from('scripture_memory_cards').update({
      mastery_level: newMastery,
      times_reviewed: currentCard.times_reviewed + 1,
      times_correct: currentCard.times_correct + (correct ? 1 : 0),
      next_review_date: nextReview.toISOString().split('T')[0],
      last_reviewed_at: new Date().toISOString()
    }).eq('id', currentCard.id);

    const remaining = cards.filter(c => c.id !== currentCard.id);
    if (remaining.length > 0) {
      setCurrentCard(remaining[0]);
      setShowAnswer(false);
    } else {
      setMode('list');
      fetchCards();
    }
  };

  const deleteCard = async (cardId: string) => {
    await supabase.from('scripture_memory_cards').delete().eq('id', cardId);
    fetchCards();
    toast({ title: t('scriptureMemory', 'deletedTitle', 'Deleted'), description: t('scriptureMemory', 'verseRemovedDesc', 'Verse removed from memory cards') });
  };

  const getMasteryColor = (level: number) => {
    const colors = ['bg-gray-200', 'bg-red-200', 'bg-orange-200', 'bg-yellow-200', 'bg-green-200', 'bg-emerald-400'];
    return colors[level] || colors[0];
  };

  const getMasteryLabel = (level: number) => {
    const labels = [
      t('scriptureMemory', 'masteryNew', 'New'),
      t('scriptureMemory', 'masteryLearning', 'Learning'),
      t('scriptureMemory', 'masteryReviewing', 'Reviewing'),
      t('scriptureMemory', 'masteryFamiliar', 'Familiar'),
      t('scriptureMemory', 'masteryKnown', 'Known'),
      t('scriptureMemory', 'masteryMastered', 'Mastered')
    ];
    return labels[level] || labels[0];
  };

  const totalMastered = cards.filter(c => c.mastery_level >= 4).length;

  if (mode === 'review' && currentCard) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setMode('list')}>
          <RotateCcw className="h-4 w-4 mr-2" />{t('scriptureMemory', 'backToList', 'Back to List')}
        </Button>
        <Card className="p-8 text-center min-h-[400px] flex flex-col justify-center bg-gradient-to-br from-purple-50 to-indigo-50">
          {!showAnswer ? (
            <>
              <div className="mb-6">
                <span className={`inline-block px-3 py-1 rounded-full text-sm ${getMasteryColor(currentCard.mastery_level)}`}>
                  {getMasteryLabel(currentCard.mastery_level)}
                </span>
              </div>
              <p className="text-2xl font-bold text-purple-600 mb-2">{currentCard.reference}</p>
              <p className="text-sm text-gray-500 mb-6">({bibleVersions.find(v => v.id === currentCard.translation)?.name || currentCard.translation})</p>
              <p className="text-gray-500 mb-8">{t('scriptureMemory', 'reciteFromMemoryPrompt', 'Can you recite this verse from memory?')}</p>
              <Button onClick={() => setShowAnswer(true)} size="lg" className="mx-auto">
                <Search className="h-4 w-4 mr-2" />
                {t('scriptureMemory', 'revealVerse', 'Reveal Verse')}
              </Button>
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-purple-600 mb-2">{currentCard.reference}</p>
              <p className="text-sm text-gray-500 mb-4">({bibleVersions.find(v => v.id === currentCard.translation)?.name || currentCard.translation})</p>
              <div className="bg-white rounded-xl p-6 mb-6 shadow-inner">
                <p className="text-lg text-gray-700 italic leading-relaxed">"{currentCard.verse_text}"</p>
              </div>
              <p className="text-sm text-gray-500 mb-6">{t('scriptureMemory', 'howWellRemember', 'How well did you remember it?')}</p>
              <div className="flex gap-4 justify-center">
                <Button variant="outline" onClick={() => handleAnswer(false)} className="border-red-300 text-red-600 hover:bg-red-50">
                  <X className="h-4 w-4 mr-2" />{t('scriptureMemory', 'needPractice', 'Need Practice')}
                </Button>
                <Button onClick={() => handleAnswer(true)} className="bg-green-600 hover:bg-green-700">
                  <Check className="h-4 w-4 mr-2" />{t('scriptureMemory', 'gotIt', 'Got It!')}
                </Button>
              </div>
            </>
          )}
        </Card>
        <div className="text-center text-sm text-gray-500">
          {t('scriptureMemory', 'progressXofY', '{current} of {total} verses').replace('{current}', String(cards.indexOf(currentCard) + 1)).replace('{total}', String(cards.length))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Verse Limit Banner */}
      {verseLimit !== null && verseLimit !== undefined && (
        <div className="bg-gray-50 p-3 rounded-lg border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">
                {t('scriptureMemory', 'verseCountLabel', 'Scripture Memory: {count} / {limit} verses').replace('{count}', String(cards.length)).replace('{limit}', String(verseLimit))}
              </p>
              <p className="text-xs text-gray-500">
                {cards.length >= verseLimit
                  ? t('scriptureMemory', 'verseLimitReached', 'Verse limit reached - Upgrade for unlimited verses')
                  : t('scriptureMemory', 'canAddMoreVerses', 'You can add {remaining} more verse(s)').replace('{remaining}', String(verseLimit - cards.length))
                }
              </p>
            </div>
            {cards.length >= verseLimit && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = '/subscribe'}
              >
                <Crown className="h-4 w-4 mr-2" />
                {t('scriptureMemory', 'upgrade', 'Upgrade')}
              </Button>
            )}
          </div>
        </div>
      )}
      
      {verseLimit === null || verseLimit === undefined && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 rounded-lg border border-green-200">
          <p className="text-sm font-medium text-green-800 flex items-center gap-2">
            <Crown className="h-4 w-4" />
            {t('scriptureMemory', 'unlimitedVersesPremium', '✨ Unlimited verses on your Premium plan')}
          </p>
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-purple-600" />
          {t('scriptureMemory', 'heading', 'Scripture Memory')}
        </h2>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button 
              disabled={verseLimit !== null && verseLimit !== undefined && cards.length >= verseLimit}
            >
              {verseLimit !== null && verseLimit !== undefined && cards.length >= verseLimit && (
                <Lock className="h-4 w-4 mr-2" />
              )}
              <Plus className="h-4 w-4 mr-2" />
              {t('scriptureMemory', 'addVerse', 'Add Verse')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('scriptureMemory', 'addScriptureDialogTitle', 'Add Scripture to Memory')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <p className="font-medium mb-1">{t('scriptureMemory', 'freeBibleApiTitle', '📖 Free Bible API')}</p>
                <p className="mb-2">{t('scriptureMemory', 'freeBibleApiDesc', 'Enter any scripture reference and click download to automatically fetch the verse. Works with all books and chapters - completely free, no setup required!')}</p>
                <p className="text-xs">{t('scriptureMemory', 'poweredBy', 'Powered by bible-api.com')}</p>
              </div>

              {/* Quick Select Popular Verses */}
              <div>
                <Label className="text-sm font-medium mb-2 block">{t('scriptureMemory', 'quickSelectPopular', 'Quick Select Popular Verses')}</Label>
                <div className="flex flex-wrap gap-2">
                  {popularVerses.map(verse => (
                    <Button
                      key={verse}
                      variant="outline"
                      size="sm"
                      onClick={() => handleQuickSelect(verse)}
                      className="text-xs hover:bg-purple-50 hover:border-purple-300"
                    >
                      {verse}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4 space-y-4">
                <Label className="text-sm font-medium">{t('scriptureMemory', 'orEnterReference', 'Or Enter Scripture Reference')}</Label>
                
                {/* Scripture Reference Input with Download Button */}
                <div className="space-y-2">
                  <Label>{t('scriptureMemory', 'scriptureReferenceLabel', 'Scripture Reference *')}</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder={t('scriptureMemory', 'referencePlaceholder', 'e.g., John 3:16, Romans 12:1-2')}
                      value={scriptureReference}
                      onChange={(e) => setScriptureReference(e.target.value)}
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !loadingScripture) {
                          handleLoadScripture();
                        }
                      }}
                    />
                    <Button
                      onClick={handleLoadScripture}
                      disabled={!scriptureReference.trim() || loadingScripture}
                      className="bg-blue-600 hover:bg-blue-700"
                      title={t('scriptureMemory', 'downloadScriptureTitle', 'Download scripture text')}
                    >
                      {loadingScripture ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    {t('scriptureMemory', 'referenceHint', 'Enter any scripture reference (e.g., John 3:16, Romans 12:1-2, Psalm 23:1-6) and click download')}
                  </p>
                </div>

                {/* Bible Version Selection */}
                <div>
                  <Label>{t('scriptureMemory', 'bibleVersionLabel', 'Bible Version *')}</Label>
                  <Select value={selectedVersion} onValueChange={handleVersionChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('scriptureMemory', 'selectVersionPlaceholder', 'Select version')} />
                    </SelectTrigger>
                    <SelectContent>
                      {bibleVersions.map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Scripture Text Display/Entry */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="font-medium">{t('scriptureMemory', 'scriptureTextLabel', 'Scripture Text *')}</Label>
                    {scriptureText && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        {t('scriptureMemory', 'textReady', 'Text Ready')}
                      </span>
                    )}
                  </div>
                  
                  <Textarea
                    placeholder={t('scriptureMemory', 'scriptureTextPlaceholder', 'Click the download button to automatically fetch any scripture verse from the Bible API, or manually enter/paste text here...')}
                    value={scriptureText}
                    onChange={(e) => setScriptureText(e.target.value)}
                    rows={5}
                    className="resize-none font-serif"
                  />
                  <p className="text-xs text-gray-500">
                    {t('scriptureMemory', 'editTextHint', 'You can edit the downloaded text or paste your own version')}
                  </p>
                </div>
              </div>

              <Button 
                onClick={addCard} 
                className="w-full bg-purple-600 hover:bg-purple-700" 
                disabled={loading || !scriptureReference.trim() || !scriptureText.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {t('scriptureMemory', 'adding', 'Adding...')}
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('scriptureMemory', 'addToMemoryCards', 'Add to Memory Cards')}
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 text-center bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
          <Brain className="h-8 w-8 mx-auto mb-2" />
          <p className="text-3xl font-bold">{cards.length}</p>
          <p className="text-sm opacity-80">{t('scriptureMemory', 'totalVerses', 'Total Verses')}</p>
        </Card>
        <Card className="p-4 text-center bg-gradient-to-br from-amber-500 to-orange-600 text-white">
          <Trophy className="h-8 w-8 mx-auto mb-2" />
          <p className="text-3xl font-bold">{totalMastered}</p>
          <p className="text-sm opacity-80">{t('scriptureMemory', 'masteredStat', 'Mastered')}</p>
        </Card>
      </div>

      {/* Review Button */}
      {cards.length > 0 && (
        <Button onClick={startReview} className="w-full py-6 text-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700">
          <Brain className="h-5 w-5 mr-2" />
          {t('scriptureMemory', 'startReviewSession', 'Start Review Session ({count} verses)').replace('{count}', String(cards.length))}
        </Button>
      )}

      {/* Cards List */}
      <div className="space-y-3">
        {cards.length === 0 ? (
          <Card className="p-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('scriptureMemory', 'noVersesYet', 'No Verses Yet')}</h3>
            <p className="text-gray-500 mb-4">{t('scriptureMemory', 'emptyStateDesc', 'Start building your scripture memory bank')}</p>
            <Button onClick={() => setShowAdd(true)} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="h-4 w-4 mr-2" />
              {t('scriptureMemory', 'addFirstVerse', 'Add Your First Verse')}
            </Button>
          </Card>
        ) : (
          cards.map(card => (
            <Card key={card.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className={`w-3 h-3 rounded-full mt-2 ${getMasteryColor(card.mastery_level)}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-purple-700">{card.reference}</p>
                    <span className="text-xs text-gray-400 uppercase">{card.translation}</span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 italic">"{card.verse_text}"</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span>{getMasteryLabel(card.mastery_level)}</span>
                    <span>{t('scriptureMemory', 'reviewedCount', 'Reviewed {count}x').replace('{count}', String(card.times_reviewed))}</span>
                    <span>{t('scriptureMemory', 'percentCorrect', '{percent}% correct').replace('{percent}', String(Math.round((card.times_correct / Math.max(card.times_reviewed, 1)) * 100)))}</span>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => deleteCard(card.id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
      {/* Upgrade Prompt */}
      <UpgradePromptModal
        prompt={activePrompt}
        onClose={dismissUpgradePrompt}
        onUpgrade={() => {}}
      />
    </div>
  );
}