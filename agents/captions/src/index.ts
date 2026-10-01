// Rekindle caption agent — entry point.
//
// Waits for caption_dispatch notifications (sent by claim_caption_session when
// a participant turns CC on and no agent is running for that room yet) and runs
// one CaptionSession per room. Runs as a single process: sessions are claimed
// with a conditional 'starting' → 'active' update, so a duplicate notify can
// never start a second agent for the same session.

import { dispose } from '@livekit/rtc-node';
import { CaptionSession } from './CaptionSession.js';
import { findRecoverableSessions, listenForDispatch, pool, type CaptionDispatch } from './db.js';

const RECOVERY_POLL_MS = 30_000;

const sessions = new Map<string, CaptionSession>();

function launch(dispatch: CaptionDispatch, resuming: boolean): void {
  if (sessions.has(dispatch.session_id)) return;
  const session = new CaptionSession(dispatch, (id) => sessions.delete(id));
  sessions.set(dispatch.session_id, session);
  session.start(resuming).catch((err) => {
    console.error('[index] session failed to start:', err);
    sessions.delete(dispatch.session_id);
  });
}

async function recover(onBoot: boolean): Promise<void> {
  try {
    for (const row of await findRecoverableSessions()) {
      if (sessions.has(row.session_id)) continue;
      // On boot, 'active' rows are ours from before the restart; later, only
      // pick up 'starting' rows whose notify we missed.
      if (row.status === 'active' && !onBoot) continue;
      launch(row, row.status === 'active');
    }
  } catch (err) {
    console.error('[index] recovery scan failed:', (err as Error).message);
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[index] ${signal} — detaching ${sessions.size} session(s) for resume after restart`);
  await Promise.all([...sessions.values()].map((s) => s.detach()));
  await pool.end().catch(() => {});
  await dispose().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

listenForDispatch((dispatch) => launch({ ...dispatch, status: 'starting' }, false));
void recover(true);
setInterval(() => void recover(false), RECOVERY_POLL_MS);
console.log('[index] caption agent started');
