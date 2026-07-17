# create-dig-app — SPEC

Normative specification for `create-dig-app`, the `npm create dig-app` scaffolder. This is the
authoritative contract: an independent reimplementation MUST behave as described here. Terms MUST,
MUST NOT, SHOULD, and MAY are used per RFC 2119.

`create-dig-app` is a zero-runtime-dependency Node.js CLI (Node ≥ 18, ESM). It copies a bundled
template file tree into a new project directory, substitutes `__TOKEN__` placeholders, restores
`_`-prefixed dotfiles, and prints next steps. It also ships the canonical CHIP-0007 NFT
metadata/license tooling that the `nft-collection` template vendors verbatim. Scaffolding is a pure
filesystem operation: it MUST NOT mint, sign, spend, or contact the chain or network.

---

## 1. Package contract

- **Name / bin.** The package name is `create-dig-app`; it exposes one bin, `create-dig-app`,
  mapped to `bin/create-dig-app.js`. `npm create dig-app` / `npm init dig-app` / `npx
  create-dig-app` all resolve to this bin.
- **Module system.** ESM (`"type": "module"`). All source is ESM; there is no CJS entry point.
- **Runtime dependencies.** ZERO. The package MUST run using only the Node standard library. The
  only devDependency is the coverage runner (`c8`).
- **Node engine.** `node >= 18`. The CLI MUST run on the Node 18 and 20 lines.
- **Published files.** The npm tarball MUST include `bin`, `lib`, `templates`, `templates-ts`,
  `README.md`, and `LICENSE`. Tests and coverage config are not shipped.
- **License.** MIT.

---

## 2. Command-line grammar

`create-dig-app [<name>] [options]`, where argv is everything after `node <script>`.

### 2.1 Positional

- `<name>` — the first non-flag argument. Becomes the project directory name and the npm package
  name after normalization (§6.1). Additional positionals are ignored.

### 2.2 Options

| Option | Alias(es) | Value | Effect |
|---|---|---|---|
| `--template` | `-t` | `<template>` | Select a template (canonical id or alias, §5). Also accepted as `--template=<t>`. |
| `--typescript` | `--ts` | — | Request the TypeScript variant. |
| `--javascript` | `--js` | — | Request the JavaScript variant (the default). |
| `--lang` | — | `<js\|ts>` | Same as the language flags; value normalized per §7.1. Also `--lang=<v>`. |
| `--json` | — | — | Machine mode: one structured object on stdout, all prose on stderr, no prompts. |
| `--list-templates` | — | — | Emit the template registry (as data with `--json`, else the help text). |
| `--help-json` | — | — | Emit the full machine self-description (flags + templates + exit codes) as JSON. |
| `--help` | `-h` | — | Print human help. |
| `--version` | `-v` | — | Print the version. |
| `--` | — | — | The npm-init argument separator; ignored (a no-op token). |

### 2.3 Parsing rules (normative)

- An unrecognized token beginning with `-` MUST cause a parse error → `USAGE` exit (§4).
- `--lang <value>` and `--lang=<value>` MUST normalize the value (§7.1); an unrecognized value is a
  parse error → `USAGE`.
- The last occurrence of a repeated option wins.
- When both a language flag and a positional appear in either order, both take effect.
- Parsing MUST NOT have side effects (no filesystem writes, no prompts).

### 2.4 Precedence of top-level actions

When multiple action flags are present, exactly one action runs, in this order, and returns
`SUCCESS`:

1. `--help-json` (always to stdout, never gated by `--json`).
2. `--list-templates`.
3. `--help`.
4. `--version`.

If none of the above is set, the tool proceeds to scaffold (§3).

---

## 3. Scaffold flow (normative)

1. Parse argv (§2). On parse error, emit a `USAGE` error and return `USAGE`.
2. Handle the action flags in the §2.4 order; return if one fires.
3. Resolve `appName` and `template`:
   - If either is missing AND the process is interactive (`--json` not set AND both stdin and
     stdout are TTYs), prompt for the missing values (§8).
   - If either is missing AND the process is NOT interactive, emit a `MISSING_ARGS` error and
     return `MISSING_ARGS`. Under `--json` the tool MUST NOT prompt (agents run unattended);
     missing args fail closed.
4. Validate the template early via `resolveTemplate` (§5.4); an unknown template returns
   `UNKNOWN_TEMPLATE`.
5. Resolve the language: if interactive and `--lang` was not given, prompt (§8.3); otherwise use
   the requested language (default `js`).
6. Compute `targetDir = resolve(cwd, normalizeAppName(appName))` (§6.1).
7. Call `scaffold` (§6). On error, classify it (§4.2) and return the mapped exit code.
8. On success:
   - Under `--json`: emit `{ schemaVersion, ok: true, result }` (§9.2) to stdout, return `SUCCESS`.
   - Otherwise: print the success line, next steps (§6.4), and the free-until-publish notice to the
     human sink; return `SUCCESS`.

### 3.1 Output stream discipline

- Without `--json`: human prose goes to stdout (the `log` sink).
- With `--json`: all structured output (results, errors, self-descriptions) goes to stdout (the
  `out` sink) and ALL human prose goes to stderr (the `err` sink). A machine consumer MUST be able
  to parse stdout as JSON without stripping prose.
- `--help-json` output goes to stdout regardless of `--json`.

---

## 4. Exit codes (normative, stable)

Each failure class has a distinct non-zero code so a caller can branch on the KIND of failure.
The table is stable and is also emitted by `--help-json` (§9.3).

| Code | Symbol | Meaning |
|---|---|---|
| `0` | `SUCCESS` | success |
| `1` | `INTERNAL` | unexpected/uncategorized internal error (generic fallback only) |
| `2` | `USAGE` | usage error (bad/unknown option or malformed arguments) |
| `3` | `UNKNOWN_TEMPLATE` | `--template` names a template that does not exist |
| `4` | `TARGET_NOT_EMPTY` | the target directory exists and is not empty (refusing to overwrite) |
| `5` | `MISSING_ARGS` | required args missing in non-interactive mode |
| `6` | `TEMPLATE_FILES_MISSING` | the bundled template files are missing (packaging bug) |
| `7` | `INVALID_APP_NAME` | the app name normalizes to nothing usable |

These numeric values MUST NOT change; new failure classes get new codes.

### 4.1 Machine error codes

The `--json` error envelope carries a symbolic `code` string (UPPER_SNAKE) alongside the numeric
`exit_code`. The `code` MUST be derived from the error class, NEVER parsed from the human message.
Codes: `BAD_USAGE` (exit 2), `UNKNOWN_TEMPLATE` (3), `TARGET_NOT_EMPTY` (4), `MISSING_ARGS` (5),
`TEMPLATE_FILES_MISSING` (6), `INVALID_APP_NAME` (7), `INTERNAL` (1).

### 4.2 Error classification

Errors thrown by the scaffolder are classified to `{ code, exit_code, message, hint, extra? }`:

- An `UnknownTemplateError` → `UNKNOWN_TEMPLATE` (exit 3); `extra.template` carries the requested id.
- A message matching `exists and is not empty` → `TARGET_NOT_EMPTY` (exit 4).
- A message matching `template files for … are missing` → `TEMPLATE_FILES_MISSING` (exit 6).
- A message matching `is not a usable app name` or `app name must be a string` → `INVALID_APP_NAME`
  (exit 7).
- Anything else → `INTERNAL` (exit 1).

Classification MUST match on the error type or stable substrings, never on incidental wording.

---

## 5. Template registry (normative)

The registry is the SINGLE SOURCE OF TRUTH for what can be scaffolded. Each entry is
`TemplateMeta`:

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Template id; equals the directory name under `templates/<name>/`. |
| `title` | string | Short human title for the picker. |
| `description` | string | One-line description for the picker and `--help`. |
| `outputDir` | string | Built-output dir digstore publishes; written into `dig.toml` (`__OUTPUT_DIR__`). |
| `buildCommand` | string | Build command digstore runs; written into `dig.toml` (`__BUILD_COMMAND__`). |
| `wallet` | boolean | True iff the template wires `@dignetwork/dig-sdk` (`ChiaProvider`). |
| `langs` | `("js"\|"ts")[]` | Languages offerable, in offer order. Always contains `js`; contains `ts` iff a variant exists under `templates-ts/<name>/`. |

### 5.1 Canonical templates

| id | outputDir | buildCommand | wallet | langs |
|---|---|---|---|---|
| `static-site` | `public` | `npm run build` | false | js |
| `vite-react` | `dist` | `npm run build` | false | js, ts |
| `next-static` | `out` | `npm run build` | false | js, ts |
| `nft-drop` | `dist` | `npm run build` | true | js, ts |
| `nft-collection` | `.` | `npm run build` | true | js |
| `dapp-window-chia` | `dist` | `npm run build` | true | js, ts |

`templateNames()` MUST return the canonical ids in declaration (registry) order; aliases (§5.3)
MUST NOT appear.

### 5.2 On-disk template layout

- The JS variant of `<name>` lives at `templates/<name>/`.
- The TypeScript variant of `<name>` lives at `templates-ts/<name>/` and MUST exist for every
  template whose `langs` includes `ts`.
- A template directory MUST be self-contained and, after scaffolding, `npm install` + build (or, for
  `nft-collection`, `npm run generate` + `npm run validate`).

### 5.3 Aliases

Hidden back-compat aliases map legacy ids to a canonical id. `resolveTemplate` MUST accept an alias;
`templateNames`, the picker, `--help`, and `--list-templates` MUST NOT list aliases. The registry
contains exactly one alias: `static` → `static-site`. Aliases exist only to keep old invocations
working and MUST be kept minimal.

### 5.4 Resolution

- `canonicalTemplateName(name)` returns the alias target if `name` is an alias, else `name`
  unchanged.
- `resolveTemplate(name)` canonicalizes then looks up the registry; a miss throws
  `UnknownTemplateError(requested)` whose message lists the available canonical ids and whose
  `.requested` field carries the input.

---

## 6. Scaffolding algorithm (normative)

`scaffold({ appName, template, lang?, targetDir })` performs, in order:

1. **Validate before writing.** Resolve `template` (§5.4) and `slug = normalizeAppName(appName)`
   (§6.1) BEFORE touching the filesystem, so a bad invocation leaves the filesystem untouched.
2. **Resolve language.** `requestedLang = normalizeLang(lang)` (default `js`);
   `resolvedLang = resolveLang(meta, requestedLang)` = `requestedLang` if the template offers it,
   else `js` (§7.2). A `ts` request for a js-only template resolves to `js`.
3. **Guard the target.** `targetDir` is required. If it exists and is a non-empty directory, throw
   (`exists and is not empty` → `TARGET_NOT_EMPTY`). An empty/absent directory is allowed.
4. **Locate the source.** `templates-ts/<name>` for `ts`, else `templates/<name>`. A missing source
   throws (`template files for … are missing` → `TEMPLATE_FILES_MISSING`).
5. **Copy the tree** recursively (binary assets copied byte-for-byte).
6. **Substitute** placeholders in every non-binary file (§7.3, §7.4).
7. **Restore dotfiles** (§6.2).
8. **Return** the result object (§9.1).

If any step after directory creation throws, the partially-written `targetDir` MUST be removed
(`rm -rf`) before rethrowing — no half-written tree is left behind.

### 6.1 App-name normalization

`normalizeAppName(raw)`:

- MUST throw `app name must be a string` if `raw` is not a string.
- Lowercase → trim → replace each run of non-`[a-z0-9]` characters with a single `-` → strip
  leading/trailing `-`.
- If the result is empty, throw `"<raw>" is not a usable app name …` (→ `INVALID_APP_NAME`).
- The result is the npm package name AND the target directory basename.

### 6.2 Renamed dotfiles

npm mangles some dotfiles on publish, so templates ship them `_`-prefixed and the scaffolder
restores the real name after copy+substitution. The mapping (applied only when the source file
exists):

| Shipped | Restored |
|---|---|
| `_gitignore` | `.gitignore` |
| `_npmrc` | `.npmrc` |
| `_env.example` | `.env.example` |

### 6.3 Binary detection

A file is treated as binary (skipped by substitution, copied verbatim) iff its lowercased extension
is one of: `.png .jpg .jpeg .gif .ico .webp .woff .woff2 .wasm`. All other files are text and are
run through substitution.

### 6.4 Next steps

`nextSteps({ slug, meta })` returns the printable step list:

1. `cd <slug>`
2. `npm install`
3. Template-specific middle step:
   - `nft-collection`: `npm run generate` then `npm run validate`.
   - Any other template with a build command EXCEPT `static-site`: `npm run dev`.
   - `static-site`: no dev step (its build only copies `src/` → `public/`).
4. `digstore dev` (free preview; no mint, no chain, no spend).
5. `digstore deploy` (the only step that spends $DIG).

---

## 7. Placeholder substitution (normative)

### 7.1 Language normalization

`normalizeLang(raw)`: trim + lowercase; `ts`/`typescript` → `"ts"`; `js`/`javascript` → `"js"`;
anything else throws `Unknown --lang "<raw>" …`. `DEFAULT_LANG` is `"js"`.

### 7.2 Language resolution

`resolveLang(meta, requested = "js")` returns `requested` if `meta.langs` includes it, else `"js"`.

### 7.3 Token grammar

A placeholder is `__TOKEN__` where TOKEN matches `[A-Z][A-Z0-9_]*` (uppercase, digits, underscores;
starting with a letter), wrapped in double underscores. `applySubstitutions(text, subs)` replaces
every `__TOKEN__` whose TOKEN is a key of `subs`; a TOKEN absent from `subs` is left VERBATIM (so a
typo surfaces as a leftover placeholder rather than silently blanking the file). A scaffolded tree
MUST contain no leftover known-token placeholders.

### 7.4 Substitution map

`buildSubstitutions` produces, for one scaffold:

| Token | Value |
|---|---|
| `__APP_NAME__` | the normalized (npm-safe) slug |
| `__DISPLAY_NAME__` | the original trimmed user-supplied name |
| `__SDK_VERSION__` | the pinned `@dignetwork/dig-sdk` version specifier (§7.5) |
| `__OUTPUT_DIR__` | `meta.outputDir` |
| `__BUILD_COMMAND__` | `meta.buildCommand` |

### 7.5 SDK version pin

`SDK_VERSION` is the specifier scaffolded wallet templates pin for `@dignetwork/dig-sdk`. While the
SDK is pre-1.0 it is the `latest` dist-tag (npm accepts a dist-tag wherever a version range is
allowed), so a freshly scaffolded app installs the newest stable SDK at scaffold time. It MUST be
bumped to a caret range (e.g. `^1.0.0`) once the SDK cuts a stable release worth freezing to.

---

## 8. Interactive prompts (normative)

Prompts run only when NOT `--json` and both stdin and stdout are TTYs, and only for values not
supplied on the command line.

### 8.1 Name prompt

`ask(rl, "Project name", "my-dig-app")` — a free-text prompt with a default; an empty answer takes
the default.

### 8.2 Template prompt

`askTemplate(rl)` lists the canonical templates numbered `1..N`. The user answers with a number
(default `1`) OR by typing a canonical name. An out-of-range number or unrecognized name re-prompts.
Returns a canonical id.

### 8.3 Language prompt

`askLang(rl, template)` — skipped (returns `"js"`) for a template whose `langs` lacks `ts`.
Otherwise offers `1) JavaScript` (default) and `2) TypeScript`, also accepting a typed
`js`/`javascript`/`ts`/`typescript`. An unrecognized answer re-prompts. Returns `"js"` or `"ts"`.

---

## 9. Machine-readable output (normative)

`SCHEMA_VERSION` is `1`. It MUST be bumped on any breaking change to the envelope shapes below.
Every machine envelope carries `schemaVersion`.

### 9.1 Scaffold result object

```json
{
  "appName":       "my-app",          // normalized slug
  "template":      "vite-react",       // canonical id actually used
  "lang":          "ts",               // language actually scaffolded ("js" | "ts")
  "requestedLang": "ts",               // language requested (may differ from lang on fallback)
  "targetDir":     "/abs/path/my-app",
  "nextSteps":     ["cd my-app", "npm install", "…"]
}
```

`lang` reflects what was WRITTEN; when `requestedLang === "ts"` but `lang === "js"` (js-only
template) the human output notes the fallback and the JSON exposes both fields.

### 9.2 Success / error envelopes

- Success (`--json`): `{ "schemaVersion": 1, "ok": true, "result": <§9.1> }` on stdout.
- Error (`--json`): `{ "schemaVersion": 1, "ok": false, "error": { "code", "exit_code", "message",
  "hint", …extra } }` on stdout. `code` is UPPER_SNAKE (§4.1); `extra` carries structured fields
  (e.g. `template` for `UNKNOWN_TEMPLATE`) rather than flattening them into prose.
- `--version --json`: `{ "schemaVersion": 1, "version": "<v>" }`.
- `--list-templates --json`: `{ "schemaVersion": 1, "templates": [<§9.4>] }`.

### 9.3 `--help-json`

An object describing the whole invocation contract: `{ schemaVersion, name, summary, flags[],
templates[], exitCodes }`, where `exitCodes` maps each numeric code to its human meaning (§4) and
`templates` is the §9.4 list. It is always printed to stdout and MUST be a superset sufficient for a
tool to introspect the CLI without scraping prose.

### 9.4 Template list item

Each `--list-templates` / `--help-json` template entry is
`{ id, title, description, outputDir, buildCommand, wallet, langs }`, sourced directly from the
registry (no second source of truth).

---

## 10. Emitted project contract

Every scaffolded project MUST include:

- **`dig.toml`** — the manifest `digstore` and the DIG SDK adapters read. It MUST carry `output-dir`
  and `build-command` (kebab-case; snake_case also accepted by digstore) and a default `remote`.
  Keys are the single source of truth for `digstore deploy` and the GitHub deploy Action. This is
  LOCAL config: writing it costs nothing.
- **`package.json`** — with the app name substituted; wallet templates depend on
  `@dignetwork/dig-sdk` (pinned per §7.5) and `@walletconnect/sign-client` (the SDK's optional WC
  peer dep, enabling the Sage fallback).
- **`.env.example`** (wallet templates) — declaring `VITE_WALLETCONNECT_PROJECT_ID=` (empty
  placeholder). The real id is never shipped; only the placeholder is tracked.
- **`README.md`** — the develop → preview (free) → publish flow for that template.
- a real, buildable **app** whose build emits to the template's `outputDir` (or, for
  `nft-collection`, a validated content root).

The TypeScript variant additionally ships `tsconfig.json`, `.ts`/`.tsx` sources, the `typescript`
(and React `@types/*`) devDeps, an env shim (`vite-env.d.ts` / `next-env.d.ts`), and a `typecheck`
script; it MUST type-check and build out of the box.

### 10.1 Wallet wiring

Wallet templates wire `@dignetwork/dig-sdk`'s `ChiaProvider`. `connect({ mode: "auto" })` MUST
prefer the injected wallet (`window.chia`, DIG Browser / extension) and fall back to
WalletConnect → Sage when no injected wallet is present, so a scaffolded dapp connects in an ordinary
browser. NFT spends MUST be built via the SDK's `/spend` builder (the canonical CHIP-0035 spend
constructor) and MUST NOT be hand-rolled. Nothing is minted, signed, or spent at scaffold time.

---

## 11. CHIP-0007 NFT metadata core (normative byte-mirror)

`lib/nft-metadata.js` is the SINGLE SOURCE OF TRUTH for the NFT tooling and is VENDORED
byte-identically into the `nft-collection` template's `scripts/dig-nft.mjs`, so a scaffolded project
runs the exact same dependency-free logic. The canonical off-chain JSON is a byte-for-byte mirror of
`chip35_dl_coin` (`core/src/metadata.rs`, `collection.rs`) and `digstore`
(`digstore-chain/src/metadata.rs`, `collection.rs`). Drift diverges the on-chain `metadata_hash` and
every verifying client rejects the NFT — the shape below is a HARD contract and MUST stay in
lock-step with those pinned test vectors.

### 11.1 Canonical metadata shape

A CHIP-0007 off-chain document has these keys, in this exact order, emitting only present fields:

```
format, name, description, sensitive_content, collection, attributes,
series_number, series_total, minting_tool
```

- `format` — always the literal `"CHIP-0007"`.
- `name` — required non-empty string.
- `description` — omitted when null/empty.
- `sensitive_content` — omitted when false; emitted as `true` only when explicitly true.
- `collection` — `{ id, name, attributes? }`; `attributes` omitted when empty.
- `attributes` — array of `{ trait_type, value }`; omitted when empty. Order is PRESERVED (never
  sorted). Every value is stringified (numbers/booleans → strings) for byte-stable hashing; entries
  with an empty `trait_type` are dropped. `traitType` is accepted on input and normalized to
  `trait_type`.
- `series_number` — 1-based item position; omitted when absent.
- `series_total` — series size; omitted when absent.
- `minting_tool` — the tool tag; the DIG ecosystem stamps the literal `"DIG"`; omitted when
  absent/empty.

### 11.2 Canonical JSON + hashing

- `canonicalJson(md)` = compact `JSON.stringify(md)` (no spaces, no key sort) — byte-identical to
  `serde_json::to_string`. Because `buildChip0007Metadata` already orders and prunes the keys, no
  further canonicalization is applied.
- `sha256Hex(bytes)` = lowercase-hex SHA-256 (standard NIST SHA-256; byte-identical to
  `chia_sha2::Sha256`).
- `metadata_hash` = `sha256(canonicalJson(md) as UTF-8 bytes)`.
- `data_hash` = `sha256(raw resource bytes)`; `license_hash` = `sha256(raw license-file bytes)`.

### 11.3 Collection id

`collectionId(name)` = lowercase → each run of non-`[a-z0-9]` → single `-` → strip leading/trailing
`-`. Byte-identical to digstore's `slug()` and the hub's `collectionId()`, so `collection.id`
matches across the ecosystem.

### 11.4 Per-item generation

`mergeItem(collection, item, index, total)` builds one item's metadata by merging the
collection-level ref (`{ id, name, attributes }`) + shared attributes with the item's own traits,
setting `series_number = index + 1`, `series_total = total`, and `minting_tool = "DIG"`.
`generateItemMetadata(collection, items)` maps this over the whole collection, in order.

### 11.5 Traits manifests

`parseTraitsCsv(text)` and `parseTraitsJson(text)` normalize a manifest into items
(`{ name, file?, description?, attributes[] }`):

- Column/field roles (case-insensitive): `name`/`title` → name; `file`/`filename`/`image`/`media`/
  `asset` → media file; `description`/`desc` → description; every other column is a trait whose
  `trait_type` is the ORIGINAL column header. Empty cells emit no trait. An item with no name is an
  error.
- CSV splitting honors RFC-4180-style double-quoted cells (commas inside quotes preserved; `""` is
  an escaped quote).
- `parseTraitsJson` accepts an array, an `{ items: [...] }` envelope, or a single object; JSON
  attributes may use `trait_type` or `traitType`.
- `itemsFromImages(fileNames)` builds one item per image with the name humanized from the filename
  stem (dashes/underscores → spaces, title-cased), no traits.

### 11.6 Licenses

`LICENSES` maps a license id to `{ title, spdx, deed?, text(holder, year) }`. The defined ids are
`cc0`, `cc-by-4.0`, `all-rights-reserved`, `commercial`. `licenseFileName(id)` = `LICENSE-<id>.txt`.
`licenseText(id, { holder?, year? })` renders the document; an unknown id throws listing the
available ids. The rendered text is a concise, accurate human summary plus the canonical SPDX id and
(for CC licenses) the upstream deed URL; the deed URL is authoritative for the full legal code.

### 11.7 Capsule resource URIs

`capsuleResourceUris({ storeId, root?, resource })` returns `{ urn, https, uris }` where:

- `urn` = the canonical bare `urn:dig:chia:<storeId>[:<root>]/<resource>` (leading slashes stripped
  from `resource`). It carries NO `dig://` prefix — `dig://` is not a content/resource scheme, and the
  `dig-urn-resolver` consumes the bare URN and decides where to fetch it.
- `https` = `https://<storeId>.usercontent.dig.net/<resource>` (the decrypted-capsule gateway,
  mirroring the hub's `CAPSULE_HTTPS_GATEWAY`).
- `uris` = `[urn, https]` — the canonical bare URN first, then the https fallback (the order the hub
  and digstore use for `data_uris` / `metadata_uris` / `license_uris`).

Until a capsule is published, generated URIs use the placeholder store id
`STORE_ID_AFTER_PUBLISH`; `digstore` fills the real id on publish.

### 11.8 Validation

`validateMetadata(md, checks?)` throws `ValidationError` on any failure. Schema checks: `md` is an
object; `format === "CHIP-0007"`; `name` is a non-empty string; `attributes` (if present) is an
array of `{ trait_type: string, value: string }`; `collection` (if present) has string `id` and
`name`. Hash-agreement checks (each applied only when both sides are supplied): `metadata_hash`
equals `metadataHashHex(md)`; `media.data_hash` equals `sha256(media.data_bytes)`;
`license.license_hash` equals `sha256(license.license_bytes)` — mirroring digstore's
`validate_uri_hash` pre-mint gate.

### 11.9 Project orchestration (`lib/nft-cli.js`)

The filesystem glue over the pure core, run against a real `nft-collection` project tree:

- `generateMetadata(root)` — reads `collection.json` (deriving `id` from `name` when absent) and the
  sorted `images/` art (extensions `.png .jpg .jpeg .gif .webp .svg .avif`), resolves items from
  `traits.csv` / `traits.json` if present (else one per image), writes `metadata/<stem>.json` (each
  canonical JSON + trailing newline), computes `data_hash` from the real image bytes and
  `metadata_hash` from the canonical doc, folds in an already-generated license's URI+hash if
  present, and writes `items.json` (the manifest `digstore collection mint` consumes). Errors on a
  missing `images/`, no images, a missing `name`, or an item referencing a missing image.
- `generateLicense(root)` — reads the `license` id from `collection.json` and writes
  `licenses/LICENSE-<id>.txt`, returning its `{ id, file, hash, path }`. Errors when no `license`
  field is set or the id is unknown.
- `validateProject(root)` — re-validates every `metadata/*.json` (schema + canonical-form stability)
  and every manifest item's `data_hash` / `metadata_hash` / `license_hash` against the real bytes,
  returning `{ ok: true, checked }`; throws on the first disagreement or a missing/empty
  `items.json`.

---

## 12. Invariants

- **Free, offline, pure.** Scaffolding and the NFT tooling MUST NOT mint, sign, spend, or contact
  the chain/network. All work is local filesystem I/O.
- **Zero runtime deps.** The CLI MUST run on the Node standard library alone.
- **No half-written trees.** A scaffold failure leaves the target directory removed (§6).
- **Validate before write.** Template + name validation happens before any filesystem write.
- **Single source of truth.** The template registry drives the picker, `--help`,
  `--list-templates`, `dig.toml` values, and the JSON self-description. The NFT core is the single
  source vendored into the template.
- **Byte-mirror discipline.** The CHIP-0007 canonical shape (§11) MUST stay byte-identical to
  `chip35_dl_coin` and `digstore`; any change is spec-first and cross-repo (SYSTEM.md → Shared
  contracts → "CHIP-0007 NFT metadata").
- **Stable machine contracts.** Exit codes, error `code` strings, and the JSON envelope shapes are
  stable; breaking changes bump `SCHEMA_VERSION`.
- **Two front doors, one set of templates.** `create-dig-app` (JS) and `digstore new` (Rust) name
  the same starters by the same ids; the shared ids MUST agree.

---

## 13. Security properties

- **No secret material is shipped.** Wallet templates ship only an empty `VITE_WALLETCONNECT_
  PROJECT_ID=` placeholder in `.env.example`; the real project id is provided by the user and never
  committed. `.gitignore` (restored from `_gitignore`) excludes `.env` / `.env.local`.
- **No spends at scaffold time.** Minting/deploying are explicit, wallet-signed actions the user
  triggers later; scaffolding never holds keys, signs, or broadcasts.
- **Spend construction via the SDK only.** Wallet templates build spends through the SDK's canonical
  `/spend` builder, never hand-rolled — the on-chain spend contract stays in one audited place.
- **Deterministic, inspectable output.** Substitution only replaces known `__TOKEN__` placeholders;
  no template code is executed during scaffolding. A leftover placeholder is a detectable template
  bug, not a silent blanking.

---

## 14. Coverage + CI (conformance)

- The test suite runs on the Node standard library (`node --test test/`); `npm run coverage` runs it
  under `c8` with a CI-enforced floor: lines/branches/functions/statements ≥ 80 (thresholds in
  `.c8rc.json`, scoped to `lib/` + `bin/`, `check-coverage: true`). A build below the floor FAILS.
- CI (`.github/workflows/ci.yml`) runs the coverage gate across the Node 18 and 20 matrix on every
  push and PR, and additionally scaffolds `vite-react`, `dapp-window-chia`, and `nft-drop` in the
  TypeScript variant and proves each installs, type-checks, and builds — verifying the emitted
  project (not just the file tree) is real.
