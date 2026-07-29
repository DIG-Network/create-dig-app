import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

// The strict Lint gate (CLAUDE.md §2.4a). Scope: the tool's OWN plain-ESM source
// (bin/ + lib/ + test/). The scaffolded templates are NOT linted — they carry
// __TOKEN__ placeholders (consumed by lib/substitute.js) that are not valid
// standalone source, and they have their own typecheck/build gate.
export default [
  {
    // Ignore everything that isn't the tool's own source, mirroring .prettierignore:
    // template trees hold placeholder tokens, the rest is generated/vendored.
    ignores: ["templates/**", "templates-ts/**", "coverage/**", "dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.node,
    },
  },
  // Keep prettier LAST so it disables every stylistic rule prettier already owns —
  // the format:check gate is the sole authority on formatting, no rule conflicts here.
  prettier,
];
