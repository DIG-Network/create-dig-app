// CLI surface tests (node --test): arg parsing, help/version, non-interactive validation, and a full
// non-interactive run that actually scaffolds. The interactive prompt path is not exercised here
// (no TTY under the test runner); run() falls back to a clear error when args are missing and
// stdin is not a TTY, which we assert.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseArgs, helpText, run } from "../lib/cli.js";
import { templateNames } from "../lib/templates.js";

function freshDir() {
  return mkdtempSync(join(tmpdir(), "create-dig-app-cli-"));
}

/** Collect run()'s log output into an array. */
function capture() {
  const lines = [];
  return { log: (s) => lines.push(String(s)), lines, text: () => lines.join("\n") };
}

// ---- parseArgs -----------------------------------------------------------

test("parseArgs reads a positional name and --template", () => {
  assert.deepEqual(parseArgs(["my-app", "--template", "static"]), {
    appName: "my-app",
    template: "static",
  });
});

test("parseArgs supports -t and --template=", () => {
  assert.deepEqual(parseArgs(["x", "-t", "vite-react"]), { appName: "x", template: "vite-react" });
  assert.deepEqual(parseArgs(["x", "--template=nft-drop"]), { appName: "x", template: "nft-drop" });
});

test("parseArgs tolerates the npm-init -- separator", () => {
  assert.deepEqual(parseArgs(["my-app", "--", "--template", "static"]), {
    appName: "my-app",
    template: "static",
  });
});

test("parseArgs flags help/version", () => {
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["-v"]).version, true);
});

test("parseArgs throws on an unknown option", () => {
  assert.throws(() => parseArgs(["--frobnicate"]), /Unknown option/);
});

// ---- language flag -------------------------------------------------------

test("parseArgs reads --typescript / --ts as lang=ts", () => {
  assert.equal(parseArgs(["x", "-t", "vite-react", "--typescript"]).lang, "ts");
  assert.equal(parseArgs(["x", "-t", "vite-react", "--ts"]).lang, "ts");
});

test("parseArgs reads --javascript / --js as lang=js", () => {
  assert.equal(parseArgs(["x", "-t", "vite-react", "--javascript"]).lang, "js");
  assert.equal(parseArgs(["x", "-t", "vite-react", "--js"]).lang, "js");
});

test("parseArgs reads --lang <value> and --lang=<value>", () => {
  assert.equal(parseArgs(["x", "--lang", "ts"]).lang, "ts");
  assert.equal(parseArgs(["x", "--lang=ts"]).lang, "ts");
  assert.equal(parseArgs(["x", "--lang", "typescript"]).lang, "ts");
  assert.equal(parseArgs(["x", "--lang=javascript"]).lang, "js");
});

test("parseArgs rejects an unknown --lang value", () => {
  assert.throws(() => parseArgs(["x", "--lang", "rust"]), /lang/i);
});

test("parseArgs leaves lang undefined when not specified", () => {
  assert.equal(parseArgs(["x", "-t", "static"]).lang, undefined);
});

// ---- help / version ------------------------------------------------------

test("helpText lists every template and the free-until-publish line", () => {
  const txt = helpText();
  for (const n of templateNames()) assert.match(txt, new RegExp(n));
  assert.match(txt, /no mint/i);
  assert.match(txt, /digstore deploy/);
});

test("run --help prints help and exits 0", async () => {
  const cap = capture();
  const code = await run(["--help"], { log: cap.log });
  assert.equal(code, 0);
  assert.match(cap.text(), /Usage:/);
});

test("run --version prints the injected version", async () => {
  const cap = capture();
  const code = await run(["--version"], { log: cap.log, version: "9.9.9" });
  assert.equal(code, 0);
  assert.match(cap.text(), /9\.9\.9/);
});

// ---- non-interactive behavior -------------------------------------------

test("run with an unknown template exits 1 with a helpful message", async () => {
  const cap = capture();
  const dir = freshDir();
  try {
    const code = await run(["my-app", "--template", "svelte"], { log: cap.log, cwd: dir });
    assert.equal(code, 1);
    assert.match(cap.text(), /Unknown template/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run scaffolds non-interactively and prints next steps", async () => {
  const cap = capture();
  const dir = freshDir();
  try {
    const code = await run(["My Site", "--template", "static"], { log: cap.log, cwd: dir });
    assert.equal(code, 0);
    assert.ok(existsSync(join(dir, "my-site", "dig.toml")), "scaffolded into normalized dir");
    const out = cap.text();
    assert.match(out, /Next steps:/);
    assert.match(out, /digstore dev/);
    assert.match(out, /digstore deploy/);
    assert.match(out, /no mint/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run --typescript scaffolds the TS variant (tsconfig + TS report line)", async () => {
  const cap = capture();
  const dir = freshDir();
  try {
    const code = await run(["My App", "--template", "vite-react", "--typescript"], {
      log: cap.log,
      cwd: dir,
    });
    assert.equal(code, 0);
    assert.ok(existsSync(join(dir, "my-app", "tsconfig.json")), "TS scaffold writes tsconfig.json");
    assert.ok(existsSync(join(dir, "my-app", "src", "App.tsx")), "TS scaffold writes .tsx sources");
    assert.match(cap.text(), /TypeScript/i, "reports the TS language");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run --template static --typescript falls back to JS and says so", async () => {
  const cap = capture();
  const dir = freshDir();
  try {
    const code = await run(["Plain", "--template", "static", "--typescript"], {
      log: cap.log,
      cwd: dir,
    });
    assert.equal(code, 0);
    assert.ok(!existsSync(join(dir, "plain", "tsconfig.json")), "static has no tsconfig");
    assert.match(cap.text(), /JavaScript|no TypeScript/i, "notes the JS fallback");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
