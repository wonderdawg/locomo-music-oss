import { readFile } from "node:fs/promises";
import path from "node:path";

import type { MusicTrackGenerationDetails } from "../shared/app-contract";
import { readRetainedAnotherTakeSource } from "./another-take-source";
import { isPathWithin } from "./storage";

const TRACK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function resolveTrackGenerationDetails(options: {
  readonly proofsRoot: string;
  readonly readPrompt: (trackID: string) => Promise<string | undefined>;
  readonly trackID: unknown;
}): Promise<MusicTrackGenerationDetails | undefined> {
  if (
    typeof options.trackID !== "string" ||
    !TRACK_ID_PATTERN.test(options.trackID)
  ) {
    return undefined;
  }

  const prompt = await options.readPrompt(options.trackID);
  if (prompt === undefined) return undefined;
  const [plannerCaption, proof, anotherTakeSource] = await Promise.all([
    readPlannerCaption(options.proofsRoot, options.trackID),
    readProofDetails(options.proofsRoot, options.trackID),
    readRetainedAnotherTakeSource({
      proofsRoot: options.proofsRoot,
      prompt,
      trackID: options.trackID,
    }),
  ]);

  return {
    anotherTake: anotherTakeSource
      ? {
          duration: anotherTakeSource.request.duration,
          instrumental:
            anotherTakeSource.request.lyrics === "[Instrumental]",
        }
      : null,
    plannerCaption,
    plannerModel: proof.plannerModel,
    prompt,
    promptRecipeVersion: proof.promptRecipeVersion,
  };
}

async function readProofDetails(
  proofsRoot: string,
  trackID: string,
): Promise<
  Pick<
    MusicTrackGenerationDetails,
    "plannerModel" | "promptRecipeVersion"
  >
> {
  const unavailable = {
    plannerModel: null,
    promptRecipeVersion: null,
  } as const;
  const root = path.resolve(proofsRoot);
  const proofDirectory = path.join(root, trackID);
  if (!isPathWithin(root, proofDirectory)) return unavailable;

  try {
    const proof = record(
      JSON.parse(
        await readFile(path.join(proofDirectory, "proof.json"), "utf8"),
      ) as unknown,
    );
    if (record(proof?.track)?.id !== trackID) return unavailable;
    const promptRecipeVersion = record(proof?.request)
      ?.promptRecipeVersion;
    const planner = record(proof?.planner);
    const backend = planner?.backend;
    const storedPath = planner?.path;
    const fileName =
      typeof storedPath === "string" ? path.basename(storedPath) : "";

    return {
      plannerModel:
        backend === "gguf-q8" && fileName
          ? { backend, fileName }
          : null,
      promptRecipeVersion:
        promptRecipeVersion === "custom" ||
        promptRecipeVersion === "v1" ||
        promptRecipeVersion === "v2.3"
          ? promptRecipeVersion
          : null,
    };
  } catch {
    return unavailable;
  }
}

async function readPlannerCaption(
  proofsRoot: string,
  trackID: string,
): Promise<string | null> {
  const root = path.resolve(proofsRoot);
  const proofDirectory = path.join(root, trackID);
  if (!isPathWithin(root, proofDirectory)) return null;

  try {
    const value = JSON.parse(
      await readFile(
        path.join(proofDirectory, "synth-input.json"),
        "utf8",
      ),
    ) as unknown;
    if (!Array.isArray(value) || value.length !== 1) return null;
    const planned = value[0];
    if (!planned || typeof planned !== "object") return null;
    const caption = (planned as Record<string, unknown>).caption;
    return typeof caption === "string" && caption.trim()
      ? caption
      : null;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}
