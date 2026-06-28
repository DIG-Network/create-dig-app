# __DISPLAY_NAME__

A wallet-wired dapp for the **DIG Network** — connects the injected Chia wallet (`window.chia`) via
`@dignetwork/dig-sdk`'s `ChiaProvider`, with a WalletConnect → Sage fallback.

Scaffolded with `npm create dig-app` (template: `dapp-window-chia`).

## Free until publish

Scaffolding, building, previewing, and connecting a wallet cost **nothing**. There is **no mint, no
chain, and no spend** when you create or run this project — you only spend a flat **100 DIG** the
moment you publish a capsule with `digstore deploy`. *Iterate for free, publish when it's ready.*

## How the wallet is wired

`src/wallet.js` calls `ChiaProvider.connect({ mode: "auto" })`, which **prefers the injected DIG
Browser wallet** (`window.chia`) and **falls back to WalletConnect → Sage**. In `digstore dev` an
injected dev-shim `window.chia` is present, so the connect/read path runs locally — but the shim
never fakes a signature; open the dapp in the **DIG Browser** (or connect a real wallet) to sign for
real. See <https://github.com/DIG-Network/dig-sdk> for the full API.

To enable the WalletConnect fallback, set a project id from
<https://cloud.walletconnect.com> in `src/wallet.js` and `npm i @walletconnect/sign-client`.

## Develop

```sh
npm install
npm run dev            # Vite dev server at http://localhost:5173
npm run build          # production build -> dist/ (your content root)
digstore dev           # preview on the real dig:// read path + dev wallet shim — FREE, no spend
```

## Publish (this is the only step that spends DIG)

```sh
digstore deploy        # build + publish a capsule (100 DIG + a small XCH fee)
```

## Deploy from CI

Wire up push-to-deploy with the GitHub Action:
<https://docs.dig.net/digstore/cli/deploy-from-github-actions>.

## Config

`dig.toml` is the project manifest digstore reads (output dir, build command, default remote).
