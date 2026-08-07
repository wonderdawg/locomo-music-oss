import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  clearCategoryNewMusic,
  NEW_CATEGORY_MUSIC_STORAGE_KEY,
  readNewCategoryMusic,
  recordGeneratedCategoryNewMusic,
  shouldMarkCategoryNewMusic,
  writeNewCategoryMusic,
  type NewCategoryMusicStorage,
} from "../src/renderer/new-category-music";
import type { MusicCategoryKey } from "../src/shared/music-categories";

const HOUSE = "existing/house" satisfies MusicCategoryKey;
const TECHNO = "existing/techno" satisfies MusicCategoryKey;

class MemoryStorage implements NewCategoryMusicStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("new category music badges", () => {
  it("persists a narrow versioned category-key index across restart", () => {
    const storage = new MemoryStorage();

    writeNewCategoryMusic(storage, [HOUSE, TECHNO, HOUSE]);

    expect(readNewCategoryMusic(storage)).toEqual([HOUSE, TECHNO]);
    expect(
      JSON.parse(storage.getItem(NEW_CATEGORY_MUSIC_STORAGE_KEY) ?? "{}"),
    ).toEqual({
      categoryKeys: [HOUSE, TECHNO],
      version: 1,
    });

    const afterClick = clearCategoryNewMusic(
      readNewCategoryMusic(storage),
      HOUSE,
    );
    writeNewCategoryMusic(storage, afterClick);
    expect(readNewCategoryMusic(storage)).toEqual([TECHNO]);

    writeNewCategoryMusic(
      storage,
      clearCategoryNewMusic(afterClick, TECHNO),
    );
    expect(storage.getItem(NEW_CATEGORY_MUSIC_STORAGE_KEY)).toBeNull();
  });

  it("ignores incompatible payloads and sanitizes duplicate or invalid keys", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      NEW_CATEGORY_MUSIC_STORAGE_KEY,
      JSON.stringify({ categoryKeys: [HOUSE], version: 2 }),
    );
    expect(readNewCategoryMusic(storage)).toEqual([]);

    storage.setItem(
      NEW_CATEGORY_MUSIC_STORAGE_KEY,
      JSON.stringify({
        categoryKeys: [HOUSE, "favorites", HOUSE, 42, "bad/key"],
        version: 1,
      }),
    );
    expect(readNewCategoryMusic(storage)).toEqual([HOUSE]);
  });

  it("marks every overnight success, including the selected category", () => {
    const arrival = {
      categoryKey: HOUSE,
      selectedCategoryKey: HOUSE,
      source: "overnight",
    } as const;

    expect(shouldMarkCategoryNewMusic(arrival)).toBe(true);
    expect(recordGeneratedCategoryNewMusic([], arrival)).toEqual([HOUSE]);
  });

  it("marks other successful generation only when its category is not open", () => {
    for (const source of ["another-take", "continuous"] as const) {
      expect(
        shouldMarkCategoryNewMusic({
          categoryKey: HOUSE,
          selectedCategoryKey: TECHNO,
          source,
        }),
      ).toBe(true);
      expect(
        recordGeneratedCategoryNewMusic([], {
          categoryKey: HOUSE,
          selectedCategoryKey: TECHNO,
          source,
        }),
      ).toEqual([HOUSE]);
    }
  });

  it("does not immediately badge continuous music in the open category", () => {
    const current = [TECHNO] as const;
    const next = recordGeneratedCategoryNewMusic(current, {
      categoryKey: HOUSE,
      selectedCategoryKey: HOUSE,
      source: "continuous",
    });

    expect(next).toBe(current);
    expect(next).toEqual([TECHNO]);
  });

  it("clears from the card click before the existing selection flow", async () => {
    const source = await studioSource();
    const clickStart = source.indexOf("const selectCategoryCard =");
    const clickEnd = source.indexOf("const selectFavorites =", clickStart);
    const clickHandler = source.slice(clickStart, clickEnd);

    expect(clickStart).toBeGreaterThanOrEqual(0);
    expect(clickHandler.indexOf("clearNewMusicForCategory(key)")).toBeLessThan(
      clickHandler.indexOf("selectStation(key, true)"),
    );
    expect(clickHandler).not.toContain("play(");
    expect(clickHandler).not.toContain("playing()");
    expect(source).toContain(": selectCategoryCard(item.key)");
  });

  it("renders NEW in the upper-right and excludes Favorites", async () => {
    const source = await studioSource();
    const cardsStart = source.indexOf("<For each={categoryTiles()}>");
    const cardsEnd = source.indexOf("</For>", cardsStart);
    const cards = source.slice(cardsStart, cardsEnd);

    expect(cards).toContain(
      'item.kind === "category" &&\n                      hasNewCategoryMusic(item.key)',
    );
    expect(cards).toContain(
      'class="category-card__badge pointer-events-none absolute right-1.5 top-1.5 z-30',
    );
    expect(cards).toContain("New music in");
    expect(cards).toContain("NEW");
    expect(cards).not.toContain('item.kind === "favorites" &&');
  });

  it("records badges only after a generation request succeeds", async () => {
    const source = await studioSource();
    const successStart = source.indexOf(
      "item = await music.generate(request);",
    );
    const successEnd = source.indexOf("completed = true;", successStart);
    const successPath = source.slice(successStart, successEnd);
    const failureStart = source.indexOf("} catch (cause) {", successEnd);
    const failureEnd = source.indexOf(
      "if (isAnotherTake)",
      failureStart,
    );
    const failurePath = source.slice(failureStart, failureEnd);

    expect(successPath).toContain("recordGeneratedCategoryArrival(queued);");
    expect(failurePath).not.toContain("recordGeneratedCategoryArrival");
  });
});

async function studioSource(): Promise<string> {
  return readFile(
    new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
    "utf8",
  );
}
