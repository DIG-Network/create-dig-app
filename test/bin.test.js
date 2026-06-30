// Entry-point integration tests (node --test): spawn the REAL `bin/create-dig-app.js` the way
// `npm create dig-app` runs it, and assert it forwards argv, reads its own version, and maps the
// process exit code from run(). This exercises the published entry point end-to-end (no network,
// no chain) — the unit tests drive lib/ directly, this proves the bin wiring + process.exit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, "..", "bin", "create-dig-app.js");
// Read the version the same way the bin does, so the assertion tracks the real package version.
const PKG_VERSION = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")).version;

/**
 * Run the bin and capture stdout + exit code. execFileSync throws on a non-zero exit; we catch it
 * and surface the status + captured stdout so a test can assert on the exit code.
 */
function runBin(args, opts = {}) {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    return { status: 0, stdout };
  } catch (e) {
    return { status: e.status ?? 1, stdout: (e.stdout ?? "").toString() };
  }
}

test("bin --version prints the package.json version (read by the bin itself)", () => {
  const { status, stdout } = runBin(["--version"]);
  assert.equal(status, 0);
  assert.match(stdout, new RegExp(PKG_VERSION.replace(/\./g, "\\.")));
});

test("bin --help-json emits the machine self-description", () => {
  const { status, stdout } = runBin(["--help-json"]);
  assert.equal(status, 0);
  const doc = JSON.parse(stdout);
  assert.ok(Array.isArray(doc.templates));
  assert.ok(doc.exitCodes);
});

test("bin scaffolds non-interactively and exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "cda-bin-"));
  try {
    const { status } = runBin(["My Bin App", "--template", "static-site"], { cwd: dir });
    assert.equal(status, 0);
    assert.ok(existsSync(join(dir, "my-bin-app", "dig.toml")), "bin scaffolded into the cwd");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bin maps a failure to the documented non-zero exit code (process.exit wiring)", () => {
  const dir = mkdtempSync(join(tmpdir(), "cda-bin-fail-"));
  try {
    // Unknown template → EXIT.UNKNOWN_TEMPLATE (3); proves the bin returns run()'s code via exit().
    const { status } = runBin(["app", "--template", "svelte"], { cwd: dir });
    assert.equal(status, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
