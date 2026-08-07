import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  locomoMusicCategoryCatalogs,
  resolveLocomoMusicCategory,
} from "../src/renderer/category-catalog";
import {
  CELTIC_FOLK_CATEGORY_KEY,
  createGenerationForSelection,
  FAVORITES_COLLECTION_KEY,
  FAVORITES_EMPTY_STATE,
  favoriteActionLabel,
  favoriteSourceCategoryLabel,
  filterFavoriteTracks,
  generationCategoryForSelection,
  NARRATIVE_POP_CATEGORY_KEY,
  runFavoriteToggleAction,
  seedFavoritesPlaylist,
  visibleCategoryTiles,
} from "../src/renderer/favorites";
import {
  locomoMusicDarkStationArtwork,
  locomoMusicStationArtwork,
} from "../src/renderer/music-data";
import {
  createCategoryGenerationRequest,
  filterTracksForCategory,
  generationResultMatchesSelection,
  seedTrackPlaylist,
  shouldGenerateAfterQueueDrain,
} from "../src/renderer/radio";

describe("Favorites collection", () => {
  it("aggregates hearted tracks across active, retired, and Experimental categories", () => {
    const tracks = [
      track("existing-favorite", "existing/house", true),
      track("baroque-favorite", "existing/baroque", true),
      track("romantic-favorite", "existing/romantic", true),
      track("minimalist-favorite", "existing/minimalist", true),
      track(
        "experimental-favorite",
        "experimental/narrative-pop",
        true,
      ),
      track("existing-plain", "existing/indie-pop", false),
    ];

    expect(filterFavoriteTracks(tracks)).toEqual([
      tracks[0],
      tracks[1],
      tracks[2],
      tracks[3],
      tracks[4],
    ]);
    expect(seedFavoritesPlaylist(tracks).playlist).toEqual([
      "experimental-favorite",
      "minimalist-favorite",
      "romantic-favorite",
      "baroque-favorite",
      "existing-favorite",
    ]);
  });

  it("uses the normal playlist seed and playback order for favorites", () => {
    const tracks = [
      track("newest", "experimental/narrative-pop", true),
      track("middle-plain", "existing/house", false),
      track("oldest", "existing/indie-pop", true),
    ];
    const favorites = filterFavoriteTracks(tracks);

    expect(seedFavoritesPlaylist(tracks)).toEqual(
      seedTrackPlaylist(favorites),
    );
    expect(seedFavoritesPlaylist(tracks)).toMatchObject({
      playlist: ["oldest", "newest"],
      startingTrack: tracks[2],
    });
  });

  it("labels favorite rows from their persisted source category", () => {
    expect(favoriteSourceCategoryLabel("existing/house")).toBe("House");
    expect(favoriteSourceCategoryLabel("existing/baroque")).toBe(
      "Baroque",
    );
    expect(
      favoriteSourceCategoryLabel("experimental/custom-voice", [
        {
          group: "CUSTOM",
          key: "experimental/custom-voice",
          name: "Custom 1",
          set: "experimental",
        },
      ]),
    ).toBe("Custom 1");
    expect(favoriteSourceCategoryLabel(null)).toBeUndefined();
  });

  it("isolates the Heart action from row playback and exposes both labels", () => {
    const toggle = vi.fn();
    const play = vi.fn();
    let clickPropagatesToRow = true;

    runFavoriteToggleAction(
      {
        stopPropagation() {
          clickPropagatesToRow = false;
        },
      },
      toggle,
    );
    if (clickPropagatesToRow) play();

    expect(toggle).toHaveBeenCalledOnce();
    expect(play).not.toHaveBeenCalled();
    expect(favoriteActionLabel(false)).toBe("Add to favorites");
    expect(favoriteActionLabel(true)).toBe("Remove from favorites");
  });

  it("features the accepted quartet and preserves every remaining category order", () => {
    const categories = locomoMusicCategoryCatalogs.existing.categories;
    const tiles = visibleCategoryTiles(categories, "existing");
    const expectedCategoryOrder = categories
      .filter(
        (category) =>
          category.key !== CELTIC_FOLK_CATEGORY_KEY &&
          category.key !== NARRATIVE_POP_CATEGORY_KEY,
      )
      .map((category) => category.key);

    const featuredKeys = [
      "existing/future-french-house",
      "existing/latin-house",
      "existing/house",
      FAVORITES_COLLECTION_KEY,
    ];

    expect(tiles).toHaveLength(categories.length - 1);
    expect(tiles).toHaveLength(19);
    expect(tiles.slice(0, 4).map((tile) => tile.key)).toEqual(
      featuredKeys,
    );
    expect(tiles.slice(0, 4).map((tile) => tile.name)).toEqual([
      "Future French House",
      "Latin house",
      "House",
      "Favorites",
    ]);
    expect(
      tiles.slice(4).map((tile) => tile.key),
    ).toEqual(
      expectedCategoryOrder.filter(
        (key) => !featuredKeys.includes(key),
      ),
    );
    expect(new Set(tiles.map((tile) => tile.key)).size).toBe(
      tiles.length,
    );
    expect(
      tiles.some(
        (tile) =>
          tile.kind === "category" &&
          tile.key === CELTIC_FOLK_CATEGORY_KEY,
      ),
    ).toBe(false);
    expect(
      tiles.some(
        (tile) =>
          tile.kind === "category" &&
          tile.key === NARRATIVE_POP_CATEGORY_KEY,
      ),
    ).toBe(false);
    expect(
      resolveLocomoMusicCategory(NARRATIVE_POP_CATEGORY_KEY),
    ).toMatchObject({
      key: NARRATIVE_POP_CATEGORY_KEY,
      name: "Narrative Pop",
    });
    expect(resolveLocomoMusicCategory(CELTIC_FOLK_CATEGORY_KEY)).toMatchObject(
      {
        key: CELTIC_FOLK_CATEGORY_KEY,
        name: "Celtic folk",
      },
    );
    expect(locomoMusicStationArtwork["Celtic folk"]).toBeDefined();
    expect(locomoMusicDarkStationArtwork["Celtic folk"]).toBeDefined();
    expect(
      createCategoryGenerationRequest(
        CELTIC_FOLK_CATEGORY_KEY,
        false,
        0,
      ),
    ).toBeDefined();
    expect(
      filterTracksForCategory(
        [track("celtic", CELTIC_FOLK_CATEGORY_KEY, true)],
        CELTIC_FOLK_CATEGORY_KEY,
      ),
    ).toHaveLength(1);
    expect(
      visibleCategoryTiles(
        locomoMusicCategoryCatalogs.experimental.categories,
        "experimental",
      ).every((tile) => tile.kind === "category"),
    ).toBe(true);
  });

  it("cannot enter request construction or admit stale generation in Favorites", () => {
    const enterGenerationPath = vi.fn(() => ({ request: true }));
    const generationCategory = generationCategoryForSelection(
      FAVORITES_COLLECTION_KEY,
    );

    expect(
      createGenerationForSelection(
        FAVORITES_COLLECTION_KEY,
        enterGenerationPath,
      ),
    ).toBeUndefined();
    expect(enterGenerationPath).not.toHaveBeenCalled();
    expect(
      shouldGenerateAfterQueueDrain({
        autoCreate: true,
        categoryKey: generationCategory,
        disposed: false,
        queuedRequests: 0,
      }),
    ).toBe(false);
    expect(
      generationResultMatchesSelection(
        { categoryKey: "existing/house", selectionEpoch: 4 },
        generationCategory,
        5,
      ),
    ).toBe(false);
  });

  it("selects Favorites without changing Auto-create or enqueueing work", async () => {
    const source = await studioSource();
    const renderer = await rendererSource();
    const selectionStart = source.indexOf("const selectFavorites =");
    const selectionEnd = source.indexOf(
      "createEffect(() =>",
      selectionStart,
    );
    const selectionSource = source.slice(selectionStart, selectionEnd);

    expect(selectionSource).toContain(
      "setSelectionKey(FAVORITES_COLLECTION_KEY)",
    );
    expect(selectionSource).toContain("generationQueue.splice(0)");
    expect(selectionSource).toContain("automaticGenerationRuns.stop()");
    expect(selectionSource).toContain("requestWindowExpansion()");
    expect(selectionSource).not.toContain("generate()");
    expect(selectionSource).not.toContain("setAutoCreate");
    expect(source).toContain(
      "createGenerationForSelection(\n      selectionKey(),",
    );
    expect(source).not.toContain("AppleMusicSync");
    expect(source).not.toContain("onSelectionChange");
    expect(renderer).not.toContain("appleMusicSourceForSelection");
    expect(renderer).not.toContain("onSelectionChange");
  });

  it("renders the focused empty state and filled active Heart row action", async () => {
    const source = await studioSource();

    expect(FAVORITES_EMPTY_STATE).toBe(
      "Heart songs to see them here.",
    );
    expect(source).toContain("? FAVORITES_EMPTY_STATE");
    expect(source).toContain("favoriteActionLabel(track.isFavorite)");
    expect(source).toContain("runFavoriteToggleAction(event");
    expect(source).toContain(
      'track.isFavorite ? "currentColor" : "none"',
    );
    const toggleStart = source.indexOf("const toggleFavorite =");
    const toggleEnd = source.indexOf("const generate =", toggleStart);
    const toggleSource = source.slice(toggleStart, toggleEnd);
    expect(toggleSource).toContain(
      "current.filter((id) => id !== track.id)",
    );
    expect(toggleSource).not.toContain("audio?.pause");
    expect(toggleSource).not.toContain("playbackRequests.cancel");
    expect(toggleSource).not.toContain("releaseActiveAudioSource");
    expect(toggleSource).not.toContain("setPlaying");
  });

  it("shows source category secondary text only in Favorites rows", async () => {
    const source = await studioSource();
    const styles = await stylesSource();
    const rowStart = source.indexOf('<For each={stationTracks()}>');
    const rowEnd = source.indexOf("</For>", rowStart);
    const rowSource = source.slice(rowStart, rowEnd);
    const subtitleStart = rowSource.indexOf(
      "data-favorite-source-category",
    );
    const favoritesGuardStart = rowSource.lastIndexOf(
      "<Show when={favoritesSelected()}>",
      subtitleStart,
    );
    const subtitleEnd = rowSource.indexOf("</p>", subtitleStart);
    const subtitleSource = rowSource.slice(subtitleStart, subtitleEnd);
    const subtextStylesStart = styles.indexOf(".song-row__subtext {");
    const subtextStylesEnd = styles.indexOf("}", subtextStylesStart);
    const subtextStyles = styles.slice(
      subtextStylesStart,
      subtextStylesEnd,
    );

    expect(subtitleStart).toBeGreaterThan(-1);
    expect(favoritesGuardStart).toBeGreaterThan(-1);
    expect(rowSource.slice(favoritesGuardStart, subtitleStart)).toContain(
      "favoriteSourceCategoryLabel(\n                              track.categoryKey,",
    );
    expect(subtitleSource).toContain(
      'class="song-row__subtext mt-1 truncate text-[11px] leading-tight"',
    );
    expect(subtitleSource).not.toContain("text-locomo-");
    expect(subtextStylesStart).toBeGreaterThan(-1);
    expect(subtextStyles).toContain(
      "margin-inline-start: calc(0.375rem + 0.5rem);",
    );
    expect(subtextStyles).toContain(
      "color: color-mix(in srgb, currentcolor 55%, transparent);",
    );
    expect(styles).toContain(
      '.song-row[aria-current="true"] {\n  color: var(--locomo-surface);',
    );
    expect(source.match(/data-favorite-source-category/g)).toHaveLength(1);
  });

  it("keeps the small featured-track Heart persistent at the existing corner", async () => {
    const source = await studioSource();
    const actionsStart = source.indexOf("data-now-playing-actions");
    const secondaryStart = source.indexOf(
      "data-now-playing-secondary-actions",
      actionsStart,
    );
    const secondaryEnd = source.indexOf("</div>", secondaryStart);
    const controlStart = source.indexOf("data-now-playing-favorite");
    const controlEnd = source.indexOf("</button>", controlStart);
    const controlSource = source.slice(controlStart, controlEnd);
    const cardStart = source.lastIndexOf(
      '<div class="now-playing-card',
      actionsStart,
    );
    const cardSource = source.slice(cardStart, actionsStart);
    const actionsSource = source.slice(actionsStart, secondaryStart);

    expect(actionsStart).toBeGreaterThan(-1);
    expect(controlStart).toBeGreaterThan(-1);
    expect(secondaryEnd).toBeLessThan(controlStart);
    expect(cardSource).toContain(
      'class="now-playing-card relative flex min-h-[230px]',
    );
    expect(actionsSource).toContain(
      'class="absolute right-6 top-6 flex items-center',
    );
    expect(controlSource).toContain(
      "favoriteActionLabel(track().isFavorite)",
    );
    expect(controlSource).toContain(
      "aria-pressed={track().isFavorite}",
    );
    expect(controlSource).toContain(
      "runFavoriteToggleAction(event, () =>",
    );
    expect(controlSource).toContain("toggleFavorite(track())");
    expect(controlSource).toContain('class="p-2 transition-colors"');
    expect(controlSource).toContain("size={16}");
    expect(controlSource).toContain(
      'track().isFavorite ? "currentColor" : "none"',
    );
    expect(controlSource).not.toContain(
      "now-playing-secondary-actions",
    );
    expect(controlSource).not.toContain("opacity-0");
    expect(controlSource).not.toContain("rounded-full");
    expect(controlSource).not.toContain("bg-locomo-danger");
    expect(controlSource).not.toContain("size-10");
    expect(controlSource).not.toContain("play(track())");
    expect(controlSource).not.toContain("audio");
    expect(controlSource).not.toContain("setProgress");
  });

  it("reveals secondary Now Playing actions for hover and keyboard focus", async () => {
    const source = await studioSource();
    const styles = await stylesSource();

    expect(source).toContain("data-now-playing-secondary-actions");
    expect(styles).toContain(
      ".now-playing-card:hover .now-playing-secondary-actions",
    );
    expect(styles).toContain(
      ".now-playing-card:focus-within .now-playing-secondary-actions",
    );
    expect(styles).toMatch(
      /\.now-playing-secondary-actions\s*\{[\s\S]*?opacity: 0;[\s\S]*?pointer-events: none;/,
    );
    expect(styles).toMatch(
      /@media \(hover: none\)[\s\S]*?\.now-playing-secondary-actions\s*\{[\s\S]*?opacity: 1;[\s\S]*?pointer-events: auto;/,
    );
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.now-playing-secondary-actions\s*\{[\s\S]*?transition: none;/,
    );
  });

  it("isolates every Now Playing action and reuses the row handlers", async () => {
    const source = await studioSource();
    const actionsStart = source.indexOf("data-now-playing-actions");
    const actionsEnd = source.indexOf(
      '<div class="now-playing-card__content flex min-w-0 flex-1">',
      actionsStart,
    );
    const actionsSource = source.slice(actionsStart, actionsEnd);

    expect(actionsSource).toContain('aria-label="Download song"');
    expect(actionsSource).toContain("<Download size={16} />");
    expect(actionsSource).toContain(
      "runDownloadSongAction(event, () =>",
    );
    expect(actionsSource).toContain("downloadTrack(track())");
    expect(actionsSource).toContain('aria-label="Delete track"');
    expect(actionsSource).toContain("<Trash2 size={16} />");
    expect(actionsSource).toContain("event.stopPropagation();");
    expect(actionsSource).toContain("deleteTrack(track());");
    expect(actionsSource).toContain(
      "runFavoriteToggleAction(event, () =>",
    );
    expect(actionsSource).not.toContain("play(track())");
    expect(actionsSource).not.toContain("setProgress");
    expect(actionsSource).not.toContain("audio");

    expect(source.match(/downloadTrack\(track\(\)\)/g)).toHaveLength(1);
    expect(source.match(/downloadTrack\(track\)/g)).toHaveLength(1);
    expect(source.match(/deleteTrack\(track\(\)\)/g)).toHaveLength(1);
    expect(source.match(/deleteTrack\(track\)/g)).toHaveLength(1);
    expect(source.match(/\.delete\(track\.id\)/g)).toHaveLength(1);
    expect(source.match(/Could not delete this song/g)).toHaveLength(1);
  });

  it("keeps Now Playing and song-row Heart semantics consistent", async () => {
    const source = await studioSource();
    const nowPlayingStart = source.indexOf("data-now-playing-favorite");
    const rowStart = source.indexOf(
      "aria-label={favoriteActionLabel(\n                            track.isFavorite,",
      nowPlayingStart,
    );
    const nowPlayingSource = source.slice(
      nowPlayingStart,
      source.indexOf("</button>", nowPlayingStart),
    );
    const rowSource = source.slice(
      rowStart,
      source.indexOf("</button>", rowStart),
    );

    expect(rowStart).toBeGreaterThan(nowPlayingStart);
    expect(nowPlayingSource).toContain(
      "aria-pressed={track().isFavorite}",
    );
    expect(rowSource).toContain("aria-pressed={track.isFavorite}");
    expect(nowPlayingSource).toContain("size={16}");
    expect(rowSource).toContain("size={16}");
    expect(nowPlayingSource).toContain(
      'track().isFavorite ? "currentColor" : "none"',
    );
    expect(rowSource).toContain(
      'track.isFavorite ? "currentColor" : "none"',
    );
  });
});

function track(
  id: string,
  categoryKey:
    | "existing/house"
    | "existing/indie-pop"
    | "existing/celtic-folk"
    | "existing/baroque"
    | "existing/romantic"
    | "existing/minimalist"
    | "experimental/narrative-pop",
  isFavorite: boolean,
) {
  return { categoryKey, id, isFavorite };
}

function studioSource(): Promise<string> {
  return readFile(
    new URL(
      "../src/renderer/LocomoMusicStudio.tsx",
      import.meta.url,
    ),
    "utf8",
  );
}

function stylesSource(): Promise<string> {
  return readFile(
    new URL("../src/renderer/styles.css", import.meta.url),
    "utf8",
  );
}

function rendererSource(): Promise<string> {
  return readFile(
    new URL("../src/renderer/renderer.tsx", import.meta.url),
    "utf8",
  );
}
