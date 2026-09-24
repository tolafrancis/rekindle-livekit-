// Postgres access: a pooled client for queries, plus one dedicated
// connection that LISTENs on "caption_dispatch" (migration 0372's
// claim_caption_session sends it). Supabase Realtime doesn't relay arbitrary
// pg_notify channels, so this needs a real session-mode connection.

import pg from 'pg';
import { config } from './config.js';

export interface CaptionDispatch {
  action: 'start';
  session_id: string;
  org_id: string;
  room_id: string;
  room_name: string;
  source_language: string;
  /** Set on rows read back from the table (recovery), not on notifies. */
  status?: 'starting' | 'active';
}

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4 });

/** Moves a session from 'starting' to 'active'. Returns false if it was
 *  already claimed or ended, so a duplicate notify never starts a second
 *  agent for the same session. */
export async function claimSession(sessionId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `update public.caption_sessions
        set status = 'active', last_heartbeat_at = now()
      where id = $1 and status = 'starting'`,
    [sessionId],
  );
  return (rowCount ?? 0) > 0;
}

export async function heartbeat(sessionId: string): Promise<void> {
  await pool.query(
    `update public.caption_sessions set last_heartbeat_at = now()
      where id = $1 and status = 'active'`,
    [sessionId],
  );
}

export async function endSession(sessionId: string, reason: string): Promise<void> {
  await pool.query(
    `update public.caption_sessions
        set status = 'ended', ended_at = now(), stop_reason = $2
      where id = $1 and status <> 'ended'`,
    [sessionId, reason],
  );
}

/** Adds caption minutes; returns the org's total for today (UTC). */
export async function recordUsage(orgId: string, roomId: string, minutes: number): Promise<number> {
  const { rows } = await pool.query<{ total: number }>(
    'select public.record_caption_usage($1, $2, $3, $4) as total',
    [orgId, roomId, minutes, config.orgDailyAlertMinutes],
  );
  return rows[0]?.total ?? 0;
}

/** Sessions to pick up that this process isn't running: 'starting' rows
 *  whose notify was missed (e.g. during a LISTEN reconnect), and 'active'
 *  rows with a fresh heartbeat left over from before a restart. */
export async function findRecoverableSessions(): Promise<CaptionDispatch[]> {
  const { rows } = await pool.query<{
    id: string; org_id: string; room_id: string; room_name: string; source_language: string; status: string;
  }>(
    `select id, org_id, room_id, room_name, source_language, status
       from public.caption_sessions
      where status in ('starting', 'active')
        and last_heartbeat_at > now() - interval '2 minutes'`,
  );
  return rows.map((r) => ({
    action: 'start',
    session_id: r.id,
    org_id: r.org_id,
    room_id: r.room_id,
    room_name: r.room_name,
    source_language: r.source_language,
    status: r.status === 'active' ? 'active' : 'starting',
  }));
}

/** LISTEN "caption_dispatch" with automatic reconnect. */
export function listenForDispatch(onDispatch: (d: CaptionDispatch) => void): void {
  let retryMs = 1000;

  const connect = async () => {
    const client = new pg.Client({ connectionString: config.databaseUrl });
    let retrying = false;
    const reconnect = () => {
      if (retrying) return;
      retrying = true;
      client.removeAllListeners();
      client.on('error', () => {}); // a late error on a dead client must not crash the process
      client.end().catch(() => {});
      setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 30_000);
    };
    client.on('error', (err) => {
      console.error('[db] LISTEN connection error:', err.message);
      reconnect();
    });
    client.on('notification', (msg) => {
      if (msg.channel !== 'caption_dispatch' || !msg.payload) return;
      try {
        const payload = JSON.parse(msg.payload) as CaptionDispatch;
        if (payload.action === 'start' && payload.session_id && payload.room_name) onDispatch(payload);
        else console.warn('[db] ignoring malformed caption_dispatch payload:', msg.payload);
      } catch {
        console.warn('[db] ignoring non-JSON caption_dispatch payload');
      }
    });
    try {
      await client.connect();
      await client.query('LISTEN caption_dispatch');
      retryMs = 1000;
      console.log('[db] listening on caption_dispatch');
    } catch (err) {
      console.error('[db] could not start LISTEN:', (err as Error).message);
      reconnect();
    }
  };

  void connect();
}
