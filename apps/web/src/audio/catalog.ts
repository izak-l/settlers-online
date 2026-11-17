import type { Cue } from "./cues";
import type { Recipe } from "./synth";

export type SoundSource =
  | { kind: "synth"; recipe: Recipe; gain?: number }
  | { kind: "recording"; files: readonly [string, ...string[]]; gain?: number };

/** Every cue has an explicit source. There are no substitute sounds. */
export const SOUNDS: Record<Cue, SoundSource> = {
  dice: {
    kind: "recording",
    files: [
      "sounds/dice/roll-01.mp3",
      "sounds/dice/roll-02.mp3",
      "sounds/dice/roll-03.mp3",
      "sounds/dice/roll-04.mp3",
      "sounds/dice/roll-05.mp3",
      "sounds/dice/roll-06.mp3",
      "sounds/dice/roll-07.mp3",
      "sounds/dice/roll-08.mp3",
    ],
  },
  build: { kind: "synth", recipe: "build" },
  city: { kind: "synth", recipe: "city" },
  devcard: { kind: "synth", recipe: "devcard" },
  yourTurn: { kind: "synth", recipe: "yourTurn" },
  offer: { kind: "synth", recipe: "offer" },
  respond: { kind: "synth", recipe: "respond" },
  road: { kind: "recording", files: ["sounds/actions/road-placed.mp3"] },
  settlement: { kind: "recording", files: ["sounds/actions/settlement-placed.mp3"] },
  steal: { kind: "recording", files: ["sounds/actions/swipe-sound.mp3"] },
  turnWarning: { kind: "recording", files: ["sounds/actions/end-turn-clock-tick.mp3"] },
  discard: { kind: "synth", recipe: "discard" },
  award: { kind: "synth", recipe: "award" },
  gain: { kind: "recording", files: ["sounds/actions/card-received.mp3"] },
  win: { kind: "synth", recipe: "win" },
  chat: { kind: "synth", recipe: "chat" },
};

/** Uniform choice among all variants except the last one played. UI randomness only. */
export function chooseVariant(count: number, previous?: number): number {
  if (count <= 1) return 0;
  if (previous === undefined) return Math.floor(Math.random() * count);
  const index = Math.floor(Math.random() * (count - 1));
  return index >= previous ? index + 1 : index;
}
