import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  collapsedWindowBounds,
  expandWindowOnce,
  expandedWindowBounds,
  responsiveWindowBounds,
  type WindowBounds,
} from "../src/main/window-reveal";
import { createOneTimeWindowExpansionRequester } from "../src/renderer/window-reveal";
import {
  ACCEPTED_CATEGORY_PANE_WIDTH,
  ACCEPTED_RIGHT_PANE_WIDTH,
  COLLAPSED_WINDOW_WIDTH,
  COMPACT_RIGHT_PANE_BASE_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  MINIMUM_WINDOW_HEIGHT,
  paneWidths,
  REVEALED_WINDOW_WIDTH,
  RIGHT_PANE_WIDTH,
  studioPaneWidths,
} from "../src/shared/window-layout";

describe("two-pane window reveal", () => {
  it("launches collapsed at the 30-percent wider category pane", () => {
    expect(
      collapsedWindowBounds({
        x: 0,
        y: 25,
        width: 1_728,
        height: 1_092,
      }),
    ).toEqual({
      x: 186,
      y: 85,
      width: COLLAPSED_WINDOW_WIDTH,
      height: 972,
    });
    expect(DEFAULT_WINDOW_HEIGHT).toBe(972);
    expect(ACCEPTED_CATEGORY_PANE_WIDTH).toBe(634);
    expect(COLLAPSED_WINDOW_WIDTH).toBe(
      Math.round(ACCEPTED_CATEGORY_PANE_WIDTH * 1.3),
    );
    expect(COLLAPSED_WINDOW_WIDTH).toBe(824);
  });

  it("fits a 13-inch MacBook Air work area exactly", () => {
    expect(
      collapsedWindowBounds({
        x: 0,
        y: 37,
        width: 1_470,
        height: 832,
      }),
    ).toEqual({
      x: 119,
      y: 37,
      width: 700,
      height: 832,
    });
    expect(studioPaneWidths(832).left).toBe(700);
  });

  it("fits a more constrained MacBook Air work area exactly", () => {
    expect(
      collapsedWindowBounds({
        x: 0,
        y: 25,
        width: 1_440,
        height: 796,
      }),
    ).toEqual({
      x: 119,
      y: 25,
      width: 669,
      height: 796,
    });
    expect(studioPaneWidths(796).left).toBe(669);
  });

  it(
    "widens the accepted 484px right pane by exactly 10 percent",
    () => {
      expect(COMPACT_RIGHT_PANE_BASE_WIDTH).toBe(403);
      expect(ACCEPTED_RIGHT_PANE_WIDTH).toBe(
        Math.round(COMPACT_RIGHT_PANE_BASE_WIDTH * 1.2),
      );
      expect(ACCEPTED_RIGHT_PANE_WIDTH).toBe(484);
      expect(RIGHT_PANE_WIDTH).toBe(
        Math.round(ACCEPTED_RIGHT_PANE_WIDTH * 1.1),
      );
      expect(RIGHT_PANE_WIDTH).toBe(532);
      expect(paneWidths()).toEqual({ left: 824, right: 532 });
      expect(REVEALED_WINDOW_WIDTH).toBe(
        COLLAPSED_WINDOW_WIDTH + RIGHT_PANE_WIDTH,
      );
      expect(REVEALED_WINDOW_WIDTH).toBe(1_356);
    },
  );

  it("keeps fixed panes inside the expandable renderer", async () => {
    const source = await readFile(
      new URL(
        "../src/renderer/LocomoMusicStudio.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).toMatch(
      /class="locomo-studio[^"]*overflow-hidden/,
    );
    expect(source).toContain("data-studio-panes");
    expect(source).toContain(
      "const TRACK_DETAILS_UI_ENABLED: boolean = false;",
    );
    expect(
      source.match(/visibleTrackDetailsSelection\(\)/gu),
    ).toHaveLength(3);
    expect(source).toContain("studioPaneWidths(viewportHeight())");
    expect(source.match(/\? paneLayout\(\)\.trackDetails/gu)).toHaveLength(
      2,
    );
    expect(source.match(/: paneLayout\(\)\.revealed/gu)).toHaveLength(2);
    expect(source).toContain("data-right-pane");
    expect(source).toContain(
      "width: `${RIGHT_PANE_WIDTH}px`,",
    );
    expect(source).toContain(
      '"min-width": `${RIGHT_PANE_WIDTH}px`,',
    );
    expect(source).toContain("max-[1166px]:p-5");
    expect(source).toContain("max-[1166px]:py-0");
  });

  it("uses 18px only for actual scrollable song-row titles", async () => {
    const source = await readFile(
      new URL(
        "../src/renderer/LocomoMusicStudio.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const songRowsStart = source.indexOf(
      "<For each={stationTracks()}>",
    );
    const songRowsEnd = source.indexOf("</For>", songRowsStart);
    expect(songRowsStart).toBeGreaterThanOrEqual(0);
    expect(songRowsEnd).toBeGreaterThan(songRowsStart);
    const songRowsSource = source.slice(songRowsStart, songRowsEnd);
    const generatingRowSource = source.slice(
      source.lastIndexOf("data-generation-row", songRowsStart),
      songRowsStart,
    );

    expect(songRowsSource).toContain(
      "truncate text-[18px] font-semibold",
    );
    expect(songRowsSource).not.toContain("text-[22px]");
    expect(songRowsSource.match(/text-\[18px\]/g)).toHaveLength(1);
    expect(generatingRowSource).toContain("Making a new song");
    expect(generatingRowSource).toContain("Make a new song");
    expect(generatingRowSource).toContain("autoCreate()");
    expect(generatingRowSource).toContain(
      'class="font-bold text-locomo-foreground"',
    );
    expect(generatingRowSource).toContain('"truncate text-[22px]"');
    expect(generatingRowSource).toContain(
      '"whitespace-normal text-pretty text-[14px] leading-4"',
    );
    expect(source).toContain(
      "truncate text-[32px] font-semibold leading-tight",
    );
  });

  it("caps vertical growth while preserving horizontal reveal", async () => {
    const source = await readFile(
      new URL("../src/main/main.ts", import.meta.url),
      "utf8",
    );
    const createWindowStart = source.indexOf(
      "function createWindow(): BrowserWindow {",
    );
    const settingsWindowStart = source.indexOf(
      "function createSettingsWindow(): BrowserWindow {",
    );
    expect(createWindowStart).toBeGreaterThanOrEqual(0);
    expect(settingsWindowStart).toBeGreaterThan(createWindowStart);
    const createWindowSource = source.slice(
      createWindowStart,
      settingsWindowStart,
    );

    expect(createWindowSource).toContain("fullscreenable: false,");
    expect(createWindowSource).toContain("maximizable: false,");
    expect(createWindowSource).toContain(
      "const targetWorkArea = screen.getPrimaryDisplay().workArea;",
    );
    expect(createWindowSource).toContain(
      "const initialBounds = collapsedWindowBounds(targetWorkArea);",
    );
    expect(createWindowSource).toContain(
      "const minimumHeight = Math.min(",
    );
    expect(createWindowSource).toContain("minHeight: minimumHeight,");
    expect(createWindowSource).toContain(
      "studioPaneWidths(minimumHeight).left,",
    );
    expect(createWindowSource).toContain(
      "maxHeight: initialBounds.height,",
    );
    expect(createWindowSource).toContain("maxWidth: targetWorkArea.width,");
    expect(createWindowSource).not.toContain("resizable: false,");
    expect(createWindowSource).toContain(
      'window.on("will-resize", (event, proposedBounds) => {',
    );
    expect(createWindowSource).toContain("responsiveWindowBounds(");
    expect(MINIMUM_WINDOW_HEIGHT).toBe(760);
  });

  it("shows the main window once only after its first renderer paint", async () => {
    const source = await readFile(
      new URL("../src/main/main.ts", import.meta.url),
      "utf8",
    );
    const createWindowStart = source.indexOf(
      "function createWindow(): BrowserWindow {",
    );
    const settingsWindowStart = source.indexOf(
      "function createSettingsWindow(): BrowserWindow {",
    );
    const createWindowSource = source.slice(
      createWindowStart,
      settingsWindowStart,
    );

    expect(createWindowStart).toBeGreaterThanOrEqual(0);
    expect(settingsWindowStart).toBeGreaterThan(createWindowStart);
    expect(createWindowSource).toContain('backgroundColor: "#cde50b",');
    expect(createWindowSource).toContain("show: false,");
    expect(createWindowSource).toContain("if (!isAutomatedRun) {");
    expect(
      createWindowSource.match(/window\.once\("ready-to-show"/gu),
    ).toHaveLength(1);
    expect(createWindowSource.match(/window\.show\(\);/gu)).toHaveLength(1);
    expect(createWindowSource).not.toContain("paintWhenInitiallyHidden");
  });

  it("pulls both native sides inward when the collapsed window gets shorter", () => {
    let bounds: WindowBounds = {
      x: 186,
      y: 85,
      width: COLLAPSED_WINDOW_WIDTH,
      height: 972,
    };
    const window = {
      getBounds: () => bounds,
      getMaximumSize: () => [COLLAPSED_WINDOW_WIDTH, 972],
      setBounds: (nextBounds: WindowBounds) => {
        bounds = nextBounds;
      },
      setMaximumSize: () => undefined,
    };

    expect(
      responsiveWindowBounds(
        window,
        { x: 186, y: 85, width: 824, height: 760 },
        { x: 0, y: 25, width: 1_728, height: 1_092 },
      ),
    ).toEqual({
      x: 280,
      y: 85,
      width: 637,
      height: 760,
    });
  });

  it("expands the native window only once", () => {
    let bounds: WindowBounds = {
      x: 186,
      y: 85,
      width: COLLAPSED_WINDOW_WIDTH,
      height: 972,
    };
    const setBounds = vi.fn((nextBounds: WindowBounds) => {
      bounds = nextBounds;
    });
    const setMaximumSize = vi.fn();
    const window = {
      getBounds: () => bounds,
      getMaximumSize: () => [COLLAPSED_WINDOW_WIDTH, 972],
      setBounds,
      setMaximumSize,
    };
    const workArea = { x: 0, y: 25, width: 1_728, height: 1_092 };

    expect(expandWindowOnce(window, workArea)).toBe(true);
    expect(expandWindowOnce(window, workArea)).toBe(false);
    expect(setBounds).toHaveBeenCalledOnce();
    expect(setMaximumSize).toHaveBeenCalledOnce();
    expect(setMaximumSize).toHaveBeenCalledWith(1_728, 972);
    expect(setBounds).toHaveBeenCalledWith(
      { x: 186, y: 85, width: 1_356, height: 972 },
      true,
    );
    expect(setMaximumSize.mock.invocationCallOrder[0]).toBeLessThan(
      setBounds.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it("caps expanded resizing at the display-clamped target", () => {
    let bounds: WindowBounds = {
      x: 200,
      y: 60,
      width: COLLAPSED_WINDOW_WIDTH,
      height: 720,
    };
    const setBounds = vi.fn((nextBounds: WindowBounds) => {
      bounds = nextBounds;
    });
    const setMaximumSize = vi.fn();
    const window = {
      getBounds: () => bounds,
      getMaximumSize: () => [COLLAPSED_WINDOW_WIDTH, 0],
      setBounds,
      setMaximumSize,
    };

    expect(
      expandWindowOnce(window, {
        x: 80,
        y: 40,
        width: 900,
        height: 760,
      }),
    ).toBe(true);
    expect(
      expandWindowOnce(window, {
        x: 80,
        y: 40,
        width: 900,
        height: 760,
      }),
    ).toBe(false);
    expect(setMaximumSize).toHaveBeenCalledOnce();
    expect(setMaximumSize).toHaveBeenCalledWith(900, 0);
    expect(setBounds).toHaveBeenCalledOnce();
    expect(setBounds).toHaveBeenCalledWith(
      { x: 80, y: 60, width: 900, height: 720 },
      true,
    );
  });

  it("requests expansion for the first category selection only", () => {
    const expandWindow = vi.fn(async () => undefined);
    const requestExpansion =
      createOneTimeWindowExpansionRequester(expandWindow);

    expect(requestExpansion()).toBe(true);
    expect(requestExpansion()).toBe(false);
    expect(requestExpansion()).toBe(false);
    expect(expandWindow).toHaveBeenCalledOnce();
  });

  it("uses the compact reveal width and clamps it to the display edge", () => {
    const compactRevealWidth = studioPaneWidths(700).revealed;
    expect(
      expandedWindowBounds(
        { x: 700, y: 100, width: 824, height: 900 },
        { x: 100, y: 40, width: 1_200, height: 700 },
      ),
    ).toEqual({
      x: 100 + 1_200 - compactRevealWidth,
      y: 40,
      width: compactRevealWidth,
      height: 700,
    });
  });

  it("shifts left only when the widened reveal would cross the display edge", () => {
    const compactRevealWidth = studioPaneWidths(900).revealed;
    expect(
      expandedWindowBounds(
        { x: -500, y: 100, width: 824, height: 900 },
        { x: -1_920, y: 23, width: 1_920, height: 1_057 },
      ),
    ).toEqual({
      x: -compactRevealWidth,
      y: 100,
      width: compactRevealWidth,
      height: 900,
    });
  });

  it("preserves the left edge when the widened reveal fits", () => {
    const compactRevealWidth = studioPaneWidths(900).revealed;
    expect(
      expandedWindowBounds(
        { x: -1_500, y: 100, width: 824, height: 900 },
        { x: -1_920, y: 23, width: 1_920, height: 1_057 },
      ),
    ).toEqual({
      x: -1_500,
      y: 100,
      width: compactRevealWidth,
      height: 900,
    });
  });

  it("clips the reveal safely on a display narrower than the target", () => {
    expect(
      expandedWindowBounds(
        { x: 200, y: 60, width: 824, height: 720 },
        { x: 80, y: 40, width: 900, height: 760 },
      ),
    ).toEqual({
      x: 80,
      y: 60,
      width: 900,
      height: 720,
    });
  });
});
