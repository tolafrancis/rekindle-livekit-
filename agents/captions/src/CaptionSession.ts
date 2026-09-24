// One caption agent in one LiveKit room.
//
// Joins as a HIDDEN participant (never shown as a tile, never counted in any
// client's participant list), subscribes to every real speaker's microphone,
// transcribes whoever is actively speaking, and publishes the results as
// LiveKit transcription events attributed to the speaker's own identity and
// track. Nothing is stored, so participants who turn CC on later only see
// captions from that moment on.
//
// Webinar rooms: every update is also broadcast over Supabase Realtime for
// the HLS audience (HlsBroadcaster), who count as caption viewers through
// their heartbeat (caption_sessions.hls_viewer_seen_at, migration 0373).
//
// Stops when:
//   - no participant has the attribute captions=on, and no HLS viewer has
//     heartbeated, for config.idleStopMs (3 min)
//   - the room ends (the agent is disconnected)
//   - nothing at all was transcribed for config.noSpeechStopMs (30 min) — an
//     abuse guard, not a limit: normal meetings never come close.

import {
  Room,
  RoomEvent,
  TrackKind,
  TrackSource,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { AGENT_IDENTITY_PREFIX, config } from './config.js';
import { claimSession, endSession, heartbeat, recordUsage, type CaptionDispatch, type RoomKind } from './db.js';
import { HlsBroadcaster } from './HlsBroadcaster.js';
import { SpeakerTranscriber, type CaptionUpdate } from './SpeakerTranscriber.js';

const HEARTBEAT_MS = 30_000;
const USAGE_TICK_MS = 60_000;

export class CaptionSession {
  readonly sessionId: string;
  private readonly dispatch: CaptionDispatch;
  private readonly onEnded: (sessionId: string) => void;
  private readonly room = new Room();
  private readonly transcribers = new Map<string, SpeakerTranscriber>(); // by track sid
  private activeSpeakers = new Set<string>();
  private idleTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private usageTimer: NodeJS.Timeout | null = null;
  private lastUsageTickAt = 0;
  private lastSpeechAt = Date.now();
  private alerted = false;
  private stopped = false;
  private hlsViewerRecent = false;
  private broadcaster: HlsBroadcaster | null = null;
  private readonly log: (...args: unknown[]) => void;

  constructor(dispatch: CaptionDispatch, onEnded: (sessionId: string) => void) {
    this.dispatch = dispatch;
    this.sessionId = dispatch.session_id;
    this.onEnded = onEnded;
    this.log = (...args) => console.log(`[session ${this.sessionId.slice(0, 8)} ${dispatch.room_name}]`, ...args);
  }

  /** `resuming` = picking up an already-'active' row after an agent restart. */
  async start(resuming: boolean): Promise<void> {
    const roomKind: RoomKind | null = resuming
      ? (this.dispatch.room_kind ?? 'ministry_meeting')
      : await claimSession(this.sessionId);
    if (!roomKind) {
      this.log('already claimed or ended — skipping');
      this.onEnded(this.sessionId);
      return;
    }
    if (roomKind === 'ministry_webinar') {
      this.broadcaster = HlsBroadcaster.forRoom(this.dispatch.room_name);
      if (!this.broadcaster) this.log('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — HLS attendees will get no captions');
    }

    try {
      const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
        identity: `${AGENT_IDENTITY_PREFIX}${this.sessionId}`,
        name: 'Captions',
        ttl: '24h',
      });
      at.addGrant({
        room: this.dispatch.room_name,
        roomJoin: true,
        canSubscribe: true,
        canPublish: false,
        canPublishData: true,
        hidden: true,
      });

      this.wireEvents();
      await this.room.connect(config.livekitUrl, await at.toJwt(), { autoSubscribe: false, dynacast: false });
      this.log(resuming ? 'resumed' : 'joined');
    } catch (err) {
      console.error(`[session ${this.sessionId.slice(0, 8)}] could not join room:`, (err as Error).message);
      await this.stop('join_failed');
      return;
    }

    for (const participant of this.room.remoteParticipants.values()) {
      for (const pub of participant.trackPublications.values()) {
        this.maybeSubscribe(pub as RemoteTrackPublication, participant);
      }
    }

    this.lastUsageTickAt = Date.now();
    await this.beat();
    this.heartbeatTimer = setInterval(() => void this.beat(), HEARTBEAT_MS);
    this.usageTimer = setInterval(() => void this.usageTick(), USAGE_TICK_MS);
    this.updateCaptionViewers();
  }

  private async beat(): Promise<void> {
    try {
      const { hlsViewerRecent } = await heartbeat(this.sessionId);
      if (hlsViewerRecent !== this.hlsViewerRecent) {
        this.hlsViewerRecent = hlsViewerRecent;
        this.updateCaptionViewers();
      }
    } catch (err) {
      console.warn('[session] heartbeat failed:', (err as Error).message);
    }
  }

  /** Disconnect without ending the DB row (graceful agent shutdown): the
   *  row's heartbeat stays fresh for 2 minutes, so a restarted agent resumes. */
  async detach(): Promise<void> {
    this.stopped = true;
    this.clearTimers();
    this.broadcaster?.close();
    for (const t of this.transcribers.values()) t.close();
    this.transcribers.clear();
    await this.room.disconnect().catch(() => {});
  }

  async stop(reason: string): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.log('stopping:', reason);
    this.clearTimers();
    this.broadcaster?.close();
    for (const t of this.transcribers.values()) t.close();
    this.transcribers.clear();

    // Round the final partial minute up (only if the agent ran at all).
    if (this.lastUsageTickAt && Date.now() - this.lastUsageTickAt >= 1000) {
      await recordUsage(this.dispatch.org_id, this.dispatch.room_id, 1).catch((err) =>
        console.warn('[session] final usage record failed:', err.message));
    }
    await endSession(this.sessionId, reason).catch((err) =>
      console.error('[session] could not mark session ended:', err.message));
    await this.room.disconnect().catch(() => {});
    this.onEnded(this.sessionId);
  }

  private clearTimers(): void {
    for (const t of [this.idleTimer, this.heartbeatTimer, this.usageTimer]) if (t) clearTimeout(t);
    this.idleTimer = this.heartbeatTimer = this.usageTimer = null;
  }

  private wireEvents(): void {
    this.room
      .on(RoomEvent.TrackPublished, (pub, participant) => this.maybeSubscribe(pub, participant))
      .on(RoomEvent.TrackSubscribed, (track, pub, participant) => this.onTrackSubscribed(track, pub, participant))
      .on(RoomEvent.TrackUnsubscribed, (_track, pub) => this.dropTranscriber(pub.sid))
      .on(RoomEvent.TrackUnpublished, (pub) => this.dropTranscriber(pub.sid))
      .on(RoomEvent.ParticipantConnected, () => this.updateCaptionViewers())
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        for (const pub of participant.trackPublications.values()) this.dropTranscriber(pub.sid);
        this.updateCaptionViewers();
      })
      .on(RoomEvent.ParticipantAttributesChanged, () => this.updateCaptionViewers())
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => this.onActiveSpeakers(speakers))
      .on(RoomEvent.Disconnected, () => void this.stop('room_ended'));
  }

  /** Real speakers only: never the agent itself, a translation bot's
   *  translated-audio track, or a native screen-share shadow connection. */
  private isSpeaker(participant: Participant): boolean {
    const id = participant.identity;
    return !id.startsWith(AGENT_IDENTITY_PREFIX) && !id.startsWith('rlt-bot-') && !id.endsWith('-screenshare');
  }

  private maybeSubscribe(pub: RemoteTrackPublication, participant: RemoteParticipant): void {
    if (!this.isSpeaker(participant) || pub.kind !== TrackKind.KIND_AUDIO) return;
    // Microphone covers normal participants; SOURCE_UNKNOWN covers ingress
    // (OBS/RTMP), whose audio track isn't tagged as a microphone.
    if (pub.source !== TrackSource.SOURCE_MICROPHONE && pub.source !== TrackSource.SOURCE_UNKNOWN) return;
    pub.setSubscribed(true);
  }

  private onTrackSubscribed(track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant): void {
    if (this.stopped || track.kind !== TrackKind.KIND_AUDIO || !pub.sid || this.transcribers.has(pub.sid)) return;
    const transcriber = new SpeakerTranscriber({
      track,
      trackSid: pub.sid,
      speakerIdentity: participant.identity,
      language: this.dispatch.source_language || 'en',
      segmentPrefix: this.sessionId.slice(0, 8),
      onUpdate: (update) => void this.publish(update),
      onSpeech: () => { this.lastSpeechAt = Date.now(); },
    });
    transcriber.setActive(this.activeSpeakers.has(participant.identity));
    this.transcribers.set(pub.sid, transcriber);
  }

  private dropTranscriber(trackSid: string | undefined): void {
    if (!trackSid) return;
    this.transcribers.get(trackSid)?.close();
    this.transcribers.delete(trackSid);
  }

  private onActiveSpeakers(speakers: Participant[]): void {
    this.activeSpeakers = new Set(speakers.filter((p) => this.isSpeaker(p)).map((p) => p.identity));
    for (const participant of this.room.remoteParticipants.values()) {
      const active = this.activeSpeakers.has(participant.identity);
      for (const pub of participant.trackPublications.values()) {
        if (pub.sid) this.transcribers.get(pub.sid)?.setActive(active);
      }
    }
  }

  /** Count participants with captions=on; arm or cancel the idle stop. */
  private updateCaptionViewers(): void {
    if (this.stopped) return;
    let viewers = 0;
    for (const participant of this.room.remoteParticipants.values()) {
      if (participant.attributes?.captions === 'on' && !participant.identity.startsWith(AGENT_IDENTITY_PREFIX)) viewers += 1;
    }
    if (this.hlsViewerRecent) viewers += 1;
    if (viewers > 0) {
      if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; this.log(`${viewers} caption viewer(s) — idle stop cancelled`); }
    } else if (!this.idleTimer) {
      this.log(`no caption viewers — stopping in ${config.idleStopMs / 1000}s unless someone turns CC on`);
      this.idleTimer = setTimeout(() => void this.stop('no_caption_viewers'), config.idleStopMs);
    }
  }

  private async publish(update: CaptionUpdate): Promise<void> {
    if (this.stopped) return;
    if (this.broadcaster) {
      const speaker = this.room.remoteParticipants.get(update.speakerIdentity);
      this.broadcaster.send(update, speaker?.name || update.speakerIdentity);
    }
    try {
      await this.room.localParticipant?.publishTranscription({
        participantIdentity: update.speakerIdentity,
        trackSid: update.trackSid,
        segments: [{
          id: update.segmentId,
          text: update.text,
          startTime: BigInt(update.startMs),
          endTime: BigInt(update.endMs),
          language: update.language,
          final: update.final,
        }],
      });
    } catch (err) {
      console.warn('[session] publishTranscription failed:', (err as Error).message);
    }
  }

  private async usageTick(): Promise<void> {
    if (this.stopped) return;
    this.lastUsageTickAt = Date.now();
    try {
      const orgTotalToday = await recordUsage(this.dispatch.org_id, this.dispatch.room_id, 1);
      if (!this.alerted && orgTotalToday >= config.orgDailyAlertMinutes) {
        this.alerted = true;
        console.warn(`[session ${this.sessionId.slice(0, 8)}] ALERT: org ${this.dispatch.org_id} is at ${orgTotalToday} caption minutes today (threshold ${config.orgDailyAlertMinutes})`);
      }
    } catch (err) {
      console.warn('[session] usage record failed:', (err as Error).message);
    }
    if (Date.now() - this.lastSpeechAt >= config.noSpeechStopMs) {
      console.warn(`[session ${this.sessionId.slice(0, 8)}] ABUSE GUARD: no speech transcribed for ${config.noSpeechStopMs / 60_000} minutes — stopping`);
      await this.stop('no_speech_timeout');
    }
  }
}
