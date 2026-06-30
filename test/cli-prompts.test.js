// Interactive-prompt + error-classification unit tests (node --test).
//
// The prompt helpers (ask / askTemplate / askLang) take an injected `rl`-like object whose async
// `question()` returns the user's typed line, so the interactive flow is unit-testable WITHOUT a TTY
// (production passes a node:readline/promises interface; here we pass a scripted fake). This covers
// the re-prompt-on-bad-input loops and the JS-only short-circuit that the non-interactive cli.test.js
// can't reach. classifyError is covered here for every branch of the EXIT table.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ask, askTemplate, askLang, classifyError, EXIT } from "../lib/cli.js";
import { templateNames, UnknownTemplateError } from "../lib/templates.js";

/**
 * A fake readline interface: hands back the queued answers in order. Records the prompts it was
 * asked so a test can assert what the user was shown.
 * @param {string[]} answers
 */
function fakeRl(answers) {
  const queue = [...answers];
  const prompts = [];
  return {
    prompts,
    question: async (q) => {
      prompts.push(q);
      if (queue.length === 0) throw new Error(`fakeRl ran out of answers (prompt: ${q})`);
      return queue.shift();
    },
  };
}

// ---- ask -----------------------------------------------------------------

test("ask returns the trimmed answer when one is given", async () => {
  const rl = fakeRl(["  my-app  "]);
  assert.equal(await ask(rl, "Project name", "fallback"), "my-app");
});

test("ask returns the fallback when the answer is blank", async () => {
  const rl = fakeRl([""]);
  assert.equal(await ask(rl, "Project name", "my-dig-app"), "my-dig-app");
  // The fallback is shown in the prompt suffix.
  assert.match(rl.prompts[0], /\(my-dig-app\)/);
});

test("ask returns empty string when blank and there is no fallback", async () => {
  const rl = fakeRl([""]);
  assert.equal(await ask(rl, "Anything"), "");
});

// ---- askTemplate ---------------------------------------------------------

test("askTemplate accepts a 1-based number and returns that template id", async () => {
  const names = templateNames();
  const rl = fakeRl(["2"]);
  assert.equal(await askTemplate(rl), names[1]);
});

test("askTemplate defaults to the first template on a blank answer", async () => {
  const names = templateNames();
  const rl = fakeRl([""]);
  assert.equal(await askTemplate(rl), names[0]);
});

test("askTemplate accepts a template typed by name", async () => {
  const rl = fakeRl(["vite-react"]);
  assert.equal(await askTemplate(rl), "vite-react");
});

test("askTemplate re-prompts on an out-of-range number, then accepts a valid one", async () => {
  const names = templateNames();
  const rl = fakeRl(["999", "1"]);
  assert.equal(await askTemplate(rl), names[0]);
  // Two questions were asked (the bad one + the good one).
  assert.equal(rl.prompts.length, 2);
});

test("askTemplate re-prompts on garbage input, then accepts a name", async () => {
  const rl = fakeRl(["not-a-template", "nft-drop"]);
  assert.equal(await askTemplate(rl), "nft-drop");
  assert.equal(rl.prompts.length, 2);
});

// ---- askLang -------------------------------------------------------------

test("askLang short-circuits to js for a JS-only template (no prompt)", async () => {
  const rl = fakeRl([]); // would throw if it tried to ask
  assert.equal(await askLang(rl, "static-site"), "js");
  assert.equal(rl.prompts.length, 0, "JS-only template asks nothing");
});

test("askLang returns js for answer '1' and ts for answer '2' on a TS-capable template", async () => {
  assert.equal(await askLang(fakeRl(["1"]), "vite-react"), "js");
  assert.equal(await askLang(fakeRl(["2"]), "vite-react"), "ts");
});

test("askLang defaults to js on a blank answer", async () => {
  assert.equal(await askLang(fakeRl([""]), "vite-react"), "js");
});

test("askLang accepts a language typed by name (js/ts/javascript/typescript)", async () => {
  assert.equal(await askLang(fakeRl(["typescript"]), "vite-react"), "ts");
  assert.equal(await askLang(fakeRl(["js"]), "vite-react"), "js");
});

test("askLang re-prompts on an invalid language, then accepts a valid one", async () => {
  const rl = fakeRl(["rust", "2"]);
  assert.equal(await askLang(rl, "vite-react"), "ts");
  assert.equal(rl.prompts.length, 2);
});

// ---- classifyError -------------------------------------------------------

test("classifyError maps UnknownTemplateError to UNKNOWN_TEMPLATE with the requested id", () => {
  const info = classifyError(new UnknownTemplateError("svelte"));
  assert.equal(info.code, "UNKNOWN_TEMPLATE");
  assert.equal(info.exit_code, EXIT.UNKNOWN_TEMPLATE);
  assert.equal(info.extra.template, "svelte");
  assert.ok(info.hint);
});

test("classifyError maps a non-empty-target error to TARGET_NOT_EMPTY", () => {
  const info = classifyError(new Error('target directory "x" exists and is not empty — choose a new name.'));
  assert.equal(info.code, "TARGET_NOT_EMPTY");
  assert.equal(info.exit_code, EXIT.TARGET_NOT_EMPTY);
});

test("classifyError maps a missing-template-files error to TEMPLATE_FILES_MISSING", () => {
  const info = classifyError(new Error('template files for "vite-react" (ts) are missing at /nope'));
  assert.equal(info.code, "TEMPLATE_FILES_MISSING");
  assert.equal(info.exit_code, EXIT.TEMPLATE_FILES_MISSING);
});

test("classifyError maps an unusable-name error to INVALID_APP_NAME (both wordings)", () => {
  const a = classifyError(new Error('"!!!" is not a usable app name (it must contain letters or digits)'));
  assert.equal(a.code, "INVALID_APP_NAME");
  assert.equal(a.exit_code, EXIT.INVALID_APP_NAME);
  const b = classifyError(new Error("app name must be a string"));
  assert.equal(b.code, "INVALID_APP_NAME");
});

test("classifyError falls back to INTERNAL for an unrecognized error", () => {
  const info = classifyError(new Error("something unexpected blew up"));
  assert.equal(info.code, "INTERNAL");
  assert.equal(info.exit_code, EXIT.INTERNAL);
  assert.ok(info.hint);
});

test("classifyError tolerates a non-Error thrown value", () => {
  const info = classifyError("just a string");
  assert.equal(info.code, "INTERNAL");
  assert.equal(info.message, "just a string");
});
