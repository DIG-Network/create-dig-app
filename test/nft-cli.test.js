// NFT tooling orchestrator tests (node --test).
//
// The `nft-collection` template ships scripts/dig-nft.mjs — a dependency-free CLI that walks a real
// project directory (images/ + assets/ + collection.json [+ traits.csv/json]) and emits per-item
// CHIP-0007 metadata/ + licenses/ + the items.json manifest that `digstore collection mint` consumes.
// The orchestration lives in lib/nft-cli.js so it is testable against a real temp directory tree
// without spawning a process; the bin is a thin wrapper. These tests run the generators end-to-end
// over a tiny scaffolded tree and assert the output is canonical + validates.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  generateMetadata,
  generateLicense,
  validateProject,
  loadCollection,
} from "../lib/nft-cli.js";
import { canonicalJson, sha256Hex, validateMetadata } from "../lib/nft-metadata.js";

/** A 1x1 transparent PNG (real, valid image bytes) — used as placeholder/sample art. */
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function freshProject(collection = {}) {
  const root = mkdtempSync(join(tmpdir(), "dig-nft-"));
  mkdirSync(join(root, "images"), { recursive: true });
  mkdirSync(join(root, "assets"), { recursive: true });
  mkdirSync(join(root, "metadata"), { recursive: true });
  mkdirSync(join(root, "licenses"), { recursive: true });
  const col = {
    name: "DIG Frogs",
    description: "A test collection",
    royalty_address: "xch1exampleaddressnotreal000000000000000000000000000000000000",
    royalty_basis_points: 300,
    license: "cc0",
    attributes: [{ trait_type: "Website", value: "https://dig.net" }],
    ...collection,
  };
  writeFileSync(join(root, "collection.json"), JSON.stringify(col, null, 2));
  return root;
}

function read(root, ...p) {
  return readFileSync(join(root, ...p), "utf8");
}

// ---------------------------------------------------------------------------
// generate metadata — one CHIP-0007 doc per image + the items.json manifest
// ---------------------------------------------------------------------------

test("generateMetadata emits one canonical metadata file per image + a manifest", () => {
  const root = freshProject();
  try {
    writeFileSync(join(root, "images", "frog-1.png"), PNG_1x1);
    writeFileSync(join(root, "images", "frog-2.png"), PNG_1x1);

    const res = generateMetadata(root);
    assert.equal(res.count, 2);

    // One metadata JSON per image, named after the image stem.
    assert.ok(existsSync(join(root, "metadata", "frog-1.json")));
    assert.ok(existsSync(join(root, "metadata", "frog-2.json")));

    // Each metadata file is canonical CHIP-0007 (re-serializing it is a no-op) and validates.
    const md = JSON.parse(read(root, "metadata", "frog-1.json"));
    assert.equal(md.format, "CHIP-0007");
    assert.equal(md.collection.id, "dig-frogs");
    assert.equal(md.series_number, 1);
    assert.equal(md.series_total, 2);
    assert.equal(md.minting_tool, "DIG");
    assert.doesNotThrow(() => validateMetadata(md));

    // The items.json manifest digstore collection mint consumes.
    const manifest = JSON.parse(read(root, "items.json"));
    assert.equal(manifest.length, 2);
    const item = manifest[0];
    assert.equal(item.name, "Frog 1");
    // data_hash is sha256 of the REAL image bytes.
    assert.equal(item.media.data_hash, sha256Hex(PNG_1x1));
    // metadata_hash is sha256 of the canonical metadata JSON bytes.
    assert.equal(item.media.metadata_hash, sha256Hex(Buffer.from(canonicalJson(md), "utf8")));
    // URIs are present (placeholder store id) with dig:// first.
    assert.ok(item.media.data_uris[0].startsWith("dig://"));
    assert.ok(item.media.metadata_uris[0].startsWith("dig://"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generateMetadata uses a traits.csv when present (per-image traits)", () => {
  const root = freshProject();
  try {
    writeFileSync(join(root, "images", "frog-1.png"), PNG_1x1);
    writeFileSync(join(root, "images", "frog-2.png"), PNG_1x1);
    writeFileSync(
      join(root, "traits.csv"),
      "name,file,Background,Hat\nFrog One,frog-1.png,Blue,Top\nFrog Two,frog-2.png,Green,None\n",
    );

    const res = generateMetadata(root);
    assert.equal(res.count, 2);
    const md = JSON.parse(read(root, "metadata", "frog-1.json"));
    assert.equal(md.name, "Frog One");
    assert.deepEqual(md.attributes, [
      { trait_type: "Background", value: "Blue" },
      { trait_type: "Hat", value: "Top" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generateMetadata throws when there are no images", () => {
  const root = freshProject();
  try {
    assert.throws(() => generateMetadata(root), /no images/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// generate license — write the chosen template into licenses/ + wire its hash
// ---------------------------------------------------------------------------

test("generateLicense writes the chosen license file and reports its hash", () => {
  const root = freshProject({ license: "cc-by-4.0" });
  try {
    const res = generateLicense(root);
    assert.equal(res.id, "cc-by-4.0");
    const path = join(root, "licenses", res.file);
    assert.ok(existsSync(path), "license file written into licenses/");
    const bytes = readFileSync(path);
    assert.equal(res.hash, sha256Hex(bytes), "reported hash matches the written bytes");
    assert.match(bytes.toString("utf8"), /Creative Commons Attribution 4\.0/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generateLicense wires the license URI + hash into generated metadata's manifest", () => {
  const root = freshProject({ license: "cc0" });
  try {
    writeFileSync(join(root, "images", "art.png"), PNG_1x1);
    const lic = generateLicense(root);
    generateMetadata(root);
    const manifest = JSON.parse(read(root, "items.json"));
    const item = manifest[0];
    assert.ok(item.media.license_uris.length > 0, "license_uris populated");
    assert.equal(item.media.license_hash, lic.hash, "license_hash matches the generated license");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generateLicense rejects an unknown license id in collection.json", () => {
  const root = freshProject({ license: "wtfpl-2" });
  try {
    assert.throws(() => generateLicense(root), /license/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// validate — schema + URI/hash agreement against the real bytes
// ---------------------------------------------------------------------------

test("validateProject passes for freshly generated metadata + manifest", () => {
  const root = freshProject({ license: "cc0" });
  try {
    writeFileSync(join(root, "images", "art.png"), PNG_1x1);
    generateLicense(root);
    generateMetadata(root);
    const res = validateProject(root);
    assert.equal(res.ok, true);
    assert.equal(res.checked, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateProject fails if an image is altered after metadata generation (hash drift)", () => {
  const root = freshProject({ license: "cc0" });
  try {
    writeFileSync(join(root, "images", "art.png"), PNG_1x1);
    generateMetadata(root);
    // Tamper with the image AFTER generating — the recorded data_hash no longer agrees.
    writeFileSync(join(root, "images", "art.png"), Buffer.concat([PNG_1x1, Buffer.from("x")]));
    assert.throws(() => validateProject(root), /hash/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// loadCollection — reads + slugs the collection id
// ---------------------------------------------------------------------------

test("loadCollection reads collection.json and derives the id from the name", () => {
  const root = freshProject({ name: "Cool Cats" });
  try {
    const col = loadCollection(root);
    assert.equal(col.id, "cool-cats");
    assert.equal(col.name, "Cool Cats");
    assert.equal(col.royalty_basis_points, 300);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
