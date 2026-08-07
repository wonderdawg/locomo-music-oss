import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("playlist play history presentation", () => {
  it("reserves one narrow theme-aware dot slot without changing title typography", async () => {
    const source = await readFile(
      new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
      "utf8",
    );
    const rowsStart = source.indexOf("<For each={stationTracks()}>");
    const rowsEnd = source.indexOf("</For>", rowsStart);
    const rows = source.slice(rowsStart, rowsEnd);
    const slotStart = rows.indexOf("data-unplayed-indicator-slot");
    const titleStart = rows.indexOf('class="song-row__title');
    const slot = rows.slice(slotStart, titleStart);

    expect(slotStart).toBeGreaterThanOrEqual(0);
    expect(titleStart).toBeGreaterThan(slotStart);
    expect(slot).toContain('aria-hidden="true"');
    expect(slot).toContain("w-1.5 shrink-0");
    expect(slot).toContain("<Show when={!track.isPlayed}>");
    expect(slot).toContain("data-unplayed-indicator");
    expect(slot).toContain(
      'class="size-1.5 rounded-full bg-current opacity-60"',
    );
    expect(slot).not.toContain("transition");
    expect(rows).toContain(
      'class="song-row__title min-w-0 truncate text-[18px] font-semibold text-locomo-foreground"',
    );
  });

  it("clears the dot only from the authoritative audio start event", async () => {
    const source = await readFile(
      new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
      "utf8",
    );
    const audioStart = source.indexOf("<audio");
    const audioEnd = source.indexOf("</audio>", audioStart);
    const audio = source.slice(audioStart, audioEnd);

    expect(audio).toContain("onPlay={() => {");
    expect(audio).toContain(
      "setTracks((current) => markTrackPlayed(current, trackID))",
    );
    expect(audio).not.toContain("isPlayed: false");
    expect(source).not.toContain("setTracks((current) => markTrackUnplayed");
  });
});
