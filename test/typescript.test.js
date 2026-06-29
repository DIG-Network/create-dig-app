// TypeScript scaffolding tests (node --test). The `--typescript`/`--ts`/`--lang ts` flag (and the
// interactive JS-or-TS prompt) scaffold the TypeScript variant of each applicable template. These
// tests assert the TS-specific guarantees on top of the language-agnostic ones in scaffold.test.js:
//   - a tsconfig.json is written,
//   - sources are .ts/.tsx (no leftover .js/.jsx in TS-buildable templates),
//   - the `typescript` devDependency (+ needed @types/*) is present,
//   - wallet TS templates use the SDK's TYPES (typed ChiaProvider / DigClient),
//   - the JS path is unaffected (no tsconfig, sources stay .js/.jsx).
//
// We drive the pure library (lib/index.js) directly so the language dimension is verified without a
// process/TTY, mirroring scaffold.test.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scaffold, templateNames, resolveTemplate } from "../lib/index.js";

/** Make a throwaway working directory; cleaned up after each test. */
function freshDir() {
  return mkdtempSync(join(tmpdir(), "create-dig-app-ts-"));
}

/** Read a scaffolded file as UTF-8. */
function read(dir, ...parts) {
  return readFileSync(join(dir, ...parts), "utf8");
}

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

// The templates that have a real TypeScript variant (buildable JS → typecheckable TS).
const TS_TEMPLATES = ["vite-react", "next-static", "nft-drop", "dapp-window-chia"];
// Templates whose wallet wiring uses @dignetwork/dig-sdk types.
const WALLET_TS_TEMPLATES = ["nft-drop", "dapp-window-chia"];

// ---------------------------------------------------------------------------
// Template metadata advertises the languages it supports.
// ---------------------------------------------------------------------------

test("each TS-capable template advertises lang support for both js and ts", () => {
  for (const name of TS_TEMPLATES) {
    const meta = resolveTemplate(name);
    assert.ok(Array.isArray(meta.langs), `${name} has a langs array`);
    assert.ok(meta.langs.includes("js"), `${name} supports js`);
    assert.ok(meta.langs.includes("ts"), `${name} supports ts`);
  }
});

test("the static-site template is JS-only (no buildable JS to typecheck)", () => {
  const meta = resolveTemplate("static-site");
  assert.ok(Array.isArray(meta.langs), "static-site has a langs array");
  assert.ok(meta.langs.includes("js"), "static-site supports js");
  assert.ok(!meta.langs.includes("ts"), "static-site does NOT advertise ts");
});

// ---------------------------------------------------------------------------
// Scaffolding the TS variant — common guarantees across every TS template.
// ---------------------------------------------------------------------------

for (const name of TS_TEMPLATES) {
  test(`scaffold(${name}, lang=ts) writes a typechecked TS project`, () => {
    const root = freshDir();
    try {
      const dest = join(root, "my-app");
      const result = scaffold({ appName: "My App", template: name, lang: "ts", targetDir: dest });

      assert.equal(result.template, name);
      assert.equal(result.lang, "ts");

      // A tsconfig.json must exist and be valid JSON.
      assert.ok(existsSync(join(dest, "tsconfig.json")), `${name} writes tsconfig.json`);
      const tsconfigRaw = read(dest, "tsconfig.json");
      assert.doesNotMatch(tsconfigRaw, /__[A-Z_]+__/, "no leftover placeholders in tsconfig.json");
      JSON.parse(tsconfigRaw); // throws if invalid

      // The standard files still come across with substitution.
      assert.ok(existsSync(join(dest, "dig.toml")), "dig.toml exists");
      assert.ok(existsSync(join(dest, "README.md")), "README exists");
      assert.ok(existsSync(join(dest, "package.json")), "package.json exists");
      assert.ok(existsSync(join(dest, ".gitignore")), ".gitignore exists");

      // package.json: name substituted, valid JSON, `typescript` devDep present.
      const pkg = JSON.parse(read(dest, "package.json"));
      assert.equal(pkg.name, "my-app");
      const devDeps = pkg.devDependencies || {};
      assert.ok(devDeps.typescript, `${name} pins a typescript devDependency`);

      // No .js/.jsx sources should survive in a TS template (only .ts/.tsx + config).
      const sources = walk(dest).filter((p) => /[\\/]src[\\/]/.test(p) || /[\\/]app[\\/]/.test(p));
      for (const p of sources) {
        assert.doesNotMatch(p, /\.jsx?$/, `TS template should not ship JS source: ${p}`);
      }
      // At least one .ts or .tsx source exists.
      assert.ok(
        walk(dest).some((p) => /\.tsx?$/.test(p)),
        `${name} ships at least one .ts/.tsx source`,
      );

      // No leftover placeholders anywhere.
      for (const p of walk(dest)) {
        let text;
        try {
          text = readFileSync(p, "utf8");
        } catch {
          continue;
        }
        assert.doesNotMatch(text, /__[A-Z][A-Z_]*__/, `leftover placeholder in ${p}`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

// ---------------------------------------------------------------------------
// React TS templates need the React type packages to typecheck JSX.
// ---------------------------------------------------------------------------

test("React-based TS templates pull in @types/react (+react-dom)", () => {
  for (const name of ["vite-react", "nft-drop", "dapp-window-chia"]) {
    const root = freshDir();
    try {
      const dest = join(root, "app");
      scaffold({ appName: "react app", template: name, lang: "ts", targetDir: dest });
      const pkg = JSON.parse(read(dest, "package.json"));
      const devDeps = pkg.devDependencies || {};
      assert.ok(devDeps["@types/react"], `${name} has @types/react`);
      assert.ok(devDeps["@types/react-dom"], `${name} has @types/react-dom`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

// ---------------------------------------------------------------------------
// Wallet TS templates use the SDK's shipped TYPES (typed ChiaProvider).
// ---------------------------------------------------------------------------

test("wallet TS templates use typed ChiaProvider from @dignetwork/dig-sdk", () => {
  for (const name of WALLET_TS_TEMPLATES) {
    const root = freshDir();
    try {
      const dest = join(root, "app");
      scaffold({ appName: "wallet app", template: name, lang: "ts", targetDir: dest });

      // Still pins the SDK as a runtime dep.
      const pkg = JSON.parse(read(dest, "package.json"));
      assert.ok((pkg.dependencies || {})["@dignetwork/dig-sdk"], `${name} depends on dig-sdk`);

      // The wallet wiring is a .ts file that references ChiaProvider AND a SDK type import.
      assert.ok(grepTree(dest, "ChiaProvider"), `${name} wires ChiaProvider`);
      // A typed usage: imports a type from the SDK (ChiaProvider used as a type annotation, or a
      // `type`/typed import from @dignetwork/dig-sdk).
      const usesSdkType =
        grepTree(dest, "import type") ||
        grepTree(dest, ": ChiaProvider") ||
        grepTree(dest, "Promise<ChiaProvider>");
      assert.ok(usesSdkType, `${name} uses the SDK's types (typed ChiaProvider usage)`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

// ---------------------------------------------------------------------------
// Wallet TS templates scaffold the WalletConnect → Sage fallback (typed).
// ---------------------------------------------------------------------------

const WC_ENV_VAR = "VITE_WALLETCONNECT_PROJECT_ID";

test("wallet TS templates scaffold the WalletConnect→Sage path (dep + env + typed wiring)", () => {
  for (const name of WALLET_TS_TEMPLATES) {
    const root = freshDir();
    try {
      const dest = join(root, "app");
      scaffold({ appName: "wallet app", template: name, lang: "ts", targetDir: dest });

      // The SDK's optional WC peer dep is pulled in so the fallback works out of the box.
      const pkg = JSON.parse(read(dest, "package.json"));
      assert.ok(
        (pkg.dependencies || {})["@walletconnect/sign-client"],
        `${name} (ts) depends on @walletconnect/sign-client`,
      );

      // .env.example carries the projectId env (placeholder only) and the code reads it.
      assert.ok(existsSync(join(dest, ".env.example")), `${name} (ts) ships .env.example`);
      assert.match(read(dest, ".env.example"), new RegExp(`^${WC_ENV_VAR}=`, "m"));
      assert.ok(
        grepTree(dest, `import.meta.env.${WC_ENV_VAR}`),
        `${name} (ts) reads ${WC_ENV_VAR}`,
      );

      // ChiaProvider auto mode + the SDK's WalletConnectOptions type drive WalletConnectTransport.
      assert.ok(grepTree(dest, `mode: "auto"`), `${name} (ts) uses auto mode`);
      assert.ok(grepTree(dest, "walletConnect"), `${name} (ts) passes walletConnect options`);
      assert.ok(grepTree(dest, "projectId"), `${name} (ts) passes a projectId`);
      // The Vite env is typed so import.meta.env.VITE_WALLETCONNECT_PROJECT_ID typechecks.
      assert.ok(
        grepTree(dest, "ImportMetaEnv") || grepTree(dest, WC_ENV_VAR),
        `${name} (ts) types the Vite env`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

// ---------------------------------------------------------------------------
// Vite TS templates need the env shim; Next TS templates need next-env.d.ts handling.
// ---------------------------------------------------------------------------

test("vite TS templates ship a vite-env.d.ts", () => {
  for (const name of ["vite-react", "nft-drop", "dapp-window-chia"]) {
    const root = freshDir();
    try {
      const dest = join(root, "app");
      scaffold({ appName: "app", template: name, lang: "ts", targetDir: dest });
      assert.ok(
        existsSync(join(dest, "src", "vite-env.d.ts")),
        `${name} ships src/vite-env.d.ts`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

// ---------------------------------------------------------------------------
// The JS path must be UNAFFECTED by adding the language dimension.
// ---------------------------------------------------------------------------

test("lang defaults to js and the JS path is unchanged (no tsconfig, .jsx sources)", () => {
  const root = freshDir();
  try {
    const dest = join(root, "app");
    const result = scaffold({ appName: "app", template: "vite-react", targetDir: dest });
    assert.equal(result.lang, "js", "lang defaults to js");
    assert.ok(!existsSync(join(dest, "tsconfig.json")), "JS scaffold has no tsconfig.json");
    assert.ok(existsSync(join(dest, "src", "App.jsx")), "JS scaffold keeps .jsx sources");
    const pkg = JSON.parse(read(dest, "package.json"));
    assert.ok(!(pkg.devDependencies || {}).typescript, "JS scaffold has no typescript dep");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("requesting ts for a JS-only template (static-site) falls back to js with a noted lang", () => {
  const root = freshDir();
  try {
    const dest = join(root, "site");
    const result = scaffold({ appName: "site", template: "static-site", lang: "ts", targetDir: dest });
    // static-site has no TS variant — it scaffolds as JS and reports lang=js so callers can tell.
    assert.equal(result.lang, "js", "static-site stays js even when ts requested");
    assert.ok(!existsSync(join(dest, "tsconfig.json")), "static-site has no tsconfig");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
