// =====================================================
// SUPABASE EDGE FUNCTION: translate-content
// Handles translation with automatic caching
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// =====================================================
// CONTENT TYPE CONTEXT FOR BETTER TRANSLATIONS
// =====================================================

const CONTENT_TYPE_CONTEXT: Record<string, string> = {
  'ui': 'User interface text - keep it concise and clear',
  'ui-strings': 'UI button labels and common actions - very short',
  'content': 'Content templates - maintain spiritual and reverent tone',
  'devotional': 'Daily devotional content - inspirational and reflective',
  'prayer': 'Prayer text - reverent and heartfelt',
  'scripture': 'Biblical scripture - maintain accuracy and reverence',
  'announcement': 'Ministry announcement - clear and informative',
  'notification': 'Push notification - brief and action-oriented',
  'error': 'Error message - clear and helpful',
  'general': 'General content - natural and contextual'
};

// =====================================================
// HASH GENERATION FOR CACHE KEYS
// =====================================================

async function generateHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// =====================================================
// CHECK TRANSLATION CACHE
// =====================================================

async function checkCache(
  sourceText: string,
  sourceLang: string,
  targetLang: string,
  contentType: string
): Promise<string | null> {
  const contentHash = await generateHash(sourceText);

  // Cache key is (content_hash, source_language, target_language) — the actual
  // unique index. content_type is advisory metadata, NOT part of the key, so we
  // do not filter by it here (a string translated once is reused regardless of
  // the content_type label). maybeSingle() avoids throwing on a cache miss.
  const { data, error } = await supabase
    .from('translation_cache')
    .select('translated_text, id')
    .eq('content_hash', contentHash)
    .eq('source_language', sourceLang)
    .eq('target_language', targetLang)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  // Update access count and last accessed timestamp
  await supabase
    .from('translation_cache')
    .update({
      access_count: supabase.rpc('increment', { row_id: data.id }),
      last_accessed_at: new Date().toISOString()
    })
    .eq('id', data.id);

  return data.translated_text;
}

// =====================================================
// SAVE TO TRANSLATION CACHE
// =====================================================

async function saveToCache(
  sourceText: string,
  translatedText: string,
  sourceLang: string,
  targetLang: string,
  contentType: string,
  provider: string = 'openai',
  model: string = 'gpt-4o-mini'
): Promise<void> {
  const contentHash = await generateHash(sourceText);

  const { error } = await supabase
    .from('translation_cache')
    .upsert({
      content_hash: contentHash,
      source_text: sourceText,
      source_language: sourceLang,
      target_language: targetLang,
      translated_text: translatedText,
      content_type: contentType,
      provider: provider,
      model: model,
      access_count: 1,
      last_accessed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      // Must match the ONLY unique index on translation_cache. Using the 4-column
      // form here (…,content_type) referenced a non-existent constraint, so every
      // upsert failed silently and the cache never populated (Phase 0 finding F1).
      onConflict: 'content_hash,source_language,target_language'
    });

  if (error) {
    console.error('Failed to save to cache:', error);
  }
}

// =====================================================
// TRANSLATE WITH OPENAI
// =====================================================

async function translateWithOpenAI(
  text: string,
  sourceLang: string,
  targetLang: string,
  contentType: string
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const context = CONTENT_TYPE_CONTEXT[contentType] || CONTENT_TYPE_CONTEXT.general;
  
  const systemPrompt = `You are a professional translator specializing in spiritual and religious content.
Translate the following text from ${sourceLang} to ${targetLang}.

Context: ${context}

IMPORTANT RULES:
1. Maintain the spiritual and reverent tone
2. Keep formatting (line breaks, special characters) intact
3. For UI strings, keep translations concise
4. For scripture, maintain accuracy and traditional phrasing where appropriate
5. Return ONLY the translated text, no explanations
6. If the text contains placeholder variables like {name}, keep them unchanged`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      temperature: 0.3, // Lower temperature for more consistent translations
      max_tokens: 2000
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() || '';
}

// =====================================================
// BATCH TRANSLATE
// =====================================================

async function batchTranslate(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  contentType: string
): Promise<string[]> {
  const results: string[] = [];
  
  for (const text of texts) {
    // Check cache first
    let translated = await checkCache(text, sourceLang, targetLang, contentType);
    
    if (!translated) {
      // Translate with OpenAI
      translated = await translateWithOpenAI(text, sourceLang, targetLang, contentType);
      
      // Save to cache
      await saveToCache(text, translated, sourceLang, targetLang, contentType);
    }
    
    results.push(translated);
  }
  
  return results;
}

// =====================================================
// MAIN HANDLER
// =====================================================

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    // Accept BOTH parameter conventions so any client version works:
    // sourceLang/targetLang/cacheResult (canonical) OR the older
    // sourceLanguage/targetLanguage/skipCache. This is why an older app build
    // that sends targetLanguage no longer trips "Target language is required".
    const body = await req.json();
    const text = body.text;
    const texts = body.texts;
    const sourceLang = body.sourceLang || body.sourceLanguage || 'en';
    const targetLang = body.targetLang || body.targetLanguage;
    const contentType = body.contentType || 'general';
    const cacheResult = body.cacheResult ?? (body.skipCache === undefined ? true : !body.skipCache);

    if (!targetLang) {
      throw new Error('Target language is required');
    }

    // Handle batch translation
    if (texts && Array.isArray(texts)) {
      const strings = await batchTranslate(texts, sourceLang, targetLang, contentType);
      // Return BOTH shapes: a plain string[] (canonical) AND objects carrying
      // `translated` (older clients read translation.translated per item).
      const translations = strings.map((s: string) => ({ translated: s, translatedText: s, text: s }));

      return new Response(
        JSON.stringify({
          success: true,
          translations,
          cached: false // Batch results may be mix of cached and new
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Handle single translation
    if (!text) {
      throw new Error('Text or texts array is required');
    }

    // Check cache first
    let translatedText = await checkCache(text, sourceLang, targetLang, contentType);
    let fromCache = !!translatedText;

    if (!translatedText) {
      // Translate with OpenAI
      translatedText = await translateWithOpenAI(text, sourceLang, targetLang, contentType);

      // Save to cache if requested
      if (cacheResult) {
        await saveToCache(text, translatedText, sourceLang, targetLang, contentType);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        translatedText,
        translated: translatedText, // older clients read `translated`
        cached: fromCache
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );

  } catch (error) {
    console.error('Translation error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Translation failed' 
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});