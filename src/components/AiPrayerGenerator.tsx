// src/components/AIPrayerGenerator.tsx
import React, { useState } from 'react';
import { Heart, Loader2, Copy, Share2, BookOpen } from 'lucide-react';
import { canNativeShare } from '@/lib/webShare';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getSpiritualCompanion } from '@/lib/aiSpiritualCompanion';
import { useLanguage } from '@/contexts/LanguageContext';

const PRAYER_TOPICS = [
  { value: 'healing', label: 'Healing & Health' },
  { value: 'guidance', label: 'Guidance & Direction' },
  { value: 'strength', label: 'Strength & Courage' },
  { value: 'gratitude', label: 'Thanksgiving & Gratitude' },
  { value: 'forgiveness', label: 'Forgiveness & Restoration' },
  { value: 'protection', label: 'Protection & Safety' },
  { value: 'wisdom', label: 'Wisdom & Understanding' },
  { value: 'relationships', label: 'Relationships & Family' },
  { value: 'financial', label: 'Financial Provision' },
  { value: 'spiritual-growth', label: 'Spiritual Growth' },
  { value: 'breakthrough', label: 'Breakthrough & Victory' },
  { value: 'peace', label: 'Peace & Rest' },
];

export const AIPrayerGenerator: React.FC = () => {
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [specificNeeds, setSpecificNeeds] = useState<string>('');
  const [generatedPrayer, setGeneratedPrayer] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const { t, language } = useLanguage();

  const handleGeneratePrayer = async () => {
    if (!selectedTopic) {
      toast({
        title: t('aiPrayerGenerator', 'selectTopicTitle', 'Select a Topic'),
        description: t('aiPrayerGenerator', 'selectTopicDesc', 'Please choose a prayer topic'),
        variant: 'destructive'
      });
      return;
    }

    setIsGenerating(true);
    
    try {
      const companion = getSpiritualCompanion();
      const topicLabel = PRAYER_TOPICS.find(topic => topic.value === selectedTopic)?.label || selectedTopic;
      
      const prayer = await companion.generatePrayer(topicLabel, specificNeeds, language);
      setGeneratedPrayer(prayer);
      
      toast({
        title: t('aiPrayerGenerator', 'prayerGeneratedTitle', 'Prayer Generated'),
        description: t('aiPrayerGenerator', 'prayerGeneratedDesc', 'Your prayer has been crafted with Scripture')
      });
    } catch (error: any) {
      toast({
        title: t('aiPrayerGenerator', 'generationFailedTitle', 'Generation Failed'),
        description: error.message || t('aiPrayerGenerator', 'unableGenerate', 'Unable to generate prayer'),
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrayer);
      toast({
        title: t('aiPrayerGenerator', 'copiedTitle', 'Copied!'),
        description: t('aiPrayerGenerator', 'copiedDesc', 'Prayer copied to clipboard')
      });
    } catch (error) {
      toast({
        title: t('aiPrayerGenerator', 'copyFailedTitle', 'Copy Failed'),
        description: t('aiPrayerGenerator', 'copyFailedDesc', 'Unable to copy to clipboard'),
        variant: 'destructive'
      });
    }
  };

  const sharePrayer = async () => {
    if (canNativeShare()) {
      try {
        await navigator.share({
          title: t('aiPrayerGenerator', 'shareTitle', 'Prayer'),
          text: generatedPrayer
        });
      } catch (error) {
        // User cancelled share
      }
    } else {
      copyToClipboard();
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Card className="p-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center">
            <Heart className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold">{t('aiPrayerGenerator', 'heading', 'AI Prayer Generator')}</h2>
          <p className="text-gray-600">{t('aiPrayerGenerator', 'subheading', 'Scripture-rooted prayers for every situation')}</p>
        </div>

        {/* Prayer Topic Selection */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="topic">{t('aiPrayerGenerator', 'selectPrayerTopicLabel', 'Select Prayer Topic')}</Label>
            <Select value={selectedTopic} onValueChange={setSelectedTopic}>
              <SelectTrigger id="topic" className="mt-1">
                <SelectValue placeholder={t('aiPrayerGenerator', 'choosePrayerFocus', 'Choose a prayer focus...')} />
              </SelectTrigger>
              <SelectContent>
                {PRAYER_TOPICS.map(topic => (
                  <SelectItem key={topic.value} value={topic.value}>
                    {t('aiPrayerGenerator', `topic_${topic.value.replace(/-/g, '_')}`, topic.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="specifics">{t('aiPrayerGenerator', 'specificNeedsLabel', 'Specific Needs (Optional)')}</Label>
            <Textarea
              id="specifics"
              value={specificNeeds}
              onChange={(e) => setSpecificNeeds(e.target.value)}
              placeholder={t('aiPrayerGenerator', 'specificNeedsPlaceholder', "Share any specific details you'd like included in the prayer...")}
              className="mt-1 min-h-[100px]"
            />
          </div>

          <Button
            onClick={handleGeneratePrayer}
            disabled={isGenerating || !selectedTopic}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('aiPrayerGenerator', 'craftingPrayer', 'Crafting Prayer...')}
              </>
            ) : (
              <>
                <BookOpen className="w-4 h-4 mr-2" />
                {t('aiPrayerGenerator', 'generatePrayer', 'Generate Prayer')}
              </>
            )}
          </Button>
        </div>

        {/* Generated Prayer Display */}
        {generatedPrayer && (
          <div className="space-y-4 pt-4 border-t">
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Heart className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-purple-900">{t('aiPrayerGenerator', 'yourPrayer', 'Your Prayer')}</h3>
              </div>
              
              <div className="prose prose-sm max-w-none">
                <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {generatedPrayer}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                onClick={copyToClipboard}
                variant="outline"
                className="flex-1"
              >
                <Copy className="w-4 h-4 mr-2" />
                {t('aiPrayerGenerator', 'copyButton', 'Copy')}
              </Button>
              <Button
                onClick={sharePrayer}
                variant="outline"
                className="flex-1"
              >
                <Share2 className="w-4 h-4 mr-2" />
                {t('aiPrayerGenerator', 'shareButton', 'Share')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};