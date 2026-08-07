import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  canonicalAudioBadge,
  createTrackAudioBlob,
  runDownloadSongAction,
  trackDownloadFileName,
} from "../src/renderer/track-audio";

describe("canonical track audio presentation", () => {
  it("shows the understated AAC badge only for canonical AAC", () => {
    expect(canonicalAudioBadge("aac")).toBe("AAC");
    expect(canonicalAudioBadge("wav")).toBeUndefined();
  });

  it("uses each canonical extension in downloads", () => {
    expect(
      trackDownloadFileName({
        prompt: "House. Warm rolling bass.",
        fileExtension: ".m4a",
      }),
    ).toBe("House-Warm-rolling-bass-.m4a");
    expect(
      trackDownloadFileName({
        prompt: "Legacy WAV",
        fileExtension: ".wav",
      }),
    ).toBe("Legacy-WAV.wav");
  });

  it("creates playback blobs with the canonical IPC MIME type", () => {
    const aac = createTrackAudioBlob({
      bytes: new Uint8Array([1, 2, 3]).buffer,
      mimeType: "audio/mp4",
    });
    const wav = createTrackAudioBlob({
      bytes: new Uint8Array([4, 5]).buffer,
      mimeType: "audio/wav",
    });

    expect({ size: aac.size, type: aac.type }).toEqual({
      size: 3,
      type: "audio/mp4",
    });
    expect({ size: wav.size, type: wav.type }).toEqual({
      size: 2,
      type: "audio/wav",
    });
  });

  it("isolates Download from the song row play action", () => {
    const download = vi.fn();
    const play = vi.fn();
    let clickPropagatesToRow = true;

    runDownloadSongAction(
      {
        stopPropagation() {
          clickPropagatesToRow = false;
        },
      },
      download,
    );
    if (clickPropagatesToRow) play();

    expect(download).toHaveBeenCalledOnce();
    expect(play).not.toHaveBeenCalled();
  });

  it("uses explicit Download song UI semantics without restoring AAC badges", async () => {
    const source = await readFile(
      new URL(
        "../src/renderer/LocomoMusicStudio.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).toContain("aria-label=\"Download song\"");
    expect(source).toContain("title=\"Download song\"");
    expect(source).toContain("<Download size={16} />");
    expect(source).toContain('"Could not download this song"');
    expect(source).not.toContain("aria-label=\"Save track\"");
    expect(source).not.toContain("canonicalAudioBadge");
    expect(source).not.toContain("data-audio-format");
  });
});
