import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  formatSongRowDuration,
  isCurrentSongRow,
} from "../src/renderer/current-song-row";

describe("current song row", () => {
  it("marks only the loaded track and marks none without one", () => {
    const trackIDs = ["first", "loaded", "last"];

    expect(
      trackIDs.filter((trackID) =>
        isCurrentSongRow(trackID, "loaded"),
      ),
    ).toEqual(["loaded"]);
    expect(
      trackIDs.filter((trackID) =>
        isCurrentSongRow(trackID, undefined),
      ),
    ).toEqual([]);
  });

  it("keeps identity on the loaded track when playback pauses", () => {
    const presentation = (playingTrackID: string | undefined) => ({
      current: isCurrentSongRow("loaded", "loaded"),
      playing: playingTrackID === "loaded",
    });

    expect(presentation("loaded")).toEqual({
      current: true,
      playing: true,
    });
    expect(presentation(undefined)).toEqual({
      current: true,
      playing: false,
    });
  });

  it("formats the authoritative track duration as compact minutes and seconds", () => {
    expect(formatSongRowDuration(165)).toBe("2:45");
    expect(formatSongRowDuration(603)).toBe("10:03");
    expect(formatSongRowDuration(165.9)).toBe("2:45");
  });

  it("reveals a reserved, noninteractive duration beside every shared playlist row", async () => {
    const source = await studioSource();
    const styles = await readFile(
      new URL("../src/renderer/styles.css", import.meta.url),
      "utf8",
    );
    const rowsStart = source.indexOf("<For each={stationTracks()}>");
    const rowsEnd = source.indexOf("</For>", rowsStart);
    const rowsSource = source.slice(rowsStart, rowsEnd);
    const titleStart = rowsSource.indexOf(
      'class="song-row__title',
    );
    const durationStart = rowsSource.indexOf(
      'class="song-row__duration',
    );
    const actionsStart = rowsSource.indexOf(
      '<div class="flex items-center opacity-0',
    );
    const durationEnd = rowsSource.indexOf("</span>", durationStart);
    const durationSource = rowsSource.slice(durationStart, durationEnd);
    const labelStylesStart = styles.indexOf(".song-row__label {");
    const labelStylesEnd = styles.indexOf(
      '.song-row[aria-current="true"] {',
      labelStylesStart,
    );
    const labelStyles = styles.slice(labelStylesStart, labelStylesEnd);

    expect(rowsStart).toBeGreaterThanOrEqual(0);
    expect(rowsEnd).toBeGreaterThan(rowsStart);
    expect(titleStart).toBeGreaterThanOrEqual(0);
    expect(durationStart).toBeGreaterThan(titleStart);
    expect(actionsStart).toBeGreaterThan(durationStart);
    expect(rowsSource).toContain('<div class="song-row__label">');
    expect(durationSource).toContain(
      "{formatSongRowDuration(track.duration)}",
    );
    expect(durationSource).not.toContain("selectedMinutes()");
    expect(rowsSource).not.toContain("translate");
    expect(durationSource).toContain("shrink-0");
    expect(durationSource).toContain("opacity-0");
    expect(durationSource).toContain("group-hover:opacity-100");
    expect(durationSource).toContain("group-focus-within:opacity-100");
    expect(durationSource).not.toContain("onClick");
    expect(labelStyles).toContain("display: flex;");
    expect(labelStyles).toContain("align-items: center;");
    expect(labelStyles).toContain(
      ".song-row__label .song-row__title,",
    );
    expect(labelStyles).toContain(
      ".song-row__label .song-row__duration {",
    );
    expect(labelStyles).toContain("line-height: 1;");
    expect(labelStyles).toContain("margin-block: -2px;");
    expect(labelStyles).toContain("padding-block: 2px;");
    expect(labelStyles).toContain("position: relative;");
    expect(labelStyles).toContain("inset-block-start: 1px;");
    expect(labelStyles).not.toContain("transform:");
  });

  it("uses the inverse theme tokens for the current row and its controls", async () => {
    const source = await studioSource();
    const styles = await readFile(
      new URL("../src/renderer/styles.css", import.meta.url),
      "utf8",
    );
    const rowsStart = source.indexOf("<For each={stationTracks()}>");
    const rowsEnd = source.indexOf("</For>", rowsStart);
    const rowsSource = source.slice(rowsStart, rowsEnd);
    const currentStylesStart = styles.indexOf(
      '.song-row[aria-current="true"] {',
    );
    const currentStylesEnd = styles.indexOf(
      ".song-length-dial {",
      currentStylesStart,
    );
    const currentStyles = styles.slice(
      currentStylesStart,
      currentStylesEnd,
    );

    expect(rowsSource).toContain(
      "isCurrentSongRow(track.id, selected())",
    );
    expect(rowsSource).toContain(
      'aria-current={\n                        isCurrentSongRow',
    );
    expect(rowsSource).not.toContain("featured()?.id === track.id");
    expect(currentStyles).toContain(
      "background: var(--locomo-foreground);",
    );
    expect(currentStyles).toContain("color: var(--locomo-surface);");
    expect(currentStyles).toContain(
      '.song-row[aria-current="true"] button:hover',
    );
    expect(currentStyles).toContain(
      '.song-row[aria-current="true"] .song-row__duration',
    );
    expect(currentStyles).toContain("var(--locomo-surface) 55%");
    expect(currentStyles).toContain(
      "outline-color: var(--locomo-surface);",
    );
    expect(styles).toContain("--locomo-surface: var(--locomo-yellow);");
    expect(styles).toContain("--locomo-foreground: var(--locomo-ink);");
    expect(styles).toContain("--locomo-surface: var(--locomo-ink);");
    expect(styles).toContain("--locomo-foreground: var(--locomo-yellow);");
  });

  it("preserves event isolation for every row control", async () => {
    const source = await studioSource();
    const rowsStart = source.indexOf("<For each={stationTracks()}>");
    const rowsEnd = source.indexOf("</For>", rowsStart);
    const rowsSource = source.slice(rowsStart, rowsEnd);
    const playStart = rowsSource.indexOf('aria-label={\n');
    const downloadStart = rowsSource.indexOf(
      'aria-label="Download song"',
    );
    const favoriteStart = rowsSource.indexOf(
      "aria-label={favoriteActionLabel(",
    );
    const deleteStart = rowsSource.indexOf('aria-label="Delete track"');

    expect(rowsSource.slice(playStart, downloadStart)).toContain(
      "event.stopPropagation()",
    );
    expect(rowsSource.slice(downloadStart, favoriteStart)).toContain(
      "runDownloadSongAction(event",
    );
    expect(rowsSource.slice(favoriteStart, deleteStart)).toContain(
      "runFavoriteToggleAction(event",
    );
    expect(rowsSource.slice(deleteStart)).toContain(
      "event.stopPropagation()",
    );
  });
});

function studioSource(): Promise<string> {
  return readFile(
    new URL(
      "../src/renderer/LocomoMusicStudio.tsx",
      import.meta.url,
    ),
    "utf8",
  );
}
