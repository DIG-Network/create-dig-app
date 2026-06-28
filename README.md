# create-dig-app

Scaffold a wallet-wired, deployable **DIG Network** app — **free, no mint**. The JS front door for
building dapps, frontends, and NFT collections on Chia (the companion to the Rust `digstore new`).

```sh
npm create dig-app@latest my-app -- --template vite-react
```

…or run it with no arguments for an interactive picker:

```sh
npm create dig-app@latest
```

`create-dig-app` writes a runnable starter project: a `dig.toml` manifest, a real app you can build,
and (for the wallet templates) `@dignetwork/dig-sdk` already wired in. Then it prints your next
steps. It has **no runtime dependencies** and works on Node 18+.

## Free until publish

**Scaffolding, building, and previewing cost nothing.** Creating a project does **not** mint,
touch the chain, or spend any funds. You spend a flat **100 DIG** only when you publish a capsule
with `digstore deploy`. *Iterate for free, publish when it's ready.*

```sh
digstore dev      # preview on the real dig:// read path — FREE, no chain, no spend
digstore deploy   # publish a capsule when you're ready (the only step that spends 100 DIG)
```

## Templates

| Template | What you get | Wallet wired |
|---|---|---|
| `static` | Plain HTML/CSS/JS — zero build step, the lightest way to ship a site. | — |
| `vite-react` | A React SPA built with Vite — the fast default for an app frontend. | — |
| `next-static` | Next.js exported to static files (`output: 'export'`), deployable as a capsule. | — |
| `nft-drop` | A wallet-connected NFT mint page (`ChiaProvider` + the canonical CHIP-0035 spend builder). | yes |
| `dapp-window-chia` | A dapp wired to the injected Chia wallet via `ChiaProvider` (`window.chia` → WalletConnect). | yes |

The wallet templates wire [`@dignetwork/dig-sdk`](https://github.com/DIG-Network/dig-sdk): a Chia
wallet your dapp gets for free. `ChiaProvider` **prefers the injected DIG Browser wallet**
(`window.chia`) and **falls back to WalletConnect → Sage**. NFT minting uses the SDK's `/spend`
builder — spends are never hand-rolled. **Nothing is minted, signed, or spent at scaffold time** —
minting is an explicit, wallet-signed action a user triggers later.

## Usage

```sh
# explicit template + name
npm create dig-app@latest my-app -- --template <template>

# interactive (prompts for name + template)
npm create dig-app@latest

# help / templates list
npm create dig-app@latest -- --help
```

| Option | Description |
|---|---|
| `<name>` | Project directory + npm package name (slugified to be npm-safe). |
| `-t, --template <t>` | One of: `static`, `vite-react`, `next-static`, `nft-drop`, `dapp-window-chia`. |
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

## Deploy

Preview locally for free with `digstore dev`, publish with `digstore deploy`, and wire
push-to-deploy in CI with the GitHub deploy Action so every push to `main` publishes a new capsule:
[Deploy from GitHub Actions](https://docs.dig.net/digstore/cli/deploy-from-github-actions).

## Develop on create-dig-app

```sh
node --test test/         # run the test suite (no install needed)
node bin/create-dig-app.js my-app --template static   # run the CLI locally
```

## License

MIT
