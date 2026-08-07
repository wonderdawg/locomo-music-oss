import type {
  MusicAudioFileExtension,
  MusicAudioFormat,
  MusicAudioMimeType,
  MusicGenerationRequest,
  MusicPromptRecipeVersion,
  MusicTrack,
} from "../shared/app-contract";
import type { GenerationMemoryEvent } from "./memory-monitor";

export interface MusicRuntimeProof {
  readonly backendProfile?: "cpp-q8";
  readonly generatedAt: string;
  readonly port: number;
  readonly sourceRevision: string;
  readonly mainModel: {
    readonly path: string;
    readonly repository: string;
    readonly revision: string;
  };
  readonly planner: {
    readonly backend: "gguf-q8";
    readonly healthInitialized: true;
    readonly loadedPathEvidence: string;
    readonly path: string;
    readonly repository: string;
    readonly revision: string;
  };
  readonly request: {
    readonly duration: number;
    readonly inferenceSteps: number;
    readonly model: string;
    readonly promptRecipeVersion?: MusicPromptRecipeVersion;
    readonly sampleMode: boolean;
    readonly thinking: true;
    readonly vocalLanguage: string;
  };
  readonly track: {
    readonly id: string;
    readonly path: string;
  };
  readonly cppQ8?: {
    readonly audioSafety: {
      readonly fixedGainDb: number;
      readonly outputFormat: "wav16";
      readonly peakClip: 0;
      readonly samplePeakAfter: number;
      readonly samplePeakBefore: number;
    };
    readonly evidenceDirectory: string;
    readonly ggmlRevision: string;
    readonly helperSha256: string;
    readonly idleMemoryBytes: number;
    readonly keepLoaded: false;
    readonly lmResultPath: string;
    readonly lmResultSha256: string;
    readonly memoryPeakBytes: number;
    readonly modelRevision: string;
    readonly plannerOutputUsedExactly: boolean;
    readonly reusedPlannerCaptionFromTrackID?: string;
    readonly seed: number;
    readonly serverPid: number;
    readonly strictModelSwapping: true;
    readonly strictUnloadObserved: true;
    readonly synthesisCaptionSuffix?: string;
    readonly synthInputPath: string;
    readonly synthInputSha256: string;
    readonly timings: {
      readonly endToEndSeconds: number;
      readonly plannerSeconds: number;
      readonly synthesisSeconds: number;
    };
  };
}

export interface MusicService {
  delete(id: string): Promise<void>;
  dispose(): void;
  generate(input: MusicGenerationRequest): Promise<MusicTrack>;
  getLastRuntimeProof(): Promise<MusicRuntimeProof | undefined>;
  list(): Promise<MusicTrack[]>;
  markPlayed(id: string): Promise<boolean>;
  memoryBytes(): Promise<number>;
  observeGenerationMemory(
    observer: (event: GenerationMemoryEvent) => void,
  ): () => void;
  observeEngineExit(
    observer: (event: MusicEngineExit) => void,
  ): () => void;
  prepare(): Promise<void>;
  readPrompt(id: string): Promise<string | undefined>;
  read(id: string): Promise<{
    readonly audioFormat: MusicAudioFormat;
    readonly bytes: Buffer;
    readonly fileExtension: MusicAudioFileExtension;
    readonly mimeType: MusicAudioMimeType;
  }>;
  setFavorite(id: string, isFavorite: boolean): Promise<boolean>;
  trackPath(id: string): string;
}

export interface MusicEngineExit {
  readonly exitCode?: number;
  readonly signal?: NodeJS.Signals;
}

export class MusicEngineExitError extends Error {
  readonly exitCode?: number;
  readonly signal?: NodeJS.Signals;

  constructor(event: MusicEngineExit) {
    super(
      `ACE-Step exited unexpectedly (code=${event.exitCode ?? "none"}, signal=${event.signal ?? "none"}).`,
    );
    this.name = "MusicEngineExitError";
    this.exitCode = event.exitCode;
    this.signal = event.signal;
  }
}
