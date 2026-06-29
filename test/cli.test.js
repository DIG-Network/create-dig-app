// CLI surface tests (node --test): arg parsing, help/version, non-interactive validation, and a full
// non-interactive run that actually scaffolds. The interactive prompt path is not exercised here
// (no TTY under the test runner); run() falls back to a clear error when args are missing and
// stdin is not a TTY, which we assert.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseArgs, helpText, helpJson, listTemplatesJson, run, EXIT } from "../lib/cli.js";
import { templateNames } from "../lib/templates.js";

function freshDir() {
  return mkdtempSync(join(tmpdir(), "create-dig-app-cli-"));
}

/** Collect run()'s log output into an array. */
function capture() {
  const lines = [];
  return { log: (s) => lines.push(String(s)), lines, text: () => lines.join("\n") };
}

/**
 * Capture stdout (machine) and stderr (human) separately — the agent-friendly contract routes the
 * structured `--json` payload to stdout and ALL human prose to stderr.
 */
function captureStreams() {
  const out = [];
  const err = [];
  return {
    out: (s) => out.push(String(s)),
    err: (s) => err.push(String(s)),
    log: (s) => err.push(String(s)), // default human sink is stderr in these tests
    outText: () => out.join("\n"),
    errText: () => err.join("\n"),
  };
}

// ---- parseArgs -----------------------------------------------------------

test("parseArgs reads a positional name and --template", () => {
  assert.deepEqual(parseArgs(["my-app", "--template", "static-site"]), {
    appName: "my-app",
    template: "static-site",
  });
});

test("parseArgs supports -t and --template=", () => {
  assert.deepEqual(parseArgs(["x", "-t", "vite-react"]), { appName: "x", template: "vite-react" });
  assert.deepEqual(parseArgs(["x", "--template=nft-drop"]), { appName: "x", template: "nft-drop" });
});

test("parseArgs tolerates the npm-init -- separator", () => {
  assert.deepEqual(parseArgs(["my-app", "--", "--template", "static-site"]), {
    appName: "my-app",
    template: "static-site",
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
  assert.equal(parseArgs(["x", "-t", "static-site"]).lang, undefined);
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

test("run with an unknown template exits with the UNKNOWN_TEMPLATE code + a helpful message", async () => {
  const cap = capture();
  const dir = freshDir();
  try {
    const code = await run(["my-app", "--template", "svelte"], { log: cap.log, cwd: dir });
    assert.equal(code, EXIT.UNKNOWN_TEMPLATE);
    assert.match(cap.text(), /Unknown template/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run scaffolds non-interactively and prints next steps", async () => {
  const cap = capture();
  const dir = freshDir();
  try {
    const code = await run(["My Site", "--template", "static-site"], { log: cap.log, cwd: dir });
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
    const code = await run(["Plain", "--template", "static-site", "--typescript"], {
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

// ---- the legacy `static` alias still works on the CLI -------------------------

test("run accepts the legacy `static` template alias and scaffolds static-site", async () => {
  const cap = capture();
  const dir = freshDir();
  try {
    const code = await run(["Legacy Site", "--template", "static"], { log: cap.log, cwd: dir });
    assert.equal(code, 0);
    assert.ok(existsSync(join(dir, "legacy-site", "dig.toml")), "alias scaffolded a project");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- exit-code table ---------------------------------------------------------

test("EXIT is a documented, differentiated exit-code table", () => {
  assert.equal(EXIT.SUCCESS, 0);
  // Distinct non-zero codes per failure class (no single generic exit 1).
  const codes = [EXIT.USAGE, EXIT.UNKNOWN_TEMPLATE, EXIT.TARGET_NOT_EMPTY, EXIT.MISSING_ARGS];
  assert.equal(new Set(codes).size, codes.length, "exit codes are distinct");
  for (const c of codes) assert.ok(Number.isInteger(c) && c > 1, "non-zero, not the generic 1");
});

test("unknown option exits with the USAGE code (not a generic 1)", async () => {
  const cap = capture();
  const code = await run(["--frobnicate"], { log: cap.log });
  assert.equal(code, EXIT.USAGE);
});

test("unknown template exits with the UNKNOWN_TEMPLATE code", async () => {
  const cap = capture();
  const dir = freshDir();
  try {
    const code = await run(["app", "--template", "svelte"], { log: cap.log, cwd: dir });
    assert.equal(code, EXIT.UNKNOWN_TEMPLATE);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("non-empty target dir exits with the TARGET_NOT_EMPTY code", async () => {
  const cap = capture();
  const dir = freshDir();
  try {
    // Pre-create the (normalized) target dir with a file so the scaffold refuses it.
    const target = join(dir, "app");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "keep.txt"), "x");
    const code = await run(["app", "--template", "static-site"], { log: cap.log, cwd: dir });
    assert.equal(code, EXIT.TARGET_NOT_EMPTY);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("non-interactive with missing args exits with the MISSING_ARGS code", async () => {
  const cap = capture();
  // No appName/template and not a TTY → MISSING_ARGS (run() detects non-interactive).
  const code = await run([], { log: cap.log });
  assert.equal(code, EXIT.MISSING_ARGS);
});

// ---- --json (structured machine output) --------------------------------------

test("--json emits the scaffold result to stdout and routes prose to stderr", async () => {
  const cap = captureStreams();
  const dir = freshDir();
  try {
    const code = await run(["My JSON App", "--template", "vite-react", "--json"], {
      out: cap.out,
      err: cap.err,
      log: cap.log,
      cwd: dir,
    });
    assert.equal(code, EXIT.SUCCESS);
    // stdout is exactly one JSON object (parseable).
    const doc = JSON.parse(cap.outText());
    assert.equal(doc.ok, true);
    assert.equal(typeof doc.schemaVersion, "number");
    assert.equal(doc.result.appName, "my-json-app");
    assert.equal(doc.result.template, "vite-react");
    assert.equal(doc.result.lang, "js");
    assert.ok(Array.isArray(doc.result.nextSteps) && doc.result.nextSteps.length > 0);
    assert.ok(doc.result.targetDir.length > 0);
    // No human prose leaked into stdout.
    assert.doesNotMatch(cap.outText(), /Next steps:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--json on a failure emits a structured error envelope with a stable code", async () => {
  const cap = captureStreams();
  const dir = freshDir();
  try {
    const code = await run(["app", "--template", "svelte", "--json"], {
      out: cap.out,
      err: cap.err,
      log: cap.log,
      cwd: dir,
    });
    assert.equal(code, EXIT.UNKNOWN_TEMPLATE);
    const doc = JSON.parse(cap.outText());
    assert.equal(doc.ok, false);
    assert.equal(doc.error.code, "UNKNOWN_TEMPLATE");
    assert.equal(doc.error.exit_code, EXIT.UNKNOWN_TEMPLATE);
    assert.equal(typeof doc.error.message, "string");
    // The structured field carried through (not flattened into prose).
    assert.equal(doc.error.template, "svelte");
    assert.ok(doc.error.hint, "error carries an actionable hint");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- --help-json (machine self-description) ----------------------------------

test("helpJson describes flags, the template tree, and the exit-code table", () => {
  const doc = helpJson();
  assert.equal(typeof doc.schemaVersion, "number");
  assert.ok(Array.isArray(doc.flags) && doc.flags.length > 0, "lists flags");
  // The template tree is the registry as data.
  assert.ok(Array.isArray(doc.templates), "lists templates");
  const ids = doc.templates.map((t) => t.id);
  for (const n of templateNames()) assert.ok(ids.includes(n), `templates include ${n}`);
  // The exit-code table is present and differentiated.
  assert.ok(doc.exitCodes && typeof doc.exitCodes === "object", "has exit-code table");
  assert.equal(doc.exitCodes["0"] ? true : doc.exitCodes[0] !== undefined, true);
});

test("run --help-json prints the machine self-description to stdout and exits 0", async () => {
  const cap = captureStreams();
  const code = await run(["--help-json"], { out: cap.out, err: cap.err, log: cap.log });
  assert.equal(code, EXIT.SUCCESS);
  const doc = JSON.parse(cap.outText());
  assert.ok(Array.isArray(doc.templates));
  assert.ok(doc.exitCodes);
});

// ---- --list-templates --json -------------------------------------------------

test("listTemplatesJson returns the registry as data (id/title/langs/wallet/outputDir)", () => {
  const list = listTemplatesJson();
  assert.ok(Array.isArray(list));
  const byId = Object.fromEntries(list.map((t) => [t.id, t]));
  assert.ok(byId["static-site"], "static-site present");
  assert.equal(byId["static-site"].wallet, false);
  assert.deepEqual(byId["static-site"].langs, ["js"]);
  assert.equal(byId["nft-drop"].wallet, true);
  assert.ok(byId["vite-react"].langs.includes("ts"));
});

test("run --list-templates --json prints the template registry as JSON", async () => {
  const cap = captureStreams();
  const code = await run(["--list-templates", "--json"], {
    out: cap.out,
    err: cap.err,
    log: cap.log,
  });
  assert.equal(code, EXIT.SUCCESS);
  const doc = JSON.parse(cap.outText());
  // Either a bare array or an envelope carrying the array — accept the envelope shape.
  const list = Array.isArray(doc) ? doc : doc.templates;
  assert.ok(Array.isArray(list) && list.some((t) => t.id === "static-site"));
});
