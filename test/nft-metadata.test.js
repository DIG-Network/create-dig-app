// CHIP-0007 metadata + license + validator tests (node --test).
//
// These pin the create-dig-app NFT tooling to the ECOSYSTEM-CANONICAL CHIP-0007 shape so the
// metadata it generates mints cleanly via `digstore collection` and the hub NFT studio. The canonical
// form is a MUTUAL BYTE-MIRROR between:
//   - chip35_dl_coin  core/src/metadata.rs / collection.rs   (the spend-builder's metadata module)
//   - digstore        crates/digstore-chain/src/metadata.rs / collection.rs
// both pinned by byte-string tests. The two pinned strings below are copied verbatim from digstore's
// `minimal_canonical_json_is_the_pinned_byte_string` and `generated_item_json_is_pinned` tests — if
// this file's output ever drifts from them, the on-chain `metadata_hash` diverges and every verifying
// client rejects the NFT. (SYSTEM.md → Shared contracts → "CHIP-0007 NFT metadata".)

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  buildChip0007Metadata,
  canonicalJson,
  sha256Hex,
  collectionId,
  parseTraitsCsv,
  parseTraitsJson,
  itemsFromImages,
  mergeItem,
  generateItemMetadata,
  LICENSES,
  licenseText,
  licenseFileName,
  validateMetadata,
  ValidationError,
} from "../lib/nft-metadata.js";

// ---------------------------------------------------------------------------
// Canonical CHIP-0007 JSON — the byte-exact mirror of chip35 + digstore
// ---------------------------------------------------------------------------

test("minimal canonical JSON is the pinned ecosystem byte string", () => {
  // digstore: minimal_canonical_json_is_the_pinned_byte_string
  const md = buildChip0007Metadata({ name: "Item" });
  assert.equal(canonicalJson(md), `{"format":"CHIP-0007","name":"Item"}`);
});

test("metadata_hash equals sha256 of the canonical JSON bytes (pinned vector)", () => {
  const md = buildChip0007Metadata({ name: "Item" });
  const json = canonicalJson(md);
  // sha256("{\"format\":\"CHIP-0007\",\"name\":\"Item\"}") — verified against node crypto.
  assert.equal(sha256Hex(Buffer.from(json, "utf8")), "0cadfb8e3eb96eab70e15592b8b046f3ad376619d4f71c19650dd9f8fd481c78");
  assert.equal(
    sha256Hex(Buffer.from(json, "utf8")),
    createHash("sha256").update(Buffer.from(json, "utf8")).digest("hex"),
  );
});

test("full-document field order is pinned (matches digstore generated_item_json_is_pinned)", () => {
  // Build via the collection-merge path the generator actually uses.
  // #189: the collection-level attribute uses CHIP-0007's "type" (not the item shape's
  // "trait_type") — this pinned string matches digstore's post-#187
  // `generated_item_json_is_pinned` exactly.
  const collection = {
    id: "dig-punks",
    name: "DIG Punks",
    attributes: [{ type: "Website", value: "https://dig.net" }],
  };
  const items = [
    { name: "DIG Punk #1", description: "first", attributes: [{ trait_type: "Background", value: "Blue" }] },
    { name: "DIG Punk #2" },
  ];
  const mds = generateItemMetadata(collection, items);
  assert.equal(
    canonicalJson(mds[0]),
    `{"format":"CHIP-0007","name":"DIG Punk #1","description":"first","collection":{"id":"dig-punks","name":"DIG Punks","attributes":[{"type":"Website","value":"https://dig.net"}]},"attributes":[{"trait_type":"Background","value":"Blue"}],"series_number":1,"series_total":2,"minting_tool":"DIG"}`,
  );
});

test("optional fields are omitted, not nulled (description/collection/series/minting_tool)", () => {
  const md = buildChip0007Metadata({ name: "Item", description: undefined, attributes: [] });
  const json = canonicalJson(md);
  assert.doesNotMatch(json, /null/);
  assert.doesNotMatch(json, /"description"/);
  assert.doesNotMatch(json, /"attributes"/);
  assert.doesNotMatch(json, /"collection"/);
  assert.doesNotMatch(json, /"sensitive_content"/);
});

test("sensitive_content is omitted when false and present when true", () => {
  assert.doesNotMatch(canonicalJson(buildChip0007Metadata({ name: "x", sensitive_content: false })), /sensitive_content/);
  assert.match(
    canonicalJson(buildChip0007Metadata({ name: "x", sensitive_content: true })),
    /"sensitive_content":true/,
  );
});

test("empty collection.attributes are omitted", () => {
  const md = buildChip0007Metadata({ name: "x", collection: { id: "c", name: "C", attributes: [] } });
  assert.equal(canonicalJson(md), `{"format":"CHIP-0007","name":"x","collection":{"id":"c","name":"C"}}`);
});

test("attribute values are coerced to strings (byte-stable hashing)", () => {
  const md = buildChip0007Metadata({ name: "x", attributes: [{ trait_type: "Level", value: 7 }] });
  assert.match(canonicalJson(md), /"value":"7"/);
});

// ---------------------------------------------------------------------------
// #189: collection attributes serialize as "type", item attributes stay "trait_type"
// (emit-side twin of digstore's #187 / chip35_dl_coin's own fix)
// ---------------------------------------------------------------------------

test("collection attributes serialize with CHIP-0007's \"type\", not \"trait_type\"", () => {
  const md = buildChip0007Metadata({
    name: "x",
    collection: { id: "c", name: "C", attributes: [{ type: "icon", value: "https://dig.net/icon.png" }] },
  });
  const json = canonicalJson(md);
  assert.match(json, /"collection":\{"id":"c","name":"C","attributes":\[\{"type":"icon"/);
  assert.doesNotMatch(json, /"trait_type":"icon"/);
});

test("collection attributes accept the legacy trait_type/traitType spellings on input (back-compat)", () => {
  const viaTraitType = buildChip0007Metadata({
    name: "x",
    collection: { id: "c", name: "C", attributes: [{ trait_type: "icon", value: "a" }] },
  });
  const viaCamelCase = buildChip0007Metadata({
    name: "x",
    collection: { id: "c", name: "C", attributes: [{ traitType: "icon", value: "a" }] },
  });
  for (const md of [viaTraitType, viaCamelCase]) {
    assert.deepEqual(md.collection.attributes, [{ type: "icon", value: "a" }]);
  }
});

test("item attributes are unaffected by #189 — they still use trait_type", () => {
  const md = buildChip0007Metadata({
    name: "x",
    attributes: [{ trait_type: "Background", value: "Blue" }],
  });
  assert.deepEqual(md.attributes, [{ trait_type: "Background", value: "Blue" }]);
  assert.doesNotMatch(canonicalJson(md), /"attributes":\[\{"type"/);
});

// ---------------------------------------------------------------------------
// collectionId slug — must match digstore slug() / hub collectionId()
// ---------------------------------------------------------------------------

test("collectionId slugs the name like digstore/hub", () => {
  assert.equal(collectionId("DIG Punks"), "dig-punks");
  assert.equal(collectionId("Hello, World!"), "hello-world");
  assert.equal(collectionId("  Trim  Me  "), "trim-me");
});

// ---------------------------------------------------------------------------
// Common-merge — every item carries the collection block + series + minting_tool
// ---------------------------------------------------------------------------

test("generateItemMetadata stamps collection ref, 1-based series, and minting_tool=DIG", () => {
  const collection = { id: "c", name: "C", attributes: [] };
  const mds = generateItemMetadata(collection, [{ name: "A" }, { name: "B" }, { name: "C" }]);
  assert.equal(mds.length, 3);
  assert.equal(mds[0].series_number, 1);
  assert.equal(mds[2].series_number, 3);
  for (const md of mds) {
    assert.equal(md.series_total, 3);
    assert.equal(md.minting_tool, "DIG");
    assert.equal(md.collection.id, "c");
  }
});

test("mergeItem keeps per-item traits distinct from collection-level traits", () => {
  const collection = { id: "c", name: "C", attributes: [{ type: "Website", value: "https://dig.net" }] };
  const md = mergeItem(collection, { name: "A", attributes: [{ trait_type: "Hat", value: "Top" }] }, 0, 1);
  assert.deepEqual(md.collection.attributes, [{ type: "Website", value: "https://dig.net" }]);
  assert.deepEqual(md.attributes, [{ trait_type: "Hat", value: "Top" }]);
});

// ---------------------------------------------------------------------------
// Traits parsing — CSV + JSON (mirrors the hub traits-manifest aliases)
// ---------------------------------------------------------------------------

test("parseTraitsCsv reads name/file/description columns + the rest as traits", () => {
  const csv = "name,file,description,Background,Hat\nFrog #1,frog1.png,a frog,Blue,Top\nFrog #2,frog2.png,,Green,\n";
  const items = parseTraitsCsv(csv);
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "Frog #1");
  assert.equal(items[0].file, "frog1.png");
  assert.equal(items[0].description, "a frog");
  assert.deepEqual(items[0].attributes, [
    { trait_type: "Background", value: "Blue" },
    { trait_type: "Hat", value: "Top" },
  ]);
  // Empty trait cells are not emitted; missing description is undefined.
  assert.equal(items[1].description, undefined);
  assert.deepEqual(items[1].attributes, [{ trait_type: "Background", value: "Green" }]);
});

test("parseTraitsCsv accepts column aliases (title/image)", () => {
  const items = parseTraitsCsv("title,image,Color\nApe,ape.png,Gold\n");
  assert.equal(items[0].name, "Ape");
  assert.equal(items[0].file, "ape.png");
  assert.deepEqual(items[0].attributes, [{ trait_type: "Color", value: "Gold" }]);
});

test("parseTraitsCsv requires a name column", () => {
  assert.throws(() => parseTraitsCsv("file,Color\nx.png,Red\n"), /name/i);
});

test("parseTraitsJson accepts an array, an {items:[...]} envelope, and normalizes attributes", () => {
  const arr = parseTraitsJson(JSON.stringify([{ name: "A", file: "a.png", attributes: [{ traitType: "X", value: "1" }] }]));
  assert.equal(arr[0].name, "A");
  assert.deepEqual(arr[0].attributes, [{ trait_type: "X", value: "1" }]);
  const env = parseTraitsJson(JSON.stringify({ items: [{ name: "B", Color: "Red" }] }));
  assert.equal(env[0].name, "B");
  assert.deepEqual(env[0].attributes, [{ trait_type: "Color", value: "Red" }]);
});

// ---------------------------------------------------------------------------
// Filename-derived items (no manifest) — one item per image
// ---------------------------------------------------------------------------

test("itemsFromImages derives a name from each filename and matches the file", () => {
  const items = itemsFromImages(["frog-1.png", "Frog 2.PNG", "art_03.jpeg"]);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.file), ["frog-1.png", "Frog 2.PNG", "art_03.jpeg"]);
  // names are humanized from the stem
  assert.equal(items[0].name, "Frog 1");
  assert.equal(items[1].name, "Frog 2");
  assert.equal(items[2].name, "Art 03");
});

// ---------------------------------------------------------------------------
// License generation — templates + computed hash
// ---------------------------------------------------------------------------

test("LICENSES offers the common templates", () => {
  const ids = Object.keys(LICENSES);
  for (const id of ["cc0", "cc-by-4.0", "all-rights-reserved", "commercial"]) {
    assert.ok(ids.includes(id), `LICENSES includes ${id}`);
  }
});

test("licenseText fills the holder/year and licenseFileName is stable", () => {
  const txt = licenseText("cc-by-4.0", { holder: "DIG Labs", year: 2026 });
  assert.match(txt, /Creative Commons Attribution 4\.0/i);
  const arr = licenseText("all-rights-reserved", { holder: "DIG Labs", year: 2026 });
  assert.match(arr, /DIG Labs/);
  assert.match(arr, /2026/);
  assert.equal(licenseFileName("cc0"), "LICENSE-cc0.txt");
});

test("unknown license id throws", () => {
  assert.throws(() => licenseText("gpl-99", {}), /license/i);
});

// ---------------------------------------------------------------------------
// Validator — URI/hash agreement against the CHIP-0007 schema
// ---------------------------------------------------------------------------

test("validateMetadata accepts a well-formed off-chain doc", () => {
  const md = buildChip0007Metadata({ name: "Item", attributes: [{ trait_type: "A", value: "B" }] });
  assert.doesNotThrow(() => validateMetadata(md));
});

test("validateMetadata rejects a wrong format / missing name", () => {
  assert.throws(() => validateMetadata({ format: "CHIP-0008", name: "x" }), ValidationError);
  assert.throws(() => validateMetadata({ format: "CHIP-0007" }), ValidationError);
});

test("validateMetadata verifies data_hash agrees with the real image bytes", () => {
  const bytes = Buffer.from("the actual image bytes");
  const good = sha256Hex(bytes);
  // A manifest item carries on-chain media hashes; the validator checks URI/hash agreement.
  assert.doesNotThrow(() =>
    validateMetadata(buildChip0007Metadata({ name: "x" }), {
      media: { data_hash: good, data_bytes: bytes },
    }),
  );
  assert.throws(
    () =>
      validateMetadata(buildChip0007Metadata({ name: "x" }), {
        media: { data_hash: "00".repeat(32), data_bytes: bytes },
      }),
    /hash/i,
  );
});

test("validateMetadata verifies metadata_hash agrees with the canonical JSON", () => {
  const md = buildChip0007Metadata({ name: "x" });
  const json = canonicalJson(md);
  const hash = sha256Hex(Buffer.from(json, "utf8"));
  assert.doesNotThrow(() => validateMetadata(md, { metadata_hash: hash }));
  assert.throws(() => validateMetadata(md, { metadata_hash: "ff".repeat(32) }), /hash/i);
});
