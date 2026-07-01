import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

// The SDK transitively loads the CHIP-0035 spend builder (@dignetwork/dig-sdk →
// chip35-dl-coin-wasm), a WebAssembly module with top-level await, so we enable the wasm +
// top-level-await plugins. Relative base so the built dapp works from any path on a
// *.on.dig.net subdomain (and chia://).
export default defineConfig({
  base: "./",
  plugins: [react(), wasm(), topLevelAwait()],
  build: { outDir: "dist" },
});
