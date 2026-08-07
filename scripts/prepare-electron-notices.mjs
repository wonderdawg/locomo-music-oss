import { createRequire } from "node:module";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPackagePath = require.resolve("electron/package.json");
const electronRoot = path.dirname(electronPackagePath);
const electronPackage = JSON.parse(
  await readFile(electronPackagePath, "utf8"),
);

if (electronPackage.version !== "43.2.0") {
  throw new Error(
    `Expected Electron 43.2.0, found ${electronPackage.version ?? "unknown"}.`,
  );
}

let electronDist = path.join(electronRoot, "dist");
try {
  await stat(electronDist);
} catch {
  // Requiring Electron invokes its pinned, checksum-verified installer when the
  // distribution is absent. This is the same official payload used to run DEV.
  require("electron");
}

const destinationRoot = path.resolve("resources/licenses/electron");
await mkdir(destinationRoot, { recursive: true });

for (const [sourceName, destinationName] of [
  ["LICENSE", "Electron-LICENSE.txt"],
  ["LICENSES.chromium.html", "Chromium-LICENSES.html"],
]) {
  const source = path.join(electronDist, sourceName);
  const metadata = await stat(source);
  if (!metadata.isFile() || metadata.size === 0) {
    throw new Error(`Electron notice is missing or empty: ${sourceName}`);
  }
  await copyFile(source, path.join(destinationRoot, destinationName));
}

console.log(`Prepared Electron ${electronPackage.version} redistribution notices.`);
