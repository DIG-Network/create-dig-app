# __DISPLAY_NAME__

An **NFT collection** on the **DIG Network** — your art, its CHIP-0007 metadata, and its license, all
in one **capsule** on Chia. Scaffolded with `npm create dig-app` (template: `nft-collection`).

This starter is a **collection workspace**: drop your art in `images/`, describe the collection once
in `collection.json`, and the built-in tooling generates per-item CHIP-0007 metadata + a license and
the `items.json` manifest that `digstore collection mint` consumes. The metadata it produces is
byte-for-byte the canonical DIG / Chia CHIP-0007 shape, so it mints cleanly via the `digstore` CLI
**and** the DIGHUb NFT studio.

New to minting NFTs on DIG? Start here:
<https://docs.dig.net/docs/audiences/nft-developers>.

## Free until you publish / mint — and nothing was minted

Scaffolding, generating metadata/licenses, and validating are **free** and **local** — no chain, no
spend. Two distinct costs come later, both explicit and wallet-signed:

- **Publishing the collection** (the art + metadata + licenses) as a DIG **capsule** is one
  `digstore deploy` — **$DIG**.
- **Minting the NFTs** on-chain is `digstore collection mint` (or your own app) — a wallet-signed
  spend. Spends are **built by the tooling / SDK**, never hand-rolled.

## What's in here

```
.
├── collection.json     # the data common to EVERY NFT: name, description, royalty, license, did,
│                       # shared attributes, and the icon/banner refs
├── images/             # your item art — ONE image per NFT (png/jpg/gif/webp/svg)
│   ├── sample-1.svg    # placeholder — replace with your art
│   └── sample-2.svg
├── assets/             # collection-level art shown on the collection page
│   ├── banner.svg      # the wide banner (replace)
│   └── icon.svg        # the square icon / avatar (replace)
├── metadata/           # GENERATED — one canonical CHIP-0007 JSON per item (do not hand-edit)
├── licenses/           # GENERATED — the license file you chose in collection.json
├── items.json          # GENERATED — the manifest `digstore collection mint` consumes
├── traits.csv          # OPTIONAL — per-item names + traits (delete to derive names from filenames)
├── scripts/dig-nft.mjs # the dependency-free metadata/license/validate tool (pure Node)
├── src/                # OPTIONAL — wallet-connected mint wiring for your own page (ChiaProvider)
└── dig.toml            # the digstore manifest (output dir = the whole project = one capsule)
```

## The flow

```sh
npm install                 # installs @dignetwork/dig-sdk (only needed for the in-app mint path)

# 1. Describe your collection once in collection.json (name, royalty, license, shared attributes).
# 2. Drop your art in images/ (one image per NFT). Optionally list names+traits in traits.csv.

npm run generate:license    # writes the license you chose (collection.json `license`) into licenses/
npm run generate:metadata   # writes metadata/<item>.json + items.json, hashing the REAL art bytes
# (or just `npm run generate` to do both, in the right order)

npm run validate            # re-checks the CHIP-0007 schema + every data/metadata/license hash
```

### `collection.json` — the common fields

Everything shared by all items lives here:

| Field | Meaning |
|---|---|
| `name` | The collection name. Its slug becomes the CHIP-0007 `collection.id` (stable across items). |
| `description` | Shown on the collection page. |
| `royalty_address` | The Chia address that receives royalties on secondary sales. |
| `royalty_basis_points` | Royalty in basis points (e.g. `300` = 3%). |
| `did` | Optional creator DID (`did:chia:…`) for a verified-creator collection. |
| `license` | One of `cc0`, `cc-by-4.0`, `all-rights-reserved`, `commercial`. |
| `icon` / `banner` | Paths to the collection art under `assets/`. |
| `attributes` | Collection-level traits (website, twitter, …) — added to every item's `collection` block. |

### Per-item names + traits

- **No `traits.csv`/`traits.json`?** Each item's name is humanized from its image filename
  (`cool-frog-1.png` → "Cool Frog 1"), with no extra traits.
- **`traits.csv`** (the included sample): a header row, one row per item. The `name`/`title`,
  `file`/`image`, and `description` columns are special; **every other column becomes a trait** whose
  `trait_type` is the column header. Empty cells are skipped.
- **`traits.json`**: an array of `{ "name", "file", "attributes": [{ "trait_type", "value" }] }`
  (or `{ "items": [ … ] }`). Either `trait_type` or `traitType` is accepted.

## Mint it

```sh
# Publish the art + metadata + licenses as ONE capsule (this is the only deploy that spends $DIG):
digstore deploy

# Mint the NFTs on-chain from collection.json + the generated items.json (wallet-signed):
digstore collection create --name "__DISPLAY_NAME__"     # one-time: register the collection on-chain
digstore collection mint --collection collection.json --manifest items.json --did <your-did>
```

Prefer minting from your own page? `src/mint.js` wires `ChiaProvider` (injected DIG Browser wallet,
or Sage over WalletConnect) — copy `.env.example` to `.env` and set a free
`WALLETCONNECT_PROJECT_ID` from <https://cloud.reown.com> for the Sage fallback.

## Why the hashes matter

Each NFT pins three hashes on-chain: `data_hash` (your art), `metadata_hash` (the CHIP-0007 JSON),
and `license_hash` (the license file). The tooling computes them from the **real bytes** and the
**canonical** JSON, so what's served always verifies against what's anchored on Chia. `npm run
validate` re-proves this before you mint — if you change an image after generating, validation fails
until you regenerate. Never hand-edit `metadata/` or `items.json`.

## Deploy from CI

Wire push-to-deploy with the GitHub Action:
<https://docs.dig.net/docs/digstore/cli/deploy-from-github-actions>.

## Preview locally (free)

```sh
digstore dev      # preview the collection on the real chia:// read path — FREE, no chain, no spend
digstore deploy   # publish the capsule when you're ready (the only step that spends $DIG)
```
