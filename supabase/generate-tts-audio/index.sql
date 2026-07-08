// Supabase Edge Function: generate-tts-audio
// Path: supabase/functions/generate-tts-audio/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('[tts] Function started')
    
    // Parse request body
    const { text, language, contentId, contentType, userId } = await req.json()
    
    if (!text || !contentId || !contentType) {
      throw new Error('Missing required fields: text, contentId, contentType')
    }

    console.log(`[tts] Request: contentId=${contentId}, language=${language}, textLength=${text.length}`)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Check cache first
    console.log('[tts] Checking cache...')
    const { data: cachedAudio, error: cacheError } = await supabase
      .from('tts_audio_cache')
      .select('*')
      .eq('content_id', contentId)
      .eq('content_type', contentType)
      .eq('language', language)
      .maybeSingle()

    if (cachedAudio && !cacheError) {
      console.log('[tts] Cache hit:', cachedAudio.audio_url)
      
      // Update access stats
      await supabase
        .from('tts_audio_cache')
        .update({
          last_accessed_at: new Date().toISOString(),
          access_count: (cachedAudio.access_count || 0) + 1,
        })
        .eq('id', cachedAudio.id)

      // CRITICAL: Return immediately with cached URL
      return new Response(
        JSON.stringify({ audioUrl: cachedAudio.audio_url }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    console.log('[tts] Cache miss, generating new audio...')

    // Get OpenAI API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured')
    }

    // OpenAI TTS caps `input` at 4096 characters. Bible-passage slides can exceed
    // that, which previously made the whole request fail and forced the client to
    // fall back to the browser voice. Split long text into sentence-aligned chunks,
    // synthesize each, and concatenate the MP3 bytes (MP3 frames play back-to-back).
    const chunkText = (value: string, maxLen = 3500): string[] => {
      const chunks: string[] = []
      let remaining = value.trim()
      while (remaining.length > maxLen) {
        let cut = remaining.lastIndexOf('. ', maxLen)
        if (cut < maxLen * 0.5) cut = remaining.lastIndexOf(' ', maxLen)
        if (cut <= 0) cut = maxLen
        chunks.push(remaining.slice(0, cut + 1).trim())
        remaining = remaining.slice(cut + 1).trim()
      }
      if (remaining) chunks.push(remaining)
      return chunks
    }

    // Phase 6: pick a voice per language so non-English audio has a more fitting
    // timbre. OpenAI voices are multilingual, so this is character, not accuracy;
    // 'alloy' remains the safe default. The voice is derived from `language`, and
    // `language` is part of the cache key, so cached rows stay consistent.
    const LANGUAGE_VOICE: Record<string, string> = {
      en: 'alloy', vi: 'nova', zh: 'shimmer', ja: 'shimmer', ko: 'shimmer',
      es: 'nova', fr: 'shimmer', de: 'onyx', pt: 'nova', it: 'nova',
      ru: 'onyx', ar: 'onyx', hi: 'nova', th: 'shimmer', id: 'nova',
    }
    const voice = LANGUAGE_VOICE[language] || 'alloy'

    const textChunks = chunkText(text)
    console.log(`[tts] Calling OpenAI, voice=${voice}, lang=${language}, chunks=${textChunks.length}`)

    const chunkBuffers: Uint8Array[] = []
    for (const chunk of textChunks) {
      const openaiResponse = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          voice,
          input: chunk,
          speed: 1.0,
        }),
      })

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text()
        throw new Error(`OpenAI API error: ${openaiResponse.status} ${errorText}`)
      }

      const chunkBytes = new Uint8Array(await openaiResponse.arrayBuffer())
      chunkBuffers.push(chunkBytes)
    }

    // Concatenate all chunk buffers into a single MP3.
    const totalBytes = chunkBuffers.reduce((sum, b) => sum + b.length, 0)
    const audioBuffer = new Uint8Array(totalBytes)
    {
      let offset = 0
      for (const b of chunkBuffers) { audioBuffer.set(b, offset); offset += b.length }
    }
    console.log(`[tts] Received audio: ${audioBuffer.byteLength} bytes across ${chunkBuffers.length} chunk(s)`)

    // Upload to Supabase Storage
    const timestamp = Date.now()
    const fileName = `audio_${contentType}_${contentId}_${language}_${timestamp}.mp3`
    const filePath = `tts-audio/${fileName}`

    console.log(`[tts] Uploading to storage: ${filePath}`)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audio-content')
      .upload(filePath, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('audio-content')
      .getPublicUrl(filePath)

    const audioUrl = urlData.publicUrl
    console.log(`[tts] Done: ${audioUrl}`)

    // Save to cache
    console.log('[tts] Saving to cache...')
    const { error: cacheInsertError } = await supabase
      .from('tts_audio_cache')
      .insert({
        content_id: contentId,
        content_type: contentType,
        language: language,
        audio_url: audioUrl,
        voice: voice,
        created_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
        access_count: 0,
      })

    if (cacheInsertError) {
      console.warn('[tts] Cache save failed:', cacheInsertError.message)
      // Don't throw - audio is still available
    } else {
      console.log('[tts] Cache saved successfully')
    }

    // CRITICAL: Return response BEFORE function shuts down
    console.log('[tts] Returning response to client...')
    return new Response(
      JSON.stringify({ 
        audioUrl: audioUrl,
        cached: false,
        generatedAt: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('[tts] Error:', error.message)
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        audioUrl: null 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})