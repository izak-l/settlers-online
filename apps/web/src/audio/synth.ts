/** Explicit synthesized sound sources. Recorded cues never call these recipes. */
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
  c: AudioContext,
  out: AudioNode,
  t0: number,
  { freq, to, type = "sine", start = 0, dur, gain = 0.3 }: Tone,
) {
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
  c: AudioContext,
  out: AudioNode,
  t0: number,
  { start = 0, dur, freq, q = 1, gain = 0.3, type = "bandpass" }: Noise,
) {
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

export const RECIPES = {
  build: (c: AudioContext, o: AudioNode, t: number) => {
    tone(c, o, t, { freq: 220, to: 140, type: "triangle", dur: 0.12, gain: 0.4 });
    noise(c, o, t, { dur: 0.05, freq: 900, q: 2, gain: 0.35 });
  },
  city: (c: AudioContext, o: AudioNode, t: number) => {
    tone(c, o, t, { freq: 196, to: 130, type: "triangle", dur: 0.14, gain: 0.4 });
    tone(c, o, t, { freq: 392, start: 0.12, dur: 0.25, gain: 0.18 });
    tone(c, o, t, { freq: 587, start: 0.18, dur: 0.3, gain: 0.12 });
  },
  devcard: (c: AudioContext, o: AudioNode, t: number) => {
    noise(c, o, t, { dur: 0.09, freq: 3000, q: 1.5, gain: 0.25, type: "highpass" });
    tone(c, o, t, { freq: 660, start: 0.06, dur: 0.18, gain: 0.12 });
  },
  yourTurn: (c: AudioContext, o: AudioNode, t: number) => {
    tone(c, o, t, { freq: 523, dur: 0.22, gain: 0.25 });
    tone(c, o, t, { freq: 784, start: 0.14, dur: 0.4, gain: 0.25 });
  },
  offer: (c: AudioContext, o: AudioNode, t: number) => {
    tone(c, o, t, { freq: 880, dur: 0.5, gain: 0.15 });
    tone(c, o, t, { freq: 1320, dur: 0.35, gain: 0.06 });
  },
  respond: (c: AudioContext, o: AudioNode, t: number) =>
    tone(c, o, t, { freq: 740, dur: 0.15, gain: 0.12 }),
  discard: (c: AudioContext, o: AudioNode, t: number) => {
    tone(c, o, t, { freq: 440, dur: 0.15, type: "square", gain: 0.06 });
    tone(c, o, t, { freq: 330, start: 0.15, dur: 0.25, type: "square", gain: 0.06 });
  },
  award: (c: AudioContext, o: AudioNode, t: number) => {
    tone(c, o, t, { freq: 659, dur: 0.18, gain: 0.15 });
    tone(c, o, t, { freq: 988, start: 0.1, dur: 0.3, gain: 0.15 });
  },
  win: (c: AudioContext, o: AudioNode, t: number) => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(c, o, t, { freq: f, start: i * 0.12, dur: 0.45, type: "triangle", gain: 0.22 }),
    );
  },
  chat: (c: AudioContext, o: AudioNode, t: number) =>
    tone(c, o, t, { freq: 1175, dur: 0.08, gain: 0.08 }),
};

export type Recipe = keyof typeof RECIPES;
