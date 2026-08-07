import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  APP_ID,
  DEVELOPMENT_APP_ID,
  type StorageLocations,
} from "../shared/app-contract";

export type StorageNamespace =
  | typeof APP_ID
  | typeof DEVELOPMENT_APP_ID;

export function resolveStorageLocations(
  appDataPath: string,
  namespace: StorageNamespace = APP_ID,
): StorageLocations {
  const userData = path.resolve(appDataPath, namespace);

  return {
    library: path.join(userData, "library"),
    runtime: path.join(userData, "runtime"),
    sessionData: path.join(userData, "session"),
    userData,
  };
}

export function resolveSeedTestProfileRoot(
  value: string | undefined,
): string | undefined {
  const candidate = value?.trim();
  if (!candidate) {
    return undefined;
  }
  if (!path.isAbsolute(candidate)) {
    throw new Error(
      "LOCOMO_MUSIC_SEED_TEST_PROFILE_ROOT must be an absolute path.",
    );
  }
  return path.normalize(candidate);
}

export function ensureStorageLocations(locations: StorageLocations): void {
  for (const location of [
    locations.userData,
    locations.library,
    locations.runtime,
    locations.sessionData,
  ]) {
    mkdirSync(location, { recursive: true });
  }
}

export function isPathWithin(parent: string, candidate: string): boolean {
  const relativePath = path.relative(parent, candidate);

  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}
