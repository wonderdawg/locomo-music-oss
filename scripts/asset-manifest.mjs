import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const manifestPath = path.join(projectRoot, "ASSET_MANIFEST.json");
const assetDirectories = [
  "src/renderer/public/assets/station-masks",
  "src/renderer/public/assets/stations",
  "src/renderer/public/assets/stations-dark",
];

const files = [];
for (const directory of assetDirectories) {
  for (const fileName of (await readdir(path.join(projectRoot, directory))).sort()) {
    const relativePath = `${directory}/${fileName}`;
    const absolutePath = path.join(projectRoot, relativePath);
    const metadata = await stat(absolutePath);
    if (!metadata.isFile()) {
      throw new Error(`Unexpected non-file asset: ${relativePath}`);
    }
    const bytes = await readFile(absolutePath);
    files.push({
      bytes: metadata.size,
      path: relativePath,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
}

const expected = {
  schemaVersion: 1,
  copyrightHolder: "Immortal Company, Inc.",
  license: "CC0-1.0",
  files,
};
const serialized = `${JSON.stringify(expected, null, 2)}\n`;

if (process.argv.includes("--write")) {
  await writeFile(manifestPath, serialized, "utf8");
  console.log(`Wrote ${files.length} assets to ASSET_MANIFEST.json.`);
} else {
  const current = await readFile(manifestPath, "utf8");
  if (current !== serialized) {
    throw new Error(
      "ASSET_MANIFEST.json does not match the exact station artwork bytes.",
    );
  }
  console.log(`Verified ${files.length} CC0 station assets.`);
}
