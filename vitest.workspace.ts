import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/engine/vitest.config.ts",
  "packages/maps/vitest.config.ts",
  "packages/protocol/vitest.config.ts",
  "apps/web/vitest.config.ts",
]);
