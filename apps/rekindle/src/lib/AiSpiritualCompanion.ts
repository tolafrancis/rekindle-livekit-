// src/lib/aiSpiritualCompanion.ts
// AI Spiritual Companion Service - Backend Proxy Version
// This version calls a Supabase Edge Function instead of calling Anthropic API directly

import { supabase, supabaseUrl } from './supabase';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  content: string;
  scriptureReference?: string;
  prayer?: string;
  tokensUsed?: number;
}

export class SpiritualCompanionService {
  private edgeFunctionUrl: string;
  
  constructor() {
    // Use the supabaseUrl exported from supabase.ts
    if (!supabaseUrl) {
      console.error('Supabase URL not configured');
      throw new Error('Supabase configuration missing. Please contact your administrator.');
    }
    
    this.edgeFunctionUrl = `${supabaseUrl}/functions/v1/spiritual-companion`;
    console.log('[SpiritualCompanion] Initialized with URL:', this.edgeFunctionUrl);
  }

  /**
   * Send a message to the AI Spiritual Companion via backend proxy
   */
  async sendMessage(
    messages: ChatMessage[],
    userContext?: {
      spiritualMaturity?: string;
      prayerPreferences?: any;
      recentTopics?: string[];
      language?: string; // Phase 5: the user's selected UI language; AI replies in it
    }
  ): Promise<ChatResponse> {
    try {
      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('User not authenticated. Please sign in to continue.');
      }

      console.log('[SpiritualCompanion] Sending request to:', this.edgeFunctionUrl);

      // The Supabase Edge Function goes cold on the free tier after idle, so the
      // first request after a lull can cold-start slowly, time out, or be
      // transiently throttled. Retry transient failures (network errors, 408,
      // 429, 5xx) with backoff so the chat self-heals instead of showing
      // "disconnected" and needing a manual test in admin to warm the function.
      const maxAttempts = 3;
      let response: Response | null = null;
      let lastTransientError = '';

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          response = await fetch(this.edgeFunctionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              messages,
              userContext,
              // Top-level too, so the edge function can read it without digging
              // into userContext. Defaults to English server-side if absent.
              language: userContext?.language || 'en'
            })
          });
        } catch (networkErr: any) {
          // fetch() threw (network / DNS / connection reset) — always transient.
          lastTransientError = networkErr?.message || 'Network error';
          console.warn(`[SpiritualCompanion] Attempt ${attempt} network error:`, lastTransientError);
          if (attempt < maxAttempts) {
            await new Promise(res => setTimeout(res, attempt * 1000));
            continue;
          }
          throw new Error('Unable to reach the spiritual companion service. Please try again in a moment.');
        }

        console.log(`[SpiritualCompanion] Attempt ${attempt} response status:`, response.status);

        // Cold start / throttling / gateway hiccups — retry these statuses.
        if ([408, 429, 500, 502, 503, 504].includes(response.status) && attempt < maxAttempts) {
          lastTransientError = `HTTP ${response.status}`;
          console.warn(`[SpiritualCompanion] Attempt ${attempt} transient status ${response.status}, retrying...`);
          await new Promise(res => setTimeout(res, attempt * 1000));
          continue;
        }

        break; // usable (success or non-transient) response
      }

      if (!response) {
        throw new Error(lastTransientError || 'No response from the spiritual companion service.');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: 'Unknown error occurred'
        }));
        
        console.error('[SpiritualCompanion] API Error:', errorData);
        
        // Provide helpful error messages
        if (response.status === 404) {
          throw new Error(
            'Backend service not found. The Supabase Edge Function may not be deployed. ' +
            'Please contact your administrator or check the deployment guide.'
          );
        }
        
        if (response.status === 401) {
          throw new Error('Authentication failed. Please sign in again.');
        }
        
        throw new Error(
          errorData.error || 
          `API Error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      
      console.log('[SpiritualCompanion] Response received successfully');
      
      return {
        content: data.content || '',
        scriptureReference: data.scriptureReference,
        prayer: data.prayer,
        tokensUsed: data.tokensUsed || 0
      };
      
    } catch (error: any) {
      console.error('[SpiritualCompanion] Error:', error);
      
      // Provide more specific error messages
      if (error.message.includes('not authenticated')) {
        throw new Error('Authentication required. Please sign in to use the Spiritual Companion.');
      }
      
      if (error.message.includes('fetch') || error.name === 'TypeError') {
        throw new Error(
          'Unable to connect to server. Please check your internet connection. ' +
          'If the problem persists, the backend service may not be deployed.'
        );
      }
      
      throw new Error(`Failed to connect with spiritual companion: ${error.message}`);
    }
  }

  /**
   * Generate a topic-specific prayer
   */
  async generatePrayer(topic: string, specificNeeds?: string, language?: string): Promise<string> {
    const prayerPrompt = specificNeeds
      ? `Please lead me in a biblical prayer focused on ${topic}, specifically addressing: ${specificNeeds}. Keep it concise and heartfelt.`
      : `Please lead me in a biblical prayer focused on ${topic}. Keep it concise and heartfelt.`;

    const response = await this.sendMessage(
      [{ role: 'user', content: prayerPrompt }],
      language ? { language } : undefined
    );

    return response.content;
  }

  /**
   * Get Scripture guidance for a specific situation
   */
  async getScriptureGuidance(situation: string, language?: string): Promise<{
    scripture: string;
    reference: string;
    application: string;
  }> {
    const guidancePrompt = `I'm facing this situation: ${situation}. Please share a relevant Bible verse with its reference and explain how it applies to my situation.`;

    const response = await this.sendMessage(
      [{ role: 'user', content: guidancePrompt }],
      language ? { language } : undefined
    );

    // Parse the response to extract structured data
    const scriptureRefMatch = response.content.match(/\(([^)]*\d+:\d+[^)]*)\)/);
    const reference = scriptureRefMatch ? scriptureRefMatch[1] : 'Scripture Reference';
    
    // Extract the quoted scripture (text in quotes or after reference)
    const scriptureMatch = response.content.match(/"([^"]+)"|'([^']+)'|: "?([^".\n]+)/);
    const scripture = scriptureMatch ? (scriptureMatch[1] || scriptureMatch[2] || scriptureMatch[3] || '') : '';

    return {
      scripture: scripture.trim(),
      reference: reference,
      application: response.content
    };
  }

  /**
   * Provide spiritual counsel on a specific topic
   */
  async provideCounsel(
    topic: string,
    details: string,
    userMaturityLevel?: string,
    language?: string
  ): Promise<ChatResponse> {
    const counselPrompt = `I need spiritual counsel regarding ${topic}. Here are the details: ${details}`;

    return await this.sendMessage(
      [{ role: 'user', content: counselPrompt }],
      { spiritualMaturity: userMaturityLevel, language }
    );
  }

  /**
   * Analyze spiritual growth areas
   */
  async analyzeSpiritualGrowth(
    journalEntries: string[],
    prayerTopics: string[],
    language?: string
  ): Promise<{
    insights: string;
    encouragement: string;
    nextSteps: string[];
  }> {
    const analysisPrompt = `Based on my recent spiritual journey reflections and prayer topics, please provide insights on my spiritual growth and suggest next steps for continued growth.

Recent Reflections:
${journalEntries.slice(0, 3).join('\n\n')}

Prayer Topics:
${prayerTopics.slice(0, 5).join(', ')}`;

    const response = await this.sendMessage(
      [{ role: 'user', content: analysisPrompt }],
      language ? { language } : undefined
    );

    // Parse structured insights from response
    const sections = response.content.split('\n\n');
    
    return {
      insights: sections[0] || response.content,
      encouragement: sections[1] || '',
      nextSteps: sections.slice(2).filter(s => s.trim().length > 0)
    };
  }

  /**
   * Test connection to the backend
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.sendMessage([
        { role: 'user', content: 'Hello' }
      ]);
      return !!response.content;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}

// Singleton instance factory
let companionInstance: SpiritualCompanionService | null = null;

export const initializeSpiritualCompanion = (): SpiritualCompanionService => {
  try {
    if (!companionInstance) {
      companionInstance = new SpiritualCompanionService();
    }
    return companionInstance;
  } catch (error) {
    console.error('Failed to initialize Spiritual Companion:', error);
    throw error;
  }
};

export const getSpiritualCompanion = (): SpiritualCompanionService => {
  if (!companionInstance) {
    throw new Error('Spiritual Companion not initialized. Call initializeSpiritualCompanion first.');
  }
  return companionInstance;
};

// Helper to extract scripture references from text
export const extractScriptureReferences = (text: string): string[] => {
  const pattern = /\b(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation)\s+\d+:\d+(?:-\d+)?/gi;
  
  return text.match(pattern) || [];
};