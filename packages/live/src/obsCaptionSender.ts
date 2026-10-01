// Sends caption text to a local OBS Studio over obs-websocket v5 (built into
// OBS 28+: Tools → WebSocket Server Settings), using its SendStreamCaption
// request. OBS then embeds the text in its outgoing stream as CEA-608 closed
// captions — a separate, viewer-toggleable caption track (the "CC" button)
// on platforms that read them from RTMP, e.g. YouTube and Twitch.
//
// Limits worth knowing (see docs/obs-live-captions.md):
// - CEA-608 is only carried when OBS streams DIRECTLY to such a platform. A
//   ReKindle ingest re-encodes the video, which drops embedded captions —
//   use the burned-in overlay for that path instead.
// - CEA-608 only covers basic Latin text (plus some Western European
//   accents); scripts such as Vietnamese tones, Thai, Hindi or CJK won't
//   survive. Burned-in captions have no such limit.
// - OBS only transmits captions while it is actually streaming.

export type ObsCaptionStatus =
  | 'off'
  | 'connecting'
  | 'connected'
  | 'not-streaming'
  | 'auth-failed'
  | 'unreachable';

interface Options {
  port: number;
  password: string;
  onStatus: (s: ObsCaptionStatus) => void;
}

// A CEA-608 caption shows at most 32 characters per row; two rows reads
// comfortably. Longer lines are split at word boundaries and queued — OBS
// displays queued captions one after another.
const MAX_CHUNK = 64;

function chunkText(text: string): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const chunks: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!w) continue;
    if (cur && (cur + ' ' + w).length > MAX_CHUNK) { chunks.push(cur); cur = w; }
    else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function sha256Base64(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  let bin = '';
  new Uint8Array(digest).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

export class ObsCaptionSender {
  private ws: WebSocket | null = null;
  private identified = false;
  private closed = false;
  private retryMs = 1000;
  private requestSeq = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private opts: Options) {}

  connect(): void {
    if (this.closed) return;
    this.opts.onStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${this.opts.port}`);
    } catch {
      this.opts.onStatus('unreachable');
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    this.identified = false;

    ws.onmessage = async (ev) => {
      let msg: { op: number; d: any };
      try { msg = JSON.parse(ev.data as string); } catch { return; }

      if (msg.op === 0) {
        // Hello → Identify (with the challenge-response if a password is set).
        const auth = msg.d?.authentication;
        const identify: Record<string, unknown> = { rpcVersion: 1 };
        if (auth) {
          const secret = await sha256Base64(this.opts.password + auth.salt);
          identify.authentication = await sha256Base64(secret + auth.challenge);
        }
        ws.send(JSON.stringify({ op: 1, d: identify }));
      } else if (msg.op === 2) {
        this.identified = true;
        this.retryMs = 1000;
        this.opts.onStatus('connected');
      } else if (msg.op === 7) {
        // RequestResponse. OBS rejects SendStreamCaption while not streaming.
        const ok = msg.d?.requestStatus?.result;
        this.opts.onStatus(ok ? 'connected' : 'not-streaming');
      }
    };

    // Some runtimes fire only `error` (no `close`) when the connection is
    // refused — e.g. OBS not running — so handle both, once per socket.
    let handled = false;
    const onDisconnect = (code: number) => {
      if (handled) return;
      handled = true;
      this.identified = false;
      try { ws.close(); } catch { /* already closing */ }
      if (this.closed || this.ws !== ws) return;
      // 4009 = obs-websocket "authentication failed": retrying won't help.
      if (code === 4009) { this.opts.onStatus('auth-failed'); return; }
      this.opts.onStatus('unreachable');
      this.scheduleReconnect();
    };
    ws.onclose = (ev) => onDisconnect(ev.code);
    ws.onerror = () => onDisconnect(1006);
  }

  /** Queue a finished caption line for OBS to embed in its stream. */
  send(text: string): void {
    if (!this.ws || !this.identified || this.ws.readyState !== WebSocket.OPEN) return;
    for (const captionText of chunkText(text)) {
      this.ws.send(JSON.stringify({
        op: 6,
        d: { requestType: 'SendStreamCaption', requestId: `cc-${++this.requestSeq}`, requestData: { captionText } },
      }));
    }
  }

  close(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, 15000);
  }
}
