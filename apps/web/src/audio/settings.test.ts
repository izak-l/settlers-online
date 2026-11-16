import { describe, it, expect } from "vitest";
import { DEFAULTS, KEY, loadSettings, saveSettings } from "./settings";

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const throwing = {
  getItem: (): string | null => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("sound settings", () => {
  it("defaults when nothing is stored, storage is missing, or it throws", () => {
    expect(loadSettings(memory())).toEqual(DEFAULTS);
    expect(loadSettings(null)).toEqual(DEFAULTS);
    expect(loadSettings(throwing)).toEqual(DEFAULTS);
    expect(() => saveSettings({ muted: true, volume: 0.2 }, throwing)).not.toThrow();
  });

  it("round-trips, and ignores bad values", () => {
    const store = memory();
    saveSettings({ muted: true, volume: 0.25 }, store);
    expect(loadSettings(store)).toEqual({ muted: true, volume: 0.25 });
    store.setItem(KEY, JSON.stringify({ muted: "yes", volume: 7 }));
    expect(loadSettings(store)).toEqual(DEFAULTS);
    store.setItem(KEY, "not json");
    expect(loadSettings(store)).toEqual(DEFAULTS);
  });
});
