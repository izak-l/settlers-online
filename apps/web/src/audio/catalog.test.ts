import { readFileSync } from "node:fs";
import { describe, expect, it, vi, afterEach } from "vitest";
import { SOUNDS, chooseVariant } from "./catalog";

afterEach(() => vi.restoreAllMocks());

describe("sound catalog", () => {
  it("ships eight distinct, nonempty dice recordings and every registered file", () => {
    expect(SOUNDS.dice.kind).toBe("recording");
    if (SOUNDS.dice.kind !== "recording") throw new Error("Dice must use recordings");
    expect(SOUNDS.dice.files).toHaveLength(8);
    const contents = SOUNDS.dice.files.map((file) =>
      readFileSync(new URL(`../../public/${file}`, import.meta.url)).toString("base64"),
    );
    expect(new Set(contents).size).toBe(8);
    for (const source of Object.values(SOUNDS)) {
      if (source.kind !== "recording") continue;
      expect(source.files.length).toBeGreaterThan(0);
      for (const file of source.files) {
        expect(
          readFileSync(new URL(`../../public/${file}`, import.meta.url)).length,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("can choose every first variant and every non-repeating subsequent variant", () => {
    for (let i = 0; i < 8; i++) {
      vi.spyOn(Math, "random").mockReturnValue((i + 0.5) / 8);
      expect(chooseVariant(8)).toBe(i);
    }
    for (let previous = 0; previous < 8; previous++) {
      const choices = new Set<number>();
      for (let i = 0; i < 7; i++) {
        vi.spyOn(Math, "random").mockReturnValue((i + 0.5) / 7);
        choices.add(chooseVariant(8, previous));
      }
      expect(choices.size).toBe(7);
      expect(choices.has(previous)).toBe(false);
    }
    expect(chooseVariant(1, 0)).toBe(0);
  });
});
