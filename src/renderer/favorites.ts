import type { MusicTrack } from "../shared/app-contract";
import {
  EXISTING_CATEGORY_IDENTITIES,
  type MusicCategoryKey,
  type MusicCategorySet,
} from "../shared/music-categories";
import {
  resolveLocomoMusicCategory,
  type LocomoMusicCategory,
} from "./category-catalog";
import { seedTrackPlaylist } from "./radio";

export const FAVORITES_COLLECTION_KEY = "favorites" as const;
export const FAVORITES_EMPTY_STATE =
  "Heart songs to see them here." as const;
export const CELTIC_FOLK_CATEGORY_KEY =
  "existing/celtic-folk" satisfies MusicCategoryKey;
export const NARRATIVE_POP_CATEGORY_KEY =
  "existing/narrative-pop" satisfies MusicCategoryKey;

export type MusicSelectionKey =
  | MusicCategoryKey
  | typeof FAVORITES_COLLECTION_KEY;

export const FEATURED_EXISTING_TILE_KEYS = Object.freeze([
  "existing/future-french-house",
  "existing/latin-house",
  "existing/house",
  FAVORITES_COLLECTION_KEY,
] as const satisfies readonly MusicSelectionKey[]);

const featuredExistingTileKeySet = new Set<MusicSelectionKey>(
  FEATURED_EXISTING_TILE_KEYS,
);

export type VisibleCategoryTile =
  | (LocomoMusicCategory & {
      readonly kind: "category";
    })
  | {
      readonly artist?: undefined;
      readonly artwork?: undefined;
      readonly group: "Library";
      readonly kind: "favorites";
      readonly key: typeof FAVORITES_COLLECTION_KEY;
      readonly name: "Favorites";
    };

const FAVORITES_TILE = Object.freeze({
  group: "Library",
  kind: "favorites",
  key: FAVORITES_COLLECTION_KEY,
  name: "Favorites",
} as const satisfies VisibleCategoryTile);

export function visibleCategoryTiles(
  categories: readonly LocomoMusicCategory[],
  categorySet: MusicCategorySet,
): VisibleCategoryTile[] {
  const tiles = categories
    .filter(
      (category) =>
        categorySet !== "existing" ||
        (category.key !== CELTIC_FOLK_CATEGORY_KEY &&
          category.key !== NARRATIVE_POP_CATEGORY_KEY),
    )
    .map(
      (category) =>
        ({ ...category, kind: "category" }) satisfies VisibleCategoryTile,
    );

  if (categorySet !== "existing") return tiles;

  const existingTiles = [...tiles, FAVORITES_TILE];
  const featuredTiles = FEATURED_EXISTING_TILE_KEYS.flatMap((key) => {
    const tile = existingTiles.find((candidate) => candidate.key === key);
    return tile ? [tile] : [];
  });

  return [
    ...featuredTiles,
    ...existingTiles.filter(
      (tile) => !featuredExistingTileKeySet.has(tile.key),
    ),
  ];
}

export function isFeaturedExistingCategoryTile(
  tile: VisibleCategoryTile,
): boolean {
  return featuredExistingTileKeySet.has(tile.key);
}

export function filterFavoriteTracks<
  T extends { readonly isFavorite: boolean },
>(tracks: readonly T[]): T[] {
  return tracks.filter((track) => track.isFavorite);
}

export function seedFavoritesPlaylist<T extends Pick<
  MusicTrack,
  "id" | "isFavorite"
>>(tracks: readonly T[]) {
  return seedTrackPlaylist(filterFavoriteTracks(tracks));
}

export function generationCategoryForSelection(
  selection: MusicSelectionKey | undefined,
): MusicCategoryKey | undefined {
  return selection === FAVORITES_COLLECTION_KEY
    ? undefined
    : selection;
}

export function createGenerationForSelection<T>(
  selection: MusicSelectionKey | undefined,
  create: (categoryKey: MusicCategoryKey) => T,
): T | undefined {
  const categoryKey = generationCategoryForSelection(selection);
  return categoryKey ? create(categoryKey) : undefined;
}

export function favoriteActionLabel(isFavorite: boolean): string {
  return isFavorite ? "Remove from favorites" : "Add to favorites";
}

export function favoriteSourceCategoryLabel(
  categoryKey: MusicCategoryKey | null,
  runtimeCategories: readonly LocomoMusicCategory[] = [],
): string | undefined {
  if (!categoryKey) return undefined;
  return (
    resolveLocomoMusicCategory(categoryKey, runtimeCategories)?.name ??
    EXISTING_CATEGORY_IDENTITIES.find(
      (identity) => identity.key === categoryKey,
    )?.name ??
    categoryKey
  );
}

export function runFavoriteToggleAction(
  event: { stopPropagation(): void },
  toggle: () => void,
): void {
  event.stopPropagation();
  toggle();
}
