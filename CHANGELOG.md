# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org) and
[Conventional Commits](https://www.conventionalcommits.org).

## [0.3.2] - 2026-07-19

### Chores
- **create-dig-app:** Add prettier config + format:check CI gate (#9)

## [0.3.1] - 2026-07-19

### Bug Fixes
- **nft:** Reject empty --store-id; coerce empty storeId to placeholder (#1065)

## [0.3.0] - 2026-07-18

### Features
- **nft:** Inject real store id into NFT mint URIs via --store-id (#350)

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


