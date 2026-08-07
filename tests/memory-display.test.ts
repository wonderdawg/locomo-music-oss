import { describe, expect, it } from "vitest";

import {
  CURRENT_MEMORY_EXPLANATION,
  memoryPopoverDisplay,
} from "../src/renderer/memory-display";

describe("memory popover display", () => {
  it("keeps the generation peak out of the current stacked-memory view", () => {
    const display = memoryPopoverDisplay({
      totalBytes: 64,
      availableBytes: 30,
      modelBytes: 1,
      generationActive: true,
      generationPeakBytes: 8,
    });

    expect(display).toMatchObject({
      availableBytes: 30,
      availableLabel: "Available",
      currentAIBytes: 1,
      currentAIStackBytes: 1,
      currentAILabel: "Locomo Music AI now",
      peakBytes: 8,
      peakLabel: "Active generation peak",
      residualBytes: 33,
      residualLabel: "Mac + other apps",
    });
    expect(
      display.residualBytes +
        display.currentAIStackBytes +
        display.availableBytes,
    ).toBe(64);
    expect(CURRENT_MEMORY_EXPLANATION).toContain(
      "free and reclaimable",
    );
    expect(CURRENT_MEMORY_EXPLANATION).toContain("remainder");
  });

  it("labels and retains the most recently completed generation peak", () => {
    const display = memoryPopoverDisplay({
      totalBytes: 64,
      availableBytes: 30,
      modelBytes: 1,
      generationActive: false,
      generationPeakBytes: 8,
    });

    expect(display.peakLabel).toBe("Last generation peak");
    expect(display.peakBytes).toBe(8);
  });

  it("shows sampling before the active generation has its first sample", () => {
    const display = memoryPopoverDisplay({
      totalBytes: 64,
      availableBytes: 30,
      modelBytes: 1,
      generationActive: true,
    });

    expect(display.peakBytes).toBeUndefined();
    expect(display.peakPlaceholder).toBe("Sampling…");
  });
});
