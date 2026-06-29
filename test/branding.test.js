// Branding / UX-consistency guards (node --test).
//
// These pin the ecosystem-wide canon (SYSTEM.md → "Canonical terminology & branding") into the
// scaffolded output + the CLI copy, so the starters can never silently drift off-brand again:
//   - User-facing content scheme is `chia://` (NOT `dig://`) in everything a user reads.
//   - Wallet templates use a real example domain (`example.on.dig.net`), never the invented `.dig`.
//   - Every starter shares ONE DIG accent token (violet→magenta) — no stray green/off-palette accent.
//   - Starters name the DIG brand fonts (Space Grotesk / Space Mono).
//
// They are regression guards: each asserts a fact that was wrong before the create-dig-app UX pass.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scaffold, templateNames, nextSteps, resolveTemplate } from "../lib/index.js";
import { helpText } from "../lib/cli.js";

function freshDir() {
  return mkdtempSync(join(tmpdir(), "create-dig-app-brand-"));
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

/** Every text file's contents under dir, as one big string (for whole-tree assertions). */
function treeText(dir) {
  let all = "";
  for (const p of walk(dir)) {
    try {
      all += "\n/*FILE*/ " + p + "\n" + readFileSync(p, "utf8");
    } catch {
      /* binary — skip */
    }
  }
  return all;
}

// The §21 remote-transport locator `dig://<host>/<store_id>` and the `urn:dig:` namespace are
// EXEMPT from the user-facing rename (they are wire/developer contracts). Neither appears in these
// starters today, so the guard can be a blanket "no user-facing dig:// in scaffolded output".

// ---------------------------------------------------------------------------
// chia:// content scheme — scaffolded output (the user-facing read path)
// ---------------------------------------------------------------------------

for (const name of templateNames()) {
  for (const lang of ["js", "ts"]) {
    // Only assert the language the template actually offers (TS-only-where-available).
    if (lang === "ts" && !resolveTemplate(name).langs.includes("ts")) continue;

    test(`scaffold(${name}, ${lang}) uses chia:// (no user-facing dig://) in every file`, () => {
      const root = freshDir();
      try {
        const dest = join(root, "app");
        scaffold({ appName: "Brand App", template: name, lang, targetDir: dest });
        const text = treeText(dest);
        assert.doesNotMatch(text, /dig:\/\//, "no user-facing dig:// in scaffolded files");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
}

// ---------------------------------------------------------------------------
// chia:// content scheme — the CLI copy + next-steps the user reads
// ---------------------------------------------------------------------------

test("nextSteps describes the preview on the chia:// read path (not dig://)", () => {
  for (const name of templateNames()) {
    const steps = nextSteps({ slug: "app", meta: resolveTemplate(name) }).join("\n");
    assert.doesNotMatch(steps, /dig:\/\//, `${name} next-steps must not say dig://`);
    assert.match(steps, /chia:\/\//, `${name} next-steps name the chia:// preview path`);
  }
});

test("helpText does not surface a user-facing dig:// scheme", () => {
  assert.doesNotMatch(helpText(), /dig:\/\//);
});

// ---------------------------------------------------------------------------
// Wallet metadata — a real example domain, never the invented `.dig` TLD
// ---------------------------------------------------------------------------

test("wallet templates use example.on.dig.net (not the invented example.dig) for WC metadata", () => {
  for (const name of ["nft-drop", "dapp-window-chia"]) {
    for (const lang of ["js", "ts"]) {
      const root = freshDir();
      try {
        const dest = join(root, "app");
        scaffold({ appName: "Wallet App", template: name, lang, targetDir: dest });
        const text = treeText(dest);
        assert.doesNotMatch(text, /example\.dig\b/, `${name}/${lang} must not use example.dig`);
        assert.match(text, /example\.on\.dig\.net/, `${name}/${lang} uses example.on.dig.net`);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Visual: ONE DIG accent token + the DIG brand fonts across every starter
// ---------------------------------------------------------------------------

// Canonical DIG brand accent (SYSTEM.md visual theme; values from dig.net styles/globals.css):
//   violet #5800D6 → magenta #FF00DE. The starters are clean white surfaces that lead with violet.
const DIG_VIOLET = "#5800D6";
const DIG_MAGENTA = "#FF00DE";
const OFF_PALETTE = [/#16a34a/i, /#7c3aed/i, /#2563eb/i]; // green / old-violet / generic blue

/** Read the stylesheet a template renders with (css path differs per template). */
function styleSheetFor(dest) {
  // Try the common locations; return whichever exists.
  for (const rel of ["src/styles.css", "app/globals.css"]) {
    const p = join(dest, rel.split("/").join("/"));
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return "";
}

for (const name of templateNames()) {
  for (const lang of ["js", "ts"]) {
    if (lang === "ts" && !resolveTemplate(name).langs.includes("ts")) continue;

    test(`scaffold(${name}, ${lang}) styles converge on the DIG accent + brand fonts`, () => {
      const root = freshDir();
      try {
        const dest = join(root, "app");
        scaffold({ appName: "Styled App", template: name, lang, targetDir: dest });
        const css = styleSheetFor(dest);
        assert.ok(css.length > 0, `${name}/${lang} ships a stylesheet`);

        // No off-palette accent anywhere in the sheet.
        for (const re of OFF_PALETTE) {
          assert.doesNotMatch(css, re, `${name}/${lang} must not use the off-palette color ${re}`);
        }
        // The DIG accent (violet, with magenta available for the gradient) is present.
        assert.ok(
          css.includes(DIG_VIOLET) || css.includes(DIG_VIOLET.toLowerCase()),
          `${name}/${lang} uses the DIG violet accent ${DIG_VIOLET}`,
        );
        // For templates with an interactive accent surface (a button), magenta is also wired.
        if (resolveTemplate(name).wallet) {
          assert.ok(
            css.includes(DIG_MAGENTA) || css.includes(DIG_MAGENTA.toLowerCase()),
            `${name}/${lang} wallet template wires the DIG magenta ${DIG_MAGENTA}`,
          );
        }
        // The DIG brand fonts are named in the body font stack.
        assert.match(css, /Space Grotesk/, `${name}/${lang} names Space Grotesk`);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
}
