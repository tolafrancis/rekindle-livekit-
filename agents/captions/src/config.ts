// Environment config — read once at startup, fail fast on anything missing.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function minutes(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  livekitUrl: required('LIVEKIT_URL'),
  livekitApiKey: required('LIVEKIT_API_KEY'),
  livekitApiSecret: required('LIVEKIT_API_SECRET'),
  databaseUrl: required('DATABASE_URL'),
  deepgramApiKey: required('DEEPGRAM_API_KEY'),

  // Supabase Realtime broadcast to webinar audiences watching over HLS.
  // Optional: without them, webinar in-room captions still work but HLS
  // attendees get none (logged once per session).
  supabaseUrl: process.env.SUPABASE_URL || null,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,

  // nova-3 is Deepgram's most accurate English model; nova-2 covers the
  // widest language set (and is what the translation bot already runs).
  deepgramModelEn: process.env.CAPTION_DEEPGRAM_MODEL_EN || 'nova-3',
  deepgramModel: process.env.CAPTION_DEEPGRAM_MODEL || 'nova-2',

  // Stop once no participant has captions=on for this long.
  idleStopMs: minutes('CAPTION_IDLE_STOP_MINUTES', 3) * 60_000,
  // Abuse guard only: stop if nothing at all was transcribed for this long.
  noSpeechStopMs: minutes('CAPTION_NO_SPEECH_STOP_MINUTES', 30) * 60_000,
  // Internal alert (log + platform-admin notification) when one org passes
  // this many caption minutes in a UTC day. Never a user-facing cap.
  orgDailyAlertMinutes: minutes('CAPTION_ORG_DAILY_ALERT_MINUTES', 3000),
};

/** Identity prefix for the agent's own (hidden) LiveKit participant. Must
 *  match AGENT_IDENTITY_PREFIX in supabase/functions/captions-start. */
export const AGENT_IDENTITY_PREFIX = 'caption-agent-';
