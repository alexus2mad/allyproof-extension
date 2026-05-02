import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { crx } from "@crxjs/vite-plugin";
import path from "node:path";
import manifest from "./src/manifest";

/**
 * Vite + crxjs build for the AllyProof MV3 extension.
 *
 * crxjs handles the Manifest V3 plumbing — it rewrites the manifest's
 * referenced files to their built equivalents, bundles the service
 * worker as ESM, and emits a directory we can `chrome://extensions
 * → Load unpacked` against during dev.
 *
 * Tailwind v4 plugs in via the official Vite plugin (CSS-first
 * config; the OKLch tokens live in src/styles/globals.css).
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // crxjs needs a stable websocket port for HMR — explicit value
    // beats the rotating default that breaks reload after the first
    // crash.
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      // crxjs only walks HTML files referenced from the manifest. The
      // DevTools panel HTML is referenced as a string inside
      // src/devtools/register.ts (chrome.devtools.panels.create), which
      // crxjs can't statically analyse — so we add it as an explicit
      // additional input here. Without this, dist/src/devtools/panel.html
      // is missing and the DevTools panel silently fails to load.
      input: {
        "devtools-panel": path.resolve(__dirname, "src/devtools/panel.html"),
      },
    },
  },
});
