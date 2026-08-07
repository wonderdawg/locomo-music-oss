import type { RuntimeSetupStatus } from "../shared/app-contract";

export type MusicEngineState =
  | "checking"
  | "loading"
  | "ready"
  | "error";

export type MusicLibraryState = "loading" | "ready" | "error";

export type MusicGenerationWaitingState =
  | "setup"
  | "engine-loading";

export function isMusicGenerationAvailable(
  status: RuntimeSetupStatus | undefined,
  engine: MusicEngineState,
): boolean {
  return status?.ready === true && engine === "ready";
}

export function musicGenerationWaitingState(
  status: RuntimeSetupStatus | undefined,
  engine: MusicEngineState,
): MusicGenerationWaitingState | undefined {
  if (!status || status.phase === "checking") return "engine-loading";
  if (!status.ready) return "setup";
  return engine === "checking" || engine === "loading"
    ? "engine-loading"
    : undefined;
}

export function musicGenerationWaitingTitle(
  state: MusicGenerationWaitingState | undefined,
): string | undefined {
  if (state === "engine-loading") return "Starting music engine…";
  if (state === "setup") {
    return "Song generation will begin after setup.";
  }
  return undefined;
}

export function shouldMountStudio(
  library: MusicLibraryState,
): boolean {
  return library === "ready";
}

export function scheduleApplicationRevealAfterPaint(options: {
  readonly cancelFrame: (handle: number) => void;
  readonly requestFrame: (callback: FrameRequestCallback) => number;
  readonly reveal: () => void;
}): () => void {
  let active = true;
  let secondFrame: number | undefined;
  const firstFrame = options.requestFrame(() => {
    if (!active) return;
    secondFrame = options.requestFrame(() => {
      if (active) options.reveal();
    });
  });

  return () => {
    active = false;
    options.cancelFrame(firstFrame);
    if (secondFrame !== undefined) options.cancelFrame(secondFrame);
  };
}
