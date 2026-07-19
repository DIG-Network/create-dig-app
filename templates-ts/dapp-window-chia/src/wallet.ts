// Wallet wiring via @dignetwork/dig-sdk (typed).
//
// ChiaProvider gives this dapp a Chia wallet for free: it PREFERS the injected DIG Browser wallet
// (window.chia) and falls back to WalletConnect → Sage (the main Chia wallet) so the dapp connects
// in a normal browser too. In `digstore dev` an injected dev-shim window.chia is present, so the
// connect/read path runs end-to-end locally (read methods only — the shim never fakes a signature).
// See https://github.com/DIG-Network/dig-sdk for the full API.
//
// @dignetwork/dig-sdk ships its own .d.ts types — ChiaProvider, ConnectOptions and
// WalletConnectOptions (the options the SDK's WalletConnectTransport consumes) are fully typed, so
// no `@types/*` package is needed for the SDK.

import { ChiaProvider, type ConnectOptions, type WalletConnectOptions } from "@dignetwork/dig-sdk";

// WalletConnect Cloud / Reown project id, read from the build-time env (see .env.example) and typed
// via src/vite-env.d.ts. When set, it enables the WalletConnect → Sage fallback for browsers without
// the injected DIG wallet. Get a free project id at https://cloud.reown.com (formerly WalletConnect
// Cloud).
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "";

/** Hooks for the connect flow (e.g. render the WalletConnect pairing URI as a QR / copy-link). */
export interface ConnectHooks {
  onUri?: (uri: string) => void;
}

/**
 * Connect a wallet. `mode: "auto"` prefers the injected DIG Browser wallet (window.chia) and falls
 * back to WalletConnect → Sage when a project id is configured. The SDK drives its
 * `WalletConnectTransport` under the hood (CHIP-0002 over the relay) — we never hand-roll WC.
 */
export async function connectWallet(hooks: ConnectHooks = {}): Promise<ChiaProvider> {
  // The typed WalletConnect options the SDK's WalletConnectTransport consumes (projectId + metadata
  // + the pairing-URI hook + the Chia chain). Only built when a project id is configured.
  const walletConnect: WalletConnectOptions | undefined = WALLETCONNECT_PROJECT_ID
    ? {
        projectId: WALLETCONNECT_PROJECT_ID,
        metadata: {
          name: "__DISPLAY_NAME__",
          description: "Built with create-dig-app + @dignetwork/dig-sdk",
          url: typeof window !== "undefined" ? window.location.origin : "https://example.on.dig.net",
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

/** True when the WalletConnect → Sage fallback is configured (a project id is set). */
export function isWalletConnectConfigured(): boolean {
  return Boolean(WALLETCONNECT_PROJECT_ID);
}
