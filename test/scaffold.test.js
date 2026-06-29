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
  canonicalTemplateName,
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

test("exposes the six committed templates", () => {
  const names = templateNames().sort();
  assert.deepEqual(names, [
    "dapp-window-chia",
    "next-static",
    "nft-collection",
    "nft-drop",
    "static-site",
    "vite-react",
  ].sort());
});

test("the legacy `static` id is a hidden alias for `static-site` (back-compat)", () => {
  // The alias resolves to the canonical template…
  assert.equal(resolveTemplate("static").name, "static-site");
  assert.equal(resolveTemplate("static-site").name, "static-site");
  assert.equal(canonicalTemplateName("static"), "static-site");
  // …but is NOT advertised in the public template list (the picker/help show only canonical names).
  assert.ok(!templateNames().includes("static"), "alias is hidden from templateNames()");
});

test("scaffolding via the legacy `static` alias produces the static-site project", () => {
  const root = freshDir();
  try {
    const dest = join(root, "app");
    const result = scaffold({ appName: "App", template: "static", targetDir: dest });
    assert.equal(result.template, "static-site", "alias scaffolds the canonical template");
    assert.ok(existsSync(join(dest, "dig.toml")), "scaffolded a real project");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every template has a description and an output dir", () => {
  for (const name of templateNames()) {
    const t = TEMPLATES[name];
    assert.ok(t.description && typeof t.description === "string", `${name} description`);
    assert.ok(t.outputDir && typeof t.outputDir === "string", `${name} outputDir`);
  }
});

test("resolveTemplate accepts a known template and rejects an unknown one", () => {
  assert.equal(resolveTemplate("static-site").name, "static-site");
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
  "static-site",
  "vite-react",
  "next-static",
  "nft-drop",
  "nft-collection",
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
  for (const name of ["dapp-window-chia", "nft-drop", "nft-collection"]) {
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

test("static-site template does NOT pull in the SDK (keep it dependency-light)", () => {
  const root = freshDir();
  try {
    const dest = join(root, "site");
    scaffold({ appName: "plain site", template: "static-site", targetDir: dest });
    const pkg = JSON.parse(read(dest, "package.json"));
    assert.ok(!(pkg.dependencies || {})["@dignetwork/dig-sdk"], "static-site has no SDK dep");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// WalletConnect → Sage fallback — wallet templates must scaffold the WC path so a
// dapp connects to Sage in a normal browser (not just the injected DIG Browser wallet).
// ---------------------------------------------------------------------------

// The wallet templates and the env var the WC fallback reads (both are Vite apps).
const WALLET_TEMPLATES = ["dapp-window-chia", "nft-drop"];
const WC_ENV_VAR = "VITE_WALLETCONNECT_PROJECT_ID";

test("wallet templates depend on @walletconnect/sign-client (the SDK's WC peer dep)", () => {
  for (const name of WALLET_TEMPLATES) {
    const root = freshDir();
    try {
      const dest = join(root, "app");
      scaffold({ appName: "wallet app", template: name, targetDir: dest });
      const pkg = JSON.parse(read(dest, "package.json"));
      const dep = (pkg.dependencies || {})["@walletconnect/sign-client"];
      assert.ok(dep, `${name} depends on @walletconnect/sign-client so the WC→Sage fallback works`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("wallet templates ship a .env.example with the WalletConnect projectId placeholder", () => {
  for (const name of WALLET_TEMPLATES) {
    const root = freshDir();
    try {
      const dest = join(root, "app");
      scaffold({ appName: "wallet app", template: name, targetDir: dest });
      assert.ok(existsSync(join(dest, ".env.example")), `${name} ships .env.example`);
      const env = read(dest, ".env.example");
      assert.match(env, new RegExp(`^${WC_ENV_VAR}=`, "m"), `${name} .env.example sets ${WC_ENV_VAR}`);
      // Placeholder only — never a real projectId committed in the template.
      assert.doesNotMatch(env, /__[A-Z_]+__/, "no leftover placeholders in .env.example");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("wallet templates read the WC projectId from the VITE_ env (no hardcoded id)", () => {
  for (const name of WALLET_TEMPLATES) {
    const root = freshDir();
    try {
      const dest = join(root, "app");
      scaffold({ appName: "wallet app", template: name, targetDir: dest });
      // The wallet wiring reads the projectId from import.meta.env.VITE_WALLETCONNECT_PROJECT_ID.
      assert.ok(
        grepTree(dest, `import.meta.env.${WC_ENV_VAR}`),
        `${name} reads ${WC_ENV_VAR} from import.meta.env`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("wallet templates wire ChiaProvider in auto mode with WalletConnect→Sage", () => {
  for (const name of WALLET_TEMPLATES) {
    const root = freshDir();
    try {
      const dest = join(root, "app");
      scaffold({ appName: "wallet app", template: name, targetDir: dest });
      // auto mode = prefer injected window.chia, fall back to WalletConnect → Sage.
      assert.ok(grepTree(dest, `mode: "auto"`), `${name} uses ChiaProvider auto mode`);
      // The walletConnect options drive the SDK's WalletConnectTransport (projectId + metadata).
      assert.ok(grepTree(dest, "walletConnect"), `${name} passes walletConnect options`);
      assert.ok(grepTree(dest, "projectId"), `${name} passes a projectId`);
      // The pairing URI hook is wired so the WC fallback can show a QR / deep link to Sage.
      assert.ok(grepTree(dest, "onUri"), `${name} wires the onUri pairing hook`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("wallet README documents the WalletConnect projectId (Reown / WalletConnect Cloud)", () => {
  for (const name of WALLET_TEMPLATES) {
    const root = freshDir();
    try {
      const dest = join(root, "app");
      scaffold({ appName: "wallet app", template: name, targetDir: dest });
      const readme = read(dest, "README.md");
      assert.match(readme, new RegExp(WC_ENV_VAR), `${name} README names ${WC_ENV_VAR}`);
      assert.match(readme, /reown|walletconnect cloud/i, `${name} README points at Reown / WalletConnect Cloud`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
    const result = scaffold({ appName: "app", template: "static-site", targetDir: dest });
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
    assert.throws(() => scaffold({ appName: "x", template: "static-site", targetDir: dest }), /not empty|exists/i);
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
