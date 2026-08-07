import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  link,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  MusicAudioFileExtension,
  MusicAudioFormat,
  MusicAudioMimeType,
  MusicTrack,
} from "../shared/app-contract";
import type { MusicCategoryKey } from "../shared/music-categories";
import { EXISTING_CATEGORY_IDENTITIES } from "../shared/music-categories";
import {
  readSeedAudio,
  readSeedLibraryManifest,
  type SeedLibraryTrack,
} from "./seed-library";

export const AAC_MINIMUM_BIT_RATE = 230_000;
export const AAC_MAXIMUM_BIT_RATE = 270_000;
export const AAC_TARGET_BIT_RATE = 256_000;

const CATEGORY_KEY_SCHEMA_VERSION = 1;
const FAVORITE_SCHEMA_VERSION = 2;
const REMAKE_SOURCE_SCHEMA_VERSION = 3;
const PLAY_HISTORY_SCHEMA_VERSION = 4;
const PENDING_VERSION = 1;
const SEED_BOOTSTRAP_RECEIPT_VERSION = 1;
const MINIMUM_M4A_BYTES = 1_024;
const MAXIMUM_DURATION_DELTA_SECONDS = 0.1;
const TRACK_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type MusicTrackMetadata = Omit<
  MusicTrack,
  | "audioFormat"
  | "fileExtension"
  | "isFavorite"
  | "isPlayed"
  | "mimeType"
> & {
  readonly isFavorite?: boolean;
  readonly isPlayed?: boolean;
};

export interface NativeAacResult {
  readonly bitRate: number;
  readonly channels: number;
  readonly codec: "aac";
  readonly container: "m4a";
  readonly durationSeconds: number;
  readonly fileSize: number;
  readonly outputPath: string;
  readonly sampleRate: number;
}

export type EncodeWavToAac = (
  inputPath: string,
  outputPath: string,
) => Promise<NativeAacResult>;

export interface TrackGenerationProofStorage {
  deleteTrack(id: string): Promise<void>;
  writeLastProof(proof: unknown): Promise<void>;
}

export function createTrackGenerationProofStorage(options: {
  readonly lastProofPath: string;
  readonly proofsRoot?: string;
}): TrackGenerationProofStorage {
  const lastProofPath = path.resolve(options.lastProofPath);
  const proofsRoot = options.proofsRoot
    ? path.resolve(options.proofsRoot)
    : undefined;
  let mutationQueue = Promise.resolve();

  const queueMutation = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = mutationQueue.then(operation);
    mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    deleteTrack(id) {
      assertTrackID(id);
      return queueMutation(async () => {
        if (proofsRoot) {
          const proofDirectory = path.join(proofsRoot, id);
          const relativeProofDirectory = path.relative(
            proofsRoot,
            proofDirectory,
          );
          if (
            relativeProofDirectory === "" ||
            relativeProofDirectory === ".." ||
            relativeProofDirectory.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relativeProofDirectory)
          ) {
            throw new Error(
              "Track generation proof escaped its proof store.",
            );
          }
          await rm(proofDirectory, { force: true, recursive: true });
          if (existsSync(proofsRoot)) {
            await syncDirectory(proofsRoot);
          }
        }

        let serializedLastProof: string;
        try {
          serializedLastProof = await readFile(lastProofPath, "utf8");
        } catch (cause) {
          if (isMissingPathError(cause)) return;
          throw cause;
        }

        let lastProof: unknown;
        try {
          lastProof = JSON.parse(serializedLastProof) as unknown;
        } catch {
          return;
        }
        if (readProofTrackID(lastProof) !== id) return;

        await removeIfPresent(lastProofPath);
        await syncDirectory(path.dirname(lastProofPath));
      });
    },
    writeLastProof(proof) {
      return queueMutation(() =>
        writeFile(
          lastProofPath,
          `${JSON.stringify(proof, null, 2)}\n`,
          "utf8",
        ),
      );
    },
  };
}

interface PendingGeneration {
  readonly expectedChannels: number;
  readonly expectedDurationSeconds: number;
  readonly track: MusicTrackMetadata;
  readonly version: typeof PENDING_VERSION;
}

interface CanonicalAudioDescriptor {
  readonly audioFormat: MusicAudioFormat;
  readonly fileExtension: MusicAudioFileExtension;
  readonly fileName: string;
  readonly mimeType: MusicAudioMimeType;
  readonly path: string;
}

interface WavMetadata {
  readonly channels: number;
  readonly durationSeconds: number;
}

export interface MusicLibrary {
  delete(id: string): Promise<void>;
  list(): Promise<MusicTrack[]>;
  markPlayed(id: string): Promise<boolean>;
  readPrompt(id: string): Promise<string | undefined>;
  read(id: string): Promise<{
    readonly audioFormat: MusicAudioFormat;
    readonly bytes: Buffer;
    readonly fileExtension: MusicAudioFileExtension;
    readonly mimeType: MusicAudioMimeType;
  }>;
  setFavorite(id: string, isFavorite: boolean): Promise<boolean>;
  storeGeneratedWav(
    track: MusicTrackMetadata,
    wav: Buffer,
  ): Promise<MusicTrack>;
  trackPath(id: string): string;
}

export function createMusicLibrary(options: {
  readonly aacEncoderPath?: string;
  readonly encodeWavToAac?: EncodeWavToAac;
  readonly libraryRoot: string;
  readonly seedLibraryRoot?: string;
  readonly trackGenerationProofStorage?: TrackGenerationProofStorage;
}): MusicLibrary {
  const libraryRoot = path.resolve(options.libraryRoot);
  const generations = path.join(libraryRoot, "generations");
  const pending = path.join(libraryRoot, ".aac-pending");
  const deleting = path.join(libraryRoot, ".audio-deleting");
  const seedImport = path.join(libraryRoot, ".seed-import");
  const seedBootstrapMarker = path.join(
    libraryRoot,
    ".seed-bootstrap-pending",
  );
  const databasePath = path.join(libraryRoot, "music.sqlite");
  const seedLibraryRoot = options.seedLibraryRoot
    ? path.resolve(options.seedLibraryRoot)
    : undefined;
  let managesSeedBootstrap = Boolean(
    seedLibraryRoot &&
      (existsSync(seedBootstrapMarker) || !existsSync(databasePath)),
  );
  const encodeWavToAac =
    options.encodeWavToAac ??
    ((inputPath, outputPath) => {
      if (!options.aacEncoderPath) {
        throw new Error("The native AAC encoder is not configured.");
      }
      return runNativeAacEncoder(
        options.aacEncoderPath,
        inputPath,
        outputPath,
      );
    });
  let readiness: Promise<void> | undefined;
  let mutationQueue = Promise.resolve();

  const database = () => {
    const db = new DatabaseSync(databasePath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS generation (
        id TEXT PRIMARY KEY,
        title TEXT,
        category_key TEXT,
        prompt TEXT NOT NULL,
        lyrics TEXT NOT NULL,
        duration REAL NOT NULL,
        created_at INTEGER NOT NULL,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        is_played INTEGER NOT NULL DEFAULT 0,
        remake_source_track_id TEXT
      )
    `);
    if (managesSeedBootstrap) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS bundled_seed_receipt (
          collection_id TEXT NOT NULL,
          track_id TEXT NOT NULL,
          audio_sha256 TEXT NOT NULL,
          outcome TEXT NOT NULL,
          imported_at INTEGER NOT NULL,
          PRIMARY KEY (collection_id, track_id)
        );
        CREATE TABLE IF NOT EXISTS bundled_seed_bootstrap (
          receipt_id INTEGER PRIMARY KEY CHECK (receipt_id = 1),
          version INTEGER NOT NULL,
          collection_id TEXT NOT NULL,
          track_count INTEGER NOT NULL,
          completed_at INTEGER NOT NULL
        )
      `);
    }
    const columns = db
      .prepare("PRAGMA table_info(generation)")
      .all() as { name: string }[];
    const schema = db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    const needsTitle = !columns.some((column) => column.name === "title");
    const needsCategoryKey = !columns.some(
      (column) => column.name === "category_key",
    );
    const needsCategoryBackfill =
      needsCategoryKey || schema.user_version < CATEGORY_KEY_SCHEMA_VERSION;
    const needsFavorite = !columns.some(
      (column) => column.name === "is_favorite",
    );
    const needsRemakeSource = !columns.some(
      (column) => column.name === "remake_source_track_id",
    );
    const needsPlayHistory = !columns.some(
      (column) => column.name === "is_played",
    );
    if (
      needsTitle ||
      needsCategoryBackfill ||
      needsFavorite ||
      needsRemakeSource ||
      needsPlayHistory ||
      schema.user_version < PLAY_HISTORY_SCHEMA_VERSION
    ) {
      db.exec("BEGIN IMMEDIATE");
      try {
        if (needsTitle) {
          db.exec("ALTER TABLE generation ADD COLUMN title TEXT");
        }
        if (needsCategoryKey) {
          db.exec("ALTER TABLE generation ADD COLUMN category_key TEXT");
        }
        if (needsFavorite) {
          db.exec(
            "ALTER TABLE generation ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
          );
        }
        if (needsRemakeSource) {
          db.exec(
            "ALTER TABLE generation ADD COLUMN remake_source_track_id TEXT",
          );
        }
        if (needsPlayHistory) {
          db.exec(
            "ALTER TABLE generation ADD COLUMN is_played INTEGER NOT NULL DEFAULT 1",
          );
        }
        if (needsCategoryBackfill) {
          const backfill = db.prepare(`
            UPDATE generation
            SET category_key = ?
            WHERE category_key IS NULL
              AND substr(prompt, 1, ?) = ?
          `);
          for (const identity of EXISTING_CATEGORY_IDENTITIES) {
            const prefix = `${identity.name}.`;
            backfill.run(identity.key, prefix.length, prefix);
          }
        }
        if (schema.user_version < CATEGORY_KEY_SCHEMA_VERSION) {
          db.exec(`PRAGMA user_version = ${CATEGORY_KEY_SCHEMA_VERSION}`);
        }
        if (schema.user_version < FAVORITE_SCHEMA_VERSION) {
          db.exec(`PRAGMA user_version = ${FAVORITE_SCHEMA_VERSION}`);
        }
        if (schema.user_version < REMAKE_SOURCE_SCHEMA_VERSION) {
          db.exec(
            `PRAGMA user_version = ${REMAKE_SOURCE_SCHEMA_VERSION}`,
          );
        }
        if (schema.user_version < PLAY_HISTORY_SCHEMA_VERSION) {
          db.exec(
            `PRAGMA user_version = ${PLAY_HISTORY_SCHEMA_VERSION}`,
          );
        }
        db.exec("COMMIT");
      } catch (cause) {
        db.exec("ROLLBACK");
        db.close();
        throw cause;
      }
    }
    return db;
  };

  const queueMutation = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = mutationQueue.then(operation);
    mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const initialize = async () => {
    await mkdir(libraryRoot, { recursive: true });
    if (
      managesSeedBootstrap &&
      !existsSync(seedBootstrapMarker) &&
      existsSync(databasePath)
    ) {
      // Another owner established this library before initialization. Treat it
      // as user data and never enter bundled-seed reconciliation.
      managesSeedBootstrap = false;
    }
    if (managesSeedBootstrap && !existsSync(seedBootstrapMarker)) {
      await createSeedBootstrapMarker();
    }
    await Promise.all([
      mkdir(deleting, { recursive: true }),
      mkdir(generations, { recursive: true }),
      mkdir(pending, { recursive: true }),
      ...(managesSeedBootstrap
        ? [mkdir(seedImport, { recursive: true })]
        : []),
    ]);
    const db = database();
    db.close();
    await recoverDeletionMarkers();
    await recoverInterruptedDeletes();
    await recoverPendingGenerations();
    if (seedLibraryRoot && managesSeedBootstrap) {
      await cleanSeedImportStaging();
      if (!hasCompletedSeedBootstrap()) {
        await importSeedLibrary(seedLibraryRoot);
      }
      await cleanSeedImportStaging();
      await removeIfPresent(seedBootstrapMarker);
      await syncDirectory(libraryRoot);
    }
  };

  const ready = () => {
    readiness ??= initialize().catch((cause: unknown) => {
      readiness = undefined;
      throw cause;
    });
    return readiness;
  };

  function rowExists(id: string): boolean {
    const db = database();
    try {
      return Boolean(
        db
          .prepare("SELECT 1 FROM generation WHERE id = ?")
          .get(id),
      );
    } finally {
      db.close();
    }
  }

  function deleteRow(id: string): void {
    const db = database();
    try {
      db.prepare("DELETE FROM generation WHERE id = ?").run(id);
    } finally {
      db.close();
    }
  }

  function insertTrack(track: MusicTrackMetadata): void {
    const db = database();
    try {
      db.exec("BEGIN IMMEDIATE");
      const existing = db
        .prepare(
          "SELECT id, title, category_key, prompt, remake_source_track_id, lyrics, duration, created_at FROM generation WHERE id = ?",
        )
        .get(track.id) as
        | {
            category_key: string | null;
            created_at: number;
            duration: number;
            id: string;
            lyrics: string;
            prompt: string;
            remake_source_track_id: string | null;
            title: string | null;
          }
        | undefined;
      if (
        existing &&
        (existing.title !== (track.title ?? null) ||
          existing.category_key !== track.categoryKey ||
          existing.prompt !== track.prompt ||
          existing.remake_source_track_id !==
            (track.remakeSourceTrackID ?? null) ||
          existing.lyrics !== track.lyrics ||
          existing.duration !== track.duration ||
          existing.created_at !== track.createdAt)
      ) {
        throw new Error(
          `AAC recovery metadata conflicts with existing track ${track.id}.`,
        );
      }
      if (!existing) {
        db.prepare(
          "INSERT INTO generation (id, title, category_key, prompt, remake_source_track_id, lyrics, duration, created_at, is_favorite, is_played) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          track.id,
          track.title ?? null,
          track.categoryKey,
          track.prompt,
          track.remakeSourceTrackID ?? null,
          track.lyrics,
          track.duration,
          track.createdAt,
          track.isFavorite ? 1 : 0,
          track.isPlayed ? 1 : 0,
        );
      }
      db.exec("COMMIT");
    } catch (cause) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // The failed statement may have ended the transaction already.
      }
      throw cause;
    } finally {
      db.close();
    }
  }

  async function cleanSeedImportStaging(): Promise<void> {
    for (const entry of await readdir(seedImport).catch(() => [] as string[])) {
      await removeIfPresent(path.join(seedImport, entry));
    }
  }

  async function createSeedBootstrapMarker(): Promise<void> {
    try {
      await writeFile(seedBootstrapMarker, "pending\n", { flag: "wx" });
      await syncFile(seedBootstrapMarker);
      await syncDirectory(libraryRoot);
    } catch (cause) {
      if (
        !cause ||
        typeof cause !== "object" ||
        !("code" in cause) ||
        cause.code !== "EEXIST"
      ) {
        throw cause;
      }
    }
  }

  function hasCompletedSeedBootstrap(): boolean {
    const db = database();
    try {
      return Boolean(
        db
          .prepare(
            "SELECT 1 FROM bundled_seed_bootstrap WHERE receipt_id = 1",
          )
          .get(),
      );
    } finally {
      db.close();
    }
  }

  function assertSeedBootstrapDatabaseIsEmpty(): void {
    const db = database();
    try {
      const row = db
        .prepare("SELECT COUNT(*) AS count FROM generation")
        .get() as { count: number };
      if (row.count !== 0) {
        throw new Error(
          "Bundled seed bootstrap requires a new, empty library.",
        );
      }
    } finally {
      db.close();
    }
  }

  function insertSeedBootstrap(
    collectionId: string,
    seeds: readonly SeedLibraryTrack[],
  ): void {
    const db = database();
    try {
      db.exec("BEGIN IMMEDIATE");
      const insertTrack = db.prepare(
        "INSERT INTO generation (id, title, category_key, prompt, remake_source_track_id, lyrics, duration, created_at, is_favorite, is_played) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 0, 0)",
      );
      const insertReceipt = db.prepare(
        "INSERT INTO bundled_seed_receipt (collection_id, track_id, audio_sha256, outcome, imported_at) VALUES (?, ?, ?, 'imported', ?)",
      );
      const importedAt = Date.now();
      for (const seed of seeds) {
        insertTrack.run(
          seed.id,
          seed.title,
          seed.categoryKey,
          seed.prompt,
          seed.lyrics,
          seed.duration,
          seed.createdAt,
        );
        insertReceipt.run(
          collectionId,
          seed.id,
          seed.audio.sha256,
          importedAt,
        );
      }
      db.prepare(
        "INSERT INTO bundled_seed_bootstrap (receipt_id, version, collection_id, track_count, completed_at) VALUES (1, ?, ?, ?, ?)",
      ).run(
        SEED_BOOTSTRAP_RECEIPT_VERSION,
        collectionId,
        seeds.length,
        importedAt,
      );
      db.exec("COMMIT");
    } catch (cause) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // The failed statement may have ended the transaction already.
      }
      throw cause;
    } finally {
      db.close();
    }
  }

  async function audioMatchesSeed(
    audioPath: string,
    seed: SeedLibraryTrack,
  ): Promise<boolean> {
    try {
      const bytes = await readFile(audioPath);
      return (
        bytes.length === seed.audio.bytes &&
        createHash("sha256").update(bytes).digest("hex") ===
          seed.audio.sha256
      );
    } catch {
      return false;
    }
  }

  async function stageSeedAudio(
    root: string,
    seed: SeedLibraryTrack,
  ): Promise<string> {
    const staged = path.join(seedImport, `${seed.id}.m4a`);
    const bytes = await readSeedAudio(root, seed);
    await writeFile(staged, bytes, { flag: "wx" });
    await syncFile(staged);
    return staged;
  }

  async function installStagedSeedAudio(
    destination: string,
    seed: SeedLibraryTrack,
    staged: string,
  ): Promise<boolean> {
    if (existsSync(destination)) {
      if (!(await audioMatchesSeed(destination, seed))) {
        throw new Error(
          `Seed track ${seed.id} conflicts with existing library audio.`,
        );
      }
      await removeIfPresent(staged);
      return false;
    }
    try {
      await link(staged, destination);
      await syncDirectory(generations);
      return true;
    } finally {
      await removeIfPresent(staged);
    }
  }

  async function importSeedLibrary(root: string): Promise<void> {
    const manifest = await readSeedLibraryManifest(root);
    assertSeedBootstrapDatabaseIsEmpty();
    const staged = new Map<string, string>();
    try {
      for (const seed of manifest.tracks) {
        staged.set(seed.id, await stageSeedAudio(root, seed));
      }
    } catch (cause) {
      await cleanSeedImportStaging();
      throw cause;
    }
    for (const seed of manifest.tracks) {
      const canonical = path.join(generations, `${seed.id}.m4a`);
      const legacy = path.join(generations, `${seed.id}.wav`);
      if (existsSync(legacy)) {
        throw new Error(
          `Seed track ${seed.id} conflicts with existing library audio.`,
        );
      }
      await installStagedSeedAudio(
        canonical,
        seed,
        staged.get(seed.id) as string,
      );
    }
    insertSeedBootstrap(manifest.collectionId, manifest.tracks);
  }

  async function recoverPendingGenerations(): Promise<void> {
    const entries = await readdir(pending).catch(() => [] as string[]);
    for (const entry of entries.sort()) {
      const match = entry.match(/^([0-9a-f-]{36})\.json$/iu);
      if (!match || !TRACK_ID.test(match[1] ?? "")) {
        continue;
      }
      const manifestPath = path.join(pending, entry);
      try {
        const manifest = parsePendingGeneration(
          JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
        );
        if (manifest.track.id !== match[1]) {
          throw new Error(
            "AAC recovery manifest does not match its track file.",
          );
        }
        await finalizePendingGeneration(manifest);
      } catch (cause) {
        await recordPendingFailure(
          match[1] ?? "unknown",
          cause,
        ).catch(() => undefined);
      }
    }
  }

  async function removePendingArtifacts(id: string): Promise<void> {
    const entries = await readdir(pending).catch(() => [] as string[]);
    for (const entry of entries) {
      if (entry.startsWith(`${id}.`)) {
        await removeIfPresent(path.join(pending, entry));
      }
    }
  }

  async function completeMarkedDeletion(
    id: string,
    markerPath: string,
  ): Promise<void> {
    deleteRow(id);
    await Promise.all([
      removeIfPresent(path.join(generations, `${id}.wav`)),
      removeIfPresent(path.join(generations, `${id}.m4a`)),
      removeIfPresent(path.join(deleting, `${id}.wav`)),
      removeIfPresent(path.join(deleting, `${id}.m4a`)),
    ]);
    await removePendingArtifacts(id);
    await Promise.all([
      syncDirectory(generations),
      syncDirectory(pending),
    ]);
    await options.trackGenerationProofStorage?.deleteTrack(id);
    await removeIfPresent(markerPath);
    await syncDirectory(deleting);
  }

  async function recoverDeletionMarkers(): Promise<void> {
    const entries = await readdir(deleting).catch(() => [] as string[]);
    for (const entry of entries.sort()) {
      const match = entry.match(/^([0-9a-f-]{36})\.delete\.json$/iu);
      const id = match?.[1];
      if (!id || !TRACK_ID.test(id)) {
        continue;
      }
      await completeMarkedDeletion(id, path.join(deleting, entry));
    }
  }

  async function recoverInterruptedDeletes(): Promise<void> {
    const entries = await readdir(deleting).catch(() => [] as string[]);
    for (const entry of entries.sort()) {
      const match = entry.match(
        /^([0-9a-f]{8}-[0-9a-f-]{27})(\.wav|\.m4a)$/iu,
      );
      const id = match?.[1];
      const extension = match?.[2]?.toLowerCase();
      if (
        !id ||
        !TRACK_ID.test(id) ||
        (extension !== ".wav" && extension !== ".m4a")
      ) {
        continue;
      }
      const tombstonePath = path.join(deleting, entry);
      if (rowExists(id)) {
        const canonicalPath = path.join(generations, `${id}${extension}`);
        if (!existsSync(canonicalPath)) {
          await rename(tombstonePath, canonicalPath);
          await syncDirectory(generations);
        } else {
          await unlink(tombstonePath);
        }
      } else {
        await unlink(tombstonePath).catch(() => undefined);
      }
    }
    await syncDirectory(deleting);
  }

  async function recordPendingFailure(
    id: string,
    cause: unknown,
  ): Promise<void> {
    if (!TRACK_ID.test(id)) {
      return;
    }
    await writeJsonAtomically(path.join(pending, `${id}.failure.json`), {
      failedAt: new Date().toISOString(),
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }

  async function ensurePendingWav(
    manifest: PendingGeneration,
  ): Promise<void> {
    const wavPath = path.join(pending, `${manifest.track.id}.wav`);
    if (existsSync(wavPath)) {
      return;
    }
    const writingPath = `${wavPath}.writing`;
    if (!existsSync(writingPath)) {
      throw new Error(
        `AAC recovery is missing the staged WAV for ${manifest.track.id}.`,
      );
    }
    const candidate = await readFile(writingPath);
    const metadata = readWavMetadata(candidate);
    if (
      metadata.channels !== manifest.expectedChannels ||
      Math.abs(
        metadata.durationSeconds - manifest.expectedDurationSeconds,
      ) > Number.EPSILON
    ) {
      throw new Error(
        `AAC recovery found an incomplete staged WAV for ${manifest.track.id}.`,
      );
    }
    await syncFile(writingPath);
    await rename(writingPath, wavPath);
    await syncDirectory(pending);
  }

  async function finalizePendingGeneration(
    manifest: PendingGeneration,
  ): Promise<MusicTrack> {
    const id = manifest.track.id;
    const manifestPath = path.join(pending, `${id}.json`);
    const wavPath = path.join(pending, `${id}.wav`);
    const encodedPath = path.join(pending, `${id}.encoded.m4a`);
    const invalidPath = path.join(pending, `${id}.invalid.m4a`);
    const canonicalPath = path.join(generations, `${id}.m4a`);
    const legacyPath = path.join(generations, `${id}.wav`);

    if (existsSync(legacyPath)) {
      throw new Error(
        `Refusing to replace legacy WAV track ${id} with AAC.`,
      );
    }

    const encodeAndInstall = async () => {
      await ensurePendingWav(manifest);
      await removeIfPresent(encodedPath);
      const result = await encodeWavToAac(wavPath, encodedPath);
      await verifyAacResult(result, encodedPath, manifest);
      await syncFile(encodedPath);
      await rename(encodedPath, canonicalPath);
      await Promise.all([
        syncDirectory(generations),
        syncDirectory(pending),
      ]);
    };

    if (existsSync(canonicalPath)) {
      try {
        const result = await encodeWavToAac(wavPath, canonicalPath);
        await verifyAacResult(result, canonicalPath, manifest);
      } catch (cause) {
        if (rowExists(id)) {
          throw cause;
        }
        await removeIfPresent(invalidPath);
        await rename(canonicalPath, invalidPath);
        await Promise.all([
          syncDirectory(generations),
          syncDirectory(pending),
        ]);
        await encodeAndInstall();
      }
    } else {
      await encodeAndInstall();
    }

    insertTrack(manifest.track);
    try {
      await removeIfPresent(wavPath);
      await removeIfPresent(`${wavPath}.writing`);
      await removeIfPresent(encodedPath);
      await removeIfPresent(invalidPath);
      await removeIfPresent(path.join(pending, `${id}.failure.json`));
      await syncDirectory(pending);
      // The manifest is the recovery journal, so it must be removed last.
      await removeIfPresent(manifestPath);
      await syncDirectory(pending);
    } catch (cause) {
      // The canonical file and row are valid; retain the journal for cleanup
      // recovery without making the successful generation report failure.
      await recordPendingFailure(id, cause).catch(() => undefined);
    }
    return withAudioDescriptor(
      manifest.track,
      descriptorForFormat(generations, id, "aac"),
    );
  }

  async function storeGeneratedWav(
    track: MusicTrackMetadata,
    wav: Buffer,
  ): Promise<MusicTrack> {
    assertTrackMetadata(track);
    const wavMetadata = readWavMetadata(wav);
    const manifest: PendingGeneration = {
      expectedChannels: wavMetadata.channels,
      expectedDurationSeconds: wavMetadata.durationSeconds,
      track,
      version: PENDING_VERSION,
    };
    const manifestPath = path.join(pending, `${track.id}.json`);
    const wavPath = path.join(pending, `${track.id}.wav`);
    await writeJsonAtomically(manifestPath, manifest);
    await writePendingWav(wavPath, wav);
    try {
      return await finalizePendingGeneration(manifest);
    } catch (cause) {
      await recordPendingFailure(track.id, cause).catch(() => undefined);
      throw cause;
    }
  }

  return {
    async delete(id) {
      assertTrackID(id);
      await ready();
      return queueMutation(async () => {
        const markerPath = path.join(deleting, `${id}.delete.json`);
        await writeJsonAtomically(markerPath, {
          id,
          requestedAt: new Date().toISOString(),
        });
        await completeMarkedDeletion(id, markerPath);
      });
    },
    async list() {
      await ready();
      await mutationQueue;
      const db = database();
      const rows = db
        .prepare(
          "SELECT id, title, category_key, prompt, remake_source_track_id, lyrics, duration, created_at, is_favorite, is_played FROM generation ORDER BY created_at DESC",
        )
        .all() as {
        category_key: string | null;
        created_at: number;
        duration: number;
        id: string;
        is_favorite: number;
        is_played: number;
        lyrics: string;
        prompt: string;
        remake_source_track_id: string | null;
        title: string | null;
      }[];
      db.close();
      return rows.map((row) => {
        const track: MusicTrackMetadata = {
          id: row.id,
          title: row.title ?? undefined,
          categoryKey: row.category_key as MusicCategoryKey | null,
          prompt: row.prompt,
          ...(row.remake_source_track_id
            ? { remakeSourceTrackID: row.remake_source_track_id }
            : {}),
          lyrics: row.lyrics,
          duration: row.duration,
          createdAt: row.created_at,
          isFavorite: row.is_favorite === 1,
          isPlayed: row.is_played === 1,
        };
        return withAudioDescriptor(
          track,
          resolveCanonicalAudio(generations, row.id),
        );
      });
    },
    async readPrompt(id) {
      assertTrackID(id);
      await ready();
      await mutationQueue;
      const db = database();
      try {
        const row = db
          .prepare("SELECT prompt FROM generation WHERE id = ?")
          .get(id) as { prompt: string } | undefined;
        return row?.prompt;
      } finally {
        db.close();
      }
    },
    async markPlayed(id) {
      assertTrackID(id);
      await ready();
      return queueMutation(async () => {
        const db = database();
        try {
          const result = db
            .prepare(
              "UPDATE generation SET is_played = 1 WHERE id = ? AND is_played = 0",
            )
            .run(id);
          return result.changes === 1;
        } finally {
          db.close();
        }
      });
    },
    async read(id) {
      assertTrackID(id);
      await ready();
      await mutationQueue;
      const descriptor = resolveCanonicalAudio(generations, id);
      return {
        audioFormat: descriptor.audioFormat,
        bytes: await readFile(descriptor.path),
        fileExtension: descriptor.fileExtension,
        mimeType: descriptor.mimeType,
      };
    },
    async setFavorite(id, isFavorite) {
      assertTrackID(id);
      if (typeof isFavorite !== "boolean") {
        throw new Error("Invalid favorite state.");
      }
      await ready();
      return queueMutation(async () => {
        const db = database();
        try {
          const existing = db
            .prepare("SELECT is_favorite FROM generation WHERE id = ?")
            .get(id) as { is_favorite: number } | undefined;
          if (!existing) {
            throw new Error(`Music track not found: ${id}`);
          }
          const result = db
            .prepare("UPDATE generation SET is_favorite = ? WHERE id = ?")
            .run(isFavorite ? 1 : 0, id);
          if (result.changes !== 1) {
            throw new Error(`Music track not found: ${id}`);
          }
          return existing.is_favorite === 0 && isFavorite;
        } finally {
          db.close();
        }
      });
    },
    storeGeneratedWav(track, wav) {
      return ready().then(() =>
        queueMutation(() => storeGeneratedWav(track, wav)),
      );
    },
    trackPath(id) {
      assertTrackID(id);
      return resolveCanonicalAudio(generations, id).path;
    },
  };
}

export function resolveCanonicalAudio(
  generations: string,
  id: string,
): CanonicalAudioDescriptor {
  assertTrackID(id);
  const wav = descriptorForFormat(generations, id, "wav");
  if (existsSync(wav.path)) {
    return wav;
  }
  const aac = descriptorForFormat(generations, id, "aac");
  return existsSync(aac.path) ? aac : wav;
}

export async function runNativeAacEncoder(
  executablePath: string,
  inputPath: string,
  outputPath: string,
): Promise<NativeAacResult> {
  const response = await new Promise<string>((resolve, reject) => {
    const child = spawn(executablePath, [], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Native AAC encoding timed out."));
    }, 5 * 60 * 1_000);
    timeout.unref();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-1_000_000);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-1_000_000);
    });
    child.once("error", (cause) => {
      clearTimeout(timeout);
      reject(cause);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(
        new Error(
          stderr.trim() ||
            stdout.trim() ||
            `Native AAC encoding exited with code ${code ?? "unknown"}.`,
        ),
      );
    });
    child.stdin.end(
      JSON.stringify({
        inputPath: path.resolve(inputPath),
        outputPath: path.resolve(outputPath),
      }),
    );
  });
  try {
    return JSON.parse(response) as NativeAacResult;
  } catch {
    throw new Error("Native AAC encoding returned invalid metadata.");
  }
}

async function verifyAacResult(
  result: NativeAacResult,
  expectedPath: string,
  manifest: PendingGeneration,
): Promise<void> {
  const output = await stat(expectedPath);
  if (
    path.resolve(result.outputPath) !== path.resolve(expectedPath) ||
    result.codec !== "aac" ||
    result.container !== "m4a" ||
    !Number.isFinite(result.bitRate) ||
    result.bitRate < AAC_MINIMUM_BIT_RATE ||
    result.bitRate > AAC_MAXIMUM_BIT_RATE ||
    result.channels !== manifest.expectedChannels ||
    !Number.isFinite(result.durationSeconds) ||
    Math.abs(
      result.durationSeconds - manifest.expectedDurationSeconds,
    ) > MAXIMUM_DURATION_DELTA_SECONDS ||
    output.size < MINIMUM_M4A_BYTES ||
    result.fileSize !== output.size ||
    !Number.isFinite(result.sampleRate) ||
    result.sampleRate <= 0
  ) {
    throw new Error(
      `AAC verification failed for ${manifest.track.id}: expected ${manifest.expectedChannels} channels, ${manifest.expectedDurationSeconds.toFixed(3)} seconds, and ${AAC_MINIMUM_BIT_RATE}-${AAC_MAXIMUM_BIT_RATE} bps; received ${result.channels} channels, ${result.durationSeconds} seconds, ${result.bitRate} bps, and ${output.size} bytes.`,
    );
  }
}

function parsePendingGeneration(value: unknown): PendingGeneration {
  if (!value || typeof value !== "object") {
    throw new Error("AAC recovery manifest is invalid.");
  }
  const manifest = value as Partial<PendingGeneration>;
  if (
    manifest.version !== PENDING_VERSION ||
    !Number.isInteger(manifest.expectedChannels) ||
    (manifest.expectedChannels ?? 0) <= 0 ||
    !Number.isFinite(manifest.expectedDurationSeconds) ||
    (manifest.expectedDurationSeconds ?? 0) <= 0 ||
    !manifest.track
  ) {
    throw new Error("AAC recovery manifest is invalid.");
  }
  assertTrackMetadata(manifest.track);
  return manifest as PendingGeneration;
}

function assertTrackMetadata(
  track: MusicTrackMetadata,
): asserts track is MusicTrackMetadata {
  assertTrackID(track.id);
  if (
    (track.categoryKey !== null &&
      typeof track.categoryKey !== "string") ||
    typeof track.prompt !== "string" ||
    typeof track.lyrics !== "string" ||
    !Number.isFinite(track.duration) ||
    track.duration <= 0 ||
    !Number.isFinite(track.createdAt) ||
    (track.title !== undefined && typeof track.title !== "string") ||
    (track.isFavorite !== undefined &&
      typeof track.isFavorite !== "boolean") ||
    (track.remakeSourceTrackID !== undefined &&
      !TRACK_ID.test(track.remakeSourceTrackID))
  ) {
    throw new Error("Invalid generated music track metadata.");
  }
}

function assertTrackID(id: string): void {
  if (!TRACK_ID.test(id)) {
    throw new Error("Invalid music track identifier.");
  }
}

function descriptorForFormat(
  generations: string,
  id: string,
  format: MusicAudioFormat,
): CanonicalAudioDescriptor {
  const fileExtension = format === "aac" ? ".m4a" : ".wav";
  const fileName = `${id}${fileExtension}`;
  return {
    audioFormat: format,
    fileExtension,
    fileName,
    mimeType: format === "aac" ? "audio/mp4" : "audio/wav",
    path: path.join(generations, fileName),
  };
}

function withAudioDescriptor(
  track: MusicTrackMetadata,
  descriptor: CanonicalAudioDescriptor,
): MusicTrack {
  return {
    ...track,
    isFavorite: track.isFavorite ?? false,
    isPlayed: track.isPlayed ?? false,
    audioFormat: descriptor.audioFormat,
    fileExtension: descriptor.fileExtension,
    mimeType: descriptor.mimeType,
  };
}

function readWavMetadata(source: Buffer): WavMetadata {
  if (
    source.length < 44 ||
    source.toString("ascii", 0, 4) !== "RIFF" ||
    source.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Generated audio is not a valid WAV file.");
  }
  let channels = 0;
  let byteRate = 0;
  let dataSize = 0;
  for (let offset = 12; offset + 8 <= source.length; ) {
    const chunk = source.toString("ascii", offset, offset + 4);
    const chunkSize = source.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > source.length) {
      throw new Error("Generated WAV contains a truncated chunk.");
    }
    if (chunk === "fmt " && chunkSize >= 16) {
      channels = source.readUInt16LE(dataOffset + 2);
      byteRate = source.readUInt32LE(dataOffset + 8);
    } else if (chunk === "data") {
      dataSize = chunkSize;
    }
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  if (channels <= 0 || byteRate <= 0 || dataSize <= 0) {
    throw new Error("Generated WAV is missing audio format data.");
  }
  return {
    channels,
    durationSeconds: dataSize / byteRate,
  };
}

async function writePendingWav(
  destination: string,
  value: Buffer,
): Promise<void> {
  const writingPath = `${destination}.writing`;
  await removeIfPresent(writingPath);
  await writeFile(writingPath, value, { flag: "wx" });
  await syncFile(writingPath);
  await rename(writingPath, destination);
  await syncDirectory(path.dirname(destination));
}

async function writeBufferAtomically(
  destination: string,
  value: Buffer,
): Promise<void> {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, value, { flag: "wx" });
  await syncFile(temporary);
  await rename(temporary, destination);
  await syncDirectory(path.dirname(destination));
}

async function writeJsonAtomically(
  destination: string,
  value: unknown,
): Promise<void> {
  await writeBufferAtomically(
    destination,
    Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"),
  );
}

async function syncFile(filePath: string): Promise<void> {
  const handle = await open(filePath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(directoryPath: string): Promise<void> {
  const handle = await open(directoryPath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function readProofTrackID(proof: unknown): string | undefined {
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
    return undefined;
  }
  const track = (proof as Record<string, unknown>).track;
  if (!track || typeof track !== "object" || Array.isArray(track)) {
    return undefined;
  }
  const id = (track as Record<string, unknown>).id;
  return typeof id === "string" ? id : undefined;
}

function isMissingPathError(cause: unknown): boolean {
  return Boolean(
    cause &&
      typeof cause === "object" &&
      "code" in cause &&
      cause.code === "ENOENT",
  );
}

async function removeIfPresent(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (cause) {
    if (!isMissingPathError(cause)) {
      throw cause;
    }
  }
}
