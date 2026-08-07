import type { MusicCategoryKey } from "./music-categories";

export const APP_ID = "com.locomomusic.oss" as const;
export const DEVELOPMENT_APP_ID = "com.locomomusic.oss.dev" as const;
export const APP_NAME = "Locomo Music OSS" as const;

export const IPC_CHANNELS = {
  copyDiagnostics: "locomo-music:copy-diagnostics",
  expandWindow: "locomo-music:expand-window",
  getAppInfo: "locomo-music:get-app-info",
  getMemoryStatus: "locomo-music:get-memory-status",
  getOvernightSystemStatus:
    "locomo-music:get-overnight-system-status",
  getTrackGenerationDetails: "locomo-music:get-track-generation-details",
  generateTrack: "locomo-music:generate",
  listTracks: "locomo-music:list",
  memoryStatus: "locomo-music:memory-status",
  overnightSystemStatus: "locomo-music:overnight-system-status",
  readTrack: "locomo-music:read",
  deleteTrack: "locomo-music:delete",
  setTrackFavorite: "locomo-music:set-favorite",
  trackPlaybackStarted: "locomo-music:track-playback-started",
  getRuntimeSetupStatus: "locomo-music:runtime-status",
  prepareMusic: "locomo-music:prepare",
  retryLocalModel: "locomo-music:retry-local-model",
  setOvernightGenerationActive:
    "locomo-music:set-overnight-generation-active",
  setTrackDetailsPaneOpen: "locomo-music:set-track-details-pane-open",
  startRuntimeSetup: "locomo-music:runtime-setup",
} as const;

export interface StorageLocations {
  readonly library: string;
  readonly runtime: string;
  readonly sessionData: string;
  readonly userData: string;
}

export interface MusicTrack {
  readonly id: string;
  readonly title?: string;
  readonly categoryKey: MusicCategoryKey | null;
  readonly prompt: string;
  readonly remakeSourceTrackID?: string;
  readonly lyrics: string;
  readonly duration: number;
  readonly createdAt: number;
  readonly isFavorite: boolean;
  readonly isPlayed: boolean;
  readonly audioFormat: MusicAudioFormat;
  readonly fileExtension: MusicAudioFileExtension;
  readonly mimeType: MusicAudioMimeType;
}

export type MusicAudioFormat = "aac" | "wav";
export type MusicAudioFileExtension = ".m4a" | ".wav";
export type MusicAudioMimeType = "audio/mp4" | "audio/wav";

export interface MusicTrackAudio {
  readonly bytes: ArrayBuffer;
  readonly audioFormat: MusicAudioFormat;
  readonly fileExtension: MusicAudioFileExtension;
  readonly mimeType: MusicAudioMimeType;
}

export interface MusicTrackGenerationDetails {
  readonly anotherTake: {
    readonly duration: number;
    readonly instrumental: boolean;
  } | null;
  readonly plannerCaption: string | null;
  readonly plannerModel: {
    readonly backend: "gguf-q8";
    readonly fileName: string;
  } | null;
  readonly prompt: string;
  readonly promptRecipeVersion: MusicPromptRecipeVersion | null;
}

export type MusicPromptRecipeVersion = "custom" | "v1" | "v2.3";

export interface MusicGenerationRequest {
  readonly categoryKey: MusicCategoryKey;
  readonly mode: "create" | "cover" | "extend";
  readonly prompt: string;
  readonly promptRecipeVersion?: MusicPromptRecipeVersion;
  readonly lyrics: string;
  readonly duration: number;
  readonly bpm?: number;
  readonly keyScale?: string;
  readonly reusePlannerCaptionFromTrackID?: string;
  readonly sourceDuration?: number;
  readonly referenceAudio?: {
    readonly bytes: ArrayBuffer;
    readonly name: string;
  };
  readonly sourceAudio?: {
    readonly bytes: ArrayBuffer;
    readonly name: string;
  };
}

export function assertMusicGenerationDurationSeconds(
  duration: unknown,
): asserts duration is number {
  const seconds = duration as number;
  const isSupportedWholeMinute =
    Number.isInteger(seconds) &&
    seconds >= 60 &&
    seconds <= 600 &&
    seconds % 60 === 0;
  if (
    seconds !== 90 &&
    seconds !== 150 &&
    !isSupportedWholeMinute
  ) {
    throw new Error(
      "Song duration must be 90 or 150 seconds or a whole-minute value from 1 to 10 minutes.",
    );
  }
}

export interface AppInfo {
  readonly bundleId: typeof APP_ID;
  readonly isPackaged: boolean;
  readonly name: typeof APP_NAME;
  readonly paths: StorageLocations;
  readonly platform: NodeJS.Platform;
  readonly version: string;
}

export type LocalModelStatus =
  | "checking"
  | "blocked"
  | "loading"
  | "ready"
  | "error";

export interface MemoryStatus {
  readonly status: LocalModelStatus;
  readonly totalBytes: number;
  readonly availableBytes: number;
  readonly requiredBytes: number;
  readonly headroomBytes: number;
  readonly modelBytes: number;
  readonly generationActive: boolean;
  readonly generationPeakBytes?: number;
  readonly model: string;
  readonly detail?: string;
  readonly measuredAt: number;
}

export interface OvernightSystemStatus {
  readonly idleSeconds: number;
  readonly onExternalPower: boolean;
  readonly supported: boolean;
}

export type RuntimeSetupPhase =
  | "checking"
  | "not-installed"
  | "checking-disk"
  | "installing-helper"
  | "downloading-models"
  | "verifying"
  | "starting-engine"
  | "ready"
  | "error";

export interface RuntimeSetupStatus {
  readonly phase: RuntimeSetupPhase;
  readonly ready: boolean;
  readonly running: boolean;
  readonly message: string;
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly downloadedBytes?: number;
  readonly downloadTotalBytes?: number;
  readonly error?: string;
  readonly errorCode?: "insufficient-disk";
  readonly freeBytes?: number;
  readonly requiredBytes?: number;
}

export interface LocomoMusicBridge {
  copyDiagnostics(): Promise<void>;
  expandWindow(): Promise<void>;
  getAppInfo(): Promise<AppInfo>;
  getMemoryStatus(): Promise<MemoryStatus>;
  getOvernightSystemStatus(): Promise<OvernightSystemStatus>;
  getRuntimeSetupStatus(): Promise<RuntimeSetupStatus>;
  getTrackGenerationDetails(
    id: string,
  ): Promise<MusicTrackGenerationDetails | undefined>;
  onMemoryStatus(callback: (status: MemoryStatus) => void): () => void;
  onOvernightSystemStatus(
    callback: (status: OvernightSystemStatus) => void,
  ): () => void;
  retryLocalModel(): Promise<MemoryStatus>;
  startRuntimeSetup(): Promise<RuntimeSetupStatus>;
  prepare(): Promise<void>;
  generate(input: MusicGenerationRequest): Promise<MusicTrack>;
  list(): Promise<MusicTrack[]>;
  read(id: string): Promise<MusicTrackAudio>;
  delete(id: string): Promise<void>;
  setFavorite(id: string, isFavorite: boolean): Promise<void>;
  trackPlaybackStarted(id: string): Promise<void>;
  setOvernightGenerationActive(active: boolean): Promise<void>;
  setTrackDetailsPaneOpen(open: boolean): Promise<void>;
}
