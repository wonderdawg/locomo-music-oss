import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveTrackGenerationDetails } from "../src/main/track-generation-details";

const TRACK_ID = "b4c382fa-288b-4fe4-936f-664f764c591a";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) =>
        rm(directory, { force: true, recursive: true }),
      ),
  );
});

describe("track generation details", () => {
  it("returns only the exact stored prompt and final planner caption", async () => {
    const proofsRoot = await mkdtemp(
      path.join(os.tmpdir(), "locomo-track-details-"),
    );
    temporaryDirectories.push(proofsRoot);
    await mkdir(path.join(proofsRoot, TRACK_ID));
    const synthInput = JSON.stringify([
      {
        audio_codes: "1,2,3",
        caption: "  Final planner caption.  ",
        lyrics: "internal lyrics",
        seed: 42,
      },
    ]);
    await writeFile(
      path.join(proofsRoot, TRACK_ID, "synth-input.json"),
      synthInput,
    );
    await writeFile(
      path.join(proofsRoot, TRACK_ID, "lm-request.json"),
      JSON.stringify({
        audio_codes: "",
        bpm: 104,
        caption: "  Exact stored prompt.  ",
        duration: 60,
        inference_steps: 8,
        keyscale: "A minor",
        lm_mode: "generate",
        lm_model: "acestep-5Hz-lm-4B-Q8_0.gguf",
        lyrics: "",
        seed: 42,
        synth_model: "acestep-v15-xl-turbo-Q8_0.gguf",
        task_type: "text2music",
        timesignature: "4",
        use_cot_caption: true,
        vocal_language: "en",
      }),
    );
    await writeFile(
      path.join(proofsRoot, TRACK_ID, "proof.json"),
      JSON.stringify({
        backendProfile: "cpp-q8",
        cppQ8: {
          synthInputSha256: createHash("sha256")
            .update(synthInput)
            .digest("hex"),
        },
        planner: {
          backend: "gguf-q8",
          path: "/private/acestep-5Hz-lm-4B-Q8_0.gguf",
        },
        request: {
          duration: 60,
          inferenceSteps: 8,
          model: "acestep-v15-xl-turbo-Q8_0.gguf",
          promptRecipeVersion: "v2.3",
          sampleMode: true,
          thinking: true,
          vocalLanguage: "en",
        },
        track: { id: TRACK_ID },
      }),
    );

    await expect(
      resolveTrackGenerationDetails({
        proofsRoot,
        readPrompt: async () => "  Exact stored prompt.  ",
        trackID: TRACK_ID,
      }),
    ).resolves.toEqual({
      anotherTake: {
        duration: 60,
        instrumental: false,
      },
      plannerCaption: "  Final planner caption.  ",
      plannerModel: {
        backend: "gguf-q8",
        fileName: "acestep-5Hz-lm-4B-Q8_0.gguf",
      },
      prompt: "  Exact stored prompt.  ",
      promptRecipeVersion: "v2.3",
    });
  });

  it("uses the unavailable fallback for missing or malformed proof data", async () => {
    const proofsRoot = await mkdtemp(
      path.join(os.tmpdir(), "locomo-track-details-"),
    );
    temporaryDirectories.push(proofsRoot);

    await expect(
      resolveTrackGenerationDetails({
        proofsRoot,
        readPrompt: async () => "Stored prompt.",
        trackID: TRACK_ID,
      }),
    ).resolves.toEqual({
      anotherTake: null,
      plannerCaption: null,
      plannerModel: null,
      prompt: "Stored prompt.",
      promptRecipeVersion: null,
    });

    await mkdir(path.join(proofsRoot, TRACK_ID));
    await writeFile(
      path.join(proofsRoot, TRACK_ID, "synth-input.json"),
      JSON.stringify([{ caption: "" }, { caption: "extra" }]),
    );
    await writeFile(
      path.join(proofsRoot, TRACK_ID, "proof.json"),
      JSON.stringify({
        planner: {
          backend: "gguf-q8",
          path: "/private/acestep-5Hz-lm-4B-Q8_0.gguf",
        },
        request: {},
        track: { id: TRACK_ID },
      }),
    );

    await expect(
      resolveTrackGenerationDetails({
        proofsRoot,
        readPrompt: async () => "Stored prompt.",
        trackID: TRACK_ID,
      }),
    ).resolves.toEqual({
      anotherTake: null,
      plannerCaption: null,
      plannerModel: {
        backend: "gguf-q8",
        fileName: "acestep-5Hz-lm-4B-Q8_0.gguf",
      },
      prompt: "Stored prompt.",
      promptRecipeVersion: null,
    });
  });

  it("rejects invalid and unknown track IDs before reading proof data", async () => {
    const readPrompt = vi.fn(async () => "Stored prompt.");

    await expect(
      resolveTrackGenerationDetails({
        proofsRoot: "/proofs",
        readPrompt,
        trackID: "../not-a-track",
      }),
    ).resolves.toBeUndefined();
    expect(readPrompt).not.toHaveBeenCalled();

    await expect(
      resolveTrackGenerationDetails({
        proofsRoot: "/proofs",
        readPrompt,
        trackID: 42,
      }),
    ).resolves.toBeUndefined();
    expect(readPrompt).not.toHaveBeenCalled();

    await expect(
      resolveTrackGenerationDetails({
        proofsRoot: "/proofs",
        readPrompt: async () => undefined,
        trackID: TRACK_ID,
      }),
    ).resolves.toBeUndefined();
  });
});
