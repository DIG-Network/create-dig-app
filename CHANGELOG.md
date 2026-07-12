# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org) and
[Conventional Commits](https://www.conventionalcommits.org).

## [0.2.3] - 2026-07-12

### Features
- **nft-metadata:** Emit CHIP-0007 collection attributes as "type", not "trait_type" (#2)

### Bug Fixes
- **ci:** Replace publish-npm.yml's copy-pasted dig-sdk gate with real scripts (#1)- Node --test breaks on Node 22 when passed a bare test/ path (#4)

### CI
- Enforce version increment in PRs (package.json / Cargo.toml)- Enforce Conventional Commits with commitlint on PRs- Enforce Conventional Commits with commitlint on PRs- Release automation + auto-publish on version tag (#230 auto-publish-everything)- Publish via npm trusted publishing (OIDC), retire NPM_TOKEN (#3)- Add flaky-test management (#489) (#5)

### Chores
- **changelog:** Add git-cliff config for Conventional-Commit changelog


