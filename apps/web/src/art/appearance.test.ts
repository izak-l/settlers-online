import { describe, expect, it } from "vitest";
import {
  ARTWORK_KEY,
  getArtwork,
  loadArtwork,
  saveArtwork,
  setArtwork,
  subscribeArtwork,
} from "./appearance";
import { cardImage, tileImage } from "./artwork";

describe("artwork preference", () => {
  it("defaults safely for missing, unrecognized or blocked storage", () => {
    expect(loadArtwork(null)).toBe("original");
    for (const raw of [null, "", "null", "undefined", "future-pack", "{bad json}", "original"]) {
      expect(loadArtwork({ getItem: () => raw, setItem: () => {} })).toBe("original");
    }
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadArtwork(blocked)).toBe("original");
    expect(() => saveArtwork("realism", blocked)).not.toThrow();
  });

  it("remembers either selection", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
    saveArtwork("realism", storage);
    expect(data.get(ARTWORK_KEY)).toBe("realism");
    expect(loadArtwork(storage)).toBe("realism");
    saveArtwork("original", storage);
    expect(loadArtwork(storage)).toBe("original");
  });

  it("notifies consumers of the current selection and permits unsubscribing", () => {
    const observed: string[] = [];
    const unsubscribe = subscribeArtwork(() => observed.push(getArtwork()));
    setArtwork("realism");
    setArtwork("original");
    unsubscribe();
    setArtwork("realism");
    expect(observed).toEqual(["realism", "original"]);
    setArtwork("original");
  });
});

describe("artwork coverage", () => {
  it("provides the six land terrains and five resource faces together", () => {
    for (const terrain of ["forest", "pasture", "hills", "fields", "mountains", "desert"]) {
      expect(tileImage("realism", terrain)).toMatch(/\.png/);
      expect(tileImage("original", terrain)).toBeUndefined();
    }
    for (const resource of ["wood", "brick", "sheep", "wheat", "ore"]) {
      expect(cardImage("realism", resource)).toMatch(/\.png/);
      expect(cardImage("original", resource)).toBeUndefined();
    }
    for (const terrain of ["sea", "gold", "fog", "future-terrain"]) {
      expect(tileImage("realism", terrain)).toBeUndefined();
    }
    expect(cardImage("realism", "future-resource")).toBeUndefined();
  });
});
