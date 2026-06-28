// Wallet wiring via @dignetwork/dig-sdk.
//
// ChiaProvider gives this dapp a Chia wallet for free: it PREFERS the injected DIG Browser wallet
// (window.chia) and falls back to WalletConnect → Sage (the main Chia wallet) so the dapp connects
// in a normal browser too. In `digstore dev` an injected dev-shim window.chia is present, so the
// connect/read path runs end-to-end locally (read methods only — the shim never fakes a signature).
// See https://github.com/DIG-Network/dig-sdk for the full API.

import { ChiaProvider } from "@dignetwork/dig-sdk";

// WalletConnect Cloud / Reown project id, read from the build-time env (see .env.example). When set,
// it enables the WalletConnect → Sage fallback for browsers without the injected DIG wallet. Get a
// free project id at https://cloud.reown.com (formerly WalletConnect Cloud).
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "";

/**
 * Connect a wallet. `mode: "auto"` prefers the injected DIG Browser wallet (window.chia) and falls
 * back to WalletConnect → Sage when a project id is configured. The SDK drives its
 * `WalletConnectTransport` under the hood (CHIP-0002 over the relay) — we never hand-roll WC.
 *
 * @param {{ onUri?: (uri: string) => void }} [hooks] `onUri` receives the WalletConnect pairing URI
 *   so the UI can render a QR / copy-link / deep link to Sage during the fallback.
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
            description: "Built with create-dig-app + @dignetwork/dig-sdk",
            url: typeof window !== "undefined" ? window.location.origin : "https://example.dig",
            icons: [],
          },
          onUri: hooks.onUri, // render this URI as a QR / copy-link for the Sage fallback
        }
      : undefined,
  });
}

/** True when the WalletConnect → Sage fallback is configured (a project id is set). */
export function isWalletConnectConfigured() {
  return Boolean(WALLETCONNECT_PROJECT_ID);
}
