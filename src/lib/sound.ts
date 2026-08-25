let sharedCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!sharedCtx) sharedCtx = new Ctor();
    if (sharedCtx.state === "suspended") void sharedCtx.resume();
    return sharedCtx;
  } catch {
    return null;
  }
}

function tone(ctx: AudioContext, freq: number, startAt: number, duration: number, peakGain: number, type: OscillatorType) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

/** A short synthesized "ding" for a single window lighting up — no audio asset needed. */
export function playIgniteDing() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    tone(ctx, 880, now, 0.4, 0.18, "sine");
    tone(ctx, 1318.5, now + 0.03, 0.35, 0.1, "sine");
  } catch {
    /* ignore — sound is a non-essential flourish */
  }
}

/** A short ascending arpeggio for a full-subject completion — the "big finish" chime. */
export function playFanfare() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => tone(ctx, freq, now + i * 0.11, 0.45, 0.2, "triangle"));
  } catch {
    /* ignore — sound is a non-essential flourish */
  }
}
