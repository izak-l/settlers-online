import { create } from "zustand";
import { ERROR_MESSAGES, type Action, type PlayerId } from "@settlers/engine";
import { LocalGame, type GameClient, type Snapshot } from "./LocalGame";

export type BuildMode = "road" | "settlement" | "city" | null;

export interface SeatInfo {
  id: PlayerId;
  name: string;
  color: string;
}

/** Original palette; one colour per seat. */
export const SEAT_COLORS = ["#d64545", "#2f6fd6", "#e8a33a", "#3a9e5c"];

interface Store {
  client: GameClient | null;
  snap: Snapshot | null;
  seats: SeatInfo[];
  mode: BuildMode;
  error: string | null;
  /** Seat that must tap through the hand-off screen before seeing their hand. */
  handoffTo: PlayerId | null;

  newGame(names: string[], seed: string): void;
  send(action: Action): void;
  setMode(mode: BuildMode): void;
  confirmHandoff(): void;
  quit(): void;
}

export const useGame = create<Store>()((set, get) => ({
  client: null,
  snap: null,
  seats: [],
  mode: null,
  error: null,
  handoffTo: null,

  newGame(names, seed) {
    const seats = names.map((name, i) => ({ id: `p${i}`, name, color: SEAT_COLORS[i]! }));
    const client = new LocalGame(
      seats.map((s) => s.id),
      seed,
    );
    const snap = client.snapshot();
    set({ client, snap, seats, mode: null, error: null, handoffTo: snap.seat });
  },

  send(action) {
    const { client, snap: before } = get();
    if (!client) return;
    const rejection = client.send(action);
    if (rejection) {
      set({ error: ERROR_MESSAGES[rejection.code] + " " + rejection.message });
      return;
    }
    const snap = client.snapshot();
    set({
      snap,
      mode: null,
      error: null,
      handoffTo: before && snap.seat !== before.seat ? snap.seat : null,
    });
  },

  setMode(mode) {
    set({ mode: get().mode === mode ? null : mode, error: null });
  },

  confirmHandoff() {
    set({ handoffTo: null });
  },

  quit() {
    set({ client: null, snap: null, seats: [], mode: null, error: null, handoffTo: null });
  },
}));

/** Replace seat ids in engine log text with display names. */
export function withNames(text: string, seats: SeatInfo[]): string {
  return text.replace(/\bp\d+\b/g, (id) => seats.find((s) => s.id === id)?.name ?? id);
}
