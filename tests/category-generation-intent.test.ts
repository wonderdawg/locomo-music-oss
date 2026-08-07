import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createCategoryGenerationIntentGate } from "../src/renderer/radio";

describe("explicit category generation intent", () => {
  it("does nothing when readiness arrives without a user selection", () => {
    const intent = createCategoryGenerationIntentGate();

    expect(
      intent.admitOnReadiness({
        categoryKey: "existing/future-french-house",
        generationAvailable: true,
      }),
    ).toBe(false);
  });

  it("admits one generation after an explicit pre-ready selection", () => {
    const intent = createCategoryGenerationIntentGate();

    expect(
      intent.noteSelection({
        generationAvailable: false,
        shouldGenerate: true,
      }),
    ).toBe(false);
    expect(
      intent.admitOnReadiness({
        categoryKey: "existing/future-french-house",
        generationAvailable: true,
      }),
    ).toBe(true);
    expect(
      intent.admitOnReadiness({
        categoryKey: "existing/future-french-house",
        generationAvailable: true,
      }),
    ).toBe(false);
  });

  it("clears and re-arms pending intent with normal Stop/Start semantics", () => {
    const intent = createCategoryGenerationIntentGate();

    intent.noteSelection({
      generationAvailable: false,
      shouldGenerate: true,
    });
    intent.clear();
    expect(
      intent.admitOnReadiness({
        categoryKey: "existing/future-french-house",
        generationAvailable: true,
      }),
    ).toBe(false);

    intent.noteSelection({
      generationAvailable: false,
      shouldGenerate: true,
    });
    expect(
      intent.admitOnReadiness({
        categoryKey: "existing/future-french-house",
        generationAvailable: true,
      }),
    ).toBe(true);
  });

  it("admits an explicit post-ready selection immediately", () => {
    const intent = createCategoryGenerationIntentGate();

    expect(
      intent.noteSelection({
        generationAvailable: true,
        shouldGenerate: true,
      }),
    ).toBe(true);
  });

  it("does not couple readiness admission to audio playback", async () => {
    const source = await readFile(
      new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
      "utf8",
    );
    const effectStart = source.indexOf(
      "categoryGenerationIntent.admitOnReadiness",
    );
    const effectEnd = source.indexOf("const toggleAutoCreate", effectStart);
    const effect = source.slice(effectStart, effectEnd);

    expect(effectStart).toBeGreaterThanOrEqual(0);
    expect(effect).toContain("generate()");
    expect(effect).not.toContain("play(");
    expect(effect).not.toContain("audio");
    expect(effect).not.toContain("setPlaying");
  });

  it("uses the normal pending Stop/Start control and readiness heading", async () => {
    const source = await readFile(
      new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("generationWaitingTitle()");
    expect(source).toContain("categoryGenerationPending()");
    expect(source).toContain("generationToggleActive()");
    expect(source).not.toContain('"Cancel"');
    expect(source).not.toContain('"Pause generation"');
  });
});
