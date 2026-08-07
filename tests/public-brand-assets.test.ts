import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const textExtensions = new Set([".css", ".html", ".ts", ".tsx"]);
const reservedAssetReference =
  /(?:locomo-(?:character|icon)|(?:assets|build)\/icon)\.(?:gif|icns|ico|jpe?g|png|svg|webp)/iu;

describe("public brand-asset boundary", () => {
  it("does not reference the official character or product icon", async () => {
    const roots = [
      path.join(projectRoot, "src", "renderer"),
      path.join(projectRoot, "package.json"),
    ];
    const references: string[] = [];

    for (const root of roots) {
      for (const file of await textFiles(root)) {
        if (reservedAssetReference.test(await readFile(file, "utf8"))) {
          references.push(path.relative(projectRoot, file));
        }
      }
    }

    expect(references).toEqual([]);
  });
});

async function textFiles(root: string): Promise<string[]> {
  if (path.extname(root)) return [root];

  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await textFiles(absolutePath)));
    } else if (entry.isFile() && textExtensions.has(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }
  return files;
}
