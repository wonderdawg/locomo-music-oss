import { execFile } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const projectRoot = process.cwd();
const generatedDirectories = [
  "dist-electron",
  "dist-renderer",
  "node_modules",
  "release",
  "resources/audio-tools",
  "resources/licenses/electron",
  "resources/runtime-cpp-q8/bin",
];
const forbiddenExtensions = new Set([
  ".a",
  ".aac",
  ".aif",
  ".aiff",
  ".bin",
  ".bundle",
  ".ckpt",
  ".dll",
  ".dylib",
  ".exe",
  ".flac",
  ".gguf",
  ".m4a",
  ".mp3",
  ".node",
  ".o",
  ".ogg",
  ".onnx",
  ".opus",
  ".pt",
  ".pth",
  ".safetensors",
  ".so",
  ".tflite",
  ".wav",
  ".wave",
  ".wma",
]);
const machoMagic = new Set([
  "bebafeca",
  "bfbafeca",
  "cafebabe",
  "cafebabf",
  "cefaedfe",
  "cffaedfe",
  "feedface",
  "feedfacf",
]);
const requiredIgnoreRules = [
  "*.gguf",
  "*.safetensors",
  "*.ckpt",
  "*.pt",
  "*.pth",
  "*.onnx",
  "*.tflite",
  "**/models/**/*.bin",
  "**/weights/**/*.bin",
  "**/checkpoints/**/*.bin",
  "pytorch_model*.bin",
  "*.wav",
  "*.wave",
  "*.mp3",
  "*.m4a",
  "*.aac",
  "*.flac",
  "*.aif",
  "*.aiff",
  "*.ogg",
  "*.opus",
  "*.wma",
];

const requestedMode = readRequestedMode(process.argv.slice(2));
const runningInCI =
  process.env.GITHUB_ACTIONS === "true" ||
  Boolean(process.env.CI && process.env.CI !== "false");
const mode = await resolveMode(requestedMode);
if (runningInCI && mode !== "index") {
  throw new Error(
    "CI must run the public-source guard in Git index mode; projection fallback is disabled.",
  );
}

await verifyIgnoreRules();
const publicationFiles =
  mode === "index"
    ? await collectGitIndexFiles()
    : await collectProjectionFiles(projectRoot);
if (publicationFiles.length === 0) {
  throw new Error(`The ${mode} publication set is empty.`);
}

const violations = [];
for (const relativePath of publicationFiles) {
  if (isGeneratedPath(relativePath)) {
    violations.push(`tracked generated output: ${relativePath}`);
    continue;
  }
  if (
    forbiddenExtensions.has(
      path.posix.extname(relativePath).toLowerCase(),
    )
  ) {
    violations.push(`model, audio, or native artifact: ${relativePath}`);
    continue;
  }
  if (
    path.posix.extname(relativePath) === "" &&
    (await isMachO(relativePath, mode))
  ) {
    violations.push(`Mach-O native binary: ${relativePath}`);
  }
}
if (violations.length > 0) {
  throw new Error(
    `Public-source publication guard rejected ${mode} mode:\n${violations.join("\n")}`,
  );
}

if (mode === "index") {
  console.log(
    `Verified ${publicationFiles.length} files in Git index mode (exact tracked publication set).`,
  );
} else {
  console.log(
    `Verified ${publicationFiles.length} files in explicit standalone projection mode; configured generated-output directories were excluded.`,
  );
}

function readRequestedMode(arguments_) {
  if (arguments_.length === 0) return "auto";
  if (arguments_.length === 1 && arguments_[0] === "--index") return "index";
  if (arguments_.length === 1 && arguments_[0] === "--projection") {
    return "projection";
  }
  throw new Error(
    "usage: verify-public-source-boundary.mjs [--index|--projection]",
  );
}

async function resolveMode(requested) {
  if (requested !== "auto") return requested;
  if (runningInCI) return "index";
  return (await gitWorktreeRoot()) === undefined ? "projection" : "index";
}

async function verifyIgnoreRules() {
  const ignoreRules = new Set(
    (await readFile(path.join(projectRoot, ".gitignore"), "utf8"))
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
  const missingIgnoreRules = requiredIgnoreRules.filter(
    (rule) => !ignoreRules.has(rule),
  );
  if (missingIgnoreRules.length > 0) {
    throw new Error(
      `Missing public-history protection in .gitignore:\n${missingIgnoreRules.join("\n")}`,
    );
  }
}

async function collectGitIndexFiles() {
  const root = await gitWorktreeRoot();
  if (!root) {
    throw new Error(
      "Git index mode was requested, but no Git worktree/index is available.",
    );
  }
  if (path.resolve(root) !== path.resolve(projectRoot)) {
    throw new Error(
      `Git index mode must run at the publication root: expected ${projectRoot}, found ${root}.`,
    );
  }
  const { stdout } = await execute(
    "git",
    ["ls-files", "--cached", "--full-name", "-z"],
    { cwd: projectRoot, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(normalizePublicationPath)
    .sort();
}

async function collectProjectionFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = normalizePublicationPath(
      path.relative(projectRoot, absolutePath),
    );
    if (isGeneratedPath(relativePath) || relativePath === ".git") continue;
    if (entry.isDirectory()) {
      files.push(...(await collectProjectionFiles(absolutePath)));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

async function gitWorktreeRoot() {
  try {
    const { stdout } = await execute(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd: projectRoot, encoding: "utf8" },
    );
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function isMachO(relativePath, publicationMode) {
  let bytes;
  if (publicationMode === "index") {
    const { stdout } = await execute(
      "git",
      ["show", `:${relativePath}`],
      { cwd: projectRoot, encoding: "buffer", maxBuffer: 2 * 1024 * 1024 },
    );
    bytes = stdout;
  } else {
    const absolutePath = path.join(projectRoot, relativePath);
    const metadata = await lstat(absolutePath);
    if (metadata.isSymbolicLink()) return false;
    bytes = await readFile(absolutePath);
  }
  return (
    bytes.length >= 4 &&
    machoMagic.has(bytes.subarray(0, 4).toString("hex"))
  );
}

function isGeneratedPath(relativePath) {
  return generatedDirectories.some(
    (directory) =>
      relativePath === directory || relativePath.startsWith(`${directory}/`),
  );
}

function normalizePublicationPath(candidate) {
  const normalized = candidate.split(path.sep).join("/");
  if (
    normalized === "" ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Invalid publication path: ${candidate}`);
  }
  return normalized;
}
