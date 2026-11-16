import { describe, it, expect } from "vitest";
import { readConfig } from "../config";
import { migrationsDir } from "../db/migrate";

describe("config", () => {
  it("reads WEB_ORIGIN as a comma-separated list of allowed origins", () => {
    expect(readConfig({}).WEB_ORIGIN).toEqual(["http://localhost:5173"]);
    expect(
      readConfig({ WEB_ORIGIN: "https://settlers.pages.dev, https://play.example.com ," })
        .WEB_ORIGIN,
    ).toEqual(["https://settlers.pages.dev", "https://play.example.com"]);
  });

  it("refuses dev sign-in in production", () => {
    expect(() => readConfig({ NODE_ENV: "production", AUTH_MODE: "dev" })).toThrow();
  });

  it("finds migrations next to the source by default, or where MIGRATIONS_DIR says", () => {
    expect(migrationsDir({})).toMatch(/apps\/server\/migrations\/$/);
    expect(migrationsDir({ MIGRATIONS_DIR: "/app/migrations" })).toBe("/app/migrations/");
  });
});
