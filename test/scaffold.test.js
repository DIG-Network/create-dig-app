// End-to-end scaffolder tests (node --test). Each test scaffolds into a fresh temp dir and asserts:
//   - the file tree a template produces,
//   - dig.toml is written with the right output dir / build command / remote,
//   - template placeholders (app name, sdk version) are substituted (no leftover __PLACEHOLDER__),
//   - template selection + validation behave (unknown templates rejected, names normalized).
//
// We test the library surface (lib/index.js) directly — the bin is a thin wrapper around it — so the
// scaffolding logic is verified without spawning a process or prompting interactively.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  scaffold,
  TEMPLATES,
  templateNames,
  resolveTemplate,
  normalizeAppName,
  SDK_VERSION,
  UnknownTemplateError,
} from "../lib/index.js";

/** Make a throwaway working directory; cleaned up after each test. */
function freshDir() {
  return mkdtempSync(join(tmpdir(), "create-dig-app-test-"));
}

/** Read a scaffolded file as UTF-8. */
function read(dir, ...parts) {
  return readFileSync(join(dir, ...parts), "utf8");
}

// ---------------------------------------------------------------------------
// Template registry / metadata
// ---------------------------------------------------------------------------

test("exposes the five committed templates", () => {
  const names = templateNames().sort();
  assert.deepEqual(names, [
    "dapp-window-chia",
    "next-static",
    "nft-drop",
    "static",
    "vite-react",
  ].sort());
});

test("every template has a description and an output dir", () => {
  for (const name of templateNames()) {
    const t = TEMPLATES[name];
    assert.ok(t.description && typeof t.description === "string", `${name} description`);
    assert.ok(t.outputDir && typeof t.outputDir === "string", `${name} outputDir`);
  }
});

test("resolveTemplate accepts a known template and rejects an unknown one", () => {
  assert.equal(resolveTemplate("static").name, "static");
  assert.throws(() => resolveTemplate("svelte-thing"), UnknownTemplateError);
  assert.throws(() => resolveTemplate(""), UnknownTemplateError);
});

test("SDK_VERSION is an installable npm specifier (a semver range or a dist-tag)", () => {
  // Either a caret/exact semver (e.g. ^1.2.3 / 1.2.3) or an npm dist-tag (e.g. "latest"/"alpha").
  assert.match(SDK_VERSION, /^(\^?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?|[a-z][a-z0-9-]*)$/);
});

// ---------------------------------------------------------------------------
// App-name normalization (becomes the package name + dig.toml/app substitutions)
// ---------------------------------------------------------------------------

test("normalizeAppName lowercases, trims and slugifies for npm", () => {
  assert.equal(normalizeAppName("My Cool App"), "my-cool-app");
  assert.equal(normalizeAppName("  Spaces  "), "spaces");
  assert.equal(normalizeAppName("Already-Fine"), "already-fine");
});

test("normalizeAppName rejects empty / dot names", () => {
  assert.throws(() => normalizeAppName(""));
  assert.throws(() => normalizeAppName("   "));
});

// ---------------------------------------------------------------------------
// Scaffolding — common guarantees across ALL templates
// ---------------------------------------------------------------------------

for (const name of [
  "static",
  "vite-react",
  "next-static",
  "nft-drop",
  "dapp-window-chia",
]) {
  test(`scaffold(${name}) writes a runnable project tree`, () => {
    const root = freshDir();
    try {
      const dest = join(root, "my-app");
      const result = scaffold({ appName: "My App", template: name, targetDir: dest });

      assert.equal(result.template, name);
      assert.equal(result.appName, "my-app");

      // Always present: dig.toml, README, package.json, .gitignore
      assert.ok(existsSync(join(dest, "dig.toml")), "dig.toml exists");
      assert.ok(existsSync(join(dest, "README.md")), "README exists");
      assert.ok(existsSync(join(dest, "package.json")), "package.json exists");
      assert.ok(existsSync(join(dest, ".gitignore")), ".gitignore exists");

      // package.json: name substituted, valid JSON, no leftover placeholders.
      const pkgRaw = read(dest, "package.json");
      assert.doesNotMatch(pkgRaw, /__[A-Z_]+__/, "no leftover placeholders in package.json");
      const pkg = JSON.parse(pkgRaw);
      assert.equal(pkg.name, "my-app");

      // dig.toml: kebab-case keys the SDK adapter + digstore read; output dir matches the template.
      const toml = read(dest, "dig.toml");
      assert.doesNotMatch(toml, /__[A-Z_]+__/, "no leftover placeholders in dig.toml");
      assert.match(toml, /output-dir\s*=/, "dig.toml has output-dir");
      assert.match(toml, /build-command\s*=/, "dig.toml has build-command");
      assert.match(toml, new RegExp(`output-dir\\s*=\\s*"${TEMPLATES[name].outputDir}"`));

      // No file in the tree may carry an unsubstituted placeholder token.
      assertNoPlaceholders(dest);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

/** Recursively assert no scaffolded text file contains a `__PLACEHOLDER__` token. */
function assertNoPlaceholders(dir) {
  for (const p of walk(dir)) {
    let text;
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue; // binary / unreadable — nothing to substitute
    }
    assert.doesNotMatch(text, /__[A-Z][A-Z_]*__/, `leftover placeholder in ${p}`);
  }
}

// ---------------------------------------------------------------------------
// SDK wiring — dapp/nft templates pull in @dignetwork/dig-sdk; static ones don't
// ---------------------------------------------------------------------------

test("dapp + nft templates depend on @dignetwork/dig-sdk at the pinned version", () => {
  for (const name of ["dapp-window-chia", "nft-drop"]) {
    const root = freshDir();
    try {
      const dest = join(root, "app");
      scaffold({ appName: "wallet app", template: name, targetDir: dest });
      const pkg = JSON.parse(read(dest, "package.json"));
      const dep = (pkg.dependencies || {})["@dignetwork/dig-sdk"];
      assert.ok(dep, `${name} depends on @dignetwork/dig-sdk`);
      assert.equal(dep, SDK_VERSION, `${name} pins the SDK to SDK_VERSION`);

      // The wallet wiring references ChiaProvider somewhere in the source.
      const srcHit = grepTree(dest, "ChiaProvider");
      assert.ok(srcHit, `${name} wires ChiaProvider`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("static template does NOT pull in the SDK (keep it dependency-light)", () => {
  const root = freshDir();
  try {
    const dest = join(root, "site");
    scaffold({ appName: "plain site", template: "static", targetDir: dest });
    const pkg = JSON.parse(read(dest, "package.json"));
    assert.ok(!(pkg.dependencies || {})["@dignetwork/dig-sdk"], "static has no SDK dep");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// "Free until publish" framing must be in the scaffolded README + next-steps
// ---------------------------------------------------------------------------

test("scaffolded README states free-until-publish and the digstore dev/deploy flow", () => {
  const root = freshDir();
  try {
    const dest = join(root, "app");
    scaffold({ appName: "app", template: "vite-react", targetDir: dest });
    const readme = read(dest, "README.md").toLowerCase();
    assert.match(readme, /free/, "mentions free");
    assert.match(readme, /digstore dev/, "mentions digstore dev");
    assert.match(readme, /digstore deploy/, "mentions digstore deploy");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("nextSteps output names the no-mint/no-spend guarantee", () => {
  const root = freshDir();
  try {
    const dest = join(root, "app");
    const result = scaffold({ appName: "app", template: "static", targetDir: dest });
    const steps = result.nextSteps.join("\n").toLowerCase();
    assert.match(steps, /digstore dev/);
    assert.match(steps, /digstore deploy/);
    assert.match(steps, /free|no mint|no spend|no chain/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Safety: refuse to scaffold into a non-empty dir; reject unknown template
// ---------------------------------------------------------------------------

test("scaffold refuses a non-empty target dir", () => {
  const root = freshDir();
  try {
    const dest = join(root, "occupied");
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "keep.txt"), "hi");
    assert.throws(() => scaffold({ appName: "x", template: "static", targetDir: dest }), /not empty|exists/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scaffold rejects an unknown template before writing anything", () => {
  const root = freshDir();
  try {
    const dest = join(root, "app");
    assert.throws(
      () => scaffold({ appName: "x", template: "nope", targetDir: dest }),
      UnknownTemplateError,
    );
    assert.ok(!existsSync(dest), "nothing written on invalid template");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

import { readdirSync, statSync } from "node:fs";

/** Walk a tree; return every file path. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** True if any text file under dir contains the needle. */
function grepTree(dir, needle) {
  for (const p of walk(dir)) {
    try {
      if (readFileSync(p, "utf8").includes(needle)) return true;
    } catch {
      /* binary / unreadable — skip */
    }
  }
  return false;
}
