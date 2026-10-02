// supabase/functions/_shared/realtimeBroadcast.ts
//
// Server-side send to a public Supabase Realtime broadcast channel, via
// Realtime's REST endpoint (no websocket needed from an edge function).
// Used as a content-free "something changed, re-fetch" ping for pages that
// have no Supabase auth session and so can't use postgres_changes through
// RLS: /speak (translation-submit-question) and the bilingual Conversation
// tab (bilingual-conversation). Public channels are readable by anyone
// who knows the topic, so callers only ever send ids here, never text.
//
// Best-effort: a failed ping never fails the caller's request, since every
// subscriber also polls as a backstop.

export async function broadcastPing(
  supabaseUrl: string,
  serviceRoleKey: string,
  topic: string,
  event: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ messages: [{ topic, event, payload, private: false }] }),
    });
    if (!res.ok) console.error(`[realtimeBroadcast] ${topic}/${event} failed: ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error(`[realtimeBroadcast] ${topic}/${event} failed:`, err);
  }
}
