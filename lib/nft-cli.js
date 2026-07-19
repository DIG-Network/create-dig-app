// NFT collection tooling — the project-directory orchestrator.
//
// Walks a real `nft-collection` project tree and runs the three generators over it:
//   generateMetadata  images/ [+ traits.csv/json] + collection.json → metadata/*.json + items.json
//   generateLicense   collection.json.license     → licenses/LICENSE-<id>.txt (+ its hash/URI)
//   validateProject   metadata/*.json + items.json → re-verify schema + URI/hash agreement
//
// The pure CHIP-0007 logic lives in nft-metadata.js (this module is the file-system glue). Both are
// VENDORED into the template's scripts/dig-nft.mjs so a scaffolded project runs the same code with
// ZERO dependencies. The emitted items.json is the exact manifest `digstore collection mint
// --collection collection.json --manifest items.json` consumes (digstore-chain ManifestItem/Media),
// and `metadata/*.json` are the off-chain CHIP-0007 docs `metadata_uris` points at. (SYSTEM.md →
// "CHIP-0007 NFT metadata"; the asset CLI `collection mint`.)

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

import {
  buildChip0007Metadata,
  canonicalJson,
  capsuleResourceUris,
  collectionId,
  generateItemMetadata,
  itemsFromImages,
  licenseFileName,
  licenseText,
  metadataHashHex,
  parseTraitsCsv,
  parseTraitsJson,
  sha256Hex,
  validateMetadata,
  LICENSES,
} from "./nft-metadata.js";

/** Image extensions treated as collection art (case-insensitive). */
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);

/** Placeholder store id used in generated URIs until the capsule is published (then `digstore` fills the real one). */
export const PLACEHOLDER_STORE_ID = "STORE_ID_AFTER_PUBLISH";

/** Read + parse `collection.json`, deriving the canonical collection `id` from its name. */
export function loadCollection(root) {
  const path = join(root, "collection.json");
  if (!existsSync(path)) throw new Error(`collection.json not found at ${path}`);
  const col = JSON.parse(readFileSync(path, "utf8"));
  if (!col?.name) throw new Error("collection.json must have a `name`.");
  return { ...col, id: col.id || collectionId(col.name) };
}

/** List the image files in images/ (sorted), throwing if there are none. */
function listImages(root) {
  const dir = join(root, "images");
  if (!existsSync(dir)) throw new Error(`images/ directory not found at ${dir}`);
  const files = readdirSync(dir)
    .filter((f) => statSync(join(dir, f)).isFile() && IMAGE_EXT.has(extname(f).toLowerCase()))
    .sort();
  if (files.length === 0) {
    throw new Error("no images found in images/ — add your item art (png/jpg/gif/webp/svg) first.");
  }
  return files;
}

/** Build the normalized item list: from traits.csv / traits.json if present, else one per image. */
function resolveItems(root, imageFiles) {
  const csv = join(root, "traits.csv");
  const jsonTraits = join(root, "traits.json");
  let items;
  if (existsSync(csv)) {
    items = parseTraitsCsv(readFileSync(csv, "utf8"));
  } else if (existsSync(jsonTraits)) {
    items = parseTraitsJson(readFileSync(jsonTraits, "utf8"));
  } else {
    return itemsFromImages(imageFiles);
  }
  // A manifest may name files explicitly; otherwise pair items with images positionally.
  return items.map((item, i) => ({ ...item, file: item.file || imageFiles[i] }));
}

/**
 * Generate per-item CHIP-0007 metadata + the items.json manifest from the project's images +
 * collection.json (+ optional traits.csv/json). Computes data_hash from the REAL image bytes and
 * metadata_hash from the canonical metadata JSON; if a license has been generated, wires its URI +
 * hash in too.
 *
 * The store id defaults to {@link PLACEHOLDER_STORE_ID} for the initial content-prep pass (before
 * the capsule is published). After `digstore deploy` returns the real store id, re-run with
 * `{ storeId }` (CLI `--store-id <id>`) to bake the REAL id into every generated URI so the minted
 * NFT points at the published capsule — otherwise the on-chain `data_uris`/`metadata_uris`/
 * `license_uris` keep the literal placeholder permanently (there is no separate substitution step).
 *
 * @param {string} root Project directory.
 * @param {{storeId?:string}} [opts] `storeId` — the real published store id; omit for the placeholder.
 * @returns {{count:number, manifestPath:string, metadataDir:string}}
 */
export function generateMetadata(root, opts = {}) {
  // An empty / whitespace-only storeId falls back to the placeholder — never emit an empty-store-id
  // URI (`urn:dig:chia:/…`). The CLI (dig-nft.mjs) rejects an explicitly-empty `--store-id` louder;
  // here we coerce defensively so a programmatic caller can't produce a broken URN. (#1065)
  const storeId = opts.storeId && String(opts.storeId).trim() ? opts.storeId : PLACEHOLDER_STORE_ID;
  const collection = loadCollection(root);
  const imageFiles = listImages(root);
  const items = resolveItems(root, imageFiles);

  const metadataDir = join(root, "metadata");
  mkdirSync(metadataDir, { recursive: true });

  // If a license file already exists in licenses/, fold its URI + hash into each item's media.
  const license = readGeneratedLicense(root, collection, storeId);

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
    const metaJson = canonicalJson(md);
    writeFileSync(join(metadataDir, metaName), metaJson + "\n");
    const metadataHash = metadataHashHex(md);

    const data = capsuleResourceUris({ storeId, resource: `images/${file}` });
    const meta = capsuleResourceUris({ storeId, resource: `metadata/${metaName}` });

    const media = {
      data_uris: data.uris,
      data_hash: dataHash,
      metadata_uris: meta.uris,
      metadata_hash: metadataHash,
      license_uris: license ? license.uris : [],
      license_hash: license ? license.hash : null,
    };

    manifest.push({
      name: md.name,
      description: item.description || undefined,
      attributes: md.attributes || [],
      media,
    });
  }

  const manifestPath = join(root, "items.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return { count: items.length, manifestPath, metadataDir };
}

/** Read an already-generated license file (if any) and return its uris + hash, else null. */
function readGeneratedLicense(root, collection, storeId = PLACEHOLDER_STORE_ID) {
  const id = collection?.license;
  if (!id || !LICENSES[id]) return null;
  const file = licenseFileName(id);
  const path = join(root, "licenses", file);
  if (!existsSync(path)) return null;
  const bytes = readFileSync(path);
  const { uris } = capsuleResourceUris({ storeId, resource: `licenses/${file}` });
  return { id, file, hash: sha256Hex(bytes), uris };
}

/**
 * Write the license chosen in collection.json (`license` field) into licenses/, returning its id,
 * file name, and computed hash. Re-run `generateMetadata` afterwards to wire the license URI + hash
 * into the manifest.
 *
 * @param {string} root Project directory.
 * @returns {{id:string, file:string, hash:string, path:string}}
 */
export function generateLicense(root) {
  const collection = loadCollection(root);
  const id = collection?.license;
  if (!id) throw new Error('collection.json has no `license` field — set one (e.g. "cc0").');
  if (!LICENSES[id]) {
    throw new Error(`Unknown license "${id}". Available: ${Object.keys(LICENSES).join(", ")}.`);
  }
  const holder = collection.creator || collection.name || "the creator";
  const year = new Date().getFullYear();
  const text = licenseText(id, { holder, year });

  const licensesDir = join(root, "licenses");
  mkdirSync(licensesDir, { recursive: true });
  const file = licenseFileName(id);
  const path = join(licensesDir, file);
  writeFileSync(path, text);
  return { id, file, hash: sha256Hex(Buffer.from(text, "utf8")), path };
}

/**
 * Validate every generated metadata file + the manifest: each doc must be schema-valid CHIP-0007,
 * its on-disk JSON must be canonical, and the manifest's data_hash / metadata_hash / license_hash
 * must agree with the REAL bytes (image, metadata JSON, license file). Mirrors digstore's
 * `validate_uri_hash` pre-mint check.
 *
 * @param {string} root Project directory.
 * @returns {{ok:true, checked:number}}
 * @throws {Error} on the first failure (schema, non-canonical JSON, or hash disagreement).
 */
export function validateProject(root) {
  const manifestPath = join(root, "items.json");
  if (!existsSync(manifestPath)) {
    throw new Error("items.json not found — run the metadata generator first.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error("items.json is empty — nothing to validate.");
  }

  const metadataDir = join(root, "metadata");
  const metaFiles = existsSync(metadataDir)
    ? readdirSync(metadataDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
    : [];

  // Validate each on-disk metadata doc: schema + canonical-JSON stability.
  for (const f of metaFiles) {
    const raw = readFileSync(join(metadataDir, f), "utf8");
    const md = JSON.parse(raw);
    validateMetadata(md);
    if (raw.trim() !== canonicalJson(md)) {
      throw new Error(`metadata/${f} is not in canonical form (re-run the metadata generator).`);
    }
  }

  // Validate each manifest item's URI/hash agreement against the real bytes.
  let checked = 0;
  for (const item of manifest) {
    const media = item?.media ?? {};
    // metadata_hash agrees with the matching metadata doc (by name match on data_uris resource).
    const md = buildChip0007Metadata({ name: item.name, attributes: item.attributes });
    // We re-derive only when no explicit doc; the on-disk docs were already validated above.
    if (media.metadata_hash != null) {
      // Find the metadata file whose canonical hash matches; otherwise verify against the rebuilt doc.
      const matches = metaFiles.some(
        (f) =>
          metadataHashHex(JSON.parse(readFileSync(join(metadataDir, f), "utf8"))) === media.metadata_hash,
      );
      if (!matches && metadataHashHex(md) !== media.metadata_hash) {
        throw new Error(`item "${item.name}": metadata_hash does not match any metadata/*.json`);
      }
    }
    // data_hash agrees with the real image bytes (resolve the image path from the URN's resource tail).
    const imgFile = resourceTail(media.data_uris?.[0]);
    if (imgFile && media.data_hash != null) {
      const imgPath = join(root, imgFile);
      if (!existsSync(imgPath)) throw new Error(`item "${item.name}": image not found at ${imgFile}`);
      validateMetadata(md, { media: { data_hash: media.data_hash, data_bytes: readFileSync(imgPath) } });
    }
    // license_hash agrees with the real license bytes.
    const licFile = resourceTail(media.license_uris?.[0]);
    if (licFile && media.license_hash != null) {
      const licPath = join(root, licFile);
      if (!existsSync(licPath)) throw new Error(`item "${item.name}": license not found at ${licFile}`);
      validateMetadata(md, {
        license: { license_hash: media.license_hash, license_bytes: readFileSync(licPath) },
      });
    }
    checked++;
  }

  return { ok: true, checked };
}

/**
 * Extract the resource path from a capsule URI — the canonical bare URN
 * `urn:dig:chia:<storeId>:<root>/<resource>` or the `https://<host>/<resource>` gateway fallback.
 * Strip an optional `scheme://authority` prefix, then the resource is everything after the first `/`.
 */
function resourceTail(uri) {
  if (!uri || typeof uri !== "string") return null;
  const afterAuthority = uri.includes("://") ? uri.slice(uri.indexOf("://") + 3) : uri;
  const i = afterAuthority.indexOf("/");
  return i >= 0 ? afterAuthority.slice(i + 1) : null;
}
