/**
 * MeetingTranscriptionPanel.tsx
 *
 * Real-time meeting transcription panel using the browser Web Speech API.
 * Supports multilingual detection, speaker labels, and post-session AI cleaning.
 * Used by both MinistryInteractiveMeetings and LiveChannelInteractiveMeetings.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { ScrollArea } from '@rekindle/ui/scroll-area';
import { Switch } from '@rekindle/ui/switch';
import { Label } from '@rekindle/ui/label';
import { Progress } from '@rekindle/ui/progress';
import {
  Mic, MicOff, Languages, Loader2, AlertCircle,
  Copy, Download, FileText, Sparkles, ChevronDown,
  CheckCircle2, Globe, X
} from 'lucide-react';
import { toast } from 'sonner';
import {
  TranscriptLine,
  RawTranscript,
  CleanedTranscript,
  processTranscript,
  downloadTranscriptAsTxt,
  formatTranscriptToText,
} from '@rekindle/features/meetingAIEngine';

// ── Types ─────────────────────────────────────────────────────────────────

interface MeetingTranscriptionPanelProps {
  speakerName: string;           // Current user's display name
  meetingTitle: string;
  isHost: boolean;
  sessionStartTime: number | null; // Unix ms when session started
  onTranscriptReady?: (raw: RawTranscript) => void;
  onCleanedReady?: (cleaned: CleanedTranscript) => void;
  compact?: boolean; // Mini mode for use inside the video call overlay
}

// ── Web Speech API types ───────────────────────────────────────────────────

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionError extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionError) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

// ── Language names ─────────────────────────────────────────────────────────

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', es: 'Spanish', de: 'German',
  pt: 'Portuguese', yo: 'Yoruba', sw: 'Swahili', ha: 'Hausa',
  ig: 'Igbo', ar: 'Arabic', hi: 'Hindi', zh: 'Chinese',
  ru: 'Russian', it: 'Italian', nl: 'Dutch', ko: 'Korean',
  ja: 'Japanese', tr: 'Turkish', pl: 'Polish', uk: 'Ukrainian',
};

function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

// ── Component ─────────────────────────────────────────────────────────────

const MeetingTranscriptionPanel: React.FC<MeetingTranscriptionPanelProps> = ({
  speakerName,
  meetingTitle,
  isHost,
  sessionStartTime,
  onTranscriptReady,
  onCleanedReady,
  compact = false,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [liveLines, setLiveLines] = useState<TranscriptLine[]>([]);
  const [interimText, setInterimText] = useState('');
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleaningProgress, setCleaningProgress] = useState(0);
  const [cleaned, setCleaned] = useState<CleanedTranscript | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isExpanded, setIsExpanded] = useState(!compact);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isListeningRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check browser support
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setIsSupported(false);
    }
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveLines, interimText, autoScroll]);

  const getElapsedSeconds = useCallback((): number => {
    if (!sessionStartTime) return Math.floor(Date.now() / 1000);
    return Math.floor((Date.now() - sessionStartTime) / 1000);
  }, [sessionStartTime]);

  const initRecognition = useCallback(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return null;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = ''; // Auto-detect

    recognition.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) {
            const newLine: TranscriptLine = {
              speaker: speakerName,
              text,
              timestamp: getElapsedSeconds(),
            };
            setLiveLines(prev => [...prev, newLine]);
          }
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimText(interim);
    };

    recognition.onerror = (event: SpeechRecognitionError) => {
      if (event.error === 'no-speech') return; // Normal, just silence
      if (event.error === 'aborted') return;
      console.warn('[MeetingTranscriptionPanel] Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        toast.error('Microphone access denied. Please allow microphone access for transcription.');
        setIsListening(false);
        isListeningRef.current = false;
      }
    };

    recognition.onend = () => {
      setInterimText('');
      // Auto-restart if still supposed to be listening
      if (isListeningRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (isListeningRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {
              // Already started
            }
          }
        }, 300);
      } else {
        setIsListening(false);
      }
    };

    return recognition;
  }, [speakerName, getElapsedSeconds]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      toast.error('Live transcription is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    const recognition = initRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;
    isListeningRef.current = true;

    try {
      recognition.start();
      toast.success('Live transcription started');
    } catch (err) {
      console.error('Error starting recognition:', err);
      toast.error('Failed to start transcription');
    }
  }, [isSupported, initRecognition]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText('');

    // Notify parent
    if (liveLines.length > 0 && onTranscriptReady) {
      const uniqueLangs = [...new Set(liveLines.map(l => l.language).filter(Boolean))] as string[];
      onTranscriptReady({
        lines: liveLines,
        durationSeconds: getElapsedSeconds(),
        detectedLanguages: uniqueLangs,
      });
    }
  }, [liveLines, onTranscriptReady, getElapsedSeconds]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const handleCleanTranscript = async () => {
    if (liveLines.length === 0) {
      toast.error('No transcript to clean yet.');
      return;
    }

    setIsCleaning(true);
    setCleaningProgress(10);

    try {
      setCleaningProgress(30);
      const raw: RawTranscript = {
        lines: liveLines,
        durationSeconds: getElapsedSeconds(),
        detectedLanguages: [],
      };

      setCleaningProgress(60);
      const result = await processTranscript(raw);
      setCleaningProgress(90);

      setCleaned(result);
      setDetectedLanguage(result.dominantLanguage);
      onCleanedReady?.(result);
      setCleaningProgress(100);

      toast.success(`Transcript cleaned. Language: ${getLanguageName(result.dominantLanguage)}`);
    } catch (err) {
      console.error('Error cleaning transcript:', err);
      toast.error('Failed to clean transcript. Please try again.');
    } finally {
      setIsCleaning(false);
    }
  };

  const handleCopyTranscript = () => {
    const lines = cleaned?.lines ?? liveLines;
    const text = formatTranscriptToText(lines);
    navigator.clipboard.writeText(text);
    toast.success('Transcript copied to clipboard');
  };

  const handleDownload = () => {
    const lines = cleaned?.lines ?? liveLines;
    const cleanedObj: CleanedTranscript = cleaned ?? {
      lines,
      dominantLanguage: detectedLanguage ?? 'en',
      isMixedLanguage: false,
    };
    downloadTranscriptAsTxt(cleanedObj, meetingTitle);
  };

  const displayLines = showTranslation && cleaned?.translatedLines?.length
    ? cleaned.translatedLines
    : (cleaned?.lines ?? liveLines);

  const hasContent = liveLines.length > 0 || interimText.length > 0;

  if (compact && !isExpanded) {
    return (
      <div className="flex items-center gap-2 bg-gray-900/80 backdrop-blur-sm rounded-lg px-3 py-2">
        <FileText className="h-4 w-4 text-gray-300" />
        <span className="text-sm text-gray-300">Transcript</span>
        {isListening && (
          <Badge className="bg-red-500 text-white text-xs border-0 animate-pulse">
            Live
          </Badge>
        )}
        {liveLines.length > 0 && (
          <span className="text-xs text-gray-400">{liveLines.length} lines</span>
        )}
        <button
          onClick={() => setIsExpanded(true)}
          className="ml-auto text-gray-400 hover:text-white transition-colors"
        >
          <ChevronDown className="h-4 w-4 rotate-180" />
        </button>
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-purple-500" />
              Live Transcript
            </CardTitle>
            {isListening && (
              <Badge className="bg-red-500 text-white border-0 text-xs animate-pulse">
                <span className="w-1.5 h-1.5 bg-white rounded-full mr-1" />
                Recording
              </Badge>
            )}
            {detectedLanguage && (
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <Globe className="h-3 w-3" />
                {getLanguageName(detectedLanguage)}
              </Badge>
            )}
            {cleaned?.isMixedLanguage && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                <Languages className="h-3 w-3 mr-1" />
                Mixed
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {compact && (
              <button
                onClick={() => setIsExpanded(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Not supported warning */}
        {!isSupported && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Live transcription requires Chrome or Edge browser.
              You can still generate summaries after the session.
            </AlertDescription>
          </Alert>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={isListening ? stopListening : startListening}
            disabled={!isSupported}
            size="sm"
            variant={isListening ? 'destructive' : 'default'}
            className={isListening ? '' : 'bg-purple-600 hover:bg-purple-700'}
          >
            {isListening ? (
              <><MicOff className="h-4 w-4 mr-1" /> Stop</>
            ) : (
              <><Mic className="h-4 w-4 mr-1" /> Start Transcribing</>
            )}
          </Button>

          {hasContent && !isListening && (
            <Button
              onClick={handleCleanTranscript}
              disabled={isCleaning}
              size="sm"
              variant="outline"
              className="border-purple-300 text-purple-700"
            >
              {isCleaning ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Cleaning…</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-1" /> AI Clean</>
              )}
            </Button>
          )}

          {hasContent && (
            <>
              <Button onClick={handleCopyTranscript} size="sm" variant="ghost">
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
              <Button onClick={handleDownload} size="sm" variant="ghost">
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            </>
          )}

          {cleaned?.translatedLines && cleaned.translatedLines.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <Label htmlFor="show-translation" className="text-xs text-gray-600">
                Show English
              </Label>
              <Switch
                id="show-translation"
                checked={showTranslation}
                onCheckedChange={setShowTranslation}
              />
            </div>
          )}
        </div>

        {/* Cleaning progress */}
        {isCleaning && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500">AI cleaning transcript…</p>
            <Progress value={cleaningProgress} className="h-1" />
          </div>
        )}

        {/* Auto-scroll toggle */}
        {hasContent && (
          <div className="flex items-center gap-2">
            <Switch
              id="auto-scroll"
              checked={autoScroll}
              onCheckedChange={setAutoScroll}
              className="h-4 w-7"
            />
            <Label htmlFor="auto-scroll" className="text-xs text-gray-500">Auto-scroll</Label>
            <span className="text-xs text-gray-400 ml-auto">{liveLines.length} lines</span>
          </div>
        )}

        {/* Transcript display */}
        {hasContent ? (
          <div
            ref={scrollRef}
            className="h-64 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2 text-sm font-mono"
          >
            {displayLines.map((line, i) => {
              const mm = Math.floor(line.timestamp / 60).toString().padStart(2, '0');
              const ss = Math.floor(line.timestamp % 60).toString().padStart(2, '0');
              return (
                <div key={i} className="flex gap-2 leading-relaxed">
                  <span className="text-gray-400 shrink-0 text-xs pt-0.5">[{mm}:{ss}]</span>
                  <span className="text-purple-700 font-medium shrink-0">{line.speaker}:</span>
                  <span className="text-gray-800">{line.text}</span>
                </div>
              );
            })}

            {/* Interim (live typing) */}
            {interimText && (
              <div className="flex gap-2 leading-relaxed opacity-60 italic">
                <span className="text-gray-400 shrink-0 text-xs pt-0.5">…</span>
                <span className="text-purple-600 font-medium shrink-0">{speakerName}:</span>
                <span className="text-gray-600">{interimText}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="h-40 flex flex-col items-center justify-center border border-dashed border-gray-200 rounded-lg text-gray-400">
            <FileText className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">
              {isListening ? 'Listening… start speaking' : 'Click "Start Transcribing" to begin'}
            </p>
          </div>
        )}

        {/* Cleaned indicator */}
        {cleaned && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Transcript cleaned • {getLanguageName(cleaned.dominantLanguage)}
              {cleaned.isMixedLanguage ? ' (mixed)' : ''}
              {cleaned.translatedLines?.length ? ' • English translation available' : ''}
            </span>
          </div>
        )}

        {/* Slash commands hint */}
        <p className="text-xs text-gray-400">
          Tip: type <code className="bg-gray-100 px-1 rounded">/transcribe</code> in chat to start,{' '}
          <code className="bg-gray-100 px-1 rounded">/summarize</code> to generate insights
        </p>
      </CardContent>
    </Card>
  );
};

export default MeetingTranscriptionPanel;
