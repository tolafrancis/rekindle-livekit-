/**
 * MeetingAIEngine.ts
 *
 * Shared AI pipeline for meeting recording, transcription,
 * multilingual support, and structured summarization.
 * Used by both MinistryInteractiveMeetings and LiveChannelInteractiveMeetings.
 *
 * All AI calls go through the `meeting-ai` Supabase edge function (OpenAI
 * gpt-4o-mini), which holds OPENAI_API_KEY server-side. The client never talks to
 * a model provider directly.
 * No hallucination: if information is missing, fields are null or empty arrays.
 */

import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TranscriptLine {
  speaker: string;
  text: string;
  timestamp: number; // seconds from session start
  language?: string;
}

export interface RawTranscript {
  lines: TranscriptLine[];
  durationSeconds: number;
  detectedLanguages: string[];
}

export interface CleanedTranscript {
  lines: TranscriptLine[];
  dominantLanguage: string;
  isMixedLanguage: boolean;
  translatedLines?: TranscriptLine[]; // English translation if original is non-English
}

export interface ActionItem {
  text: string;
  owner: string | null;
  deadline: string | null;
}

export interface SpeakerInsight {
  speaker: string;
  wordCount: number;
  contributionPercent: number;
  keyTopics: string[];
}

export interface MeetingInsights {
  summaryEnglish: string;
  summaryOriginal: string | null; // null if original was English
  keyPoints: string[];
  actionItems: ActionItem[];
  decisions: string[];
  openQuestions: string[];
  sentiment: 'positive' | 'neutral' | 'mixed' | 'negative';
  keyThemes: string[];
  speakerInsights: SpeakerInsight[];
  dominantLanguage: string;
  processingDurationMs: number;
}

export type SlashCommand = '/record' | '/transcribe' | '/summarize';

// ── Constants ──────────────────────────────────────────────────────────────

const CHUNK_DURATION_SECONDS = 180; // 3-minute chunks for long sessions
const CHUNK_OVERLAP_SECONDS = 20;   // overlap to preserve context at boundaries

// ── Internal helper ────────────────────────────────────────────────────────

/**
 * All AI calls go through the `meeting-ai` edge function (OpenAI gpt-4o-mini),
 * which holds OPENAI_API_KEY server-side.
 *
 * This previously fetched api.anthropic.com straight from the browser with no
 * API key and no CORS allowance, so every AI step failed. Never call a model
 * provider from the client: the key would be exposed, and browsers block it.
 */
async function callAI(systemPrompt: string, userContent: string, maxTokens = 1000): Promise<string> {
  const { data, error } = await supabase.functions.invoke('meeting-ai', {
    body: { system: systemPrompt, user: userContent, maxTokens },
  });
  if (error) throw new Error(`meeting-ai failed: ${error.message}`);
  if (data?.error) throw new Error(`meeting-ai: ${data.error}`);
  if (typeof data?.text !== 'string') throw new Error('No text in meeting-ai response');
  return data.text;
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

// ── Transcript line formatter ──────────────────────────────────────────────

export function formatTranscriptToText(lines: TranscriptLine[]): string {
  return lines
    .map(l => {
      const mm = Math.floor(l.timestamp / 60).toString().padStart(2, '0');
      const ss = Math.floor(l.timestamp % 60).toString().padStart(2, '0');
      return `[${mm}:${ss}] ${l.speaker}: ${l.text}`;
    })
    .join('\n');
}

// ── Chunking ──────────────────────────────────────────────────────────────

function chunkTranscript(lines: TranscriptLine[]): TranscriptLine[][] {
  if (lines.length === 0) return [];

  const chunks: TranscriptLine[][] = [];
  let chunkStart = 0;

  while (chunkStart < lines.length) {
    const startTime = lines[chunkStart].timestamp;
    const chunkEnd = startTime + CHUNK_DURATION_SECONDS;

    // Find last line in this window
    let endIdx = chunkStart;
    while (endIdx < lines.length - 1 && lines[endIdx + 1].timestamp < chunkEnd) {
      endIdx++;
    }

    chunks.push(lines.slice(chunkStart, endIdx + 1));

    // Next chunk starts with overlap
    const nextStart = lines.findIndex(
      (l, i) => i > chunkStart && l.timestamp >= chunkEnd - CHUNK_OVERLAP_SECONDS
    );
    chunkStart = nextStart === -1 ? lines.length : nextStart;
  }

  return chunks;
}

// ── Language Detection ────────────────────────────────────────────────────

export async function detectLanguages(lines: TranscriptLine[]): Promise<{
  dominantLanguage: string;
  allLanguages: string[];
  isMixed: boolean;
}> {
  if (lines.length === 0) return { dominantLanguage: 'en', allLanguages: ['en'], isMixed: false };

  // Sample up to 20 lines spread across the transcript
  const step = Math.max(1, Math.floor(lines.length / 20));
  const sample = lines.filter((_, i) => i % step === 0).slice(0, 20);
  const sampleText = sample.map(l => l.text).join('\n');

  const raw = await callAI(
    `You are a language detection expert. Respond ONLY with valid JSON. No preamble.`,
    `Detect the language(s) in this transcript sample. Return JSON:
{"dominantLanguage": "<ISO 639-1 code, e.g. en, fr, yo, sw>", "allLanguages": ["<code>", ...], "isMixed": <true|false>}

Transcript sample:
${sampleText}`,
    200
  );

  return safeJsonParse(raw, { dominantLanguage: 'en', allLanguages: ['en'], isMixed: false });
}

// ── Transcript Cleaning ───────────────────────────────────────────────────

export async function cleanTranscriptChunk(
  lines: TranscriptLine[],
  dominantLanguage: string
): Promise<TranscriptLine[]> {
  if (lines.length === 0) return [];

  const raw = formatTranscriptToText(lines);
  const cleaned = await callAI(
    `You are a professional transcript editor. Clean the provided transcript segment by:
1. Removing filler words (um, uh, like, you know, basically, literally, right?, so so, etc.)
2. Fixing grammar and run-on sentences
3. Adding proper punctuation
4. Preserving all original timestamps and speaker names exactly
5. Preserving the original language (do NOT translate)
6. Never inventing content — only clean what is there
7. Return ONLY valid JSON, no preamble

Output format: {"lines": [{"speaker": "...", "text": "...", "timestamp": <number>}, ...]}`,
    `Clean this transcript segment (language: ${dominantLanguage}):\n\n${raw}`,
    Math.max(800, lines.length * 40)
  );

  const parsed = safeJsonParse<{ lines: TranscriptLine[] }>(cleaned, { lines });
  return parsed.lines.length > 0 ? parsed.lines : lines;
}

// ── Translation ────────────────────────────────────────────────────────────

export async function translateTranscriptToEnglish(
  lines: TranscriptLine[],
  sourceLanguage: string
): Promise<TranscriptLine[]> {
  if (sourceLanguage === 'en' || lines.length === 0) return [];

  const raw = formatTranscriptToText(lines);
  const result = await callAI(
    `You are a professional translator. Translate the provided transcript to English.
Preserve all timestamps and speaker names exactly.
Return ONLY valid JSON: {"lines": [{"speaker": "...", "text": "...", "timestamp": <number>}, ...]}
Never add information that is not in the original.`,
    `Translate from ${sourceLanguage} to English:\n\n${raw}`,
    Math.max(800, lines.length * 50)
  );

  const parsed = safeJsonParse<{ lines: TranscriptLine[] }>(result, { lines: [] });
  return parsed.lines;
}

// ── Full Clean Pipeline ───────────────────────────────────────────────────

export async function processTranscript(raw: RawTranscript): Promise<CleanedTranscript> {
  const langResult = await detectLanguages(raw.lines);
  const chunks = chunkTranscript(raw.lines);

  // Clean all chunks in parallel (max 3 at a time to avoid rate limits)
  const cleanedChunks: TranscriptLine[][] = [];
  for (let i = 0; i < chunks.length; i += 3) {
    const batch = chunks.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(chunk => cleanTranscriptChunk(chunk, langResult.dominantLanguage))
    );
    cleanedChunks.push(...results);
  }

  // De-duplicate overlapping lines (keep first occurrence by timestamp)
  const seen = new Set<number>();
  const mergedLines: TranscriptLine[] = [];
  for (const chunk of cleanedChunks) {
    for (const line of chunk) {
      if (!seen.has(line.timestamp)) {
        seen.add(line.timestamp);
        mergedLines.push({ ...line, language: langResult.dominantLanguage });
      }
    }
  }

  // Translate to English if non-English
  let translatedLines: TranscriptLine[] | undefined;
  if (langResult.dominantLanguage !== 'en') {
    translatedLines = await translateTranscriptToEnglish(mergedLines, langResult.dominantLanguage);
  }

  return {
    lines: mergedLines,
    dominantLanguage: langResult.dominantLanguage,
    isMixedLanguage: langResult.isMixed,
    translatedLines,
  };
}

// ── Summarization Pipeline ────────────────────────────────────────────────

export async function generateMeetingInsights(
  cleaned: CleanedTranscript,
  meetingTitle: string
): Promise<MeetingInsights> {
  const start = Date.now();

  // Use translated lines for summarization if available (more consistent results)
  const linesForSummary = cleaned.translatedLines ?? cleaned.lines;
  const transcriptText = formatTranscriptToText(linesForSummary);

  // Chunk if very long
  const chunks = chunkTranscript(linesForSummary);
  let combinedContext = transcriptText;

  if (chunks.length > 1) {
    // Summarize each chunk first, then summarize summaries
    const chunkSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i += 2) {
      const batch = chunks.slice(i, i + 2);
      const results = await Promise.all(
        batch.map(chunk =>
          callAI(
            'Summarize this meeting segment concisely. Extract only what is explicitly said. Return plain text.',
            formatTranscriptToText(chunk),
            300
          )
        )
      );
      chunkSummaries.push(...results);
    }
    combinedContext = chunkSummaries.join('\n\n---\n\n');
  }

  // Speaker word counts from cleaned lines
  const speakerWordCounts: Record<string, number> = {};
  for (const line of cleaned.lines) {
    const words = line.text.trim().split(/\s+/).length;
    speakerWordCounts[line.speaker] = (speakerWordCounts[line.speaker] ?? 0) + words;
  }
  const totalWords = Object.values(speakerWordCounts).reduce((a, b) => a + b, 0);

  const insightsRaw = await callAI(
    `You are an expert meeting analyst. Analyze the provided meeting transcript and return ONLY valid JSON.
CRITICAL RULES:
- Never hallucinate or invent details not present in the transcript
- If information is missing, use null or empty arrays
- Keep summaries concise but complete
- Action items must include owner and deadline ONLY if explicitly mentioned
- Sentiment must be based on the actual tone, not guessed

Output this exact JSON structure:
{
  "summaryEnglish": "<2-4 sentence summary in English>",
  "keyPoints": ["<point>", ...],
  "actionItems": [{"text": "<task>", "owner": "<name or null>", "deadline": "<date/time or null>"}, ...],
  "decisions": ["<decision>", ...],
  "openQuestions": ["<question>", ...],
  "sentiment": "<positive|neutral|mixed|negative>",
  "keyThemes": ["<theme>", ...]
}`,
    `Meeting title: "${meetingTitle}"\n\nTranscript:\n${combinedContext}`,
    1500
  );

  const parsed = safeJsonParse<Omit<MeetingInsights, 'summaryOriginal' | 'speakerInsights' | 'dominantLanguage' | 'processingDurationMs'>>(insightsRaw, {
    summaryEnglish: 'Summary could not be generated.',
    keyPoints: [],
    actionItems: [],
    decisions: [],
    openQuestions: [],
    sentiment: 'neutral',
    keyThemes: [],
  });

  // Generate original-language summary if needed
  let summaryOriginal: string | null = null;
  if (cleaned.dominantLanguage !== 'en' && cleaned.lines.length > 0) {
    const origText = formatTranscriptToText(cleaned.lines.slice(0, Math.min(cleaned.lines.length, 50)));
    summaryOriginal = await callAI(
      `Write a 2-4 sentence meeting summary in ${cleaned.dominantLanguage}. Be concise and accurate. Return only the summary text, nothing else.`,
      `Meeting title: "${meetingTitle}"\n\nTranscript excerpt:\n${origText}`,
      300
    );
  }

  // Build speaker insights
  const speakerInsights: SpeakerInsight[] = Object.entries(speakerWordCounts).map(([speaker, wordCount]) => ({
    speaker,
    wordCount,
    contributionPercent: totalWords > 0 ? Math.round((wordCount / totalWords) * 100) : 0,
    keyTopics: [], // Could be enriched with another Claude call but kept lean
  }));

  return {
    ...parsed,
    summaryOriginal,
    speakerInsights,
    dominantLanguage: cleaned.dominantLanguage,
    processingDurationMs: Date.now() - start,
  };
}

// ── Slash Command Parser ───────────────────────────────────────────────────

export function parseSlashCommand(message: string): SlashCommand | null {
  const trimmed = message.trim().toLowerCase();
  if (trimmed.startsWith('/record')) return '/record';
  if (trimmed.startsWith('/transcribe')) return '/transcribe';
  if (trimmed.startsWith('/summarize')) return '/summarize';
  return null;
}

// ── Download helpers ───────────────────────────────────────────────────────

export function downloadTranscriptAsTxt(cleaned: CleanedTranscript, meetingTitle: string): void {
  const lines = [`Meeting: ${meetingTitle}`, `Language: ${cleaned.dominantLanguage}`, '─'.repeat(60), ''];
  for (const line of cleaned.lines) {
    const mm = Math.floor(line.timestamp / 60).toString().padStart(2, '0');
    const ss = Math.floor(line.timestamp % 60).toString().padStart(2, '0');
    lines.push(`[${mm}:${ss}] ${line.speaker}: ${line.text}`);
  }
  if (cleaned.translatedLines && cleaned.translatedLines.length > 0) {
    lines.push('', '─'.repeat(60), 'ENGLISH TRANSLATION', '─'.repeat(60), '');
    for (const line of cleaned.translatedLines) {
      const mm = Math.floor(line.timestamp / 60).toString().padStart(2, '0');
      const ss = Math.floor(line.timestamp % 60).toString().padStart(2, '0');
      lines.push(`[${mm}:${ss}] ${line.speaker}: ${line.text}`);
    }
  }
  triggerDownload(lines.join('\n'), `${sanitizeFilename(meetingTitle)}_transcript.txt`, 'text/plain');
}

export function downloadInsightsAsJson(insights: MeetingInsights, meetingTitle: string): void {
  const json = JSON.stringify({ meetingTitle, generatedAt: new Date().toISOString(), ...insights }, null, 2);
  triggerDownload(json, `${sanitizeFilename(meetingTitle)}_insights.json`, 'application/json');
}

export function downloadInsightsAsTxt(insights: MeetingInsights, meetingTitle: string): void {
  const lines = [
    `MEETING INSIGHTS — ${meetingTitle}`,
    `Generated: ${new Date().toLocaleString()}`,
    '═'.repeat(60),
    '',
    '📋 SUMMARY',
    insights.summaryEnglish,
    '',
  ];

  if (insights.summaryOriginal) {
    lines.push('📋 SUMMARY (ORIGINAL LANGUAGE)', insights.summaryOriginal, '');
  }

  if (insights.keyPoints.length > 0) {
    lines.push('🔑 KEY POINTS');
    insights.keyPoints.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`));
    lines.push('');
  }

  if (insights.actionItems.length > 0) {
    lines.push('✅ ACTION ITEMS');
    insights.actionItems.forEach(a => {
      const owner = a.owner ? ` (${a.owner})` : '';
      const deadline = a.deadline ? ` — Due: ${a.deadline}` : '';
      lines.push(`  • ${a.text}${owner}${deadline}`);
    });
    lines.push('');
  }

  if (insights.decisions.length > 0) {
    lines.push('🏛️ DECISIONS');
    insights.decisions.forEach((d, i) => lines.push(`  ${i + 1}. ${d}`));
    lines.push('');
  }

  if (insights.openQuestions.length > 0) {
    lines.push('❓ OPEN QUESTIONS');
    insights.openQuestions.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
    lines.push('');
  }

  if (insights.keyThemes.length > 0) {
    lines.push('🏷️ KEY THEMES');
    lines.push('  ' + insights.keyThemes.join(', '));
    lines.push('');
  }

  if (insights.speakerInsights.length > 0) {
    lines.push('🎤 SPEAKER BREAKDOWN');
    insights.speakerInsights.forEach(s => {
      lines.push(`  ${s.speaker}: ${s.wordCount} words (${s.contributionPercent}%)`);
    });
  }

  triggerDownload(lines.join('\n'), `${sanitizeFilename(meetingTitle)}_insights.txt`, 'text/plain');
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase().slice(0, 60);
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
