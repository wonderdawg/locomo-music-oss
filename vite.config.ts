import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  root: fileURLToPath(new URL("./src/renderer", import.meta.url)),
  base: "./",
  plugins: [solid(), tailwindcss()],
  build: {
    emptyOutDir: true,
    outDir: fileURLToPath(new URL("./dist-renderer", import.meta.url)),
  },
});
