import { createHash } from "node:crypto";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CppRuntimeSetupService,
  downloadResumableFile,
} from "../src/main/cpp-runtime-setup";
import type { NativeCodeLocations } from "../src/main/native-code-paths";
import {
  CPP_Q8_RUNTIME_MANIFEST,
  type CppRuntimeManifest,
} from "../src/main/cpp-runtime-manifest";

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(
    path.join(tmpdir(), "locomo-cpp-setup-test-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

async function createNativeFixture(
  root: string,
  libraryCount = 5,
): Promise<NativeCodeLocations> {
  const aceRoot = path.join(root, "bundle", "LocomoACE");
  const aceServer = path.join(aceRoot, "ace-server");
  const aacEncoder = path.join(root, "bundle", "locomo-aac-encoder");
  const aceLibraries = Array.from(
    { length: libraryCount },
    (_value, index) => path.join(aceRoot, `lib-${index}.dylib`),
  );
  await mkdir(aceRoot, { recursive: true });
  await Promise.all([
    writeFile(aceServer, "bundled ace"),
    writeFile(aacEncoder, "bundled aac"),
    ...aceLibraries.map((candidate) =>
      writeFile(candidate, "bundled library"),
    ),
  ]);
  await Promise.all(
    [aceServer, aacEncoder, ...aceLibraries].map((candidate) =>
      chmod(candidate, 0o755),
    ),
  );
  return { aacEncoder, aceLibraries, aceRoot, aceServer };
}

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function createTinyManifest(): {
  readonly manifest: CppRuntimeManifest;
  readonly modelBytes: ReadonlyMap<string, Buffer>;
} {
  const modelBytes = new Map([
    ["planner.gguf", Buffer.from("tiny planner model")],
    ["synth.gguf", Buffer.from("tiny synthesis model")],
  ]);
  return {
    manifest: {
      ...CPP_Q8_RUNTIME_MANIFEST,
      minimumFreeBytes: 128,
      estimatedInstalledBytes: 128,
      helper: {
        ...CPP_Q8_RUNTIME_MANIFEST.helper,
        files: [
          {
            fileName: "ace-server",
            executable: true,
          },
          {
            fileName: "lib-test.dylib",
            executable: true,
          },
        ],
      },
      models: {
        repository: "Locomo/test-models",
        revision: "immutable-test-revision",
        files: [...modelBytes].map(([fileName, bytes], index) => ({
          fileName,
          role: index === 0 ? "language-planner" : "xl-turbo-dit",
          quantization: "TEST",
          bytes: bytes.length,
          sha256: digest(bytes),
        })),
      },
    },
    modelBytes,
  };
}

async function writeModelSet(
  root: string,
  modelBytes: ReadonlyMap<string, Buffer>,
): Promise<void> {
  await mkdir(root, { recursive: true });
  await Promise.all(
    [...modelBytes].map(([fileName, bytes]) =>
      writeFile(path.join(root, fileName), bytes),
    ),
  );
}

async function waitForTerminalStatus(service: CppRuntimeSetupService) {
  let status = await service.getStatus();
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (!status.running && (status.ready || status.phase === "error")) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
    status = await service.getStatus();
  }
  return status;
}

function oversizedStreamingResponse(
  firstChunk: readonly number[],
  status = 200,
): {
  readonly chunksBeforeCompletion: number;
  readonly response: Response;
  readonly state: { cancelled: boolean; pulls: number };
} {
  const chunksBeforeCompletion = 128;
  const state = { cancelled: false, pulls: 0 };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(firstChunk));
    },
    pull(controller) {
      state.pulls += 1;
      if (state.pulls === chunksBeforeCompletion) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array([0]));
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return {
    chunksBeforeCompletion,
    response: new Response(body, { status }),
    state,
  };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) =>
        rm(directory, { force: true, recursive: true }),
      ),
  );
});

describe("C++ runtime preflight and download resume", () => {
  it("reports exact low-disk space and performs no network transfer", async () => {
    const root = await temporaryDirectory();
    const fetcher = vi.fn(async () => {
      throw new Error("network must not start");
    });
    vi.stubGlobal("fetch", fetcher);
    const nativeCode = await createNativeFixture(root);
    const service = new CppRuntimeSetupService({
      architecture: "arm64",
      availableDiskBytes: async () => 4 * 1024 ** 3,
      nativeCode,
      platform: "darwin",
      resourcesRoot: path.join(process.cwd(), "resources", "runtime-cpp-q8"),
      runtimeRoot: path.join(root, "runtime-cpp-q8"),
    });

    await service.start();
    let status = await service.getStatus();
    for (let attempt = 0; attempt < 20 && status.phase !== "error"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      status = await service.getStatus();
    }

    expect(status).toMatchObject({
      phase: "error",
      ready: false,
      running: false,
      downloadedBytes: 0,
      downloadTotalBytes: 10_884_718_272,
      errorCode: "insufficient-disk",
      error: "C++ Q8 setup needs 16.0 GB free; 4.0 GB is available.",
      freeBytes: 4 * 1024 ** 3,
      requiredBytes: 16 * 1024 ** 3,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts an ordinary exact-size initial response", async () => {
    const root = await temporaryDirectory();
    const destination = path.join(root, "models", "tiny.gguf");
    await mkdir(path.dirname(destination), { recursive: true });
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("range")).toBeNull();
      return new Response(new Uint8Array([1, 2, 3]));
    });
    const progress: number[] = [];

    await downloadResumableFile({
      destination,
      expectedBytes: 3,
      fetcher,
      onProgress: (bytes) => progress.push(bytes),
      url: "https://example.invalid/tiny.gguf",
    });

    expect([...(await readFile(destination))]).toEqual([1, 2, 3]);
    expect(progress.at(0)).toBe(0);
    expect(progress.at(-1)).toBe(3);
    await expect(stat(`${destination}.partial`)).rejects.toThrow();
  });

  it("aborts an oversized initial response immediately and removes its partial", async () => {
    const root = await temporaryDirectory();
    const destination = path.join(root, "models", "tiny.gguf");
    await mkdir(path.dirname(destination), { recursive: true });
    const streamed = oversizedStreamingResponse([1, 2]);
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("range")).toBeNull();
      return streamed.response;
    });
    const progress: number[] = [];

    await expect(
      downloadResumableFile({
        destination,
        expectedBytes: 3,
        fetcher,
        onProgress: (bytes) => progress.push(bytes),
        url: "https://example.invalid/tiny.gguf",
      }),
    ).rejects.toThrow("expected 3, received at least 4");

    expect(streamed.state.cancelled).toBe(true);
    expect(streamed.state.pulls).toBeLessThan(
      streamed.chunksBeforeCompletion,
    );
    expect(Math.max(...progress)).toBeLessThanOrEqual(3);
    await expect(stat(`${destination}.partial`)).rejects.toThrow();
    await expect(stat(destination)).rejects.toThrow();
  });

  it("counts resumed bytes when aborting an overrun and retries from clean state", async () => {
    const root = await temporaryDirectory();
    const destination = path.join(root, "models", "tiny.gguf");
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(`${destination}.partial`, new Uint8Array([1, 2, 3]));
    const streamed = oversizedStreamingResponse([4, 5], 206);
    const firstFetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("range")).toBe("bytes=3-");
      return streamed.response;
    });
    const progress: number[] = [];

    await expect(
      downloadResumableFile({
        destination,
        expectedBytes: 6,
        fetcher: firstFetch,
        onProgress: (bytes) => progress.push(bytes),
        url: "https://example.invalid/tiny.gguf",
      }),
    ).rejects.toThrow("expected 6, received at least 7");

    expect(streamed.state.cancelled).toBe(true);
    expect(streamed.state.pulls).toBeLessThan(
      streamed.chunksBeforeCompletion,
    );
    expect(Math.max(...progress)).toBeLessThanOrEqual(6);
    await expect(stat(`${destination}.partial`)).rejects.toThrow();

    const retryFetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("range")).toBeNull();
      return new Response(new Uint8Array([1, 2, 3, 4, 5, 6]));
    });
    await downloadResumableFile({
      destination,
      expectedBytes: 6,
      fetcher: retryFetch,
      url: "https://example.invalid/tiny.gguf",
    });

    expect([...(await readFile(destination))]).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it("keeps a valid partial and resumes it with an HTTP Range request", async () => {
    const root = await temporaryDirectory();
    const destination = path.join(root, "models", "tiny.gguf");
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(`${destination}.partial`, new Uint8Array([1, 2, 3]));
    const firstFetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("range")).toBe("bytes=3-");
      return new Response(new Uint8Array([4, 5]), { status: 206 });
    });
    const firstProgress: number[] = [];

    await expect(
      downloadResumableFile({
        destination,
        expectedBytes: 6,
        fetcher: firstFetch,
        onProgress: (bytes) => firstProgress.push(bytes),
        url: "https://example.invalid/tiny.gguf",
      }),
    ).rejects.toThrow("expected 6, received 5");
    await expect(stat(`${destination}.partial`)).resolves.toMatchObject({
      size: 5,
    });
    expect(firstProgress.at(0)).toBe(3);
    expect(firstProgress.at(-1)).toBe(5);

    const resumedFetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("range")).toBe("bytes=5-");
      return new Response(new Uint8Array([6]), { status: 206 });
    });
    const resumedProgress: number[] = [];
    await downloadResumableFile({
      destination,
      expectedBytes: 6,
      fetcher: resumedFetch,
      onProgress: (bytes) => resumedProgress.push(bytes),
      url: "https://example.invalid/tiny.gguf",
    });

    expect([...await readFile(destination)]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(resumedProgress.at(0)).toBe(5);
    expect(resumedProgress.at(-1)).toBe(6);
    await expect(stat(`${destination}.partial`)).rejects.toThrow();
  });
});

describe("bundled C++ code and model-only installation proof", () => {
  it("migrates legacy copied-code installs, ignores stale helpers, and hashes models once", async () => {
    const root = await temporaryDirectory();
    const runtimeRoot = path.join(root, "runtime-cpp-q8");
    const modelsRoot = path.join(runtimeRoot, "models");
    const { manifest, modelBytes } = createTinyManifest();
    const nativeCode = await createNativeFixture(root, 1);
    await writeModelSet(modelsRoot, modelBytes);
    await mkdir(path.join(runtimeRoot, "bin"), { recursive: true });
    await writeFile(
      path.join(runtimeRoot, "bin", "ace-server"),
      "tampered stale copied helper that must remain inert",
    );
    await writeFile(
      path.join(runtimeRoot, "install-record.json"),
      JSON.stringify({
        architecture: "arm64",
        createdAt: "2026-01-01T00:00:00.000Z",
        helper: [{ fileName: "ace-server", sha256: "legacy" }],
        manifestSha256: "legacy-pre-sign-manifest",
        models: manifest.models.files,
        modelRevision: manifest.models.revision,
      }),
    );
    const hashedPaths: string[] = [];
    const service = new CppRuntimeSetupService({
      availableDiskBytes: async () => 10 * 1024 ** 3,
      hashFile: async (candidate) => {
        hashedPaths.push(candidate);
        return digest(await readFile(candidate));
      },
      manifest,
      nativeCode,
      resourcesRoot: path.join(process.cwd(), "resources", "runtime-cpp-q8"),
      runtimeRoot,
    });

    await expect(service.getStatus()).resolves.toMatchObject({
      phase: "ready",
      ready: true,
    });
    await service.assertReady();
    await service.assertReady();

    const record = JSON.parse(
      await readFile(path.join(runtimeRoot, "install-record.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(record).toMatchObject({
      schemaVersion: 2,
      modelRevision: manifest.models.revision,
    });
    expect(record).not.toHaveProperty("helper");
    expect(record).not.toHaveProperty("sourceRevision");
    expect(
      hashedPaths.filter((candidate) =>
        candidate.startsWith(`${modelsRoot}${path.sep}`),
      ),
    ).toHaveLength(manifest.models.files.length);
    await expect(
      readFile(path.join(runtimeRoot, "bin", "ace-server"), "utf8"),
    ).resolves.toContain("tampered stale copied helper");
  });

  it("installs fresh models with bundled code and never copies native artifacts into mutable storage", async () => {
    const root = await temporaryDirectory();
    const runtimeRoot = path.join(root, "runtime-cpp-q8");
    const importRoot = path.join(root, "model-import");
    const { manifest, modelBytes } = createTinyManifest();
    const nativeCode = await createNativeFixture(root, 1);
    await writeModelSet(importRoot, modelBytes);
    const fetcher = vi.fn(async () => {
      throw new Error("valid imported models must not use the network");
    });
    vi.stubGlobal("fetch", fetcher);
    const service = new CppRuntimeSetupService({
      architecture: "arm64",
      availableDiskBytes: async () => 10 * 1024 ** 3,
      environment: {
        LOCOMO_MUSIC_CPP_Q8_IMPORT_MODELS: importRoot,
      },
      manifest,
      nativeCode,
      platform: "darwin",
      resourcesRoot: path.join(process.cwd(), "resources", "runtime-cpp-q8"),
      runtimeRoot,
    });

    await expect(service.getStatus()).resolves.toMatchObject({
      phase: "not-installed",
      ready: false,
    });
    await service.start();
    await expect(waitForTerminalStatus(service)).resolves.toMatchObject({
      phase: "ready",
      ready: true,
    });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(stat(path.join(runtimeRoot, "bin"))).rejects.toThrow();
    await expect(stat(path.join(runtimeRoot, "provenance"))).rejects.toThrow();
    for (const [fileName, bytes] of modelBytes) {
      await expect(
        readFile(path.join(runtimeRoot, "models", fileName)),
      ).resolves.toEqual(bytes);
    }
  });

  it("rejects a tampered model and repairs only that model from the pinned source", async () => {
    const root = await temporaryDirectory();
    const runtimeRoot = path.join(root, "runtime-cpp-q8");
    const modelsRoot = path.join(runtimeRoot, "models");
    const importRoot = path.join(root, "model-import");
    const { manifest, modelBytes } = createTinyManifest();
    const nativeCode = await createNativeFixture(root, 1);
    await writeModelSet(modelsRoot, modelBytes);
    await writeModelSet(importRoot, modelBytes);
    const tamperedName = manifest.models.files[0]!.fileName;
    await writeFile(
      path.join(modelsRoot, tamperedName),
      Buffer.alloc(manifest.models.files[0]!.bytes, 0x78),
    );
    const service = new CppRuntimeSetupService({
      architecture: "arm64",
      availableDiskBytes: async () => 10 * 1024 ** 3,
      environment: {
        LOCOMO_MUSIC_CPP_Q8_IMPORT_MODELS: importRoot,
      },
      manifest,
      nativeCode,
      platform: "darwin",
      resourcesRoot: path.join(process.cwd(), "resources", "runtime-cpp-q8"),
      runtimeRoot,
    });

    await expect(service.getStatus()).resolves.toMatchObject({
      phase: "not-installed",
      ready: false,
    });
    await service.start();
    await expect(waitForTerminalStatus(service)).resolves.toMatchObject({
      phase: "ready",
      ready: true,
    });
    await expect(
      readFile(path.join(modelsRoot, tamperedName)),
    ).resolves.toEqual(modelBytes.get(tamperedName));
  });
});
