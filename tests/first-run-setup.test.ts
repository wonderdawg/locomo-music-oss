import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";

let renderer = "";
let setupController = "";
let settings = "";
let studio = "";

beforeAll(async () => {
  [renderer, setupController, settings, studio] = await Promise.all([
    readFile(
      new URL("../src/renderer/renderer.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/renderer/runtime-setup-controller.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/renderer/SettingsWindow.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
      "utf8",
    ),
  ]);
});

describe("non-blocking first-run setup", () => {
  it("renders the studio without inventing a category selection", () => {
    expect(renderer).toContain("shouldMountStudio(library())");
    expect(renderer).toContain(
      "generationAvailable={generationAvailable()}",
    );
    expect(renderer).toContain(
      "generationWaitingState={musicGenerationWaitingState(",
    );
    expect(studio).not.toContain(
      "if (!selectionKey() && !props.generationAvailable)",
    );
    expect(studio).not.toContain("setSelectionKey(firstTrack.categoryKey)");
    expect(studio).toContain('createSignal<MusicSelectionKey>()');
    expect(studio).toContain('"Choose a station to begin."');
  });

  it("keeps setup compact, inline, and non-blocking", () => {
    const surfaceStart = renderer.indexOf("function RuntimeSetupSurface");
    const appStart = renderer.indexOf("function App()", surfaceStart);
    const surface = renderer.slice(surfaceStart, appStart);

    expect(surface).toContain("data-runtime-setup-surface");
    expect(surface).toContain("Browse and play now.");
    expect(surface).not.toContain("fixed inset-0");
    expect(renderer).not.toContain("data-runtime-setup-overlay");
    expect(renderer).toContain("setupSurface={");
    expect(renderer).toContain(
      'runtime()?.ready && engine() === "error" ? (',
    );
    expect(renderer).toContain(
      ") : displayedSetupStatus() ? (",
    );
    expect(renderer).not.toContain(
      "<Show when={displayedSetupStatus()}>",
    );
    expect(studio).toContain("data-studio-setup-slot");
  });

  it("keeps normal saved-audio playback independent from generation", () => {
    const playStart = studio.indexOf("const play = async");
    const deleteStart = studio.indexOf("const deleteTrack", playStart);
    const play = studio.slice(playStart, deleteStart);

    expect(playStart).toBeGreaterThanOrEqual(0);
    expect(play).toContain("trackLibrary.readAudio(track.id)");
    expect(play).toContain("await audio.play()");
    expect(play).not.toContain("generationAvailable");
  });

  it("gates continuous, remake, queue, and overnight generation", () => {
    expect(studio).toContain(
      "if (!props.generationAvailable || continuousGenerationSuppressed())",
    );
    expect(studio).toContain(
      "!props.generationAvailable ||\n      !import.meta.env.DEV",
    );
    expect(studio).toContain(
      "if (!props.generationAvailable) {\n      generationQueue.splice(0);",
    );
    expect(studio).toContain(
      "!props.generationAvailable ||\n      disposed ||\n      !initialLibraryLoaded",
    );
    expect(studio).toContain("generationToggleActive()");
    expect(settings).toContain("if (runtimeReady() !== true)");
    expect(settings).toContain(
      "runtimeReady() !== true || overnightSnapshot.length === 0",
    );
  });

  it("auto-starts only packaged setup and preserves progress and retry", () => {
    expect(renderer).toContain("setupController.initialize()");
    expect(setupController).toContain("info.isPackaged");
    expect(setupController).toContain('status.phase === "not-installed"');
    expect(setupController).toContain("startInFlight");
    expect(setupController).not.toContain("setInterval");
    expect(renderer).toContain('style={{ width: `${props.progress}%` }}');
    expect(renderer).toContain("downloadedBytes / totalBytes");
    expect(renderer).not.toContain(
      "status.completedSteps / status.totalSteps",
    );
    expect(renderer).toContain("data-runtime-setup-bytes");
    expect(renderer).toContain("Downloads about 10.9 GB. Requires 16 GB");
    expect(renderer).toContain(
      "If you close Locomo, setup will continue when you reopen it.",
    );
    expect(renderer).toContain('phase === "error"');
    expect(renderer).toContain('errorCode === "insufficient-disk"');
    expect(renderer).toContain('"Check again"');
    expect(renderer).toContain('"Retry setup"');
    expect(renderer).toContain('"Install music runtime"');
    expect(renderer).toContain("window.setInterval(");
    expect(renderer).toContain("750,");
  });

  it("shows the engine transition, then hides setup when ready", () => {
    expect(setupController).toContain(
      "if (status.ready) options.onReady()",
    );
    expect(renderer).toContain("onReady: prepareMusic");
    expect(renderer).toContain('phase: "starting-engine" as const');
    expect(renderer).toContain('message: "Starting music engine…"');
    expect(renderer).toContain("return status.ready ? undefined : status");
    expect(renderer).toContain("displayedSetupStatus()");
    expect(renderer).toContain(
      "isMusicGenerationAvailable(runtime(), engine())",
    );
    expect(renderer).toContain("shouldMountStudio(library())");
    expect(renderer).toContain("<Show when={studioVisible()}>");
    expect(renderer).not.toContain("fallback={<");
  });

  it("uses singular song grammar", () => {
    expect(studio).toContain(
      'stationTracks().length === 1 ? "song" : "songs"',
    );
  });
});
