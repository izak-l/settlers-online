import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/engine/vitest.config.ts",
  "packages/maps/vitest.config.ts",
  "packages/protocol/vitest.config.ts",
  "apps/web/vitest.config.ts",
  "apps/server/vitest.config.ts",
  "tools/sim/vitest.config.ts",
]);
