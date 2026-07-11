// src/components/AIScriptureGuidance.tsx
import React, { useState } from 'react';
import { BookOpen, Loader2, Heart, Lightbulb, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { getSpiritualCompanion } from '@/lib/aiSpiritualCompanion';

interface ScriptureGuidance {
  scripture: string;
  reference: string;
  application: string;
}

export const AIScriptureGuidance: React.FC = () => {
  const [situation, setSituation] = useState<string>('');
  const [guidance, setGuidance] = useState<ScriptureGuidance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { t, language } = useLanguage();

  const handleGetGuidance = async () => {
    if (!situation.trim()) {
      toast({
        title: t('aiScriptureGuidance', 'describeSituationTitle', 'Describe Your Situation'),
        description: t('aiScriptureGuidance', 'describeSituationDesc', 'Please share what you\'re going through'),
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const companion = getSpiritualCompanion();
      const scriptureGuidance = await companion.getScriptureGuidance(situation, language);
      setGuidance(scriptureGuidance);
      
      toast({
        title: t('aiScriptureGuidance', 'scriptureFoundTitle', 'Scripture Found'),
        description: t('aiScriptureGuidance', 'scriptureFoundDesc', 'God\'s Word speaks to your situation')
      });
    } catch (error: any) {
      toast({
        title: t('aiScriptureGuidance', 'searchFailedTitle', 'Search Failed'),
        description: error.message || t('aiScriptureGuidance', 'unableToFindGuidance', 'Unable to find guidance'),
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyGuidance = async () => {
    if (!guidance) return;
    
    const text = `${guidance.scripture}\n- ${guidance.reference}\n\n${guidance.application}`;
    
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: t('aiScriptureGuidance', 'copiedTitle', 'Copied!'),
        description: t('aiScriptureGuidance', 'copiedDesc', 'Scripture guidance copied to clipboard')
      });
    } catch (error) {
      toast({
        title: t('aiScriptureGuidance', 'copyFailedTitle', 'Copy Failed'),
        description: t('aiScriptureGuidance', 'copyFailedDesc', 'Unable to copy to clipboard'),
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Card className="p-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold">{t('aiScriptureGuidance', 'heading', 'Scripture Guidance')}</h2>
          <p className="text-gray-600">{t('aiScriptureGuidance', 'subheading', 'Find God\'s Word for your situation')}</p>
        </div>

        {/* Situation Input */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="situation">{t('aiScriptureGuidance', 'situationLabel', 'What are you facing?')}</Label>
            <Textarea
              id="situation"
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              placeholder={t('aiScriptureGuidance', 'situationPlaceholder', 'Describe your situation, challenge, or question. The AI will find relevant Scripture and provide biblical guidance...')}
              className="mt-1 min-h-[120px]"
            />
            <p className="text-xs text-gray-500 mt-2">
              {t('aiScriptureGuidance', 'situationExamples', 'Examples: "I\'m struggling with anxiety", "Making a difficult decision", "Dealing with a broken relationship"')}
            </p>
          </div>

          <Button
            onClick={handleGetGuidance}
            disabled={isLoading || !situation.trim()}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('aiScriptureGuidance', 'searchingScripture', 'Searching Scripture...')}
              </>
            ) : (
              <>
                <BookOpen className="w-4 h-4 mr-2" />
                {t('aiScriptureGuidance', 'getGuidanceButton', 'Get Scripture Guidance')}
              </>
            )}
          </Button>
        </div>

        {/* Guidance Display */}
        {guidance && (
          <div className="space-y-6 pt-4 border-t">
            {/* Scripture Verse */}
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-purple-600" />
                  <h3 className="font-semibold text-purple-900">{t('aiScriptureGuidance', 'godsWord', 'God\'s Word')}</h3>
                </div>
                <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                  {guidance.reference}
                </Badge>
              </div>
              
              <blockquote className="text-lg italic text-gray-800 leading-relaxed border-l-4 border-purple-400 pl-4">
                "{guidance.scripture}"
              </blockquote>
            </div>

            {/* Application */}
            <div className="bg-white rounded-lg p-6 border-2 border-purple-100">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold text-gray-900">{t('aiScriptureGuidance', 'howThisApplies', 'How This Applies')}</h3>
              </div>
              
              <div className="prose prose-sm max-w-none">
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {guidance.application}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={copyGuidance}
                variant="outline"
                className="flex-1"
              >
                <Copy className="w-4 h-4 mr-2" />
                {t('aiScriptureGuidance', 'copyGuidanceButton', 'Copy Guidance')}
              </Button>
              <Button
                onClick={() => {
                  setGuidance(null);
                  setSituation('');
                }}
                variant="outline"
                className="flex-1"
              >
                {t('aiScriptureGuidance', 'newSearchButton', 'New Search')}
              </Button>
            </div>
          </div>
        )}

        {/* Encouragement Footer */}
        <div className="pt-4 border-t text-center">
          <p className="text-sm text-gray-600 italic">
            {t('aiScriptureGuidance', 'footerVerse', '"Your word is a lamp to my feet and a light to my path" - Psalm 119:105')}
          </p>
        </div>
      </Card>
    </div>
  );
};
