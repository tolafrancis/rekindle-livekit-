/**
 * OpenAI Text-to-Speech Service
 * 
 * High-quality audio generation with:
 * - Server-side generation on first request
 * - Persistent caching to control costs
 * - Multi-language support (Asian + European)
 * - Natural, calm, pastoral tone
 * - Proper paragraph and punctuation handling
 */

import { supabase } from '@rekindle/supabase';

// Language to OpenAI voice mapping
// Using 'alloy' as base - neutral, calm, and clear
// For specific languages, we can use different voices
export const LANGUAGE_VOICE_MAP: Record<string, string> = {
  // Asian Languages
  'en': 'alloy',      // English - calm and clear
  'zh': 'nova',       // Chinese - soft and warm
  'ja': 'shimmer',    // Japanese - gentle
  'ko': 'alloy',      // Korean
  'vi': 'alloy',      // Vietnamese
  'th': 'alloy',      // Thai
  'id': 'alloy',      // Indonesian
  'ms': 'alloy',      // Malay
  'tl': 'alloy',      // Tagalog/Filipino
  'hi': 'alloy',      // Hindi
  'ta': 'alloy',      // Tamil
  'te': 'alloy',      // Telugu
  
  // European Languages (for future expansion)
  'es': 'nova',       // Spanish
  'fr': 'shimmer',    // French
  'de': 'alloy',      // German
  'it': 'nova',       // Italian
  'pt': 'nova',       // Portuguese
  'ru': 'alloy',      // Russian
  'pl': 'alloy',      // Polish
  'nl': 'alloy',      // Dutch
};

// Audio generation models
export const TTS_MODEL = 'tts-1-hd'; // High-quality model
export const TTS_SPEED = 0.95; // Slightly slower for spiritual content

export interface TTSGenerationOptions {
  text: string;
  language: string;
  contentId: string;
  contentType: 'devotional' | 'book' | 'daily_devotional' | 'prayer';
  userId?: string;
}

export interface CachedAudio {
  id: string;
  content_id: string;
  content_type: string;
  language: string;
  audio_url: string;
  duration_seconds: number;
  file_size_bytes: number;
  voice_used: string;
  created_at: string;
  last_accessed_at: string;
  access_count: number;
}

/**
 * Preprocess text for better TTS output
 * - Add pauses after paragraphs and headings
 * - Normalize scripture references
 * - Handle special characters
 */
export function preprocessTextForTTS(text: string): string {
  let processed = text;
  
  // Add pauses after paragraph breaks
  processed = processed.replace(/\n\n/g, '\n\n... ');
  
  // Add pause after headings (lines ending with :)
  processed = processed.replace(/:\n/g, '... \n');
  
  // Normalize scripture references for natural reading
  // e.g., "John 3:16" -> "John chapter 3, verse 16"
  processed = processed.replace(
    /(\w+)\s+(\d+):(\d+)/g,
    '$1 chapter $2, verse $3'
  );
  
  // Add slight pause after commas and periods
  processed = processed.replace(/\. /g, '. ... ');
  processed = processed.replace(/, /g, ', .. ');
  
  // Remove excessive whitespace
  processed = processed.replace(/\s+/g, ' ').trim();
  
  return processed;
}

/**
 * Generate cache key for audio file
 */
export function generateAudioCacheKey(
  contentId: string,
  contentType: string,
  language: string
): string {
  return `audio_${contentType}_${contentId}_${language}`;
}

/**
 * Check if audio is already cached
 */
export async function getCachedAudio(
  contentId: string,
  contentType: string,
  language: string
): Promise<CachedAudio | null> {
  try {
    const { data, error } = await supabase
      .from('tts_audio_cache')
      .select('*')
      .eq('content_id', contentId)
      .eq('content_type', contentType)
      .eq('language', language)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    // Update access tracking
    if (data) {
      await supabase
        .from('tts_audio_cache')
        .update({
          last_accessed_at: new Date().toISOString(),
          access_count: (data.access_count || 0) + 1,
        })
        .eq('id', data.id);
    }

    return data;
  } catch (error) {
    console.error('Error checking audio cache:', error);
    return null;
  }
}

/**
 * Generate audio using OpenAI TTS
 * This should be called from a server-side function/edge function
 */
export async function generateAudioWithOpenAI(
  text: string,
  language: string,
  voiceOverride?: string
): Promise<ArrayBuffer> {
  const voice = voiceOverride || LANGUAGE_VOICE_MAP[language] || 'alloy';
  const processedText = preprocessTextForTTS(text);

  // This needs to be called from a server-side function
  // where OPENAI_API_KEY is available
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      input: processedText,
      voice: voice,
      speed: TTS_SPEED,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI TTS API error: ${response.statusText}`);
  }

  return await response.arrayBuffer();
}

/**
 * Upload generated audio to Supabase Storage
 */
export async function uploadAudioToStorage(
  audioBuffer: ArrayBuffer,
  cacheKey: string
): Promise<string> {
  const fileName = `${cacheKey}_${Date.now()}.mp3`;
  const filePath = `tts-audio/${fileName}`;

  const { data, error } = await supabase.storage
    .from('audio-content')
    .upload(filePath, audioBuffer, {
      contentType: 'audio/mpeg',
      cacheControl: '31536000', // 1 year
      upsert: false,
    });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('audio-content')
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

/**
 * Save audio metadata to cache
 */
export async function saveAudioCache(
  contentId: string,
  contentType: string,
  language: string,
  audioUrl: string,
  durationSeconds: number,
  fileSizeBytes: number,
  voiceUsed: string
): Promise<void> {
  const { error } = await supabase
    .from('tts_audio_cache')
    .insert({
      content_id: contentId,
      content_type: contentType,
      language: language,
      audio_url: audioUrl,
      duration_seconds: durationSeconds,
      file_size_bytes: fileSizeBytes,
      voice_used: voiceUsed,
      access_count: 0,
      last_accessed_at: new Date().toISOString(),
    });

  if (error) throw error;
}

/**
 * Estimate audio duration based on text length
 * Average speaking rate: ~150 words per minute for calm, pastoral reading
 */
export function estimateAudioDuration(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const wordsPerMinute = 130; // Slower, more reflective pace
  const minutes = words / wordsPerMinute;
  return Math.ceil(minutes * 60); // Return seconds
}

/**
 * Get audio file size from buffer
 */
export function getAudioFileSize(audioBuffer: ArrayBuffer): number {
  return audioBuffer.byteLength;
}

/**
 * Client-side function to request audio generation
 * Calls server-side edge function
 */
export async function requestAudioGeneration(
  options: TTSGenerationOptions
): Promise<string> {
  try {
    // First check cache
    const cached = await getCachedAudio(
      options.contentId,
      options.contentType,
      options.language
    );

    if (cached) {
      return cached.audio_url;
    }

    // Call edge function to generate audio
    const response = await fetch('/api/generate-tts-audio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      throw new Error('Failed to generate audio');
    }

    const { audioUrl } = await response.json();
    return audioUrl;
  } catch (error) {
    console.error('Error requesting audio generation:', error);
    throw error;
  }
}

/**
 * Fallback to browser Web Speech API (as backup)
 */
export function getBrowserTTSSupport(): boolean {
  return 'speechSynthesis' in window;
}

export function playTextWithBrowserTTS(
  text: string,
  language: string,
  onEnd?: () => void
): void {
  if (!getBrowserTTSSupport()) {
    throw new Error('Browser TTS not supported');
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.rate = 0.9; // Slower for spiritual content
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  if (onEnd) {
    utterance.onend = onEnd;
  }

  window.speechSynthesis.speak(utterance);
}

export function stopBrowserTTS(): void {
  if (getBrowserTTSSupport()) {
    window.speechSynthesis.cancel();
  }
}