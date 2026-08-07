import type { OvernightSystemStatus } from "../shared/app-contract";
import type { MusicCategoryKey } from "../shared/music-categories";

export type OvernightQueueSource =
  | "another-take"
  | "continuous"
  | "overnight";

export const OVERNIGHT_BATCH_STORAGE_KEY =
  "locomo-music:overnight-batch:v1";
export const OVERNIGHT_BATCH_TARGET_PER_CATEGORY = 5;
export const OVERNIGHT_IDLE_THRESHOLD_SECONDS = 15 * 60;

export interface OvernightCategoryCandidate {
  readonly key: string;
  readonly kind: "category" | "favorites";
  readonly name: string;
}

export interface OvernightBatchCategoryProgress {
  readonly completed: number;
  readonly failedAttempts: number;
  readonly key: MusicCategoryKey;
  readonly name: string;
}

export interface OvernightBatchPendingItem {
  readonly categoryKey: MusicCategoryKey;
  readonly failedOnce: boolean;
  readonly inFlight: boolean;
  readonly ownerSessionID?: string;
}

export interface OvernightBatchFailure {
  readonly categoryKey: MusicCategoryKey;
  readonly categoryName: string;
  readonly disposition: "recovered" | "retrying" | "skipped";
  readonly failedAt: number;
  readonly message: string;
}

export interface OvernightBatchStateV1 {
  readonly categories: readonly OvernightBatchCategoryProgress[];
  readonly createdAt: number;
  readonly cursor: number;
  readonly id: string;
  readonly lastFailure?: OvernightBatchFailure;
  readonly pending?: OvernightBatchPendingItem;
  readonly status: "armed" | "completed";
  readonly targetPerCategory: typeof OVERNIGHT_BATCH_TARGET_PER_CATEGORY;
  readonly updatedAt: number;
  readonly version: 1;
}

export interface OvernightBatchProgress {
  readonly completed: number;
  readonly failedAttempts: number;
  readonly total: number;
}

export interface OvernightSchedulingPlan {
  readonly admitOvernight: boolean;
  readonly discardQueuedContinuous: boolean;
  readonly interruptActiveGeneration: false;
  readonly suppressContinuous: boolean;
}

type OvernightStorage = Pick<
  Storage,
  "getItem" | "removeItem" | "setItem"
>;

export function snapshotOvernightBatchCategories(
  candidates: readonly OvernightCategoryCandidate[],
  canGenerate: (key: MusicCategoryKey) => boolean,
): Pick<OvernightBatchCategoryProgress, "key" | "name">[] {
  const seen = new Set<MusicCategoryKey>();
  const snapshot: Pick<
    OvernightBatchCategoryProgress,
    "key" | "name"
  >[] = [];

  for (const candidate of candidates) {
    if (
      candidate.kind !== "category" ||
      !candidate.key.startsWith("existing/")
    ) {
      continue;
    }
    const key = candidate.key as MusicCategoryKey;
    if (seen.has(key)) continue;
    let generatable = false;
    try {
      generatable = canGenerate(key);
    } catch {
      generatable = false;
    }
    if (!generatable) continue;
    seen.add(key);
    snapshot.push({ key, name: candidate.name });
  }

  return snapshot;
}

export function createOvernightBatch(
  snapshot: readonly Pick<
    OvernightBatchCategoryProgress,
    "key" | "name"
  >[],
  id: string,
  now: number,
): OvernightBatchStateV1 {
  if (snapshot.length === 0) {
    throw new Error("No visible Existing categories can be generated.");
  }

  return {
    categories: snapshot.map((category) => ({
      ...category,
      completed: 0,
      failedAttempts: 0,
    })),
    createdAt: now,
    cursor: 0,
    id,
    status: "armed",
    targetPerCategory: OVERNIGHT_BATCH_TARGET_PER_CATEGORY,
    updatedAt: now,
    version: 1,
  };
}

export function readOvernightBatch(
  storage: Pick<OvernightStorage, "getItem">,
): OvernightBatchStateV1 | undefined {
  try {
    const raw = storage.getItem(OVERNIGHT_BATCH_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isOvernightBatchStateV1(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeOvernightBatch(
  storage: OvernightStorage,
  state: OvernightBatchStateV1 | undefined,
): void {
  if (!state) {
    storage.removeItem(OVERNIGHT_BATCH_STORAGE_KEY);
    return;
  }
  storage.setItem(OVERNIGHT_BATCH_STORAGE_KEY, JSON.stringify(state));
}

export function recoverInterruptedOvernightBatch(
  state: OvernightBatchStateV1,
  ownerSessionID: string,
  now: number,
): OvernightBatchStateV1 {
  if (
    !state.pending?.inFlight ||
    state.pending.ownerSessionID === ownerSessionID
  ) {
    return state;
  }

  return {
    ...state,
    pending: {
      categoryKey: state.pending.categoryKey,
      failedOnce: state.pending.failedOnce,
      inFlight: false,
    },
    updatedAt: now,
  };
}

export function prepareNextOvernightItem(
  state: OvernightBatchStateV1,
  now: number,
): OvernightBatchStateV1 {
  if (state.status !== "armed" || state.pending) return state;
  const index = findNextIncompleteCategoryIndex(state);
  if (index < 0) return completeOvernightBatch(state, now);
  const category = state.categories[index];
  if (!category) return state;

  return {
    ...state,
    cursor: index,
    pending: {
      categoryKey: category.key,
      failedOnce: false,
      inFlight: false,
    },
    updatedAt: now,
  };
}

export function beginOvernightAttempt(
  state: OvernightBatchStateV1,
  ownerSessionID: string,
  now: number,
): OvernightBatchStateV1 {
  if (state.status !== "armed" || !state.pending) return state;
  return {
    ...state,
    pending: {
      ...state.pending,
      inFlight: true,
      ownerSessionID,
    },
    updatedAt: now,
  };
}

export function completeOvernightAttempt(
  state: OvernightBatchStateV1,
  categoryKey: MusicCategoryKey,
  now: number,
): OvernightBatchStateV1 {
  if (
    state.status !== "armed" ||
    state.pending?.categoryKey !== categoryKey
  ) {
    return state;
  }
  const completedIndex = state.categories.findIndex(
    (category) => category.key === categoryKey,
  );
  if (completedIndex < 0) return state;

  const categories = state.categories.map((category, index) =>
    index === completedIndex
      ? {
          ...category,
          completed: Math.min(
            state.targetPerCategory,
            category.completed + 1,
          ),
        }
      : category,
  );
  const next: OvernightBatchStateV1 = {
    ...state,
    categories,
    cursor: (completedIndex + 1) % categories.length,
    lastFailure:
      state.pending.failedOnce &&
      state.lastFailure?.categoryKey === categoryKey &&
      state.lastFailure.disposition === "retrying"
        ? { ...state.lastFailure, disposition: "recovered" }
        : state.lastFailure,
    pending: undefined,
    updatedAt: now,
  };

  return categories.every(
    (category) => category.completed >= state.targetPerCategory,
  )
    ? completeOvernightBatch(next, now)
    : next;
}

export function failOvernightAttempt(
  state: OvernightBatchStateV1,
  categoryKey: MusicCategoryKey,
  message: string,
  now: number,
): {
  readonly disposition: "retrying" | "skipped";
  readonly state: OvernightBatchStateV1;
} {
  const pending = state.pending;
  const categoryIndex = state.categories.findIndex(
    (category) => category.key === categoryKey,
  );
  if (
    state.status !== "armed" ||
    !pending ||
    pending.categoryKey !== categoryKey ||
    categoryIndex < 0
  ) {
    return { disposition: "skipped", state };
  }
  const category = state.categories[categoryIndex];
  if (!category) return { disposition: "skipped", state };
  const failureMessage = cleanFailureMessage(message);

  if (!pending.failedOnce) {
    return {
      disposition: "retrying",
      state: {
        ...state,
        categories: state.categories.map((candidate, index) =>
          index === categoryIndex
            ? {
                ...candidate,
                failedAttempts: candidate.failedAttempts + 1,
              }
            : candidate,
        ),
        lastFailure: {
          categoryKey,
          categoryName: category.name,
          disposition: "retrying",
          failedAt: now,
          message: failureMessage,
        },
        pending: {
          categoryKey,
          failedOnce: true,
          inFlight: false,
        },
        updatedAt: now,
      },
    };
  }

  return {
    disposition: "skipped",
    state: {
      ...state,
      categories: state.categories.map((candidate, index) =>
        index === categoryIndex
          ? {
              ...candidate,
              failedAttempts: candidate.failedAttempts + 1,
            }
          : candidate,
      ),
      cursor: (categoryIndex + 1) % state.categories.length,
      lastFailure: {
        categoryKey,
        categoryName: category.name,
        disposition: "skipped",
        failedAt: now,
        message: failureMessage,
      },
      pending: undefined,
      updatedAt: now,
    },
  };
}

export function overnightBatchProgress(
  state: OvernightBatchStateV1,
): OvernightBatchProgress {
  return {
    completed: state.categories.reduce(
      (total, category) => total + category.completed,
      0,
    ),
    failedAttempts: state.categories.reduce(
      (total, category) => total + category.failedAttempts,
      0,
    ),
    total: state.categories.length * state.targetPerCategory,
  };
}

export function overnightBatchCategory(
  state: OvernightBatchStateV1,
  categoryKey: MusicCategoryKey,
): OvernightBatchCategoryProgress | undefined {
  return state.categories.find((category) => category.key === categoryKey);
}

export function isOvernightEligible(
  conditions: OvernightSystemStatus,
): boolean {
  return (
    conditions.supported &&
    conditions.onExternalPower &&
    conditions.idleSeconds >= OVERNIGHT_IDLE_THRESHOLD_SECONDS
  );
}

export function planOvernightScheduling(input: {
  readonly batchStatus: OvernightBatchStateV1["status"] | "none";
  readonly conditions: OvernightSystemStatus;
  readonly generationActive: boolean;
  readonly queuedSources: readonly OvernightQueueSource[];
}): OvernightSchedulingPlan {
  const eligible = isOvernightEligible(input.conditions);
  const ownsIdleGeneration =
    eligible && input.batchStatus !== "none";
  const hasPriorityQueuedWork = input.queuedSources.some(
    (source) => source !== "continuous",
  );

  return {
    admitOvernight:
      input.batchStatus === "armed" &&
      eligible &&
      !input.generationActive &&
      !hasPriorityQueuedWork,
    discardQueuedContinuous:
      ownsIdleGeneration &&
      input.queuedSources.includes("continuous"),
    interruptActiveGeneration: false,
    suppressContinuous: ownsIdleGeneration,
  };
}

function completeOvernightBatch(
  state: OvernightBatchStateV1,
  now: number,
): OvernightBatchStateV1 {
  return {
    ...state,
    pending: undefined,
    status: "completed",
    updatedAt: now,
  };
}

function findNextIncompleteCategoryIndex(
  state: OvernightBatchStateV1,
): number {
  for (let offset = 0; offset < state.categories.length; offset += 1) {
    const index = (state.cursor + offset) % state.categories.length;
    const category = state.categories[index];
    if (
      category &&
      category.completed < state.targetPerCategory
    ) {
      return index;
    }
  }
  return -1;
}

function cleanFailureMessage(message: string): string {
  return (
    message
      .replace(
        /^Error invoking remote method 'locomo-music:generate': Error:\s*/,
        "",
      )
      .split("\n")[0]
      ?.trim()
      .slice(0, 240) || "Music generation failed"
  );
}

function isOvernightBatchStateV1(
  value: unknown,
): value is OvernightBatchStateV1 {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<OvernightBatchStateV1>;
  if (
    state.version !== 1 ||
    (state.status !== "armed" && state.status !== "completed") ||
    state.targetPerCategory !== OVERNIGHT_BATCH_TARGET_PER_CATEGORY ||
    typeof state.id !== "string" ||
    state.id.length === 0 ||
    !isFiniteTimestamp(state.createdAt) ||
    !isFiniteTimestamp(state.updatedAt) ||
    !Array.isArray(state.categories) ||
    state.categories.length === 0 ||
    !Number.isInteger(state.cursor) ||
    (state.cursor ?? -1) < 0 ||
    (state.cursor ?? 0) >= state.categories.length
  ) {
    return false;
  }

  const keys = new Set<string>();
  for (const candidate of state.categories) {
    if (!isOvernightBatchCategory(candidate) || keys.has(candidate.key)) {
      return false;
    }
    keys.add(candidate.key);
  }
  if (
    state.status === "completed" &&
    state.categories.some(
      (category) =>
        category.completed < OVERNIGHT_BATCH_TARGET_PER_CATEGORY,
    )
  ) {
    return false;
  }
  if (state.pending && !isOvernightPendingItem(state.pending, keys)) {
    return false;
  }
  if (
    state.pending &&
    state.categories.find(
      (category) => category.key === state.pending?.categoryKey,
    )?.completed === OVERNIGHT_BATCH_TARGET_PER_CATEGORY
  ) {
    return false;
  }
  if (state.status === "completed" && state.pending) return false;
  return !state.lastFailure || isOvernightFailure(state.lastFailure, keys);
}

function isOvernightBatchCategory(
  value: unknown,
): value is OvernightBatchCategoryProgress {
  if (!value || typeof value !== "object") return false;
  const category = value as Partial<OvernightBatchCategoryProgress>;
  return (
    typeof category.key === "string" &&
    category.key.startsWith("existing/") &&
    typeof category.name === "string" &&
    category.name.length > 0 &&
    Number.isInteger(category.completed) &&
    (category.completed ?? -1) >= 0 &&
    (category.completed ?? Infinity) <=
      OVERNIGHT_BATCH_TARGET_PER_CATEGORY &&
    Number.isInteger(category.failedAttempts) &&
    (category.failedAttempts ?? -1) >= 0
  );
}

function isOvernightPendingItem(
  value: OvernightBatchPendingItem,
  categoryKeys: ReadonlySet<string>,
): boolean {
  return (
    typeof value.categoryKey === "string" &&
    categoryKeys.has(value.categoryKey) &&
    typeof value.failedOnce === "boolean" &&
    typeof value.inFlight === "boolean" &&
    (!value.inFlight ||
      (typeof value.ownerSessionID === "string" &&
        value.ownerSessionID.length > 0)) &&
    (value.ownerSessionID === undefined ||
      (typeof value.ownerSessionID === "string" &&
        value.ownerSessionID.length > 0))
  );
}

function isOvernightFailure(
  value: OvernightBatchFailure,
  categoryKeys: ReadonlySet<string>,
): boolean {
  return (
    typeof value.categoryKey === "string" &&
    categoryKeys.has(value.categoryKey) &&
    typeof value.categoryName === "string" &&
    value.categoryName.length > 0 &&
    (value.disposition === "retrying" ||
      value.disposition === "recovered" ||
      value.disposition === "skipped") &&
    isFiniteTimestamp(value.failedAt) &&
    typeof value.message === "string" &&
    value.message.length > 0
  );
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
