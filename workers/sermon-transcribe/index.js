import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { readFile } from 'node:fs/promises';

const env = (name, fallback) => process.env[name] ?? fallback;

const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
});

const POLL_MS = 12_000;

async function fetchAudioToBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download audio: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

async function transcribeWithOpenAI(buffer) {
  const apiKey = env('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const form = new FormData();
  form.set('file', new Blob([buffer]), 'audio');
  form.set('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Whisper error: ${res.status} ${txt}`);
  }

  const body = await res.json();
  return body.text || '';
}

async function processOne(job) {
  const { id, source_url } = job;
  console.log(`[sermon-transcribe] processing sermon ${id}`);
  try {
    if (!source_url) throw new Error('no source_url');
    const audioBuffer = await fetchAudioToBuffer(source_url);
    const text = await transcribeWithOpenAI(audioBuffer);

    await supabase.from('ministry_sermon_library').update({ transcript: text }).eq('id', id);
    console.log(`[sermon-transcribe] updated sermon ${id} (${text.length} chars)`);
  } catch (err) {
    console.error(`[sermon-transcribe] job ${id} failed:`, err?.message || err);
  }
}

async function pollLoop() {
  console.log('[sermon-transcribe] worker started polling every', POLL_MS, 'ms');
  while (true) {
    try {
      const { data: rows, error } = await supabase
        .from('ministry_sermon_library')
        .select('id, source_url')
        .eq('transcript', '')
        .neq('source_url', null)
        .order('created_at', { ascending: true })
        .limit(3);
      if (error) throw error;
      if (rows && rows.length > 0) {
        for (const r of rows) {
          // eslint-disable-next-line no-await-in-loop
          await processOne(r);
        }
      }
    } catch (err) {
      console.error('[sermon-transcribe] poll error:', err?.message || err);
    }
    await new Promise((res) => setTimeout(res, POLL_MS));
  }
}

pollLoop().catch((err) => {
  console.error('[sermon-transcribe] fatal:', err);
  process.exit(1);
});
