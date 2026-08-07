import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Now Playing layout", () => {
  it("reduces the transport offset with the compact card padding", async () => {
    const source = await readFile(
      new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
      "utf8",
    );
    const titleStart = source.indexOf(
      '<div class="now-playing-card__title-wrap mt-2 min-w-0 pr-10">',
    );
    const transportStart = source.indexOf(
      '<div class="now-playing-card__transport mt-auto flex translate-y-6 items-center gap-5 pb-3 max-[1166px]:translate-y-1">',
      titleStart,
    );
    const cardEnd = source.indexOf(
      '<div class="studio-playlist-heading mt-8 flex shrink-0 items-baseline',
      transportStart,
    );
    const transport = source.slice(transportStart, cardEnd);

    expect(titleStart).toBeGreaterThan(-1);
    expect(transportStart).toBeGreaterThan(titleStart);
    expect(cardEnd).toBeGreaterThan(transportStart);
    expect(source).toContain('p-8 max-[1166px]:p-5');
    expect(transport).toContain('aria-label="Playback position"');
    expect(transport).toContain("<Pause size={25} />");
    expect(transport).toContain("<Play size={25} />");
  });
});
