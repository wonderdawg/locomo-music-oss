export const ACCEPTED_CATEGORY_PANE_WIDTH = 634;
export const COLLAPSED_WINDOW_WIDTH = Math.round(
  ACCEPTED_CATEGORY_PANE_WIDTH * 1.3,
);
export const COMPACT_RIGHT_PANE_BASE_WIDTH = 403;
export const ACCEPTED_RIGHT_PANE_WIDTH = Math.round(
  COMPACT_RIGHT_PANE_BASE_WIDTH * 1.2,
);
export const RIGHT_PANE_WIDTH = Math.round(
  ACCEPTED_RIGHT_PANE_WIDTH * 1.1,
);
export const REVEALED_WINDOW_WIDTH =
  COLLAPSED_WINDOW_WIDTH + RIGHT_PANE_WIDTH;
export const TRACK_DETAILS_PANE_WIDTH = 420;
export const TRACK_DETAILS_WINDOW_WIDTH =
  REVEALED_WINDOW_WIDTH + TRACK_DETAILS_PANE_WIDTH;
export const DEFAULT_WINDOW_HEIGHT = 972;
export const MINIMUM_WINDOW_HEIGHT = 760;
export const SETTINGS_WINDOW_HEIGHT = 550;
export const SETTINGS_WINDOW_WIDTH = 480;

export const STUDIO_CHROME_HEIGHT = 38;
export const STUDIO_PANE_TOP_RAIL = 32;
export const STUDIO_PANE_BOTTOM_RAIL = 24;
export const STUDIO_PANE_HEADING_FONT_SIZE = 28.8;
export const STUDIO_PANE_HEADING_LINE_HEIGHT = 38.4;
export const STUDIO_PANE_HEADING_GAP = 24;
export const CATEGORY_GRID_DESIGN_WIDTH = 776;
export const CATEGORY_GRID_DESIGN_HEIGHT = 815.6;
export const CATEGORY_GRID_FEATURED_TRACK_HEIGHT = 196;
export const CATEGORY_GRID_STANDARD_TRACK_HEIGHT = 130.5;
export const CATEGORY_GRID_GAP = 8;
export const CATEGORY_GRID_FEATURED_LABEL_SIZE = 31.2;
export const CATEGORY_GRID_STANDARD_LABEL_SIZE = 12.1;
export const CATEGORY_GRID_LABEL_INSET = 10;
export const CATEGORY_GRID_BORDER_RADIUS = 12;

export type StudioHeightLayoutMode = "design" | "compact";

export interface StudioHeightLayout {
  readonly mode: StudioHeightLayoutMode;
  readonly scale: number;
  readonly viewportHeight: number;
  readonly pane: {
    readonly topRail: number;
    readonly bottomRail: number;
    readonly headingFontSize: number;
    readonly headingLineHeight: number;
    readonly headingGap: number;
  };
  readonly categoryGrid: {
    readonly width: number;
    readonly height: number;
    readonly featuredTrackHeight: number;
    readonly standardTrackHeight: number;
    readonly gap: number;
    readonly featuredLabelSize: number;
    readonly standardLabelSize: number;
    readonly labelInset: number;
    readonly borderRadius: number;
  };
  readonly rightPane: {
    readonly nowPlayingMinHeight: number;
    readonly nowPlayingPadding: number;
    readonly nowPlayingActionInset: number;
    readonly nowPlayingTitleSize: number;
    readonly transportButtonSize: number;
    readonly transportGap: number;
    readonly transportOffset: number;
    readonly playlistHeadingGap: number;
    readonly playlistCardGap: number;
    readonly rowGap: number;
    readonly rowPadding: number;
  };
}

export interface StudioPaneWidths {
  readonly left: number;
  readonly right: number;
  readonly revealed: number;
  readonly trackDetails: number;
  readonly categoryInlinePadding: number;
}

export function studioHeightLayout(
  viewportHeight: number,
): StudioHeightLayout {
  const safeViewportHeight =
    Number.isFinite(viewportHeight) && viewportHeight > 0
      ? viewportHeight
      : DEFAULT_WINDOW_HEIGHT;
  const mode: StudioHeightLayoutMode =
    safeViewportHeight < DEFAULT_WINDOW_HEIGHT ? "compact" : "design";
  const scale =
    mode === "design"
      ? 1
      : Math.max(
          0,
          (safeViewportHeight - STUDIO_CHROME_HEIGHT) /
            (DEFAULT_WINDOW_HEIGHT - STUDIO_CHROME_HEIGHT),
        );

  return {
    mode,
    scale,
    viewportHeight: safeViewportHeight,
    pane: {
      topRail: scaled(STUDIO_PANE_TOP_RAIL, scale),
      bottomRail: scaled(STUDIO_PANE_BOTTOM_RAIL, scale),
      headingFontSize: scaled(STUDIO_PANE_HEADING_FONT_SIZE, scale),
      headingLineHeight: scaled(STUDIO_PANE_HEADING_LINE_HEIGHT, scale),
      headingGap: scaled(STUDIO_PANE_HEADING_GAP, scale),
    },
    categoryGrid: {
      width: scaled(CATEGORY_GRID_DESIGN_WIDTH, scale),
      height: scaled(CATEGORY_GRID_DESIGN_HEIGHT, scale),
      featuredTrackHeight: scaled(
        CATEGORY_GRID_FEATURED_TRACK_HEIGHT,
        scale,
      ),
      standardTrackHeight: scaled(
        CATEGORY_GRID_STANDARD_TRACK_HEIGHT,
        scale,
      ),
      gap: scaled(CATEGORY_GRID_GAP, scale),
      featuredLabelSize: scaled(
        CATEGORY_GRID_FEATURED_LABEL_SIZE,
        scale,
      ),
      standardLabelSize: scaled(
        CATEGORY_GRID_STANDARD_LABEL_SIZE,
        scale,
      ),
      labelInset: scaled(CATEGORY_GRID_LABEL_INSET, scale),
      borderRadius: scaled(CATEGORY_GRID_BORDER_RADIUS, scale),
    },
    rightPane: {
      nowPlayingMinHeight: scaled(230, scale),
      nowPlayingPadding: scaled(32, scale),
      nowPlayingActionInset: scaled(24, scale),
      nowPlayingTitleSize: scaled(32, scale),
      transportButtonSize: scaled(64, scale),
      transportGap: scaled(20, scale),
      transportOffset: mode === "compact" ? 0 : 24,
      playlistHeadingGap: scaled(32, scale),
      playlistCardGap: scaled(16, scale),
      rowGap: scaled(20, scale),
      rowPadding: scaled(16, scale),
    },
  };
}

export function studioPaneWidths(
  viewportHeight: number,
): StudioPaneWidths {
  const { scale } = studioHeightLayout(viewportHeight);
  const left = Math.round(COLLAPSED_WINDOW_WIDTH * scale);

  return {
    left,
    right: RIGHT_PANE_WIDTH,
    revealed: left + RIGHT_PANE_WIDTH,
    trackDetails:
      left + RIGHT_PANE_WIDTH + TRACK_DETAILS_PANE_WIDTH,
    categoryInlinePadding: scaled(24, scale),
  };
}

export function paneWidths(): {
  readonly left: number;
  readonly right: number;
} {
  return {
    left: COLLAPSED_WINDOW_WIDTH,
    right: RIGHT_PANE_WIDTH,
  };
}

function scaled(value: number, scale: number): number {
  return Math.round(value * scale * 1_000) / 1_000;
}
