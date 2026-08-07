import type { MusicCategoryKey } from "../shared/music-categories";
import type { OvernightQueueSource } from "./overnight-batch";

export const NEW_CATEGORY_MUSIC_STORAGE_KEY =
  "locomo-music:new-category-music:v1" as const;
export const NEW_CATEGORY_MUSIC_STORAGE_VERSION = 1 as const;

export interface NewCategoryMusicStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface StoredNewCategoryMusicIndex {
  readonly categoryKeys: readonly MusicCategoryKey[];
  readonly version: typeof NEW_CATEGORY_MUSIC_STORAGE_VERSION;
}

export interface GeneratedCategoryArrival {
  readonly categoryKey: MusicCategoryKey;
  readonly selectedCategoryKey: MusicCategoryKey | undefined;
  readonly source: OvernightQueueSource;
}

export function readNewCategoryMusic(
  storage: Pick<NewCategoryMusicStorage, "getItem">,
): MusicCategoryKey[] {
  try {
    const saved = storage.getItem(NEW_CATEGORY_MUSIC_STORAGE_KEY);
    if (saved === null) return [];
    const parsed = JSON.parse(saved) as unknown;
    if (!isStoredNewCategoryMusicIndex(parsed)) return [];

    return parsed.categoryKeys.filter(
      (categoryKey, index, all) =>
        isMusicCategoryKey(categoryKey) &&
        all.indexOf(categoryKey) === index,
    );
  } catch {
    return [];
  }
}

export function writeNewCategoryMusic(
  storage: Pick<
    NewCategoryMusicStorage,
    "removeItem" | "setItem"
  >,
  categoryKeys: readonly MusicCategoryKey[],
): void {
  try {
    if (categoryKeys.length === 0) {
      storage.removeItem(NEW_CATEGORY_MUSIC_STORAGE_KEY);
      return;
    }
    const index: StoredNewCategoryMusicIndex = {
      categoryKeys: [...new Set(categoryKeys)],
      version: NEW_CATEGORY_MUSIC_STORAGE_VERSION,
    };
    storage.setItem(
      NEW_CATEGORY_MUSIC_STORAGE_KEY,
      JSON.stringify(index),
    );
  } catch {
    // A storage failure must never interfere with music generation.
  }
}

export function recordGeneratedCategoryNewMusic(
  categoryKeys: readonly MusicCategoryKey[],
  arrival: GeneratedCategoryArrival,
): readonly MusicCategoryKey[] {
  if (!shouldMarkCategoryNewMusic(arrival)) return categoryKeys;
  if (categoryKeys.includes(arrival.categoryKey)) return categoryKeys;
  return [...categoryKeys, arrival.categoryKey];
}

export function clearCategoryNewMusic(
  categoryKeys: readonly MusicCategoryKey[],
  categoryKey: MusicCategoryKey,
): readonly MusicCategoryKey[] {
  if (!categoryKeys.includes(categoryKey)) return categoryKeys;
  return categoryKeys.filter((candidate) => candidate !== categoryKey);
}

export function shouldMarkCategoryNewMusic({
  categoryKey,
  selectedCategoryKey,
  source,
}: GeneratedCategoryArrival): boolean {
  return source === "overnight" || categoryKey !== selectedCategoryKey;
}

function isStoredNewCategoryMusicIndex(
  value: unknown,
): value is StoredNewCategoryMusicIndex {
  if (!value || typeof value !== "object") return false;
  const index = value as Partial<StoredNewCategoryMusicIndex>;
  return (
    index.version === NEW_CATEGORY_MUSIC_STORAGE_VERSION &&
    Array.isArray(index.categoryKeys)
  );
}

function isMusicCategoryKey(value: unknown): value is MusicCategoryKey {
  return (
    typeof value === "string" &&
    /^(?:existing|experimental)\/[a-zA-Z0-9][a-zA-Z0-9-]*$/u.test(
      value,
    )
  );
}
