// Bundle the server and the workspace packages (TypeScript source) into one ESM file for Node.
// Run with `pnpm --filter @settlers/server build`; the Dockerfile runs it too.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // Optional native add-ons that pg and ws load only if installed; we don't install them.
  external: ["pg-native", "bufferutil", "utf-8-validate"],
  // Some bundled dependencies are CommonJS and call require(); give the ESM bundle one.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
});
