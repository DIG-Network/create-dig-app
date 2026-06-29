# __DISPLAY_NAME__

A wallet-wired dapp for the **DIG Network** — connects the injected Chia wallet (`window.chia`) via
`@dignetwork/dig-sdk`'s `ChiaProvider`, with a WalletConnect → Sage fallback.

Scaffolded with `npm create dig-app` (template: `dapp-window-chia`).

## Free until publish

Scaffolding, building, previewing, and connecting a wallet cost **nothing**. There is **no mint, no
chain, and no spend** when you create or run this project — you only spend **$DIG** the
moment you publish a capsule with `digstore deploy`. *Iterate for free, publish when it's ready.*

## How the wallet is wired

`src/wallet.js` calls `ChiaProvider.connect({ mode: "auto" })`, which **prefers the injected DIG
Browser wallet** (`window.chia`) and **falls back to WalletConnect → Sage**. In `digstore dev` an
injected dev-shim `window.chia` is present, so the connect/read path runs locally — but the shim
never fakes a signature; open the dapp in the **DIG Browser** (or connect a real wallet) to sign for
real. See <https://github.com/DIG-Network/dig-sdk> for the full API.

## Connect to Sage in a normal browser (WalletConnect)

Outside the DIG Browser there is no injected `window.chia`, so the dapp connects to **Sage** (the
main Chia wallet) over **WalletConnect**. This needs a free **project id**:

1. Get one at **<https://cloud.reown.com>** (Reown, formerly WalletConnect Cloud).
2. Copy `.env.example` to `.env` and set it:

   ```sh
   cp .env.example .env
   # .env
   VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
   ```

`@walletconnect/sign-client` is already a dependency, so once the project id is set, **Connect
wallet** shows a pairing link/QR to approve in Sage and then displays your connected address. Leave
`VITE_WALLETCONNECT_PROJECT_ID` blank to support only the injected DIG Browser wallet. (Never commit
`.env` — only the placeholder `.env.example` is tracked.)

## Develop

```sh
npm install
npm run dev            # Vite dev server at http://localhost:5173
npm run build          # production build -> dist/ (your content root)
digstore dev           # preview on the real dig:// read path + dev wallet shim — FREE, no spend
```

## Publish (this is the only step that spends $DIG)

```sh
digstore deploy        # build + publish a capsule ($DIG + a small XCH fee)
```

## Deploy from CI

Wire up push-to-deploy with the GitHub Action:
<https://docs.dig.net/docs/digstore/cli/deploy-from-github-actions>.

## Config

`dig.toml` is the project manifest digstore reads (output dir, build command, default remote).
