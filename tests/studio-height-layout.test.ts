import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  CATEGORY_GRID_DESIGN_HEIGHT,
  CATEGORY_GRID_DESIGN_WIDTH,
  CATEGORY_GRID_FEATURED_TRACK_HEIGHT,
  CATEGORY_GRID_GAP,
  CATEGORY_GRID_STANDARD_TRACK_HEIGHT,
  COLLAPSED_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  STUDIO_CHROME_HEIGHT,
  studioHeightLayout,
  studioPaneWidths,
  type StudioHeightLayout,
} from "../src/shared/window-layout";

function categoryCardDimensions(layout: StudioHeightLayout) {
  const columnWidth =
    (layout.categoryGrid.width - layout.categoryGrid.gap * 19) / 20;

  return {
    featuredWidth: columnWidth * 10 + layout.categoryGrid.gap * 9,
    standardWidth: columnWidth * 4 + layout.categoryGrid.gap * 3,
  };
}

function expectSharedVerticalBudget(layout: StudioHeightLayout) {
  const contentTop = STUDIO_CHROME_HEIGHT + layout.pane.topRail;
  const gridBottom =
    contentTop +
    layout.pane.headingLineHeight +
    layout.pane.headingGap +
    layout.categoryGrid.height;
  const sharedPaneBottom =
    layout.viewportHeight - layout.pane.bottomRail;

  expect(gridBottom).toBeCloseTo(sharedPaneBottom, 2);
  expect(contentTop).toBeLessThan(sharedPaneBottom);
}

describe("studio height layout", () => {
  it("preserves the approved 972px geometry exactly", () => {
    const layout = studioHeightLayout(DEFAULT_WINDOW_HEIGHT);

    expect(layout.mode).toBe("design");
    expect(layout.scale).toBe(1);
    expect(layout.categoryGrid).toMatchObject({
      width: CATEGORY_GRID_DESIGN_WIDTH,
      height: CATEGORY_GRID_DESIGN_HEIGHT,
      featuredTrackHeight: CATEGORY_GRID_FEATURED_TRACK_HEIGHT,
      standardTrackHeight: CATEGORY_GRID_STANDARD_TRACK_HEIGHT,
      gap: CATEGORY_GRID_GAP,
      featuredLabelSize: 31.2,
      standardLabelSize: 12.1,
    });
    expect(layout.pane).toEqual({
      topRail: 32,
      bottomRail: 24,
      headingFontSize: 28.8,
      headingLineHeight: 38.4,
      headingGap: 24,
    });
    expectSharedVerticalBudget(layout);
  });

  it.each([832, 796])(
    "proportionally fits the complete grid at a %ipx laptop height",
    (viewportHeight) => {
      const design = studioHeightLayout(DEFAULT_WINDOW_HEIGHT);
      const compact = studioHeightLayout(viewportHeight);
      const paneWidths = studioPaneWidths(viewportHeight);
      const designCards = categoryCardDimensions(design);
      const compactCards = categoryCardDimensions(compact);
      const expectedScale =
        (viewportHeight - STUDIO_CHROME_HEIGHT) /
        (DEFAULT_WINDOW_HEIGHT - STUDIO_CHROME_HEIGHT);

      expect(compact.mode).toBe("compact");
      expect(compact.scale).toBeCloseTo(expectedScale, 8);
      expect(compact.rightPane.transportOffset).toBe(0);
      expect(compact.categoryGrid.width).toBeCloseTo(
        CATEGORY_GRID_DESIGN_WIDTH * expectedScale,
        2,
      );
      expect(compact.categoryGrid.featuredTrackHeight).toBeCloseTo(
        CATEGORY_GRID_FEATURED_TRACK_HEIGHT * expectedScale,
        2,
      );
      expect(compact.categoryGrid.standardTrackHeight).toBeCloseTo(
        CATEGORY_GRID_STANDARD_TRACK_HEIGHT * expectedScale,
        2,
      );
      expect(
        compactCards.featuredWidth /
          compact.categoryGrid.featuredTrackHeight,
      ).toBeCloseTo(
        designCards.featuredWidth /
          design.categoryGrid.featuredTrackHeight,
        3,
      );
      expect(
        compactCards.standardWidth /
          compact.categoryGrid.standardTrackHeight,
      ).toBeCloseTo(
        designCards.standardWidth /
          design.categoryGrid.standardTrackHeight,
        3,
      );
      expectSharedVerticalBudget(compact);
      expect(paneWidths.left).toBeLessThan(COLLAPSED_WINDOW_WIDTH);
      expect(
        compact.categoryGrid.width +
          paneWidths.categoryInlinePadding * 2,
      ).toBeCloseTo(paneWidths.left, 0);
    },
  );

  it("uses crisp computed geometry with shared rails and no page or left-pane scroll", async () => {
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
    const compactGridStart = styles.indexOf(
      '.locomo-studio[data-height-layout="compact"]\n  .category-grid--existing',
    );
    const compactGridEnd = styles.indexOf(
      '.locomo-studio[data-height-layout="compact"] .category-card',
      compactGridStart,
    );
    const compactGridStyles = styles.slice(
      compactGridStart,
      compactGridEnd,
    );

    expect(source).toContain("data-height-layout={heightLayout().mode}");
    expect(source).toContain("data-height-scale={heightLayout().scale}");
    expect(
      source.match(/studio-pane-vertical-rails flex/gu),
    ).toHaveLength(2);
    expect(
      source.match(/studio-pane-heading mb-6 shrink-0/gu),
    ).toHaveLength(2);
    expect(source).toContain(
      '"category-grid--existing": categorySet() === "existing"',
    );
    expect(source).toContain("width: `${paneLayout().left}px`,");
    expect(source).toContain(
      '"--category-pane-inline-padding": `${paneLayout().categoryInlinePadding}px`',
    );
    expect(source).toContain(
      '"grid-cols-[repeat(20,minmax(0,1fr))] grid-rows-[repeat(2,196px)_repeat(3,130.5px)] content-start overflow-hidden"',
    );
    expect(source).toMatch(
      /class="locomo-studio[^\"]*overflow-hidden/,
    );
    expect(styles).toMatch(
      /html,\nbody,\n#root \{[\s\S]*?overflow: hidden;/,
    );
    expect(compactGridStart).toBeGreaterThan(-1);
    expect(compactGridEnd).toBeGreaterThan(compactGridStart);
    expect(compactGridStyles).toContain(
      "flex: 0 0 var(--category-grid-height);",
    );
    expect(compactGridStyles).toContain(
      "grid-template-rows:",
    );
    expect(compactGridStyles).not.toContain("overflow-y");
    expect(compactGridStyles).not.toContain("transform");
    expect(styles).toContain(
      "padding-inline: var(--category-pane-inline-padding);",
    );
  });
});
