import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  applyWavFixedGain,
  audioContentType,
  CPP_ANOTHER_TAKE_PLANNER_ATTEMPT_LIMIT,
  createCppAnotherTakePayload,
  createCppAnotherTakeSynthesisInput,
  createCppGenerationPayload,
  createCppMusicService,
  createCppSynthesisInput,
  createCppServerEnvironment,
  extractFirstAudioPart,
  hasGeneratedLyrics,
  INDIE_POP_SYNTHESIS_ENDING,
  shouldRetryCppAnotherTakePlanner,
} from "../src/main/music-cpp";
import { MusicEngineExitError } from "../src/main/music";
import { locomoMusicGenres } from "../src/renderer/music-data";
import { createStationGenerationRequestForRecipe } from "../src/renderer/radio";
import { existingCategoryKeyForName } from "../src/shared/music-categories";

describe("ACE-Step C++ Q8 adapter", () => {
  it("retains only structured process evidence for the SIGABRT exit path", async () => {
    const error = new MusicEngineExitError({
      exitCode: 134,
      signal: "SIGABRT",
    });
    expect(error).toMatchObject({
      exitCode: 134,
      signal: "SIGABRT",
    });

    const source = await readFile(
      new URL("../src/main/music-cpp.ts", import.meta.url),
      "utf8",
    );
    const exitStart = source.indexOf(
      'serverProcess.once("exit", (code, signal) => {',
    );
    const exitEnd = source.indexOf(
      "for (let attempt = 0; attempt < 600;",
      exitStart,
    );
    const exitHandler = source.slice(exitStart, exitEnd);

    expect(exitHandler).toContain("new MusicEngineExitError(event)");
    expect(exitHandler).toContain("engineExitObserver?.(event)");
    expect(exitHandler).toContain("exitCode: code");
    expect(exitHandler).toContain("{ signal }");
    expect(exitHandler).not.toContain("serverOutput");
    expect(exitHandler).not.toContain("stderr");
  });

  it("uses mutable HOME/TMPDIR without allowing DYLD injection", () => {
    expect(
      createCppServerEnvironment("/profile/runtime", "/profile/working", {
        DYLD_LIBRARY_PATH: "/untrusted/copied-code",
        DYLD_INSERT_LIBRARIES: "/untrusted/injected.dylib",
        LANG: "en_US.UTF-8",
      }),
    ).toEqual({
      HOME: "/profile/runtime",
      LANG: "en_US.UTF-8",
      TMPDIR: "/profile/working",
    });
  });

  it("refuses to execute a legacy helper copied into Application Support", () => {
    expect(() =>
      createCppMusicService({
        aceServerPath: "/profile/runtime-cpp-q8/bin/ace-server",
        helperSha256: "legacy-helper-hash",
        libraryRoot: "/profile/library",
        nativeCodeRoot: "/profile/runtime-cpp-q8/bin",
        runtimeRoot: "/profile/runtime-cpp-q8",
      }),
    ).toThrow("must not execute from Application Support");
  });

  it("rejects planner timelines that contain directions but no lyrics", () => {
    expect(hasGeneratedLyrics("[Verse 1] [Instrumental]\n[Chorus] [Instrumental]")).toBe(false);
    expect(hasGeneratedLyrics("[Verse 1]\nOh yeah\n[Chorus]\nFeel the pulse")).toBe(true);
  });

  it("maps Lyrics On through the exact two-stage planner settings", () => {
    const payload = createCppGenerationPayload(
      {
        categoryKey: "existing/indie-pop",
        mode: "create",
        prompt: "Indie pop. Exact current station prompt.",
        lyrics: "__AUTO__",
        duration: 60,
      },
      730_001,
    );

    expect(payload).toMatchObject({
      audio_codes: "",
      bpm: 0,
      duration: 60,
      guidance_scale: 0,
      inference_steps: 8,
      keyscale: "",
      lm_batch_size: 1,
      lm_model: "acestep-5Hz-lm-4B-Q8_0.gguf",
      lm_mode: "generate",
      lyrics: "",
      output_format: "wav16",
      peak_clip: 0,
      seed: 730_001,
      shift: 0,
      solver: "euler",
      synth_batch_size: 1,
      synth_model: "acestep-v15-xl-turbo-Q8_0.gguf",
      task_type: "text2music",
      use_cot_caption: true,
      vocal_language: "en",
    });
  });

  it("routes vocal languages by category while preserving instrumental defaults", () => {
    const cases = [
      ["existing/latin-house", "__AUTO__", "es"],
      ["existing/latin-techno", "__AUTO__", "es"],
      ["existing/latin-trap", "__AUTO__", "es"],
      ["existing/bollywood-house", "__AUTO__", "hi"],
      ["existing/house", "__AUTO__", "en"],
      ["existing/latin-house", "", "en"],
      ["existing/latin-trap", "", "en"],
      ["existing/bollywood-house", "", "en"],
    ] as const;

    cases.forEach(([categoryKey, lyrics, vocalLanguage]) => {
      expect(
        createCppGenerationPayload(
          {
            categoryKey,
            mode: "create",
            prompt: "Exact station prompt.",
            lyrics,
            duration: 60,
          },
          730_010,
        ).vocal_language,
      ).toBe(vocalLanguage);
    });
  });

  it("passes the dedicated Lyrics Off Indie pop prompt unchanged to the planner", () => {
    const request = createStationGenerationRequestForRecipe(
      ["Indie pop"],
      true,
      2,
      "v2.3",
    )!;
    const payload = createCppGenerationPayload(request, 730_002);

    expect(payload).toMatchObject({
      caption: request.prompt,
      duration: 120,
      lm_model: "acestep-5Hz-lm-4B-Q8_0.gguf",
      lyrics: "[Instrumental]",
      seed: 730_002,
      use_cot_caption: true,
    });
    expect(payload.caption).toBe(
      "Instrumental indie pop song with clean, spacious high-fidelity production, natural dynamics, clear separation, and a polished full-range mix.",
    );
  });

  it("keeps the Indie pop /lm request byte-for-byte independent of the synthesis ending", () => {
    const request = createStationGenerationRequestForRecipe(
      ["Indie pop"],
      false,
      0,
      "v2.3",
    )!;
    const seed = 730_003;
    const plannerRequest = Buffer.from(
      `${JSON.stringify(createCppGenerationPayload(request, seed))}\n`,
      "utf8",
    );
    const existingPlannerRequest = Buffer.from(
      `${JSON.stringify(
        createCppGenerationPayload(
          {
            categoryKey: request.categoryKey,
            mode: request.mode,
            prompt: request.prompt,
            lyrics: request.lyrics,
            duration: request.duration,
            bpm: request.bpm,
          },
          seed,
        ),
      )}\n`,
      "utf8",
    );

    expect(plannerRequest).toEqual(existingPlannerRequest);
    expect(plannerRequest.toString("utf8")).not.toContain(
      INDIE_POP_SYNTHESIS_ENDING,
    );
  });

  it("adds the exact ending only to the Indie pop caption sent to /synth", () => {
    const request = createStationGenerationRequestForRecipe(
      ["Indie pop"],
      false,
      1,
      "v2.3",
    )!;
    const planned = {
      audio_codes: "101,202,303",
      bpm: 98,
      caption: "Planner-produced caption.",
      duration: 120,
      keyscale: "A minor",
      lm_seed: 730_004,
      lyrics: "[Verse]\nPlanner-produced lyrics",
      nested_evidence: {
        preserved: true,
      },
      seed: 730_004,
      timesignature: "4",
      vocal_language: "en",
    };
    const plannerBatch = [planned];
    const plannerResult = Buffer.from(
      `${JSON.stringify(plannerBatch, null, 2)}\n`,
      "utf8",
    );
    const originalPlannerResult = Buffer.from(plannerResult);
    const synthInput = createCppSynthesisInput(
      request,
      plannerResult,
    );
    const synthesisBatch = JSON.parse(
      synthInput.toString("utf8"),
    ) as typeof plannerBatch;

    expect(plannerResult).toEqual(originalPlannerResult);
    expect(synthesisBatch).toEqual([
      {
        ...planned,
        caption:
          `${planned.caption} ${INDIE_POP_SYNTHESIS_ENDING}`,
      },
    ]);

    expect(
      createCppSynthesisInput(
        {
          ...request,
          categoryKey: "experimental/minimal-alt-pop",
        },
        plannerResult,
      ),
    ).toBe(plannerResult);
  });

  it("passes a Lyrics On instrumental planner result to /synth byte-for-byte", () => {
    const plannerResult = Buffer.from(
      '[ { "caption": "Planner bytes stay exact.", "lyrics": "[Instrumental]", "audio_codes": "1,2,3" } ]\n',
      "utf8",
    );
    const stations = locomoMusicGenres
      .flatMap((genre) => genre.styles.map((style) => style.name))
      .filter((station) => station !== "Indie pop");

    stations.forEach((station) => {
      const synthInput = createCppSynthesisInput(
        {
          categoryKey: existingCategoryKeyForName(station)!,
          mode: "create",
          prompt: `Current ${station} station prompt.`,
          lyrics: "__AUTO__",
          duration: 120,
        },
        plannerResult,
      );

      expect(synthInput).toBe(plannerResult);
      expect(synthInput).toEqual(plannerResult);
    });
  });

  it("replans another take with a fresh seed and changes only its synthesis caption", () => {
    const retainedRequest = {
      audio_codes: "" as const,
      bpm: 104,
      caption: "Exact source prompt.",
      duration: 90,
      inference_steps: 8,
      keyscale: "A minor",
      lm_mode: "generate" as const,
      lm_model: "acestep-5Hz-lm-4B-Q8_0.gguf",
      lyrics: "" as const,
      seed: 101,
      synth_model: "acestep-v15-xl-turbo-Q8_0.gguf",
      task_type: "text2music" as const,
      timesignature: "4",
      use_cot_caption: true as const,
      vocal_language: "es",
      extra_setting: { preserved: true },
    };
    expect(
      createCppAnotherTakePayload(retainedRequest, 202),
    ).toEqual({
      ...retainedRequest,
      audio_codes: "",
      seed: 202,
    });

    const freshPlan = {
      audio_codes: "fresh-audio-codes",
      caption: "Fresh planner caption that must not reach synth.",
      lm_seed: 303,
      lyrics: "Fresh planner lyrics",
      nested_evidence: { preserved: true },
      seed: 202,
    };
    const synthesisInput = JSON.parse(
      createCppAnotherTakeSynthesisInput(
        Buffer.from(JSON.stringify([freshPlan]), "utf8"),
        "Exact retained final planner caption.",
      ).toString("utf8"),
    ) as unknown;

    expect(synthesisInput).toEqual([
      {
        ...freshPlan,
        caption: "Exact retained final planner caption.",
      },
    ]);
    expect(CPP_ANOTHER_TAKE_PLANNER_ATTEMPT_LIMIT).toBe(3);
    expect(
      shouldRetryCppAnotherTakePlanner(
        retainedRequest,
        "[Verse]\n[Instrumental]\n[Chorus]",
        1,
      ),
    ).toBe(true);
    expect(
      shouldRetryCppAnotherTakePlanner(
        retainedRequest,
        "[Verse]\nFresh real lyrics",
        1,
      ),
    ).toBe(false);
    expect(
      shouldRetryCppAnotherTakePlanner(
        retainedRequest,
        "[Verse]\n[Instrumental]",
        CPP_ANOTHER_TAKE_PLANNER_ATTEMPT_LIMIT,
      ),
    ).toBe(false);
    expect(
      shouldRetryCppAnotherTakePlanner(
        { ...retainedRequest, lyrics: "[Instrumental]" },
        "[Instrumental]",
        1,
      ),
    ).toBe(false);
  });

  it("isolates cover and extend API differences in the adapter", () => {
    const base = {
      categoryKey: "existing/house",
      prompt: "Current station prompt",
      lyrics: "__AUTO__",
      duration: 120,
    } as const;
    const cover = createCppGenerationPayload(
      { ...base, mode: "cover" },
      1,
    );
    const extend = createCppGenerationPayload(
      { ...base, mode: "extend", sourceDuration: 90 },
      2,
    );

    expect(cover).toMatchObject({
      audio_cover_strength: 1,
      task_type: "cover",
    });
    expect(extend).toMatchObject({
      repainting_end: 120,
      repainting_start: 85,
      task_type: "repaint",
    });
  });

  it("extracts the first audio part from a synth multipart response", () => {
    const boundary = "ace-batch-boundary";
    const audio = Buffer.from([1, 2, 3, 4]);
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: audio/wav\r\nContent-Disposition: attachment; filename="song.wav"\r\n\r\n`,
      ),
      audio,
      Buffer.from(
        `\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.from([9, 8, 7]),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    expect(
      extractFirstAudioPart(
        `multipart/mixed; boundary=${boundary}`,
        body,
      ),
    ).toEqual(audio);
  });

  it("uses the correct MIME type for M4A cover and extension inputs", () => {
    expect(audioContentType("new-song.m4a")).toBe("audio/mp4");
    expect(audioContentType("legacy-song.wav")).toBe("audio/wav");
    expect(audioContentType("reference.mp3")).toBe("audio/mpeg");
  });

  it("applies only a fixed -1 dB output gain to integer PCM", () => {
    const wav = createMonoWav16([32_767, -32_768, 16_384, 0]);
    const result = applyWavFixedGain(wav, -1);
    const dataOffset = 44;

    expect(result.samplePeakBefore).toBe(1);
    expect(result.samplePeakAfter).toBeCloseTo(10 ** (-1 / 20), 4);
    expect(result.audio.readInt16LE(dataOffset)).toBe(29_204);
    expect(result.audio.readInt16LE(dataOffset + 2)).toBe(-29_205);
    expect(result.audio.subarray(0, dataOffset)).toEqual(
      wav.subarray(0, dataOffset),
    );
  });
});

function createMonoWav16(samples: readonly number[]): Buffer {
  const audioBytes = samples.length * 2;
  const wav = Buffer.alloc(44 + audioBytes);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(48_000, 24);
  wav.writeUInt32LE(96_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(audioBytes, 40);
  samples.forEach((sample, index) => {
    wav.writeInt16LE(sample, 44 + index * 2);
  });
  return wav;
}
