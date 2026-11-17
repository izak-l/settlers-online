import { describe, expect, it } from "vitest";
import { BASE_4P } from "@settlers/maps";
import { sandboxMapOptions } from "./sandboxMaps";

const draft = (over: object) => ({
  ...BASE_4P,
  id: "my-draft",
  name: "My Draft",
  description: "Work in progress.",
  ...over,
});

describe("sandbox map options", () => {
  it("lists catalog maps first, then drafts tagged as drafts", () => {
    const opts = sandboxMapOptions({ "drafts/my-draft.json": draft({}) }, 4);
    expect(opts[0]!.id).toBe("base-4p");
    const d = opts.find((o) => o.id === "my-draft")!;
    expect(d).toMatchObject({ tag: "draft", name: "My Draft" });
    expect(d.disabledReason).toBeUndefined();
  });

  it("explains why a map can't be played", () => {
    const opts = sandboxMapOptions(
      {
        "drafts/later.json": draft({ id: "later", modules: ["base", "knights-and-cities"] }),
        "drafts/small.json": draft({ id: "small", players: { min: 1, max: 2 } }),
        "drafts/broken.json": { id: "broken", hexes: "nope" },
        "drafts/short.json": draft({
          id: "short",
          pools: { ...BASE_4P.pools, tokens: { tokens: [5] } },
        }),
      },
      4,
    );
    const why = (id: string) => opts.find((o) => o.id === id)?.disabledReason;
    expect(why("later")).toMatch(/knights-and-cities/);
    expect(why("small")).toMatch(/up to 2 players/);
    expect(why("short")).toMatch(/tokens/);
    // Unparseable files are listed by file name with the reason.
    expect(opts.find((o) => o.id === "broken.json")?.disabledReason).toMatch(/invalid/i);
  });

  it("treats player counts as upper bounds: every catalog map takes a single player", () => {
    const opts = sandboxMapOptions({}, 1);
    expect(opts.find((o) => o.id === "grand-diamond")?.disabledReason).toBeUndefined();
    expect(opts.find((o) => o.id === "base-4p")?.disabledReason).toBeUndefined();
  });
});
