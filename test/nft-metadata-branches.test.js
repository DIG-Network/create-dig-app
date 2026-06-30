// CHIP-0007 metadata branch coverage (node --test): the validator branches, license renderers, and
// traits-JSON shapes that nft-metadata.test.js doesn't reach. Complements (does not replace) the
// pinned byte-vector tests there — these cover the remaining guards/edges for a meaningful floor.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LICENSES,
  licenseText,
  parseTraitsJson,
  parseTraitsCsv,
  itemsFromImages,
  capsuleResourceUris,
  validateMetadata,
  ValidationError,
  buildChip0007Metadata,
  sha256Hex,
} from "../lib/nft-metadata.js";

// ---- license renderers (every template + default holder/year) ------------

test("every LICENSES entry renders text with its title and SPDX-ish marker", () => {
  for (const [id, lic] of Object.entries(LICENSES)) {
    const txt = licenseText(id, { holder: "DIG Labs", year: 2026 });
    assert.equal(typeof txt, "string");
    assert.ok(txt.length > 0, `${id} renders non-empty text`);
    assert.match(txt, /DIG Labs|public domain/i, `${id} mentions the holder or its dedication`);
  }
});

test("commercial license renders the revenue cap and transfers-with-ownership clause", () => {
  const txt = licenseText("commercial", { holder: "DIG Labs", year: 2026 });
  assert.match(txt, /commercial/i);
  assert.match(txt, /100,000/);
  assert.match(txt, /transfers with ownership/i);
});

test("licenseText falls back to a default holder + current year when none given", () => {
  const txt = licenseText("cc0");
  assert.match(txt, /the creator/i);
  assert.match(txt, new RegExp(String(new Date().getFullYear())));
});

// ---- parseTraitsJson alternate shapes + guard ----------------------------

test("parseTraitsJson accepts a single bare item object", () => {
  const items = parseTraitsJson({ name: "Solo", file: "solo.png", description: "one of one", Tier: "S" });
  assert.equal(items.length, 1);
  assert.equal(items[0].name, "Solo");
  assert.equal(items[0].description, "one of one");
  assert.deepEqual(items[0].attributes, [{ trait_type: "Tier", value: "S" }]);
});

test("parseTraitsJson rejects a non-object/array payload", () => {
  assert.throws(() => parseTraitsJson(JSON.stringify(42)), /must be an array, an object/i);
});

test("parseTraitsJson requires a name field per item", () => {
  assert.throws(() => parseTraitsJson([{ file: "x.png" }]), /name/i);
});

// ---- parseTraitsCsv quoted-cell handling + empty input -------------------

test("parseTraitsCsv honors quoted cells containing commas and escaped quotes", () => {
  const csv = 'name,description\n"Frog, the First","He said ""ribbit"""\n';
  const items = parseTraitsCsv(csv);
  assert.equal(items[0].name, "Frog, the First");
  assert.equal(items[0].description, 'He said "ribbit"');
});

test("parseTraitsCsv returns [] for an empty / header-only manifest", () => {
  assert.deepEqual(parseTraitsCsv(""), []);
  assert.deepEqual(parseTraitsCsv("name,Color\n"), []);
});

// ---- itemsFromImages edge: extensionless / stem-only ---------------------

test("itemsFromImages keeps the stem when it cannot be humanized", () => {
  const items = itemsFromImages(["___.png"]);
  assert.equal(items.length, 1);
  assert.equal(items[0].file, "___.png");
  assert.equal(typeof items[0].name, "string");
});

// ---- capsuleResourceUris with an explicit root ---------------------------

test("capsuleResourceUris embeds the root hash when one is given", () => {
  const { urn, https, uris } = capsuleResourceUris({ storeId: "store123", root: "root456", resource: "/images/a.png" });
  assert.match(urn, /^dig:\/\/urn:dig:chia:store123:root456\/images\/a\.png$/);
  assert.match(https, /^https:\/\/store123\./);
  assert.equal(uris[0], urn);
  assert.equal(uris[1], https);
});

// ---- validateMetadata: remaining schema + hash branches ------------------

test("validateMetadata rejects a non-object value", () => {
  assert.throws(() => validateMetadata(null), ValidationError);
  assert.throws(() => validateMetadata("nope"), ValidationError);
});

test("validateMetadata rejects attributes that are not an array", () => {
  assert.throws(() => validateMetadata({ format: "CHIP-0007", name: "x", attributes: "oops" }), /attributes must be an array/i);
});

test("validateMetadata rejects an attribute that is not {trait_type,value} strings", () => {
  assert.throws(
    () => validateMetadata({ format: "CHIP-0007", name: "x", attributes: [{ trait_type: "A", value: 5 }] }),
    /trait_type: string, value: string/i,
  );
});

test("validateMetadata rejects a collection without string id and name", () => {
  assert.throws(
    () => validateMetadata({ format: "CHIP-0007", name: "x", collection: { id: 1, name: "C" } }),
    /collection must have a string id and name/i,
  );
});

test("validateMetadata checks license_hash agreement against the real license bytes", () => {
  const md = buildChip0007Metadata({ name: "x" });
  const bytes = Buffer.from("the license text\n");
  const good = sha256Hex(bytes);
  assert.doesNotThrow(() => validateMetadata(md, { license: { license_hash: good, license_bytes: bytes } }));
  assert.throws(
    () => validateMetadata(md, { license: { license_hash: "00".repeat(32), license_bytes: bytes } }),
    /license_hash mismatch/i,
  );
});

test("sha256Hex tolerates a nullish input (hashes empty bytes)", () => {
  // Coverage for the `?? []` fallback in sha256Hex.
  assert.equal(sha256Hex(null), sha256Hex(Buffer.alloc(0)));
});
