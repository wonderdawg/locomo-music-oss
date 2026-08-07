import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const storeRoot = path.join(projectRoot, "node_modules", ".pnpm");
const outputPath = path.join(
  projectRoot,
  "resources",
  "licenses",
  "JS_RUNTIME_LICENSES.txt",
);
const packages = [
  ["lucide-solid", "1.25.0"],
  ["solid-js", "1.9.14"],
  ["csstype", "3.2.3"],
  ["seroval", "1.5.6"],
  ["seroval-plugins", "1.5.6"],
];
const storeEntries = await readdir(storeRoot);
const sections = [];

for (const [name, version] of packages) {
  const prefix = `${name}@${version}`;
  const entry = storeEntries.find(
    (candidate) => candidate === prefix || candidate.startsWith(`${prefix}_`),
  );
  if (!entry) throw new Error(`Missing installed package ${name}@${version}.`);
  const packageRoot = path.join(storeRoot, entry, "node_modules", name);
  const metadata = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  if (metadata.name !== name || metadata.version !== version) {
    throw new Error(`Resolved the wrong package for ${name}@${version}.`);
  }
  const license = await readFile(path.join(packageRoot, "LICENSE"), "utf8");
  sections.push(
    `${name}@${version}\n${"=".repeat(name.length + version.length + 1)}\n\n${license.trim()}`,
  );
}

const expected = `${sections.join("\n\n")}\n`;
if (process.argv.includes("--write")) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, expected, "utf8");
  console.log(`Wrote notices for ${packages.length} runtime packages.`);
} else {
  const current = await readFile(outputPath, "utf8");
  if (current !== expected) {
    throw new Error(
      "resources/licenses/JS_RUNTIME_LICENSES.txt is out of date.",
    );
  }
  console.log(`Verified notices for ${packages.length} runtime packages.`);
}
