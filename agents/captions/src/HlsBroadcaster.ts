// Caption delivery to webinar audiences watching over HLS. They never join
// the LiveKit room, so they can't receive LiveKit transcription events;
// instead every segment update is also broadcast on the Supabase Realtime
// channel "captions:<room name>" (event "caption"), via Realtime's REST
// broadcast endpoint. Each payload carries the wall-clock time the words were
// spoken, and the viewer holds it back until HLS playback reaches that moment
// (packages/live/src/useHlsCaptions.ts).
//
// Interim updates are throttled per speaker (at most one every 250 ms, always
// ending on the latest text); finals are sent immediately.

import { config } from './config.js';
import type { CaptionUpdate } from './SpeakerTranscriber.js';

const INTERIM_MIN_INTERVAL_MS = 250;

export interface HlsCaptionPayload {
  id: string;
  text: string;
  final: boolean;
  language: string;
  startTime: number;
  endTime: number;
  speakerIdentity: string;
  speakerName: string;
}

export class HlsBroadcaster {
  private readonly topic: string;
  private readonly endpoint: string;
  private readonly key: string;
  private readonly lastSentAt = new Map<string, number>(); // by speaker
  private readonly pending = new Map<string, { payload: HlsCaptionPayload; timer: NodeJS.Timeout }>(); // by speaker
  private warned = false;

  constructor(roomName: string, supabaseUrl: string, serviceRoleKey: string) {
    this.topic = `captions:${roomName}`;
    this.endpoint = `${supabaseUrl.replace(/\/$/, '')}/realtime/v1/api/broadcast`;
    this.key = serviceRoleKey;
  }

  static forRoom(roomName: string): HlsBroadcaster | null {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) return null;
    return new HlsBroadcaster(roomName, config.supabaseUrl, config.supabaseServiceRoleKey);
  }

  send(update: CaptionUpdate, speakerName: string): void {
    const payload: HlsCaptionPayload = {
      id: update.segmentId,
      text: update.text,
      final: update.final,
      language: update.language,
      startTime: update.startMs,
      endTime: update.endMs,
      speakerIdentity: update.speakerIdentity,
      speakerName,
    };
    const speaker = update.speakerIdentity;
    const queued = this.pending.get(speaker);

    if (update.final) {
      // A final supersedes any interim still waiting for the same speaker.
      if (queued) { clearTimeout(queued.timer); this.pending.delete(speaker); }
      this.post(payload, speaker);
      return;
    }

    const wait = INTERIM_MIN_INTERVAL_MS - (Date.now() - (this.lastSentAt.get(speaker) ?? 0));
    if (wait <= 0 && !queued) {
      this.post(payload, speaker);
      return;
    }
    if (queued) {
      queued.payload = payload; // keep only the newest interim
      return;
    }
    const timer = setTimeout(() => {
      const entry = this.pending.get(speaker);
      this.pending.delete(speaker);
      if (entry) this.post(entry.payload, speaker);
    }, Math.max(wait, 0));
    this.pending.set(speaker, { payload, timer });
  }

  close(): void {
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
  }

  private post(payload: HlsCaptionPayload, speaker: string): void {
    this.lastSentAt.set(speaker, Date.now());
    fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
      },
      body: JSON.stringify({
        messages: [{ topic: this.topic, event: 'caption', payload, private: false }],
      }),
      signal: AbortSignal.timeout(5000),
    })
      .then((res) => {
        if (!res.ok && !this.warned) {
          this.warned = true;
          console.warn(`[hls] Realtime broadcast failed (${res.status}) for ${this.topic}`);
        }
      })
      .catch((err) => {
        if (!this.warned) {
          this.warned = true;
          console.warn(`[hls] Realtime broadcast error for ${this.topic}:`, (err as Error).message);
        }
      });
  }
}
