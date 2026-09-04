# Contributing to create-dig-app

`create-dig-app` scaffolds wallet-wired, deployable DIG Network apps — the JS front door for
building dapps, frontends, and NFT collections on Chia (the Rust sibling `digstore new` scaffolds
the same templates from the CLI). Thanks for helping improve it.

## Reporting an issue

File it at <https://github.com/DIG-Network/create-dig-app/issues> with:

- what you observed vs. what you expected
- the exact command you ran (including `--template`/`--typescript` flags)
- repro steps, ideally the smallest scaffold that reproduces it

## Prerequisites

- Node.js **>= 18** (`engines.node` in `package.json`). CI runs the test suite on 18, 20, and 22.
- No other toolchain — the package ships with **zero runtime dependencies**.
- Testing a template change means actually scaffolding a project with it: several tests
  (`test/typescript.test.js`, `test/scaffold.test.js`) run `bin/create-dig-app.js` into a temp
  directory and assert on the emitted file tree, and CI additionally installs + type-checks +
  builds a real scaffolded TypeScript app (see "The gate" below) — so a template edit isn't
  verified until you've scaffolded it and, for a buildable template, run its own `npm install` /
  `npm run build`.

## Build & test

```sh
npm ci                 # install devDependencies (eslint, prettier, c8)
npm run format:check   # prettier --check .
npm run lint           # eslint .
npm run coverage       # node --test suite, gated at >=80% lines/branches/functions/statements
                        # (thresholds + scope in .c8rc.json: lib/**/*.js + bin/**/*.js)
```

`npm test` runs the same `node --test` suite without the coverage gate, for a quick local loop.
The suite auto-discovers everything under `test/`.

To manually try a template change:

```sh
node bin/create-dig-app.js my-test-app --template vite-react --typescript
cd my-test-app && npm install && npm run build
```

## The gate (must pass before a PR merges)

CI (`.github/workflows/ci.yml`) runs two jobs on every PR:

1. **`test`** (Node 18, 20, 22 matrix) — `npm run format:check`, `npm run lint`, then
   `npm run coverage` (the >=80% coverage floor).
2. **`typescript-scaffold`** (Node 20; templates `vite-react`, `dapp-window-chia`, `nft-drop`) —
   scaffolds each template with `--typescript`, asserts `tsconfig.json` + a `.tsx` source exist,
   asserts the two wallet templates emit the WalletConnect->Sage wiring (`.env.example` with
   `VITE_WALLETCONNECT_PROJECT_ID`, the `@walletconnect/sign-client` dependency), then runs
   `npm install`, `npm run typecheck`, and `npm run build` inside the scaffolded project itself.

Two more required checks run on every PR:

- **Commitlint** (`.github/workflows/commitlint.yml`) — every commit message and the PR title must
  follow Conventional Commits (`commitlint.config.mjs`, extending
  `@commitlint/config-conventional`).
- **Check Version Increment** (`.github/workflows/ensure-version-increment.yml`) — `package.json`'s
  `version` on your branch must be strictly greater than on `main`. This repo has no `Cargo.toml`,
  so only `package.json` is checked.

Run the first three locally before opening a PR:

```sh
npm run format:check
npm run lint
npm run coverage
```

## PR conventions

- **Conventional Commits**, enforced by commitlint: `type(scope): summary` —
  `feat|fix|docs|style|refactor|perf|test|build|ci|chore`, with `!` or a `BREAKING CHANGE:` footer
  for a breaking change.
- **Bump `version` in `package.json`** as part of your PR — patch for a compatible fix, minor for
  a new capability (e.g. a new template or flag), major for a breaking change (a removed template,
  a changed CLI flag/output shape). The version-increment check fails a PR that doesn't bump it.
- `main` is protected: open a PR, get every required check green with zero unresolved review
  threads, then squash-merge. Direct pushes to `main` aren't allowed.
- Merging to `main` triggers `.github/workflows/release.yml`, which regenerates `CHANGELOG.md`
  (git-cliff) from your commits, tags the release commit `vX.Y.Z`, and pushes the tag. The tag then
  triggers `.github/workflows/publish-npm.yml`, which publishes that exact `package.json` version
  to npm via OIDC trusted publishing. There's no separate release step to run by hand — a merged,
  version-bumped PR ships itself.
