import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  APP_ID,
  DEVELOPMENT_APP_ID,
} from "../src/shared/app-contract";
import {
  isPathWithin,
  resolveSeedTestProfileRoot,
  resolveStorageLocations,
} from "../src/main/storage";

describe("Locomo Music storage isolation", () => {
  it("derives every writable location from the dedicated bundle identifier", () => {
    const appData = path.join(
      path.parse(process.cwd()).root,
      "Users",
      "example",
      "Library",
      "Application Support",
    );
    const locations = resolveStorageLocations(appData);

    expect(locations.userData).toBe(path.join(appData, APP_ID));
    expect(locations.library).toBe(path.join(appData, APP_ID, "library"));
    expect(locations.runtime).toBe(
      path.join(appData, APP_ID, "runtime"),
    );
    expect(locations.sessionData).toBe(
      path.join(appData, APP_ID, "session"),
    );
  });

  it("keeps ordinary development on its isolated OSS namespace", () => {
    const appData = path.join(
      path.parse(process.cwd()).root,
      "Users",
      "example",
      "Library",
      "Application Support",
    );
    const locations = resolveStorageLocations(appData, DEVELOPMENT_APP_ID);

    expect(locations.userData).toBe(
      path.join(appData, DEVELOPMENT_APP_ID),
    );
  });

  it("accepts only an explicit absolute isolated seed-test root", () => {
    expect(resolveSeedTestProfileRoot(undefined)).toBeUndefined();
    expect(resolveSeedTestProfileRoot("   ")).toBeUndefined();
    expect(() => resolveSeedTestProfileRoot("relative/profile")).toThrow(
      "must be an absolute path",
    );
    expect(resolveSeedTestProfileRoot("/tmp/locomo-seed-test")).toBe(
      "/tmp/locomo-seed-test",
    );
  });

  it("keeps runtime and session data inside the app-owned directory", () => {
    const locations = resolveStorageLocations(
      path.join(path.parse(process.cwd()).root, "Application Data"),
    );

    expect(isPathWithin(locations.userData, locations.library)).toBe(true);
    expect(isPathWithin(locations.userData, locations.runtime)).toBe(true);
    expect(isPathWithin(locations.userData, locations.sessionData)).toBe(true);
    expect(isPathWithin(locations.userData, locations.userData)).toBe(false);
    expect(
      isPathWithin(locations.userData, path.dirname(locations.userData)),
    ).toBe(false);
  });
});
