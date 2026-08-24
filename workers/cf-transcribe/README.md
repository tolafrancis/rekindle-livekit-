Cloudflare Worker: sermon transcribe

Purpose
- Polls Supabase for `ministry_sermon_library` rows where `status='pending'` and `source_url` is present.
- Calls Deepgram (by URL) to transcribe audio and updates the DB row with `transcript` and `status`.

Deployment
1. Install Wrangler: `npm install -g wrangler`
2. Login: `wrangler login`
3. Add secrets:
   - `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`
   - `wrangler secret put SUPABASE_URL`
   - `wrangler secret put DEEPGRAM`
4. Publish: `wrangler publish`

Notes
- Ensure Deepgram supports URL-based transcription for your account. If you prefer OpenAI Whisper, adapt the worker to call an external transcription API that accepts URLs or use a VM worker for heavy processing.
- Keep the Supabase service role key secure; store it as a Wrangler secret, not in source.
