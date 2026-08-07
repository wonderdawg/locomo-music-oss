import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import {
  createMusicLibrary,
  createTrackGenerationProofStorage,
  type MusicLibrary,
  type TrackGenerationProofStorage,
} from "../src/main/music-library";

const DELETED_TRACK_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TRACK_ID = "22222222-2222-4222-8222-222222222222";
const temporaryDirectories: string[] = [];

interface ProofDeletionFixture {
  readonly lastProofPath: string;
  readonly library: MusicLibrary;
  readonly libraryRoot: string;
  readonly proofsRoot: string;
  readonly runtimeRoot: string;
  readonly trackGenerationProofStorage: TrackGenerationProofStorage;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("track deletion proof privacy", () => {
  it("deletes the track and only its associated proof directory", async () => {
    const fixture = await createFixture([DELETED_TRACK_ID]);
    const proofDirectory = await writeProofDirectory(
      fixture.proofsRoot,
      DELETED_TRACK_ID,
      "deleted-track-proof",
    );

    await expect(fixture.library.delete(DELETED_TRACK_ID)).resolves.toBe(
      undefined,
    );

    await expect(fixture.library.list()).resolves.toEqual([]);
    await expectMissing(
      path.join(
        fixture.libraryRoot,
        "generations",
        `${DELETED_TRACK_ID}.m4a`,
      ),
    );
    await expectMissing(proofDirectory);
    await expect(readdir(fixture.proofsRoot)).resolves.toEqual([]);
  });

  it("treats missing proof data as a successful no-op", async () => {
    const fixture = await createFixture([DELETED_TRACK_ID]);

    await expect(fixture.library.delete(DELETED_TRACK_ID)).resolves.toBe(
      undefined,
    );

    await expect(fixture.library.list()).resolves.toEqual([]);
    await expectMissing(fixture.runtimeRoot);
  });

  it("finishes proof cleanup while recovering a durable deletion marker", async () => {
    const fixture = await createFixture([DELETED_TRACK_ID]);
    const proofDirectory = await writeProofDirectory(
      fixture.proofsRoot,
      DELETED_TRACK_ID,
      "interrupted-delete-proof",
    );
    await writeLastProof(fixture, DELETED_TRACK_ID);
    const markerPath = path.join(
      fixture.libraryRoot,
      ".audio-deleting",
      `${DELETED_TRACK_ID}.delete.json`,
    );
    await writeFile(
      markerPath,
      `${JSON.stringify({
        id: DELETED_TRACK_ID,
        requestedAt: new Date(0).toISOString(),
      })}\n`,
    );

    const recovered = createMusicLibrary({
      libraryRoot: fixture.libraryRoot,
      trackGenerationProofStorage: createTrackGenerationProofStorage({
        lastProofPath: fixture.lastProofPath,
        proofsRoot: fixture.proofsRoot,
      }),
    });
    await expect(recovered.list()).resolves.toEqual([]);

    await expectMissing(proofDirectory);
    await expectMissing(fixture.lastProofPath);
    await expectMissing(markerPath);
  });

  it("preserves every other track, proof, and runtime log", async () => {
    const fixture = await createFixture([
      DELETED_TRACK_ID,
      OTHER_TRACK_ID,
    ]);
    const deletedProofDirectory = await writeProofDirectory(
      fixture.proofsRoot,
      DELETED_TRACK_ID,
      "deleted-track-proof",
    );
    const otherProofDirectory = await writeProofDirectory(
      fixture.proofsRoot,
      OTHER_TRACK_ID,
      "other-track-proof",
    );
    const otherProofPath = path.join(otherProofDirectory, "proof.json");
    const storeMetadataPath = path.join(
      fixture.proofsRoot,
      "store-metadata.json",
    );
    const logPath = path.join(fixture.runtimeRoot, "logs", "ace-server.log");
    await mkdir(path.dirname(logPath), { recursive: true });
    await Promise.all([
      writeFile(storeMetadataPath, "proof-store-metadata"),
      writeFile(logPath, "general-runtime-log"),
    ]);

    await fixture.library.delete(DELETED_TRACK_ID);

    await expectMissing(deletedProofDirectory);
    await expect(readFile(otherProofPath, "utf8")).resolves.toBe(
      "other-track-proof",
    );
    await expect(readFile(storeMetadataPath, "utf8")).resolves.toBe(
      "proof-store-metadata",
    );
    await expect(readFile(logPath, "utf8")).resolves.toBe(
      "general-runtime-log",
    );
    await expect(fixture.library.list()).resolves.toEqual([
      expect.objectContaining({ id: OTHER_TRACK_ID }),
    ]);
    await expect(
      readFile(
        path.join(
          fixture.libraryRoot,
          "generations",
          `${OTHER_TRACK_ID}.m4a`,
        ),
        "utf8",
      ),
    ).resolves.toBe(`audio:${OTHER_TRACK_ID}`);
  });

  it("removes the last-proof pointer when it matches the deleted track", async () => {
    const fixture = await createFixture([DELETED_TRACK_ID]);
    await writeLastProof(fixture, DELETED_TRACK_ID);

    await fixture.library.delete(DELETED_TRACK_ID);

    await expectMissing(fixture.lastProofPath);
  });

  it("preserves a nonmatching last-proof pointer written during deletion", async () => {
    const fixture = await createFixture([
      DELETED_TRACK_ID,
      OTHER_TRACK_ID,
    ]);
    await writeLastProof(fixture, DELETED_TRACK_ID);
    const deletion = fixture.library.delete(DELETED_TRACK_ID);
    const pointerBytes = await writeLastProof(fixture, OTHER_TRACK_ID);

    await deletion;

    await expect(readFile(fixture.lastProofPath)).resolves.toEqual(
      pointerBytes,
    );
  });
});

async function createFixture(
  trackIDs: readonly string[],
): Promise<ProofDeletionFixture> {
  const root = await mkdtemp(path.join(tmpdir(), "locomo-proof-delete-test-"));
  temporaryDirectories.push(root);
  const libraryRoot = path.join(root, "library");
  const runtimeRoot = path.join(root, "runtime-cpp-q8");
  const proofsRoot = path.join(runtimeRoot, "proofs");
  const lastProofPath = path.join(runtimeRoot, "last-runtime-proof.json");
  const trackGenerationProofStorage = createTrackGenerationProofStorage({
    lastProofPath,
    proofsRoot,
  });
  const library = createMusicLibrary({
    libraryRoot,
    trackGenerationProofStorage,
  });
  await library.list();

  const database = new DatabaseSync(path.join(libraryRoot, "music.sqlite"));
  const insert = database.prepare(
    "INSERT INTO generation (id, title, category_key, prompt, lyrics, duration, created_at, is_favorite, is_played, remake_source_track_id) VALUES (?, ?, 'existing/house', 'House. Proof deletion test.', '', 60, ?, 0, 1, NULL)",
  );
  trackIDs.forEach((id, index) => {
    insert.run(id, `Track ${index + 1}`, index + 1);
  });
  database.close();

  const generations = path.join(libraryRoot, "generations");
  await Promise.all(
    trackIDs.map((id) =>
      writeFile(path.join(generations, `${id}.m4a`), `audio:${id}`),
    ),
  );

  return {
    lastProofPath,
    library,
    libraryRoot,
    proofsRoot,
    runtimeRoot,
    trackGenerationProofStorage,
  };
}

async function writeProofDirectory(
  proofsRoot: string,
  trackID: string,
  proof: string,
): Promise<string> {
  const proofDirectory = path.join(proofsRoot, trackID);
  await mkdir(proofDirectory, { recursive: true });
  await writeFile(path.join(proofDirectory, "proof.json"), proof);
  return proofDirectory;
}

async function writeLastProof(
  fixture: ProofDeletionFixture,
  trackID: string,
): Promise<Buffer> {
  const pointerBytes = Buffer.from(
    `${JSON.stringify({ track: { id: trackID } }, null, 2)}\n`,
    "utf8",
  );
  await mkdir(fixture.runtimeRoot, { recursive: true });
  await fixture.trackGenerationProofStorage.writeLastProof({
    track: { id: trackID },
  });
  return pointerBytes;
}

async function expectMissing(candidate: string): Promise<void> {
  await expect(stat(candidate)).rejects.toMatchObject({ code: "ENOENT" });
}
