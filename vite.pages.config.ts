import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const base = process.env.PAGES_BASE_PATH ?? "/SuzhouMap/";
if (!/^\/(?:[\w.-]+\/)*$/.test(base)) throw new Error("Invalid PAGES_BASE_PATH");

export default defineConfig({
  root: fileURLToPath(new URL("./static-site/", import.meta.url)),
  base,
  publicDir: false,
  plugins: [react()],
  define: {
    __GUSU_BASE_PATH__: JSON.stringify(base),
    __GUSU_COMPRESSED_DATA__: "true",
  },
  build: { outDir: fileURLToPath(new URL("./out/", import.meta.url)), emptyOutDir: true },
});
