import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "server",
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests share one test database; run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
