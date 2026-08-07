import path from "node:path";

import { describe, expect, it } from "vitest";

import type { StorageLocations } from "../src/shared/app-contract";
import {
  DEFAULT_MUSIC_BACKEND_PROFILE,
  resolveBackendRuntimeRoot,
  resolveMusicBackendProfile,
} from "../src/main/music-backend";

describe("central music backend selection", () => {
  const userData = path.join(
    path.parse(process.cwd()).root,
    "Application Support",
    "com.locomomusic.oss",
  );
  const storage: StorageLocations = {
    library: path.join(userData, "library"),
    runtime: path.join(userData, "runtime"),
    sessionData: path.join(userData, "session"),
    userData,
  };

  it("uses the C++ Q8 backend and its isolated runtime by default", () => {
    expect(DEFAULT_MUSIC_BACKEND_PROFILE).toBe("cpp-q8");
    expect(resolveMusicBackendProfile({})).toBe("cpp-q8");
    expect(resolveBackendRuntimeRoot(storage, "cpp-q8")).toBe(
      path.join(userData, "runtime-cpp-q8"),
    );
  });

  it("rejects every non-C++ backend value", () => {
    expect(() =>
      resolveMusicBackendProfile({
        LOCOMO_MUSIC_BACKEND: "automatic",
      }),
    ).toThrow("expected cpp-q8");
    expect(() =>
      resolveMusicBackendProfile({
        LOCOMO_MUSIC_BACKEND: "python-full",
      }),
    ).toThrow("expected cpp-q8");
  });
});
