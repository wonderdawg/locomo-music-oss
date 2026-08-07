import { mkdir } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";

const projectRoot = process.cwd();
const outputDirectory = path.join(projectRoot, "dist-electron");

await mkdir(outputDirectory, { recursive: true });

const sharedOptions = {
  bundle: true,
  external: ["electron"],
  logLevel: "info",
  minify: false,
  platform: "node",
  sourcemap: true,
  target: "node22",
};

await Promise.all([
  build({
    ...sharedOptions,
    entryPoints: [path.join(projectRoot, "src/main/main.ts")],
    outfile: path.join(outputDirectory, "main.cjs"),
    format: "cjs",
  }),
  build({
    ...sharedOptions,
    entryPoints: [path.join(projectRoot, "src/preload/preload.ts")],
    outfile: path.join(outputDirectory, "preload.cjs"),
    format: "cjs",
  }),
]);
