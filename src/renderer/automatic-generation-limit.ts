import type { MusicCategoryKey } from "../shared/music-categories";

export const AUTOMATIC_GENERATION_LIMIT_STORAGE_KEY =
  "locomo-music:automatic-generation-limit-v1";
export const DEFAULT_AUTOMATIC_GENERATION_LIMIT = 10;
export const MIN_AUTOMATIC_GENERATION_LIMIT = 1;
export const MAX_AUTOMATIC_GENERATION_LIMIT = 100;

type AutomaticGenerationLimitStorage = Pick<
  Storage,
  "getItem" | "setItem"
>;

export type AutomaticGenerationCompletionSource =
  | "another-take"
  | "continuous"
  | "overnight"
  | "remake";

export interface AutomaticGenerationRunSnapshot {
  readonly categoryKey: MusicCategoryKey;
  readonly id: number;
  readonly limit: number;
  readonly status: "limit-reached" | "running";
  readonly successfulSongs: number;
}

export interface AutomaticGenerationCompletionResult {
  readonly counted: boolean;
  readonly limitReached: boolean;
  readonly run: AutomaticGenerationRunSnapshot | undefined;
}

export interface AutomaticGenerationRunController {
  canEnqueue(input: {
    readonly categoryKey: MusicCategoryKey;
    readonly runID: number;
  }): boolean;
  recordCompletion(input: {
    readonly categoryKey: MusicCategoryKey;
    readonly runID?: number;
    readonly source: AutomaticGenerationCompletionSource;
    readonly succeeded: boolean;
  }): AutomaticGenerationCompletionResult;
  snapshot(): AutomaticGenerationRunSnapshot | undefined;
  start(
    categoryKey: MusicCategoryKey,
    limit: number,
  ): AutomaticGenerationRunSnapshot;
  stop(): void;
}

export function validateAutomaticGenerationLimit(
  value: unknown,
): number | undefined {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(numeric) &&
    numeric >= MIN_AUTOMATIC_GENERATION_LIMIT &&
    numeric <= MAX_AUTOMATIC_GENERATION_LIMIT
    ? numeric
    : undefined;
}

export function readAutomaticGenerationLimit(
  storage: Pick<AutomaticGenerationLimitStorage, "getItem">,
): number {
  try {
    return (
      validateAutomaticGenerationLimit(
        storage.getItem(AUTOMATIC_GENERATION_LIMIT_STORAGE_KEY),
      ) ?? DEFAULT_AUTOMATIC_GENERATION_LIMIT
    );
  } catch {
    return DEFAULT_AUTOMATIC_GENERATION_LIMIT;
  }
}

export function writeAutomaticGenerationLimit(
  storage: Pick<AutomaticGenerationLimitStorage, "setItem">,
  value: unknown,
): number {
  const validated = validateAutomaticGenerationLimit(value);
  if (validated === undefined) {
    throw new RangeError(
      `Automatic generation limit must be a whole number from ${MIN_AUTOMATIC_GENERATION_LIMIT} to ${MAX_AUTOMATIC_GENERATION_LIMIT}.`,
    );
  }
  storage.setItem(
    AUTOMATIC_GENERATION_LIMIT_STORAGE_KEY,
    String(validated),
  );
  return validated;
}

export function createAutomaticGenerationRunController(options?: {
  readonly onChange?: (
    run: AutomaticGenerationRunSnapshot | undefined,
  ) => void;
}): AutomaticGenerationRunController {
  let current: AutomaticGenerationRunSnapshot | undefined;
  let nextID = 0;

  const publish = () => options?.onChange?.(current);

  return {
    canEnqueue(input) {
      return Boolean(
        current &&
          current.id === input.runID &&
          current.categoryKey === input.categoryKey &&
          current.status === "running" &&
          current.successfulSongs < current.limit,
      );
    },
    recordCompletion(input) {
      if (
        !input.succeeded ||
        input.source !== "continuous" ||
        input.runID === undefined ||
        !current ||
        current.id !== input.runID ||
        current.categoryKey !== input.categoryKey ||
        current.status !== "running"
      ) {
        return {
          counted: false,
          limitReached: current?.status === "limit-reached",
          run: current,
        };
      }

      const successfulSongs = current.successfulSongs + 1;
      const limitReached = successfulSongs >= current.limit;
      current = {
        ...current,
        status: limitReached ? "limit-reached" : "running",
        successfulSongs,
      };
      publish();
      return { counted: true, limitReached, run: current };
    },
    snapshot() {
      return current;
    },
    start(categoryKey, limit) {
      const validated = validateAutomaticGenerationLimit(limit);
      if (validated === undefined) {
        throw new RangeError("Invalid automatic generation limit.");
      }
      current = {
        categoryKey,
        id: ++nextID,
        limit: validated,
        status: "running",
        successfulSongs: 0,
      };
      publish();
      return current;
    },
    stop() {
      if (!current) return;
      current = undefined;
      publish();
    },
  };
}
