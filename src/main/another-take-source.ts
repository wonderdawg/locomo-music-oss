import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  assertMusicGenerationDurationSeconds,
  type MusicPromptRecipeVersion,
} from "../shared/app-contract";
import { isPathWithin } from "./storage";

const TRACK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type RetainedPlannerRequest = Record<string, unknown> & {
  readonly audio_codes: "";
  readonly bpm: number;
  readonly caption: string;
  readonly duration: number;
  readonly inference_steps: number;
  readonly keyscale: string;
  readonly lm_mode: "generate";
  readonly lm_model: string;
  readonly lyrics: "" | "[Instrumental]";
  readonly seed: number;
  readonly synth_model: string;
  readonly task_type: "text2music";
  readonly timesignature: string;
  readonly use_cot_caption: true;
  readonly vocal_language: string;
};

export interface RetainedAnotherTakeSource {
  readonly plannerCaption: string;
  readonly promptRecipeVersion: MusicPromptRecipeVersion | undefined;
  readonly request: RetainedPlannerRequest;
}

export async function readRetainedAnotherTakeSource(options: {
  readonly proofsRoot: string;
  readonly prompt: string;
  readonly trackID: string;
}): Promise<RetainedAnotherTakeSource | undefined> {
  if (!TRACK_ID_PATTERN.test(options.trackID)) return undefined;
  const root = path.resolve(options.proofsRoot);
  const proofDirectory = path.join(root, options.trackID);
  if (!isPathWithin(root, proofDirectory)) return undefined;

  try {
    const [proofBytes, requestBytes, synthInputBytes] =
      await Promise.all([
        readFile(path.join(proofDirectory, "proof.json")),
        readFile(path.join(proofDirectory, "lm-request.json")),
        readFile(path.join(proofDirectory, "synth-input.json")),
      ]);
    const proof = record(JSON.parse(proofBytes.toString("utf8")));
    const proofRequest = record(proof?.request);
    const cpp = record(proof?.cppQ8);
    const request = record(
      JSON.parse(requestBytes.toString("utf8")) as unknown,
    );
    const synthInput = JSON.parse(
      synthInputBytes.toString("utf8"),
    ) as unknown;
    const planned =
      Array.isArray(synthInput) && synthInput.length === 1
        ? record(synthInput[0])
        : undefined;
    const promptRecipeVersion = proofRequest?.promptRecipeVersion;
    if (
      proof?.backendProfile !== "cpp-q8" ||
      record(proof?.track)?.id !== options.trackID ||
      record(proof?.planner)?.backend !== "gguf-q8" ||
      cpp?.synthInputSha256 !== sha256(synthInputBytes) ||
      request?.caption !== options.prompt ||
      (request?.lyrics !== "" &&
        request?.lyrics !== "[Instrumental]") ||
      typeof request?.duration !== "number" ||
      typeof request?.bpm !== "number" ||
      typeof request?.keyscale !== "string" ||
      typeof request?.timesignature !== "string" ||
      typeof request?.vocal_language !== "string" ||
      typeof request?.seed !== "number" ||
      !Number.isInteger(request.seed) ||
      request.seed < 0 ||
      request.seed > 0xffff_ffff ||
      request?.audio_codes !== "" ||
      request?.task_type !== "text2music" ||
      request?.lm_mode !== "generate" ||
      request?.use_cot_caption !== true ||
      typeof request?.inference_steps !== "number" ||
      typeof request?.lm_model !== "string" ||
      typeof request?.synth_model !== "string" ||
      proofRequest?.duration !== request.duration ||
      proofRequest?.inferenceSteps !== request.inference_steps ||
      proofRequest?.model !== request.synth_model ||
      proofRequest?.sampleMode !== (request.lyrics === "") ||
      proofRequest?.thinking !== true ||
      proofRequest?.vocalLanguage !== request.vocal_language ||
      !planned ||
      typeof planned.caption !== "string" ||
      !planned.caption.trim() ||
      typeof planned.audio_codes !== "string" ||
      !planned.audio_codes.trim() ||
      (promptRecipeVersion !== undefined &&
        promptRecipeVersion !== "custom" &&
        promptRecipeVersion !== "v1" &&
        promptRecipeVersion !== "v2.3")
    ) {
      return undefined;
    }
    assertMusicGenerationDurationSeconds(request.duration);

    return {
      plannerCaption: planned.caption,
      promptRecipeVersion,
      request: request as RetainedPlannerRequest,
    };
  } catch {
    return undefined;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
