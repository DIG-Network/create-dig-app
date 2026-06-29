# create-dig-app

Scaffold a wallet-wired, deployable **DIG Network** app — **free, no mint**. The JS front door for
building dapps, frontends, and NFT collections on Chia.

> **Prefer Rust?** [`digstore new`](https://docs.dig.net/docs/digstore/cli/new) scaffolds the same
> starters from the CLI — `create-dig-app` and `digstore new` are the two front doors to the same
> templates (the `static-site` / `vite-react` / … ids match).

```sh
npm create dig-app@latest my-app -- --template vite-react

# …or scaffold the TypeScript variant:
npm create dig-app@latest my-app -- --template vite-react --typescript
```

…or run it with no arguments for an interactive picker (it asks for the name, template, **and
JavaScript-or-TypeScript**):

```sh
npm create dig-app@latest
```

`create-dig-app` writes a runnable starter project: a `dig.toml` manifest, a real app you can build,
and (for the wallet templates) `@dignetwork/dig-sdk` already wired in. Then it prints your next
steps. It has **no runtime dependencies** and works on Node 18+.

## JavaScript or TypeScript

Every buildable template ships in **both JavaScript (default) and TypeScript**. Pick TypeScript with
`--typescript` (`--ts`, or `--lang ts`), or choose it in the interactive prompt. The TypeScript
variant adds a `tsconfig.json`, `.ts`/`.tsx` sources, the `typescript` (and React `@types/*`)
devDeps, an env shim (`vite-env.d.ts` / `next-env.d.ts`), and a build that type-checks
(`tsc --noEmit && vite build`, or Next's built-in checking). Run `npm run typecheck` any time.

The wallet templates use [`@dignetwork/dig-sdk`](https://github.com/DIG-Network/dig-sdk)'s **shipped
types** — `ChiaProvider`, `ConnectOptions`, and friends are fully typed straight from the package's
`.d.ts`, so no `@types/*` shim is needed for the SDK.

> The `static-site` template has no build step (it just copies `src/` → `public/`), so it has no
> TypeScript variant — requesting `--typescript` for it scaffolds JavaScript and tells you so.
> (The legacy id `static` still works as a hidden alias.)

## Free until publish

**Scaffolding, building, and previewing cost nothing.** Creating a project does **not** mint,
touch the chain, or spend any funds. You spend **$DIG** only when you publish a **capsule** with
`digstore deploy`. *Iterate for free, publish when it's ready.*

```sh
digstore dev      # preview on the real dig:// read path — FREE, no chain, no spend
digstore deploy   # publish a capsule when you're ready (the only step that spends $DIG)
```

A published app lives on **DIGHUb** at `hub.dig.net/stores/<id>`, and you can optionally register a
human name so it is also reachable at `<your-name>.on.dig.net` (a pay-to-register domain).

## Templates

| Template | What you get | Wallet wired | Languages |
|---|---|---|---|
| `static-site` | Plain HTML/CSS/JS — zero build step, the lightest way to ship a site. | — | JS |
| `vite-react` | A React SPA built with Vite — the fast default for an app frontend. | — | JS · TS |
| `next-static` | Next.js exported to static files (`output: 'export'`), deployable as a capsule. | — | JS · TS |
| `nft-drop` | A wallet-connected NFT mint page (`ChiaProvider` + the canonical CHIP-0035 spend builder). | yes | JS · TS |
| `dapp-window-chia` | A dapp wired to a Chia wallet via `ChiaProvider` — injected `window.chia`, or Sage over WalletConnect. | yes | JS · TS |

The wallet templates wire [`@dignetwork/dig-sdk`](https://github.com/DIG-Network/dig-sdk): a Chia
wallet your dapp gets for free. `ChiaProvider.connect({ mode: "auto" })` **prefers the injected DIG
Browser wallet** (`window.chia`) and **falls back to WalletConnect → Sage** (the main Chia wallet)
so a scaffolded dapp connects in a normal browser too — not just the DIG Browser. NFT minting uses
the SDK's `/spend` builder — spends are never hand-rolled. **Nothing is minted, signed, or spent at
scaffold time** — minting is an explicit, wallet-signed action a user triggers later.

### Wallet connection — injected DIG Browser **or** Sage (WalletConnect)

The same **Connect** button works in both worlds, in both JS and TS:

| | Injected (DIG Browser / extension) | WalletConnect → Sage (any browser) |
|---|---|---|
| When | `window.chia` is present | no injected wallet found |
| Setup | none | set a free **projectId** (env) |
| UX | instant connect | pairing link / QR to approve in Sage |

To enable the Sage fallback, the wallet templates ship `@walletconnect/sign-client` (the SDK's
optional WC peer dep) as a dependency and read a **project id** from the build-time env:

```sh
cp .env.example .env
# .env  — get a free id at https://cloud.reown.com (Reown / WalletConnect Cloud)
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

Leave it blank to support only the injected DIG Browser wallet (the app still builds and runs). The
project id is never committed — only the placeholder `.env.example` is tracked. (The SDK throws an
actionable error if WalletConnect is used without the peer dep / project id; the scaffolded setup
satisfies it.)

## Usage

```sh
# explicit template + name (JavaScript)
npm create dig-app@latest my-app -- --template <template>

# TypeScript variant
npm create dig-app@latest my-app -- --template <template> --typescript

# interactive (prompts for name + template + JS/TS)
npm create dig-app@latest

# help / templates list
npm create dig-app@latest -- --help
```

| Option | Description |
|---|---|
| `<name>` | Project directory + npm package name (slugified to be npm-safe). |
| `-t, --template <t>` | One of: `static-site`, `vite-react`, `next-static`, `nft-drop`, `dapp-window-chia`. |
| `--typescript`, `--ts` | Scaffold the TypeScript variant (where available). |
| `--javascript`, `--js` | Scaffold the JavaScript variant (the default). |
| `--lang <js\|ts>` | Same as the language flags above. |
| `--json` | Emit one structured result object on stdout; route human prose to stderr (for scripts/agents). |
| `--list-templates` | List the available templates (pair with `--json` for machine-readable output). |
| `--help-json` | Print the full flag/template tree + exit-code table as JSON. |
| `-h, --help` | Show usage and the template list. |
| `-v, --version` | Print the version. |

> The `--` before the flags is npm's `npm create` argument separator — it forwards the rest to
> `create-dig-app`. With `npx create-dig-app` / `pnpm create dig-app` you can drop it.

## What it writes

Every project includes:

- **`dig.toml`** — the project manifest `digstore` (and the DIG SDK adapters) read: `output-dir`,
  `build-command`, and the default `remote`. This is the single source of truth `digstore deploy`
  and the GitHub Action use.
- **`README.md`** — the develop -> preview (free) -> publish flow for that template.
- a real **app** that `npm install`s and builds to the template's output dir.
- for the **TypeScript** variant: a `tsconfig.json`, `.ts`/`.tsx` sources, the `typescript`
  (and React `@types/*`) devDeps, and an env shim — the project type-checks and builds out of the box.

## Deploy

Preview locally for free with `digstore dev`, publish with `digstore deploy`, and wire
push-to-deploy in CI with the GitHub deploy Action so every push to `main` publishes a new capsule:
[Deploy from GitHub Actions](https://docs.dig.net/docs/digstore/cli/deploy-from-github-actions).
Your app is then live on **DIGHUb** (`hub.dig.net/stores/<id>`) and, if you register one, at
`<your-name>.on.dig.net`.

## Scripting / agents (machine-readable output)

`create-dig-app` is scriptable end-to-end. Pass `--json` to get a single structured object on
**stdout** (all human prose is routed to **stderr**, and no interactive prompts are shown — so an
agent can scaffold unattended):

```sh
# Scaffold and capture the result as JSON.
npx create-dig-app my-app --template vite-react --json
# → {"schemaVersion":1,"ok":true,"result":{"appName":"my-app","template":"vite-react",
#     "lang":"js","requestedLang":"js","targetDir":"…/my-app","nextSteps":[…]}}

# Discover the templates as data, or the full invocation contract:
npx create-dig-app --list-templates --json
npx create-dig-app --help-json        # flags + template tree + the exit-code table
```

On failure, `--json` emits a structured error envelope with a **stable, UPPER_SNAKE code** (never
derived from the prose), the matching exit code, and an actionable hint:

```json
{"schemaVersion":1,"ok":false,"error":{"code":"UNKNOWN_TEMPLATE","exit_code":3,
  "message":"Unknown template \"svelte\". Available: …","hint":"Run with --list-templates …",
  "template":"svelte"}}
```

### Exit codes

A differentiated, stable exit-code table (also emitted by `--help-json`) so a script can branch on
the *kind* of failure:

| Code | Meaning |
|---|---|
| `0` | success |
| `1` | unexpected internal error |
| `2` | usage error (bad/unknown option or malformed arguments) |
| `3` | unknown template id |
| `4` | target directory exists and is not empty |
| `5` | required arguments missing in non-interactive mode |
| `6` | bundled template files are missing (packaging bug) |
| `7` | app name is not usable |

## Develop on create-dig-app

```sh
node --test test/         # run the test suite (no install needed)
node bin/create-dig-app.js my-app --template static-site   # run the CLI locally
```

## License

MIT
