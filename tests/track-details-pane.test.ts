import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  setTrackDetailsPaneOpen,
  trackDetailsWindowBounds,
  type WindowBounds,
} from "../src/main/window-reveal";
import {
  REVEALED_WINDOW_WIDTH,
  studioPaneWidths,
  TRACK_DETAILS_PANE_WIDTH,
  TRACK_DETAILS_WINDOW_WIDTH,
} from "../src/shared/window-layout";

describe("track details pane", () => {
  it("adds a dedicated fixed-width pane to the right of the preserved layout", () => {
    const compactWidths = studioPaneWidths(900);
    expect(TRACK_DETAILS_PANE_WIDTH).toBe(420);
    expect(TRACK_DETAILS_WINDOW_WIDTH).toBe(1_776);
    expect(TRACK_DETAILS_WINDOW_WIDTH).toBe(
      REVEALED_WINDOW_WIDTH + TRACK_DETAILS_PANE_WIDTH,
    );
    expect(
      trackDetailsWindowBounds(
        {
          x: 201,
          y: 121,
          width: compactWidths.revealed,
          height: 900,
        },
        { x: 0, y: 25, width: 1_920, height: 1_092 },
      ),
    ).toEqual({
      x: 201,
      y: 121,
      width: compactWidths.trackDetails,
      height: 900,
    });
  });

  it("opens once and restores the exact prior two-pane native bounds", () => {
    const compactWidths = studioPaneWidths(900);
    let bounds: WindowBounds = {
      x: 201,
      y: 121,
      width: compactWidths.revealed,
      height: 900,
    };
    let maximumSize = [1_728, 1_092];
    const setBounds = vi.fn((next: WindowBounds) => {
      bounds = next;
    });
    const setMaximumSize = vi.fn((width: number, height: number) => {
      maximumSize = [width, height];
    });
    const window = {
      getBounds: () => bounds,
      getMaximumSize: () => maximumSize,
      setBounds,
      setMaximumSize,
    };
    const workArea = { x: 0, y: 25, width: 1_728, height: 1_092 };

    expect(setTrackDetailsPaneOpen(window, workArea, true)).toBe(true);
    expect(setTrackDetailsPaneOpen(window, workArea, true)).toBe(false);
    expect(setBounds).toHaveBeenLastCalledWith(
      {
        x: 16,
        y: 121,
        width: compactWidths.trackDetails,
        height: 900,
      },
      true,
    );
    expect(setMaximumSize).toHaveBeenLastCalledWith(
      workArea.width,
      1_092,
    );

    expect(setTrackDetailsPaneOpen(window, workArea, false)).toBe(true);
    expect(setTrackDetailsPaneOpen(window, workArea, false)).toBe(false);
    expect(setBounds).toHaveBeenLastCalledWith(
      {
        x: 201,
        y: 121,
        width: compactWidths.revealed,
        height: 900,
      },
      true,
    );
    expect(setMaximumSize).toHaveBeenLastCalledWith(
      workArea.width,
      1_092,
    );
  });

  it("keeps the details implementation dormant behind a reversible UI gate", async () => {
    const source = await readFile(
      new URL(
        "../src/renderer/LocomoMusicStudio.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const nowPlayingStart = source.indexOf(
      "data-now-playing-secondary-actions",
    );
    const nowPlayingEnd = source.indexOf("</div>", nowPlayingStart);
    const nowPlaying = source.slice(nowPlayingStart, nowPlayingEnd);
    const rowsStart = source.indexOf("<For each={stationTracks()}>");
    const rowsEnd = source.indexOf("</For>", rowsStart);
    const rows = source.slice(rowsStart, rowsEnd);
    const nowPlayingDownload = nowPlaying.indexOf(
      "data-now-playing-download",
    );
    const nowPlayingDetails = nowPlaying.indexOf(
      "data-now-playing-details",
    );
    const rowDownload = rows.indexOf('aria-label="Download song"');
    const rowDetails = rows.indexOf("data-song-row-details");

    expect(nowPlayingDownload).toBeGreaterThanOrEqual(0);
    expect(nowPlayingDetails).toBe(-1);
    expect(rowDownload).toBeGreaterThanOrEqual(0);
    expect(rowDetails).toBe(-1);
    expect(source).toContain(
      "const TRACK_DETAILS_UI_ENABLED: boolean = false;",
    );
    expect(source).toContain("const visibleTrackDetailsSelection = () =>");
    expect(source).toContain(
      "<Show when={visibleTrackDetailsSelection()}>",
    );
    const showDetailsStart = source.indexOf(
      "function showTrackDetails(track: MusicTrack)",
    );
    const showDetailsEnd = source.indexOf(
      "createEffect(() => {",
      showDetailsStart,
    );
    const showDetails = source.slice(showDetailsStart, showDetailsEnd);
    expect(showDetails).toContain("if (!TRACK_DETAILS_UI_ENABLED)");
    expect(showDetails.indexOf("if (!TRACK_DETAILS_UI_ENABLED)")).toBeLessThan(
      showDetails.indexOf("setTrackDetailsSelection"),
    );
    expect(source.indexOf("data-track-details-pane")).toBeGreaterThan(
      source.indexOf("data-right-pane"),
    );
    expect(source).not.toContain("<Info");
    expect(source).toContain("data-track-details-pane");
    expect(source).not.toContain("data-close-track-details");
    expect(source).toContain("const track = featured();");
    expect(source).toContain("showTrackDetails(track);");
    expect(source).toContain("closeTrackDetailsPane();");
    expect(source).toContain("Prompt");
    expect(source).toContain("Planner Caption");
    expect(source).toContain('return "V1"');
    expect(source).toContain('return "V2.3"');
    expect(source).toContain('return "Custom"');
    expect(source).toContain('return "Unknown"');
    expect(source).toContain('return "ACE-Step 4B Q8"');
    expect(source).toContain("Unavailable for this track");
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("whitespace-pre-wrap break-words");
    expect(source).toContain("getTrackGenerationDetails(track.id)");
    expect(source.match(/getTrackGenerationDetails\(/gu)).toHaveLength(1);
    expect(source).not.toContain("TrackGenerationTitle");
    expect(source).not.toContain("onPointerEnter");
  });

  it("offers one guarded dev-only another-take admission beside the planner caption", async () => {
    const source = await readFile(
      new URL(
        "../src/renderer/LocomoMusicStudio.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const actionStart = source.indexOf("const generateAnotherTake =");
    const actionEnd = source.indexOf("const generate =", actionStart);
    const action = source.slice(actionStart, actionEnd);

    expect(source).toContain("data-generate-another-take");
    expect(source).toContain('aria-label="Generate another take"');
    expect(source).toContain('title="Generate another take"');
    expect(source).toContain("<Recycle size={15} />");
    expect(source).toContain("<Show when={import.meta.env.DEV}>");
    expect(action).toContain("anotherTakeRequest");
    expect(action).toContain("!details?.anotherTake");
    expect(action).toContain(
      "reusePlannerCaptionFromTrackID: track.id",
    );
    expect(action).toContain(
      'lyrics: details.anotherTake.instrumental ? "" : "__AUTO__"',
    );
    expect(action).toContain("duration: details.anotherTake.duration");
    expect(action).not.toContain("instrumental()");
    expect(action).not.toContain("selectedMinutes");
    expect(action).toContain("const playOnComplete = favoritesSelected()");
    expect(action).toContain("selectStation(track.categoryKey)");
    expect(action.match(/generationQueue\.push/gu)).toHaveLength(1);
    expect(action).toContain("void processQueue()");
    expect(action).not.toContain("setAutoCreate");
    expect(source).toContain("playAnotherTakeOnComplete");
    expect(source).toContain("data-remake-tag");
    expect(source).toContain("remakeSourceTrackID");
  });
});
