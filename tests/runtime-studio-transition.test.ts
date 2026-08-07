import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { createCategoryGenerationIntentGate } from "../src/renderer/radio";
import {
  isMusicGenerationAvailable,
  musicGenerationWaitingState,
  musicGenerationWaitingTitle,
  scheduleApplicationRevealAfterPaint,
  shouldMountStudio,
  type MusicEngineState,
} from "../src/renderer/runtime-setup-presentation";
import { locomoMusicStationCardArtwork } from "../src/renderer/station-card-artwork";
import type { RuntimeSetupStatus } from "../src/shared/app-contract";

const downloading: RuntimeSetupStatus = {
  phase: "downloading-models",
  ready: false,
  running: true,
  message: "Downloading model 4 of 4",
  completedSteps: 1,
  totalSteps: 3,
};

const checking: RuntimeSetupStatus = {
  ...downloading,
  phase: "checking",
  message: "Checking the music runtime…",
};

const ready: RuntimeSetupStatus = {
  ...downloading,
  phase: "ready",
  ready: true,
  running: false,
  message: "Ready.",
  completedSteps: 3,
};

describe("runtime readiness studio continuity", () => {
  it("reveals the playable library while the engine is still starting", () => {
    expect(shouldMountStudio("ready")).toBe(true);
    expect(isMusicGenerationAvailable(ready, "loading")).toBe(false);
    expect(isMusicGenerationAvailable(ready, "ready")).toBe(true);
  });

  it("labels setup and engine loading as distinct generation waits", () => {
    expect(musicGenerationWaitingState(downloading, "checking")).toBe(
      "setup",
    );
    expect(musicGenerationWaitingState(ready, "loading")).toBe(
      "engine-loading",
    );
    expect(musicGenerationWaitingState(ready, "checking")).toBe(
      "engine-loading",
    );
    expect(musicGenerationWaitingState(ready, "ready")).toBeUndefined();
    expect(musicGenerationWaitingState(ready, "error")).toBeUndefined();
    expect(musicGenerationWaitingTitle("setup")).toBe(
      "Song generation will begin after setup.",
    );
    expect(musicGenerationWaitingTitle("engine-loading")).toBe(
      "Starting music engine…",
    );
    expect(musicGenerationWaitingTitle(undefined)).toBeUndefined();
  });

  it("does not flash setup copy while installed runtime status is unresolved", () => {
    const installedColdStart: readonly [
      RuntimeSetupStatus | undefined,
      MusicEngineState,
    ][] = [
      [undefined, "checking"],
      [checking, "checking"],
      [ready, "checking"],
      [ready, "loading"],
    ];

    for (const [status, engine] of installedColdStart) {
      const waiting = musicGenerationWaitingState(status, engine);
      expect(waiting).toBe("engine-loading");
      expect(musicGenerationWaitingTitle(waiting)).toBe(
        "Starting music engine…",
      );
      expect(musicGenerationWaitingTitle(waiting)).not.toBe(
        "Song generation will begin after setup.",
      );
    }
  });

  it("keeps the application unmounted until the library bootstrap completes", () => {
    expect(shouldMountStudio("loading")).toBe(false);
    expect(shouldMountStudio("error")).toBe(false);
    expect(shouldMountStudio("ready")).toBe(true);
  });

  it("reveals only after the mounted application crosses a paint boundary", () => {
    const frames: FrameRequestCallback[] = [];
    const cancelled: number[] = [];
    const reveal = vi.fn();
    const cancel = scheduleApplicationRevealAfterPaint({
      cancelFrame: (handle) => cancelled.push(handle),
      requestFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      reveal,
    });

    expect(frames).toHaveLength(1);
    expect(reveal).not.toHaveBeenCalled();
    frames[0]?.(0);
    expect(frames).toHaveLength(2);
    expect(reveal).not.toHaveBeenCalled();
    frames[1]?.(16);
    expect(reveal).toHaveBeenCalledTimes(1);

    cancel();
    expect(cancelled).toEqual([1, 2]);
  });

  it("uses only the inert category-grid ghost before the coherent application paint", async () => {
    const [renderer, index, styles] = await Promise.all([
      readFile(
        new URL("../src/renderer/renderer.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/renderer/index.html", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/renderer/styles.css", import.meta.url),
        "utf8",
      ),
    ]);
    const ghostMarkupStart = index.indexOf(
      '<div id="locomo-startup-ghost"',
    );
    const ghostMarkupEnd = index.indexOf(
      '<div id="root" inert>',
      ghostMarkupStart,
    );
    const ghostMarkup = index.slice(ghostMarkupStart, ghostMarkupEnd);
    const ghostStylesStart = index.indexOf(
      '<style id="locomo-startup-ghost-styles">',
    );
    const ghostStylesContentStart = index.indexOf(">", ghostStylesStart) + 1;
    const ghostStylesEnd = index.indexOf(
      "</style>",
      ghostStylesContentStart,
    );
    const ghostStyles = index.slice(
      ghostStylesContentStart,
      ghostStylesEnd,
    );
    const approvedArtwork = Object.values(
      locomoMusicStationCardArtwork,
    ).filter((artwork): artwork is string => artwork !== undefined);
    const approvedSvgSources = await Promise.all(
      approvedArtwork.map((artwork) =>
        readFile(
          new URL(
            `../src/renderer/public/${artwork.slice(2)}`,
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
    const inlinePathGeometry = Array.from(
      ghostMarkup.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*\/>/gu),
      (match) => match[1],
    );
    const approvedPathGeometry = approvedSvgSources.flatMap((source) =>
      Array.from(
        source.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*\/>/gu),
        (match) => match[1],
      ),
    );
    const symbolIDs = Array.from(
      ghostMarkup.matchAll(/<symbol\b[^>]*\bid="([^"]+)"/gu),
      (match) => match[1],
    );
    const useIDs = Array.from(
      ghostMarkup.matchAll(/<use href="#([^"]+)"><\/use>/gu),
      (match) => match[1],
    );
    const inlineViewBoxes = Array.from(
      ghostMarkup.matchAll(/<symbol\b[^>]*\bviewBox="([^"]+)"/gu),
      (match) => match[1],
    );
    const approvedViewBoxes = approvedSvgSources.map(
      (source) => source.match(/<svg\b[^>]*\bviewBox="([^"]+)"/u)?.[1],
    );

    expect(ghostMarkupStart).toBeGreaterThanOrEqual(0);
    expect(ghostMarkupEnd).toBeGreaterThan(ghostMarkupStart);
    expect(ghostStylesStart).toBeGreaterThanOrEqual(0);
    expect(ghostStylesEnd).toBeGreaterThan(ghostStylesContentStart);
    expect(index).toContain(
      'id="locomo-startup-ghost" aria-hidden="true" inert',
    );
    expect(index).toContain('<div id="root" inert>');
    expect(index).not.toContain("<canvas");
    expect(index).not.toContain("locomo-character.png");
    expect(ghostMarkup.replace(/<[^>]+>/gu, "").trim()).toBe("");
    expect(ghostMarkup).not.toContain("<img");
    expect(ghostMarkup).not.toContain("<image");
    expect(ghostMarkup).not.toMatch(/\b(?:src|xlink:href)=/u);
    expect(ghostMarkup.match(/<use href="#/gu)).toHaveLength(19);
    expect(new Set(useIDs)).toEqual(new Set(symbolIDs));
    expect(symbolIDs).toHaveLength(19);
    expect(inlinePathGeometry).toHaveLength(19);
    expect(new Set(inlinePathGeometry)).toEqual(
      new Set(approvedPathGeometry),
    );
    expect(inlineViewBoxes).toEqual(approvedViewBoxes);
    expect(ghostMarkup).not.toMatch(
      /<(?:a|button|input|select|textarea)\b/u,
    );
    expect(ghostMarkup).not.toMatch(
      /class="[^"]*(?:spinner|loading)[^"]*"/iu,
    );
    expect(ghostMarkup).not.toContain("<progress");
    expect(
      ghostMarkup.match(/data-startup-card="featured"/gu),
    ).toHaveLength(4);
    expect(
      ghostMarkup.match(/data-startup-card="standard"/gu),
    ).toHaveLength(15);
    expect(ghostMarkup.match(/class="startup-ghost__label"/gu)).toHaveLength(
      19,
    );
    expect(ghostMarkup.match(/class="startup-ghost__badge"/gu)).toHaveLength(
      3,
    );
    expect(ghostStyles).toContain("background: #cde50b;");
    expect(ghostStyles).toContain("color: #191919;");
    expect(ghostStyles).toContain("pointer-events: none;");
    expect(ghostStyles).toContain(
      "grid-template-columns: repeat(20, minmax(0, 1fr));",
    );
    expect(ghostStyles).toContain("grid-column: span 10;");
    expect(ghostStyles).toContain("grid-column: span 4;");
    expect(ghostStyles).toContain("opacity: 0.11;");
    expect(ghostStyles).not.toContain("url(");
    expect(ghostStyles).not.toContain("animation");
    expect(ghostStyles).not.toContain("transition");
    expect(styles).not.toContain("startup-ghost__");
    expect(styles).not.toContain("#locomo-startup-ghost");
    expect(styles).toContain(
      ':root[data-view="main"][data-application-ready="false"] #root',
    );
    expect(renderer).toContain('setLibrary("ready")');
    expect(renderer).toContain("scheduleApplicationRevealAfterPaint({");
    expect(renderer).toContain(
      'document.documentElement.dataset.applicationReady = "true"',
    );
    expect(renderer).toContain(
      'document.getElementById("root")?.removeAttribute("inert")',
    );
    expect(renderer).toContain(
      'document.getElementById("locomo-startup-ghost")?.remove()',
    );
    expect(renderer).not.toContain("locomo-startup-mark");
    expect(renderer).toContain("<Show when={studioVisible()}>");
  });

  it("keeps one mounted studio and consumes explicit intent exactly once", () => {
    const intent = createCategoryGenerationIntentGate();
    const selectedCategory = "existing/future-french-house" as const;
    const playingTrack = "seed-track";
    let generationCalls = 0;

    intent.noteSelection({
      generationAvailable: false,
      shouldGenerate: true,
    });

    const transitions: readonly [RuntimeSetupStatus, MusicEngineState][] = [
      [downloading, "checking"],
      [ready, "checking"],
      [ready, "loading"],
      [ready, "ready"],
    ];
    for (const [status, engine] of transitions) {
      expect(shouldMountStudio("ready")).toBe(true);
      const generationAvailable = isMusicGenerationAvailable(
        status,
        engine,
      );
      if (
        intent.admitOnReadiness({
          categoryKey: selectedCategory,
          generationAvailable,
        })
      ) {
        generationCalls += 1;
      }
      expect(selectedCategory).toBe("existing/future-french-house");
      expect(playingTrack).toBe("seed-track");
    }

    expect(generationCalls).toBe(1);
  });

  it("wires mounting to library readiness, not an engine transition", async () => {
    const source = await readFile(
      new URL("../src/renderer/renderer.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("window.locomoMusic.list().then(");
    expect(source).toContain('setLibrary("ready")');
    expect(source).toContain("shouldMountStudio(library())");
    expect(source).not.toContain("shouldMountStudio(runtime())");
    expect(source).not.toContain(
      "status &&\n        (!status.ready ||",
    );
  });

  it("keeps the library mounted with inline retry after engine failure", async () => {
    expect(shouldMountStudio("ready")).toBe(true);
    expect(isMusicGenerationAvailable(ready, "error")).toBe(false);

    const source = await readFile(
      new URL("../src/renderer/renderer.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("data-engine-failure-surface");
    expect(source).toContain("data-engine-retry");
    expect(source).toContain("Your saved songs remain available to play.");
    expect(source).toContain("onRetry={prepareMusic}");
    expect(source).not.toContain(
      'class="fixed inset-0 z-[2147483100]',
    );
  });

  it("preserves direct post-ready click playback and generation", async () => {
    const source = await readFile(
      new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
      "utf8",
    );
    const start = source.indexOf("const selectStation =");
    const end = source.indexOf("const selectCategoryCard", start);
    const selection = source.slice(start, end);

    expect(selection).toContain(
      "if (seed.startingTrack) void play(seed.startingTrack)",
    );
    expect(selection).toContain("generationAvailable: props.generationAvailable");
    expect(selection).toContain("if (generateImmediately)");
    expect(selection).toContain("generate()");
    expect(
      selection.indexOf(
        "if (seed.startingTrack) void play(seed.startingTrack)",
      ),
    ).toBeLessThan(
      selection.indexOf("categoryGenerationIntent.noteSelection"),
    );
  });
});
