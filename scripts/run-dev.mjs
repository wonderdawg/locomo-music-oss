import { spawn } from "node:child_process";
import path from "node:path";

const projectRoot = process.cwd();
const rendererUrl = "http://127.0.0.1:5173";
const appFlags = process.argv
  .slice(2)
  .filter((argument) =>
    ["--review-song", "--setup-runtime", "--smoke-test"].includes(argument),
  );
const executableSuffix = process.platform === "win32" ? ".cmd" : "";
const viteExecutable = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  `vite${executableSuffix}`,
);
const electronExecutable = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  `electron${executableSuffix}`,
);

const rendererProcess = spawn(
  viteExecutable,
  ["--host", "127.0.0.1", "--port", "5173", "--strictPort"],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  },
);

let appProcess;
let isStopping = false;

function stopChildren(signal = "SIGTERM") {
  if (isStopping) {
    return;
  }

  isStopping = true;
  appProcess?.kill(signal);
  rendererProcess.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopChildren(signal);
  });
}

async function waitForRenderer() {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (rendererProcess.exitCode !== null) {
      throw new Error(
        `Renderer process exited before becoming ready (${rendererProcess.exitCode}).`,
      );
    }

    try {
      const response = await fetch(rendererUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // The development server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for the renderer development server.");
}

try {
  await waitForRenderer();

  const appArguments = [".", ...appFlags];
  appProcess = spawn(electronExecutable, appArguments, {
    cwd: projectRoot,
    env: {
      ...process.env,
      LOCOMO_MUSIC_RENDERER_URL: rendererUrl,
    },
    stdio: "inherit",
  });

  const exitCode = await new Promise((resolve) => {
    appProcess.once("exit", (code) => resolve(code ?? 1));
  });

  stopChildren();
  process.exitCode = exitCode;
} catch (error) {
  stopChildren();
  console.error(error);
  process.exitCode = 1;
}
