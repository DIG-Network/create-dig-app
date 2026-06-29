import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built site works from any path on a *.on.dig.net subdomain (and chia://).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist" },
});
