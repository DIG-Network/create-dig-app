// nft-collection TEMPLATE integration tests (node --test).
//
// These scaffold the real `nft-collection` template into a temp dir and exercise the VENDORED tool
// (templates/nft-collection/scripts/dig-nft.mjs) as a subprocess — the exact path a user hits with
// `npm run generate` / `npm run validate`. They guard two things:
//   1. The template ships the expected directory structure + placeholder art + tooling.
//   2. The vendored script stays in LOCK-STEP with the canonical lib (lib/nft-metadata.js): the
//      metadata it generates is byte-identical to what the lib produces for the same inputs. (The
//      script is a hand-vendored copy because the scaffolded project must be dependency-free and
//      cannot import create-dig-app's lib — so this parity test is the anti-drift guard.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scaffold } from "../lib/index.js";
import { generateItemMetadata, canonicalJson, parseTraitsCsv } from "../lib/nft-metadata.js";

function freshDir() {
  return mkdtempSync(join(tmpdir(), "cda-nfttpl-"));
}

/** Scaffold the nft-collection template into a fresh temp dir; return its path. */
function scaffoldCollection(root) {
  const dest = join(root, "coll");
  scaffold({ appName: "Test Collection", template: "nft-collection", targetDir: dest });
  return dest;
}

// ---------------------------------------------------------------------------
// Structure + placeholders
// ---------------------------------------------------------------------------

test("nft-collection scaffolds the directory structure + placeholder art + tooling", () => {
  const root = freshDir();
  try {
    const dest = scaffoldCollection(root);
    // Directories
    for (const d of ["images", "assets", "metadata", "licenses", "scripts"]) {
      assert.ok(existsSync(join(dest, d)), `ships ${d}/`);
    }
    // Common collection-info file + manifest config
    assert.ok(existsSync(join(dest, "collection.json")), "ships collection.json");
    assert.ok(existsSync(join(dest, "dig.toml")), "ships dig.toml");
    assert.ok(existsSync(join(dest, "README.md")), "ships README");
    // Placeholder art: banner + icon + 1-2 sample item images (valid, non-empty files)
    assert.ok(existsSync(join(dest, "assets", "banner.svg")), "banner placeholder");
    assert.ok(existsSync(join(dest, "assets", "icon.svg")), "icon placeholder");
    const images = readdirSync(join(dest, "images")).filter((f) => /\.(svg|png|jpe?g|gif|webp)$/i.test(f));
    assert.ok(images.length >= 1, "at least one sample item image");
    for (const img of images) {
      assert.ok(readFileSync(join(dest, "images", img)).length > 0, `${img} is a non-empty image`);
    }
    // The tooling
    assert.ok(existsSync(join(dest, "scripts", "dig-nft.mjs")), "ships the generator tool");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("collection.json carries the common fields (royalty, license, attributes, icon/banner)", () => {
  const root = freshDir();
  try {
    const dest = scaffoldCollection(root);
    const col = JSON.parse(readFileSync(join(dest, "collection.json"), "utf8"));
    assert.equal(col.name, "Test Collection"); // __DISPLAY_NAME__ substituted
    assert.ok("royalty_address" in col, "has royalty_address");
    assert.ok(Number.isInteger(col.royalty_basis_points), "has royalty_basis_points");
    assert.ok(col.license, "has a license selection");
    assert.ok(Array.isArray(col.attributes), "has shared attributes");
    assert.ok(col.icon && col.banner, "references icon + banner");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("README documents the flow and links the nft-developers docs", () => {
  const root = freshDir();
  try {
    const dest = scaffoldCollection(root);
    const readme = readFileSync(join(dest, "README.md"), "utf8");
    assert.match(readme, /docs\.dig\.net\/docs\/audiences\/nft-developers/, "links the docs");
    assert.match(readme, /digstore collection mint/, "documents the mint command");
    assert.match(readme, /generate:metadata|npm run generate/, "documents the generate step");
    assert.match(readme, /CHIP-0007/, "names CHIP-0007");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// End-to-end: run the VENDORED tool as a subprocess, assert canonical + valid
// ---------------------------------------------------------------------------

test("vendored tool generates + validates a real collection (subprocess, exit 0)", () => {
  const root = freshDir();
  try {
    const dest = scaffoldCollection(root);
    const script = join(dest, "scripts", "dig-nft.mjs");
    // license → metadata → validate, the way `npm run generate && npm run validate` does.
    execFileSync(process.execPath, [script, "license"], { cwd: dest });
    execFileSync(process.execPath, [script, "metadata"], { cwd: dest });
    const out = execFileSync(process.execPath, [script, "validate"], { cwd: dest, encoding: "utf8" });
    assert.match(out, /OK/, "validate reports OK");
    // It produced one metadata file per sample image + the manifest.
    const metaFiles = readdirSync(join(dest, "metadata")).filter((f) => f.endsWith(".json"));
    assert.ok(metaFiles.length >= 1, "generated metadata files");
    assert.ok(existsSync(join(dest, "items.json")), "generated items.json manifest");
    // The license file the chosen license id maps to was written.
    assert.ok(readdirSync(join(dest, "licenses")).some((f) => f.startsWith("LICENSE-")), "wrote a license");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("vendored tool output is byte-identical to the canonical lib (anti-drift)", () => {
  const root = freshDir();
  try {
    const dest = scaffoldCollection(root);
    const script = join(dest, "scripts", "dig-nft.mjs");
    execFileSync(process.execPath, [script, "metadata"], { cwd: dest });

    // Re-derive the SAME metadata with the canonical lib from the scaffolded inputs, and compare the
    // canonical JSON byte-for-byte. If the vendored copy ever drifts, this fails.
    const col = JSON.parse(readFileSync(join(dest, "collection.json"), "utf8"));
    const collection = { id: undefined, ...col };
    // The template derives id from name; mirror that.
    collection.id =
      col.id ||
      String(col.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const items = parseTraitsCsv(readFileSync(join(dest, "traits.csv"), "utf8"));
    const expected = generateItemMetadata(collection, items);

    // Match each expected doc to its on-disk file by canonical JSON.
    const onDisk = readdirSync(join(dest, "metadata"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => readFileSync(join(dest, "metadata", f), "utf8").trim());
    for (const md of expected) {
      const json = canonicalJson(md);
      assert.ok(onDisk.includes(json), `vendored tool emitted the canonical doc for "${md.name}"`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
