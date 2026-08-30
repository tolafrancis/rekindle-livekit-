/**
 * 1 kHz Test Tone Generator for PA mixer AUX RETURN line verification.
 * Emits a calibrated 1000 Hz sine wave tone with smooth attack and decay
 * to prevent popping sound board channels.
 */
export class TestTonePlayer {
  private audioCtx: AudioContext | null = null;
  private isPlaying = false;

  async play(options: {
    frequency?: number;
    durationMs?: number;
    outputDeviceId?: string;
    volume?: number;
  } = {}): Promise<void> {
    if (this.isPlaying) {
      this.stop();
    }

    const {
      frequency = 1000,
      durationMs = 1500,
      outputDeviceId,
      volume = 0.4,
    } = options;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('Web Audio API is not supported in this environment');
    }

    const ctx = new AudioContextClass();
    this.audioCtx = ctx;

    // Direct to chosen sound board output if supported
    if (outputDeviceId && outputDeviceId !== 'default' && typeof (ctx as any).setSinkId === 'function') {
      try {
        await (ctx as any).setSinkId(outputDeviceId);
      } catch (err) {
        console.warn('[TestTone] Could not set output sink ID on AudioContext:', err);
      }
    }

    this.isPlaying = true;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    // Smooth envelope: 50ms fade-in, sustain, 100ms fade-out
    const now = ctx.currentTime;
    const stopTime = now + durationMs / 1000;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.05);
    gain.gain.setValueAtTime(Math.max(0.0001, volume), stopTime - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(stopTime);

    return new Promise((resolve) => {
      setTimeout(() => {
        this.stop();
        resolve();
      }, durationMs + 50);
    });
  }

  stop(): void {
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch { /* ignore */ }
      this.audioCtx = null;
    }
    this.isPlaying = false;
  }
}

export const testTonePlayer = new TestTonePlayer();
