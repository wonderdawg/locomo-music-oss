import { Buffer } from "node:buffer";

import {
  assertMusicGenerationDurationSeconds,
  IPC_CHANNELS,
} from "../shared/app-contract";

export const INVALID_PRIVILEGED_IPC_PAYLOAD_ERROR_MESSAGE =
  "Blocked malformed or oversized privileged IPC payload.";

export const PRIVILEGED_IPC_PAYLOAD_LIMITS = Object.freeze({
  arguments: 4,
  audioBytes: 256 * 1024 * 1024,
  categoryKeyBytes: 256,
  collectionEntries: 1_024,
  filenameBytes: 255,
  identifierBytes: 128,
  keyScaleBytes: 128,
  lyricsBytes: 256 * 1024,
  objectDepth: 8,
  objectKeys: 32,
  promptBytes: 64 * 1024,
  stationBytes: 512,
  totalAudioBytes: 512 * 1024 * 1024,
  totalNodes: 4_096,
  totalStringBytes: 384 * 1024,
});

type PayloadValidator = (args: readonly unknown[]) => boolean;

const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)?.get;
const TRACK_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CATEGORY_KEY =
  /^(?:existing|experimental)\/[a-z0-9][a-z0-9-]*$/iu;
const GENERATION_REQUEST_REQUIRED_KEYS = [
  "categoryKey",
  "duration",
  "lyrics",
  "mode",
  "prompt",
] as const;
const GENERATION_REQUEST_OPTIONAL_KEYS = [
  "bpm",
  "keyScale",
  "promptRecipeVersion",
  "referenceAudio",
  "reusePlannerCaptionFromTrackID",
  "sourceAudio",
  "sourceDuration",
  "station",
] as const;

const noArguments: PayloadValidator = (args) => args.length === 0;
const oneTrackID: PayloadValidator = (args) =>
  args.length === 1 && isTrackID(args[0]);
const oneBoolean: PayloadValidator = (args) =>
  args.length === 1 && typeof args[0] === "boolean";

const payloadValidators = new Map<string, PayloadValidator>([
  [IPC_CHANNELS.copyDiagnostics, noArguments],
  [IPC_CHANNELS.expandWindow, noArguments],
  [IPC_CHANNELS.getAppInfo, noArguments],
  [IPC_CHANNELS.getMemoryStatus, noArguments],
  [IPC_CHANNELS.getOvernightSystemStatus, noArguments],
  [IPC_CHANNELS.getRuntimeSetupStatus, noArguments],
  [IPC_CHANNELS.getTrackGenerationDetails, oneTrackID],
  [IPC_CHANNELS.startRuntimeSetup, noArguments],
  [IPC_CHANNELS.prepareMusic, noArguments],
  [IPC_CHANNELS.retryLocalModel, noArguments],
  [IPC_CHANNELS.generateTrack, validateGenerationRequestArguments],
  [IPC_CHANNELS.listTracks, noArguments],
  [IPC_CHANNELS.readTrack, oneTrackID],
  [IPC_CHANNELS.deleteTrack, oneTrackID],
  [IPC_CHANNELS.setTrackFavorite, validateFavoriteArguments],
  [IPC_CHANNELS.trackPlaybackStarted, oneTrackID],
  [IPC_CHANNELS.setOvernightGenerationActive, oneBoolean],
  [IPC_CHANNELS.setTrackDetailsPaneOpen, oneBoolean],
]);

export const PRIVILEGED_IPC_PAYLOAD_CHANNELS = Object.freeze(
  Array.from(payloadValidators.keys()),
);

export function assertValidPrivilegedIpcPayload(
  channel: string,
  args: readonly unknown[],
): void {
  let valid = false;
  try {
    const validator = payloadValidators.get(channel);
    valid =
      validator !== undefined &&
      isWithinPrivilegedIpcPayloadBudget(args) &&
      validator(args);
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new Error(INVALID_PRIVILEGED_IPC_PAYLOAD_ERROR_MESSAGE);
  }
}

export function isWithinPrivilegedIpcPayloadBudget(
  args: readonly unknown[],
): boolean {
  try {
    if (
      !Array.isArray(args) ||
      args.length > PRIVILEGED_IPC_PAYLOAD_LIMITS.arguments
    ) {
      return false;
    }

    const budget = {
      audioBytes: 0,
      collectionEntries: 0,
      nodes: 0,
      stringBytes: 0,
    };
    const ancestors = new WeakSet<object>();
    return args.every((value) =>
      visitStructuredValue(value, 0, budget, ancestors),
    );
  } catch {
    return false;
  }
}

function visitStructuredValue(
  value: unknown,
  depth: number,
  budget: {
    audioBytes: number;
    collectionEntries: number;
    nodes: number;
    stringBytes: number;
  },
  ancestors: WeakSet<object>,
): boolean {
  budget.nodes += 1;
  if (budget.nodes > PRIVILEGED_IPC_PAYLOAD_LIMITS.totalNodes) {
    return false;
  }

  if (value === null || value === undefined || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    budget.stringBytes += utf8Bytes(value);
    return (
      budget.stringBytes <=
      PRIVILEGED_IPC_PAYLOAD_LIMITS.totalStringBytes
    );
  }
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;

  if (value instanceof ArrayBuffer) {
    const byteLength = readArrayBufferByteLength(value);
    budget.audioBytes += byteLength;
    return (
      byteLength <= PRIVILEGED_IPC_PAYLOAD_LIMITS.audioBytes &&
      budget.audioBytes <=
        PRIVILEGED_IPC_PAYLOAD_LIMITS.totalAudioBytes
    );
  }
  if (ArrayBuffer.isView(value)) return false;
  if (depth >= PRIVILEGED_IPC_PAYLOAD_LIMITS.objectDepth) return false;

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (
        value.length >
        PRIVILEGED_IPC_PAYLOAD_LIMITS.collectionEntries
      ) {
        return false;
      }
      budget.collectionEntries += value.length;
      if (
        budget.collectionEntries >
        PRIVILEGED_IPC_PAYLOAD_LIMITS.collectionEntries
      ) {
        return false;
      }
      return value.every((entry) =>
        visitStructuredValue(entry, depth + 1, budget, ancestors),
      );
    }
    if (!isPlainRecord(value)) return false;

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length > PRIVILEGED_IPC_PAYLOAD_LIMITS.objectKeys ||
      keys.some((key) => typeof key !== "string")
    ) {
      return false;
    }
    budget.collectionEntries += keys.length;
    if (
      budget.collectionEntries >
      PRIVILEGED_IPC_PAYLOAD_LIMITS.collectionEntries
    ) {
      return false;
    }
    return keys.every((key) => {
      if (typeof key !== "string") return false;
      const descriptor = descriptors[key];
      return (
        descriptor !== undefined &&
        "value" in descriptor &&
        visitStructuredValue(
          descriptor.value,
          depth + 1,
          budget,
          ancestors,
        )
      );
    });
  } finally {
    ancestors.delete(value);
  }
}

function validateGenerationRequestArguments(
  args: readonly unknown[],
): boolean {
  if (args.length !== 1 || !isPlainRecord(args[0])) return false;
  const request = args[0];
  if (
    !hasExactKeys(
      request,
      GENERATION_REQUEST_REQUIRED_KEYS,
      GENERATION_REQUEST_OPTIONAL_KEYS,
    ) ||
    !isBoundedString(
      request.categoryKey,
      1,
      PRIVILEGED_IPC_PAYLOAD_LIMITS.categoryKeyBytes,
    ) ||
    !CATEGORY_KEY.test(request.categoryKey) ||
    (request.mode !== "create" &&
      request.mode !== "cover" &&
      request.mode !== "extend") ||
    !isBoundedString(
      request.prompt,
      0,
      PRIVILEGED_IPC_PAYLOAD_LIMITS.promptBytes,
    ) ||
    !isBoundedString(
      request.lyrics,
      0,
      PRIVILEGED_IPC_PAYLOAD_LIMITS.lyricsBytes,
    ) ||
    !isSupportedDuration(request.duration) ||
    !isOptionalFiniteNumber(request.bpm, 0, 400) ||
    !isOptionalBoundedString(
      request.keyScale,
      PRIVILEGED_IPC_PAYLOAD_LIMITS.keyScaleBytes,
    ) ||
    !isOptionalPromptRecipeVersion(request.promptRecipeVersion) ||
    !isOptionalTrackID(request.reusePlannerCaptionFromTrackID) ||
    !isOptionalFiniteNumber(request.sourceDuration, 0, 600) ||
    !isOptionalBoundedString(
      request.station,
      PRIVILEGED_IPC_PAYLOAD_LIMITS.stationBytes,
    ) ||
    !isOptionalAudio(request.referenceAudio) ||
    !isOptionalAudio(request.sourceAudio)
  ) {
    return false;
  }
  return true;
}

function validateFavoriteArguments(args: readonly unknown[]): boolean {
  return (
    args.length === 2 &&
    isTrackID(args[0]) &&
    typeof args[1] === "boolean"
  );
}

function isSupportedDuration(value: unknown): value is number {
  try {
    assertMusicGenerationDurationSeconds(value);
    return true;
  } catch {
    return false;
  }
}

function isTrackID(value: unknown): value is string {
  return (
    isBoundedString(
      value,
      1,
      PRIVILEGED_IPC_PAYLOAD_LIMITS.identifierBytes,
    ) && TRACK_ID.test(value)
  );
}

function isOptionalTrackID(value: unknown): boolean {
  return value === undefined || isTrackID(value);
}

function isOptionalPromptRecipeVersion(value: unknown): boolean {
  return (
    value === undefined ||
    value === "custom" ||
    value === "v1" ||
    value === "v2.3"
  );
}

function isOptionalFiniteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): boolean {
  return (
    value === undefined ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= minimum &&
      value <= maximum)
  );
}

function isOptionalBoundedString(
  value: unknown,
  maximumBytes: number,
): boolean {
  return (
    value === undefined ||
    isBoundedString(value, 0, maximumBytes)
  );
}

function isOptionalAudio(value: unknown): boolean {
  if (value === undefined) return true;
  const byteLength =
    value !== null &&
    typeof value === "object" &&
    "bytes" in value &&
    value.bytes instanceof ArrayBuffer
      ? readArrayBufferByteLength(value.bytes)
      : undefined;
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["bytes", "name"], []) ||
    !(value.bytes instanceof ArrayBuffer) ||
    byteLength === undefined ||
    byteLength === 0 ||
    byteLength > PRIVILEGED_IPC_PAYLOAD_LIMITS.audioBytes ||
    !isBoundedString(
      value.name,
      1,
      PRIVILEGED_IPC_PAYLOAD_LIMITS.filenameBytes,
    ) ||
    value.name === "." ||
    value.name === ".." ||
    /[\\/\u0000-\u001f\u007f]/u.test(value.name)
  ) {
    return false;
  }
  return true;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) return false;
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every(
      (key) => typeof key === "string" && allowed.has(key),
    )
  );
}

function isBoundedString(
  value: unknown,
  minimumBytes: number,
  maximumBytes: number,
): value is string {
  if (typeof value !== "string") return false;
  const byteLength = utf8Bytes(value);
  return byteLength >= minimumBytes && byteLength <= maximumBytes;
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function readArrayBufferByteLength(value: ArrayBuffer): number {
  if (!arrayBufferByteLengthGetter) {
    throw new Error("ArrayBuffer byte length is unavailable.");
  }
  return arrayBufferByteLengthGetter.call(value) as number;
}
