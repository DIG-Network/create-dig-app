# __DISPLAY_NAME__

A wallet-connected **NFT drop** for the **DIG Network**, in **TypeScript** — a mint page wired to
`@dignetwork/dig-sdk` (`ChiaProvider` for the wallet, `@dignetwork/dig-sdk/spend` for the canonical
CHIP-0035 mint builder). The SDK ships its own types, so `ChiaProvider`/`ConnectOptions` are fully
typed — no `@types/*` package needed for the SDK.

Scaffolded with `npm create dig-app` (template: `nft-drop`, language: TypeScript).

## Free until publish — and nothing was minted

Scaffolding this template **did not mint anything, touch the chain, or spend funds.** Building and
previewing the mint page are **free**. Two distinct costs come later, both explicit:

- **Publishing the page** as a DIG capsule is one `digstore deploy` — a flat **100 DIG**.
- **Minting the NFTs** is a separate, wallet-signed on-chain action a visitor triggers (it spends
  the visitor's funds). The spend is **built with the SDK** and signed by the wallet — never
  hand-rolled.

## How minting is wired

`src/mint.ts` connects a wallet with `ChiaProvider.connect({ mode: "auto" })` (prefers the injected
DIG Browser wallet, falls back to WalletConnect → Sage) and shows the shape of a real mint: build
coin spends with `@dignetwork/dig-sdk/spend`, then `provider.signCoinSpends(...)`. Wire your
collection in `src/mint.ts` — see the spend builder and the "Build a dapp on Chia" tutorial:
<https://github.com/DIG-Network/dig-sdk> · <https://docs.dig.net/build-a-dapp>.

The dev-shim wallet (in `digstore dev`) cannot sign — open the page in the **DIG Browser** (or
connect a real wallet) to mint for real.

## Develop

```sh
npm install
npm run dev            # Vite dev server at http://localhost:5173
npm run typecheck      # tsc --noEmit (type-check without building)
npm run build          # tsc --noEmit && vite build -> dist/ (your content root)
digstore dev           # preview on the real dig:// read path + dev wallet shim — FREE, no spend
```

## Publish the mint page (this is the only step that spends DIG)

```sh
digstore deploy        # build + publish a capsule (100 DIG + a small XCH fee)
```

## Deploy from CI

Wire up push-to-deploy with the GitHub Action:
<https://docs.dig.net/digstore/cli/deploy-from-github-actions>.

## Config

`dig.toml` is the project manifest digstore reads (output dir, build command, default remote).
`tsconfig.json` configures TypeScript (strict mode, `bundler` resolution for Vite).
