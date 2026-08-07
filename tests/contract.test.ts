import { describe, expect, it } from "vitest";

import {
  APP_ID,
  APP_NAME,
  DEVELOPMENT_APP_ID,
  IPC_CHANNELS,
  type AppInfo,
  type LocomoMusicBridge,
} from "../src/shared/app-contract";

describe("typed preload contract", () => {
  it("uses an OSS identity isolated from the official product", () => {
    expect(APP_NAME).toBe("Locomo Music OSS");
    expect(APP_ID).toBe("com.locomomusic.oss");
    expect(DEVELOPMENT_APP_ID).toBe("com.locomomusic.oss.dev");
    expect(Object.keys(IPC_CHANNELS)).toHaveLength(20);
    expect(IPC_CHANNELS.getAppInfo).toBe("locomo-music:get-app-info");
    expect(IPC_CHANNELS.generateTrack).toBe("locomo-music:generate");
    expect(IPC_CHANNELS.setTrackFavorite).toBe(
      "locomo-music:set-favorite",
    );
    expect(IPC_CHANNELS.getTrackGenerationDetails).toBe(
      "locomo-music:get-track-generation-details",
    );
  });

  it("returns app information through the reduced local-only bridge", async () => {
    const expectedInfo: AppInfo = {
      bundleId: APP_ID,
      isPackaged: false,
      name: APP_NAME,
      paths: {
        library: "/app-data/library",
        runtime: "/app-data/runtime",
        sessionData: "/app-data/session",
        userData: "/app-data",
      },
      platform: process.platform,
      version: "0.1.0",
    };
    const bridge: LocomoMusicBridge = {
      copyDiagnostics: async () => undefined,
      delete: async () => undefined,
      expandWindow: async () => undefined,
      generate: async () => ({
        id: "00000000-0000-4000-8000-000000000000",
        categoryKey: "existing/house",
        prompt: "House.",
        lyrics: "",
        duration: 60,
        createdAt: 1,
        isFavorite: false,
        isPlayed: false,
        audioFormat: "aac",
        fileExtension: ".m4a",
        mimeType: "audio/mp4",
      }),
      getAppInfo: async () => expectedInfo,
      getMemoryStatus: async () => ({
        status: "ready",
        totalBytes: 16,
        availableBytes: 8,
        requiredBytes: 6,
        headroomBytes: 2,
        modelBytes: 4,
        generationActive: false,
        model: "ACE-Step XL Q8 + 4B Q8",
        measuredAt: 1,
      }),
      getOvernightSystemStatus: async () => ({
        idleSeconds: 900,
        onExternalPower: true,
        supported: true,
      }),
      getRuntimeSetupStatus: async () => ({
        phase: "not-installed",
        ready: false,
        running: false,
        message: "Not installed.",
        completedSteps: 0,
        totalSteps: 3,
      }),
      getTrackGenerationDetails: async () => ({
        anotherTake: null,
        plannerCaption: "A bright house track.",
        plannerModel: {
          backend: "gguf-q8",
          fileName: "acestep-5Hz-lm-4B-Q8_0.gguf",
        },
        prompt: "House.",
        promptRecipeVersion: "v2.3",
      }),
      list: async () => [],
      onMemoryStatus: () => () => undefined,
      onOvernightSystemStatus: () => () => undefined,
      prepare: async () => undefined,
      read: async () => ({
        bytes: new ArrayBuffer(0),
        audioFormat: "aac",
        fileExtension: ".m4a",
        mimeType: "audio/mp4",
      }),
      retryLocalModel: async () => ({
        status: "checking",
        totalBytes: 16,
        availableBytes: 8,
        requiredBytes: 6,
        headroomBytes: 2,
        modelBytes: 0,
        generationActive: false,
        model: "ACE-Step XL Q8 + 4B Q8",
        measuredAt: 2,
      }),
      setFavorite: async () => undefined,
      setOvernightGenerationActive: async () => undefined,
      setTrackDetailsPaneOpen: async () => undefined,
      startRuntimeSetup: async () => ({
        phase: "downloading-models",
        ready: false,
        running: true,
        message: "Downloading.",
        completedSteps: 1,
        totalSteps: 3,
      }),
      trackPlaybackStarted: async () => undefined,
    };

    await expect(bridge.getAppInfo()).resolves.toEqual(expectedInfo);
    await expect(bridge.list()).resolves.toEqual([]);
    expect(Object.keys(bridge).sort()).toEqual([
      "copyDiagnostics",
      "delete",
      "expandWindow",
      "generate",
      "getAppInfo",
      "getMemoryStatus",
      "getOvernightSystemStatus",
      "getRuntimeSetupStatus",
      "getTrackGenerationDetails",
      "list",
      "onMemoryStatus",
      "onOvernightSystemStatus",
      "prepare",
      "read",
      "retryLocalModel",
      "setFavorite",
      "setOvernightGenerationActive",
      "setTrackDetailsPaneOpen",
      "startRuntimeSetup",
      "trackPlaybackStarted",
    ]);
  });
});
