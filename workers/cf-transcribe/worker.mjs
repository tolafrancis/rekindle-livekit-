export default {
  // Cloudflare scheduled handler invoked via Cron Triggers
  async scheduled(controller, env, ctx) {
    const SUPABASE_URL = env.SUPABASE_URL;
    const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
    const DEEPGRAM_KEY = env.DEEPGRAM;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error('[cf-transcribe] missing Supabase config');
      return;
    }
    if (!DEEPGRAM_KEY) {
      console.error('[cf-transcribe] missing Deepgram key; worker requires DEEPGRAM');
    }

    try {
      const pendingUrl = `${SUPABASE_URL}/rest/v1/ministry_sermon_library?select=id,source_url&status=eq.pending&limit=5`;
      const pendingRes = await fetch(pendingUrl, {
        method: 'GET',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Accept: 'application/json',
        },
      });
      if (!pendingRes.ok) throw new Error(`Supabase pending query failed: ${pendingRes.status}`);
      const rows = await pendingRes.json();
      if (!rows || rows.length === 0) return;

      for (const row of rows) {
        try {
          if (!row.source_url) {
            // mark as error
            await updateSermon(row.id, { status: 'error', processing_error: 'missing source_url' }, SUPABASE_URL, SUPABASE_KEY);
            continue;
          }

          // Mark processing
          await updateSermon(row.id, { status: 'processing', processing_error: null }, SUPABASE_URL, SUPABASE_KEY);

          if (!DEEPGRAM_KEY) {
            throw new Error('no DEEPGRAM key');
          }

          // Ask Deepgram to transcribe by URL
          const dgRes = await fetch('https://api.deepgram.com/v1/listen', {
            method: 'POST',
            headers: {
              Authorization: `Token ${DEEPGRAM_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: row.source_url, model: 'nova' }),
          });

          if (!dgRes.ok) {
            const txt = await dgRes.text();
            throw new Error(`Deepgram error ${dgRes.status}: ${txt}`);
          }

          const dgJson = await dgRes.json();
          const transcript = dgJson?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

          if (!transcript) {
            throw new Error('empty transcript from Deepgram');
          }

          await updateSermon(row.id, { transcript, status: 'done', processing_error: null }, SUPABASE_URL, SUPABASE_KEY);
        } catch (err) {
          console.error('[cf-transcribe] job error', err?.message || err);
          await updateSermon(row.id, { status: 'error', processing_error: String(err?.message || err) }, SUPABASE_URL, SUPABASE_KEY);
        }
      }
    } catch (err) {
      console.error('[cf-transcribe] loop error', err?.message || err);
    }

    async function updateSermon(id, payload, baseUrl, key) {
      const url = `${baseUrl}/rest/v1/ministry_sermon_library?id=eq.${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        console.error('[cf-transcribe] update failed', res.status, txt);
      }
      return res;
    }
  }
};
