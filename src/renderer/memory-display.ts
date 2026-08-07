import type { MemoryStatus } from "../shared/app-contract";

export const MEMORY_DISPLAY_LABELS = {
  activePeak: "Active generation peak",
  available: "Available",
  currentAI: "Locomo Music AI now",
  lastPeak: "Last generation peak",
  residual: "Mac + other apps",
} as const;

export const CURRENT_MEMORY_EXPLANATION =
  "Current stack only. Available includes free and reclaimable memory; Mac + other apps is the remainder outside the AI process tree.";

export function memoryPopoverDisplay(
  status: Pick<
    MemoryStatus,
    | "availableBytes"
    | "generationActive"
    | "generationPeakBytes"
    | "modelBytes"
    | "totalBytes"
  >,
) {
  const totalBytes = Math.max(0, status.totalBytes);
  const availableBytes = Math.min(
    totalBytes,
    Math.max(0, status.availableBytes),
  );
  const currentAIBytes = Math.max(0, status.modelBytes);
  const currentAIStackBytes = Math.min(
    currentAIBytes,
    Math.max(0, totalBytes - availableBytes),
  );

  return {
    availableBytes,
    availableLabel: MEMORY_DISPLAY_LABELS.available,
    currentAIBytes,
    currentAIStackBytes,
    currentAILabel: MEMORY_DISPLAY_LABELS.currentAI,
    peakBytes: status.generationPeakBytes,
    peakLabel: status.generationActive
      ? MEMORY_DISPLAY_LABELS.activePeak
      : MEMORY_DISPLAY_LABELS.lastPeak,
    peakPlaceholder: status.generationActive
      ? "Sampling…"
      : "Not measured",
    residualBytes:
      totalBytes - availableBytes - currentAIStackBytes,
    residualLabel: MEMORY_DISPLAY_LABELS.residual,
  };
}
