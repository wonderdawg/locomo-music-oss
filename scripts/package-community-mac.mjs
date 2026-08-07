import { spawn } from "node:child_process";

const steps = [
  ["pnpm", ["run", "assets:manifest"]],
  ["pnpm", ["run", "licenses:runtime"]],
  ["pnpm", ["run", "licenses:electron"]],
  ["pnpm", ["run", "source:guard"]],
  ["pnpm", ["run", "build"]],
  [
    "pnpm",
    ["exec", "electron-builder", "--mac", "dir", "--arm64", "--publish", "never"],
  ],
  [process.execPath, ["scripts/finalize-community-mac-package.mjs"]],
  [process.execPath, ["scripts/verify-community-mac-package.mjs"]],
];

for (const [file, arguments_] of steps) {
  await run(file, arguments_);
}

async function run(file, arguments_) {
  console.log(`\n> ${file} ${arguments_.join(" ")}`);
  await new Promise((resolve, reject) => {
    const child = spawn(file, arguments_, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${file} failed${signal ? ` with signal ${signal}` : ` with exit code ${code ?? "unknown"}`}.`,
        ),
      );
    });
  });
}
