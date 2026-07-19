// CHIP-0007 NFT metadata + license generation + validation — the canonical core.
//
// This module is the SINGLE SOURCE OF TRUTH for the create-dig-app NFT tooling. It is unit-tested
// directly (test/nft-metadata.test.js) and VENDORED verbatim into the `nft-collection` template's
// scripts/dig-nft.mjs so a scaffolded project runs the exact same, dependency-free logic. (The
// template's copy stays byte-identical to this file — see scripts/dig-nft.mjs's header.)
//
// ─── Why hand-rolled JSON instead of the wasm? ────────────────────────────────────────────────────
// create-dig-app has ZERO runtime dependencies (npm ci installs nothing; CI runs on the stdlib). The
// off-chain CHIP-0007 JSON is a fixed, byte-pinned shape, so we reproduce it directly rather than
// pull in @dignetwork/chip35-dl-coin-wasm. The canonical form is a MUTUAL BYTE-MIRROR between
// chip35_dl_coin (core/src/metadata.rs, collection.rs) and digstore (digstore-chain/src/metadata.rs,
// collection.rs), both pinned by byte-string tests. We mirror it exactly:
//   - field order:  format, name, description, sensitive_content, collection, attributes,
//                   series_number, series_total, minting_tool
//   - omit:         description/collection/series_*/minting_tool when null; sensitive_content when
//                   false; attributes (and collection.attributes) when empty
//   - render:       compact JSON (serde_json::to_string ≡ JSON.stringify with no spaces), no key sort
//   - hash:         metadata_hash = sha256(canonical_json_bytes); data/license_hash = sha256(bytes)
// (SYSTEM.md → Shared contracts → "CHIP-0007 NFT metadata".) Drift here diverges the on-chain
// metadata_hash and every verifying client rejects the NFT — keep it in lock-step with the test
// vectors copied from digstore's pinned tests.

import { createHash } from "node:crypto";

/** The CHIP-0007 format tag stamped on every off-chain metadata document. */
export const CHIP0007_FORMAT = "CHIP-0007";

/** The tool tag the DIG ecosystem stamps on minted metadata (byte-mirror of digstore/chip35). */
export const MINTING_TOOL = "DIG";

// ── Canonical JSON + hashing ────────────────────────────────────────────────────────────────────

/**
 * Lowercase-hex SHA-256 of raw bytes — the ecosystem-wide hash primitive (`chia_sha2::Sha256` is a
 * standard NIST SHA-256, so node's crypto produces byte-identical digests).
 * @param {Uint8Array|Buffer} bytes
 * @returns {string} 64-char lowercase hex
 */
export function sha256Hex(bytes) {
  const buf = bytes instanceof Uint8Array ? Buffer.from(bytes) : Buffer.from(bytes ?? []);
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Coerce a value to the canonical attribute string. CHIP-0007 stores every trait value as a string
 * for byte-stable hashing (numbers/booleans are stringified), matching the Rust `Attribute.value:
 * String`.
 * @param {unknown} v
 * @returns {string}
 */
function attrValue(v) {
  return v == null ? "" : String(v);
}

/**
 * Normalize a list of `{trait_type,value}` (accepting `traitType` too) into the canonical attribute
 * array: trimmed string `trait_type` + stringified `value`, dropping any entry with an empty
 * trait_type. Order is preserved (CHIP-0007 does not sort attributes).
 *
 * This is for NFT-**item** attributes only. Collection-level attributes use `type`, not
 * `trait_type` — see {@link normalizeCollectionAttributes} (#189).
 * @param {Array<{trait_type?:string,traitType?:string,value:unknown}>} attrs
 * @returns {Array<{trait_type:string,value:string}>}
 */
function normalizeAttributes(attrs) {
  return (attrs ?? [])
    .map((a) => ({
      trait_type: String(a?.trait_type ?? a?.traitType ?? "").trim(),
      value: attrValue(a?.value),
    }))
    .filter((a) => a.trait_type !== "");
}

/**
 * Normalize a list of **collection-level** attributes (icon/banner/website/twitter/etc) into the
 * canonical shape: trimmed string `type` + stringified `value`, dropping any entry with an empty
 * `type`. Order is preserved.
 *
 * Per CHIP-0007, a collection's attributes use the field `type` — DISTINCT from an NFT item's
 * `trait_type` ({@link normalizeAttributes}). Issue #189 (the emit-side twin of digstore's #187 and
 * chip35_dl_coin's own fix): this repo's generator was reusing the item shape for collection
 * attributes too, emitting non-conformant `trait_type` for the collection block. This function
 * always WRITES `type`; it still ACCEPTS the legacy `trait_type`/`traitType` spellings on input
 * (back-compat with already-authored `collection.json` files and the wasm boundary's alias), so
 * existing scaffolded projects keep working unchanged while newly generated metadata becomes
 * CHIP-0007-conformant.
 * @param {Array<{type?:string,trait_type?:string,traitType?:string,value:unknown}>} attrs
 * @returns {Array<{type:string,value:string}>}
 */
function normalizeCollectionAttributes(attrs) {
  return (attrs ?? [])
    .map((a) => ({
      type: String(a?.type ?? a?.trait_type ?? a?.traitType ?? "").trim(),
      value: attrValue(a?.value),
    }))
    .filter((a) => a.type !== "");
}

/**
 * Build a canonical CHIP-0007 metadata object from loose inputs. The returned object's keys are in
 * the pinned field order and omit empty/false/None fields, so {@link canonicalJson} of it is
 * byte-identical to chip35/digstore's `to_canonical_json()`.
 *
 * @param {Object} input
 * @param {string} input.name                 Required item name.
 * @param {string} [input.description]         Optional; omitted when empty/undefined.
 * @param {boolean} [input.sensitive_content]  Omitted when falsey.
 * @param {{id:string,name:string,attributes?:Array}} [input.collection]  Collection ref; its
 *   `attributes` (CHIP-0007 `type`/`value` pairs — NOT `trait_type`, see #189) are omitted when
 *   empty.
 * @param {Array<{trait_type?:string,traitType?:string,value:unknown}>} [input.attributes] Per-item traits.
 * @param {number} [input.series_number]       1-based position; omitted when undefined.
 * @param {number} [input.series_total]        Series size; omitted when undefined.
 * @param {string} [input.minting_tool]        Tool tag; omitted when undefined.
 * @returns {object} A plain object with keys in canonical order (only the present fields).
 */
export function buildChip0007Metadata(input) {
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
  if (input?.minting_tool != null && String(input.minting_tool) !== "") {
    md.minting_tool = String(input.minting_tool);
  }

  return md;
}

/**
 * Render a CHIP-0007 metadata object to its canonical JSON string. Because
 * {@link buildChip0007Metadata} already orders + prunes the keys, this is just a compact
 * `JSON.stringify` (no spaces, no key sort) — byte-identical to `serde_json::to_string`.
 * @param {object} md A metadata object produced by {@link buildChip0007Metadata} (or {@link mergeItem}).
 * @returns {string}
 */
export function canonicalJson(md) {
  return JSON.stringify(md);
}

/**
 * Compute the on-chain `metadata_hash` for a metadata object: sha256 of its canonical JSON bytes.
 * @param {object} md
 * @returns {string} lowercase hex
 */
export function metadataHashHex(md) {
  return sha256Hex(Buffer.from(canonicalJson(md), "utf8"));
}

// ── Collection id slug ────────────────────────────────────────────────────────────────────────────

/**
 * Derive the stable collection id from a name — lowercase, non-alphanumerics → single dash, trimmed.
 * Byte-identical to digstore's `slug()` and the hub's `collectionId()` so the `collection.id` in the
 * metadata matches across the ecosystem.
 * @param {string} name
 * @returns {string}
 */
export function collectionId(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Common-merge: stamp the collection block + series + minting_tool onto each item ────────────────

/**
 * Build one item's CHIP-0007 metadata by merging the COLLECTION-level common fields (the collection
 * ref + shared attributes) with the item's own traits, and filling 1-based series numbering +
 * `minting_tool = "DIG"`. Mirror of digstore/chip35 `generate_item_metadata` per-item logic.
 *
 * @param {{id:string,name:string,attributes?:Array}} collection The collection definition.
 * @param {{name:string,description?:string,sensitive_content?:boolean,attributes?:Array}} item
 * @param {number} index   0-based item index (series_number = index + 1).
 * @param {number} total   Total item count (series_total).
 * @returns {object} canonical-order metadata object.
 */
export function mergeItem(collection, item, index, total) {
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

/**
 * Generate the per-item CHIP-0007 metadata for a whole collection (one document per item, in order).
 * @param {{id:string,name:string,attributes?:Array}} collection
 * @param {Array<object>} items
 * @returns {object[]}
 */
export function generateItemMetadata(collection, items) {
  const total = items.length;
  return items.map((item, i) => mergeItem(collection, item, i, total));
}

// ── Traits manifests — CSV + JSON (mirrors the hub's traits-manifest aliases) ──────────────────────

/** Column header aliases (case-insensitive) that map to the item's name / media file / description. */
const NAME_KEYS = new Set(["name", "title"]);
const FILE_KEYS = new Set(["file", "filename", "image", "media", "asset"]);
const DESC_KEYS = new Set(["description", "desc"]);

/** Classify a manifest column header into its role; anything else is a trait column. */
function classifyKey(key) {
  const k = String(key ?? "")
    .trim()
    .toLowerCase();
  if (NAME_KEYS.has(k)) return "name";
  if (FILE_KEYS.has(k)) return "file";
  if (DESC_KEYS.has(k)) return "description";
  return "trait";
}

/** Split one CSV line, honoring double-quoted cells (RFC-4180-ish; commas inside quotes are kept). */
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Turn a header→cell record into a normalized item ({name, file?, description?, attributes[]}). */
function recordToItem(rec) {
  let name = "";
  let description;
  let file;
  const attributes = [];
  for (const [col, raw] of Object.entries(rec)) {
    const role = classifyKey(col);
    const val = raw == null ? "" : String(raw).trim();
    if (role === "name") {
      if (!name) name = val;
    } else if (role === "file") {
      if (!file && val) file = val;
    } else if (role === "description") {
      if (!description && val) description = val;
    } else if (val !== "") {
      attributes.push({ trait_type: col, value: val }); // keep the original column name as trait_type
    }
  }
  if (!name) throw new Error("Every item needs a name (a `name` or `title` column).");
  return { name, description: description || undefined, file: file || undefined, attributes };
}

/**
 * Parse a traits CSV into normalized items. The header row names the columns; `name`/`title`,
 * `file`/`filename`/`image`/`media`/`asset`, and `description`/`desc` are special, every other column
 * becomes a trait whose `trait_type` is the column header. Empty cells are not emitted as traits.
 * @param {string} text
 * @returns {Array<{name:string,file?:string,description?:string,attributes:Array}>}
 */
export function parseTraitsCsv(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]);
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const rec = {};
    header.forEach((h, j) => {
      rec[h] = cells[j] ?? "";
    });
    items.push(recordToItem(rec));
  }
  return items;
}

/** Convert one loose JSON object into a normalized item (accepts a nested `attributes` array too). */
function jsonObjToItem(obj) {
  let name = "";
  let description;
  let file;
  let attributes = [];
  for (const [key, raw] of Object.entries(obj ?? {})) {
    const k = String(key).toLowerCase();
    if (k === "attributes" && Array.isArray(raw)) {
      attributes = normalizeAttributes(raw);
      continue;
    }
    const role = classifyKey(key);
    const val = raw == null ? "" : String(raw).trim();
    if (role === "name") {
      if (!name) name = val;
    } else if (role === "file") {
      if (!file && val) file = val;
    } else if (role === "description") {
      if (!description && val) description = val;
    } else if (val !== "") {
      attributes.push({ trait_type: key, value: val });
    }
  }
  if (!name) throw new Error("Every item needs a name (a `name` or `title` field).");
  return { name, description: description || undefined, file: file || undefined, attributes };
}

/**
 * Parse a traits manifest JSON into normalized items. Accepts an array of items, an
 * `{ items: [...] }` envelope, or a single item object. JSON attributes may use `trait_type` or
 * `traitType`; both normalize to `trait_type`.
 * @param {string|object} text
 * @returns {Array<object>}
 */
export function parseTraitsJson(text) {
  const data = typeof text === "string" ? JSON.parse(text) : text;
  let arr;
  if (Array.isArray(data)) arr = data;
  else if (Array.isArray(data?.items)) arr = data.items;
  else if (data && typeof data === "object") arr = [data];
  else throw new Error("The traits manifest JSON must be an array, an object, or { items: [...] }.");
  return arr.map(jsonObjToItem);
}

/**
 * Build items directly from image filenames (no manifest): one item per image, the name humanized
 * from the filename stem (dashes/underscores → spaces, title-cased), no traits.
 * @param {string[]} fileNames image file names (e.g. ["frog-1.png"])
 * @returns {Array<{name:string,file:string,attributes:Array}>}
 */
export function itemsFromImages(fileNames) {
  return (fileNames ?? []).map((file) => {
    const stem = String(file).replace(/\.[^.]+$/, "");
    const name = stem
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return { name: name || stem, file, attributes: [] };
  });
}

// ── Capsule resource URIs (canonical URN first, https gateway fallback) ─────────────────────────────

/** The HTTPS gateway host for decrypted capsule resources (mirrors the hub's CAPSULE_HTTPS_GATEWAY). */
export const CAPSULE_HTTPS_GATEWAY = "usercontent.dig.net";

/**
 * Build the CHIP-0007 media URIs for a resource inside a capsule: the canonical bare URN first,
 * then the https gateway fallback (the order the hub + digstore use).
 *
 * The URN is the bare, root-pinned `urn:dig:chia:<storeId>:<root>/<resource>` form — NEVER a
 * `dig://`-prefixed URN (the `dig://urn:dig:chia:…` double-scheme is the #686 bug). `dig://` is not
 * a content/resource scheme; the dig-urn-resolver consumes the bare URN and decides where to fetch.
 * @param {{storeId:string,root?:string,resource:string}} args
 * @returns {{urn:string,https:string,uris:string[]}}
 */
export function capsuleResourceUris({ storeId, root, resource }) {
  const sid = String(storeId ?? "").trim();
  const r = String(root ?? "").trim();
  const res = String(resource ?? "")
    .trim()
    .replace(/^\/+/, "");
  const urn = `urn:dig:chia:${sid}${r ? `:${r}` : ""}/${res}`;
  const https = `https://${sid}.${CAPSULE_HTTPS_GATEWAY}/${res}`;
  return { urn, https, uris: [urn, https] };
}

// ── License templates ───────────────────────────────────────────────────────────────────────────

/**
 * The common license choices the generator offers. Each entry has a human `title`, the on-disk
 * `file` name, and a `text(holder, year)` renderer. The actual legal text of CC0/CC-BY is long; we
 * ship a concise, accurate human-readable summary + the canonical SPDX id + the upstream deed URL
 * (the standard pattern for NFT license docs), and bake the chosen license's URI + hash into the
 * manifest. For the full legal code, the deed URL is authoritative.
 * @type {Record<string,{title:string,spdx:string,deed?:string,text:(opts:{holder?:string,year?:number})=>string}>}
 */
export const LICENSES = {
  cc0: {
    title: "CC0 1.0 — public domain dedication",
    spdx: "CC0-1.0",
    deed: "https://creativecommons.org/publicdomain/zero/1.0/",
    text: ({ holder = "the creator", year = new Date().getFullYear() } = {}) =>
      [
        "CC0 1.0 Universal (CC0 1.0) Public Domain Dedication",
        "",
        `The work associated with this NFT is dedicated to the public domain by ${holder} (${year}).`,
        "To the extent possible under law, the creator has waived all copyright and related or",
        "neighboring rights to this work. You can copy, modify, distribute and perform the work, even",
        "for commercial purposes, all without asking permission.",
        "",
        "SPDX-License-Identifier: CC0-1.0",
        "Full text: https://creativecommons.org/publicdomain/zero/1.0/legalcode",
      ].join("\n") + "\n",
  },
  "cc-by-4.0": {
    title: "CC BY 4.0 — attribution required",
    spdx: "CC-BY-4.0",
    deed: "https://creativecommons.org/licenses/by/4.0/",
    text: ({ holder = "the creator", year = new Date().getFullYear() } = {}) =>
      [
        "Creative Commons Attribution 4.0 International (CC BY 4.0)",
        "",
        `Copyright (c) ${year} ${holder}.`,
        "",
        "You are free to share and adapt this work for any purpose, even commercially, provided you give",
        "appropriate credit, provide a link to the license, and indicate if changes were made.",
        "",
        "SPDX-License-Identifier: CC-BY-4.0",
        "Full text: https://creativecommons.org/licenses/by/4.0/legalcode",
      ].join("\n") + "\n",
  },
  "all-rights-reserved": {
    title: "All rights reserved — no reuse without permission",
    spdx: "LicenseRef-All-Rights-Reserved",
    text: ({ holder = "the creator", year = new Date().getFullYear() } = {}) =>
      [
        "All Rights Reserved",
        "",
        `Copyright (c) ${year} ${holder}. All rights reserved.`,
        "",
        "No part of the work associated with this NFT may be reproduced, distributed, or transmitted in",
        "any form or by any means without the prior written permission of the copyright holder, except",
        "for the holder's own personal display of the NFT they own.",
      ].join("\n") + "\n",
  },
  commercial: {
    title: "Limited commercial license — holder may use commercially",
    spdx: "LicenseRef-DIG-Commercial-1.0",
    text: ({ holder = "the creator", year = new Date().getFullYear() } = {}) =>
      [
        "Limited Commercial License (DIG Commercial 1.0)",
        "",
        `Copyright (c) ${year} ${holder}.`,
        "",
        "The verified owner of this NFT is granted a worldwide, non-exclusive license to use, reproduce,",
        "and display the associated artwork for commercial purposes, up to gross revenues of US$100,000",
        "per year attributable to the artwork. This license transfers with ownership of the NFT and",
        "terminates on transfer. All other rights are reserved by the copyright holder.",
        "",
        "SPDX-License-Identifier: LicenseRef-DIG-Commercial-1.0",
      ].join("\n") + "\n",
  },
};

/** The on-disk filename for a license id (e.g. "cc0" → "LICENSE-cc0.txt"). */
export function licenseFileName(id) {
  return `LICENSE-${id}.txt`;
}

/**
 * Render a license document's text for a chosen id.
 * @param {string} id One of {@link LICENSES} keys.
 * @param {{holder?:string,year?:number}} [opts]
 * @returns {string}
 * @throws if `id` is not a known license.
 */
export function licenseText(id, opts = {}) {
  const lic = LICENSES[id];
  if (!lic) throw new Error(`Unknown license "${id}". Available: ${Object.keys(LICENSES).join(", ")}.`);
  return lic.text(opts);
}

// ── Validation ────────────────────────────────────────────────────────────────────────────────────

/** Raised when CHIP-0007 metadata (or its URI/hash agreement) fails validation. */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Validate a CHIP-0007 off-chain metadata document against the schema, and (optionally) verify
 * URI↔hash agreement for the on-chain media hashes the way `digstore`'s `validate_uri_hash` does:
 * the on-chain `*_hash` MUST equal `sha256(bytes)` of what the URI actually serves.
 *
 * @param {object} md The off-chain CHIP-0007 metadata object.
 * @param {Object} [checks] Optional hash-agreement checks.
 * @param {string} [checks.metadata_hash]            Expected hash; must equal sha256(canonicalJson(md)).
 * @param {{data_hash?:string,data_bytes?:Uint8Array}} [checks.media] data_hash vs sha256(data_bytes).
 * @param {{license_hash?:string,license_bytes?:Uint8Array}} [checks.license]
 * @throws {ValidationError} on any schema or hash-agreement failure.
 */
export function validateMetadata(md, checks = {}) {
  if (!md || typeof md !== "object") throw new ValidationError("metadata must be an object");
  if (md.format !== CHIP0007_FORMAT) {
    throw new ValidationError(`format must be "${CHIP0007_FORMAT}" (got ${JSON.stringify(md.format)})`);
  }
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
    if (typeof c?.id !== "string" || typeof c?.name !== "string") {
      throw new ValidationError("collection must have a string id and name");
    }
  }

  if (checks.metadata_hash != null) {
    const got = metadataHashHex(md);
    if (got !== String(checks.metadata_hash).toLowerCase()) {
      throw new ValidationError(`metadata_hash mismatch: computed ${got}, expected ${checks.metadata_hash}`);
    }
  }
  if (checks.media?.data_hash != null && checks.media?.data_bytes != null) {
    const got = sha256Hex(checks.media.data_bytes);
    if (got !== String(checks.media.data_hash).toLowerCase()) {
      throw new ValidationError(
        `data_hash mismatch: image bytes hash to ${got}, expected ${checks.media.data_hash}`,
      );
    }
  }
  if (checks.license?.license_hash != null && checks.license?.license_bytes != null) {
    const got = sha256Hex(checks.license.license_bytes);
    if (got !== String(checks.license.license_hash).toLowerCase()) {
      throw new ValidationError(
        `license_hash mismatch: license bytes hash to ${got}, expected ${checks.license.license_hash}`,
      );
    }
  }
}
