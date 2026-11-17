import { describe, expect, it } from "vitest";
import { BASE_4P } from "@settlers/maps";
import { sandboxDrafts } from "./sandboxMaps";

const draft = (over: object) => ({
  ...BASE_4P,
  id: "my-draft",
  name: "My Draft",
  description: "Work in progress.",
  ...over,
});

describe("sandbox drafts", () => {
  it("lists draft files by name, playable ones enabled", () => {
    const [d] = sandboxDrafts({ "drafts/my-draft.json": draft({}) }, 4);
    expect(d).toMatchObject({ id: "my-draft", name: "My Draft" });
    expect(d!.disabledReason).toBeUndefined();
  });

  it("explains why a draft can't be played", () => {
    const opts = sandboxDrafts(
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

  it("treats player counts as upper bounds", () => {
    expect(sandboxDrafts({ "d.json": draft({}) }, 1)[0]!.disabledReason).toBeUndefined();
  });
});
