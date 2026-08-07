import { describe, expect, it } from "vitest";

import {
  createGeneratedTrackTitle,
  createGenerationTrackTitle,
} from "../src/main/music-title";
import { locomoMusicCategoryCatalogs } from "../src/renderer/category-catalog";

const FIRST_TRACK_ID = "123e4567-e89b-42d3-a456-426614174000";
const SECOND_TRACK_ID = "123e4567-e89b-42d3-a456-426614174001";

describe("generated track titles", () => {
  it("keeps one, two, or three whole leading words when they fit", () => {
    const titles = [
      createGeneratedTrackTitle(undefined, "House. Rolling bass."),
      createGeneratedTrackTitle(
        "[Verse]\nSoft light\nSoft light",
        "House. Rolling bass.",
      ),
      createGeneratedTrackTitle(
        "[Chorus]\nHappy flowers every shade forever\nHappy flowers every shade forever",
        "Indie folk. Warm acoustics.",
      ),
    ];

    expect(titles).toEqual([
      "House",
      "Soft Light",
      "Happy Flowers Every",
    ]);
    titles.forEach(expectGeneratedTitleInvariant);
  });

  it("stops before the next whole word would exceed 24 characters", () => {
    const title = createGeneratedTrackTitle(
      undefined,
      "Silver Morning Extraordinary. Warm acoustics.",
    );

    expect(title).toBe("Silver Morning");
    expectGeneratedTitleInvariant(title);
  });

  it("does not skip an overflowing second word to include the third", () => {
    const title = createGeneratedTrackTitle(
      undefined,
      "Bright Extraordinarylongword Day. Warm acoustics.",
    );

    expect(title).toBe("Bright");
    expectGeneratedTitleInvariant(title);
  });

  it("accepts a whole-word title that is exactly 24 characters", () => {
    const title = createGeneratedTrackTitle(
      undefined,
      "Golden Midnight Lanterns. Warm acoustics.",
    );

    expect(title).toBe("Golden Midnight Lanterns");
    expect(title).toHaveLength(24);
    expectGeneratedTitleInvariant(title);
  });

  it("uses New Song when the first token is longer than 24 characters", () => {
    const title = createGeneratedTrackTitle(
      undefined,
      "abcdefghijklmnopqrstuvwxy. Warm acoustics.",
    );

    expect(title).toBe("New Song");
    expectGeneratedTitleInvariant(title);
  });

  it("preserves existing punctuation and whitespace normalization", () => {
    const title = createGeneratedTrackTitle(
      "[Chorus]\n  DON'T   STOP--NOW!!!  \n  DON'T   STOP--NOW!!!  ",
      "House. Rolling bass.",
    );

    expect(title).toBe("Don't Stop--now");
    expectGeneratedTitleInvariant(title);
  });

  it("keeps the empty-candidate fallback within both invariants", () => {
    const title = createGeneratedTrackTitle(undefined, "...");

    expect(title).toBe("New Song");
    expectGeneratedTitleInvariant(title);
  });

  it("keeps vocal naming on the existing lyric-derived path", () => {
    const generatedLyrics = "[Chorus]\nStay right here\nStay right here";
    const expected = createGeneratedTrackTitle(
      generatedLyrics,
      "House. Rolling bass.",
    );

    expect(
      createGenerationTrackTitle({
        categoryKey: "existing/house",
        generatedLyrics,
        id: FIRST_TRACK_ID,
        prompt: "House. Rolling bass.",
        requestedLyrics: "__AUTO__",
      }),
    ).toBe(expected);
  });

  it("uses category plus a deterministic compact number only for instrumentals", () => {
    const titleInput = {
      categoryKey: "existing/house" as const,
      generatedLyrics: "[Instrumental]",
      id: FIRST_TRACK_ID,
      prompt: "A prompt that must not become the title.",
      requestedLyrics: "",
    };

    expect(createGenerationTrackTitle(titleInput)).toBe("House 8802");
    expect(createGenerationTrackTitle(titleInput)).toBe("House 8802");
    expect(
      createGenerationTrackTitle({
        ...titleInput,
        id: SECOND_TRACK_ID,
      }),
    ).toBe("House 86421");
  });

  it("uses explicit short labels for long category names", () => {
    expect(
      instrumentalTitle("existing/new-jack-swing"),
    ).toBe("New Jack 8802");
    expect(
      instrumentalTitle("experimental/melodic-rap-and-r-and-b"),
    ).toBe("Melodic R&B 8802");
    expect(
      instrumentalTitle("experimental/latin-trap-and-reggaeton"),
    ).toBe("Latin Trap 8802");
    expect(
      instrumentalTitle("existing/future-french-house"),
    ).toBe("French House 8802");
  });

  it("keeps every catalog instrumental title within the title invariants", () => {
    const categoryKeys = Object.values(locomoMusicCategoryCatalogs).flatMap(
      (catalog) => catalog.categories.map((category) => category.key),
    );

    categoryKeys.forEach((categoryKey) => {
      const title = instrumentalTitle(categoryKey, SECOND_TRACK_ID);
      expect(title).not.toMatch(/^Instrumental /);
      expectGeneratedTitleInvariant(title);
    });
  });
});

function instrumentalTitle(
  categoryKey: Parameters<typeof createGenerationTrackTitle>[0]["categoryKey"],
  id = FIRST_TRACK_ID,
): string {
  return createGenerationTrackTitle({
    categoryKey,
    generatedLyrics: "[Instrumental]",
    id,
    prompt: "Unused prompt.",
    requestedLyrics: "",
  });
}

function expectGeneratedTitleInvariant(title: string): void {
  const wordCount = title.split(/\s+/).length;
  expect(wordCount).toBeGreaterThanOrEqual(1);
  expect(wordCount).toBeLessThanOrEqual(3);
  expect([...title].length).toBeLessThanOrEqual(24);
}
