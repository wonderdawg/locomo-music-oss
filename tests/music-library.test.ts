import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import {
  createMusicLibrary,
  type EncodeWavToAac,
  type MusicTrackMetadata,
} from "../src/main/music-library";
import { createCppMusicService } from "../src/main/music-cpp";
import type { MusicService } from "../src/main/music";

const LEGACY_ID = "11111111-1111-4111-8111-111111111111";
const AAC_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_HOUSE_ID = "33333333-3333-4333-8333-333333333333";
const CATEGORY_INDIE_ID = "44444444-4444-4444-8444-444444444444";
const CATEGORY_UNKNOWN_ID = "55555555-5555-4555-8555-555555555555";
const CATEGORY_ASSIGNED_ID = "66666666-6666-4666-8666-666666666666";
const CATEGORY_KNOWN_ID = "77777777-7777-4777-8777-777777777777";
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), "locomo-aac-library-test-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) =>
        rm(directory, { force: true, recursive: true }),
      ),
  );
});

describe("mixed canonical music library", () => {
  it("resolves, reads, and deletes legacy WAV and new M4A tracks", async () => {
    const libraryRoot = await seedMixedLibrary();
    const generations = path.join(libraryRoot, "generations");
    const legacyBytes = Buffer.from("legacy-wav");
    const aacBytes = Buffer.from("new-aac");
    await Promise.all([
      writeFile(path.join(generations, `${LEGACY_ID}.wav`), legacyBytes),
      writeFile(path.join(generations, `${AAC_ID}.m4a`), aacBytes),
      // A stray M4A can never relabel a real legacy WAV.
      writeFile(path.join(generations, `${LEGACY_ID}.m4a`), aacBytes),
    ]);
    const databaseBefore = readRows(libraryRoot);
    const library = createMusicLibrary({ libraryRoot });

    const tracks = await library.list();
    expect(tracks).toEqual([
      expect.objectContaining({
        id: AAC_ID,
        audioFormat: "aac",
        fileExtension: ".m4a",
        mimeType: "audio/mp4",
      }),
      expect.objectContaining({
        id: LEGACY_ID,
        audioFormat: "wav",
        fileExtension: ".wav",
        mimeType: "audio/wav",
      }),
    ]);
    await expect(library.read(LEGACY_ID)).resolves.toMatchObject({
      audioFormat: "wav",
      bytes: legacyBytes,
      fileExtension: ".wav",
      mimeType: "audio/wav",
    });
    await expect(library.read(AAC_ID)).resolves.toMatchObject({
      audioFormat: "aac",
      bytes: aacBytes,
      fileExtension: ".m4a",
      mimeType: "audio/mp4",
    });
    await expect(library.readPrompt(LEGACY_ID)).resolves.toBe(
      "House. Legacy.",
    );
    await expect(
      library.readPrompt(CATEGORY_KNOWN_ID),
    ).resolves.toBeUndefined();
    expect(library.trackPath(LEGACY_ID)).toBe(
      path.join(generations, `${LEGACY_ID}.wav`),
    );
    expect(library.trackPath(AAC_ID)).toBe(
      path.join(generations, `${AAC_ID}.m4a`),
    );
    expect(readRows(libraryRoot)).toEqual(databaseBefore);

    await library.delete(LEGACY_ID);
    await library.delete(AAC_ID);
    expect(readRows(libraryRoot)).toEqual([]);
    await expect(readdir(generations)).resolves.toEqual([]);
  });

  it("defaults existing rows to unfavorited and persists favorite toggles", async () => {
    const libraryRoot = await seedMixedLibrary();
    const canonical = path.join(
      libraryRoot,
      "generations",
      `${LEGACY_ID}.wav`,
    );
    const originalAudio = Buffer.from("legacy-audio-is-untouched");
    await writeFile(canonical, originalAudio);
    const library = createMusicLibrary({ libraryRoot });

    const existing = await library.list();
    expect(existing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryKey: "existing/house",
          id: LEGACY_ID,
          isFavorite: false,
        }),
      ]),
    );
    expect(
      existing.every((track) => track.isFavorite === false),
    ).toBe(true);

    await expect(library.setFavorite(LEGACY_ID, true)).resolves.toBe(
      true,
    );
    const restarted = createMusicLibrary({ libraryRoot });
    await expect(restarted.list()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: LEGACY_ID,
          isFavorite: true,
        }),
      ]),
    );
    expect(await readFile(canonical)).toEqual(originalAudio);

    await expect(restarted.setFavorite(LEGACY_ID, true)).resolves.toBe(
      false,
    );
    await expect(restarted.setFavorite(LEGACY_ID, false)).resolves.toBe(
      false,
    );
    await expect(restarted.list()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: LEGACY_ID,
          isFavorite: false,
        }),
      ]),
    );
    const db = new DatabaseSync(
      path.join(libraryRoot, "music.sqlite"),
      { readOnly: true },
    );
    const columns = db
      .prepare("PRAGMA table_info(generation)")
      .all() as { name: string }[];
    const schema = db.prepare("PRAGMA user_version").get();
    db.close();
    expect(columns.map((column) => column.name)).toContain(
      "is_favorite",
    );
    expect(columns.map((column) => column.name)).toContain(
      "remake_source_track_id",
    );
    expect(columns.map((column) => column.name)).toContain("is_played");
    expect(schema).toEqual({ user_version: 4 });

    await restarted.setFavorite(LEGACY_ID, true);
    await restarted.delete(LEGACY_ID);
    expect(
      (await restarted.list()).some((track) => track.id === LEGACY_ID),
    ).toBe(false);
    await expect(stat(canonical)).rejects.toThrow();
  });

  it("migrates established tracks as played and persists only a fresh track's first play", async () => {
    const establishedRoot = await seedMixedLibrary();
    const established = createMusicLibrary({
      libraryRoot: establishedRoot,
    });

    expect(
      (await established.list()).every((track) => track.isPlayed),
    ).toBe(true);
    await expect(established.markPlayed(LEGACY_ID)).resolves.toBe(false);

    const freshRoot = await temporaryDirectory();
    const fresh = createMusicLibrary({
      encodeWavToAac: successfulEncoder(),
      libraryRoot: freshRoot,
    });
    await fresh.storeGeneratedWav(
      generatedTrack(AAC_ID),
      createStereoWav16(48_000),
    );
    await expect(fresh.list()).resolves.toEqual([
      expect.objectContaining({ id: AAC_ID, isPlayed: false }),
    ]);
    await expect(fresh.markPlayed(AAC_ID)).resolves.toBe(true);
    await expect(fresh.markPlayed(AAC_ID)).resolves.toBe(false);
    await expect(
      createMusicLibrary({ libraryRoot: freshRoot }).list(),
    ).resolves.toEqual([
      expect.objectContaining({ id: AAC_ID, isPlayed: true }),
    ]);
  });

  it("admits only a verified AAC after atomic canonical installation", async () => {
    const libraryRoot = await temporaryDirectory();
    const track = {
      ...generatedTrack(AAC_ID),
      remakeSourceTrackID: LEGACY_ID,
    };
    const wav = createStereoWav16(48_000);
    const encode = successfulEncoder();
    const library = createMusicLibrary({
      encodeWavToAac: encode,
      libraryRoot,
    });

    const stored = await library.storeGeneratedWav(track, wav);
    expect(stored).toMatchObject({
      id: AAC_ID,
      audioFormat: "aac",
      fileExtension: ".m4a",
      mimeType: "audio/mp4",
      remakeSourceTrackID: LEGACY_ID,
    });
    await expect(
      createMusicLibrary({ libraryRoot }).list(),
    ).resolves.toEqual([
      expect.objectContaining({
        id: AAC_ID,
        isFavorite: false,
        remakeSourceTrackID: LEGACY_ID,
      }),
    ]);
    expect(readRows(libraryRoot)).toEqual([
      expect.objectContaining({ id: AAC_ID }),
    ]);
    const canonical = path.join(
      libraryRoot,
      "generations",
      `${AAC_ID}.m4a`,
    );
    await expect(stat(canonical)).resolves.toMatchObject({ size: 2_048 });
    await expect(
      stat(path.join(libraryRoot, "generations", `${AAC_ID}.wav`)),
    ).rejects.toThrow();
    expect(
      (await readdir(path.join(libraryRoot, ".aac-pending"))).filter(
        (entry) => entry.startsWith(AAC_ID),
      ),
    ).toEqual([]);
  });

  it("keeps retry evidence and no row when AAC verification fails", async () => {
    const libraryRoot = await temporaryDirectory();
    const track = generatedTrack(AAC_ID);
    const wav = createStereoWav16(48_000);
    const library = createMusicLibrary({
      encodeWavToAac: successfulEncoder({ bitRate: 128_000 }),
      libraryRoot,
    });

    await expect(library.storeGeneratedWav(track, wav)).rejects.toThrow(
      "AAC verification failed",
    );
    expect(readRows(libraryRoot)).toEqual([]);
    await expect(
      stat(path.join(libraryRoot, "generations", `${AAC_ID}.m4a`)),
    ).rejects.toThrow();
    const pending = await readdir(path.join(libraryRoot, ".aac-pending"));
    expect(pending).toEqual(
      expect.arrayContaining([
        `${AAC_ID}.failure.json`,
        `${AAC_ID}.json`,
        `${AAC_ID}.wav`,
      ]),
    );
    expect(await library.list()).toEqual([]);
  });

  it.each([
    ["channel count", { channels: 1 }],
    ["duration", { durationSeconds: 2 }],
  ])("rejects an AAC with the wrong %s", async (_label, overrides) => {
    const libraryRoot = await temporaryDirectory();
    const library = createMusicLibrary({
      encodeWavToAac: successfulEncoder(overrides),
      libraryRoot,
    });

    await expect(
      library.storeGeneratedWav(
        generatedTrack(AAC_ID),
        createStereoWav16(48_000),
      ),
    ).rejects.toThrow("AAC verification failed");
    expect(readRows(libraryRoot)).toEqual([]);
  });

  it("recovers a failed conversion exactly once on a later startup", async () => {
    const libraryRoot = await temporaryDirectory();
    const track = generatedTrack(AAC_ID);
    const wav = createStereoWav16(48_000);
    const failingLibrary = createMusicLibrary({
      encodeWavToAac: async () => {
        throw new Error("simulated encoder failure");
      },
      libraryRoot,
    });
    await expect(
      failingLibrary.storeGeneratedWav(track, wav),
    ).rejects.toThrow("simulated encoder failure");

    let recoveryCalls = 0;
    const recoveredLibrary = createMusicLibrary({
      encodeWavToAac: async (...arguments_) => {
        recoveryCalls += 1;
        return successfulEncoder()(...arguments_);
      },
      libraryRoot,
    });
    await expect(recoveredLibrary.list()).resolves.toEqual([
      expect.objectContaining({ id: AAC_ID, audioFormat: "aac" }),
    ]);
    expect(recoveryCalls).toBe(1);
    await recoveredLibrary.list();
    expect(recoveryCalls).toBe(1);
  });

  it("promotes a complete deterministic WAV write after an interrupted rename", async () => {
    const libraryRoot = await temporaryDirectory();
    const track = generatedTrack(AAC_ID);
    const failingLibrary = createMusicLibrary({
      encodeWavToAac: async () => {
        throw new Error("stop after WAV staging");
      },
      libraryRoot,
    });
    await expect(
      failingLibrary.storeGeneratedWav(
        track,
        createStereoWav16(48_000),
      ),
    ).rejects.toThrow("stop after WAV staging");
    const wavPath = path.join(
      libraryRoot,
      ".aac-pending",
      `${AAC_ID}.wav`,
    );
    await rename(wavPath, `${wavPath}.writing`);

    const recoveredLibrary = createMusicLibrary({
      encodeWavToAac: successfulEncoder(),
      libraryRoot,
    });
    await expect(recoveredLibrary.list()).resolves.toEqual([
      expect.objectContaining({ id: AAC_ID, audioFormat: "aac" }),
    ]);
    expect(
      (await readdir(path.join(libraryRoot, ".aac-pending"))).filter(
        (entry) => entry.startsWith(AAC_ID),
      ),
    ).toEqual([]);
  });

  it("recovers an installed verified M4A before inserting its missing row", async () => {
    const libraryRoot = await temporaryDirectory();
    const track = generatedTrack(AAC_ID);
    const wav = createStereoWav16(48_000);
    const failingLibrary = createMusicLibrary({
      encodeWavToAac: async () => {
        throw new Error("stop before install");
      },
      libraryRoot,
    });
    await expect(
      failingLibrary.storeGeneratedWav(track, wav),
    ).rejects.toThrow("stop before install");

    const canonical = path.join(
      libraryRoot,
      "generations",
      `${AAC_ID}.m4a`,
    );
    const installedBytes = Buffer.alloc(2_048, 7);
    await writeFile(canonical, installedBytes);
    let inspectedPath = "";
    const recoveredLibrary = createMusicLibrary({
      encodeWavToAac: async (_inputPath, outputPath) => {
        inspectedPath = outputPath;
        return aacResult(outputPath, installedBytes.length);
      },
      libraryRoot,
    });

    await expect(recoveredLibrary.list()).resolves.toEqual([
      expect.objectContaining({ id: AAC_ID, audioFormat: "aac" }),
    ]);
    expect(inspectedPath).toBe(canonical);
    expect(await readFile(canonical)).toEqual(installedBytes);
    expect(readRows(libraryRoot)).toEqual([
      expect.objectContaining({ id: AAC_ID }),
    ]);
  });

  it("quarantines an invalid installed M4A and re-encodes the retained WAV", async () => {
    const libraryRoot = await temporaryDirectory();
    const track = generatedTrack(AAC_ID);
    const failingLibrary = createMusicLibrary({
      encodeWavToAac: async () => {
        throw new Error("stop before install");
      },
      libraryRoot,
    });
    await expect(
      failingLibrary.storeGeneratedWav(
        track,
        createStereoWav16(48_000),
      ),
    ).rejects.toThrow("stop before install");
    const canonical = path.join(
      libraryRoot,
      "generations",
      `${AAC_ID}.m4a`,
    );
    await writeFile(canonical, Buffer.from("invalid canonical"));
    const attemptedOutputs: string[] = [];
    const recoveredLibrary = createMusicLibrary({
      encodeWavToAac: async (inputPath, outputPath) => {
        attemptedOutputs.push(outputPath);
        if (outputPath === canonical) {
          throw new Error("invalid existing M4A");
        }
        return successfulEncoder()(inputPath, outputPath);
      },
      libraryRoot,
    });

    await expect(recoveredLibrary.list()).resolves.toEqual([
      expect.objectContaining({ id: AAC_ID, audioFormat: "aac" }),
    ]);
    expect(attemptedOutputs).toEqual([
      canonical,
      path.join(
        libraryRoot,
        ".aac-pending",
        `${AAC_ID}.encoded.m4a`,
      ),
    ]);
    await expect(stat(canonical)).resolves.toMatchObject({ size: 2_048 });
    expect(
      (await readdir(path.join(libraryRoot, ".aac-pending"))).filter(
        (entry) => entry.startsWith(AAC_ID),
      ),
    ).toEqual([]);
  });

  it("finishes row-before-cleanup recovery after the staged WAV is gone", async () => {
    const libraryRoot = await temporaryDirectory();
    const track = generatedTrack(AAC_ID);
    const failingLibrary = createMusicLibrary({
      encodeWavToAac: async () => {
        throw new Error("stop before install");
      },
      libraryRoot,
    });
    await expect(
      failingLibrary.storeGeneratedWav(
        track,
        createStereoWav16(48_000),
      ),
    ).rejects.toThrow("stop before install");
    const canonical = path.join(
      libraryRoot,
      "generations",
      `${AAC_ID}.m4a`,
    );
    const installedBytes = Buffer.alloc(2_048, 9);
    await writeFile(canonical, installedBytes);
    insertRow(libraryRoot, track);
    await unlink(
      path.join(libraryRoot, ".aac-pending", `${AAC_ID}.wav`),
    );

    const recoveredLibrary = createMusicLibrary({
      encodeWavToAac: async (_inputPath, outputPath) =>
        aacResult(outputPath, installedBytes.length),
      libraryRoot,
    });
    await expect(recoveredLibrary.list()).resolves.toEqual([
      expect.objectContaining({ id: AAC_ID, audioFormat: "aac" }),
    ]);
    expect(
      (await readdir(path.join(libraryRoot, ".aac-pending"))).filter(
        (entry) => entry.startsWith(AAC_ID),
      ),
    ).toEqual([]);
  });

  it("invalidates pending recovery so a deleted track cannot resurrect", async () => {
    const libraryRoot = await temporaryDirectory();
    const track = generatedTrack(AAC_ID);
    const library = createMusicLibrary({
      encodeWavToAac: async () => {
        throw new Error("leave retry journal");
      },
      libraryRoot,
    });
    await expect(
      library.storeGeneratedWav(
        track,
        createStereoWav16(48_000),
      ),
    ).rejects.toThrow("leave retry journal");
    await writeFile(
      path.join(libraryRoot, "generations", `${AAC_ID}.m4a`),
      Buffer.alloc(2_048, 4),
    );
    insertRow(libraryRoot, track);

    await library.delete(AAC_ID);
    const restarted = createMusicLibrary({
      encodeWavToAac: successfulEncoder(),
      libraryRoot,
    });
    await expect(restarted.list()).resolves.toEqual([]);
    expect(readRows(libraryRoot)).toEqual([]);
    expect(
      (await readdir(path.join(libraryRoot, ".aac-pending"))).filter(
        (entry) => entry.startsWith(AAC_ID),
      ),
    ).toEqual([]);
  });

  it("restores a tombstoned file when deletion stopped before its row", async () => {
    const libraryRoot = await seedMixedLibrary();
    const generations = path.join(libraryRoot, "generations");
    const deleting = path.join(libraryRoot, ".audio-deleting");
    const canonical = path.join(generations, `${LEGACY_ID}.wav`);
    const tombstone = path.join(deleting, `${LEGACY_ID}.wav`);
    await mkdir(deleting, { recursive: true });
    await writeFile(canonical, Buffer.from("legacy"));
    await rename(canonical, tombstone);

    const library = createMusicLibrary({ libraryRoot });
    await library.list();
    await expect(readFile(canonical)).resolves.toEqual(
      Buffer.from("legacy"),
    );
    await expect(stat(tombstone)).rejects.toThrow();
    expect(readRows(libraryRoot)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: LEGACY_ID })]),
    );
  });

  it("finishes tombstone cleanup when the deleted row is already gone", async () => {
    const libraryRoot = await temporaryDirectory();
    const deleting = path.join(libraryRoot, ".audio-deleting");
    const tombstone = path.join(deleting, `${AAC_ID}.m4a`);
    await mkdir(deleting, { recursive: true });
    await writeFile(tombstone, Buffer.from("deleted"));

    const library = createMusicLibrary({ libraryRoot });
    await expect(library.list()).resolves.toEqual([]);
    await expect(stat(tombstone)).rejects.toThrow();
  });

  it("completes a durable marked deletion before pending recovery", async () => {
    const libraryRoot = await seedMixedLibrary();
    const generations = path.join(libraryRoot, "generations");
    const pending = path.join(libraryRoot, ".aac-pending");
    const deleting = path.join(libraryRoot, ".audio-deleting");
    const canonical = path.join(generations, `${LEGACY_ID}.wav`);
    const pendingManifest = path.join(pending, `${LEGACY_ID}.json`);
    const marker = path.join(deleting, `${LEGACY_ID}.delete.json`);
    await Promise.all([
      mkdir(pending, { recursive: true }),
      mkdir(deleting, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(canonical, Buffer.from("legacy")),
      writeFile(pendingManifest, "would otherwise be retried"),
      writeFile(marker, JSON.stringify({ id: LEGACY_ID })),
    ]);

    const restarted = createMusicLibrary({ libraryRoot });
    const listed = await restarted.list();
    expect(listed.map((track) => track.id)).toEqual([AAC_ID]);
    expect(readRows(libraryRoot).map((row) => row.id)).toEqual([AAC_ID]);
    await expect(stat(canonical)).rejects.toThrow();
    await expect(stat(pendingManifest)).rejects.toThrow();
    await expect(stat(marker)).rejects.toThrow();
  });
});

const backends = [
  {
    create(libraryRoot: string, runtimeRoot: string) {
      const nativeCodeRoot = path.join(runtimeRoot, "..", "bundle-code");
      return createCppMusicService({
        aceServerPath: path.join(nativeCodeRoot, "ace-server"),
        helperSha256: "test-helper-sha256",
        libraryRoot,
        nativeCodeRoot,
        runtimeRoot,
      });
    },
    name: "C++",
  },
] as const satisfies readonly {
  readonly create: (libraryRoot: string, runtimeRoot: string) => MusicService;
  readonly name: string;
}[];

describe.each(backends)("$name music-library category migration", (backend) => {
  it("idempotently backfills known legacy prefixes and leaves unknown songs nullable", async () => {
    const root = await temporaryDirectory();
    const libraryRoot = path.join(root, "library");
    await mkdir(libraryRoot, { recursive: true });
    const databasePath = path.join(libraryRoot, "music.sqlite");
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE generation (
        id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        lyrics TEXT NOT NULL,
        duration REAL NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    const insert = legacy.prepare(
      "INSERT INTO generation (id, prompt, lyrics, duration, created_at) VALUES (?, ?, ?, ?, ?)",
    );
    insert.run(CATEGORY_HOUSE_ID, "House. Original prompt", "", 60, 1);
    insert.run(
      CATEGORY_INDIE_ID,
      "Indie pop. Original prompt",
      "lyrics",
      61,
      2,
    );
    insert.run(
      CATEGORY_UNKNOWN_ID,
      "Unmapped category prompt",
      "lyrics",
      62,
      3,
    );
    legacy.close();

    const service = backend.create(
      libraryRoot,
      path.join(root, "runtime"),
    );
    const first = await service.list();
    const second = await service.list();
    service.dispose();

    expect(first).toEqual(second);
    expect(
      Object.fromEntries(first.map((track) => [track.id, track.categoryKey])),
    ).toEqual({
      [CATEGORY_HOUSE_ID]: "existing/house",
      [CATEGORY_INDIE_ID]: "existing/indie-pop",
      [CATEGORY_UNKNOWN_ID]: null,
    });

    const migrated = new DatabaseSync(databasePath);
    const columns = migrated
      .prepare("PRAGMA table_info(generation)")
      .all() as { name: string }[];
    const rows = migrated
      .prepare(
        "SELECT id, title, category_key, prompt, lyrics, duration, created_at FROM generation ORDER BY created_at",
      )
      .all();
    migrated.close();

    expect(columns.map((column) => column.name)).toContain("category_key");
    expect(columns.map((column) => column.name)).toContain("title");
    expect(columns.map((column) => column.name)).toContain("is_favorite");
    expect(columns.map((column) => column.name)).toContain(
      "remake_source_track_id",
    );
    expect(rows).toEqual([
      {
        category_key: "existing/house",
        created_at: 1,
        duration: 60,
        id: CATEGORY_HOUSE_ID,
        lyrics: "",
        prompt: "House. Original prompt",
        title: null,
      },
      {
        category_key: "existing/indie-pop",
        created_at: 2,
        duration: 61,
        id: CATEGORY_INDIE_ID,
        lyrics: "lyrics",
        prompt: "Indie pop. Original prompt",
        title: null,
      },
      {
        category_key: null,
        created_at: 3,
        duration: 62,
        id: CATEGORY_UNKNOWN_ID,
        lyrics: "lyrics",
        prompt: "Unmapped category prompt",
        title: null,
      },
    ]);
  });

  it("round-trips an assigned experimental key without reclassifying by prompt", async () => {
    const root = await temporaryDirectory();
    const libraryRoot = path.join(root, "library");
    await mkdir(libraryRoot, { recursive: true });
    const databasePath = path.join(libraryRoot, "music.sqlite");
    const seeded = new DatabaseSync(databasePath);
    seeded.exec(`
      CREATE TABLE generation (
        id TEXT PRIMARY KEY,
        title TEXT,
        category_key TEXT,
        prompt TEXT NOT NULL,
        lyrics TEXT NOT NULL,
        duration REAL NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    seeded
      .prepare(
        "INSERT INTO generation (id, title, category_key, prompt, lyrics, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        CATEGORY_ASSIGNED_ID,
        "Assigned song",
        "experimental/narrative-pop",
        "House. A deliberately misleading legacy-looking prompt",
        "lyrics",
        120,
        10,
      );
    seeded.close();

    const service = backend.create(
      libraryRoot,
      path.join(root, "runtime"),
    );
    await expect(service.list()).resolves.toEqual([
      {
        audioFormat: "wav",
        categoryKey: "experimental/narrative-pop",
        createdAt: 10,
        duration: 120,
        fileExtension: ".wav",
        id: CATEGORY_ASSIGNED_ID,
        isFavorite: false,
        isPlayed: true,
        lyrics: "lyrics",
        mimeType: "audio/wav",
        prompt: "House. A deliberately misleading legacy-looking prompt",
        title: "Assigned song",
      },
    ]);
    service.dispose();
  });

  it("backfills a newly added category column without lowering a newer schema version", async () => {
    const root = await temporaryDirectory();
    const libraryRoot = path.join(root, "library");
    await mkdir(libraryRoot, { recursive: true });
    const databasePath = path.join(libraryRoot, "music.sqlite");
    const newer = new DatabaseSync(databasePath);
    newer.exec(`
      CREATE TABLE generation (
        id TEXT PRIMARY KEY,
        title TEXT,
        prompt TEXT NOT NULL,
        lyrics TEXT NOT NULL,
        duration REAL NOT NULL,
        created_at INTEGER NOT NULL
      );
      PRAGMA user_version = 7;
    `);
    const insert = newer.prepare(
      "INSERT INTO generation (id, title, prompt, lyrics, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    insert.run(
      CATEGORY_KNOWN_ID,
      "Known",
      "House. Legacy prompt",
      "",
      60,
      1,
    );
    insert.run(
      CATEGORY_UNKNOWN_ID,
      "Unknown",
      "No known prefix",
      "",
      60,
      2,
    );
    newer.close();

    const service = backend.create(
      libraryRoot,
      path.join(root, "runtime"),
    );
    const tracks = await service.list();
    await service.list();
    service.dispose();

    expect(
      Object.fromEntries(
        tracks.map((track) => [track.id, track.categoryKey]),
      ),
    ).toEqual({
      [CATEGORY_KNOWN_ID]: "existing/house",
      [CATEGORY_UNKNOWN_ID]: null,
    });

    const verified = new DatabaseSync(databasePath);
    const schema = verified.prepare("PRAGMA user_version").get();
    const columns = verified
      .prepare("PRAGMA table_info(generation)")
      .all() as { name: string }[];
    verified.close();
    expect(schema).toEqual({ user_version: 7 });
    expect(columns.map((column) => column.name)).toContain("category_key");
    expect(columns.map((column) => column.name)).toContain("is_favorite");
    expect(columns.map((column) => column.name)).toContain(
      "remake_source_track_id",
    );
  });
});

function successfulEncoder(
  overrides: Partial<ReturnType<typeof aacResult>> = {},
): EncodeWavToAac {
  return async (_inputPath, outputPath) => {
    const bytes = Buffer.alloc(2_048, 5);
    await writeFile(outputPath, bytes);
    return {
      ...aacResult(outputPath, bytes.length),
      ...overrides,
    };
  };
}

function aacResult(outputPath: string, fileSize: number) {
  return {
    bitRate: 248_000,
    channels: 2,
    codec: "aac" as const,
    container: "m4a" as const,
    durationSeconds: 1,
    fileSize,
    outputPath,
    sampleRate: 48_000,
  };
}

function generatedTrack(id: string): MusicTrackMetadata {
  return {
    id,
    title: "New AAC Track",
    categoryKey: "existing/house",
    prompt: "House. New AAC track.",
    lyrics: "",
    duration: 1,
    createdAt: 2,
  };
}

async function seedMixedLibrary(): Promise<string> {
  const libraryRoot = await temporaryDirectory();
  await mkdir(path.join(libraryRoot, "generations"), { recursive: true });
  const db = new DatabaseSync(path.join(libraryRoot, "music.sqlite"));
  db.exec(`
    CREATE TABLE generation (
      id TEXT PRIMARY KEY,
      title TEXT,
      prompt TEXT NOT NULL,
      lyrics TEXT NOT NULL,
      duration REAL NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  const insert = db.prepare(
    "INSERT INTO generation (id, title, prompt, lyrics, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  insert.run(LEGACY_ID, "Legacy", "House. Legacy.", "", 1, 1);
  insert.run(AAC_ID, "AAC", "House. AAC.", "", 1, 2);
  db.close();
  return libraryRoot;
}

function readRows(libraryRoot: string) {
  const db = new DatabaseSync(path.join(libraryRoot, "music.sqlite"), {
    readOnly: true,
  });
  try {
    return db
      .prepare(
        "SELECT id, title, prompt, lyrics, duration, created_at FROM generation ORDER BY created_at ASC",
      )
      .all();
  } finally {
    db.close();
  }
}

function insertRow(
  libraryRoot: string,
  track: MusicTrackMetadata,
): void {
  const db = new DatabaseSync(path.join(libraryRoot, "music.sqlite"));
  try {
    db.prepare(
      "INSERT INTO generation (id, title, category_key, prompt, lyrics, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      track.id,
      track.title ?? null,
      track.categoryKey,
      track.prompt,
      track.lyrics,
      track.duration,
      track.createdAt,
    );
  } finally {
    db.close();
  }
}

function createStereoWav16(frames: number): Buffer {
  const channels = 2;
  const sampleRate = 48_000;
  const bytesPerSample = 2;
  const dataBytes = frames * channels * bytesPerSample;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  wav.writeUInt16LE(channels * bytesPerSample, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataBytes, 40);
  return wav;
}
