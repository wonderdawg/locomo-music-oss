import path from "node:path";

const gibibyte = 1024 ** 3;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

export interface CppRuntimeManifest {
  readonly schemaVersion: number;
  readonly minimumFreeBytes: number;
  readonly estimatedInstalledBytes: number;
  readonly source: {
    readonly repository: string;
    readonly revision: string;
    readonly ggmlRevision: string;
    readonly compatibilityPatch: {
      readonly fileName: string;
      readonly bytes: number;
      readonly sha256: string;
      readonly summary: string;
    };
  };
  readonly helper: {
    readonly architecture: string;
    readonly build: {
      readonly buildType: string;
      readonly metal: boolean;
      readonly accelerate: boolean;
      readonly appleBlas: boolean;
    };
    readonly files: readonly {
      readonly fileName: string;
      readonly resourceFileName?: string;
      readonly executable: boolean;
    }[];
  };
  readonly models: {
    readonly repository: string;
    readonly revision: string;
    readonly files: readonly {
      readonly fileName: string;
      readonly role: string;
      readonly quantization: string;
      readonly bytes: number;
      readonly sha256: string;
    }[];
  };
  readonly licenses: {
    readonly fileName: string;
    readonly bytes: number;
    readonly sha256: string;
  };
}

export const CPP_Q8_RUNTIME_MANIFEST = deepFreeze({
  schemaVersion: 1,
  minimumFreeBytes: 16 * gibibyte,
  estimatedInstalledBytes: 10_889_701_872,
  source: {
    repository: "https://github.com/ServeurpersoCom/acestep.cpp.git",
    revision: "fa337757a0a0d4a576d129bb45dbef00ceced73c",
    ggmlRevision: "c044c6f03892f9d5e98213b05f8afea1f8b0d3c9",
    compatibilityPatch: {
      fileName: "BUILD_COMPATIBILITY_PATCH.diff",
      bytes: 600,
      sha256:
        "1d4dcc401c39695f963fac3222567635731d5efb30d83a897e60ef2e813f8a4a",
      summary:
        "Use the existing hand-written float parser on Apple platforms; custom-timestep parsing only.",
    },
  },
  helper: {
    architecture: "arm64",
    build: {
      buildType: "Release",
      metal: true,
      accelerate: true,
      appleBlas: true,
    },
    files: [
      {
        fileName: "ace-server",
        executable: true,
      },
      {
        fileName: "libggml-base.0.dylib",
        resourceFileName: "libggml-base.0.17.0.dylib",
        executable: true,
      },
      {
        fileName: "libggml-blas.0.dylib",
        resourceFileName: "libggml-blas.0.17.0.dylib",
        executable: true,
      },
      {
        fileName: "libggml-cpu.0.dylib",
        resourceFileName: "libggml-cpu.0.17.0.dylib",
        executable: true,
      },
      {
        fileName: "libggml-metal.0.dylib",
        resourceFileName: "libggml-metal.0.17.0.dylib",
        executable: true,
      },
      {
        fileName: "libggml.0.dylib",
        resourceFileName: "libggml.0.17.0.dylib",
        executable: true,
      },
    ],
  },
  models: {
    repository: "Serveurperso/ACE-Step-1.5-GGUF",
    revision: "9b3707625776cc4cf775e9b12ab82f9fe48335ff",
    files: [
      {
        fileName: "acestep-5Hz-lm-4B-Q8_0.gguf",
        role: "language-planner",
        quantization: "Q8_0",
        bytes: 4_457_323_648,
        sha256:
          "972f91147a167f0c041f1b158d67985a82c0f6a852e68cdf70e46030cf08b1bc",
      },
      {
        fileName: "acestep-v15-xl-turbo-Q8_0.gguf",
        role: "xl-turbo-dit",
        quantization: "Q8_0",
        bytes: 5_305_828_736,
        sha256:
          "4f1044fb646374fb5730e10f64325766883eb2fc02a643c1b403f2d61f39dc19",
      },
      {
        fileName: "Qwen3-Embedding-0.6B-Q8_0.gguf",
        role: "text-encoder",
        quantization: "Q8_0",
        bytes: 784_144_960,
        sha256:
          "972f23255e46adfe744a0eb9a0039f3c63988f65753b0968d776e8b27168c321",
      },
      {
        fileName: "vae-BF16.gguf",
        role: "vae",
        quantization: "BF16",
        bytes: 337_420_928,
        sha256:
          "0599862ac5d15cd308e1d2e368373aea6c02e25ebd1737ad4a4562a0901b0ef8",
      },
    ],
  },
  licenses: {
    fileName: "THIRD_PARTY_LICENSES.txt",
    bytes: 4_712,
    sha256:
      "a31e65b0826c5af6c7d23f8c8d9437123764d7709aea52929668296276da7fa1",
  },
} as const satisfies CppRuntimeManifest);

export interface CppRuntimeLocations {
  readonly aceServer: string;
  readonly bin: string;
  readonly downloads: string;
  readonly installRecord: string;
  readonly logs: string;
  readonly manifestRecord: string;
  readonly models: string;
  readonly provenance: string;
  readonly proofs: string;
  readonly root: string;
  readonly serverLog: string;
  readonly setupLog: string;
  readonly setupState: string;
  readonly working: string;
}

export function resolveCppRuntimeLocations(
  runtimeRoot: string,
): CppRuntimeLocations {
  const root = path.resolve(runtimeRoot);
  const bin = path.join(root, "bin");
  const logs = path.join(root, "logs");

  return {
    aceServer: path.join(bin, "ace-server"),
    bin,
    downloads: path.join(root, "downloads"),
    installRecord: path.join(root, "install-record.json"),
    logs,
    manifestRecord: path.join(root, "runtime-manifest.json"),
    models: path.join(root, "models"),
    provenance: path.join(root, "provenance"),
    proofs: path.join(root, "proofs"),
    root,
    serverLog: path.join(logs, "ace-server.log"),
    setupLog: path.join(logs, "setup.log"),
    setupState: path.join(root, "setup-state.json"),
    working: path.join(root, "working"),
  };
}

export function assertCppRuntimePathContainment(
  locations: CppRuntimeLocations,
): void {
  for (const [name, candidate] of Object.entries(locations)) {
    if (name === "root") {
      continue;
    }
    const relative = path.relative(locations.root, candidate);
    if (
      relative === "" ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(
        `C++ runtime location escaped its root: ${name}=${candidate}`,
      );
    }
  }
}

export function cppRuntimeManifestFingerprintInput(
  manifest: CppRuntimeManifest = CPP_Q8_RUNTIME_MANIFEST,
): string {
  return JSON.stringify(manifest);
}

export function cppModelManifestFingerprintInput(
  manifest: CppRuntimeManifest = CPP_Q8_RUNTIME_MANIFEST,
): string {
  return JSON.stringify({
    models: manifest.models,
    schemaVersion: 2,
  });
}

export function cppModelDownloadUrl(
  fileName: string,
  manifest: CppRuntimeManifest = CPP_Q8_RUNTIME_MANIFEST,
): string {
  const repository = encodeURI(manifest.models.repository);
  const revision = manifest.models.revision;
  return `https://huggingface.co/${repository}/resolve/${revision}/${encodeURIComponent(fileName)}?download=true`;
}
