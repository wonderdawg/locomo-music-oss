import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  ACCEPTED_CATEGORY_PANE_WIDTH,
  COLLAPSED_WINDOW_WIDTH,
  REVEALED_WINDOW_WIDTH,
  RIGHT_PANE_WIDTH,
} from "../src/shared/window-layout";

describe("category-first controls", () => {
  it("launches with the accepted category pane widened by 30 percent", () => {
    expect(ACCEPTED_CATEGORY_PANE_WIDTH).toBe(634);
    expect(COLLAPSED_WINDOW_WIDTH).toBe(
      Math.round(ACCEPTED_CATEGORY_PANE_WIDTH * 1.3),
    );
    expect(COLLAPSED_WINDOW_WIDTH).toBe(824);
    expect(RIGHT_PANE_WIDTH).toBe(532);
    expect(REVEALED_WINDOW_WIDTH).toBe(1_356);
    expect(COLLAPSED_WINDOW_WIDTH).toBe(
      REVEALED_WINDOW_WIDTH - RIGHT_PANE_WIDTH,
    );
  });

  it("shows only the Existing grid before a category is selected", async () => {
    const source = await readFile(
      new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
      "utf8",
    );
    const categoryPaneStart = source.indexOf("data-category-pane");
    const categoryGridStart = source.indexOf(
      "data-category-grid",
      categoryPaneStart,
    );
    const rightPaneStart = source.indexOf(
      "data-right-pane",
      categoryGridStart,
    );
    const categoryPane = source.slice(categoryPaneStart, rightPaneStart);

    expect(categoryPaneStart).toBeGreaterThanOrEqual(0);
    expect(categoryGridStart).toBeGreaterThan(categoryPaneStart);
    expect(source).not.toContain("data-control-pane");
    expect(source).not.toContain("data-category-set-selector");
    expect(source).not.toContain('data-toggle="auto-create"');
    expect(source).not.toContain('data-toggle="lyrics"');
    expect(source).not.toContain("<SongLengthDial");
    expect(source).toContain('createSignal<MusicCategorySet>("existing")');
    expect(categoryPane).toContain(
      'class="studio-pane-vertical-rails flex shrink-0 flex-col px-6"',
    );
    expect(categoryPane).toContain("data-category-grid-heading");
    expect(categoryPane).toContain("Tap to play");
    expect(categoryPane).toContain(
      '"grid-cols-3 auto-rows-[minmax(92px,1fr)] overflow-y-auto"',
    );
    expect(categoryPane).toContain(
      '"grid-cols-[repeat(20,minmax(0,1fr))] grid-rows-[repeat(2,196px)_repeat(3,130.5px)] content-start overflow-hidden"',
    );
    expect(source).toContain(
      "width: `${paneLayout().left}px`,",
    );
  });

  it("shares the selected-content top and bottom rails across panes", async () => {
    const [source, styles] = await Promise.all([
      readFile(
        new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/renderer/styles.css", import.meta.url),
        "utf8",
      ),
    ]);
    const categoryPaneStart = source.indexOf("data-category-pane");
    const categoryPaneEnd = source.indexOf(">", categoryPaneStart);
    const rightPaneStart = source.indexOf("data-right-pane");
    const rightPaneEnd = source.indexOf(">", rightPaneStart);
    const categoryPaneOpening = source.slice(
      categoryPaneStart,
      categoryPaneEnd,
    );
    const rightPaneOpening = source.slice(rightPaneStart, rightPaneEnd);

    expect(categoryPaneStart).toBeGreaterThanOrEqual(0);
    expect(rightPaneStart).toBeGreaterThan(categoryPaneStart);
    expect(categoryPaneOpening).toContain("studio-pane-vertical-rails");
    expect(rightPaneOpening).toContain("studio-pane-vertical-rails");
    expect(categoryPaneOpening).toContain("px-6");
    expect(rightPaneOpening).toContain("px-8");
    expect(
      source.match(
        /class="studio-pane-heading mb-6 shrink-0 text-pane-heading"/gu,
      ),
    ).toHaveLength(2);
    expect(source).toContain('class="grid min-h-0 flex-1 gap-2"');
    expect(source).toContain(
      'class="studio-playlist-card mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-locomo-contrast/50"',
    );
    expect(styles).toContain(`.studio-pane-vertical-rails {
  padding-block-start: 2rem;
  padding-block-end: 1.5rem;
}`);
  });

  it("keeps the featured hierarchy at stable accepted heights", async () => {
    const source = await readFile(
      new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      '"grid-cols-[repeat(20,minmax(0,1fr))] grid-rows-[repeat(2,196px)_repeat(3,130.5px)] content-start overflow-hidden"',
    );
    expect(source).not.toContain(
      "grid-rows-[repeat(2,minmax(0,1.5fr))_repeat(3,minmax(0,1fr))]",
    );
    expect(source).toContain('"col-span-10"');
    expect(source).toContain('"col-span-4"');
    expect(source).toContain('data-category-card={');
    expect(source).toContain('data-station-artwork={artwork()}');
    expect(source).toContain(
      'if (item.key === "existing/progressive-metal") return "74%";',
    );
    expect(source).toContain(
      'if (item.key === "existing/cinematic-hip-hop") return "68%";',
    );
    expect(source).toContain(
      'if (item.key === "existing/latin-techno") return "70%";',
    );
    expect(source).toContain('return "contain";');
    expect(source).toContain(
      '"-webkit-mask-size": categoryArtworkMaskSize(item)',
    );
    expect(source).toContain(
      '"mask-size": categoryArtworkMaskSize(item)',
    );
    expect(source).not.toContain('"62% auto"');
    expect(source).toContain('"background-color": "currentColor"');
    expect(source).toContain('"-webkit-mask-image"');
    expect(source).toContain('"mask-image"');
    expect(source).toContain('"-webkit-mask-repeat": "no-repeat"');
    expect(source).toContain('"mask-repeat": "no-repeat"');
    expect(source).not.toContain('"background-image"');
    expect(source).not.toContain("FEATURED_CATEGORY_ARTWORK_REVISION");
    expect(source).not.toContain(
      'bg-gradient-to-br from-[#713a4c] via-[#38252d] to-[#171416]',
    );
    expect(source).not.toContain(
      "bg-gradient-to-t from-black/90 via-black/35 to-transparent",
    );
    expect(source).not.toContain(
      'bg-gradient-to-br from-[#574027] via-[#282119] to-[#151414]',
    );
    expect(source).not.toContain(
      'bg-gradient-to-br from-[#263f46] via-[#20292d] to-[#141617]',
    );
    expect(source).not.toContain(
      'bg-gradient-to-br from-[#493044] via-[#292027] to-[#151415]',
    );
    expect(source).not.toContain(
      'bg-gradient-to-br from-[#34402b] via-[#232820] to-[#141514]',
    );
    expect(source).not.toContain(
      'class="absolute inset-x-0 top-[18%] flex justify-center text-white/75"',
    );
    expect(source).toContain(
      '"border-locomo-surface/45 bg-locomo-foreground"',
    );
    expect(source).toContain(
      '"text-locomo-surface":\n                            selectionKey() === item.key',
    );
    expect(source).not.toContain("ring-2");
    expect(source).not.toContain("<Check");
    expect(source).not.toContain("bg-white/[0.07] blur-sm");
    expect(source).not.toContain("group-hover/station:scale-125");
    expect(source).toContain('"text-locomo-foreground"');
    expect(source).toContain(
      'class="category-card__label absolute inset-x-2.5 bottom-2.5 pb-px"',
    );
    expect(source).toContain(
      'class="category-card__title block overflow-visible leading-[1.25]"',
    );
  });

  it("restores pane hierarchy while keeping the playlist heading plain", async () => {
    const source = await readFile(
      new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
      "utf8",
    );

    const rightPaneStart = source.indexOf("data-right-pane");
    const nowPlayingStart = source.indexOf(
      "now-playing-card",
      rightPaneStart,
    );
    const selectedCategoryHeadingStart = source.indexOf(
      "data-selected-category-heading",
      rightPaneStart,
    );
    const playlistHeadingStart = source.indexOf(
      "data-playlist-heading",
      nowPlayingStart,
    );
    const songCountStart = source.indexOf(
      "data-song-count-pill",
      playlistHeadingStart,
    );
    const selectedCategoryHeading = source.slice(
      selectedCategoryHeadingStart,
      nowPlayingStart,
    );

    expect(source).toContain("data-category-grid-heading");
    expect(source).toContain("Tap to play");
    expect(rightPaneStart).toBeGreaterThanOrEqual(0);
    expect(selectedCategoryHeadingStart).toBeGreaterThan(rightPaneStart);
    expect(nowPlayingStart).toBeGreaterThan(rightPaneStart);
    expect(selectedCategoryHeadingStart).toBeLessThan(nowPlayingStart);
    expect(playlistHeadingStart).toBeGreaterThan(nowPlayingStart);
    expect(songCountStart).toBeGreaterThan(playlistHeadingStart);
    expect(selectedCategoryHeading).toContain("{station()}");
    expect(selectedCategoryHeading).toContain("text-pane-heading");
    expect(selectedCategoryHeading).not.toContain("data-song-count-pill");
    expect(source).not.toContain("{station()} Playlist");
    expect(source.slice(playlistHeadingStart, songCountStart)).toContain(
      "Playlist",
    );
    expect(source).toContain(
      'stationTracks().length === 1 ? "song" : "songs"',
    );
    expect(source).toContain(
      'class="studio-pane-vertical-rails flex shrink-0 flex-col px-6"',
    );
    expect(source).toContain(
      'class="grid min-h-0 flex-1 gap-2"',
    );
    expect(source).toContain(
      'class="studio-pane-heading mb-6 shrink-0 text-pane-heading"',
    );
    expect(source).not.toContain(
      'class="mb-6 flex shrink-0 items-end justify-between gap-4"',
    );
    expect(source).toContain(
      'class="studio-pane-vertical-rails flex h-full min-h-0 min-w-0 shrink-0 flex-col overflow-hidden px-8"',
    );
    expect(source).toContain('"text-[31.2px] font-bold"');
    expect(source).toContain('"text-[12.1px] font-bold"');
  });

  it("uses the existing Auto-create state machine for the playlist pill", async () => {
    const source = await readFile(
      new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
      "utf8",
    );
    const rowStart = source.indexOf("data-generation-row");
    const rowsStart = source.indexOf(
      '<div class="min-h-0 flex-1 overflow-y-auto">',
      rowStart,
    );
    const row = source.slice(rowStart, rowsStart);
    const toggleStart = source.indexOf("const toggleAutoCreate = () => {");
    const toggleEnd = source.indexOf("const closeAddCategory", toggleStart);
    const toggle = source.slice(toggleStart, toggleEnd);

    expect(rowStart).toBeGreaterThanOrEqual(0);
    expect(rowsStart).toBeGreaterThan(rowStart);
    expect(row).toContain("Making a new song");
    expect(row).toContain("Make a new song");
    expect(row).toContain("autoCreate()");
    expect(row).toContain("On this Mac");
    expect(row).toContain("data-generation-toggle");
    expect(row).toContain("props.generationAvailable &&");
    expect(row).toContain("autoCreate() &&");
    expect(row).toContain("generating()");
    expect(
      row.indexOf(
        "flex size-11 shrink-0 items-center justify-center rounded-full",
      ),
    ).toBeLessThan(
      row.indexOf("<Show"),
    );
    expect(row).toContain('!props.generationAvailable');
    expect(row).toContain("categoryGenerationPending()");
    expect(row).toContain("generationWaitingTitle()");
    expect(source).not.toContain(
      "Music will start generating when download completes",
    );
    expect(row).toContain("generationToggleActive()");
    expect(row).not.toContain('"Setup required"');
    expect(row).not.toContain('disabled={!props.generationAvailable}');
    expect(row).toContain("onClick={toggleAutoCreate}");
    expect(toggle).toContain("setAutoCreate(false)");
    expect(toggle).toContain("generationQueue.splice(0)");
    expect(toggle).toContain("setAutoCreate(true)");
    expect(toggle).toContain("generate()");
  });

  it("removes visible parent labels while retaining card accessibility", async () => {
    const source = await readFile(
      new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
      "utf8",
    );
    const parentLabelReferences = source.match(
      /item\.artist \?\? item\.group/gu,
    );

    expect(parentLabelReferences).toHaveLength(1);
    expect(source).toContain(
      'aria-label={`${categoryDisplayName(item.name)}, ${item.artist ?? item.group}`}',
    );
    expect(source).not.toContain(
      'text-[9px] font-medium uppercase tracking-[0.12em]',
    );
    expect(source).toContain("{categoryDisplayName(item.name)}");
  });
});
