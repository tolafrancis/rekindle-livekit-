// One speaker's audio track → Deepgram streaming STT → caption updates.
//
// Audio is only SENT to Deepgram while the speaker is an active speaker (plus
// a short hangover), so a room of muted or silent participants costs nothing.
// The track is still read continuously so a short pre-roll buffer is always
// ready: LiveKit's active-speaker signal lags speech onset by a few hundred
// ms, and without pre-roll every caption would lose its first word.
//
// Caption segments: each Deepgram is_final chunk is one segment. Interim
// results for that chunk reuse the segment's id (so the client replaces the
// line in place) and the final result closes it; the next chunk gets a new
// id. Ids are prefixed per session, so they stay unique across agent restarts.

import { AudioStream, type AudioFrame, type RemoteTrack } from '@livekit/rtc-node';
import { createClient, LiveTranscriptionEvents, type ListenLiveClient } from '@deepgram/sdk';
import { config } from './config.js';

export interface CaptionUpdate {
  segmentId: string;
  text: string;
  final: boolean;
  /** Wall-clock (epoch ms) when the words in this segment were spoken. */
  startMs: number;
  endMs: number;
  speakerIdentity: string;
  trackSid: string;
  language: string;
}

interface SpeakerTranscriberOptions {
  track: RemoteTrack;
  trackSid: string;
  speakerIdentity: string;
  language: string;
  segmentPrefix: string;
  onUpdate: (update: CaptionUpdate) => void;
  onSpeech: () => void;
}

const SAMPLE_RATE = 16_000;
const PRE_ROLL_MS = 400;
const GATE_HANGOVER_MS = 1_500;
const KEEPALIVE_MS = 8_000;
const IDLE_CLOSE_MS = 60_000;

interface BufferedFrame {
  pcm: ArrayBuffer;
  wallMs: number;
  durationMs: number;
}

// One Deepgram connection. Deepgram's result offsets count only the audio
// this connection was actually sent; checkpoints map that audio timeline back
// to wall-clock time across gate open/close gaps.
class DeepgramConnection {
  readonly live: ListenLiveClient;
  ready = false;
  closedByUs = false;
  sentMs = 0;
  private pending: ArrayBuffer[] = [];
  private checkpoints: Array<{ sentMs: number; wallMs: number }> = [];
  private lastWallEndMs = 0;

  constructor(language: string) {
    const model = language === 'en' ? config.deepgramModelEn : config.deepgramModel;
    this.live = createClient(config.deepgramApiKey).listen.live({
      model,
      language,
      encoding: 'linear16',
      sample_rate: SAMPLE_RATE,
      channels: 1,
      interim_results: true,
      smart_format: true,
      punctuate: true,
      endpointing: 300,
      utterance_end_ms: 1000,
    });
  }

  send(frame: BufferedFrame): void {
    // A gap in wall-clock time (gate was closed) starts a new checkpoint.
    if (this.checkpoints.length === 0 || Math.abs(frame.wallMs - this.lastWallEndMs) > 50) {
      this.checkpoints.push({ sentMs: this.sentMs, wallMs: frame.wallMs });
    }
    this.lastWallEndMs = frame.wallMs + frame.durationMs;
    this.sentMs += frame.durationMs;
    if (this.ready) this.live.send(frame.pcm);
    else this.pending.push(frame.pcm);
  }

  flushPending(): void {
    for (const pcm of this.pending) this.live.send(pcm);
    this.pending = [];
  }

  /** Deepgram audio offset (seconds) → wall-clock epoch ms. */
  wallClock(offsetSec: number): number {
    const offsetMs = offsetSec * 1000;
    let cp = this.checkpoints[0] ?? { sentMs: 0, wallMs: Date.now() };
    for (const c of this.checkpoints) {
      if (c.sentMs <= offsetMs) cp = c;
      else break;
    }
    return Math.round(cp.wallMs + (offsetMs - cp.sentMs));
  }
}

export class SpeakerTranscriber {
  private readonly opts: SpeakerTranscriberOptions;
  private readonly stream: AudioStream;
  private preRoll: BufferedFrame[] = [];
  private preRollMs = 0;
  private active = false;
  private gateOpen = false;
  private gateCloseTimer: NodeJS.Timeout | null = null;
  private idleCloseTimer: NodeJS.Timeout | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private dg: DeepgramConnection | null = null;
  private segmentCounter = 0;
  private interimShown = false;
  private closed = false;

  constructor(opts: SpeakerTranscriberOptions) {
    this.opts = opts;
    this.stream = new AudioStream(opts.track, SAMPLE_RATE, 1);
    void this.readLoop();
  }

  /** Called whenever the room's active-speaker set changes. */
  setActive(active: boolean): void {
    if (this.closed || active === this.active) return;
    this.active = active;
    if (active) {
      if (this.gateCloseTimer) clearTimeout(this.gateCloseTimer);
      this.gateCloseTimer = null;
      if (this.idleCloseTimer) clearTimeout(this.idleCloseTimer);
      this.idleCloseTimer = null;
      if (!this.gateOpen) this.openGate();
    } else if (this.gateOpen && !this.gateCloseTimer) {
      this.gateCloseTimer = setTimeout(() => this.closeGate(), GATE_HANGOVER_MS);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const t of [this.gateCloseTimer, this.idleCloseTimer, this.keepAliveTimer]) if (t) clearTimeout(t);
    this.closeDeepgram();
    this.stream.cancel().catch(() => {});
  }

  private async readLoop(): Promise<void> {
    const reader = this.stream.getReader();
    try {
      while (!this.closed) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        this.onFrame(value);
      }
    } catch (err) {
      if (!this.closed) console.warn(`[transcriber ${this.opts.speakerIdentity}] audio stream ended:`, (err as Error).message);
    } finally {
      reader.releaseLock();
    }
  }

  private onFrame(frame: AudioFrame): void {
    const durationMs = (frame.samplesPerChannel / frame.sampleRate) * 1000;
    const buffered: BufferedFrame = {
      // Int16Array.slice() copies into a dedicated ArrayBuffer — the SDK's
      // frame view may share memory we don't own.
      pcm: frame.data.slice().buffer,
      wallMs: Date.now() - durationMs,
      durationMs,
    };
    if (this.gateOpen) {
      this.ensureDeepgram().send(buffered);
      return;
    }
    this.preRoll.push(buffered);
    this.preRollMs += durationMs;
    while (this.preRollMs > PRE_ROLL_MS && this.preRoll.length > 1) {
      this.preRollMs -= this.preRoll.shift()!.durationMs;
    }
  }

  private openGate(): void {
    this.gateOpen = true;
    const dg = this.ensureDeepgram();
    for (const f of this.preRoll) dg.send(f);
    this.preRoll = [];
    this.preRollMs = 0;
  }

  private closeGate(): void {
    this.gateCloseTimer = null;
    this.gateOpen = false;
    // Ask Deepgram to finalize whatever it's still holding, so the last words
    // of a turn don't sit as an interim line until the next time they speak.
    try { if (this.dg?.ready) this.dg.live.finalize(); } catch { /* socket gone */ }
    this.idleCloseTimer = setTimeout(() => {
      this.idleCloseTimer = null;
      this.closeDeepgram();
    }, IDLE_CLOSE_MS);
  }

  private ensureDeepgram(): DeepgramConnection {
    if (this.dg) return this.dg;
    const dg = new DeepgramConnection(this.opts.language);
    this.dg = dg;
    const tag = `[transcriber ${this.opts.speakerIdentity}]`;

    dg.live.on(LiveTranscriptionEvents.Open, () => {
      dg.ready = true;
      dg.flushPending();
      if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = setInterval(() => {
        try { if (dg.ready) dg.live.keepAlive(); } catch { /* closing */ }
      }, KEEPALIVE_MS);
    });
    dg.live.on(LiveTranscriptionEvents.Transcript, (data: unknown) => this.onResult(dg, data));
    dg.live.on(LiveTranscriptionEvents.Error, (err: unknown) => {
      console.error(tag, 'Deepgram error:', err instanceof Error ? err.message : err);
    });
    dg.live.on(LiveTranscriptionEvents.Close, () => {
      dg.ready = false;
      if (this.dg === dg) {
        this.dg = null;
        if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
      }
      // An unexpected close mid-turn: the next frame lazily opens a fresh
      // connection, so captions recover on their own.
      if (!dg.closedByUs && !this.closed) console.warn(tag, 'Deepgram connection closed unexpectedly; will reconnect on next speech');
    });
    return dg;
  }

  private closeDeepgram(): void {
    const dg = this.dg;
    if (!dg) return;
    this.dg = null;
    dg.closedByUs = true;
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
    try { dg.live.requestClose(); } catch { /* already closed */ }
  }

  private onResult(dg: DeepgramConnection, data: unknown): void {
    const result = data as {
      is_final?: boolean;
      start?: number;
      duration?: number;
      channel?: { alternatives?: Array<{ transcript?: string }> };
    };
    const text = (result.channel?.alternatives?.[0]?.transcript ?? '').trim();
    const isFinal = result.is_final === true;
    const segmentId = `${this.opts.segmentPrefix}-${this.opts.speakerIdentity}-${this.segmentCounter}`;

    if (!text) {
      // An empty final after a visible interim clears that line on the client.
      if (isFinal && this.interimShown) this.emit(segmentId, '', true, dg, result.start ?? 0, result.duration ?? 0);
      if (isFinal) { this.interimShown = false; this.segmentCounter += 1; }
      return;
    }

    this.emit(segmentId, text, isFinal, dg, result.start ?? 0, result.duration ?? 0);
    this.opts.onSpeech();
    if (isFinal) {
      this.interimShown = false;
      this.segmentCounter += 1;
    } else {
      this.interimShown = true;
    }
  }

  private emit(segmentId: string, text: string, final: boolean, dg: DeepgramConnection, start: number, duration: number): void {
    this.opts.onUpdate({
      segmentId,
      text,
      final,
      startMs: dg.wallClock(start),
      endMs: dg.wallClock(start + duration),
      speakerIdentity: this.opts.speakerIdentity,
      trackSid: this.opts.trackSid,
      language: this.opts.language,
    });
  }
}
