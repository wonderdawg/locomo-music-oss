import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { locomoMusicCategoryCatalogs } from "../src/renderer/category-catalog";
import { visibleCategoryTiles } from "../src/renderer/favorites";
import {
  beginOvernightAttempt,
  completeOvernightAttempt,
  createOvernightBatch,
  failOvernightAttempt,
  overnightBatchProgress,
  OVERNIGHT_BATCH_STORAGE_KEY,
  planOvernightScheduling,
  prepareNextOvernightItem,
  readOvernightBatch,
  recoverInterruptedOvernightBatch,
  snapshotOvernightBatchCategories,
  writeOvernightBatch,
} from "../src/renderer/overnight-batch";
import { createCategoryGenerationRequest } from "../src/renderer/radio";
import type { MusicCategoryKey } from "../src/shared/music-categories";

const CATEGORIES = [
  { key: "existing/house", name: "House" },
  { key: "existing/indie-pop", name: "Indie Pop" },
  { key: "existing/techno", name: "Techno" },
] as const satisfies readonly {
  readonly key: MusicCategoryKey;
  readonly name: string;
}[];

describe("one-shot overnight batch", () => {
  it("snapshots only visible, generatable Existing categories", () => {
    const tiles = visibleCategoryTiles(
      locomoMusicCategoryCatalogs.existing.categories,
      "existing",
    );
    const snapshot = snapshotOvernightBatchCategories(
      tiles,
      (categoryKey) =>
        createCategoryGenerationRequest(categoryKey, false, 0) !==
        undefined,
    );

    expect(snapshot.length).toBeGreaterThan(0);
    expect(snapshot.every(({ key }) => key.startsWith("existing/"))).toBe(
      true,
    );
    expect(snapshot.map(({ key }) => String(key))).not.toContain(
      "favorites",
    );
    expect(
      snapshot.some(({ key }) => key === "existing/celtic-folk"),
    ).toBe(false);
    expect(
      snapshot.some(({ key }) => key === "existing/narrative-pop"),
    ).toBe(false);
    expect(
      snapshot.every(
        ({ key }) =>
          createCategoryGenerationRequest(key, false, 0) !== undefined,
      ),
    ).toBe(true);

    expect(
      snapshotOvernightBatchCategories(
        [
          { key: "favorites", kind: "favorites", name: "Favorites" },
          {
            key: "experimental/custom",
            kind: "category",
            name: "Custom",
          },
          {
            key: "existing/house",
            kind: "category",
            name: "House",
          },
          {
            key: "existing/missing",
            kind: "category",
            name: "Missing",
          },
        ],
        (key) => key === "existing/house",
      ),
    ).toEqual([{ key: "existing/house", name: "House" }]);
  });

  it("runs one category per round-robin pass until exactly five successes each", () => {
    let state = createOvernightBatch(CATEGORIES, "batch-1", 1);
    const order: MusicCategoryKey[] = [];

    for (let index = 0; index < CATEGORIES.length * 5; index += 1) {
      state = prepareNextOvernightItem(state, index + 2);
      const categoryKey = state.pending?.categoryKey;
      expect(categoryKey).toBeDefined();
      order.push(categoryKey!);
      state = beginOvernightAttempt(state, "renderer-1", index + 2);
      state = completeOvernightAttempt(
        state,
        categoryKey!,
        index + 2,
      );
    }

    expect(order.slice(0, 9)).toEqual([
      "existing/house",
      "existing/indie-pop",
      "existing/techno",
      "existing/house",
      "existing/indie-pop",
      "existing/techno",
      "existing/house",
      "existing/indie-pop",
      "existing/techno",
    ]);
    expect(state.categories.map(({ completed }) => completed)).toEqual([
      5, 5, 5,
    ]);
    expect(overnightBatchProgress(state)).toEqual({
      completed: 15,
      failedAttempts: 0,
      total: 15,
    });
    expect(state.status).toBe("completed");
    expect(state.pending).toBeUndefined();
  });

  it("persists completed progress and recovers an interrupted in-flight item", () => {
    const storage = memoryStorage();
    let state = createOvernightBatch(CATEGORIES, "batch-resume", 1);
    state = prepareNextOvernightItem(state, 2);
    state = beginOvernightAttempt(state, "old-renderer", 3);
    state = completeOvernightAttempt(state, "existing/house", 4);
    state = prepareNextOvernightItem(state, 5);
    state = beginOvernightAttempt(state, "old-renderer", 6);
    writeOvernightBatch(storage, state);

    const restored = readOvernightBatch(storage);
    expect(restored?.version).toBe(1);
    expect(restored?.categories[0]?.completed).toBe(1);
    expect(restored?.pending).toMatchObject({
      categoryKey: "existing/indie-pop",
      inFlight: true,
      ownerSessionID: "old-renderer",
    });

    const recovered = recoverInterruptedOvernightBatch(
      restored!,
      "new-renderer",
      7,
    );
    expect(recovered.categories[0]?.completed).toBe(1);
    expect(recovered.pending).toEqual({
      categoryKey: "existing/indie-pop",
      failedOnce: false,
      inFlight: false,
    });
    writeOvernightBatch(storage, recovered);
    expect(readOvernightBatch(storage)).toEqual(recovered);
    expect(storage.getItem(OVERNIGHT_BATCH_STORAGE_KEY)).toContain(
      '"version":1',
    );
  });

  it("ignores incompatible persisted versions and supports a narrow cancel removal", () => {
    const storage = memoryStorage();
    storage.setItem(
      OVERNIGHT_BATCH_STORAGE_KEY,
      JSON.stringify({ version: 2, status: "armed" }),
    );
    expect(readOvernightBatch(storage)).toBeUndefined();

    writeOvernightBatch(
      storage,
      createOvernightBatch(CATEGORIES, "batch-cancel", 1),
    );
    expect(readOvernightBatch(storage)?.id).toBe("batch-cancel");
    writeOvernightBatch(storage, undefined);
    expect(storage.getItem(OVERNIGHT_BATCH_STORAGE_KEY)).toBeNull();
  });

  it("retries once, reports failures honestly, then skips forward without lowering the target", () => {
    let state = prepareNextOvernightItem(
      createOvernightBatch(CATEGORIES, "batch-retry", 1),
      2,
    );
    state = beginOvernightAttempt(state, "renderer", 3);
    const first = failOvernightAttempt(
      state,
      "existing/house",
      "first failure",
      4,
    );
    expect(first.disposition).toBe("retrying");
    expect(first.state.pending).toMatchObject({
      categoryKey: "existing/house",
      failedOnce: true,
      inFlight: false,
    });
    expect(first.state.categories[0]?.failedAttempts).toBe(1);

    state = beginOvernightAttempt(first.state, "renderer", 5);
    const second = failOvernightAttempt(
      state,
      "existing/house",
      "retry failure",
      6,
    );
    expect(second.disposition).toBe("skipped");
    expect(second.state.categories[0]).toMatchObject({
      completed: 0,
      failedAttempts: 2,
    });
    expect(second.state.pending).toBeUndefined();
    expect(second.state.status).toBe("armed");

    state = prepareNextOvernightItem(second.state, 7);
    expect(state.pending?.categoryKey).toBe("existing/indie-pop");
    expect(overnightBatchProgress(state).total).toBe(15);
  });

  it("marks a successful retry as recovered", () => {
    let state = prepareNextOvernightItem(
      createOvernightBatch(CATEGORIES, "batch-recovered", 1),
      2,
    );
    state = beginOvernightAttempt(state, "renderer", 3);
    state = failOvernightAttempt(
      state,
      "existing/house",
      "temporary failure",
      4,
    ).state;
    state = beginOvernightAttempt(state, "renderer", 5);
    state = completeOvernightAttempt(state, "existing/house", 6);

    expect(state.categories[0]).toMatchObject({
      completed: 1,
      failedAttempts: 1,
    });
    expect(state.lastFailure?.disposition).toBe("recovered");
  });

  it("gates admission on idle time and AC power, keeps user-triggered work priority, and never interrupts active work", () => {
    const ready = {
      idleSeconds: 900,
      onExternalPower: true,
      supported: true,
    } as const;

    expect(
      planOvernightScheduling({
        batchStatus: "armed",
        conditions: { ...ready, idleSeconds: 899 },
        generationActive: false,
        queuedSources: [],
      }),
    ).toMatchObject({ admitOvernight: false, suppressContinuous: false });
    expect(
      planOvernightScheduling({
        batchStatus: "armed",
        conditions: { ...ready, onExternalPower: false },
        generationActive: false,
        queuedSources: [],
      }),
    ).toMatchObject({ admitOvernight: false, suppressContinuous: false });
    expect(
      planOvernightScheduling({
        batchStatus: "armed",
        conditions: ready,
        generationActive: false,
        queuedSources: ["continuous"],
      }),
    ).toEqual({
      admitOvernight: true,
      discardQueuedContinuous: true,
      interruptActiveGeneration: false,
      suppressContinuous: true,
    });
    expect(
      planOvernightScheduling({
        batchStatus: "armed",
        conditions: ready,
        generationActive: false,
        queuedSources: ["another-take", "continuous"],
      }),
    ).toMatchObject({
      admitOvernight: false,
      discardQueuedContinuous: true,
      suppressContinuous: true,
    });

    const activityReturned = planOvernightScheduling({
      batchStatus: "armed",
      conditions: { ...ready, idleSeconds: 0 },
      generationActive: true,
      queuedSources: [],
    });
    expect(activityReturned).toMatchObject({
      admitOvernight: false,
      interruptActiveGeneration: false,
      suppressContinuous: false,
    });
  });

  it("holds continuous generation after completion while idle, then restores it on activity", () => {
    const idle = planOvernightScheduling({
      batchStatus: "completed",
      conditions: {
        idleSeconds: 1_200,
        onExternalPower: true,
        supported: true,
      },
      generationActive: false,
      queuedSources: ["continuous"],
    });
    expect(idle).toMatchObject({
      admitOvernight: false,
      discardQueuedContinuous: true,
      suppressContinuous: true,
    });

    const active = planOvernightScheduling({
      batchStatus: "completed",
      conditions: {
        idleSeconds: 0,
        onExternalPower: true,
        supported: true,
      },
      generationActive: false,
      queuedSources: [],
    });
    expect(active).toMatchObject({
      admitOvernight: false,
      suppressContinuous: false,
    });
  });

  it("exposes a compact arm/cancel, prerequisites, progress, and failure status UI", async () => {
    const source = await readFile(
      new URL("../src/renderer/SettingsWindow.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("data-overnight-batch-arm");
    expect(source).toContain("data-overnight-batch-cancel");
    expect(source).toContain("data-overnight-batch-progress");
    expect(source).toContain("data-overnight-batch-status");
    expect(source).toContain("15 minutes unused");
    expect(source).toContain("external power");
    const overnight = source.slice(
      source.indexOf("data-overnight-batch-settings"),
    );
    expect(overnight).not.toContain("type=\"number\"");
  });

  it("stays independent of the excluded finite category queue", async () => {
    const [studio, overnight] = await Promise.all([
      readFile(
        new URL(
          "../src/renderer/LocomoMusicStudio.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../src/renderer/overnight-batch.ts", import.meta.url),
        "utf8",
      ),
    ]);

    expect(studio).not.toContain("queueManualGeneration");
    expect(studio).not.toContain("manualGenerationCounts");
    expect(studio).not.toContain("data-manual-generation-control");
    expect(studio).not.toContain("data-manual-generation-count");
    expect(studio).not.toContain('source: "manual"');
    expect(overnight).not.toContain("generation-scheduler");
    await expect(
      access(
        new URL(
          "../src/renderer/generation-scheduler.ts",
          import.meta.url,
        ),
      ),
    ).rejects.toBeDefined();
  });
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
