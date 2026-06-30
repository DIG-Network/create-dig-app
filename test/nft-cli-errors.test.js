// NFT orchestrator error-path + alt-input coverage (node --test).
//
// nft-cli.test.js covers the happy path + a couple of failures; this file drives the remaining
// error branches and the traits.json input path so every guard in lib/nft-cli.js is exercised
// against a real temp project tree (no process spawned).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  generateMetadata,
  generateLicense,
  validateProject,
  loadCollection,
  PLACEHOLDER_STORE_ID,
} from "../lib/nft-cli.js";

/** A 1x1 transparent PNG (real, valid image bytes). */
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function freshProject(collection = {}) {
  const root = mkdtempSync(join(tmpdir(), "dig-nft-err-"));
  mkdirSync(join(root, "images"), { recursive: true });
  const col = { name: "DIG Frogs", license: "cc0", ...collection };
  writeFileSync(join(root, "collection.json"), JSON.stringify(col, null, 2));
  return root;
}

// ---- loadCollection guards ----------------------------------------------

test("loadCollection throws when collection.json is absent", () => {
  const root = mkdtempSync(join(tmpdir(), "dig-nft-nocol-"));
  try {
    assert.throws(() => loadCollection(root), /collection\.json not found/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadCollection throws when collection.json has no name", () => {
  const root = mkdtempSync(join(tmpdir(), "dig-nft-noname-"));
  try {
    writeFileSync(join(root, "collection.json"), JSON.stringify({ license: "cc0" }));
    assert.throws(() => loadCollection(root), /must have a `name`/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadCollection keeps an explicit id over the derived slug", () => {
  const root = freshProject({ id: "explicit-id", name: "Some Other Name" });
  try {
    assert.equal(loadCollection(root).id, "explicit-id");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- generateMetadata: missing images/ dir + traits.json path -----------

test("generateMetadata throws when images/ directory is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "dig-nft-noimg-"));
  try {
    writeFileSync(join(root, "collection.json"), JSON.stringify({ name: "X" }));
    assert.throws(() => generateMetadata(root), /images\/ directory not found/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generateMetadata reads traits.json (envelope) when present", () => {
  const root = freshProject();
  try {
    writeFileSync(join(root, "images", "a.png"), PNG_1x1);
    writeFileSync(join(root, "images", "b.png"), PNG_1x1);
    writeFileSync(
      join(root, "traits.json"),
      JSON.stringify({
        items: [
          { name: "Alpha", file: "a.png", attributes: [{ trait_type: "Tier", value: "S" }] },
          { name: "Beta", file: "b.png" },
        ],
      }),
    );
    const res = generateMetadata(root);
    assert.equal(res.count, 2);
    const md = JSON.parse(readFileSync(join(root, "metadata", "a.json"), "utf8"));
    assert.equal(md.name, "Alpha");
    assert.deepEqual(md.attributes, [{ trait_type: "Tier", value: "S" }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generateMetadata throws when a traits item references a missing image", () => {
  const root = freshProject();
  try {
    writeFileSync(join(root, "images", "a.png"), PNG_1x1);
    writeFileSync(
      join(root, "traits.json"),
      JSON.stringify([{ name: "Ghost", file: "does-not-exist.png" }]),
    );
    assert.throws(() => generateMetadata(root), /missing image/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generated manifest URIs carry the placeholder store id until publish", () => {
  const root = freshProject();
  try {
    writeFileSync(join(root, "images", "a.png"), PNG_1x1);
    generateMetadata(root);
    const manifest = JSON.parse(readFileSync(join(root, "items.json"), "utf8"));
    assert.match(manifest[0].media.data_uris[0], new RegExp(PLACEHOLDER_STORE_ID));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- generateLicense: missing license field -----------------------------

test("generateLicense throws when collection.json has no license field", () => {
  const root = freshProject({ license: undefined });
  try {
    // Strip the license so the guard fires.
    writeFileSync(join(root, "collection.json"), JSON.stringify({ name: "DIG Frogs" }));
    assert.throws(() => generateLicense(root), /no `license` field/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- validateProject guards ---------------------------------------------

test("validateProject throws when items.json is absent", () => {
  const root = freshProject();
  try {
    assert.throws(() => validateProject(root), /items\.json not found/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateProject throws when items.json is an empty array", () => {
  const root = freshProject();
  try {
    writeFileSync(join(root, "items.json"), "[]");
    assert.throws(() => validateProject(root), /empty/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateProject throws when a metadata file is not in canonical form", () => {
  const root = freshProject();
  try {
    writeFileSync(join(root, "images", "a.png"), PNG_1x1);
    generateMetadata(root);
    // Rewrite the metadata doc with pretty-printing → no longer canonical.
    const metaPath = join(root, "metadata", "a.json");
    const md = JSON.parse(readFileSync(metaPath, "utf8"));
    writeFileSync(metaPath, JSON.stringify(md, null, 2) + "\n");
    assert.throws(() => validateProject(root), /canonical/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateProject throws when a manifest metadata_hash matches no metadata file", () => {
  const root = freshProject();
  try {
    writeFileSync(join(root, "images", "a.png"), PNG_1x1);
    generateMetadata(root);
    const manifestPath = join(root, "items.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    // Corrupt the recorded metadata_hash so it agrees with nothing on disk.
    manifest[0].media.metadata_hash = "ab".repeat(32);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    assert.throws(() => validateProject(root), /metadata_hash/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateProject re-validates a generated license's hash agreement", () => {
  const root = freshProject({ license: "cc0" });
  try {
    writeFileSync(join(root, "images", "a.png"), PNG_1x1);
    generateLicense(root);
    generateMetadata(root);
    // Tamper with the license file after generation → license_hash disagreement.
    writeFileSync(join(root, "licenses", "LICENSE-cc0.txt"), "tampered text\n");
    assert.throws(() => validateProject(root), /hash|license/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
