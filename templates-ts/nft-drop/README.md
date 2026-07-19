# __DISPLAY_NAME__

A wallet-connected **NFT drop** for the **DIG Network**, in **TypeScript** — a mint page wired to
`@dignetwork/dig-sdk` (`ChiaProvider` for the wallet, `@dignetwork/dig-sdk/spend` for the canonical
CHIP-0035 mint builder). The SDK ships its own types, so `ChiaProvider`/`ConnectOptions` are fully
typed — no `@types/*` package needed for the SDK.

Scaffolded with `npm create dig-app` (template: `nft-drop`, language: TypeScript).

## Free until publish — and nothing was minted

Scaffolding this template **did not mint anything, touch the chain, or spend funds.** Building and
previewing the mint page are **free**. Two distinct costs come later, both explicit:

- **Publishing the page** as a DIG capsule is one `digstore deploy` — **$DIG**.
- **Minting the NFTs** is a separate, wallet-signed on-chain action a visitor triggers (it spends
  the visitor's funds). The spend is **built with the SDK** and signed by the wallet — never
  hand-rolled.

## How minting is wired

`src/mint.ts` connects a wallet with `ChiaProvider.connect({ mode: "auto" })` (prefers the injected
DIG Browser wallet, falls back to WalletConnect → Sage) and shows the shape of a real mint: build
coin spends with `@dignetwork/dig-sdk/spend`, then `provider.signCoinSpends(...)`. Wire your
collection in `src/mint.ts` — see the spend builder and the "Build a dapp on Chia" tutorial:
<https://github.com/DIG-Network/dig-sdk> · <https://docs.dig.net/docs/build-a-dapp>.

The dev-shim wallet (in `digstore dev`) cannot sign — open the page in the **DIG Browser** (or
connect a real wallet) to mint for real.

## Connect to Sage in a normal browser (WalletConnect)

Outside the DIG Browser there is no injected `window.chia`, so a visitor connects **Sage** (the main
Chia wallet) over **WalletConnect**. This needs a free **project id**:

1. Get one at **<https://cloud.reown.com>** (Reown, formerly WalletConnect Cloud).
2. Copy `.env.example` to `.env` and set it:

   ```sh
   cp .env.example .env
   # .env
   VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
   ```

`@walletconnect/sign-client` is already a dependency, so once `VITE_WALLETCONNECT_PROJECT_ID` is set,
**Connect wallet to mint** shows a pairing link/QR to approve in Sage and then displays the connected
address. Leave it blank to support only the injected DIG Browser wallet. (Never commit `.env` — only
the placeholder `.env.example` is tracked. The env is typed in `src/vite-env.d.ts`.)

## Develop

```sh
npm install
npm run dev            # Vite dev server at http://localhost:5173
npm run typecheck      # tsc --noEmit (type-check without building)
npm run build          # tsc --noEmit && vite build -> dist/ (your content root)
digstore dev           # preview on the real chia:// read path + dev wallet shim — FREE, no spend
```

## Publish the mint page (this is the only step that spends $DIG)

```sh
digstore deploy        # build + publish a capsule ($DIG + a small XCH fee)
```

## Deploy from CI

Wire up push-to-deploy with the GitHub Action:
<https://docs.dig.net/docs/digstore/cli/deploy-from-github-actions>.

## Config

`dig.toml` is the project manifest digstore reads (output dir, build command, default remote).
`tsconfig.json` configures TypeScript (strict mode, `bundler` resolution for Vite).
