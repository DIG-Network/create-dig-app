// NFT mint wiring via @dignetwork/dig-sdk (typed).
//
// IMPORTANT: scaffolding this template did NOT mint anything, touch the chain, or spend funds.
// Minting is an explicit, wallet-signed on-chain action the visitor triggers below — it requires a
// connected wallet and funds. The SDK is the canonical place to BUILD the spend; spends are never
// hand-rolled. The wallet signs the coin spends the builder produces.
//
// @dignetwork/dig-sdk ships its own .d.ts types, so ChiaProvider, ConnectOptions, and
// WalletConnectOptions are all fully typed — no `@types/*` package is needed for the SDK.

import {
  ChiaProvider,
  type ConnectOptions,
  type WalletConnectOptions,
} from "@dignetwork/dig-sdk";

// WalletConnect Cloud / Reown project id, read from the build-time env (see .env.example) and typed
// via src/vite-env.d.ts. When set, it enables the WalletConnect → Sage fallback so visitors without
// the injected DIG wallet can still connect Sage (the main Chia wallet) in a normal browser. Get a
// free id at https://cloud.reown.com (formerly WalletConnect Cloud).
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "";

/** Hooks for the connect flow (e.g. render the WalletConnect pairing URI as a QR / copy-link). */
export interface ConnectHooks {
  onUri?: (uri: string) => void;
}

/**
 * Connect a wallet for the drop. `mode: "auto"` prefers the injected DIG Browser wallet
 * (window.chia) and falls back to WalletConnect → Sage when a project id is configured (the SDK
 * drives its `WalletConnectTransport` under the hood — we never hand-roll WC).
 */
export async function connectWallet(hooks: ConnectHooks = {}): Promise<ChiaProvider> {
  // The typed WalletConnect options the SDK's WalletConnectTransport consumes (projectId + metadata
  // + the pairing-URI hook + the Chia chain). Only built when a project id is configured.
  const walletConnect: WalletConnectOptions | undefined = WALLETCONNECT_PROJECT_ID
    ? {
        projectId: WALLETCONNECT_PROJECT_ID,
        metadata: {
          name: "__DISPLAY_NAME__",
          description: "An NFT drop built with create-dig-app",
          url: typeof window !== "undefined" ? window.location.origin : "https://example.dig",
          icons: [],
        },
        onUri: hooks.onUri, // render this URI as a QR / copy-link for the Sage fallback
      }
    : undefined;

  const options: ConnectOptions = {
    mode: "auto", // prefer injected window.chia; fall back to WalletConnect → Sage if configured
    chain: "chia:mainnet", // CAIP-2 chain the SDK expects (Chia mainnet)
    walletConnect,
  };
  return ChiaProvider.connect(options);
}

/**
 * Build a mint spend with the canonical CHIP-0035 builder, then sign it with the wallet.
 *
 * This is the shape of a real mint: build the coin spends with `@dignetwork/dig-sdk/spend`, then
 * hand them to `provider.signCoinSpends(...)`. Filling in the concrete mint builder + funding coins
 * is left to you — see the chip35 spend builder + the "Build a dapp on Chia" tutorial:
 *   https://github.com/DIG-Network/dig-sdk
 *   https://docs.dig.net/build-a-dapp
 *
 * It is intentionally NOT called automatically — minting spends real funds.
 *
 * @param provider A connected wallet (typed `ChiaProvider` from the SDK).
 */
export async function mint(provider: ChiaProvider): Promise<string> {
  // The spend module is the canonical CHIP-0035 builder (re-exported chip35-dl-coin-wasm). Lazily
  // imported so the read/connect path stays light until a visitor actually mints.
  const spend = await import("@dignetwork/dig-sdk/spend");
  spend.init();

  // TODO: build your mint coin spends here with the wasm builder (e.g. from a prepared collection),
  // then sign them with the wallet. Never hand-roll a spend bundle — always build it via the SDK.
  const coinSpends: unknown[] = []; // <- produced by the spend builder for your collection/item
  if (coinSpends.length === 0) {
    throw new Error(
      "No mint spend wired yet. Build your coin spends with @dignetwork/dig-sdk/spend, then sign them. " +
        "See https://docs.dig.net/build-a-dapp",
    );
  }
  return provider.signCoinSpends(coinSpends);
}
