// supabase/functions/fetch-youtube-transcript/index.ts
// Ministry-admin only. Given a YouTube video URL, fetches that video's own
// captions (manually authored if available, else auto-generated) and
// returns them as a plain-text transcript.
//
// Why this exists, not Deepgram: cf-transcribe (the background
// auto-transcription worker) hands a sermon's source_url straight to
// Deepgram's /v1/listen, which needs a URL pointing at an actual decodable
// audio/video FILE. A YouTube watch page is HTML, not a media file — Deepgram
// can't fetch-and-decode it, so it always fails for a "YouTube link" source.
// A direct link to an audio/video file (a "Website link" pointing straight
// at a .mp3/.mp4 etc.) doesn't have this problem and already gets picked up
// by cf-transcribe with no changes needed — this function is YouTube-only.
//
// Approach (no official free "get any video's transcript" API exists —
// YouTube Data API's captions.download requires OAuth as the video's own
// owner, unusable for an arbitrary third-party sermon video): scrape the
// caption track list out of the watch page's embedded player JSON, the same
// technique widely used by transcript-fetching tools. Fragile by nature
// (depends on YouTube's page structure) — every failure path returns a
// clear "paste it manually" message rather than a dead end.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// A normal desktop browser UA + the "already answered the EU cookie consent
// wall" cookie — without either, YouTube can serve a consent interstitial
// page instead of the actual watch page, which has no captionTracks at all.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const FETCH_HEADERS = {
  'User-Agent': BROWSER_UA,
  'Accept-Language': 'en-US,en;q=0.9',
  'Cookie': 'CONSENT=YES+1',
}

function extractYouTubeId(rawUrl: string): string | null {
  let u: URL
  try {
    u = new URL(rawUrl.trim())
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, '')
  if (host === 'youtu.be') {
    return u.pathname.slice(1).split('/')[0] || null
  }
  if (host === 'youtube.com') {
    if (u.pathname === '/watch') return u.searchParams.get('v')
    const shorts = u.pathname.match(/^\/shorts\/([^/?]+)/)
    if (shorts) return shorts[1]
    const embed = u.pathname.match(/^\/embed\/([^/?]+)/)
    if (embed) return embed[1]
    const live = u.pathname.match(/^\/live\/([^/?]+)/)
    if (live) return live[1]
  }
  return null
}

// Pulls a balanced [...] array out of `text` starting at/after `fromIndex` —
// the caption track list sits inside a much larger blob of player JSON
// embedded in the page, so this can't just regex up to the first `]`
// (track names/urls contain their own brackets and escaped quotes).
function extractBalancedArray(text: string, fromIndex: number): string | null {
  const start = text.indexOf('[', fromIndex)
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

// Prefer a manually-authored English track (most accurate), then an
// auto-generated English one, then whatever manual/auto track exists at all.
function pickTrack(tracks: any[]): any | null {
  const isEn = (t: any) => typeof t.languageCode === 'string' && t.languageCode.toLowerCase().startsWith('en')
  const manual = tracks.filter((t) => t.kind !== 'asr')
  const auto = tracks.filter((t) => t.kind === 'asr')
  return manual.find(isEn) || auto.find(isEn) || manual[0] || auto[0] || tracks[0] || null
}

serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return json({ error: 'Unauthorized: please sign in again.' }, 401)

    const body = await req.json().catch(() => ({}))
    const ministryId = typeof body.ministry_id === 'string' ? body.ministry_id : ''
    const url = typeof body.url === 'string' ? body.url : ''

    if (!ministryId) return json({ error: 'ministry_id is required' }, 400)
    if (!url.trim()) return json({ error: 'url is required' }, 400)

    // Same ministry-scoped admin check as detect-transcript-corrections —
    // this is a per-ministry Sermon Library tool, not a public scraping proxy.
    const { data: isAdmin, error: adminCheckError } = await supabase
      .rpc('is_group_admin', { p_ministry_id: ministryId, p_user_id: user.id })
    if (adminCheckError || !isAdmin) return json({ error: 'Ministry admin access required.' }, 403)

    const videoId = extractYouTubeId(url)
    if (!videoId) return json({ error: "Couldn't recognize that as a YouTube video URL." }, 400)

    const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, { headers: FETCH_HEADERS })
    if (!watchRes.ok) {
      return json({ error: `Couldn't load that YouTube video (HTTP ${watchRes.status}). It may be private, removed, or age/region-restricted.` }, 502)
    }
    const html = await watchRes.text()

    if (/class="g-recaptcha"|Our systems have detected unusual traffic/.test(html)) {
      console.error('[fetch-youtube-transcript] YouTube served a CAPTCHA/bot-check page')
      return json({ error: "YouTube blocked this request. Please paste the transcript manually." }, 502)
    }

    const marker = '"captionTracks":'
    const markerIndex = html.indexOf(marker)
    if (markerIndex === -1) {
      return json({ error: 'This video has no captions available. Paste the transcript manually.' }, 404)
    }

    const arrayText = extractBalancedArray(html, markerIndex + marker.length)
    let tracks: any[] = []
    if (arrayText) {
      try {
        tracks = JSON.parse(arrayText)
      } catch (e) {
        console.error('[fetch-youtube-transcript] Failed to parse captionTracks JSON:', e)
      }
    }
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return json({ error: 'This video has no captions available. Paste the transcript manually.' }, 404)
    }

    const track = pickTrack(tracks)
    if (!track?.baseUrl) {
      return json({ error: 'This video has no usable captions. Paste the transcript manually.' }, 404)
    }

    const transcriptUrl = `${track.baseUrl}${track.baseUrl.includes('?') ? '&' : '?'}fmt=json3`
    const capRes = await fetch(transcriptUrl, { headers: FETCH_HEADERS })
    if (!capRes.ok) {
      console.error('[fetch-youtube-transcript] Caption track fetch failed', capRes.status)
      return json({ error: "Couldn't download this video's captions. Paste the transcript manually." }, 502)
    }
    const capJson = await capRes.json().catch(() => null)
    const events = Array.isArray(capJson?.events) ? capJson.events : []

    const parts: string[] = []
    for (const ev of events) {
      if (!Array.isArray(ev?.segs)) continue
      for (const seg of ev.segs) {
        if (typeof seg?.utf8 === 'string') parts.push(seg.utf8)
      }
    }
    const transcript = decodeEntities(parts.join('')).replace(/\s+/g, ' ').trim()

    if (!transcript) {
      return json({ error: 'This video has no usable captions. Paste the transcript manually.' }, 404)
    }

    return json({
      transcript,
      language: track.languageCode || null,
      autoGenerated: track.kind === 'asr',
    })
  } catch (err: any) {
    console.error('[fetch-youtube-transcript] Unhandled error:', err?.message || err)
    return json({ error: err?.message || 'An unexpected error occurred' }, 500)
  }
})
