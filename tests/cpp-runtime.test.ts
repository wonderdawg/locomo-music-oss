import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertCppRuntimePathContainment,
  cppModelDownloadUrl,
  CPP_Q8_RUNTIME_MANIFEST,
  resolveCppRuntimeLocations,
} from "../src/main/cpp-runtime-manifest";
import {
  resolveNativeCodeLocations,
  sha256NativeHelper,
} from "../src/main/native-code-paths";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("pinned C++ Q8 runtime manifest", () => {
  it("pins the validated source, submodule, helper inventory, and four model files", () => {
    expect(CPP_Q8_RUNTIME_MANIFEST.source).toMatchObject({
      revision: "fa337757a0a0d4a576d129bb45dbef00ceced73c",
      ggmlRevision: "c044c6f03892f9d5e98213b05f8afea1f8b0d3c9",
    });
    expect(CPP_Q8_RUNTIME_MANIFEST.helper.files[0]).toMatchObject({
      fileName: "ace-server",
      executable: true,
    });
    expect(CPP_Q8_RUNTIME_MANIFEST.models).toMatchObject({
      revision: "9b3707625776cc4cf775e9b12ab82f9fe48335ff",
    });
    expect(
      CPP_Q8_RUNTIME_MANIFEST.models.files.map((file) => [
        file.fileName,
        file.sha256,
      ]),
    ).toEqual([
      [
        "acestep-5Hz-lm-4B-Q8_0.gguf",
        "972f91147a167f0c041f1b158d67985a82c0f6a852e68cdf70e46030cf08b1bc",
      ],
      [
        "acestep-v15-xl-turbo-Q8_0.gguf",
        "4f1044fb646374fb5730e10f64325766883eb2fc02a643c1b403f2d61f39dc19",
      ],
      [
        "Qwen3-Embedding-0.6B-Q8_0.gguf",
        "972f23255e46adfe744a0eb9a0039f3c63988f65753b0968d776e8b27168c321",
      ],
      [
        "vae-BF16.gguf",
        "0599862ac5d15cd308e1d2e368373aea6c02e25ebd1737ad4a4562a0901b0ef8",
      ],
    ]);
  });

  it("builds the helper inventory from the exact pinned source revisions", async () => {
    const buildScript = await readFile(
      new URL("../scripts/build-cpp-q8-helper.sh", import.meta.url),
      "utf8",
    );
    expect(buildScript).toContain(
      "source_revision=fa337757a0a0d4a576d129bb45dbef00ceced73c",
    );
    expect(buildScript).toContain(
      "ggml_revision=c044c6f03892f9d5e98213b05f8afea1f8b0d3c9",
    );
    expect(buildScript).toContain("-DGGML_NATIVE=OFF");
    expect(
      CPP_Q8_RUNTIME_MANIFEST.helper.files.map((file) =>
        "resourceFileName" in file ? file.resourceFileName : file.fileName,
      ),
    ).toEqual([
      "ace-server",
      "libggml-base.0.17.0.dylib",
      "libggml-blas.0.17.0.dylib",
      "libggml-cpu.0.17.0.dylib",
      "libggml-metal.0.17.0.dylib",
      "libggml.0.17.0.dylib",
    ]);
  });

  it("resolves immutable code from Resources in DEV and Contents/Helpers when packaged", () => {
    const appRoot = path.join(
      path.parse(process.cwd()).root,
      "Applications",
      "Locomo Music OSS.app",
    );
    const resourcesRoot = path.join(appRoot, "Contents", "Resources");
    const packaged = resolveNativeCodeLocations({
      isPackaged: true,
      resourcesRoot,
    });
    expect(packaged).toMatchObject({
      aacEncoder: path.join(
        appRoot,
        "Contents",
        "Helpers",
        "locomo-aac-encoder",
      ),
      aceRoot: path.join(appRoot, "Contents", "Helpers", "LocomoACE"),
      aceServer: path.join(
        appRoot,
        "Contents",
        "Helpers",
        "LocomoACE",
        "ace-server",
      ),
    });
    expect(packaged.aceLibraries).toContain(
      path.join(
        packaged.aceRoot,
        "libggml-base.0.17.0.dylib",
      ),
    );

    const development = resolveNativeCodeLocations({
      isPackaged: false,
      resourcesRoot,
    });
    expect(development.aceServer).toBe(
      path.join(resourcesRoot, "runtime-cpp-q8", "bin", "ace-server"),
    );
    expect(development.aacEncoder).toBe(
      path.join(
        resourcesRoot,
        "audio-tools",
        "locomo-aac-encoder",
      ),
    );
  });

  it("derives runtime proof identity from final helper bytes", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "locomo-native-identity-test-"),
    );
    temporaryDirectories.push(root);
    const helper = path.join(root, "ace-server");
    await writeFile(helper, "pre-sign bytes");
    const first = sha256NativeHelper(helper);
    await writeFile(helper, "post-sign bytes");
    const second = sha256NativeHelper(helper);
    expect(first).not.toBe(second);
    expect(second).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("keeps every C++ runtime path inside its isolated profile root", () => {
    const root = path.resolve(
      path.join(
        path.parse(process.cwd()).root,
        "Application Support",
        "com.locomomusic.oss",
        "runtime-cpp-q8",
      ),
    );
    const locations = resolveCppRuntimeLocations(root);

    expect(() =>
      assertCppRuntimePathContainment(locations),
    ).not.toThrow();
    for (const candidate of Object.values(locations)) {
      expect(
        candidate === root ||
          (!path.relative(root, candidate).startsWith("..") &&
            !path.isAbsolute(path.relative(root, candidate))),
      ).toBe(true);
    }
  });

  it("downloads model bytes from the exact immutable revision", () => {
    expect(cppModelDownloadUrl("vae-BF16.gguf")).toBe(
      "https://huggingface.co/Serveurperso/ACE-Step-1.5-GGUF/resolve/9b3707625776cc4cf775e9b12ab82f9fe48335ff/vae-BF16.gguf?download=true",
    );
  });
});
