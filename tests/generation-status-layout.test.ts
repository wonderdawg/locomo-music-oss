import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { RIGHT_PANE_WIDTH } from "../src/shared/window-layout";

describe("generation status row layout", () => {
  it("reserves action space and wraps both long status headings", async () => {
    const source = await readFile(
      new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
      "utf8",
    );
    const rowStart = source.indexOf("data-generation-row");
    const rowEnd = source.indexOf(
      '<div class="min-h-0 flex-1 overflow-y-auto">',
      rowStart,
    );
    const row = source.slice(rowStart, rowEnd);

    expect(row).toContain(
      "grid-cols-[44px_minmax(0,1fr)_60px] items-center gap-5",
    );
    expect(row).toContain(
      '"whitespace-normal text-pretty text-[14px] leading-4"',
    );
    expect(row).toContain("generationWaitingTitle()");
    expect(row).toContain("Automatic song limit reached");
    expect(row).toContain(
      "props.generationAvailable ||\n                        !categoryGenerationPending()",
    );
    expect(row).toContain('class="w-full rounded-full border');
    expect(row).not.toContain("whitespace-nowrap");
    expect(row).not.toContain("overflow-visible");

    const paneInlinePadding = 64;
    const playlistBorders = 2;
    const rowInlinePadding = 32;
    const iconColumn = 44;
    const actionColumn = 60;
    const columnGaps = 40;
    const statusTextWidth =
      RIGHT_PANE_WIDTH -
      paneInlinePadding -
      playlistBorders -
      rowInlinePadding -
      iconColumn -
      actionColumn -
      columnGaps;
    expect(statusTextWidth).toBe(290);
  });
});
