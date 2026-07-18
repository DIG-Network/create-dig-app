# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org) and
[Conventional Commits](https://www.conventionalcommits.org).

## [0.3.0] - 2026-07-18

### Features
- **nft:** Inject the real published store id into generated NFT URIs. `generateMetadata(root, { storeId })` and the template's `dig-nft.mjs metadata --store-id <id>` bake the real store id (from `digstore deploy`) into `data_uris`/`metadata_uris`/`license_uris`; the store id defaults to the `STORE_ID_AFTER_PUBLISH` placeholder for the pre-publish pass. Fixes the mint flow that previously left the placeholder pinned on-chain permanently. (#350)

### Documentation
- **spec:** Correct §11.7 (no automatic store-id substitution on publish — the caller re-generates with `--store-id`) and §12 (`create-dig-app` ships `nft-collection`, which `digstore new` does not yet expose — the front doors are not at full parity today). Fix a stale `modules/dig-sdk/...` comment path. (#350)

## [0.2.4] - 2026-07-17

### Bug Fixes
- **nft:** Emit canonical bare root-pinned URN in NFT templates (no dig:// prefix) (#6)

## [0.2.3] - 2026-07-12

### Features
- **nft-metadata:** Emit CHIP-0007 collection attributes as "type", not "trait_type" (#2)

### Bug Fixes
- **ci:** Replace publish-npm.yml's copy-pasted dig-sdk gate with real scripts (#1)- Node --test breaks on Node 22 when passed a bare test/ path (#4)

### CI
- Enforce version increment in PRs (package.json / Cargo.toml)- Enforce Conventional Commits with commitlint on PRs- Enforce Conventional Commits with commitlint on PRs- Release automation + auto-publish on version tag (#230 auto-publish-everything)- Publish via npm trusted publishing (OIDC), retire NPM_TOKEN (#3)- Add flaky-test management (#489) (#5)

### Chores
- **changelog:** Add git-cliff config for Conventional-Commit changelog


