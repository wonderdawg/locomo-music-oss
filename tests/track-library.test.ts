import { describe, expect, it, vi } from "vitest";

import {
  createLatestRequestGate,
  createLazyTrackLibraryClient,
  markTrackPlayed,
  upsertCompletedTrack,
} from "../src/renderer/track-library";
import type {
  MusicTrack,
  MusicTrackAudio,
} from "../src/shared/app-contract";

describe("metadata-first renderer library", () => {
  it("lists a large library without reading or transferring audio", async () => {
    const tracks = Array.from({ length: 642 }, (_, index) =>
      track(`track-${index}`, 642 - index),
    );
    const list = vi.fn(async () => tracks);
    const read = vi.fn(async () => audio());
    const library = createLazyTrackLibraryClient({ list, read });

    const metadata = await library.listMetadata();

    expect(metadata).toHaveLength(642);
    expect(metadata[0]?.id).toBe("track-0");
    expect(metadata.at(-1)?.id).toBe("track-641");
    expect(list).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
  });

  it("reads only explicitly requested audio and coalesces concurrent reads", async () => {
    const read = vi.fn(async (id: string) =>
      audio(id === "selected" ? 7 : 99),
    );
    const library = createLazyTrackLibraryClient({
      list: async () => [track("unselected", 2), track("selected", 1)],
      read,
    });

    await library.listMetadata();
    const [first, second] = await Promise.all([
      library.readAudio("selected"),
      library.readAudio("selected"),
    ]);

    expect(new Uint8Array(first.bytes)).toEqual(new Uint8Array([7]));
    expect(second).toBe(first);
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith("selected");
  });

  it("keeps every metadata row when one asset is broken", async () => {
    const metadata = [
      track("valid-a", 3),
      track("broken", 2),
      track("valid-b", 1),
    ];
    const read = vi.fn(async (id: string) => {
      if (id === "broken") throw new Error("asset is unreadable");
      return audio(id === "valid-a" ? 1 : 2);
    });
    const library = createLazyTrackLibraryClient({
      list: async () => metadata,
      read,
    });

    const listed = await library.listMetadata();
    await expect(library.readAudio("broken")).rejects.toThrow(
      "asset is unreadable",
    );
    await expect(library.readAudio("valid-b")).resolves.toMatchObject({
      mimeType: "audio/mp4",
    });

    expect(listed.map((item) => item.id)).toEqual([
      "valid-a",
      "broken",
      "valid-b",
    ]);
    expect(read.mock.calls.map(([id]) => id)).toEqual([
      "broken",
      "valid-b",
    ]);
  });

  it("makes a completed generation immediately visible at the front", () => {
    const existing = [track("old-a", 2), track("old-b", 1)];
    const completed = track("new", 3);

    const next = upsertCompletedTrack(existing, completed);

    expect(next.map((item) => item.id)).toEqual([
      "new",
      "old-a",
      "old-b",
    ]);
    expect(existing.map((item) => item.id)).toEqual([
      "old-a",
      "old-b",
    ]);
    expect(upsertCompletedTrack(next, completed)).toEqual(next);
  });

  it("updates only the newly played track and never reverses history", () => {
    const tracks = [track("first", 2), track("second", 1)];
    const played = markTrackPlayed(tracks, "second");

    expect(played[0]).toBe(tracks[0]);
    expect(played[1]).toEqual({ ...tracks[1], isPlayed: true });
    expect(markTrackPlayed(played, "second")).toBe(played);
    expect(markTrackPlayed(played, "missing")).toBe(played);
  });

  it("invalidates a pending playback read when another window takes playback", async () => {
    let releaseRead: ((value: MusicTrackAudio) => void) | undefined;
    const library = createLazyTrackLibraryClient({
      list: async () => [],
      read: async () =>
        new Promise<MusicTrackAudio>((resolve) => {
          releaseRead = resolve;
        }),
    });
    const playback = createLatestRequestGate();
    const request = playback.begin();
    const pending = library.readAudio("selected");
    await Promise.resolve();

    playback.cancel();
    releaseRead?.(audio());
    await pending;

    expect(playback.isCurrent(request)).toBe(false);
  });
});

function track(id: string, createdAt: number): MusicTrack {
  return {
    categoryKey: "existing/house",
    id,
    prompt: "House. Metadata-only test",
    lyrics: "",
    duration: 120,
    createdAt,
    isFavorite: false,
    isPlayed: false,
    audioFormat: "aac",
    fileExtension: ".m4a",
    mimeType: "audio/mp4",
  };
}

function audio(byte = 1): MusicTrackAudio {
  return {
    bytes: new Uint8Array([byte]).buffer,
    audioFormat: "aac",
    fileExtension: ".m4a",
    mimeType: "audio/mp4",
  };
}
