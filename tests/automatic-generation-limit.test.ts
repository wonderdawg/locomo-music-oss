import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  AUTOMATIC_GENERATION_LIMIT_STORAGE_KEY,
  createAutomaticGenerationRunController,
  DEFAULT_AUTOMATIC_GENERATION_LIMIT,
  MAX_AUTOMATIC_GENERATION_LIMIT,
  MIN_AUTOMATIC_GENERATION_LIMIT,
  readAutomaticGenerationLimit,
  validateAutomaticGenerationLimit,
  writeAutomaticGenerationLimit,
} from "../src/renderer/automatic-generation-limit";
import { createCategoryGenerationIntentGate } from "../src/renderer/radio";

const FUTURE_FRENCH_HOUSE = "existing/future-french-house" as const;
const HOUSE = "existing/house" as const;

describe("automatic generation limit", () => {
  it("defaults to 10 and preserves validated persisted values", () => {
    const storage = memoryStorage();

    expect(DEFAULT_AUTOMATIC_GENERATION_LIMIT).toBe(10);
    expect(MIN_AUTOMATIC_GENERATION_LIMIT).toBe(1);
    expect(MAX_AUTOMATIC_GENERATION_LIMIT).toBe(100);
    expect(readAutomaticGenerationLimit(storage)).toBe(10);

    expect(writeAutomaticGenerationLimit(storage, 1)).toBe(1);
    expect(readAutomaticGenerationLimit(storage)).toBe(1);
    expect(writeAutomaticGenerationLimit(storage, "100")).toBe(100);
    expect(readAutomaticGenerationLimit(storage)).toBe(100);
    storage.setItem(AUTOMATIC_GENERATION_LIMIT_STORAGE_KEY, "20");
    expect(readAutomaticGenerationLimit(storage)).toBe(20);

    for (const invalid of [0, -1, 1.5, 101, "", "many", Infinity]) {
      expect(validateAutomaticGenerationLimit(invalid)).toBeUndefined();
      expect(() => writeAutomaticGenerationLimit(storage, invalid)).toThrow(
        RangeError,
      );
    }

    storage.setItem(AUTOMATIC_GENERATION_LIMIT_STORAGE_KEY, "invalid");
    expect(readAutomaticGenerationLimit(storage)).toBe(10);
  });

  it("counts exact successful continuous completions and blocks N+1", () => {
    const controller = createAutomaticGenerationRunController();
    const run = controller.start(FUTURE_FRENCH_HOUSE, 2);

    expect(
      controller.canEnqueue({
        categoryKey: FUTURE_FRENCH_HOUSE,
        runID: run.id,
      }),
    ).toBe(true);
    expect(
      controller.recordCompletion({
        categoryKey: FUTURE_FRENCH_HOUSE,
        runID: run.id,
        source: "continuous",
        succeeded: true,
      }),
    ).toMatchObject({ counted: true, limitReached: false });
    expect(controller.snapshot()?.successfulSongs).toBe(1);

    expect(
      controller.recordCompletion({
        categoryKey: FUTURE_FRENCH_HOUSE,
        runID: run.id,
        source: "continuous",
        succeeded: true,
      }),
    ).toMatchObject({ counted: true, limitReached: true });
    expect(controller.snapshot()).toMatchObject({
      limit: 2,
      status: "limit-reached",
      successfulSongs: 2,
    });
    expect(
      controller.canEnqueue({
        categoryKey: FUTURE_FRENCH_HOUSE,
        runID: run.id,
      }),
    ).toBe(false);
    expect(
      controller.recordCompletion({
        categoryKey: FUTURE_FRENCH_HOUSE,
        runID: run.id,
        source: "continuous",
        succeeded: true,
      }).counted,
    ).toBe(false);
    expect(controller.snapshot()?.successfulSongs).toBe(2);
  });

  it("excludes failures and every non-continuous source", () => {
    const controller = createAutomaticGenerationRunController();
    const onChange = vi.fn();
    const observed = createAutomaticGenerationRunController({ onChange });
    const run = controller.start(FUTURE_FRENCH_HOUSE, 3);
    const observedRun = observed.start(FUTURE_FRENCH_HOUSE, 3);

    expect(
      controller.recordCompletion({
        categoryKey: FUTURE_FRENCH_HOUSE,
        runID: run.id,
        source: "continuous",
        succeeded: false,
      }).counted,
    ).toBe(false);
    for (const source of ["another-take", "remake", "overnight"] as const) {
      expect(
        controller.recordCompletion({
          categoryKey: FUTURE_FRENCH_HOUSE,
          runID: run.id,
          source,
          succeeded: true,
        }).counted,
      ).toBe(false);
    }
    expect(controller.snapshot()?.successfulSongs).toBe(0);

    observed.recordCompletion({
      categoryKey: FUTURE_FRENCH_HOUSE,
      runID: observedRun.id,
      source: "continuous",
      succeeded: false,
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ends stale work on Stop, switch, Favorites, or remount", () => {
    for (const reason of ["Stop", "switch", "Favorites", "remount"]) {
      const controller = createAutomaticGenerationRunController();
      const run = controller.start(FUTURE_FRENCH_HOUSE, 2);

      controller.stop();

      expect(controller.snapshot(), reason).toBeUndefined();
      expect(
        controller.canEnqueue({
          categoryKey: FUTURE_FRENCH_HOUSE,
          runID: run.id,
        }),
        reason,
      ).toBe(false);
      expect(
        controller.recordCompletion({
          categoryKey: FUTURE_FRENCH_HOUSE,
          runID: run.id,
          source: "continuous",
          succeeded: true,
        }).counted,
        reason,
      ).toBe(false);
    }
  });

  it("starts a fresh counter and snapshots the current setting", () => {
    const storage = memoryStorage();
    const controller = createAutomaticGenerationRunController();
    writeAutomaticGenerationLimit(storage, 2);
    const first = controller.start(
      FUTURE_FRENCH_HOUSE,
      readAutomaticGenerationLimit(storage),
    );
    controller.recordCompletion({
      categoryKey: FUTURE_FRENCH_HOUSE,
      runID: first.id,
      source: "continuous",
      succeeded: true,
    });

    writeAutomaticGenerationLimit(storage, 3);
    expect(controller.snapshot()).toMatchObject({
      id: first.id,
      limit: 2,
      successfulSongs: 1,
    });

    const second = controller.start(
      HOUSE,
      readAutomaticGenerationLimit(storage),
    );
    expect(second).toMatchObject({
      categoryKey: HOUSE,
      limit: 3,
      status: "running",
      successfulSongs: 0,
    });
    expect(second.id).not.toBe(first.id);

    const repeated = controller.start(
      HOUSE,
      readAutomaticGenerationLimit(storage),
    );
    expect(repeated).toMatchObject({ limit: 3, successfulSongs: 0 });
    expect(repeated.id).not.toBe(second.id);
  });

  it("preserves a capped run across pre-ready intent admission", () => {
    const controller = createAutomaticGenerationRunController();
    const intent = createCategoryGenerationIntentGate();
    const run = controller.start(FUTURE_FRENCH_HOUSE, 2);

    expect(
      intent.noteSelection({
        generationAvailable: false,
        shouldGenerate: true,
      }),
    ).toBe(false);
    expect(controller.snapshot()).toMatchObject({
      id: run.id,
      limit: 2,
      successfulSongs: 0,
    });
    expect(
      intent.admitOnReadiness({
        categoryKey: FUTURE_FRENCH_HOUSE,
        generationAvailable: true,
      }),
    ).toBe(true);
    expect(
      controller.canEnqueue({
        categoryKey: FUTURE_FRENCH_HOUSE,
        runID: run.id,
      }),
    ).toBe(true);
  });

  it("admits one deferred run, honors Stop, and enforces the default 10-song cap", () => {
    const stoppedIntent = createCategoryGenerationIntentGate();
    stoppedIntent.noteSelection({
      generationAvailable: false,
      shouldGenerate: true,
    });
    stoppedIntent.clear();
    expect(
      stoppedIntent.admitOnReadiness({
        categoryKey: FUTURE_FRENCH_HOUSE,
        generationAvailable: true,
      }),
    ).toBe(false);

    const intent = createCategoryGenerationIntentGate();
    const controller = createAutomaticGenerationRunController();
    const run = controller.start(
      FUTURE_FRENCH_HOUSE,
      DEFAULT_AUTOMATIC_GENERATION_LIMIT,
    );
    intent.noteSelection({
      generationAvailable: false,
      shouldGenerate: true,
    });

    expect(
      intent.admitOnReadiness({
        categoryKey: FUTURE_FRENCH_HOUSE,
        generationAvailable: true,
      }),
    ).toBe(true);
    expect(
      intent.admitOnReadiness({
        categoryKey: FUTURE_FRENCH_HOUSE,
        generationAvailable: true,
      }),
    ).toBe(false);

    for (let completed = 1; completed <= 10; completed += 1) {
      expect(
        controller.recordCompletion({
          categoryKey: FUTURE_FRENCH_HOUSE,
          runID: run.id,
          source: "continuous",
          succeeded: true,
        }),
      ).toMatchObject({
        counted: true,
        limitReached: completed === 10,
      });
    }
    expect(controller.snapshot()).toMatchObject({
      limit: 10,
      status: "limit-reached",
      successfulSongs: 10,
    });
    expect(
      controller.canEnqueue({
        categoryKey: FUTURE_FRENCH_HOUSE,
        runID: run.id,
      }),
    ).toBe(false);
  });

  it("wires explicit selection, completion, Stop, Favorites, and remount to the run lifecycle", async () => {
    const studio = await readFile(
      new URL(
        "../src/renderer/LocomoMusicStudio.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const generate = sourceSlice(
      studio,
      "  const generate = () => {",
      "  function noteExplicitRendererInteraction()",
    );
    const selection = sourceSlice(
      studio,
      "  const selectStation = (",
      "  createEffect(() => {",
    );
    const toggle = sourceSlice(
      studio,
      "  const toggleAutoCreate = () => {",
      "  const closeAddCategory = () => {",
    );
    const statusRow = sourceSlice(
      studio,
      "                  data-generation-row",
      '              <div class="min-h-0 flex-1 overflow-y-auto">',
    );

    expect(generate).toContain("automaticGenerationRuns.canEnqueue");
    expect(generate).toContain(
      "automaticGenerationRunID: automaticRun.id",
    );
    expect(selection).toContain("explicitCategorySelection = false");
    expect(selection).toContain("selectStation(key, true)");
    expect(selection).toContain("automaticGenerationRuns.start(");
    expect(selection).toContain("automaticGenerationRuns.stop();");
    expect(toggle).toContain("automaticGenerationRuns.stop();");
    expect(toggle.match(/automaticGenerationRuns\.start\(/g)).toHaveLength(
      2,
    );
    expect(toggle).not.toContain("play(");
    expect(studio).toContain(
      "recordAutomaticGenerationCompletion(queued, true)",
    );
    expect(studio).toContain(
      "recordAutomaticGenerationCompletion(queued, false)",
    );
    expect(studio).toContain("automaticCompletion.counted &&");
    expect(studio).toContain("automaticGenerationRuns.stop();");
    expect(studio).toContain("Automatic song limit reached");
    expect(studio).toContain("data-automatic-generation-limit");
    expect(studio).toContain(
      "(!props.generationAvailable && categoryGenerationPending()) ||",
    );
    expect(statusRow).toContain("generationWaitingTitle()");
    expect(statusRow).toContain("Automatic song limit reached");
    expect(statusRow).toContain("data-generation-status-title");
    expect(statusRow).toContain(
      '"truncate text-[22px]":\n                          !generationStatusTitleUsesCompactStyle()',
    );
    expect(statusRow).toContain(
      '"whitespace-normal text-pretty text-[14px] leading-4":\n                          generationStatusTitleUsesCompactStyle()',
    );
    expect(statusRow).not.toContain("whitespace-nowrap");
    expect(statusRow).not.toContain("overflow-visible");
  });

  it("exposes the validated persisted setting in the fixed non-scrolling Settings surface", async () => {
    const [settings, styles] = await Promise.all([
      readFile(
        new URL("../src/renderer/SettingsWindow.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/renderer/styles.css", import.meta.url),
        "utf8",
      ),
    ]);
    const settingsStyles = sourceSlice(
      styles,
      ".settings-window {",
      ".memory-indicator {",
    );

    expect(settings).toContain("data-automatic-generation-settings");
    expect(settings).toContain("data-automatic-generation-limit");
    expect(settings).toContain("writeAutomaticGenerationLimit(");
    expect(settings).toContain(
      "AUTOMATIC_GENERATION_LIMIT_STORAGE_KEY",
    );
    expect(settings).toContain("Per category selection · 1–100");
    expect(settings).toContain("min={MIN_AUTOMATIC_GENERATION_LIMIT}");
    expect(settings).toContain("max={MAX_AUTOMATIC_GENERATION_LIMIT}");
    expect(settingsStyles).toContain("gap: 12px;");
    expect(settingsStyles).toContain("overflow: hidden;");
    expect(settingsStyles).not.toContain("overflow-y: auto;");
  });
});

function sourceSlice(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
