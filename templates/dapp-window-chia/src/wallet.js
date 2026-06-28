// Wallet wiring via @dignetwork/dig-sdk.
//
// ChiaProvider gives this dapp a Chia wallet for free: it PREFERS the injected DIG Browser wallet
// (window.chia) and falls back to WalletConnect → Sage. In `digstore dev` an injected dev-shim
// window.chia is present, so this path runs end-to-end locally (read methods only — the shim never
// fakes a signature). See https://github.com/DIG-Network/dig-sdk for the full API.

import { ChiaProvider } from "@dignetwork/dig-sdk";

/**
 * Connect a wallet. `mode: "auto"` prefers the injected DIG Browser wallet and falls back to
 * WalletConnect when configured. Set a WalletConnect Cloud project id to enable the fallback.
 *
 * @param {{ onUri?: (uri: string) => void }} [hooks]
 * @returns {Promise<import("@dignetwork/dig-sdk").ChiaProvider>}
 */
export async function connectWallet(hooks = {}) {
  // To enable the WalletConnect → Sage fallback (for browsers without the injected DIG wallet),
  // create a project id at https://cloud.walletconnect.com and set it here.
  const WALLETCONNECT_PROJECT_ID = "";

  return ChiaProvider.connect({
    mode: "auto", // prefer injected window.chia; fall back to WalletConnect if configured
    walletConnect: WALLETCONNECT_PROJECT_ID
      ? {
          projectId: WALLETCONNECT_PROJECT_ID,
          metadata: {
            name: "__DISPLAY_NAME__",
            description: "Built with create-dig-app + @dignetwork/dig-sdk",
            url: typeof window !== "undefined" ? window.location.origin : "https://example.dig",
            icons: [],
          },
          onUri: hooks.onUri, // render this URI as a QR / copy-link for the fallback
        }
      : undefined,
  });
}
