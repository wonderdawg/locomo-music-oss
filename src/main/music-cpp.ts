import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

import type {
  MusicGenerationRequest,
  MusicTrack,
} from "../shared/app-contract";
import { EXISTING_INDIE_POP_CATEGORY_KEY } from "../shared/music-categories";
import {
  readRetainedAnotherTakeSource,
  type RetainedPlannerRequest,
} from "./another-take-source";
import {
  CPP_Q8_RUNTIME_MANIFEST,
  resolveCppRuntimeLocations,
} from "./cpp-runtime-manifest";
import {
  type GenerationMemoryEvent,
  readProcessTreeMemoryBytes,
} from "./memory-monitor";
import {
  MusicEngineExitError,
  type MusicEngineExit,
  type MusicRuntimeProof,
  type MusicService,
} from "./music";
import {
  createMusicLibrary,
  createTrackGenerationProofStorage,
  type MusicTrackMetadata,
} from "./music-library";
import { createGenerationTrackTitle } from "./music-title";
import { resolveMusicVocalLanguage } from "./music-vocal-language";

const CPP_RUNTIME_NOT_INSTALLED =
  "Locomo Music C++ Q8 runtime is not installed. Complete setup before generating music.";
const OUTPUT_HEADROOM_DECIBELS = -1;
const PLANNER_MODEL = "acestep-5Hz-lm-4B-Q8_0.gguf";
const SYNTH_MODEL = "acestep-v15-xl-turbo-Q8_0.gguf";
export const CPP_ANOTHER_TAKE_PLANNER_ATTEMPT_LIMIT = 3;
export const INDIE_POP_SYNTHESIS_ENDING =
  "In the final 30 seconds, build into a huge emotional crescendo with increasingly full orchestration, rising intensity, and a powerful final release.";
const REQUIRED_STRICT_UNLOAD_MESSAGES = [
  "[Store] Unload LM",
  "[Store] Unload TextEnc",
  "[Store] Unload CondEnc",
  "[Store] Unload FSQ-Detok",
  "[Store] Unload DiT",
  "[Store] Unload VAE-Dec",
] as const;

interface CppPlannedRequest {
  readonly audio_codes?: string;
  readonly bpm?: number;
  readonly caption?: string;
  readonly duration?: number;
  readonly keyscale?: string;
  readonly lyrics?: string;
  readonly seed?: number;
  readonly timesignature?: string;
  readonly vocal_language?: string;
}

interface CppServerProps {
  readonly cli?: {
    readonly max_batch?: number;
  };
  readonly models?: {
    readonly dit?: readonly string[];
    readonly embedding?: readonly string[];
    readonly lm?: readonly string[];
    readonly vae?: readonly string[];
  };
  readonly version?: string;
}

export function createCppGenerationPayload(
  input: MusicGenerationRequest,
  seed: number,
) {
  return {
    caption: input.prompt,
    lyrics:
      input.lyrics === "__AUTO__" ? "" : input.lyrics || "[Instrumental]",
    bpm: input.bpm ?? 0,
    duration: input.duration,
    keyscale: input.keyScale ?? "",
    timesignature: "",
    vocal_language: resolveMusicVocalLanguage(input),
    seed,
    lm_batch_size: 1,
    synth_batch_size: 1,
    lm_temperature: 0.85,
    lm_cfg_scale: 2,
    lm_top_p: 0.9,
    lm_top_k: 0,
    lm_negative_prompt: "",
    use_cot_caption: true,
    audio_codes: "",
    inference_steps: 8,
    guidance_scale: 0,
    shift: 0,
    dcw_scaler: 0,
    dcw_high_scaler: 0,
    dcw_mode: "low",
    audio_cover_strength: input.mode === "cover" ? 1 : 0.2,
    cover_noise_strength: 0,
    repainting_start:
      input.mode === "extend"
        ? Math.max(0, (input.sourceDuration ?? input.duration - 60) - 5)
        : 0,
    repainting_end: input.mode === "extend" ? input.duration : -1,
    latent_shift: 0,
    latent_rescale: 1,
    custom_timesteps: "",
    task_type:
      input.mode === "extend"
        ? "repaint"
        : input.mode === "cover"
          ? "cover"
          : "text2music",
    track: "",
    solver: "euler",
    lm_mode: "generate",
    output_format: "wav16",
    peak_clip: 0,
    mp3_bitrate: 128,
    synth_model: SYNTH_MODEL,
    lm_model: PLANNER_MODEL,
    adapter: "",
    adapter_scale: 1,
  };
}

export function hasGeneratedLyrics(lyrics: string) {
  return /[\p{L}\p{N}]/u.test(lyrics.replace(/\[[^\]]*\]/g, ""));
}

export function createCppSynthesisInput(
  input: MusicGenerationRequest,
  plannerResult: Buffer,
): Buffer {
  if (input.categoryKey !== EXISTING_INDIE_POP_CATEGORY_KEY) {
    return plannerResult;
  }

  const plannedBatch = JSON.parse(
    plannerResult.toString("utf8"),
  ) as (CppPlannedRequest & Record<string, unknown>)[];
  const planned = plannedBatch[0];
  if (
    plannedBatch.length !== 1 ||
    !planned ||
    typeof planned.caption !== "string"
  ) {
    throw new Error(
      "The Q8 4B planner did not return one caption for Indie pop synthesis.",
    );
  }
  return Buffer.from(
    JSON.stringify([
      {
        ...planned,
        caption:
          `${planned.caption} ${INDIE_POP_SYNTHESIS_ENDING}`,
      },
    ]),
    "utf8",
  );
}

export function createCppAnotherTakePayload(
  source: RetainedPlannerRequest,
  seed: number,
): RetainedPlannerRequest {
  return {
    ...source,
    audio_codes: "",
    seed,
  };
}

export function shouldRetryCppAnotherTakePlanner(
  source: RetainedPlannerRequest,
  plannedLyrics: string,
  attempt: number,
) {
  return (
    source.lyrics === "" &&
    !hasGeneratedLyrics(plannedLyrics) &&
    attempt < CPP_ANOTHER_TAKE_PLANNER_ATTEMPT_LIMIT
  );
}

export function createCppServerEnvironment(
  runtimeRoot: string,
  workingRoot: string,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment = { ...source };
  for (const name of Object.keys(environment)) {
    if (name.startsWith("DYLD_")) {
      delete environment[name];
    }
  }
  return {
    ...environment,
    HOME: runtimeRoot,
    TMPDIR: workingRoot,
  };
}

export function createCppAnotherTakeSynthesisInput(
  plannerResult: Buffer,
  plannerCaption: string,
): Buffer {
  const plannedBatch = JSON.parse(
    plannerResult.toString("utf8"),
  ) as (CppPlannedRequest & Record<string, unknown>)[];
  const planned = plannedBatch[0];
  if (
    plannedBatch.length !== 1 ||
    !planned ||
    !plannerCaption.trim()
  ) {
    throw new Error(
      "The Q8 4B planner did not return one plan for another take.",
    );
  }
  return Buffer.from(
    JSON.stringify([{ ...planned, caption: plannerCaption }]),
    "utf8",
  );
}

export function createCppMusicService(options: {
  readonly aacEncoderPath?: string;
  readonly aceServerPath: string;
  readonly assertRuntimeReady?: () => Promise<void>;
  readonly helperSha256: string;
  readonly libraryRoot: string;
  readonly nativeCodeRoot: string;
  readonly runtimeRoot: string;
  readonly seedLibraryRoot?: string;
}): MusicService {
  const libraryRoot = path.resolve(options.libraryRoot);
  const runtime = resolveCppRuntimeLocations(options.runtimeRoot);
  const aceServerPath = path.resolve(options.aceServerPath);
  const nativeCodeRoot = path.resolve(options.nativeCodeRoot);
  const helperRelative = path.relative(nativeCodeRoot, aceServerPath);
  if (
    helperRelative === "" ||
    helperRelative === ".." ||
    helperRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(helperRelative)
  ) {
    throw new Error("ACE server escaped its immutable native-code root.");
  }
  const mutableRelative = path.relative(runtime.root, aceServerPath);
  if (
    mutableRelative === "" ||
    (!mutableRelative.startsWith("..") &&
      !path.isAbsolute(mutableRelative))
  ) {
    throw new Error("ACE server must not execute from Application Support.");
  }
  let generationQueue = Promise.resolve();
  let generationMemoryObserver:
    | ((event: GenerationMemoryEvent) => void)
    | undefined;
  let engineExitObserver:
    | ((event: MusicEngineExit) => void)
    | undefined;
  let initialization: Promise<void> | undefined;
  let intentionalShutdown = false;
  let metalObserved = false;
  let serverCommand: readonly string[] = [];
  let serverFailure: Error | undefined;
  let serverLog: WriteStream | undefined;
  let serverOutput = "";
  let serverPort: number | undefined;
  let serverProcess: ChildProcess | undefined;
  let serverProps: CppServerProps | undefined;
  let serverUrl: string | undefined;
  let strictPolicyObserved = false;
  const trackGenerationProofStorage = createTrackGenerationProofStorage({
    lastProofPath: path.join(runtime.root, "last-runtime-proof.json"),
    proofsRoot: runtime.proofs,
  });
  const library = createMusicLibrary({
    aacEncoderPath: options.aacEncoderPath,
    libraryRoot,
    seedLibraryRoot: options.seedLibraryRoot,
    trackGenerationProofStorage,
  });

  async function assertRuntimeInstalled(): Promise<void> {
    if (!options.assertRuntimeReady) {
      throw new Error(CPP_RUNTIME_NOT_INSTALLED);
    }
    try {
      await options.assertRuntimeReady();
    } catch {
      throw new Error(CPP_RUNTIME_NOT_INSTALLED);
    }
  }

  async function allocateLoopbackPort(): Promise<number> {
    return new Promise((resolvePort, reject) => {
      const server = createServer();
      server.unref();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          reject(new Error("Could not allocate a private C++ runtime port."));
          return;
        }
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolvePort(address.port);
        });
      });
    });
  }

  async function reachable(): Promise<boolean> {
    if (!serverUrl || !serverProcess) {
      return false;
    }
    return fetch(`${serverUrl}/health`, {
      signal: AbortSignal.timeout(1_000),
    }).then(
      async (response) => {
        if (!response.ok) {
          return false;
        }
        const health = (await response.json()) as { status?: string };
        return health.status === "ok";
      },
      () => false,
    );
  }

  function serverEnvironment(): NodeJS.ProcessEnv {
    return createCppServerEnvironment(runtime.root, runtime.working);
  }

  async function ensureServer(): Promise<void> {
    await assertRuntimeInstalled();
    if (await reachable()) {
      return;
    }

    const port = await allocateLoopbackPort();
    serverPort = port;
    serverUrl = `http://127.0.0.1:${port}`;
    await Promise.all([
      mkdir(runtime.logs, { recursive: true }),
      mkdir(runtime.proofs, { recursive: true }),
      mkdir(runtime.working, { recursive: true }),
    ]);
    intentionalShutdown = false;
    metalObserved = false;
    serverFailure = undefined;
    serverOutput = "";
    serverProps = undefined;
    strictPolicyObserved = false;
    serverCommand = [
      aceServerPath,
      "--models",
      runtime.models,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--max-batch",
      "1",
    ];
    if (serverCommand.includes("--keep-loaded")) {
      throw new Error("C++ runtime violated STRICT model swapping.");
    }
    serverLog = createWriteStream(runtime.serverLog, { flags: "a" });
    serverLog.write(
      `\n[Locomo Music cpp-q8 ${new Date().toISOString()} port=${port}]\n`,
    );
    serverProcess = spawn(serverCommand[0] ?? aceServerPath, [
      ...serverCommand.slice(1),
    ], {
      cwd: nativeCodeRoot,
      env: serverEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const capture = (chunk: Buffer) => {
      const text = chunk.toString();
      serverOutput = `${serverOutput}${text}`.slice(-4_000_000);
      strictPolicyObserved ||=
        text.includes("[Store] Created (policy=STRICT)");
      metalObserved ||=
        text.includes("ggml_metal_init") ||
        text.includes("backend: MTL0");
      serverLog?.write(text);
    };
    serverProcess.stdout?.on("data", capture);
    serverProcess.stderr?.on("data", capture);
    serverProcess.once("error", (cause) => {
      serverFailure = cause;
    });
    serverProcess.once("exit", (code, signal) => {
      if (!intentionalShutdown) {
        const event: MusicEngineExit = {
          ...(code === null ? {} : { exitCode: code }),
          ...(signal === null ? {} : { signal }),
        };
        serverFailure ??= new MusicEngineExitError(event);
        engineExitObserver?.(event);
      }
      serverProcess = undefined;
      serverUrl = undefined;
      serverPort = undefined;
      initialization = undefined;
      serverLog?.end();
      serverLog = undefined;
    });

    for (let attempt = 0; attempt < 600; attempt += 1) {
      await sleep(100);
      if (serverFailure || !serverProcess) {
        throw serverFailure ?? new Error("ACE-Step C++ exited at startup.");
      }
      if (await reachable()) {
        await verifyServerProps();
        if (!strictPolicyObserved) {
          throw new Error(
            "ACE-Step C++ did not prove STRICT model-store startup.",
          );
        }
        return;
      }
    }
    throw new Error("ACE-Step C++ did not start.");
  }

  async function verifyServerProps(): Promise<void> {
    if (!serverUrl) {
      throw new Error("The private C++ runtime is unavailable.");
    }
    const response = await fetch(`${serverUrl}/props`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error("ACE-Step C++ properties could not be read.");
    }
    const props = (await response.json()) as CppServerProps;
    const expected = {
      dit: SYNTH_MODEL,
      embedding: "Qwen3-Embedding-0.6B-Q8_0.gguf",
      lm: PLANNER_MODEL,
      vae: "vae-BF16.gguf",
    } as const;
    if (
      props.cli?.max_batch !== 1 ||
      !props.models?.dit?.includes(expected.dit) ||
      !props.models.embedding?.includes(expected.embedding) ||
      !props.models.lm?.includes(expected.lm) ||
      !props.models.vae?.includes(expected.vae)
    ) {
      throw new Error(
        "ACE-Step C++ did not expose the exact pinned Q8 model stack at batch 1.",
      );
    }
    serverProps = props;
  }

  async function submitJob(
    endpoint: "/lm" | "/synth",
    body: BodyInit,
    contentType?: string,
  ): Promise<string> {
    if (!serverUrl) {
      throw new Error("The private C++ runtime is unavailable.");
    }
    const response = await fetch(`${serverUrl}${endpoint}`, {
      method: "POST",
      headers: contentType ? { "content-type": contentType } : undefined,
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(
        `ACE-Step C++ ${endpoint} rejected the request (${response.status}): ${raw}`,
      );
    }
    const result = JSON.parse(raw) as { error?: string; id?: string };
    if (!result.id) {
      throw new Error(
        result.error || `ACE-Step C++ ${endpoint} returned no job ID.`,
      );
    }
    return result.id;
  }

  async function pollJob(jobID: string): Promise<void> {
    if (!serverUrl) {
      throw new Error("The private C++ runtime is unavailable.");
    }
    for (let attempt = 0; attempt < 14_400; attempt += 1) {
      const response = await fetch(
        `${serverUrl}/job?id=${encodeURIComponent(jobID)}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      const status = (await response.json()) as {
        error?: string;
        message?: string;
        status?: string;
      };
      if (status.status === "done") {
        return;
      }
      if (
        status.status === "failed" ||
        status.status === "cancelled"
      ) {
        throw new Error(
          status.error ||
            status.message ||
            `ACE-Step C++ job ${jobID} ${status.status}.`,
        );
      }
      await sleep(500);
    }
    throw new Error("ACE-Step C++ generation timed out.");
  }

  async function fetchJobResult(
    jobID: string,
    timeoutMilliseconds: number,
  ): Promise<Response> {
    if (!serverUrl) {
      throw new Error("The private C++ runtime is unavailable.");
    }
    const response = await fetch(
      `${serverUrl}/job?id=${encodeURIComponent(jobID)}&result=1`,
      { signal: AbortSignal.timeout(timeoutMilliseconds) },
    );
    if (!response.ok) {
      throw new Error(
        `ACE-Step C++ job result could not be read (${response.status}).`,
      );
    }
    return response;
  }

  function synthesisBody(
    input: MusicGenerationRequest,
    plannerResult: Buffer,
  ): { readonly body: BodyInit; readonly contentType?: string } {
    const source =
      input.mode === "cover" ? input.referenceAudio : input.sourceAudio;
    const reference =
      input.mode === "cover" ? input.referenceAudio : input.referenceAudio;
    if (input.mode === "cover" && !source) {
      throw new Error("ACE-Step C++ cover generation requires audio.");
    }
    if (input.mode === "extend" && !source) {
      throw new Error("ACE-Step C++ extension requires source audio.");
    }
    if (!source && !reference) {
      return {
        body: new Uint8Array(plannerResult),
        contentType: "application/json",
      };
    }

    const form = new FormData();
    form.append(
      "request",
      new Blob([new Uint8Array(plannerResult)], {
        type: "application/json",
      }),
      "request.json",
    );
    if (source) {
      form.append(
        "audio",
        new Blob([new Uint8Array(source.bytes)], {
          type: audioContentType(source.name),
        }),
        source.name,
      );
    }
    if (reference) {
      form.append(
        "ref_audio",
        new Blob([new Uint8Array(reference.bytes)], {
          type: audioContentType(reference.name),
        }),
        reference.name,
      );
    }
    return { body: form };
  }

  async function runGeneration(
    input: MusicGenerationRequest,
  ): Promise<MusicTrack> {
    await prepare();
    if (!serverProcess?.pid || !serverUrl || !serverPort) {
      throw new Error("The private C++ runtime is unavailable.");
    }
    const activeServerPID = serverProcess.pid;
    const activeServerPort = serverPort;

    const anotherTakeSourceID =
      input.reusePlannerCaptionFromTrackID;
    const anotherTakeSource = anotherTakeSourceID
      ? await readRetainedAnotherTakeSource({
          proofsRoot: runtime.proofs,
          prompt: input.prompt,
          trackID: anotherTakeSourceID,
        })
      : undefined;
    if (anotherTakeSourceID && !anotherTakeSource) {
      throw new Error(
        "The retained planner caption or source request proof is unavailable.",
      );
    }
    if (anotherTakeSource) {
      const sourceTrack = (await library.list()).find(
        (track) => track.id === anotherTakeSourceID,
      );
      if (
        !sourceTrack ||
        sourceTrack.categoryKey !== input.categoryKey ||
        sourceTrack.prompt !== input.prompt ||
        input.mode !== "create" ||
        input.duration !== anotherTakeSource.request.duration ||
        input.lyrics !==
          (anotherTakeSource.request.lyrics === ""
            ? "__AUTO__"
            : "") ||
        input.promptRecipeVersion !==
          anotherTakeSource.promptRecipeVersion
      ) {
        throw new Error(
          "Another take must exactly match its source song and proof.",
        );
      }
    }

    const trackID = crypto.randomUUID();
    const evidenceDirectory = path.join(runtime.proofs, trackID);
    await mkdir(evidenceDirectory, { recursive: true });
    const seed = randomInt(0, 0x1_0000_0000);
    const payload = anotherTakeSource
      ? createCppAnotherTakePayload(anotherTakeSource.request, seed)
      : createCppGenerationPayload(input, seed);
    const requestBytes = Buffer.from(
      `${JSON.stringify(payload)}\n`,
      "utf8",
    );
    const requestPath = path.join(evidenceDirectory, "lm-request.json");
    const lmResultPath = path.join(evidenceDirectory, "lm-result.json");
    const synthInputPath = path.join(
      evidenceDirectory,
      "synth-input.json",
    );
    await writeFile(requestPath, requestBytes);

    serverOutput = "";
    let memoryPeakBytes = 0;
    let sampling = true;
    // This proof sampler is also the live UI source; do not start a second
    // high-frequency footprint process for the status popover.
    const memorySampler = (async () => {
      while (sampling) {
        const currentBytes =
          await readProcessTreeMemoryBytes(activeServerPID);
        memoryPeakBytes = Math.max(memoryPeakBytes, currentBytes);
        generationMemoryObserver?.({
          type: "sample",
          bytes: currentBytes,
        });
        if (sampling) {
          await sleep(250);
        }
      }
    })();

    const startedAt = performance.now();
    let lmFinishedAt = startedAt;
    let synthFinishedAt = startedAt;
    let plannerResult = Buffer.alloc(0);
    let multipartBody = Buffer.alloc(0);
    let contentType = "";
    let lmJobID = "";
    let synthJobID = "";
    try {
      lmJobID = await submitJob(
        "/lm",
        new Uint8Array(requestBytes),
        "application/json",
      );
      await pollJob(lmJobID);
      const lmResponse = await fetchJobResult(lmJobID, 60_000);
      plannerResult = Buffer.from(await lmResponse.arrayBuffer());
      lmFinishedAt = performance.now();
      await writeFile(lmResultPath, plannerResult);
      const plannedBatch = JSON.parse(
        plannerResult.toString("utf8"),
      ) as CppPlannedRequest[];
      const planned = plannedBatch[0];
      if (
        plannedBatch.length !== 1 ||
        !planned ||
        !planned.audio_codes ||
        planned.seed !== seed
      ) {
        throw new Error(
          "The Q8 4B planner did not return one exact seeded audio-code plan.",
        );
      }
      // Lyrics On may legitimately resolve to an instrumental timeline.
      // A valid exact seeded plan is always synthesized after one planner pass.
      const expectedExactPlannerInput =
        !anotherTakeSource &&
        input.categoryKey !== EXISTING_INDIE_POP_CATEGORY_KEY;
      const synthesisInput = anotherTakeSource
        ? createCppAnotherTakeSynthesisInput(
            plannerResult,
            anotherTakeSource.plannerCaption,
          )
        : createCppSynthesisInput(input, plannerResult);
      await writeFile(synthInputPath, synthesisInput);
      const synthInput = await readFile(synthInputPath);
      if (
        synthInput.equals(plannerResult) !== expectedExactPlannerInput
      ) {
        throw new Error(
          "The Q8 planner-to-synthesis caption boundary was not preserved.",
        );
      }

      const synth = synthesisBody(input, synthInput);
      synthJobID = await submitJob(
        "/synth",
        synth.body,
        synth.contentType,
      );
      await pollJob(synthJobID);
      const synthResponse = await fetchJobResult(synthJobID, 180_000);
      contentType = synthResponse.headers.get("content-type") ?? "";
      multipartBody = Buffer.from(await synthResponse.arrayBuffer());
      synthFinishedAt = performance.now();
    } finally {
      sampling = false;
      await memorySampler;
    }

    const plannedBatch = JSON.parse(
      plannerResult.toString("utf8"),
    ) as CppPlannedRequest[];
    const planned = plannedBatch[0];
    if (!planned) {
      throw new Error("ACE-Step C++ returned no planner result.");
    }
    const generatedAudio = extractFirstAudioPart(
      contentType,
      multipartBody,
    );
    const preservedAudio =
      input.mode === "extend" && input.sourceAudio
        ? preserveTrackPrefix(
            input.sourceAudio.bytes,
            generatedAudio,
            input.sourceDuration ?? input.duration - 60,
          )
        : generatedAudio;
    const safety = applyWavFixedGain(
      preservedAudio,
      OUTPUT_HEADROOM_DECIBELS,
    );
    await sleep(100);
    const strictUnloadObserved = REQUIRED_STRICT_UNLOAD_MESSAGES.every(
      (message) => serverOutput.includes(message),
    );
    if (
      !strictPolicyObserved ||
      !strictUnloadObserved ||
      !metalObserved ||
      serverCommand.includes("--keep-loaded") ||
      serverProps?.cli?.max_batch !== 1
    ) {
      throw new Error(
        "ACE-Step C++ did not prove Metal, batch-1, STRICT stage unloading.",
      );
    }
    const idleMemoryBytes =
      await readProcessTreeMemoryBytes(activeServerPID);
    generationMemoryObserver?.({
      type: "sample",
      bytes: idleMemoryBytes,
    });

    const item: MusicTrackMetadata = {
      id: trackID,
      title: createGenerationTrackTitle({
        categoryKey: input.categoryKey,
        generatedLyrics: planned.lyrics,
        id: trackID,
        prompt: input.prompt,
        requestedLyrics: input.lyrics,
      }),
      categoryKey: input.categoryKey,
      prompt: input.prompt,
      remakeSourceTrackID: anotherTakeSourceID,
      lyrics:
        input.lyrics === "__AUTO__"
          ? planned.lyrics || "Generated vocals"
          : input.lyrics,
      duration: wavDurationSeconds(safety.audio),
      createdAt: Date.now(),
    };

    const lmResultSha256 = sha256(plannerResult);
    const synthInputSha256 = sha256(await readFile(synthInputPath));
    const synthesisCaptionSuffix =
      !anotherTakeSource &&
      input.categoryKey === EXISTING_INDIE_POP_CATEGORY_KEY
        ? INDIE_POP_SYNTHESIS_ENDING
        : undefined;
    const plannerOutputUsedExactly =
      lmResultSha256 === synthInputSha256;
    if (
      anotherTakeSource
        ? plannerOutputUsedExactly ||
          synthesisCaptionSuffix !== undefined
        : plannerOutputUsedExactly !==
          (synthesisCaptionSuffix === undefined)
    ) {
      throw new Error(
        "Planner proof does not match the synthesis caption boundary.",
      );
    }
    const storedItem = await library.storeGeneratedWav(
      item,
      safety.audio,
    );
    const generatedPath = library.trackPath(item.id);
    const proof: MusicRuntimeProof = {
      backendProfile: "cpp-q8",
      generatedAt: new Date().toISOString(),
      port: activeServerPort,
      sourceRevision: CPP_Q8_RUNTIME_MANIFEST.source.revision,
      mainModel: {
        path: path.join(runtime.models, SYNTH_MODEL),
        repository: CPP_Q8_RUNTIME_MANIFEST.models.repository,
        revision: CPP_Q8_RUNTIME_MANIFEST.models.revision,
      },
      planner: {
        backend: "gguf-q8",
        healthInitialized: true,
        loadedPathEvidence: `[Server] Loading LM: ${PLANNER_MODEL}`,
        path: path.join(runtime.models, PLANNER_MODEL),
        repository: CPP_Q8_RUNTIME_MANIFEST.models.repository,
        revision: CPP_Q8_RUNTIME_MANIFEST.models.revision,
      },
      request: {
        duration: payload.duration,
        inferenceSteps: payload.inference_steps,
        model: SYNTH_MODEL,
        promptRecipeVersion: input.promptRecipeVersion,
        sampleMode: input.lyrics === "__AUTO__",
        thinking: true,
        vocalLanguage: payload.vocal_language,
      },
      track: {
        id: item.id,
        path: generatedPath,
      },
      cppQ8: {
        audioSafety: {
          fixedGainDb: OUTPUT_HEADROOM_DECIBELS,
          outputFormat: "wav16",
          peakClip: 0,
          samplePeakAfter: safety.samplePeakAfter,
          samplePeakBefore: safety.samplePeakBefore,
        },
        evidenceDirectory,
        ggmlRevision: CPP_Q8_RUNTIME_MANIFEST.source.ggmlRevision,
        helperSha256: options.helperSha256,
        idleMemoryBytes,
        keepLoaded: false,
        lmResultPath,
        lmResultSha256,
        memoryPeakBytes,
        modelRevision: CPP_Q8_RUNTIME_MANIFEST.models.revision,
        plannerOutputUsedExactly,
        reusedPlannerCaptionFromTrackID: anotherTakeSourceID,
        seed,
        serverPid: activeServerPID,
        strictModelSwapping: true,
        strictUnloadObserved: true,
        synthesisCaptionSuffix,
        synthInputPath,
        synthInputSha256,
        timings: {
          endToEndSeconds: (synthFinishedAt - startedAt) / 1_000,
          plannerSeconds: (lmFinishedAt - startedAt) / 1_000,
          synthesisSeconds:
            (synthFinishedAt - lmFinishedAt) / 1_000,
        },
      },
    };
    await Promise.all([
      writeFile(
        path.join(evidenceDirectory, "proof.json"),
        `${JSON.stringify(proof, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(evidenceDirectory, "synth-result.json"),
        `${JSON.stringify(
          {
            audioSha256: sha256(safety.audio),
            contentType,
            lmJobID,
            multipartSha256: sha256(multipartBody),
            synthJobID,
          },
          null,
          2,
        )}\n`,
        "utf8",
      ),
      trackGenerationProofStorage.writeLastProof(proof),
    ]);
    return storedItem;
  }

  async function prepare(): Promise<void> {
    initialization ??= ensureServer().catch((error: unknown) => {
      initialization = undefined;
      throw error;
    });
    await initialization;
  }

  return {
    generate(input) {
      const result = generationQueue.then(async () => {
        generationMemoryObserver?.({ type: "started" });
        try {
          return await runGeneration(input);
        } finally {
          generationMemoryObserver?.({ type: "finished" });
        }
      });
      generationQueue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    list: () => library.list(),
    markPlayed: (id) => library.markPlayed(id),
    readPrompt: (id) => library.readPrompt(id),
    memoryBytes() {
      return readProcessTreeMemoryBytes(serverProcess?.pid);
    },
    observeGenerationMemory(observer) {
      generationMemoryObserver = observer;
      return () => {
        if (generationMemoryObserver === observer) {
          generationMemoryObserver = undefined;
        }
      };
    },
    observeEngineExit(observer) {
      engineExitObserver = observer;
      return () => {
        if (engineExitObserver === observer) {
          engineExitObserver = undefined;
        }
      };
    },
    prepare,
    read: (id) => library.read(id),
    delete: (id) => library.delete(id),
    setFavorite: (id, isFavorite) =>
      library.setFavorite(id, isFavorite),
    dispose() {
      intentionalShutdown = true;
      serverProcess?.kill("SIGTERM");
      serverProcess = undefined;
      serverUrl = undefined;
      serverPort = undefined;
      initialization = undefined;
      serverLog?.end();
      serverLog = undefined;
    },
    async getLastRuntimeProof() {
      try {
        return JSON.parse(
          await readFile(
            path.join(runtime.root, "last-runtime-proof.json"),
            "utf8",
          ),
        ) as MusicRuntimeProof;
      } catch {
        return undefined;
      }
    },
    trackPath: (id) => library.trackPath(id),
  };
}

export function extractFirstAudioPart(
  contentType: string,
  body: Buffer,
): Buffer {
  const boundary = contentType.match(
    /boundary=(?:"([^"]+)"|([^;\s]+))/iu,
  );
  const boundaryText = boundary?.[1] ?? boundary?.[2];
  if (!boundaryText) {
    throw new Error("ACE-Step C++ returned no multipart boundary.");
  }
  const delimiter = Buffer.from(`--${boundaryText}`);
  let cursor = body.indexOf(delimiter);
  while (cursor >= 0) {
    cursor += delimiter.length;
    if (body.subarray(cursor, cursor + 2).toString() === "--") {
      break;
    }
    if (body.subarray(cursor, cursor + 2).toString() === "\r\n") {
      cursor += 2;
    }
    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), cursor);
    if (headerEnd < 0) {
      break;
    }
    const headers = body
      .subarray(cursor, headerEnd)
      .toString("utf8")
      .toLowerCase();
    const payloadStart = headerEnd + 4;
    const nextBoundary = body.indexOf(
      Buffer.from(`\r\n--${boundaryText}`),
      payloadStart,
    );
    if (nextBoundary < 0) {
      break;
    }
    if (headers.includes("content-type: audio/")) {
      return Buffer.from(body.subarray(payloadStart, nextBoundary));
    }
    cursor = nextBoundary + 2;
  }
  throw new Error("ACE-Step C++ synthesis contained no audio part.");
}

export function applyWavFixedGain(
  source: Buffer,
  gainDecibels: number,
): {
  readonly audio: Buffer;
  readonly samplePeakAfter: number;
  readonly samplePeakBefore: number;
} {
  const audio = Buffer.from(source);
  const layout = readWavLayout(audio);
  if (layout.audioFormat !== 1 || ![16, 24, 32].includes(layout.bitsPerSample)) {
    throw new Error(
      "ACE-Step C++ safety gain requires integer PCM WAV audio.",
    );
  }
  const bytesPerSample = layout.bitsPerSample / 8;
  const magnitude = 2 ** (layout.bitsPerSample - 1);
  const gain = 10 ** (gainDecibels / 20);
  let samplePeakBefore = 0;
  let samplePeakAfter = 0;
  for (
    let offset = layout.dataOffset;
    offset + bytesPerSample <= layout.dataOffset + layout.dataSize;
    offset += bytesPerSample
  ) {
    const sample =
      bytesPerSample === 2
        ? audio.readInt16LE(offset)
        : bytesPerSample === 3
          ? audio.readIntLE(offset, 3)
          : audio.readInt32LE(offset);
    samplePeakBefore = Math.max(
      samplePeakBefore,
      Math.abs(sample) / magnitude,
    );
    const scaled = Math.max(
      -magnitude,
      Math.min(magnitude - 1, Math.round(sample * gain)),
    );
    samplePeakAfter = Math.max(
      samplePeakAfter,
      Math.abs(scaled) / magnitude,
    );
    if (bytesPerSample === 2) {
      audio.writeInt16LE(scaled, offset);
    } else if (bytesPerSample === 3) {
      audio.writeIntLE(scaled, offset, 3);
    } else {
      audio.writeInt32LE(scaled, offset);
    }
  }
  return { audio, samplePeakAfter, samplePeakBefore };
}

function preserveTrackPrefix(
  sourceBytes: ArrayBuffer,
  generated: Buffer,
  duration: number,
): Buffer {
  const source = Buffer.from(sourceBytes);
  const sourceLayout = readWavLayout(source);
  const generatedCopy = Buffer.from(generated);
  const generatedLayout = readWavLayout(generatedCopy);
  if (
    sourceLayout.byteRate !== generatedLayout.byteRate ||
    sourceLayout.blockAlign !== generatedLayout.blockAlign
  ) {
    throw new Error(
      "ACE-Step C++ changed the audio format while extending the song.",
    );
  }
  const prefixSize = Math.min(
    sourceLayout.dataSize,
    generatedLayout.dataSize,
    Math.floor((duration * sourceLayout.byteRate) / sourceLayout.blockAlign) *
      sourceLayout.blockAlign,
  );
  const crossfadeSize =
    sourceLayout.bitsPerSample === 16
      ? Math.min(sourceLayout.byteRate, prefixSize) -
        (Math.min(sourceLayout.byteRate, prefixSize) %
          sourceLayout.blockAlign)
      : 0;
  source.copy(
    generatedCopy,
    generatedLayout.dataOffset,
    sourceLayout.dataOffset,
    sourceLayout.dataOffset + prefixSize - crossfadeSize,
  );
  for (let offset = 0; offset < crossfadeSize; offset += 2) {
    const ratio = offset / crossfadeSize;
    const original = source.readInt16LE(
      sourceLayout.dataOffset + prefixSize - crossfadeSize + offset,
    );
    const continuation = generatedCopy.readInt16LE(
      generatedLayout.dataOffset + prefixSize - crossfadeSize + offset,
    );
    generatedCopy.writeInt16LE(
      Math.max(
        -32_768,
        Math.min(
          32_767,
          Math.round(original * (1 - ratio) + continuation * ratio),
        ),
      ),
      generatedLayout.dataOffset + prefixSize - crossfadeSize + offset,
    );
  }
  return generatedCopy;
}

function readWavLayout(source: Buffer) {
  if (
    source.toString("ascii", 0, 4) !== "RIFF" ||
    source.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("ACE-Step C++ returned an unsupported audio file.");
  }
  const chunks = Array.from(
    (function* readChunks() {
      for (let offset = 12; offset + 8 <= source.length; ) {
        const size = source.readUInt32LE(offset + 4);
        yield {
          id: source.toString("ascii", offset, offset + 4),
          offset,
          size,
          data: offset + 8,
        };
        offset += 8 + size + (size % 2);
      }
    })(),
  );
  const format = chunks.find((chunk) => chunk.id === "fmt ");
  const data = chunks.find((chunk) => chunk.id === "data");
  if (
    !format ||
    !data ||
    format.data + 16 > source.length ||
    data.data + data.size > source.length
  ) {
    throw new Error("ACE-Step C++ returned an unsupported WAV file.");
  }
  return {
    audioFormat: source.readUInt16LE(format.data),
    bitsPerSample: source.readUInt16LE(format.data + 14),
    blockAlign: source.readUInt16LE(format.data + 12),
    byteRate: source.readUInt32LE(format.data + 8),
    dataOffset: data.data,
    dataSize: data.size,
  };
}

function wavDurationSeconds(source: Buffer): number {
  const layout = readWavLayout(source);
  return layout.dataSize / layout.byteRate;
}

export function audioContentType(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  return extension === ".mp3"
    ? "audio/mpeg"
    : extension === ".m4a"
      ? "audio/mp4"
      : "audio/wav";
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
