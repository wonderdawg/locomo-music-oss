import { rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const generatedDirectories = [
  "dist-electron",
  "dist-renderer",
  "release",
];

await Promise.all(
  generatedDirectories.map((directory) =>
    rm(path.join(projectRoot, directory), { force: true, recursive: true }),
  ),
);
