import { describe, expect, it } from "vitest";

import {
  assertValidPrivilegedIpcPayload,
  INVALID_PRIVILEGED_IPC_PAYLOAD_ERROR_MESSAGE,
  isWithinPrivilegedIpcPayloadBudget,
  PRIVILEGED_IPC_PAYLOAD_CHANNELS,
  PRIVILEGED_IPC_PAYLOAD_LIMITS,
} from "../src/main/ipc-payload-validation";
import { IPC_CHANNELS } from "../src/shared/app-contract";

const TRACK_ID = "123e4567-e89b-42d3-a456-426614174000";
const normalGenerationRequest = {
  bpm: 124,
  categoryKey: "existing/house",
  duration: 150,
  keyScale: "C minor",
  lyrics: "__AUTO__",
  mode: "create",
  prompt: "Warm analog house with a patient club arrangement.",
  promptRecipeVersion: "v2.3",
  station: "House",
} as const;

function expectAccepted(channel: string, ...args: unknown[]): void {
  expect(() => assertValidPrivilegedIpcPayload(channel, args)).not.toThrow();
}

function expectRejected(channel: string, ...args: unknown[]): void {
  expect(() => assertValidPrivilegedIpcPayload(channel, args)).toThrow(
    INVALID_PRIVILEGED_IPC_PAYLOAD_ERROR_MESSAGE,
  );
}

describe("privileged IPC payload validation", () => {
  it("accepts every normal renderer-to-main payload shape", () => {
    for (const channel of [
      IPC_CHANNELS.copyDiagnostics,
      IPC_CHANNELS.expandWindow,
      IPC_CHANNELS.getAppInfo,
      IPC_CHANNELS.getMemoryStatus,
      IPC_CHANNELS.getOvernightSystemStatus,
      IPC_CHANNELS.getRuntimeSetupStatus,
      IPC_CHANNELS.startRuntimeSetup,
      IPC_CHANNELS.prepareMusic,
      IPC_CHANNELS.retryLocalModel,
      IPC_CHANNELS.listTracks,
    ]) {
      expectAccepted(channel);
    }
    for (const channel of [
      IPC_CHANNELS.getTrackGenerationDetails,
      IPC_CHANNELS.readTrack,
      IPC_CHANNELS.deleteTrack,
      IPC_CHANNELS.trackPlaybackStarted,
    ]) {
      expectAccepted(channel, TRACK_ID);
    }
    expectAccepted(IPC_CHANNELS.setTrackFavorite, TRACK_ID, true);
    expectAccepted(IPC_CHANNELS.setOvernightGenerationActive, false);
    expectAccepted(IPC_CHANNELS.setTrackDetailsPaneOpen, true);
    expectAccepted(IPC_CHANNELS.generateTrack, normalGenerationRequest);

    expect(PRIVILEGED_IPC_PAYLOAD_CHANNELS).toHaveLength(18);
  });

  it("accepts product-compatible optional generation inputs", () => {
    expectAccepted(IPC_CHANNELS.generateTrack, {
      categoryKey: "experimental/custom-A1b2-C3d4",
      duration: 600,
      lyrics: "Verse one\nChorus",
      mode: "extend",
      prompt: "Continue the arrangement without changing its character.",
      referenceAudio: {
        bytes: new ArrayBuffer(16),
        name: "reference mix.wav",
      },
      reusePlannerCaptionFromTrackID: TRACK_ID,
      sourceAudio: {
        bytes: new ArrayBuffer(32),
        name: "source take.m4a",
      },
      sourceDuration: 540,
    });
  });

  it.each([
    ["an unknown channel", "locomo-music:unknown", []],
    ["extra arguments", IPC_CHANNELS.getAppInfo, ["extra"]],
    ["a malformed identifier", IPC_CHANNELS.readTrack, ["../track"]],
    ["a missing identifier", IPC_CHANNELS.deleteTrack, []],
    [
      "a malformed favorite payload",
      IPC_CHANNELS.setTrackFavorite,
      [TRACK_ID, "true"],
    ],
    [
      "a malformed boolean state",
      IPC_CHANNELS.setTrackDetailsPaneOpen,
      [1],
    ],
  ])("rejects %s", (_case, channel, args) => {
    expectRejected(channel as string, ...(args as unknown[]));
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["a missing field", { ...normalGenerationRequest, prompt: undefined }],
    ["an extra field", { ...normalGenerationRequest, privatePath: "/tmp" }],
    ["an invalid mode", { ...normalGenerationRequest, mode: "remix" }],
    ["an invalid category", { ...normalGenerationRequest, categoryKey: "house" }],
    ["an unsupported duration", { ...normalGenerationRequest, duration: 151 }],
    ["a non-finite BPM", { ...normalGenerationRequest, bpm: Number.NaN }],
    ["an out-of-range BPM", { ...normalGenerationRequest, bpm: 401 }],
    [
      "an invalid prompt recipe",
      { ...normalGenerationRequest, promptRecipeVersion: "latest" },
    ],
    [
      "an invalid reuse identifier",
      { ...normalGenerationRequest, reusePlannerCaptionFromTrackID: "track-1" },
    ],
    [
      "an out-of-range source duration",
      { ...normalGenerationRequest, sourceDuration: 601 },
    ],
    [
      "a typed-array audio body",
      {
        ...normalGenerationRequest,
        referenceAudio: { bytes: new Uint8Array(8), name: "input.wav" },
      },
    ],
    [
      "an empty audio body",
      {
        ...normalGenerationRequest,
        referenceAudio: { bytes: new ArrayBuffer(0), name: "input.wav" },
      },
    ],
    [
      "a path-bearing audio filename",
      {
        ...normalGenerationRequest,
        referenceAudio: { bytes: new ArrayBuffer(8), name: "../input.wav" },
      },
    ],
  ])("rejects a generation request containing %s", (_case, request) => {
    expectRejected(IPC_CHANNELS.generateTrack, request);
  });

  it("enforces UTF-8 byte limits for generation text and filenames", () => {
    expectRejected(IPC_CHANNELS.generateTrack, {
      ...normalGenerationRequest,
      prompt: "p".repeat(PRIVILEGED_IPC_PAYLOAD_LIMITS.promptBytes + 1),
    });
    expectRejected(IPC_CHANNELS.generateTrack, {
      ...normalGenerationRequest,
      lyrics: "l".repeat(PRIVILEGED_IPC_PAYLOAD_LIMITS.lyricsBytes + 1),
    });
    expectRejected(IPC_CHANNELS.generateTrack, {
      ...normalGenerationRequest,
      keyScale: "k".repeat(
        PRIVILEGED_IPC_PAYLOAD_LIMITS.keyScaleBytes + 1,
      ),
    });
    expectRejected(IPC_CHANNELS.generateTrack, {
      ...normalGenerationRequest,
      referenceAudio: {
        bytes: new ArrayBuffer(8),
        name: `${"n".repeat(
          PRIVILEGED_IPC_PAYLOAD_LIMITS.filenameBytes,
        )}.wav`,
      },
    });
    expectRejected(IPC_CHANNELS.generateTrack, {
      ...normalGenerationRequest,
      prompt: "🎵".repeat(
        Math.floor(PRIVILEGED_IPC_PAYLOAD_LIMITS.promptBytes / 4) + 1,
      ),
    });
  });

  it("rejects oversized audio ArrayBuffers", () => {
    const oversizedAudio = new ArrayBuffer(
      PRIVILEGED_IPC_PAYLOAD_LIMITS.audioBytes + 1,
    );
    expectRejected(IPC_CHANNELS.generateTrack, {
      ...normalGenerationRequest,
      referenceAudio: { bytes: oversizedAudio, name: "input.wav" },
    });
  });

  it("rejects oversized, cyclic, and deeply nested structured collections", () => {
    expect(
      isWithinPrivilegedIpcPayloadBudget([
        new Array(
          PRIVILEGED_IPC_PAYLOAD_LIMITS.collectionEntries + 1,
        ).fill(null),
      ]),
    ).toBe(false);

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(isWithinPrivilegedIpcPayloadBudget([cyclic])).toBe(false);

    let nested: Record<string, unknown> = {};
    for (
      let depth = 0;
      depth <= PRIVILEGED_IPC_PAYLOAD_LIMITS.objectDepth;
      depth += 1
    ) {
      nested = { nested };
    }
    expect(isWithinPrivilegedIpcPayloadBudget([nested])).toBe(false);
  });
});
