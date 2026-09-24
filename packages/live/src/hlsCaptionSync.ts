/**
 * Holds on-demand captions for an HLS viewer until playback reaches them.
 *
 * The caption agent broadcasts each segment update with the wall-clock time
 * the words were spoken (startTime/endTime, the agent's server clock). HLS
 * video runs several seconds behind, so showing captions on arrival would
 * put the text AHEAD of the audio. Instead every version of every segment is
 * buffered, and a version is only shown once the playback position has
 * passed its endTime — i.e. once the viewer has actually heard those words.
 * Interim versions of a segment are superseded in place by later ones, so a
 * line grows in step with the audio and settles on its final text.
 *
 * Timestamps are absolute per segment, so nothing accumulates: a 90-minute
 * session can't drift. Segments are keyed by their stable id, so a message
 * delivered twice can't produce a duplicate line.
 */

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

export interface SyncedCaptionLine {
  id: string;
  text: string;
  final: boolean;
  language: string;
  startTime: number;
  endTime: number;
  speakerIdentity: string;
  speakerName: string;
}

interface SegmentVersion {
  endTime: number;
  text: string;
  final: boolean;
}

interface BufferedSegment {
  startTime: number;
  language: string;
  speakerIdentity: string;
  speakerName: string;
  versions: SegmentVersion[]; // ascending endTime
}

const MAX_LINES = 6;
// Lines already heard this long ago are dropped from the buffer.
const KEEP_HEARD_MS = 30_000;
// A segment that never becomes playable (e.g. the viewer paused, then
// jumped back to live) is dropped once it's this old relative to playback.
const MAX_AGE_MS = 5 * 60_000;

export class HlsCaptionBuffer {
  private readonly segments = new Map<string, BufferedSegment>();

  add(p: HlsCaptionPayload): void {
    let seg = this.segments.get(p.id);
    if (!seg) {
      seg = {
        startTime: p.startTime,
        language: p.language,
        speakerIdentity: p.speakerIdentity,
        speakerName: p.speakerName,
        versions: [],
      };
      this.segments.set(p.id, seg);
    }
    const last = seg.versions[seg.versions.length - 1];
    // Once final, a segment never goes back to interim (late delivery).
    if (last?.final && !p.final) return;
    const version: SegmentVersion = { endTime: p.endTime, text: p.text, final: p.final };
    const sameEnd = seg.versions.findIndex((v) => v.endTime === p.endTime);
    if (sameEnd !== -1) {
      // Same point in the audio: the newer message (or the final) wins.
      if (!seg.versions[sameEnd].final || p.final) seg.versions[sameEnd] = version;
    } else {
      seg.versions.push(version);
      seg.versions.sort((a, b) => a.endTime - b.endTime);
    }
    seg.startTime = Math.min(seg.startTime, p.startTime);
  }

  /** The lines to show when playback is at `playbackMs` (agent clock). */
  linesAt(playbackMs: number): SyncedCaptionLine[] {
    const lines: SyncedCaptionLine[] = [];
    for (const [id, seg] of this.segments) {
      const newest = seg.versions[seg.versions.length - 1];
      if (
        (newest.final && newest.endTime < playbackMs - KEEP_HEARD_MS) ||
        seg.startTime < playbackMs - MAX_AGE_MS
      ) {
        this.segments.delete(id);
        continue;
      }
      let heard: SegmentVersion | null = null;
      for (const v of seg.versions) {
        if (v.endTime <= playbackMs) heard = v;
        else break;
      }
      if (!heard || !heard.text) continue;
      lines.push({
        id,
        text: heard.text,
        final: heard.final,
        language: seg.language,
        startTime: seg.startTime,
        endTime: heard.endTime,
        speakerIdentity: seg.speakerIdentity,
        speakerName: seg.speakerName,
      });
    }
    lines.sort((a, b) => a.startTime - b.startTime);
    return lines.length > MAX_LINES ? lines.slice(lines.length - MAX_LINES) : lines;
  }

  clear(): void {
    this.segments.clear();
  }
}

/**
 * Tracks this device's clock offset against the agent's clock, for players
 * that can only estimate playback time on the local clock (no
 * EXT-X-PROGRAM-DATE-TIME). Uses the smallest observed (arrival − endTime):
 * that's clock skew plus the fastest delivery seen, so converted times err
 * slightly LATE (captions a fraction of a second after the words), never
 * early.
 */
export class ClockOffsetEstimator {
  private best: number | null = null;

  observe(payloadEndTime: number, arrivedAtLocalMs: number): void {
    const sample = arrivedAtLocalMs - payloadEndTime;
    if (this.best === null || sample < this.best) this.best = sample;
  }

  /** Converts a local-clock time to the agent's clock, or null until the
   *  first caption has arrived. */
  toAgentClock(localMs: number): number | null {
    return this.best === null ? null : localMs - this.best;
  }
}
