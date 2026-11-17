import type { Cue } from "./cues";
import { SOUNDS, chooseVariant } from "./catalog";
import { getSettings, subscribeSettings } from "./settings";
import { RECIPES } from "./synth";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<void>>();
const previous = new Map<Cue, number>();

function updateVolume() {
  const { muted, volume } = getSettings();
  if (master) master.gain.value = muted ? 0 : volume;
}
subscribeSettings(updateVolume);

function load(c: AudioContext, file: string): Promise<void> {
  const existing = loading.get(file);
  if (existing) return existing;
  const pending = (async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${file}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await c.decodeAudioData(await response.arrayBuffer());
      buffers.set(file, buffer);
    } catch (error) {
      console.warn(`Unable to load sound ${file}`, error);
    }
  })();
  loading.set(file, pending);
  return pending;
}

/** Decode once at the first gesture; cues before readiness are dropped, never queued. */
export function unlock(): void {
  if (!ctx) {
    try {
      const c = new AudioContext();
      master = c.createGain();
      master.connect(c.destination);
      ctx = c;
      updateVolume();
      for (const source of Object.values(SOUNDS)) {
        if (source.kind === "recording") {
          for (const file of source.files) void load(c, file);
        }
      }
    } catch (error) {
      console.warn("Unable to initialize sound playback", error);
      return;
    }
  }
  if (ctx.state === "suspended") {
    void ctx.resume().catch((error: unknown) => console.warn("Unable to resume audio", error));
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
}

/** Onset spacing, not a promise that clips finish before the next cue starts. */
const SPACING = 0.18;

function recording(c: AudioContext, out: GainNode, buffer: AudioBuffer): AudioBufferSourceNode {
  const node = c.createBufferSource();
  node.buffer = buffer;
  node.connect(out);
  node.onended = () => {
    node.disconnect();
    out.disconnect();
  };
  return node;
}

/** Cancellable personal countdown, aligned to the remaining part of the five-second window. */
export function playTurnWarning(deadline: number): () => void {
  const c = ctx;
  const source = SOUNDS.turnWarning;
  const remaining = deadline - Date.now();
  if (!c || c.state !== "running" || !master || remaining <= 0 || source.kind !== "recording")
    return () => {};
  const buffer = buffers.get(source.files[0]);
  if (!buffer) return () => {};
  const out = c.createGain();
  out.gain.value = source.gain ?? 1;
  out.connect(master);
  const node = recording(c, out, buffer);
  node.loop = true;
  const offset = Math.max(0, 5 - remaining / 1000) % buffer.duration;
  node.start(c.currentTime, offset);
  node.stop(c.currentTime + remaining / 1000);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    node.stop();
    // Disconnect immediately even when the browser has suspended audio callbacks.
    node.disconnect();
    out.disconnect();
  };
}

export function play(cues: Cue[]): void {
  const { muted, volume } = getSettings();
  const c = ctx;
  if (muted || volume === 0 || !c || c.state !== "running" || !master) return;
  const start = c.currentTime + 0.01;
  cues.forEach((cue, i) => {
    const source = SOUNDS[cue];
    let buffer: AudioBuffer | undefined;
    let variant: number | undefined;
    if (source.kind === "recording") {
      variant = chooseVariant(source.files.length, previous.get(cue));
      buffer = buffers.get(source.files[variant]!);
      // Never choose an alternative file or synthesis when the selected clip is unavailable.
      if (!buffer) return;
    }
    const out = c.createGain();
    out.gain.value = source.gain ?? 1;
    out.connect(master!);
    const time = start + i * SPACING;
    if (source.kind === "synth") {
      RECIPES[source.recipe](c, out, time);
      // Existing synthesized recipes finish within one second; release their output afterward.
      setTimeout(() => out.disconnect(), (time - c.currentTime + 1) * 1000);
    } else {
      const node = recording(c, out, buffer!);
      node.start(time);
      previous.set(cue, variant!);
    }
  });
}
