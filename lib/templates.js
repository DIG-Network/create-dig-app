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
 * @typedef {Object} TemplateMeta
 * @property {string} name        Template id (matches the directory name).
 * @property {string} title       Short human title for the picker.
 * @property {string} description One-line description for the picker + `--help`.
 * @property {string} outputDir   The built-output dir digstore publishes (written into dig.toml).
 * @property {string} buildCommand Build command digstore runs in CI (written into dig.toml).
 * @property {boolean} wallet     True if the template wires @dignetwork/dig-sdk (ChiaProvider).
 */

/** @type {Record<string, TemplateMeta>} */
export const TEMPLATES = {
  static: {
    name: "static",
    title: "Static site",
    description: "Plain HTML/CSS/JS — zero build step, the lightest way to ship a site on DIG.",
    outputDir: "public",
    buildCommand: "npm run build",
    wallet: false,
  },
  "vite-react": {
    name: "vite-react",
    title: "Vite + React",
    description: "A React SPA built with Vite — the fast default for an app frontend.",
    outputDir: "dist",
    buildCommand: "npm run build",
    wallet: false,
  },
  "next-static": {
    name: "next-static",
    title: "Next.js (static export)",
    description: "Next.js exported to static files (output: 'export') — deployable as a DIG capsule.",
    outputDir: "out",
    buildCommand: "npm run build",
    wallet: false,
  },
  "nft-drop": {
    name: "nft-drop",
    title: "NFT drop",
    description: "A wallet-connected NFT mint page, wired to @dignetwork/dig-sdk (no mint at scaffold).",
    outputDir: "dist",
    buildCommand: "npm run build",
    wallet: true,
  },
  "dapp-window-chia": {
    name: "dapp-window-chia",
    title: "Wallet dapp (window.chia)",
    description: "A dapp wired to the injected Chia wallet via ChiaProvider (window.chia → WalletConnect).",
    outputDir: "dist",
    buildCommand: "npm run build",
    wallet: true,
  },
};

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
