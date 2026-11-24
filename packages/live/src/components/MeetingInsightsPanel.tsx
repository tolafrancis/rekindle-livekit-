/**
 * MeetingInsightsPanel.tsx
 *
 * Structured AI meeting insights display panel.
 * Shows summary, key points, action items, decisions, open questions,
 * sentiment, key themes, and speaker breakdown.
 * Used by both MinistryInteractiveMeetings and LiveChannelInteractiveMeetings.
 */

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { Progress } from '@rekindle/ui/progress';
import {
  Sparkles, FileText, CheckSquare, Lightbulb,
  HelpCircle, BarChart3, Copy, Download, Share2,
  Loader2, Clock, Globe, TrendingUp, Users,
  ChevronRight, AlertCircle, Languages, ClipboardList
} from 'lucide-react';
import { toast } from '@rekindle/ui/toast-compat';
import { canNativeShare } from '@rekindle/features/webShare';
import {
  MeetingInsights,
  CleanedTranscript,
  generateMeetingInsights,
  generateMeetingNotes,
  downloadMeetingNotesAsDoc,
  downloadInsightsAsTxt,
  downloadInsightsAsJson,
  downloadTranscriptAsTxt,
} from '@rekindle/features/meetingAIEngine';
import { meetingNotesToHtml, meetingNotesToPlainText } from '@rekindle/features/meetingNotesFormat';

// ── Types ─────────────────────────────────────────────────────────────────

interface MeetingInsightsPanelProps {
  meetingTitle: string;
  meetingId: string;
  cleaned: CleanedTranscript | null;
  existingInsights?: MeetingInsights | null; // Pre-loaded from DB
  onInsightsGenerated?: (insights: MeetingInsights) => void;
  /** Shown on the report, e.g. "6 November 2026". Defaults to today. */
  meetingDate?: string;
}

// ── Sentiment display ─────────────────────────────────────────────────────

const SentimentBadge: React.FC<{ sentiment: MeetingInsights['sentiment'] }> = ({ sentiment }) => {
  const config = {
    positive: { label: 'Positive', className: 'bg-green-100 text-green-700 border-green-300' },
    neutral:  { label: 'Neutral',  className: 'bg-gray-100 text-gray-700 border-gray-300' },
    mixed:    { label: 'Mixed',    className: 'bg-amber-100 text-amber-700 border-amber-300' },
    negative: { label: 'Negative', className: 'bg-red-100 text-red-700 border-red-300' },
  }[sentiment] ?? { label: 'Neutral', className: 'bg-gray-100 text-gray-700 border-gray-300' };

  return (
    <Badge variant="outline" className={`text-xs ${config.className}`}>
      {config.label}
    </Badge>
  );
};

// ── Language names ─────────────────────────────────────────────────────────

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', es: 'Spanish', de: 'German',
  pt: 'Portuguese', yo: 'Yoruba', sw: 'Swahili', ha: 'Hausa',
  ig: 'Igbo', ar: 'Arabic', hi: 'Hindi', zh: 'Chinese',
  ru: 'Russian', it: 'Italian', nl: 'Dutch',
};

function getLangName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

// ── Main Component ─────────────────────────────────────────────────────────

const MeetingInsightsPanel: React.FC<MeetingInsightsPanelProps> = ({
  meetingTitle,
  meetingId,
  cleaned,
  existingInsights,
  onInsightsGenerated,
  meetingDate,
}) => {
  const [insights, setInsights] = useState<MeetingInsights | null>(existingInsights ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState('');
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const [showOriginalLang, setShowOriginalLang] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const notesHtml = useMemo(
    () => (insights?.meetingNotes ? meetingNotesToHtml(insights.meetingNotes) : ''),
    [insights?.meetingNotes],
  );

  // Insights saved before detailed notes existed have no meetingNotes; this
  // writes just the notes and keeps the rest of the insights as they are.
  const handleGenerateNotes = async () => {
    if (!insights) return;
    if (!cleaned || cleaned.lines.length === 0) {
      toast.error('No transcript available for this meeting.');
      return;
    }
    setIsGeneratingNotes(true);
    try {
      const notes = await generateMeetingNotes(cleaned, meetingTitle, { meetingDate });
      if (!notes) throw new Error('empty notes');
      const next = { ...insights, meetingNotes: notes };
      setInsights(next);
      onInsightsGenerated?.(next);
      toast.success('Meeting notes created');
    } catch (err) {
      console.error('Error generating meeting notes:', err);
      toast.error('Could not create meeting notes. Please try again.');
    } finally {
      setIsGeneratingNotes(false);
    }
  };

  const handleCopyNotes = () => {
    if (!insights?.meetingNotes) return;
    navigator.clipboard.writeText(meetingNotesToPlainText(insights.meetingNotes));
    toast.success('Meeting notes copied');
  };

  const handleGenerateInsights = async () => {
    if (!cleaned || cleaned.lines.length === 0) {
      toast.error('No transcript available. Please transcribe the meeting first.');
      return;
    }

    setIsGenerating(true);
    setGeneratingProgress(10);
    setGeneratingStep('Analyzing transcript…');

    try {
      setGeneratingProgress(30);
      setGeneratingStep('Detecting language and structure…');

      setGeneratingProgress(55);
      setGeneratingStep('Generating insights with AI…');

      setGeneratingStep('Writing detailed meeting notes and insights…');
      const result = await generateMeetingInsights(cleaned, meetingTitle, { meetingDate });

      setGeneratingProgress(90);
      setGeneratingStep('Finalizing…');

      setInsights(result);
      onInsightsGenerated?.(result);
      setGeneratingProgress(100);

      toast.success('Meeting insights generated!');
    } catch (err) {
      console.error('Error generating insights:', err);
      toast.error('Failed to generate insights. Please try again.');
    } finally {
      setIsGenerating(false);
      setGeneratingStep('');
      setGeneratingProgress(0);
    }
  };

  const handleCopySummary = () => {
    if (!insights) return;
    const text = showOriginalLang && insights.summaryOriginal
      ? insights.summaryOriginal
      : insights.summaryEnglish;
    navigator.clipboard.writeText(text);
    toast.success('Summary copied');
  };

  const handleCopyAll = () => {
    if (!insights) return;
    const lines = [
      `Meeting: ${meetingTitle}`,
      '',
      ...(insights.meetingNotes ? ['MEETING NOTES', meetingNotesToPlainText(insights.meetingNotes), ''] : []),
      'SUMMARY',
      insights.summaryEnglish,
      '',
      'KEY POINTS',
      ...insights.keyPoints.map((p, i) => `${i + 1}. ${p}`),
      '',
      'ACTION ITEMS',
      ...insights.actionItems.map(a => {
        const owner = a.owner ? ` (${a.owner})` : '';
        const deadline = a.deadline ? ` — ${a.deadline}` : '';
        return `• ${a.text}${owner}${deadline}`;
      }),
      '',
      'DECISIONS',
      ...insights.decisions.map((d, i) => `${i + 1}. ${d}`),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    toast.success('Full insights copied');
  };

  const handleShare = () => {
    if (!insights) return;
    const text = `Meeting Insights: ${meetingTitle}\n\n${insights.summaryEnglish}\n\nKey themes: ${insights.keyThemes.join(', ')}`;
    if (canNativeShare()) {
      navigator.share({ title: `Insights: ${meetingTitle}`, text });
    } else {
      navigator.clipboard.writeText(text);
      toast.success('Insights copied for sharing');
    }
  };

  // ── No insights yet UI ──────────────────────────────────────────────────

  if (!insights) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            Meeting Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isGenerating ? (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
                <p className="text-sm text-gray-600">{generatingStep}</p>
              </div>
              <Progress value={generatingProgress} className="h-2" />
              <p className="text-xs text-gray-400">
                Writing detailed notes — this can take up to a minute for longer sessions
              </p>
            </div>
          ) : (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto">
                <Sparkles className="h-8 w-8 text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">AI-Powered Meeting Analysis</h3>
                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                  Generate detailed meeting notes plus a summary, action items,
                  decisions, key themes, and speaker breakdown.
                </p>
              </div>

              {!cleaned || cleaned.lines.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 max-w-sm mx-auto">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Transcribe the meeting first to generate insights.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 max-w-sm mx-auto">
                    <FileText className="h-4 w-4 shrink-0" />
                    <span>{cleaned.lines.length} transcript lines ready • {getLangName(cleaned.dominantLanguage)}</span>
                  </div>
                  <Button
                    onClick={handleGenerateInsights}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Insights
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Insights display ───────────────────────────────────────────────────

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              Meeting Insights
            </CardTitle>
            <SentimentBadge sentiment={insights.sentiment} />
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <Globe className="h-3 w-3" />
              {getLangName(insights.dominantLanguage)}
            </Badge>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleCopyAll} title="Copy all insights">
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => insights && downloadInsightsAsTxt(insights, meetingTitle)}
              title="Download as text"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => insights && downloadInsightsAsJson(insights, meetingTitle)}
              title="Download as JSON"
            >
              <FileText className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleShare} title="Share insights">
              <Share2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGenerateInsights}
              disabled={isGenerating}
              title="Regenerate insights"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Key themes chips */}
        {insights.keyThemes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {insights.keyThemes.map((theme, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="text-xs bg-purple-50 text-purple-700 border-purple-200"
              >
                {theme}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-gray-100 p-1 rounded-lg mb-4">
            <TabsTrigger value="summary" className="text-xs flex items-center gap-1 data-[state=active]:bg-white">
              <FileText className="h-3 w-3" />
              Summary
            </TabsTrigger>
            <TabsTrigger value="keypoints" className="text-xs flex items-center gap-1 data-[state=active]:bg-white">
              <Lightbulb className="h-3 w-3" />
              Key Points
              {insights.keyPoints.length > 0 && (
                <span className="bg-purple-100 text-purple-700 text-xs px-1 rounded">{insights.keyPoints.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="actions" className="text-xs flex items-center gap-1 data-[state=active]:bg-white">
              <CheckSquare className="h-3 w-3" />
              Actions
              {insights.actionItems.length > 0 && (
                <span className="bg-purple-100 text-purple-700 text-xs px-1 rounded">{insights.actionItems.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="decisions" className="text-xs flex items-center gap-1 data-[state=active]:bg-white">
              <ChevronRight className="h-3 w-3" />
              Decisions
            </TabsTrigger>
            <TabsTrigger value="questions" className="text-xs flex items-center gap-1 data-[state=active]:bg-white">
              <HelpCircle className="h-3 w-3" />
              Questions
            </TabsTrigger>
            <TabsTrigger value="speakers" className="text-xs flex items-center gap-1 data-[state=active]:bg-white">
              <Users className="h-3 w-3" />
              Speakers
            </TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-3 mt-0">
            {insights.summaryOriginal && (
              <div className="flex items-center gap-2">
                <Button
                  variant={showOriginalLang ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => setShowOriginalLang(false)}
                  className={!showOriginalLang ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}
                >
                  English
                </Button>
                <Button
                  variant={showOriginalLang ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowOriginalLang(true)}
                  className={showOriginalLang ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}
                >
                  <Languages className="h-3 w-3 mr-1" />
                  {getLangName(insights.dominantLanguage)}
                </Button>
              </div>
            )}

            <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
              <p className="text-sm leading-relaxed text-gray-800">
                {showOriginalLang && insights.summaryOriginal
                  ? insights.summaryOriginal
                  : insights.summaryEnglish}
              </p>
            </div>

            <Button variant="ghost" size="sm" onClick={handleCopySummary} className="text-gray-500">
              <Copy className="h-3 w-3 mr-1" />
              Copy summary
            </Button>

            {/* Detailed meeting notes: the full report (overview, topic
                sections, tables, action items with owners). */}
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-purple-500" />
                  Meeting notes
                </h4>
                {insights.meetingNotes && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={handleCopyNotes} className="text-gray-500 text-xs">
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => insights.meetingNotes && downloadMeetingNotesAsDoc(insights.meetingNotes, meetingTitle)}
                      className="text-xs"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download report
                    </Button>
                  </div>
                )}
              </div>

              {insights.meetingNotes ? (
                <div
                  className={[
                    'rounded-lg border border-gray-200 bg-white p-4 text-sm leading-relaxed text-gray-800',
                    '[&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mb-1',
                    '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-purple-800 [&_h2]:mt-5 [&_h2]:mb-1.5',
                    '[&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1',
                    '[&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5',
                    '[&_li]:my-1 [&_li_ul]:list-[circle] [&_strong]:font-semibold [&_hr]:my-3',
                    '[&_table]:w-full [&_table]:my-2 [&_table]:border-collapse [&_table]:text-xs',
                    '[&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left',
                    '[&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top',
                    'overflow-x-auto',
                  ].join(' ')}
                  // Safe: meetingNotesToHtml escapes all text before adding markup.
                  dangerouslySetInnerHTML={{ __html: notesHtml }}
                />
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center space-y-2">
                  <p className="text-sm text-gray-600">
                    Create a detailed report of this meeting: overview, each topic discussed, plans and action items with owners.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleGenerateNotes}
                    disabled={isGeneratingNotes || !cleaned || cleaned.lines.length === 0}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {isGeneratingNotes ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ClipboardList className="h-4 w-4 mr-2" />
                    )}
                    {isGeneratingNotes ? 'Writing notes…' : 'Create meeting notes'}
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-500 pt-1 border-t border-gray-100">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Processed in {(insights.processingDurationMs / 1000).toFixed(1)}s
              </span>
              <span className="flex items-center gap-1">
                <BarChart3 className="h-3 w-3" />
                Sentiment: {insights.sentiment}
              </span>
            </div>
          </TabsContent>

          {/* Key Points Tab */}
          <TabsContent value="keypoints" className="mt-0">
            {insights.keyPoints.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No key points identified</p>
            ) : (
              <ul className="space-y-2">
                {insights.keyPoints.map((point, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="w-5 h-5 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-gray-800 leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          {/* Action Items Tab */}
          <TabsContent value="actions" className="mt-0">
            {insights.actionItems.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No action items identified</p>
            ) : (
              <div className="space-y-2">
                {insights.actionItems.map((item, i) => (
                  <div
                    key={i}
                    className="flex gap-3 items-start bg-gray-50 border border-gray-200 rounded-lg p-3"
                  >
                    <CheckSquare className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-relaxed">{item.text}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {item.owner && (
                          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5">
                            <Users className="h-3 w-3 inline mr-1" />
                            {item.owner}
                          </span>
                        )}
                        {item.deadline && (
                          <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded px-2 py-0.5">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {item.deadline}
                          </span>
                        )}
                        {!item.owner && !item.deadline && (
                          <span className="text-xs text-gray-400">No owner/deadline specified</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Decisions Tab */}
          <TabsContent value="decisions" className="mt-0">
            {insights.decisions.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No decisions recorded</p>
            ) : (
              <ul className="space-y-2">
                {insights.decisions.map((decision, i) => (
                  <li key={i} className="flex gap-3 text-sm items-start">
                    <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                    <span className="text-gray-800 leading-relaxed">{decision}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          {/* Open Questions Tab */}
          <TabsContent value="questions" className="mt-0">
            {insights.openQuestions.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No open questions</p>
            ) : (
              <ul className="space-y-2">
                {insights.openQuestions.map((q, i) => (
                  <li key={i} className="flex gap-3 text-sm items-start bg-amber-50 border border-amber-100 rounded-lg p-3">
                    <HelpCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-gray-800 leading-relaxed">{q}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          {/* Speakers Tab */}
          <TabsContent value="speakers" className="mt-0">
            {insights.speakerInsights.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No speaker data available</p>
            ) : (
              <div className="space-y-3">
                {insights.speakerInsights
                  .sort((a, b) => b.wordCount - a.wordCount)
                  .map((speaker, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-900">{speaker.speaker}</span>
                        <span className="text-gray-500 text-xs">
                          {speaker.wordCount.toLocaleString()} words
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={speaker.contributionPercent}
                          className="h-2 flex-1"
                        />
                        <span className="text-xs text-gray-500 w-10 text-right">
                          {speaker.contributionPercent}%
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Download buttons */}
        <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-gray-100 mt-4">
          {insights.meetingNotes && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => insights.meetingNotes && downloadMeetingNotesAsDoc(insights.meetingNotes, meetingTitle)}
              className="text-xs"
            >
              <Download className="h-3 w-3 mr-1" />
              Report
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadInsightsAsTxt(insights, meetingTitle)}
            className="text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            .txt
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadInsightsAsJson(insights, meetingTitle)}
            className="text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            .json
          </Button>
          {cleaned && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => cleaned && downloadTranscriptAsTxt(cleaned, meetingTitle)}
              className="text-xs"
            >
              <FileText className="h-3 w-3 mr-1" />
              Transcript
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MeetingInsightsPanel;
