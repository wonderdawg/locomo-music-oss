import { createHash } from "node:crypto";
import {
  constants as fsConstants,
  createReadStream,
  createWriteStream,
} from "node:fs";
import {
  access,
  appendFile,
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  statfs,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import type {
  RuntimeSetupStatus,
} from "../shared/app-contract";
import {
  assertCppRuntimePathContainment,
  cppModelManifestFingerprintInput,
  cppModelDownloadUrl,
  CPP_Q8_RUNTIME_MANIFEST,
  resolveCppRuntimeLocations,
  type CppRuntimeManifest,
  type CppRuntimeLocations,
} from "./cpp-runtime-manifest";
import type { NativeCodeLocations } from "./native-code-paths";

const SETUP_STEP_COUNT = 3;
const minimumResumeHeadroom = 5 * 1024 ** 3;
const MODEL_DOWNLOAD_TOTAL_BYTES =
  CPP_Q8_RUNTIME_MANIFEST.models.files.reduce(
    (total, file) => total + file.bytes,
    0,
  );

class InsufficientDiskSpaceError extends Error {
  constructor(
    readonly requiredBytes: number,
    readonly freeBytes: number,
  ) {
    super(
      `C++ Q8 setup needs ${formatGigabytes(requiredBytes)} free; ${formatGigabytes(freeBytes)} is available.`,
    );
    this.name = "InsufficientDiskSpaceError";
  }
}

interface CppInstallRecordV2 {
  readonly schemaVersion: 2;
  readonly createdAt: string;
  readonly modelManifestSha256: string;
  readonly models: readonly {
    readonly bytes: number;
    readonly fileName: string;
    readonly sha256: string;
  }[];
  readonly modelRevision: string;
}

export class CppRuntimeSetupService {
  readonly locations: CppRuntimeLocations;
  readonly resourcesRoot: string;
  readonly nativeCode: NativeCodeLocations;
  private readonly manifest: CppRuntimeManifest;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly hashFile: (candidate: string) => Promise<string>;
  private readonly modelDownloadTotalBytes: number;
  private readonly platform: NodeJS.Platform;
  private readonly architecture: string;
  private readonly readAvailableDiskBytes: () => Promise<number>;
  private modelValidation: Map<string, boolean> | undefined;
  private initialization: Promise<void> | undefined;
  private setupRun: Promise<void> | undefined;
  private status: RuntimeSetupStatus = {
    phase: "checking",
    ready: false,
    running: false,
    message: "Checking the private C++ Q8 music runtime…",
    completedSteps: 0,
    totalSteps: SETUP_STEP_COUNT,
    downloadedBytes: 0,
    downloadTotalBytes: MODEL_DOWNLOAD_TOTAL_BYTES,
    requiredBytes: CPP_Q8_RUNTIME_MANIFEST.minimumFreeBytes,
  };

  constructor(options: {
    readonly availableDiskBytes?: () => Promise<number>;
    readonly environment?: NodeJS.ProcessEnv;
    readonly hashFile?: (candidate: string) => Promise<string>;
    readonly manifest?: CppRuntimeManifest;
    readonly nativeCode: NativeCodeLocations;
    readonly platform?: NodeJS.Platform;
    readonly architecture?: string;
    readonly resourcesRoot: string;
    readonly runtimeRoot: string;
  }) {
    this.locations = resolveCppRuntimeLocations(options.runtimeRoot);
    this.resourcesRoot = path.resolve(options.resourcesRoot);
    this.nativeCode = options.nativeCode;
    this.manifest = options.manifest ?? CPP_Q8_RUNTIME_MANIFEST;
    this.environment = options.environment ?? process.env;
    this.hashFile = options.hashFile ?? sha256File;
    this.platform = options.platform ?? process.platform;
    this.architecture = options.architecture ?? process.arch;
    this.modelDownloadTotalBytes = this.manifest.models.files.reduce(
      (total, file) => total + file.bytes,
      0,
    );
    this.status = {
      ...this.status,
      downloadTotalBytes: this.modelDownloadTotalBytes,
      requiredBytes: this.manifest.minimumFreeBytes,
    };
    this.readAvailableDiskBytes =
      options.availableDiskBytes ??
      (async () => {
        const filesystem = await statfs(this.locations.root);
        return Number(filesystem.bavail) * Number(filesystem.bsize);
      });
    assertCppRuntimePathContainment(this.locations);
  }

  async getStatus(): Promise<RuntimeSetupStatus> {
    await this.initialize();
    return { ...this.status };
  }

  async start(): Promise<RuntimeSetupStatus> {
    await this.initialize();
    if (this.status.ready || this.setupRun) {
      return { ...this.status };
    }

    this.setupRun = this.runSetup()
      .catch(async (error: unknown) => {
        const message =
          error instanceof Error ? error.message : "C++ runtime setup failed.";
        await this.updateStatus({
          phase: "error",
          ready: false,
          running: false,
          message: "C++ Q8 setup stopped.",
          error: message,
          errorCode:
            error instanceof InsufficientDiskSpaceError
              ? "insufficient-disk"
              : undefined,
        });
        await this.log(`ERROR ${message}`);
      })
      .finally(() => {
        this.setupRun = undefined;
      });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { ...this.status };
  }

  async assertReady(): Promise<void> {
    await this.initialize();
    if (!this.status.ready) {
      throw new Error(
        "Locomo Music C++ Q8 runtime is not installed. Complete setup before generating music.",
      );
    }
  }

  private async initialize(): Promise<void> {
    this.initialization ??= (async () => {
      await this.ensureDirectories();
      await this.verifyBundledNativeCode();
      this.modelValidation = await this.validateInstalledModels();
      const modelsAreValid = [...this.modelValidation.values()].every(
        Boolean,
      );
      if (modelsAreValid) {
        if (!(await this.hasCurrentInstallRecord())) {
          await this.writeVerifiedInstallRecord();
          await this.log(
            "Migrated existing verified models to the model-only install record.",
          );
        }
        this.status = {
          phase: "ready",
          ready: true,
          running: false,
          message: "Local C++ Q8 music runtime ready.",
          completedSteps: SETUP_STEP_COUNT,
          totalSteps: SETUP_STEP_COUNT,
          downloadedBytes: this.modelDownloadTotalBytes,
          downloadTotalBytes: this.modelDownloadTotalBytes,
        };
        return;
      }
      this.status = {
        phase: "not-installed",
        ready: false,
        running: false,
        message: "The C++ Q8 music runtime is not installed.",
        completedSteps: 0,
        totalSteps: SETUP_STEP_COUNT,
        downloadedBytes: await this.existingModelDownloadBytes(),
        downloadTotalBytes: this.modelDownloadTotalBytes,
        requiredBytes: this.manifest.minimumFreeBytes,
      };
    })();
    await this.initialization;
  }

  private async runSetup(): Promise<void> {
    await this.assertSupportedPlatform();
    await this.ensureDirectories();
    await this.updateStatus({
      phase: "checking-disk",
      ready: false,
      running: true,
      message: "Checking available disk space for the C++ Q8 runtime…",
      error: undefined,
      errorCode: undefined,
      completedSteps: 0,
    });
    await this.verifyDiskSpace();

    await this.updateStatus({
      phase: "installing-helper",
      ready: false,
      running: true,
      message: "Installing and verifying the pinned native helper…",
      completedSteps: 0,
    });
    await this.verifyBundledNativeCode();
    await this.updateStatus({
      phase: "installing-helper",
      ready: false,
      running: true,
      message: "Bundled native helper verified.",
      completedSteps: 1,
    });

    await this.updateStatus({
      phase: "downloading-models",
      ready: false,
      running: true,
      message: `Downloading model 1 of ${this.manifest.models.files.length}`,
      completedSteps: 1,
    });
    await this.installModels();
    await this.updateStatus({
      phase: "verifying",
      ready: false,
      running: true,
      message: "Verifying downloaded models…",
      completedSteps: 2,
      downloadedBytes: this.modelDownloadTotalBytes,
      downloadTotalBytes: this.modelDownloadTotalBytes,
    });
    await this.writeVerifiedInstallRecord();
    await this.updateStatus({
      phase: "ready",
      ready: true,
      running: false,
      message: "Local C++ Q8 music runtime ready.",
      completedSteps: SETUP_STEP_COUNT,
      downloadedBytes: this.modelDownloadTotalBytes,
      downloadTotalBytes: this.modelDownloadTotalBytes,
      error: undefined,
    });
  }

  private async assertSupportedPlatform(): Promise<void> {
    if (this.platform !== "darwin" || this.architecture !== "arm64") {
      throw new Error(
        "The pinned C++ Q8 development runtime currently requires Apple-silicon macOS.",
      );
    }
  }

  private async ensureDirectories(): Promise<void> {
    await Promise.all(
      [
        this.locations.root,
        this.locations.downloads,
        this.locations.logs,
        this.locations.models,
        this.locations.proofs,
        this.locations.working,
      ].map((directory) => mkdir(directory, { recursive: true })),
    );
  }

  private async verifyDiskSpace(): Promise<void> {
    const freeBytes = await this.readAvailableDiskBytes();
    const installedBytes = await this.installedArtifactBytes();
    const requiredBytes = Math.max(
      minimumResumeHeadroom,
      this.manifest.minimumFreeBytes - installedBytes,
    );
    await this.updateStatus({
      phase: "checking-disk",
      ready: false,
      running: true,
      message: "Disk space verified.",
      freeBytes,
      requiredBytes,
    });
    if (freeBytes < requiredBytes) {
      throw new InsufficientDiskSpaceError(requiredBytes, freeBytes);
    }
  }

  private async installedArtifactBytes(): Promise<number> {
    const paths = [
      ...this.manifest.models.files.map((file) =>
        path.join(this.locations.models, file.fileName),
      ),
    ];
    const sizes = await Promise.all(
      paths.map((candidate) =>
        stat(candidate).then(
          (value) => value.size,
          () => 0,
        ),
      ),
    );
    return sizes.reduce((total, size) => total + size, 0);
  }

  private async existingModelDownloadBytes(): Promise<number> {
    const sizes = await Promise.all(
      this.manifest.models.files.map(async (file) => {
        const destination = path.join(
          this.locations.models,
          file.fileName,
        );
        const completedBytes = await stat(destination).then(
          (value) => value.size,
          () => 0,
        );
        if (completedBytes === file.bytes) return file.bytes;
        const partialBytes = await stat(`${destination}.partial`).then(
          (value) => value.size,
          () => 0,
        );
        return partialBytes <= file.bytes ? partialBytes : 0;
      }),
    );
    return sizes.reduce((total, size) => total + size, 0);
  }

  private async verifyBundledNativeCode(): Promise<void> {
    const aceRoot = path.resolve(this.nativeCode.aceRoot);
    const aceFiles = [
      this.nativeCode.aceServer,
      ...this.nativeCode.aceLibraries,
    ];
    if (aceFiles.length !== this.manifest.helper.files.length) {
      throw new Error("Bundled C++ helper inventory is incomplete.");
    }
    for (const candidate of aceFiles) {
      const resolved = path.resolve(candidate);
      const relative = path.relative(aceRoot, resolved);
      if (
        relative === "" ||
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        throw new Error("Bundled C++ helper escaped its code root.");
      }
      const metadata = await stat(resolved);
      if (!metadata.isFile()) {
        throw new Error(`Bundled native artifact is not a file: ${resolved}`);
      }
      await access(resolved, fsConstants.R_OK | fsConstants.X_OK);
    }
    const aacMetadata = await stat(this.nativeCode.aacEncoder);
    if (!aacMetadata.isFile()) {
      throw new Error("Bundled AAC helper is not a file.");
    }
    await access(
      this.nativeCode.aacEncoder,
      fsConstants.R_OK | fsConstants.X_OK,
    );

    // This identity is deliberately computed from the final bundled bytes.
    // Developer ID signing mutates Mach-O bytes, so the pre-sign source hash
    // is provenance only and must never gate execution.
    await this.hashFile(this.nativeCode.aceServer);

    for (const file of [
      this.manifest.source.compatibilityPatch,
      this.manifest.licenses,
    ]) {
      await this.assertExactFile(
        path.join(this.resourcesRoot, file.fileName),
        file.bytes,
        file.sha256,
      );
    }
  }

  private async installModels(): Promise<void> {
    const importRoot = this.environment.LOCOMO_MUSIC_CPP_Q8_IMPORT_MODELS;
    const downloadedByFile = new Map<string, number>();
    await Promise.all(
      this.manifest.models.files.map(async (file) => {
        const destination = path.join(
          this.locations.models,
          file.fileName,
        );
        const completedBytes = await stat(destination).then(
          (value) => value.size,
          () => 0,
        );
        if (completedBytes === file.bytes) {
          downloadedByFile.set(file.fileName, file.bytes);
          return;
        }
        const partialBytes = await stat(`${destination}.partial`).then(
          (value) => value.size,
          () => 0,
        );
        downloadedByFile.set(
          file.fileName,
          partialBytes <= file.bytes ? partialBytes : 0,
        );
      }),
    );

    const reportProgress = (
      index: number,
      fileName: string,
      fileBytes: number,
    ) => {
      downloadedByFile.set(fileName, fileBytes);
      this.status = {
        ...this.status,
        phase: "downloading-models",
        ready: false,
        running: true,
        message: `Downloading model ${index + 1} of ${this.manifest.models.files.length}`,
        downloadedBytes: [...downloadedByFile.values()].reduce(
          (total, bytes) => total + bytes,
          0,
        ),
        downloadTotalBytes: this.modelDownloadTotalBytes,
      };
    };

    for (const [index, file] of
      this.manifest.models.files.entries()) {
      const destination = path.join(this.locations.models, file.fileName);
      reportProgress(
        index,
        file.fileName,
        downloadedByFile.get(file.fileName) ?? 0,
      );
      if (this.modelValidation?.get(file.fileName) === true) {
        reportProgress(index, file.fileName, file.bytes);
        await this.log(`Verified existing model ${file.fileName}`);
        continue;
      }
      await this.updateStatus({
        phase: "downloading-models",
        ready: false,
        running: true,
        message: `Downloading model ${index + 1} of ${this.manifest.models.files.length}`,
        completedSteps: 1,
        downloadedBytes: [...downloadedByFile.values()].reduce(
          (total, bytes) => total + bytes,
          0,
        ),
        downloadTotalBytes: this.modelDownloadTotalBytes,
      });
      if (importRoot) {
        const source = path.resolve(importRoot, file.fileName);
        const relative = path.relative(path.resolve(importRoot), source);
        if (
          relative === ".." ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)
        ) {
          throw new Error("Development model import escaped its root.");
        }
        await this.assertExactFile(source, file.bytes, file.sha256);
        await this.copyAtomic(source, destination);
        reportProgress(index, file.fileName, file.bytes);
      } else {
        await this.downloadModel(
          cppModelDownloadUrl(file.fileName, this.manifest),
          destination,
          file.bytes,
          (downloadedBytes) =>
            reportProgress(index, file.fileName, downloadedBytes),
        );
      }
      await this.assertExactFile(destination, file.bytes, file.sha256);
      if (this.modelValidation instanceof Map) {
        this.modelValidation.set(file.fileName, true);
      }
      reportProgress(index, file.fileName, file.bytes);
      await this.log(`Installed and verified model ${file.fileName}`);
    }
  }

  private async downloadModel(
    url: string,
    destination: string,
    expectedBytes: number,
    onProgress: (downloadedBytes: number) => void,
  ): Promise<void> {
    await downloadResumableFile({
      destination,
      expectedBytes,
      onProgress,
      url,
    });
  }

  private async writeVerifiedInstallRecord(): Promise<void> {
    const models = this.manifest.models.files.map((file) => {
      if (this.modelValidation?.get(file.fileName) !== true) {
        throw new Error(
          `Cannot record an unverified model: ${file.fileName}`,
        );
      }
      return {
        bytes: file.bytes,
        fileName: file.fileName,
        sha256: file.sha256,
      };
    });
    const record: CppInstallRecordV2 = {
      schemaVersion: 2,
      createdAt: new Date().toISOString(),
      modelManifestSha256: cppModelManifestFingerprint(this.manifest),
      models,
      modelRevision: this.manifest.models.revision,
    };
    await this.writeJsonAtomic(
      this.locations.manifestRecord,
      {
        schemaVersion: 2,
        models: this.manifest.models,
      },
    );
    await this.writeJsonAtomic(this.locations.installRecord, record);
    if (!(await this.hasCurrentInstallRecord())) {
      throw new Error(
        "The C++ Q8 runtime failed final install-record verification.",
      );
    }
  }

  private async hasCurrentInstallRecord(): Promise<boolean> {
    try {
      const record = JSON.parse(
        await readFile(this.locations.installRecord, "utf8"),
      ) as CppInstallRecordV2;
      if (
        record.schemaVersion !== 2 ||
        record.modelManifestSha256 !==
          cppModelManifestFingerprint(this.manifest) ||
        record.modelRevision !== this.manifest.models.revision
      ) {
        return false;
      }
      const expectedModels = JSON.stringify(
        this.manifest.models.files.map((file) => ({
          bytes: file.bytes,
          fileName: file.fileName,
          sha256: file.sha256,
        })),
      );
      return JSON.stringify(record.models) === expectedModels;
    } catch {
      return false;
    }
  }

  private async validateInstalledModels(): Promise<Map<string, boolean>> {
    const validation = new Map<string, boolean>();
    for (const file of this.manifest.models.files) {
      validation.set(
        file.fileName,
        await this.isExactFile(
          path.join(this.locations.models, file.fileName),
          file.bytes,
          file.sha256,
        ),
      );
    }
    return validation;
  }

  private async assertExactFile(
    candidate: string,
    expectedBytes: number,
    expectedSha256: string,
  ): Promise<void> {
    if (
      !(await this.isExactFile(
        candidate,
        expectedBytes,
        expectedSha256,
      ))
    ) {
      throw new Error(`Exact artifact verification failed: ${candidate}`);
    }
  }

  private async isExactFile(
    candidate: string,
    expectedBytes: number,
    expectedSha256: string,
  ): Promise<boolean> {
    try {
      const metadata = await stat(candidate);
      if (!metadata.isFile() || metadata.size !== expectedBytes) {
        return false;
      }
      return (await this.hashFile(candidate)) === expectedSha256;
    } catch {
      return false;
    }
  }

  private async copyAtomic(
    source: string,
    destination: string,
  ): Promise<void> {
    const partial = `${destination}.${crypto.randomUUID()}.partial`;
    await copyFile(source, partial);
    await rename(partial, destination);
  }

  private async updateStatus(
    update: Partial<RuntimeSetupStatus> &
      Pick<RuntimeSetupStatus, "phase" | "message">,
  ): Promise<void> {
    this.status = {
      ...this.status,
      ...update,
      totalSteps: SETUP_STEP_COUNT,
    };
    await this.writeJsonAtomic(this.locations.setupState, {
      ...this.status,
      updatedAt: new Date().toISOString(),
    });
  }

  private async writeJsonAtomic(
    destination: string,
    value: unknown,
  ): Promise<void> {
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    await writeFile(
      temporary,
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
    await rename(temporary, destination);
  }

  private async log(message: string): Promise<void> {
    await appendFile(
      this.locations.setupLog,
      `[${new Date().toISOString()}] ${message}\n`,
      "utf8",
    );
  }
}

export async function downloadResumableFile(options: {
  readonly destination: string;
  readonly expectedBytes: number;
  readonly fetcher?: (
    url: string,
    init: RequestInit,
  ) => Promise<Response>;
  readonly onProgress?: (downloadedBytes: number) => void;
  readonly url: string;
}): Promise<void> {
  const fetcher = options.fetcher ?? fetch;
  const partial = `${options.destination}.partial`;
  let existingBytes = await stat(partial).then(
    (value) => value.size,
    () => 0,
  );
  if (existingBytes > options.expectedBytes) {
    await unlink(partial);
    existingBytes = 0;
  }
  options.onProgress?.(existingBytes);

  const response = await fetcher(options.url, {
    headers:
      existingBytes > 0
        ? { range: `bytes=${existingBytes}-` }
        : undefined,
    redirect: "follow",
    signal: AbortSignal.timeout(24 * 60 * 60 * 1_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `Model download failed (${response.status}) for ${path.basename(options.destination)}.`,
    );
  }
  const append = existingBytes > 0 && response.status === 206;
  if (!append) {
    existingBytes = 0;
    options.onProgress?.(existingBytes);
  }
  let streamedBytes = existingBytes;
  let overrunError: Error | undefined;
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      const nextStreamedBytes = streamedBytes + chunk.length;
      if (nextStreamedBytes > options.expectedBytes) {
        overrunError = new Error(
          `Model download exceeded expected size for ${path.basename(options.destination)}: expected ${options.expectedBytes}, received at least ${nextStreamedBytes}.`,
        );
        callback(overrunError);
        return;
      }
      streamedBytes = nextStreamedBytes;
      options.onProgress?.(streamedBytes);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(response.body as never),
      progress,
      createWriteStream(partial, { flags: append ? "a" : "w" }),
    );
  } catch (error) {
    if (overrunError) {
      await unlink(partial).catch((cleanupError: NodeJS.ErrnoException) => {
        if (cleanupError.code !== "ENOENT") {
          throw cleanupError;
        }
      });
      throw overrunError;
    }
    throw error;
  }
  const downloadedBytes = (await stat(partial)).size;
  options.onProgress?.(downloadedBytes);
  if (downloadedBytes !== options.expectedBytes) {
    throw new Error(
      `Model download size mismatch for ${path.basename(options.destination)}: expected ${options.expectedBytes}, received ${downloadedBytes}.`,
    );
  }
  await rename(partial, options.destination);
}

async function sha256File(candidate: string): Promise<string> {
  const digest = createHash("sha256");
  const stream = createReadStream(candidate);
  for await (const chunk of stream) {
    digest.update(chunk);
  }
  return digest.digest("hex");
}

export function cppModelManifestFingerprint(
  manifest: CppRuntimeManifest = CPP_Q8_RUNTIME_MANIFEST,
): string {
  return createHash("sha256")
    .update(cppModelManifestFingerprintInput(manifest))
    .digest("hex");
}

function formatGigabytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
