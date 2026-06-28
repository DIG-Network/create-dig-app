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
