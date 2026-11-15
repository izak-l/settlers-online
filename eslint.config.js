import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
      "eslint.config.js",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "@typescript-eslint": tseslint },
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Engine must be pure: no I/O, no Math.random, no Date, no timers
    files: ["packages/engine/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "Math", message: "Use the seeded PRNG in GameState.rng instead of Math.random." },
        { name: "Date", message: "Engine must be pure — no Date." },
        { name: "setTimeout", message: "Engine must be pure — no timers." },
        { name: "setInterval", message: "Engine must be pure — no timers." },
        { name: "clearTimeout", message: "Engine must be pure — no timers." },
        { name: "clearInterval", message: "Engine must be pure — no timers." },
        { name: "crypto", message: "Engine must be pure — use the seeded PRNG." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: "Use the seeded PRNG in GameState.rng instead of Math.random.",
        },
      ],
    },
  },
];
