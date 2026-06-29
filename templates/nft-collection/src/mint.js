// Optional in-app mint wiring via @dignetwork/dig-sdk.
//
// The PRIMARY way to mint this collection is the `digstore` CLI — it reads collection.json + the
// generated items.json and builds + signs + pushes the spends for you:
//
//   digstore collection mint --collection collection.json --manifest items.json --did <your-did>
//
// This file is here for the other path: minting from your OWN web app/page with a connected wallet.
// It connects a wallet with `ChiaProvider` and shows the shape of a mint — build the coin spends
// with `@dignetwork/dig-sdk/spend` (the canonical CHIP-0035 builder), then `signCoinSpends`. Spends
// are NEVER hand-rolled. Nothing here mints or spends until you wire your collection and call it.

import { ChiaProvider } from "@dignetwork/dig-sdk";

// WalletConnect Cloud / Reown project id (see .env.example). When set, enables the WalletConnect →
// Sage fallback so you can connect Sage in a normal browser. Read from the process env here (this is
// a plain Node/ESM module, not a Vite app); get a free id at https://cloud.reown.com.
const WALLETCONNECT_PROJECT_ID =
  (typeof process !== "undefined" && process.env && process.env.WALLETCONNECT_PROJECT_ID) || "";

/**
 * Connect a wallet to mint. `mode: "auto"` prefers the injected DIG Browser wallet (window.chia) and
 * falls back to WalletConnect → Sage when a project id is configured (the SDK drives its
 * WalletConnectTransport — we never hand-roll WC).
 *
 * @param {{ onUri?: (uri: string) => void }} [hooks] `onUri` receives the WalletConnect pairing URI
 *   so a UI can show a QR / deep link to Sage during the fallback.
 * @returns {Promise<import("@dignetwork/dig-sdk").ChiaProvider>}
 */
export async function connectWallet(hooks = {}) {
  return ChiaProvider.connect({
    mode: "auto", // prefer injected window.chia; fall back to WalletConnect → Sage if configured
    chain: "chia:mainnet",
    walletConnect: WALLETCONNECT_PROJECT_ID
      ? {
          projectId: WALLETCONNECT_PROJECT_ID,
          metadata: {
            name: "__DISPLAY_NAME__",
            description: "An NFT collection built with create-dig-app",
            url: "https://example.on.dig.net",
            icons: [],
          },
          onUri: hooks.onUri,
        }
      : undefined,
  });
}

/**
 * Build + sign a collection mint with the canonical CHIP-0035 builder. Filling in the concrete
 * builder calls from your items.json is left to you — see the spend builder + the tutorial:
 *   https://github.com/DIG-Network/dig-sdk
 *   https://docs.dig.net/docs/audiences/nft-developers
 *
 * Most collections mint with the `digstore collection mint` CLI instead (see the file header) — that
 * path needs no in-app wiring at all.
 *
 * @param {import("@dignetwork/dig-sdk").ChiaProvider} provider A connected wallet.
 */
export async function mint(provider) {
  const spend = await import("@dignetwork/dig-sdk/spend");
  spend.init();
  // TODO: build your mint coin spends from items.json with the wasm builder, then sign them.
  const coinSpends = [];
  if (coinSpends.length === 0) {
    throw new Error(
      "No mint spend wired yet. Mint via `digstore collection mint`, or build coin spends with " +
        "@dignetwork/dig-sdk/spend and sign them. See https://docs.dig.net/docs/audiences/nft-developers",
    );
  }
  return provider.signCoinSpends(coinSpends);
}
