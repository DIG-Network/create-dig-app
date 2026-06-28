// create-dig-app — the scaffolding library.
//
// `scaffold()` copies a template's file tree into a target directory, substituting `__TOKEN__`
// placeholders (app name, pinned SDK version, output dir, build command), and returns the resolved
// app name + the printable "next steps". The bin (bin/create-dig-app.js) is a thin CLI wrapper
// around this; tests drive this library directly.
//
// Design principle (ROADMAP §2 "free until publish"): scaffolding writes a LOCAL, runnable project
// and never mints, spends, or touches the chain. The next-steps + scaffolded README make that
// explicit and point at `digstore dev` (free preview) → `digstore deploy` (publish, 100 DIG).

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_LANG,
  TEMPLATES,
  UnknownTemplateError,
  normalizeLang,
  resolveLang,
  resolveTemplate,
  templateNames,
} from "./templates.js";
import { applySubstitutions, buildSubstitutions } from "./substitute.js";

export {
  DEFAULT_LANG,
  TEMPLATES,
  UnknownTemplateError,
  normalizeLang,
  resolveLang,
  resolveTemplate,
  templateNames,
};

const __dirname = dirname(fileURLToPath(import.meta.url));

// The @dignetwork/dig-sdk version specifier scaffolded wallet templates pin.
//
// The SDK is pre-1.0 and still stabilizing its first published release, so scaffolded projects track
// the `latest` dist-tag rather than a frozen caret range: a freshly scaffolded app installs the
// newest stable SDK at scaffold time, and we never ship a pin to a version that isn't published yet.
// (npm accepts a dist-tag wherever a version range is allowed.) Bump this to a caret range — e.g.
// `^1.0.0` — once the SDK cuts a stable semver release worth freezing scaffolds to.
export const SDK_VERSION = "latest";

/** Absolute path to the bundled JavaScript templates directory. */
const TEMPLATES_ROOT = join(__dirname, "..", "templates");
/** Absolute path to the bundled TypeScript template variants (one dir per TS-capable template). */
const TEMPLATES_TS_ROOT = join(__dirname, "..", "templates-ts");

/**
 * The on-disk source directory for a (template, lang) pair. JS templates live under templates/<name>;
 * the TypeScript variant of a template lives under templates-ts/<name>. Kept here (not in the
 * registry) so the registry stays declarative and the path convention is in one place.
 * @param {import("./templates.js").TemplateMeta} meta
 * @param {import("./templates.js").Lang} lang
 * @returns {string}
 */
function templateSrcDir(meta, lang) {
  return lang === "ts" ? join(TEMPLATES_TS_ROOT, meta.name) : join(TEMPLATES_ROOT, meta.name);
}

// Files we ship in a template dir under a renamed form because npm/npx would otherwise mangle them
// when this package is published (npm renames a packaged `.gitignore` to `.npmignore`-safe `gitignore`,
// and refuses to publish a nested `package.json`-shaped file untouched). Templates therefore store
// these under a `_`-prefixed name and we rename them back on scaffold.
const RENAME_ON_COPY = {
  _gitignore: ".gitignore",
  "_npmrc": ".npmrc",
};

/**
 * Normalize a user-supplied app name into an npm-safe package name.
 * Lowercase, trim, collapse runs of non-alphanumerics to a single dash, strip leading/trailing
 * dashes. Throws if the result is empty.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeAppName(raw) {
  if (typeof raw !== "string") throw new Error("app name must be a string");
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`"${raw}" is not a usable app name (it must contain letters or digits)`);
  return slug;
}

/** True if a directory does not exist or exists but is empty. */
function isEmptyDir(dir) {
  if (!existsSync(dir)) return true;
  if (!statSync(dir).isDirectory()) return false;
  return readdirSync(dir).length === 0;
}

/** Recursively list every file path under dir. */
function walkFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

/** Heuristic: treat a file as text (substitutable) unless its extension marks it binary. */
const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".woff", ".woff2", ".wasm"]);
function isBinary(path) {
  const dot = path.lastIndexOf(".");
  return dot >= 0 && BINARY_EXT.has(path.slice(dot).toLowerCase());
}

/**
 * Scaffold a new project from a template.
 *
 * @param {Object} args
 * @param {string} args.appName    The user-supplied app name (normalized to an npm-safe slug).
 * @param {string} args.template   A template id (must be in {@link TEMPLATES}).
 * @param {import("./templates.js").Lang} [args.lang] Requested language ("js" default, or "ts").
 *   If the template has no variant for the requested language (e.g. "ts" for `static`), it falls
 *   back to the default and the returned `lang` reflects what was actually scaffolded.
 * @param {string} args.targetDir  Absolute/relative path to create the project in (must be empty/new).
 * @returns {{ appName: string, template: string, lang: import("./templates.js").Lang, requestedLang: import("./templates.js").Lang, targetDir: string, nextSteps: string[] }}
 */
export function scaffold({ appName, template, lang, targetDir }) {
  // Validate template + name BEFORE writing anything, so a bad invocation leaves the FS untouched.
  const meta = resolveTemplate(template);
  const slug = normalizeAppName(appName);
  // Normalize the requested language, then resolve it against what the template actually offers
  // (a TS request for a JS-only template like `static` resolves back to "js").
  const requestedLang = lang === undefined ? DEFAULT_LANG : normalizeLang(lang);
  const resolvedLang = resolveLang(meta, requestedLang);

  if (!targetDir) throw new Error("targetDir is required");
  if (!isEmptyDir(targetDir)) {
    throw new Error(`target directory "${targetDir}" exists and is not empty — choose a new name or empty it.`);
  }

  const src = templateSrcDir(meta, resolvedLang);
  if (!existsSync(src)) {
    throw new Error(`template files for "${meta.name}" (${resolvedLang}) are missing at ${src}`);
  }

  const subs = buildSubstitutions({
    appName: slug,
    displayName: appName.trim(),
    sdkVersion: SDK_VERSION,
    outputDir: meta.outputDir,
    buildCommand: meta.buildCommand,
  });

  // Copy the whole tree, then substitute placeholders in text files, then apply the renames.
  // Copy first (cpSync handles nested dirs) so binary assets come across untouched.
  mkdirSync(targetDir, { recursive: true });
  try {
    cpSync(src, targetDir, { recursive: true });

    for (const file of walkFiles(targetDir)) {
      if (isBinary(file)) continue;
      const text = readFileSync(file, "utf8");
      const next = applySubstitutions(text, subs);
      if (next !== text) writeFileSync(file, next);
    }

    // Restore `_`-prefixed shipped files to their dotfile names.
    for (const [shipped, real] of Object.entries(RENAME_ON_COPY)) {
      const from = join(targetDir, shipped);
      if (existsSync(from)) renameSync(from, join(targetDir, real));
    }
  } catch (err) {
    // Leave no half-written tree behind on failure.
    rmSync(targetDir, { recursive: true, force: true });
    throw err;
  }

  return {
    appName: slug,
    template: meta.name,
    lang: resolvedLang,
    requestedLang,
    targetDir,
    nextSteps: nextSteps({ slug, meta }),
  };
}

/**
 * The printable next-steps for a freshly scaffolded project. Names the free local loop and makes the
 * "no mint / no spend at scaffold time" guarantee explicit (ROADMAP §2).
 * @param {{ slug: string, meta: import("./templates.js").TemplateMeta }} args
 * @returns {string[]}
 */
export function nextSteps({ slug, meta }) {
  const steps = [
    `cd ${slug}`,
    `npm install`,
  ];
  if (meta.buildCommand && meta.name !== "static") {
    steps.push(`npm run dev          # work on your app locally`);
  }
  steps.push(
    `digstore dev          # preview on the real dig:// read path — FREE, no mint, no chain, no spend`,
    `digstore deploy       # publish a capsule when you're ready (this is the only step that spends 100 DIG)`,
  );
  return steps;
}
