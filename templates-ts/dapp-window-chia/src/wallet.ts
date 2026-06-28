// Wallet wiring via @dignetwork/dig-sdk (typed).
//
// ChiaProvider gives this dapp a Chia wallet for free: it PREFERS the injected DIG Browser wallet
// (window.chia) and falls back to WalletConnect → Sage. In `digstore dev` an injected dev-shim
// window.chia is present, so this path runs end-to-end locally (read methods only — the shim never
// fakes a signature). See https://github.com/DIG-Network/dig-sdk for the full API.
//
// @dignetwork/dig-sdk ships its own .d.ts types — ChiaProvider and ConnectOptions are fully typed,
// so no `@types/*` package is needed for the SDK.

import { ChiaProvider, type ConnectOptions } from "@dignetwork/dig-sdk";

/** Hooks for the connect flow (e.g. render the WalletConnect pairing URI as a QR / copy-link). */
export interface ConnectHooks {
  onUri?: (uri: string) => void;
}

/**
 * Connect a wallet. `mode: "auto"` prefers the injected DIG Browser wallet and falls back to
 * WalletConnect when configured. Set a WalletConnect Cloud project id to enable the fallback.
 */
export async function connectWallet(hooks: ConnectHooks = {}): Promise<ChiaProvider> {
  // To enable the WalletConnect → Sage fallback (for browsers without the injected DIG wallet),
  // create a project id at https://cloud.walletconnect.com and set it here.
  const WALLETCONNECT_PROJECT_ID = "";

  const options: ConnectOptions = {
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
  };
  return ChiaProvider.connect(options);
}
