// Template scaffolding tokens must survive prettier untouched (node --test).
//
// Regression for #737: a repo-wide `prettier --write` reformatted the template
// READMEs' markdown, and prettier's emphasis normalization rewrote the literal
// `__DISPLAY_NAME__` placeholder into `**DISPLAY_NAME**` (double-underscore is
// markdown bold syntax, so prettier "fixed" it to asterisks). That placeholder
// is not prose — it's consumed verbatim by lib/substitute.js
// (`/__([A-Z][A-Z0-9_]*)__/g`) to stamp the real project name into the
// scaffolded README. Once mangled, substitution silently no-ops and every
// scaffolded project ships a README literally titled "**DISPLAY_NAME**".
//
// This test pins the token intact in the template SOURCE (not scaffolded
// output) so any future formatting pass over templates/**/*.md is caught
// before it ships.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/** Every README.md under a templates root, recursively. */
function templateReadmes(templatesDir) {
  const root = join(repoRoot, templatesDir);
  const out = [];
  for (const templateName of readdirSync(root)) {
    const readmePath = join(root, templateName, "README.md");
    if (statSync(readmePath, { throwIfNoEntry: false })?.isFile()) {
      out.push(readmePath);
    }
  }
  return out;
}

const allTemplateReadmes = [...templateReadmes("templates"), ...templateReadmes("templates-ts")];

test("every template README.md still exists to check", () => {
  assert.ok(allTemplateReadmes.length >= 10, "expected README.md in every template directory");
});

for (const readmePath of allTemplateReadmes) {
  const relPath = readmePath.slice(repoRoot.length);

  test(`${relPath} carries the literal __DISPLAY_NAME__ scaffolding token (not prettier-mangled)`, () => {
    const text = readFileSync(readmePath, "utf8");

    assert.match(
      text,
      /__DISPLAY_NAME__/,
      `${relPath} must contain the literal __DISPLAY_NAME__ token consumed by lib/substitute.js`,
    );

    // The corruption this guards against: prettier rewriting __TOKEN__ (markdown
    // bold-via-underscore) into **TOKEN** (bold-via-asterisk), which no longer
    // matches substitute.js's __([A-Z][A-Z0-9_]*)__ regex.
    assert.doesNotMatch(
      text,
      /\*\*DISPLAY_NAME\*\*/,
      `${relPath} must not have __DISPLAY_NAME__ mangled into **DISPLAY_NAME**`,
    );
  });
}
