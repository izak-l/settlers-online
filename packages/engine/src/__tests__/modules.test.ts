import { describe, it, expect } from "vitest";
import { MODULE_IDS } from "../index";

describe("MODULE_IDS", () => {
  it("lists the registered modules, base first", () => {
    expect(MODULE_IDS[0]).toBe("base");
  });
});
