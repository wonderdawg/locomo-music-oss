import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const minimumSystemVersion = "15.0";
const source = path.join(
  projectRoot,
  "native",
  "aac-encoder",
  "main.swift",
);
const outputDirectory = path.join(
  projectRoot,
  "resources",
  "audio-tools",
);
const output = path.join(outputDirectory, "locomo-aac-encoder");

await mkdir(outputDirectory, { recursive: true });
await run("xcrun", [
  "swiftc",
  "-O",
  "-parse-as-library",
  "-target",
  `arm64-apple-macosx${minimumSystemVersion}`,
  "-framework",
  "AVFoundation",
  "-framework",
  "AudioToolbox",
  "-framework",
  "Foundation",
  source,
  "-o",
  output,
]);

const fileDescription = await run("file", [output], true);
if (!fileDescription.includes("Mach-O 64-bit executable arm64")) {
  throw new Error(`Unexpected AAC helper architecture: ${fileDescription}`);
}
const buildDescription = await run(
  "xcrun",
  ["vtool", "-show-build", output],
  true,
);
if (
  !/platform\s+MACOS/u.test(buildDescription) ||
  !new RegExp(`minos\\s+${minimumSystemVersion.replace(".", "\\.")}`, "u").test(
    buildDescription,
  )
) {
  throw new Error(`Unexpected AAC helper build target:\n${buildDescription}`);
}
console.log(
  `Verified native AAC helper: arm64, macOS ${minimumSystemVersion}.`,
);

async function run(file, arguments_, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, arguments_, {
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(
          `${file} exited with code ${code ?? "unknown"}.${stderr ? `\n${stderr}` : ""}`,
        ),
      );
    });
  });
}
