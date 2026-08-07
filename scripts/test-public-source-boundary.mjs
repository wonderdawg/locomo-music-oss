import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const projectRoot = process.cwd();
const temporaryRoot = await mkdtemp(
  path.join(tmpdir(), "locomo-public-boundary-test-"),
);
const gitDirectory = path.join(temporaryRoot, "publication.git");
const indexPath = path.join(temporaryRoot, "publication.index");
const syntheticMachO = path.join(temporaryRoot, "synthetic-mach-o");
const gitEnvironment = {
  ...process.env,
  GIT_DIR: gitDirectory,
  GIT_INDEX_FILE: indexPath,
  GIT_WORK_TREE: projectRoot,
};

try {
  await run("git", ["init", "--bare", gitDirectory]);
  await run("git", ["read-tree", "--empty"], { env: gitEnvironment });
  await run("git", ["add", "--all", "--", "."], {
    cwd: projectRoot,
    env: gitEnvironment,
  });

  const staged = await run("git", ["ls-files", "--cached", "-z"], {
    cwd: projectRoot,
    env: gitEnvironment,
  });
  const stagedPaths = staged.stdout.split("\0").filter(Boolean);
  const generatedPath = stagedPaths.find(
    (candidate) =>
      candidate.startsWith("resources/audio-tools/") ||
      candidate.startsWith("resources/runtime-cpp-q8/bin/"),
  );
  if (generatedPath) {
    throw new Error(
      `A normal staged publication included ignored output: ${generatedPath}`,
    );
  }
  const cleanGuard = await run(
    process.execPath,
    ["scripts/verify-public-source-boundary.mjs", "--index"],
    { cwd: projectRoot, env: gitEnvironment },
  );
  if (!cleanGuard.stdout.includes("Git index mode")) {
    throw new Error(
      "The clean publication proof did not run in Git index mode.",
    );
  }

  await writeFile(
    syntheticMachO,
    Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x00, 0x00, 0x00, 0x00]),
  );
  const blob = await run("git", ["hash-object", "-w", syntheticMachO], {
    env: gitEnvironment,
  });
  const blobID = blob.stdout.trim();
  const generatedHelperPath =
    "resources/audio-tools/locomo-aac-encoder";
  await run(
    "git",
    [
      "update-index",
      "--add",
      "--cacheinfo",
      `100755,${blobID},${generatedHelperPath}`,
    ],
    { cwd: projectRoot, env: gitEnvironment },
  );
  const forcedGenerated = await runAllowFailure(
    process.execPath,
    ["scripts/verify-public-source-boundary.mjs", "--index"],
    { cwd: projectRoot, env: gitEnvironment },
  );
  if (
    forcedGenerated.code === 0 ||
    !forcedGenerated.stderr.includes(
      `tracked generated output: ${generatedHelperPath}`,
    )
  ) {
    throw new Error(
      "The Git-index guard did not reject a force-added generated native helper.",
    );
  }

  await run(
    "git",
    ["update-index", "--force-remove", "--", generatedHelperPath],
    {
      cwd: projectRoot,
      env: gitEnvironment,
    },
  );
  const extensionlessHelperPath = "fixtures/synthetic-community-helper";
  await run(
    "git",
    [
      "update-index",
      "--add",
      "--cacheinfo",
      `100755,${blobID},${extensionlessHelperPath}`,
    ],
    { cwd: projectRoot, env: gitEnvironment },
  );
  const forcedMachO = await runAllowFailure(
    process.execPath,
    ["scripts/verify-public-source-boundary.mjs", "--index"],
    { cwd: projectRoot, env: gitEnvironment },
  );
  if (
    forcedMachO.code === 0 ||
    !forcedMachO.stderr.includes(
      `Mach-O native binary: ${extensionlessHelperPath}`,
    )
  ) {
    throw new Error(
      "The Git-index guard did not reject an extensionless Mach-O fixture.",
    );
  }

  console.log(
    `Public-source guard self-test passed: ${stagedPaths.length} normally staged files accepted; forced generated helper and extensionless Mach-O rejected.`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}

async function run(file, arguments_, options = {}) {
  const result = await runAllowFailure(file, arguments_, options);
  if (result.code !== 0) {
    throw new Error(
      `${file} ${arguments_.join(" ")} failed with exit code ${result.code}.\n${result.stderr}`,
    );
  }
  return result;
}

async function runAllowFailure(file, arguments_, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, arguments_, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${file} exited with signal ${signal}.`));
        return;
      }
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}
