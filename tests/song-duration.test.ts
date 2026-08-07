import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { locomoMusicCategoryCatalogs } from "../src/renderer/category-catalog";
import {
  createCategoryGenerationRequest,
  shouldGenerateAfterQueueDrain,
} from "../src/renderer/radio";
import {
  formatSongDuration,
  readSongDurationMinutes,
  SONG_DURATION_MINUTE_OPTIONS,
  SONG_DURATION_STORAGE_KEY,
  songDurationAfterArrowKey,
  songDurationAtPoint,
  songDurationDialAngle,
  writeSongDurationMinutes,
} from "../src/renderer/SongLengthDial";
import { assertMusicGenerationDurationSeconds } from "../src/shared/app-contract";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) {
    values.set(SONG_DURATION_STORAGE_KEY, initial);
  }
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("song duration preference", () => {
  it("defaults to the canonical two minutes and round-trips synchronously", () => {
    const storage = memoryStorage();

    expect(readSongDurationMinutes(storage)).toBe(2);
    writeSongDurationMinutes(storage, 7);
    expect(readSongDurationMinutes(storage)).toBe(7);
    writeSongDurationMinutes(storage, 1.5);
    expect(readSongDurationMinutes(storage)).toBe(1.5);
    writeSongDurationMinutes(storage, 2.5);
    expect(readSongDurationMinutes(storage)).toBe(2.5);
  });

  it("falls back for invalid persisted values and rejects invalid writes", () => {
    ["", "0", "1.25", "2.25", "11", "invalid"].forEach((saved) => {
      expect(readSongDurationMinutes(memoryStorage(saved))).toBe(2);
    });
    expect(() =>
      readSongDurationMinutes({
        getItem: () => {
          throw new Error("storage unavailable");
        },
        setItem: () => undefined,
      }),
    ).not.toThrow();
    expect(() => writeSongDurationMinutes(memoryStorage(), 11)).toThrow(
      "whole number from 1 to 10 minutes or exactly 1.5 or 2.5 minutes",
    );
  });
});

describe("song duration dial", () => {
  it("maps every visible tick to its exact minute", () => {
    for (const minutes of SONG_DURATION_MINUTE_OPTIONS) {
      const radians =
        ((songDurationDialAngle(minutes) - 90) * Math.PI) / 180;
      expect(
        songDurationAtPoint({
          centerX: 100,
          centerY: 100,
          pointerX: 100 + Math.cos(radians) * 28,
          pointerY: 100 + Math.sin(radians) * 28,
        }),
      ).toBe(minutes);
    }
    expect(formatSongDuration(2)).toBe("2 min.");
    expect(formatSongDuration(1.5)).toBe("1.5 min.");
    expect(formatSongDuration(2.5)).toBe("2.5 min.");
  });

  it("uses bounded arrow-key steps through the special half-minute options", () => {
    expect(songDurationAfterArrowKey(1, "ArrowLeft")).toBe(1);
    expect(songDurationAfterArrowKey(1, "ArrowUp")).toBe(1.5);
    expect(songDurationAfterArrowKey(1.5, "ArrowRight")).toBe(2);
    expect(songDurationAfterArrowKey(2, "ArrowLeft")).toBe(1.5);
    expect(songDurationAfterArrowKey(1.5, "ArrowDown")).toBe(1);
    expect(songDurationAfterArrowKey(2, "ArrowRight")).toBe(2.5);
    expect(songDurationAfterArrowKey(2.5, "ArrowRight")).toBe(3);
    expect(songDurationAfterArrowKey(3, "ArrowLeft")).toBe(2.5);
    expect(songDurationAfterArrowKey(2.5, "ArrowDown")).toBe(2);
    expect(songDurationAfterArrowKey(10, "ArrowRight")).toBe(10);
    expect(songDurationAfterArrowKey(10, "ArrowDown")).toBe(9);
    expect(songDurationAfterArrowKey(5, "Enter")).toBeUndefined();
  });

  it("doubles the visual and pointer target diameter", async () => {
    const [component, styles] = await Promise.all([
      readFile(
        new URL("../src/renderer/SongLengthDial.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/renderer/styles.css", import.meta.url),
        "utf8",
      ),
    ]);
    const dialStart = styles.indexOf(".song-length-dial {");
    const dialEnd = styles.indexOf(".song-length-dial:active", dialStart);
    const dialStyles = styles.slice(dialStart, dialEnd);

    expect(dialStyles).toContain("width: 112px;");
    expect(dialStyles).toContain("height: 112px;");
    expect(component).toContain("< 20");
    expect(component).toContain("translateY(-44px)");
  });
});

describe("song duration generation admission", () => {
  it("applies the explicit override to every Existing and Experimental category", () => {
    Object.values(locomoMusicCategoryCatalogs).forEach((catalog) => {
      catalog.categories.forEach((category) => {
        [60, 90, 150, 600].forEach((durationSeconds) => {
          expect(
            createCategoryGenerationRequest(
              category.key,
              false,
              0,
              durationSeconds,
            )?.duration,
          ).toBe(durationSeconds);
        });
      });
    });
  });

  it("keeps the initial request unchanged and snapshots the Auto-create follow-on", () => {
    let selectedMinutes = 1.5;
    const initial = createCategoryGenerationRequest(
      "existing/house",
      false,
      0,
      selectedMinutes * 60,
    )!;
    const alreadyQueued = createCategoryGenerationRequest(
      "existing/house",
      false,
      1,
      selectedMinutes * 60,
    )!;
    const generationQueue = [initial, alreadyQueued];
    const active = generationQueue.shift()!;

    selectedMinutes = 7;
    expect(active.duration).toBe(90);
    expect(generationQueue[0]?.duration).toBe(90);
    expect(
      shouldGenerateAfterQueueDrain({
        autoCreate: true,
        categoryKey: "existing/house",
        disposed: false,
        queuedRequests: generationQueue.length,
      }),
    ).toBe(false);

    generationQueue.shift();
    expect(
      shouldGenerateAfterQueueDrain({
        autoCreate: true,
        categoryKey: "existing/house",
        disposed: false,
        queuedRequests: generationQueue.length,
      }),
    ).toBe(true);

    generationQueue.push(
      createCategoryGenerationRequest(
        "existing/house",
        false,
        2,
        selectedMinutes * 60,
      )!,
    );
    expect(active.duration).toBe(90);
    expect(generationQueue[0]?.duration).toBe(420);
  });
});

describe("song duration backend validation", () => {
  it("accepts whole-minute seconds from 60 through 600 plus exactly 90 and 150", () => {
    [60, 90, 120, 150, 600].forEach((duration) =>
      expect(() =>
        assertMusicGenerationDurationSeconds(duration),
      ).not.toThrow(),
    );
    [0, 59, 89, 91, 149, 151, 601, 660, 120.5, "120", Number.NaN].forEach(
      (duration) =>
        expect(() =>
          assertMusicGenerationDurationSeconds(duration),
        ).toThrow(
          "90 or 150 seconds or a whole-minute value from 1 to 10 minutes",
        ),
    );
  });
});
