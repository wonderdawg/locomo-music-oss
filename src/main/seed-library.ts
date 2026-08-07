import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { MusicCategoryKey } from "../shared/music-categories";
import { EXISTING_CATEGORY_IDENTITIES } from "../shared/music-categories";
import { isPathWithin } from "./storage";

const SEED_MANIFEST_VERSION = 1;
const TRACK_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^[0-9a-f]{64}$/u;
const KNOWN_CATEGORIES = new Set<string>(
  EXISTING_CATEGORY_IDENTITIES.map(({ key }) => key),
);

export interface SeedLibraryTrack {
  readonly audio: {
    readonly bytes: number;
    readonly path: string;
    readonly sha256: string;
  };
  readonly categoryKey: MusicCategoryKey;
  readonly createdAt: number;
  readonly duration: number;
  readonly id: string;
  readonly lyrics: string;
  readonly prompt: string;
  readonly title: string;
}

export interface SeedLibraryManifest {
  readonly collectionId: string;
  readonly tracks: readonly SeedLibraryTrack[];
  readonly version: typeof SEED_MANIFEST_VERSION;
}

export async function readSeedLibraryManifest(
  seedLibraryRoot: string,
): Promise<SeedLibraryManifest> {
  const root = await realpath(path.resolve(seedLibraryRoot));
  const manifestPath = path.join(root, "manifest.json");
  const value = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  const manifest = parseManifest(value);
  const ids = new Set<string>();
  const audioPaths = new Set<string>();

  for (const track of manifest.tracks) {
    if (ids.has(track.id)) {
      throw new Error(`Duplicate seed track identifier: ${track.id}`);
    }
    ids.add(track.id);
    const audioPath = await resolveSeedAudioPath(root, track);
    if (audioPaths.has(audioPath)) {
      throw new Error(`Duplicate seed audio path: ${track.audio.path}`);
    }
    audioPaths.add(audioPath);
    const metadata = await stat(audioPath);
    if (!metadata.isFile() || metadata.size !== track.audio.bytes) {
      throw new Error(`Seed audio size mismatch for ${track.id}.`);
    }
  }

  return manifest;
}

export async function readSeedAudio(
  seedLibraryRoot: string,
  track: SeedLibraryTrack,
): Promise<Buffer> {
  const root = await realpath(path.resolve(seedLibraryRoot));
  const audioPath = await resolveSeedAudioPath(root, track);
  const bytes = await readFile(audioPath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== track.audio.bytes || digest !== track.audio.sha256) {
    throw new Error(`Seed audio integrity check failed for ${track.id}.`);
  }
  return bytes;
}

async function resolveSeedAudioPath(
  root: string,
  track: SeedLibraryTrack,
): Promise<string> {
  if (
    path.isAbsolute(track.audio.path) ||
    path.extname(track.audio.path).toLowerCase() !== ".m4a"
  ) {
    throw new Error(`Invalid seed audio path for ${track.id}.`);
  }
  const candidate = path.resolve(root, track.audio.path);
  if (!isPathWithin(root, candidate)) {
    throw new Error(`Seed audio escaped its resource root for ${track.id}.`);
  }
  const resolved = await realpath(candidate);
  if (!isPathWithin(root, resolved)) {
    throw new Error(`Seed audio escaped its resource root for ${track.id}.`);
  }
  return resolved;
}

function parseManifest(value: unknown): SeedLibraryManifest {
  assertRecord(value, "Seed library manifest");
  assertExactKeys(value, ["collectionId", "tracks", "version"]);
  if (
    value.version !== SEED_MANIFEST_VERSION ||
    typeof value.collectionId !== "string" ||
    value.collectionId.length === 0 ||
    !Array.isArray(value.tracks) ||
    value.tracks.length === 0
  ) {
    throw new Error("Seed library manifest is invalid.");
  }
  return {
    collectionId: value.collectionId,
    tracks: value.tracks.map(parseTrack),
    version: SEED_MANIFEST_VERSION,
  };
}

function parseTrack(value: unknown): SeedLibraryTrack {
  assertRecord(value, "Seed library track");
  assertExactKeys(value, [
    "audio",
    "categoryKey",
    "createdAt",
    "duration",
    "id",
    "lyrics",
    "prompt",
    "title",
  ]);
  assertRecord(value.audio, "Seed library audio");
  assertExactKeys(value.audio, ["bytes", "path", "sha256"]);
  if (
    typeof value.id !== "string" ||
    !TRACK_ID.test(value.id) ||
    typeof value.title !== "string" ||
    value.title.length === 0 ||
    typeof value.categoryKey !== "string" ||
    !KNOWN_CATEGORIES.has(value.categoryKey as MusicCategoryKey) ||
    typeof value.prompt !== "string" ||
    typeof value.lyrics !== "string" ||
    !Number.isFinite(value.duration) ||
    (value.duration as number) <= 0 ||
    !Number.isInteger(value.createdAt) ||
    (value.createdAt as number) <= 0 ||
    typeof value.audio.path !== "string" ||
    !Number.isInteger(value.audio.bytes) ||
    (value.audio.bytes as number) <= 0 ||
    typeof value.audio.sha256 !== "string" ||
    !SHA256.test(value.audio.sha256)
  ) {
    throw new Error("Seed library track is invalid.");
  }
  return value as unknown as SeedLibraryTrack;
}

function assertRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is invalid.`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error("Seed library manifest contains unsupported fields.");
  }
}
