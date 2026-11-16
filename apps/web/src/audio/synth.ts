import type { Cue } from "./cues";
import { getSettings } from "./settings";

/**
 * Every sound is generated here with the Web Audio API: oscillators, filtered noise and gain
 * envelopes. There are no audio files, so there is nothing to license. Browsers only allow audio
 * after a user gesture, so the context is created on the first pointer or key press; cues before
 * that are dropped, not queued.
 */
let ctx: AudioContext | null = null;

function unlock() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
}

interface Tone {
  freq: number;
  /** Frequency at the end (a slide), if different. */
  to?: number;
  type?: OscillatorType;
  start?: number;
  dur: number;
  gain?: number;
}

function tone(
  out: AudioNode,
  t0: number,
  { freq, to, type = "sine", start = 0, dur, gain = 0.3 }: Tone,
) {
  const c = ctx!;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0 + start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + start + dur);
  g.gain.setValueAtTime(0.0001, t0 + start);
  g.gain.exponentialRampToValueAtTime(gain, t0 + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
  osc.connect(g).connect(out);
  osc.start(t0 + start);
  osc.stop(t0 + start + dur + 0.02);
}

interface Noise {
  start?: number;
  dur: number;
  /** Filter frequency. */
  freq: number;
  q?: number;
  gain?: number;
  type?: BiquadFilterType;
}

/** A short burst of filtered noise: clicks, rattles, swishes. */
function noise(
  out: AudioNode,
  t0: number,
  { start = 0, dur, freq, q = 1, gain = 0.3, type = "bandpass" }: Noise,
) {
  const c = ctx!;
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  // Noise for a sound effect: Math.random is fine here (the engine's purity rule doesn't apply).
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(out);
  src.start(t0 + start);
}

const RECIPES: Record<Cue, (out: AudioNode, t: number) => void> = {
  dice: (o, t) => {
    for (let i = 0; i < 6; i++)
      noise(o, t, {
        start: i * 0.055 + (i % 2) * 0.012,
        dur: 0.04,
        freq: 2200 + i * 180,
        q: 4,
        gain: 0.5,
      });
  },
  build: (o, t) => {
    tone(o, t, { freq: 220, to: 140, type: "triangle", dur: 0.12, gain: 0.4 });
    noise(o, t, { dur: 0.05, freq: 900, q: 2, gain: 0.35 });
  },
  city: (o, t) => {
    tone(o, t, { freq: 196, to: 130, type: "triangle", dur: 0.14, gain: 0.4 });
    tone(o, t, { freq: 392, start: 0.12, dur: 0.25, gain: 0.18 });
    tone(o, t, { freq: 587, start: 0.18, dur: 0.3, gain: 0.12 });
  },
  devcard: (o, t) => {
    noise(o, t, { dur: 0.09, freq: 3000, q: 1.5, gain: 0.25, type: "highpass" });
    tone(o, t, { freq: 660, start: 0.06, dur: 0.18, gain: 0.12 });
  },
  yourTurn: (o, t) => {
    tone(o, t, { freq: 523, dur: 0.22, gain: 0.25 });
    tone(o, t, { freq: 784, start: 0.14, dur: 0.4, gain: 0.25 });
  },
  offer: (o, t) => {
    tone(o, t, { freq: 880, dur: 0.5, gain: 0.15 });
    tone(o, t, { freq: 1320, dur: 0.35, gain: 0.06 });
  },
  respond: (o, t) => tone(o, t, { freq: 740, dur: 0.15, gain: 0.12 }),
  robber: (o, t) => {
    tone(o, t, { freq: 110, to: 55, type: "sawtooth", dur: 0.35, gain: 0.18 });
    noise(o, t, { dur: 0.2, freq: 200, q: 1, gain: 0.3, type: "lowpass" });
  },
  steal: (o, t) => noise(o, t, { dur: 0.22, freq: 1800, q: 0.8, gain: 0.35 }),
  discard: (o, t) => {
    tone(o, t, { freq: 440, dur: 0.15, type: "square", gain: 0.06 });
    tone(o, t, { freq: 330, start: 0.15, dur: 0.25, type: "square", gain: 0.06 });
  },
  award: (o, t) => {
    tone(o, t, { freq: 659, dur: 0.18, gain: 0.15 });
    tone(o, t, { freq: 988, start: 0.1, dur: 0.3, gain: 0.15 });
  },
  gain: (o, t) => noise(o, t, { dur: 0.07, freq: 4000, q: 2, gain: 0.2 }),
  win: (o, t) => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(o, t, { freq: f, start: i * 0.12, dur: 0.45, type: "triangle", gain: 0.22 }),
    );
  },
  chat: (o, t) => tone(o, t, { freq: 1175, dur: 0.08, gain: 0.08 }),
};

/** Gap between two cues of one change, so they don't land on top of each other. */
const SPACING = 0.18;

export function play(cues: Cue[]): void {
  const { muted, volume } = getSettings();
  if (muted || volume === 0 || cues.length === 0 || !ctx || ctx.state !== "running") return;
  const out = ctx.createGain();
  out.gain.value = volume;
  out.connect(ctx.destination);
  cues.forEach((cue, i) => RECIPES[cue](out, ctx!.currentTime + 0.01 + i * SPACING));
}
