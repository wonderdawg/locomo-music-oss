import path from "node:path";

import type {
  RuntimeSetupStatus,
  StorageLocations,
} from "../shared/app-contract";
import {
  CPP_Q8_RUNTIME_MANIFEST,
  resolveCppRuntimeLocations,
} from "./cpp-runtime-manifest";
import { CppRuntimeSetupService } from "./cpp-runtime-setup";
import {
  minimumAvailableBytesForProfile,
} from "./memory-monitor";
import {
  createCppMusicService,
  INDIE_POP_SYNTHESIS_ENDING,
} from "./music-cpp";
import {
  type MusicRuntimeProof,
  type MusicService,
} from "./music";
import { isPathWithin } from "./storage";
import {
  sha256NativeHelper,
  type NativeCodeLocations,
} from "./native-code-paths";

export type MusicBackendProfile = "cpp-q8";

const TRACK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface RuntimeSetupServiceBoundary {
  assertReady(): Promise<void>;
  getStatus(): Promise<RuntimeSetupStatus>;
  start(): Promise<RuntimeSetupStatus>;
}

export interface ActiveMusicBackend {
  readonly model: string;
  readonly musicService: MusicService;
  readonly profile: MusicBackendProfile;
  readonly runtimeRoot: string;
  readonly runtimeSetupService: RuntimeSetupServiceBoundary;
  assertRuntimeProof(proof: MusicRuntimeProof): void;
  minimumAvailableBytes(env?: NodeJS.ProcessEnv): number;
}

export const DEFAULT_MUSIC_BACKEND_PROFILE: MusicBackendProfile =
  "cpp-q8";

export function resolveMusicBackendProfile(
  env: NodeJS.ProcessEnv = process.env,
): MusicBackendProfile {
  const selected =
    env.LOCOMO_MUSIC_BACKEND ?? DEFAULT_MUSIC_BACKEND_PROFILE;
  if (selected === "cpp-q8") {
    return selected;
  }
  throw new Error(
    `Unknown LOCOMO_MUSIC_BACKEND=${selected}; expected cpp-q8.`,
  );
}

export function resolveBackendRuntimeRoot(
  storage: StorageLocations,
  _profile: MusicBackendProfile,
): string {
  return path.join(storage.userData, "runtime-cpp-q8");
}

export function createActiveMusicBackend(options: {
  readonly environment?: NodeJS.ProcessEnv;
  readonly nativeCode: NativeCodeLocations;
  readonly profile: MusicBackendProfile;
  readonly resourcesRoot: string;
  readonly seedLibraryRoot?: string;
  readonly storage: StorageLocations;
}): ActiveMusicBackend {
  const environment = options.environment ?? process.env;
  const aacEncoderPath = options.nativeCode.aacEncoder;
  const runtimeRoot = resolveBackendRuntimeRoot(
    options.storage,
    options.profile,
  );
  if (!isPathWithin(options.storage.userData, runtimeRoot)) {
    throw new Error("Selected music runtime escaped the app-data root.");
  }

  const bundledHelperSha256 = sha256NativeHelper(
    options.nativeCode.aceServer,
  );
  const runtimeSetupService = new CppRuntimeSetupService({
    environment,
    nativeCode: options.nativeCode,
    resourcesRoot: path.join(options.resourcesRoot, "runtime-cpp-q8"),
    runtimeRoot,
  });
  const musicService = createCppMusicService({
    aacEncoderPath,
    assertRuntimeReady: () => runtimeSetupService.assertReady(),
    aceServerPath: options.nativeCode.aceServer,
    helperSha256: bundledHelperSha256,
    libraryRoot: options.storage.library,
    nativeCodeRoot: options.nativeCode.aceRoot,
    runtimeRoot,
    seedLibraryRoot: options.seedLibraryRoot,
  });
  return {
    model: "ACE-Step XL Q8 + 4B Q8",
    musicService,
    profile: options.profile,
    runtimeRoot,
    runtimeSetupService,
    assertRuntimeProof(proof) {
      assertCppRuntimeProof(
        proof,
        runtimeRoot,
        bundledHelperSha256,
      );
    },
    minimumAvailableBytes(env = environment) {
      return minimumAvailableBytesForProfile("cpp-q8", env);
    },
  };
}

function assertCppRuntimeProof(
  proof: MusicRuntimeProof,
  runtimeRoot: string,
  bundledHelperSha256: string,
): void {
  const runtime = resolveCppRuntimeLocations(runtimeRoot);
  const cpp = proof.cppQ8;
  const synthesisBoundaryIsValid =
    cpp === undefined
      ? false
      : cpp.reusedPlannerCaptionFromTrackID !== undefined
        ? TRACK_ID_PATTERN.test(
            cpp.reusedPlannerCaptionFromTrackID,
          ) &&
          cpp.reusedPlannerCaptionFromTrackID !== proof.track.id &&
          cpp.synthesisCaptionSuffix === undefined &&
          !cpp.plannerOutputUsedExactly &&
          cpp.lmResultSha256 !== cpp.synthInputSha256
        : cpp.synthesisCaptionSuffix === undefined
          ? cpp.plannerOutputUsedExactly &&
            cpp.lmResultSha256 === cpp.synthInputSha256
          : cpp.synthesisCaptionSuffix ===
                INDIE_POP_SYNTHESIS_ENDING &&
              !cpp.plannerOutputUsedExactly &&
              cpp.lmResultSha256 !== cpp.synthInputSha256;
  if (
    proof.backendProfile !== "cpp-q8" ||
    proof.sourceRevision !== CPP_Q8_RUNTIME_MANIFEST.source.revision ||
    proof.mainModel.path !==
      path.join(runtime.models, "acestep-v15-xl-turbo-Q8_0.gguf") ||
    proof.mainModel.repository !==
      CPP_Q8_RUNTIME_MANIFEST.models.repository ||
    proof.mainModel.revision !==
      CPP_Q8_RUNTIME_MANIFEST.models.revision ||
    proof.planner.path !==
      path.join(runtime.models, "acestep-5Hz-lm-4B-Q8_0.gguf") ||
    proof.planner.repository !==
      CPP_Q8_RUNTIME_MANIFEST.models.repository ||
    proof.planner.revision !==
      CPP_Q8_RUNTIME_MANIFEST.models.revision ||
    proof.planner.backend !== "gguf-q8" ||
    !proof.planner.healthInitialized ||
    proof.request.model !== "acestep-v15-xl-turbo-Q8_0.gguf" ||
    !cpp ||
    cpp.ggmlRevision !== CPP_Q8_RUNTIME_MANIFEST.source.ggmlRevision ||
    cpp.helperSha256 !== bundledHelperSha256 ||
    cpp.modelRevision !== CPP_Q8_RUNTIME_MANIFEST.models.revision ||
    cpp.idleMemoryBytes <= 0 ||
    cpp.idleMemoryBytes >= cpp.memoryPeakBytes ||
    cpp.idleMemoryBytes >= 2 * 1024 ** 3 ||
    cpp.keepLoaded ||
    !cpp.strictModelSwapping ||
    !cpp.strictUnloadObserved ||
    !synthesisBoundaryIsValid ||
    cpp.audioSafety.fixedGainDb !== -1 ||
    cpp.audioSafety.outputFormat !== "wav16" ||
    cpp.audioSafety.peakClip !== 0 ||
    !isPathWithin(runtimeRoot, proof.mainModel.path) ||
    !isPathWithin(runtimeRoot, proof.planner.path) ||
    !isPathWithin(runtimeRoot, cpp.evidenceDirectory) ||
    !isPathWithin(runtimeRoot, cpp.lmResultPath) ||
    !isPathWithin(runtimeRoot, cpp.synthInputPath)
  ) {
    throw new Error("The C++ Q8 backend runtime proof is invalid.");
  }
}
