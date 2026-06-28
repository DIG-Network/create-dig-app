// The template registry — the single source of truth for what `create-dig-app` can scaffold.
//
// Each template is a directory under ../templates/<name>/ whose files are copied verbatim except for
// `__PLACEHOLDER__` token substitution (see substitute.js). The metadata here drives:
//   - the interactive picker + `--template` validation (templateNames / resolveTemplate),
//   - the dig.toml the scaffolder writes (outputDir + buildCommand, which the SDK adapter and
//     `digstore deploy` both read — see modules/dig-sdk/src/adapters/dig-toml.ts),
//   - which templates wire @dignetwork/dig-sdk (wallet) vs stay dependency-light static sites.
//
// Templates are kept MINIMAL but real: each one `npm install`s and builds, and none bundles a heavy
// framework footprint beyond what the framework itself requires.

/**
 * @typedef {("js"|"ts")} Lang A scaffold language: plain JavaScript or TypeScript.
 */

/**
 * @typedef {Object} TemplateMeta
 * @property {string} name        Template id (matches the directory name).
 * @property {string} title       Short human title for the picker.
 * @property {string} description One-line description for the picker + `--help`.
 * @property {string} outputDir   The built-output dir digstore publishes (written into dig.toml).
 * @property {string} buildCommand Build command digstore runs in CI (written into dig.toml).
 * @property {boolean} wallet     True if the template wires @dignetwork/dig-sdk (ChiaProvider).
 * @property {Lang[]} langs       Languages this template can be scaffolded in, in offer order.
 *                                Always includes "js"; includes "ts" when a TypeScript variant
 *                                exists under ../templates-ts/<name>/ (see {@link resolveLang}).
 */

// The default scaffold language. JS stays the default so existing invocations are unchanged.
export const DEFAULT_LANG = "js";
/** The languages a user may request, in offer order (also the interactive picker order). */
export const LANGS = ["js", "ts"];

/** @type {Record<string, TemplateMeta>} */
export const TEMPLATES = {
  // `static` has no build step (its "build" just copies src/ → public/), so there is no buildable
  // JS to typecheck and therefore no TypeScript variant — it stays JS-only.
  static: {
    name: "static",
    title: "Static site",
    description: "Plain HTML/CSS/JS — zero build step, the lightest way to ship a site on DIG.",
    outputDir: "public",
    buildCommand: "npm run build",
    wallet: false,
    langs: ["js"],
  },
  "vite-react": {
    name: "vite-react",
    title: "Vite + React",
    description: "A React SPA built with Vite — the fast default for an app frontend.",
    outputDir: "dist",
    buildCommand: "npm run build",
    wallet: false,
    langs: ["js", "ts"],
  },
  "next-static": {
    name: "next-static",
    title: "Next.js (static export)",
    description: "Next.js exported to static files (output: 'export') — deployable as a DIG capsule.",
    outputDir: "out",
    buildCommand: "npm run build",
    wallet: false,
    langs: ["js", "ts"],
  },
  "nft-drop": {
    name: "nft-drop",
    title: "NFT drop",
    description: "A wallet-connected NFT mint page, wired to @dignetwork/dig-sdk (no mint at scaffold).",
    outputDir: "dist",
    buildCommand: "npm run build",
    wallet: true,
    langs: ["js", "ts"],
  },
  "dapp-window-chia": {
    name: "dapp-window-chia",
    title: "Wallet dapp (window.chia)",
    description: "A dapp wired to the injected Chia wallet via ChiaProvider (window.chia → WalletConnect).",
    outputDir: "dist",
    buildCommand: "npm run build",
    wallet: true,
    langs: ["js", "ts"],
  },
};

/**
 * Normalize a user-supplied language token to a canonical {@link Lang}.
 * Accepts the long and short forms: "ts"/"typescript" → "ts", "js"/"javascript" → "js".
 * @param {string} raw
 * @returns {Lang}
 * @throws {Error} on an unrecognized value.
 */
export function normalizeLang(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "ts" || v === "typescript") return "ts";
  if (v === "js" || v === "javascript") return "js";
  throw new Error(`Unknown --lang "${raw}". Use "js" (javascript) or "ts" (typescript).`);
}

/**
 * Resolve the language a template will actually be scaffolded in: the requested language if the
 * template offers it, otherwise the default ("js"). `static` has no TS variant, so requesting "ts"
 * for it resolves back to "js" (the caller can compare requested vs. resolved to tell the user).
 * @param {TemplateMeta} meta
 * @param {Lang} [requested]
 * @returns {Lang}
 */
export function resolveLang(meta, requested = DEFAULT_LANG) {
  return meta.langs.includes(requested) ? requested : DEFAULT_LANG;
}

/** Raised when a requested template name is not in the registry. */
export class UnknownTemplateError extends Error {
  /** @param {string} requested */
  constructor(requested) {
    super(
      `Unknown template "${requested}". Available: ${templateNames().join(", ")}.`,
    );
    this.name = "UnknownTemplateError";
    this.requested = requested;
  }
}

/** All template ids, in registry (declaration) order. */
export function templateNames() {
  return Object.keys(TEMPLATES);
}

/**
 * Resolve a template name to its metadata, or throw {@link UnknownTemplateError}.
 * @param {string} name
 * @returns {TemplateMeta}
 */
export function resolveTemplate(name) {
  const meta = name && TEMPLATES[name];
  if (!meta) throw new UnknownTemplateError(name);
  return meta;
}
