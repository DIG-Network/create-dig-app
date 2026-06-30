// Additional run() branch coverage (node --test): the non-interactive structured/plain branches the
// existing cli.test.js doesn't reach — --version --json, --list-templates without --json, the
// MISSING_ARGS and BAD_USAGE structured-error envelopes, and a parse error under --json.

import { test } from "node:test";
import assert from "node:assert/strict";

import { run, EXIT } from "../lib/cli.js";

/** Capture stdout (machine) + stderr (human) separately, matching the cli.test.js helper. */
function captureStreams() {
  const out = [];
  const err = [];
  return {
    out: (s) => out.push(String(s)),
    err: (s) => err.push(String(s)),
    log: (s) => err.push(String(s)),
    outText: () => out.join("\n"),
    errText: () => err.join("\n"),
  };
}

test("run --version --json emits a structured version envelope to stdout", async () => {
  const cap = captureStreams();
  const code = await run(["--version", "--json"], { out: cap.out, err: cap.err, log: cap.log, version: "1.2.3" });
  assert.equal(code, EXIT.SUCCESS);
  const doc = JSON.parse(cap.outText());
  assert.equal(doc.version, "1.2.3");
  assert.equal(typeof doc.schemaVersion, "number");
});

test("run --version with no injected version prints 'unknown'", async () => {
  const cap = captureStreams();
  const code = await run(["--version"], { log: cap.log });
  assert.equal(code, EXIT.SUCCESS);
  assert.match(cap.errText(), /unknown/);
});

test("run --list-templates without --json prints the human help text", async () => {
  const cap = captureStreams();
  const code = await run(["--list-templates"], { log: cap.log });
  assert.equal(code, EXIT.SUCCESS);
  assert.match(cap.errText(), /Templates:/);
});

test("run --json with missing args emits a MISSING_ARGS error envelope", async () => {
  const cap = captureStreams();
  const code = await run(["--json"], { out: cap.out, err: cap.err, log: cap.log });
  assert.equal(code, EXIT.MISSING_ARGS);
  const doc = JSON.parse(cap.outText());
  assert.equal(doc.ok, false);
  assert.equal(doc.error.code, "MISSING_ARGS");
  assert.equal(doc.error.exit_code, EXIT.MISSING_ARGS);
  assert.ok(doc.error.hint);
});

test("run --json with a parse error emits a BAD_USAGE error envelope to stdout", async () => {
  const cap = captureStreams();
  const code = await run(["--frobnicate", "--json"], { out: cap.out, err: cap.err, log: cap.log });
  assert.equal(code, EXIT.USAGE);
  const doc = JSON.parse(cap.outText());
  assert.equal(doc.ok, false);
  assert.equal(doc.error.code, "BAD_USAGE");
  assert.equal(doc.error.exit_code, EXIT.USAGE);
});

test("run --help under --json routes help prose to stderr (not stdout)", async () => {
  const cap = captureStreams();
  const code = await run(["--help", "--json"], { out: cap.out, err: cap.err, log: cap.log });
  assert.equal(code, EXIT.SUCCESS);
  // --help honors --json by sending the human help to the human sink (stderr here).
  assert.match(cap.errText(), /Usage:/);
  assert.equal(cap.outText(), "", "no machine output for --help");
});
