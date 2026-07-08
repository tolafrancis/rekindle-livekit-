// types/bulkTTS.ts
// Type definitions for bulk TTS generation system

export interface LanguagePreference {
  id: string;
  user_id: string;
  preference_name: 'asian_focus' | 'global_reach' | 'western_focus' | 'custom';
  languages: string[]; // ISO language codes: ['zh', 'ko', 'ja', ...]
  is_default: boolean;
  display_order: 'asian_first' | 'alphabetical' | 'most_used';
  created_at: string;
  updated_at: string;
}

export interface BulkTTSJob {
  id: string;
  user_id: string;
  series_id?: string;
  job_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_slides: number;
  total_languages: number;
  total_generations: number; // slides × languages
  completed_generations: number;
  failed_generations: number;
  languages: string[];
  slides_data: SlideData[];
  results: JobResults;
  estimated_cost?: number;
  actual_cost?: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SlideData {
  slide_id: string;
  day_number: number;
  text: string;
}

export interface JobResults {
  [slideId: string]: {
    [language: string]: {
      url?: string;
      status: 'success' | 'failed';
      error?: string;
      cost?: number;
      duration?: number;
    };
  };
}

export interface BulkTTSGeneration {
  id: string;
  job_id: string;
  slide_id: string;
  day_number?: number;
  language: string;
  text_content: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audio_url?: string;
  audio_duration?: number;
  character_count?: number;
  cost?: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface BulkUploadInput {
  series_id?: string;
  job_name: string;
  languages: string[];
  slides: Array<{
    slide_id: string;
    day_number: number;
    text: string;
  }>;
}

export interface CSVRow {
  slide_id: string;
  day_number: number;
  text: string;
}

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  group: 'asian' | 'other';
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  // Asian Languages (Priority Group)
  { code: 'zh', name: 'Chinese (Mandarin)', nativeName: '中文', flag: '🇨🇳', group: 'asian' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷', group: 'asian' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', group: 'asian' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳', group: 'asian' },
  { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog', flag: '🇵🇭', group: 'asian' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭', group: 'asian' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', group: 'asian' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩', group: 'asian' },
  
  // Other Languages
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', group: 'other' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', group: 'other' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', group: 'other' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', group: 'other' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷', group: 'other' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', group: 'other' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', group: 'other' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', group: 'other' },
];

export const LANGUAGE_PRESETS: Record<string, { name: string; languages: string[] }> = {
  asian_focus: {
    name: 'Asian Focus',
    languages: ['zh', 'ko', 'ja', 'vi', 'tl', 'th', 'hi', 'id', 'en']
  },
  global_reach: {
    name: 'Global Reach',
    languages: ['zh', 'ko', 'ja', 'vi', 'en', 'es', 'fr', 'de', 'pt', 'ar']
  },
  western_focus: {
    name: 'Western Focus',
    languages: ['en', 'es', 'fr', 'de', 'pt', 'it']
  }
};

// Helper function to estimate cost
export function estimateTTSCost(characterCount: number, languageCount: number): number {
  // OpenAI TTS pricing: $0.015 per 1000 characters
  const costPerChar = 0.015 / 1000;
  return characterCount * languageCount * costPerChar;
}

// Helper function to parse CSV
export function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.trim().split('\n');
  const rows: CSVRow[] = [];
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Simple CSV parsing (handles quoted fields)
    const matches = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
    if (!matches || matches.length < 3) continue;
    
    const slide_id = matches[0].replace(/^"|"$/g, '').trim();
    const day_number = parseInt(matches[1].replace(/^"|"$/g, '').trim());
    const text = matches[2].replace(/^"|"$/g, '').trim();
    
    if (slide_id && !isNaN(day_number) && text) {
      rows.push({ slide_id, day_number, text });
    }
  }
  
  return rows;
}