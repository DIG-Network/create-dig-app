// NFT mint wiring via @dignetwork/dig-sdk.
//
// IMPORTANT: scaffolding this template did NOT mint anything, touch the chain, or spend funds.
// Minting is an explicit, wallet-signed on-chain action the visitor triggers below — it requires a
// connected wallet and funds. The SDK is the canonical place to BUILD the spend; spends are never
// hand-rolled. The wallet signs the coin spends the builder produces.

import { ChiaProvider } from "@dignetwork/dig-sdk";

// WalletConnect Cloud / Reown project id, read from the build-time env (see .env.example). When set,
// it enables the WalletConnect → Sage fallback so visitors without the injected DIG wallet can still
// connect Sage (the main Chia wallet) in a normal browser. Get a free id at https://cloud.reown.com.
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "";

/**
 * Connect a wallet for the drop. `mode: "auto"` prefers the injected DIG Browser wallet
 * (window.chia) and falls back to WalletConnect → Sage when a project id is configured (the SDK
 * drives its `WalletConnectTransport` under the hood — we never hand-roll WC).
 *
 * @param {{ onUri?: (uri: string) => void }} [hooks] `onUri` receives the WalletConnect pairing URI
 *   so the UI can show a QR / copy-link / deep link to Sage during the fallback.
 * @returns {Promise<import("@dignetwork/dig-sdk").ChiaProvider>}
 */
export async function connectWallet(hooks = {}) {
  return ChiaProvider.connect({
    mode: "auto", // prefer injected window.chia; fall back to WalletConnect → Sage if configured
    chain: "chia:mainnet", // CAIP-2 chain the SDK expects (Chia mainnet)
    walletConnect: WALLETCONNECT_PROJECT_ID
      ? {
          projectId: WALLETCONNECT_PROJECT_ID,
          metadata: {
            name: "__DISPLAY_NAME__",
            description: "An NFT drop built with create-dig-app",
            url: typeof window !== "undefined" ? window.location.origin : "https://example.on.dig.net",
            icons: [],
          },
          onUri: hooks.onUri, // render this URI as a QR / copy-link for the Sage fallback
        }
      : undefined,
  });
}

/**
 * Build + sign a mint spend with the canonical CHIP-0035 builder, then sign it with the wallet.
 *
 * This is the shape of a real mint: build the coin spends with `@dignetwork/dig-sdk/spend`, then
 * hand them to `provider.signCoinSpends(...)`. Filling in the concrete mint builder + funding coins
 * is left to you — see the chip35 spend builder + the "Build a dapp on Chia" tutorial:
 *   https://github.com/DIG-Network/dig-sdk
 *   https://docs.dig.net/docs/build-a-dapp
 *
 * It is intentionally NOT called automatically — minting spends real funds.
 *
 * @param {import("@dignetwork/dig-sdk").ChiaProvider} provider A connected wallet.
 */
export async function mint(provider) {
  // The spend module is the canonical CHIP-0035 builder (re-exported chip35-dl-coin-wasm). Lazily
  // imported so the read/connect path stays light until a visitor actually mints.
  const spend = await import("@dignetwork/dig-sdk/spend");
  spend.init();

  // TODO: build your mint coin spends here with the wasm builder (e.g. from a prepared collection),
  // then sign them with the wallet. Never hand-roll a spend bundle — always build it via the SDK.
  const coinSpends = []; // <- produced by the spend builder for your collection/item
  if (coinSpends.length === 0) {
    throw new Error(
      "No mint spend wired yet. Build your coin spends with @dignetwork/dig-sdk/spend, then sign them. " +
        "See https://docs.dig.net/docs/build-a-dapp",
    );
  }
  return provider.signCoinSpends(coinSpends);
}
