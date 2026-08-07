import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { CPP_Q8_RUNTIME_MANIFEST } from "./cpp-runtime-manifest";

export interface NativeCodeLocations {
  readonly aacEncoder: string;
  readonly aceLibraries: readonly string[];
  readonly aceRoot: string;
  readonly aceServer: string;
}

export function resolveNativeCodeLocations(options: {
  readonly isPackaged: boolean;
  readonly resourcesRoot: string;
}): NativeCodeLocations {
  const resourcesRoot = path.resolve(options.resourcesRoot);
  if (options.isPackaged) {
    const contentsRoot = path.resolve(resourcesRoot, "..");
    const helpersRoot = path.join(contentsRoot, "Helpers");
    const aceRoot = path.join(helpersRoot, "LocomoACE");
    return {
      aacEncoder: path.join(helpersRoot, "locomo-aac-encoder"),
      aceLibraries: CPP_Q8_RUNTIME_MANIFEST.helper.files
        .slice(1)
        .map((file) =>
          path.join(
            aceRoot,
            "resourceFileName" in file
              ? file.resourceFileName
              : file.fileName,
          ),
        ),
      aceRoot,
      aceServer: path.join(aceRoot, "ace-server"),
    };
  }

  const aceRoot = path.join(resourcesRoot, "runtime-cpp-q8", "bin");
  return {
    aacEncoder: path.join(
      resourcesRoot,
      "audio-tools",
      "locomo-aac-encoder",
    ),
    aceLibraries: CPP_Q8_RUNTIME_MANIFEST.helper.files
      .slice(1)
      .map((file) =>
        path.join(
          aceRoot,
          "resourceFileName" in file
            ? file.resourceFileName
            : file.fileName,
        ),
      ),
    aceRoot,
    aceServer: path.join(aceRoot, "ace-server"),
  };
}

export function sha256NativeHelper(candidate: string): string {
  return createHash("sha256")
    .update(readFileSync(candidate))
    .digest("hex");
}
