#!/usr/bin/env node
// dig-nft — the dependency-free CHIP-0007 metadata / license / validate tool for this collection.
//
// Run via the package.json scripts (no install needed — pure Node stdlib):
//   npm run generate:metadata   # images/ [+ traits.csv|traits.json] + collection.json → metadata/*.json + items.json
//   npm run generate:license    # collection.json `license` → licenses/LICENSE-<id>.txt (+ wires its hash)
//   npm run validate            # re-verify schema + URI/hash agreement against the real bytes
//   node scripts/dig-nft.mjs <metadata|license|validate>
//
// WHY hand-rolled JSON: the off-chain CHIP-0007 JSON is a fixed, byte-pinned shape that is a MUTUAL
// BYTE-MIRROR between chip35_dl_coin (core/src/metadata.rs) and digstore (digstore-chain/src/
// metadata.rs), both pinned by byte-string tests. We reproduce it EXACTLY so the on-chain
// `metadata_hash` matches and the collection mints cleanly via `digstore collection mint` and the
// hub NFT studio. This file is vendored verbatim from create-dig-app's lib/nft-metadata.js +
// lib/nft-cli.js — do not diverge the canonical shape (field order / skip rules / hashing) from the
// ecosystem, or every verifying client will reject the NFT.
//
//   field order: format, name, description, sensitive_content, collection, attributes,
//                series_number, series_total, minting_tool
//   omit:        description/collection/series_*/minting_tool when null; sensitive_content when
//                false; attributes (and collection.attributes) when empty
//   render:      compact JSON (no spaces, no key sort) ≡ serde_json::to_string
//   hash:        metadata_hash = sha256(canonical_json_bytes); data/license_hash = sha256(bytes)

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ── Canonical CHIP-0007 core (mirror of lib/nft-metadata.js) ──────────────────────────────────────

const CHIP0007_FORMAT = "CHIP-0007";
const MINTING_TOOL = "DIG";
const CAPSULE_HTTPS_GATEWAY = "usercontent.dig.net";
const PLACEHOLDER_STORE_ID = "STORE_ID_AFTER_PUBLISH";

function sha256Hex(bytes) {
  const buf = bytes instanceof Uint8Array ? Buffer.from(bytes) : Buffer.from(bytes ?? []);
  return createHash("sha256").update(buf).digest("hex");
}

function attrValue(v) {
  return v == null ? "" : String(v);
}

function normalizeAttributes(attrs) {
  return (attrs ?? [])
    .map((a) => ({ trait_type: String(a?.trait_type ?? a?.traitType ?? "").trim(), value: attrValue(a?.value) }))
    .filter((a) => a.trait_type !== "");
}

// Collection-level attributes use CHIP-0007's `type` field, NOT the item shape's `trait_type`
// (#189 — the emit-side twin of digstore's #187 / chip35_dl_coin's own fix). Still accepts the
// legacy `trait_type`/`traitType` spellings on input so an existing collection.json keeps working.
function normalizeCollectionAttributes(attrs) {
  return (attrs ?? [])
    .map((a) => ({
      type: String(a?.type ?? a?.trait_type ?? a?.traitType ?? "").trim(),
      value: attrValue(a?.value),
    }))
    .filter((a) => a.type !== "");
}

function buildChip0007Metadata(input) {
  const md = { format: CHIP0007_FORMAT, name: String(input?.name ?? "") };
  const description = input?.description;
  if (description != null && String(description) !== "") md.description = String(description);
  if (input?.sensitive_content === true) md.sensitive_content = true;
  if (input?.collection) {
    const c = input.collection;
    const ref = { id: String(c.id ?? ""), name: String(c.name ?? "") };
    const cattrs = normalizeCollectionAttributes(c.attributes);
    if (cattrs.length > 0) ref.attributes = cattrs;
    md.collection = ref;
  }
  const attributes = normalizeAttributes(input?.attributes);
  if (attributes.length > 0) md.attributes = attributes;
  if (input?.series_number != null) md.series_number = Number(input.series_number);
  if (input?.series_total != null) md.series_total = Number(input.series_total);
  if (input?.minting_tool != null && String(input.minting_tool) !== "") md.minting_tool = String(input.minting_tool);
  return md;
}

const canonicalJson = (md) => JSON.stringify(md);
const metadataHashHex = (md) => sha256Hex(Buffer.from(canonicalJson(md), "utf8"));

function collectionId(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mergeItem(collection, item, index, total) {
  return buildChip0007Metadata({
    name: item?.name,
    description: item?.description,
    sensitive_content: item?.sensitive_content,
    collection: { id: collection?.id, name: collection?.name, attributes: collection?.attributes },
    attributes: item?.attributes,
    series_number: index + 1,
    series_total: total,
    minting_tool: MINTING_TOOL,
  });
}

const generateItemMetadata = (collection, items) =>
  items.map((item, i) => mergeItem(collection, item, i, items.length));

const NAME_KEYS = new Set(["name", "title"]);
const FILE_KEYS = new Set(["file", "filename", "image", "media", "asset"]);
const DESC_KEYS = new Set(["description", "desc"]);

function classifyKey(key) {
  const k = String(key ?? "").trim().toLowerCase();
  if (NAME_KEYS.has(k)) return "name";
  if (FILE_KEYS.has(k)) return "file";
  if (DESC_KEYS.has(k)) return "description";
  return "trait";
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function recordToItem(rec) {
  let name = "", description, file;
  const attributes = [];
  for (const [col, raw] of Object.entries(rec)) {
    const role = classifyKey(col);
    const val = raw == null ? "" : String(raw).trim();
    if (role === "name") { if (!name) name = val; }
    else if (role === "file") { if (!file && val) file = val; }
    else if (role === "description") { if (!description && val) description = val; }
    else if (val !== "") attributes.push({ trait_type: col, value: val });
  }
  if (!name) throw new Error("Every item needs a name (a `name` or `title` column).");
  return { name, description: description || undefined, file: file || undefined, attributes };
}

function parseTraitsCsv(text) {
  const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]);
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const rec = {};
    header.forEach((h, j) => { rec[h] = cells[j] ?? ""; });
    items.push(recordToItem(rec));
  }
  return items;
}

function jsonObjToItem(obj) {
  let name = "", description, file;
  let attributes = [];
  for (const [key, raw] of Object.entries(obj ?? {})) {
    const k = String(key).toLowerCase();
    if (k === "attributes" && Array.isArray(raw)) { attributes = normalizeAttributes(raw); continue; }
    const role = classifyKey(key);
    const val = raw == null ? "" : String(raw).trim();
    if (role === "name") { if (!name) name = val; }
    else if (role === "file") { if (!file && val) file = val; }
    else if (role === "description") { if (!description && val) description = val; }
    else if (val !== "") attributes.push({ trait_type: key, value: val });
  }
  if (!name) throw new Error("Every item needs a name (a `name` or `title` field).");
  return { name, description: description || undefined, file: file || undefined, attributes };
}

function parseTraitsJson(text) {
  const data = typeof text === "string" ? JSON.parse(text) : text;
  let arr;
  if (Array.isArray(data)) arr = data;
  else if (Array.isArray(data?.items)) arr = data.items;
  else if (data && typeof data === "object") arr = [data];
  else throw new Error("The traits manifest JSON must be an array, an object, or { items: [...] }.");
  return arr.map(jsonObjToItem);
}

function itemsFromImages(fileNames) {
  return (fileNames ?? []).map((file) => {
    const stem = String(file).replace(/\.[^.]+$/, "");
    const name = stem
      .replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return { name: name || stem, file, attributes: [] };
  });
}

function capsuleResourceUris({ storeId, root, resource }) {
  const sid = String(storeId ?? "").trim();
  const r = String(root ?? "").trim();
  const res = String(resource ?? "").trim().replace(/^\/+/, "");
  const urn = `urn:dig:chia:${sid}${r ? `:${r}` : ""}/${res}`;
  const https = `https://${sid}.${CAPSULE_HTTPS_GATEWAY}/${res}`;
  return { urn, https, uris: [urn, https] };
}

const LICENSES = {
  cc0: {
    title: "CC0 1.0 — public domain dedication",
    text: ({ holder = "the creator", year = new Date().getFullYear() } = {}) =>
      [
        "CC0 1.0 Universal (CC0 1.0) Public Domain Dedication", "",
        `The work associated with this NFT is dedicated to the public domain by ${holder} (${year}).`,
        "To the extent possible under law, the creator has waived all copyright and related or",
        "neighboring rights to this work. You can copy, modify, distribute and perform the work, even",
        "for commercial purposes, all without asking permission.", "",
        "SPDX-License-Identifier: CC0-1.0",
        "Full text: https://creativecommons.org/publicdomain/zero/1.0/legalcode",
      ].join("\n") + "\n",
  },
  "cc-by-4.0": {
    title: "CC BY 4.0 — attribution required",
    text: ({ holder = "the creator", year = new Date().getFullYear() } = {}) =>
      [
        "Creative Commons Attribution 4.0 International (CC BY 4.0)", "",
        `Copyright (c) ${year} ${holder}.`, "",
        "You are free to share and adapt this work for any purpose, even commercially, provided you give",
        "appropriate credit, provide a link to the license, and indicate if changes were made.", "",
        "SPDX-License-Identifier: CC-BY-4.0",
        "Full text: https://creativecommons.org/licenses/by/4.0/legalcode",
      ].join("\n") + "\n",
  },
  "all-rights-reserved": {
    title: "All rights reserved — no reuse without permission",
    text: ({ holder = "the creator", year = new Date().getFullYear() } = {}) =>
      [
        "All Rights Reserved", "",
        `Copyright (c) ${year} ${holder}. All rights reserved.`, "",
        "No part of the work associated with this NFT may be reproduced, distributed, or transmitted in",
        "any form or by any means without the prior written permission of the copyright holder, except",
        "for the holder's own personal display of the NFT they own.",
      ].join("\n") + "\n",
  },
  commercial: {
    title: "Limited commercial license — holder may use commercially",
    text: ({ holder = "the creator", year = new Date().getFullYear() } = {}) =>
      [
        "Limited Commercial License (DIG Commercial 1.0)", "",
        `Copyright (c) ${year} ${holder}.`, "",
        "The verified owner of this NFT is granted a worldwide, non-exclusive license to use, reproduce,",
        "and display the associated artwork for commercial purposes, up to gross revenues of US$100,000",
        "per year attributable to the artwork. This license transfers with ownership of the NFT and",
        "terminates on transfer. All other rights are reserved by the copyright holder.", "",
        "SPDX-License-Identifier: LicenseRef-DIG-Commercial-1.0",
      ].join("\n") + "\n",
  },
};

const licenseFileName = (id) => `LICENSE-${id}.txt`;
function licenseText(id, opts = {}) {
  const lic = LICENSES[id];
  if (!lic) throw new Error(`Unknown license "${id}". Available: ${Object.keys(LICENSES).join(", ")}.`);
  return lic.text(opts);
}

class ValidationError extends Error {
  constructor(message) { super(message); this.name = "ValidationError"; }
}

function validateMetadata(md, checks = {}) {
  if (!md || typeof md !== "object") throw new ValidationError("metadata must be an object");
  if (md.format !== CHIP0007_FORMAT) throw new ValidationError(`format must be "${CHIP0007_FORMAT}" (got ${JSON.stringify(md.format)})`);
  if (typeof md.name !== "string" || md.name === "") throw new ValidationError("name is required");
  if ("attributes" in md) {
    if (!Array.isArray(md.attributes)) throw new ValidationError("attributes must be an array");
    for (const a of md.attributes) {
      if (typeof a?.trait_type !== "string" || typeof a?.value !== "string") {
        throw new ValidationError("each attribute must be { trait_type: string, value: string }");
      }
    }
  }
  if ("collection" in md) {
    const c = md.collection;
    if (typeof c?.id !== "string" || typeof c?.name !== "string") throw new ValidationError("collection must have a string id and name");
  }
  if (checks.metadata_hash != null) {
    const got = metadataHashHex(md);
    if (got !== String(checks.metadata_hash).toLowerCase()) throw new ValidationError(`metadata_hash mismatch: computed ${got}, expected ${checks.metadata_hash}`);
  }
  if (checks.media?.data_hash != null && checks.media?.data_bytes != null) {
    const got = sha256Hex(checks.media.data_bytes);
    if (got !== String(checks.media.data_hash).toLowerCase()) throw new ValidationError(`data_hash mismatch: image bytes hash to ${got}, expected ${checks.media.data_hash}`);
  }
  if (checks.license?.license_hash != null && checks.license?.license_bytes != null) {
    const got = sha256Hex(checks.license.license_bytes);
    if (got !== String(checks.license.license_hash).toLowerCase()) throw new ValidationError(`license_hash mismatch: license bytes hash to ${got}, expected ${checks.license.license_hash}`);
  }
}

// ── Project-directory orchestration (mirror of lib/nft-cli.js) ────────────────────────────────────

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadCollection(root) {
  const path = join(root, "collection.json");
  if (!existsSync(path)) throw new Error(`collection.json not found at ${path}`);
  const col = JSON.parse(readFileSync(path, "utf8"));
  if (!col?.name) throw new Error("collection.json must have a `name`.");
  return { ...col, id: col.id || collectionId(col.name) };
}

function listImages(root) {
  const dir = join(root, "images");
  if (!existsSync(dir)) throw new Error(`images/ directory not found at ${dir}`);
  const files = readdirSync(dir)
    .filter((f) => statSync(join(dir, f)).isFile() && IMAGE_EXT.has(extname(f).toLowerCase()))
    .sort();
  if (files.length === 0) throw new Error("no images found in images/ — add your item art (png/jpg/gif/webp/svg) first.");
  return files;
}

function resolveItems(root, imageFiles) {
  const csv = join(root, "traits.csv");
  const jsonTraits = join(root, "traits.json");
  let items;
  if (existsSync(csv)) items = parseTraitsCsv(readFileSync(csv, "utf8"));
  else if (existsSync(jsonTraits)) items = parseTraitsJson(readFileSync(jsonTraits, "utf8"));
  else return itemsFromImages(imageFiles);
  return items.map((item, i) => ({ ...item, file: item.file || imageFiles[i] }));
}

function readGeneratedLicense(root, collection) {
  const id = collection?.license;
  if (!id || !LICENSES[id]) return null;
  const file = licenseFileName(id);
  const path = join(root, "licenses", file);
  if (!existsSync(path)) return null;
  const bytes = readFileSync(path);
  const { uris } = capsuleResourceUris({ storeId: PLACEHOLDER_STORE_ID, resource: `licenses/${file}` });
  return { id, file, hash: sha256Hex(bytes), uris };
}

function generateMetadata(root) {
  const collection = loadCollection(root);
  const imageFiles = listImages(root);
  const items = resolveItems(root, imageFiles);
  const metadataDir = join(root, "metadata");
  mkdirSync(metadataDir, { recursive: true });
  const license = readGeneratedLicense(root, collection);
  const mds = generateItemMetadata(collection, items);
  const manifest = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const md = mds[i];
    const file = item.file || imageFiles[i];
    const imgPath = join(root, "images", file);
    if (!existsSync(imgPath)) throw new Error(`item "${item.name}" references missing image: images/${file}`);
    const imgBytes = readFileSync(imgPath);
    const dataHash = sha256Hex(imgBytes);
    const stem = basename(file, extname(file));
    const metaName = `${stem}.json`;
    writeFileSync(join(metadataDir, metaName), canonicalJson(md) + "\n");
    const metadataHash = metadataHashHex(md);
    const data = capsuleResourceUris({ storeId: PLACEHOLDER_STORE_ID, resource: `images/${file}` });
    const meta = capsuleResourceUris({ storeId: PLACEHOLDER_STORE_ID, resource: `metadata/${metaName}` });
    manifest.push({
      name: md.name,
      description: item.description || undefined,
      attributes: md.attributes || [],
      media: {
        data_uris: data.uris, data_hash: dataHash,
        metadata_uris: meta.uris, metadata_hash: metadataHash,
        license_uris: license ? license.uris : [], license_hash: license ? license.hash : null,
      },
    });
  }
  const manifestPath = join(root, "items.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return { count: items.length, manifestPath, metadataDir };
}

function generateLicense(root) {
  const collection = loadCollection(root);
  const id = collection?.license;
  if (!id) throw new Error('collection.json has no `license` field — set one (e.g. "cc0").');
  if (!LICENSES[id]) throw new Error(`Unknown license "${id}". Available: ${Object.keys(LICENSES).join(", ")}.`);
  const holder = collection.creator || collection.name || "the creator";
  const text = licenseText(id, { holder, year: new Date().getFullYear() });
  const licensesDir = join(root, "licenses");
  mkdirSync(licensesDir, { recursive: true });
  const file = licenseFileName(id);
  const path = join(licensesDir, file);
  writeFileSync(path, text);
  return { id, file, hash: sha256Hex(Buffer.from(text, "utf8")), path };
}

function resourceTail(uri) {
  if (!uri || typeof uri !== "string") return null;
  const i = uri.indexOf("/", uri.indexOf("://") + 3);
  return i >= 0 ? uri.slice(i + 1) : null;
}

function validateProject(root) {
  const manifestPath = join(root, "items.json");
  if (!existsSync(manifestPath)) throw new Error("items.json not found — run the metadata generator first.");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest) || manifest.length === 0) throw new Error("items.json is empty — nothing to validate.");
  const metadataDir = join(root, "metadata");
  const metaFiles = existsSync(metadataDir) ? readdirSync(metadataDir).filter((f) => f.endsWith(".json")).sort() : [];
  for (const f of metaFiles) {
    const raw = readFileSync(join(metadataDir, f), "utf8");
    const md = JSON.parse(raw);
    validateMetadata(md);
    if (raw.trim() !== canonicalJson(md)) throw new Error(`metadata/${f} is not in canonical form (re-run the metadata generator).`);
  }
  let checked = 0;
  for (const item of manifest) {
    const media = item?.media ?? {};
    const md = buildChip0007Metadata({ name: item.name, attributes: item.attributes });
    if (media.metadata_hash != null) {
      const matches = metaFiles.some(
        (f) => metadataHashHex(JSON.parse(readFileSync(join(metadataDir, f), "utf8"))) === media.metadata_hash,
      );
      if (!matches && metadataHashHex(md) !== media.metadata_hash) {
        throw new Error(`item "${item.name}": metadata_hash does not match any metadata/*.json`);
      }
    }
    const imgFile = resourceTail(media.data_uris?.[0]);
    if (imgFile && media.data_hash != null) {
      const imgPath = join(root, imgFile);
      if (!existsSync(imgPath)) throw new Error(`item "${item.name}": image not found at ${imgFile}`);
      validateMetadata(md, { media: { data_hash: media.data_hash, data_bytes: readFileSync(imgPath) } });
    }
    const licFile = resourceTail(media.license_uris?.[0]);
    if (licFile && media.license_hash != null) {
      const licPath = join(root, licFile);
      if (!existsSync(licPath)) throw new Error(`item "${item.name}": license not found at ${licFile}`);
      validateMetadata(md, { license: { license_hash: media.license_hash, license_bytes: readFileSync(licPath) } });
    }
    checked++;
  }
  return { ok: true, checked };
}

// ── CLI dispatch ──────────────────────────────────────────────────────────────────────────────────

function main() {
  const cmd = process.argv[2];
  try {
    if (cmd === "metadata") {
      const r = generateMetadata(ROOT);
      console.log(`Generated ${r.count} CHIP-0007 metadata file(s) → metadata/ and the items.json manifest.`);
      console.log("Next: `npm run validate`, then mint with `digstore collection mint --collection collection.json --manifest items.json`.");
    } else if (cmd === "license") {
      const r = generateLicense(ROOT);
      console.log(`Wrote licenses/${r.file} (sha256 ${r.hash}).`);
      console.log("Re-run `npm run generate:metadata` to wire the license URI + hash into items.json.");
    } else if (cmd === "validate") {
      const r = validateProject(ROOT);
      console.log(`OK — ${r.checked} item(s) valid: CHIP-0007 schema + data/metadata/license hashes agree with the real bytes.`);
    } else {
      console.error("Usage: node scripts/dig-nft.mjs <metadata|license|validate>");
      console.error("  metadata  generate CHIP-0007 metadata/*.json + items.json from images/ + collection.json");
      console.error("  license   write the license chosen in collection.json into licenses/");
      console.error("  validate  re-verify schema + URI/hash agreement before minting");
      process.exit(2);
    }
  } catch (e) {
    console.error(`Error: ${e?.message ?? e}`);
    process.exit(1);
  }
}

main();
