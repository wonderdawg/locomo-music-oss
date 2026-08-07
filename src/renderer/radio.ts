import type {
  MusicGenerationRequest,
  MusicPromptRecipeVersion,
} from "../shared/app-contract";
import type {
  MusicCategoryKey,
  MusicCategorySet,
} from "../shared/music-categories";
import {
  EXISTING_LATIN_HOUSE_CATEGORY_KEY,
  existingCategoryKeyForName,
} from "../shared/music-categories";
import {
  resolveLocomoMusicCategory,
  type LocomoMusicCategory,
} from "./category-catalog";
import { locomoMusicGenres } from "./music-data";
import {
  LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  locomoMusicActivePromptRecipeByStation,
  locomoMusicStationPromptRecipes,
  type LocomoMusicPromptRecipeVersion,
  type LocomoMusicStationPromptRecipes,
} from "./prompt-recipes";

export type StationGenerationRequest = MusicGenerationRequest & {
  readonly promptRecipeVersion: MusicPromptRecipeVersion;
  readonly station: string;
};

export interface QueuedStationGenerationRequest {
  readonly request: StationGenerationRequest;
  readonly selectionEpoch: number;
}

export interface StationTrackVariationCounts {
  readonly total: number;
  readonly vocal: number;
  readonly instrumental: number;
}

type StationTrackVariationState = number | StationTrackVariationCounts;

const V1_VOCAL_PROMPT_INTERVAL = 5;
const V1_VOCAL_PROMPT_EXCLUDED_STATIONS = new Set([
  "Baroque",
  "Romantic",
  "Minimalist",
  "Celtic folk",
]);

export const TEMPORARY_LATIN_HOUSE_LYRICS_ON_PROMPT =
  "Modern Latin-house track at 124 BPM, driven by a warm four-on-the-floor kick, syncopated bass, congas, timbales, clave, güiro and a bright piano montuno. Add offbeat organ stabs, subtle filter movement, spacious club reverb and a short call-and-response vocal hook with original lyrics sung entirely in natural contemporary Spanish. Build from a sparse kick-and-percussion groove into layered hand percussion, a filtered breakdown and a euphoric full-ensemble release. Late-night Latin nightclub atmosphere: soulful, physical, communal, emotional and polished.";

export function countStationTrackVariations<
  T extends { readonly lyrics: string },
>(tracks: readonly T[]): StationTrackVariationCounts {
  const instrumental = tracks.filter(
    (track) => track.lyrics.trim().length === 0,
  ).length;

  return {
    total: tracks.length,
    vocal: tracks.length - instrumental,
    instrumental,
  };
}

export function createStationGenerationRequest(
  genres: readonly string[],
  instrumental: boolean,
  stationTrackState: StationTrackVariationState,
): StationGenerationRequest | undefined {
  const station = genres[0];
  if (!station) {
    return undefined;
  }
  const categoryKey = existingCategoryKeyForName(station);
  const fixedCategory = categoryKey
    ? resolveLocomoMusicCategory(categoryKey)
    : undefined;
  if (fixedCategory?.behavior.promptKind === "fixed") {
    return createCategoryGenerationRequest(
      fixedCategory.key,
      instrumental,
      stationTrackState,
    );
  }

  const activeRecipe =
    (
      locomoMusicActivePromptRecipeByStation as Readonly<
        Partial<Record<string, LocomoMusicPromptRecipeVersion>>
      >
    )[station] ?? LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE;

  const request = createStationGenerationRequestForRecipe(
    genres,
    instrumental,
    stationTrackState,
    activeRecipe,
  );
  const category = request
    ? resolveLocomoMusicCategory(request.categoryKey)
    : undefined;
  if (
    activeRecipe !== "v2.3" ||
    !request ||
    category?.set !== "existing" ||
    V1_VOCAL_PROMPT_EXCLUDED_STATIONS.has(station) ||
    request.lyrics.trim().length === 0 ||
    !usesV1VocalPrompt(stationTrackState)
  ) {
    return request;
  }

  return (
    createStationGenerationRequestForRecipe(
      genres,
      instrumental,
      stationTrackState,
      "v1",
    ) ?? request
  );
}

export function createCategoryGenerationRequest(
  categoryKey: MusicCategoryKey,
  instrumental: boolean,
  stationTrackState: StationTrackVariationState,
  durationSeconds?: number,
  runtimeCategories: readonly LocomoMusicCategory[] = [],
): StationGenerationRequest | undefined {
  const category = resolveLocomoMusicCategory(
    categoryKey,
    runtimeCategories,
  );
  if (!category) return undefined;

  if (category.behavior.promptKind === "custom") {
    if (category.customPrompt === undefined) {
      throw new Error(`Missing custom prompt for category: ${category.key}`);
    }
    return {
      categoryKey: category.key,
      mode: category.behavior.mode,
      station: category.name,
      prompt: category.customPrompt,
      promptRecipeVersion: "custom",
      lyrics: instrumental
        ? category.behavior.lyricsOff
        : category.behavior.lyricsOn,
      duration: durationSeconds ?? category.behavior.duration,
    };
  }

  if (category.behavior.promptKind === "fixed") {
    if (!category.fixedPrompt) {
      throw new Error(`Missing fixed prompt for category: ${category.key}`);
    }
    return {
      categoryKey: category.key,
      mode: category.behavior.mode,
      station: category.name,
      prompt: instrumental
        ? category.fixedPrompt.production
        : (category.fixedPrompt.lyricsOnPrompt ??
          `${category.fixedPrompt.production} ${category.fixedPrompt.vocals}`),
      promptRecipeVersion: "custom",
      lyrics: instrumental
        ? category.behavior.lyricsOff
        : category.behavior.lyricsOn,
      duration: durationSeconds ?? category.behavior.duration,
    };
  }

  if (category.key === EXISTING_LATIN_HOUSE_CATEGORY_KEY) {
    const rollbackRequest = createLatinHouseV23V1RollbackRequest(
      instrumental,
      stationTrackState,
      durationSeconds,
    );
    return !rollbackRequest || instrumental
      ? rollbackRequest
      : {
          ...rollbackRequest,
          prompt: TEMPORARY_LATIN_HOUSE_LYRICS_ON_PROMPT,
        };
  }

  const request = createStationGenerationRequest(
    [category.name],
    instrumental,
    stationTrackState,
  );
  return request && durationSeconds !== undefined
    ? { ...request, duration: durationSeconds }
    : request;
}

export function createLatinHouseV23V1RollbackRequest(
  instrumental: boolean,
  stationTrackState: StationTrackVariationState,
  durationSeconds?: number,
): StationGenerationRequest | undefined {
  const request = createStationGenerationRequest(
    ["Latin house"],
    instrumental,
    stationTrackState,
  );
  return request && durationSeconds !== undefined
    ? { ...request, duration: durationSeconds }
    : request;
}

export function createStationGenerationRequestForRecipe(
  genres: readonly string[],
  instrumental: boolean,
  stationTrackState: StationTrackVariationState,
  promptRecipeVersion: LocomoMusicPromptRecipeVersion,
): StationGenerationRequest | undefined {
  const station = genres[0];
  if (!station) {
    return undefined;
  }
  const categoryKey = existingCategoryKeyForName(station);
  if (!categoryKey) {
    return undefined;
  }
  const category = resolveLocomoMusicCategory(categoryKey);
  if (!category) {
    return undefined;
  }

  const styles = locomoMusicGenres.flatMap((genre) =>
    genre.styles.map((style) => ({
      genre: String(genre.name),
      name: String(style.name),
      prompt: String(style.prompt),
    })),
  );
  const selectedStyles = genres
    .map((genre) => styles.find((style) => style.name === genre))
    .filter((value) => value !== undefined);
  const selectedGenreGroups = locomoMusicGenres.filter((genre) =>
    genre.styles.some((style) => genres.includes(style.name)),
  );
  const recipes =
    locomoMusicStationPromptRecipes as Readonly<
      Partial<Record<string, LocomoMusicStationPromptRecipes>>
    >;
  const stationRecipe = recipes[station];
  const stationTrackCount =
    typeof stationTrackState === "number"
      ? stationTrackState
      : stationTrackState.total;
  const promptVariationIndex =
    promptRecipeVersion === "v1"
      ? stationTrackCount
      : typeof stationTrackState === "number"
        ? stationTrackState
        : instrumental
          ? stationTrackState.instrumental
          : stationTrackState.vocal;
  let prompt: string;

  if (promptRecipeVersion === "v1") {
    const vocalPrompt = selectedGenreGroups
      .map((genre) => {
        const selectedStyle = genre.styles.find((style) =>
          genres.includes(style.name),
        );
        return selectedStyle
          ? (recipes[selectedStyle.name]?.v1.vocalPrompt ??
              String(genre.vocalPrompt))
          : "";
      })
      .join(" ");
    prompt = `${genres.join(" + ")}. ${selectedStyles
      .map(
        (style) =>
          `${style.genre} ${style.name} track. ${
            recipes[style.name]?.v1.stylePrompt ?? style.prompt
          }`,
      )
      .join(" ")} ${instrumental ? "" : vocalPrompt}`.trim();
  } else {
    const lyricDirections =
      stationRecipe?.["v2.3"].lyricDirections ?? [];
    const lyricDirection =
      !instrumental && lyricDirections.length > 0
        ? lyricDirections[promptVariationIndex % lyricDirections.length]
        : undefined;
    const vocalPrompt =
      stationRecipe?.["v2.3"].vocalPrompt ??
      selectedGenreGroups.map((genre) => genre.vocalPrompt).join(" ");
    prompt = `${genres.join(" + ")}. ${selectedStyles
      .map((style) => {
        const recipe = recipes[style.name]?.["v2.3"];
        const instrumentalRecipe = instrumental
          ? recipe?.instrumental
          : undefined;
        const anchors =
          instrumentalRecipe?.anchors ?? recipe?.anchors ?? [];
        const anchor =
          anchors.length > 0
            ? anchors[promptVariationIndex % anchors.length]
            : undefined;
        return `${style.genre} ${style.name} track. ${
          instrumentalRecipe?.productionIdentity ??
          recipe?.productionIdentity ??
          style.prompt
        }${anchor ? ` ${anchor}` : ""}`;
      })
      .join(" ")} ${
      instrumental
        ? ""
        : `${vocalPrompt}${lyricDirection ? ` ${lyricDirection}` : ""}`
    }`.trim();
  }

  if (instrumental && selectedStyles.length === 1 && selectedStyles[0]?.name === "Indie pop") {
    prompt =
      "Instrumental indie pop song with clean, spacious high-fidelity production, natural dynamics, clear separation, and a polished full-range mix.";
  }

  return {
    categoryKey,
    mode: "create",
    station,
    prompt,
    promptRecipeVersion,
    lyrics: instrumental ? "" : "__AUTO__",
    duration: category.behavior.duration,
    bpm:
      category.behavior.bpmCycle.length > 0
        ? category.behavior.bpmCycle[
            stationTrackCount % category.behavior.bpmCycle.length
          ]
        : undefined,
  };
}

function usesV1VocalPrompt(
  stationTrackState: StationTrackVariationState,
): boolean {
  const vocalCount =
    typeof stationTrackState === "number"
      ? stationTrackState
      : stationTrackState.vocal;
  return (vocalCount + 1) % V1_VOCAL_PROMPT_INTERVAL === 0;
}

export function filterTracksForCategory<
  T extends {
    readonly categoryKey: MusicCategoryKey | null;
  },
>(tracks: readonly T[], categoryKey: MusicCategoryKey): T[] {
  return tracks.filter((track) => track.categoryKey === categoryKey);
}

export function seedCategoryPlaylist<
  T extends {
    readonly categoryKey: MusicCategoryKey | null;
    readonly id: string;
  },
>(
  tracks: readonly T[],
  categoryKey: MusicCategoryKey,
): {
  readonly playlist: string[];
  readonly preloaded: T[];
  readonly startingTrack: T | undefined;
} {
  const preloaded = filterTracksForCategory(tracks, categoryKey);

  return seedTrackPlaylist(preloaded);
}

export function seedTrackPlaylist<T extends { readonly id: string }>(
  preloaded: readonly T[],
): {
  readonly playlist: string[];
  readonly preloaded: T[];
  readonly startingTrack: T | undefined;
} {
  const items = [...preloaded];
  return {
    playlist: items.toReversed().map((track) => track.id),
    preloaded: items,
    startingTrack: items[3] ?? items.at(-1),
  };
}

export function shouldGenerateOnCategorySelection(input: {
  readonly autoCreate: boolean;
  readonly isCustomCategory: boolean;
  readonly preloadedTrackCount: number;
}): boolean {
  return (
    input.autoCreate ||
    (input.isCustomCategory && input.preloadedTrackCount === 0)
  );
}

export interface CategoryGenerationIntentGate {
  admitOnReadiness(input: {
    readonly categoryKey: MusicCategoryKey | undefined;
    readonly generationAvailable: boolean;
  }): boolean;
  clear(): void;
  noteSelection(input: {
    readonly generationAvailable: boolean;
    readonly shouldGenerate: boolean;
  }): boolean;
}

export function createCategoryGenerationIntentGate(): CategoryGenerationIntentGate {
  let pending = false;
  return {
    admitOnReadiness(input) {
      if (
        !pending ||
        !input.generationAvailable ||
        input.categoryKey === undefined
      ) {
        return false;
      }
      pending = false;
      return true;
    },
    clear() {
      pending = false;
    },
    noteSelection(input) {
      pending = input.shouldGenerate && !input.generationAvailable;
      return input.shouldGenerate && input.generationAvailable;
    },
  };
}

export interface RadioCategorySetState<TRequest> {
  readonly autoCreate: boolean;
  readonly categoryKey: MusicCategoryKey | undefined;
  readonly categorySet: MusicCategorySet;
  readonly generationQueue: readonly TRequest[];
  readonly instrumental: boolean;
  readonly pendingJump: string | undefined;
  readonly playingTrackID: string | undefined;
  readonly playlist: readonly string[];
  readonly progress: number;
  readonly selectedTrackID: string | undefined;
  readonly selectionEpoch: number;
}

export function switchRadioCategorySet<TRequest>(
  current: RadioCategorySetState<TRequest>,
  categorySet: MusicCategorySet,
): RadioCategorySetState<TRequest> {
  if (current.categorySet === categorySet) return current;
  return {
    autoCreate: current.autoCreate,
    categoryKey: undefined,
    categorySet,
    generationQueue: [],
    instrumental: current.instrumental,
    pendingJump: undefined,
    playingTrackID: undefined,
    playlist: [],
    progress: 0,
    selectedTrackID: undefined,
    selectionEpoch: current.selectionEpoch + 1,
  };
}

export function generationResultMatchesSelection(
  request: Pick<QueuedStationGenerationRequest, "selectionEpoch"> & {
    readonly categoryKey: MusicCategoryKey;
  },
  categoryKey: MusicCategoryKey | undefined,
  selectionEpoch: number,
): boolean {
  return (
    request.categoryKey === categoryKey &&
    request.selectionEpoch === selectionEpoch
  );
}

export function shouldGenerateAfterQueueDrain(input: {
  readonly autoCreate: boolean;
  readonly categoryKey: MusicCategoryKey | undefined;
  readonly disposed: boolean;
  readonly queuedRequests: number;
}): boolean {
  return (
    !input.disposed &&
    input.autoCreate &&
    input.categoryKey !== undefined &&
    input.queuedRequests === 0
  );
}

export function admitGeneratedTrack(input: {
  readonly playlist: readonly string[];
  readonly trackID: string;
}): {
  readonly pendingJump: string | undefined;
  readonly playlist: string[];
  readonly startImmediately: boolean;
} {
  if (input.playlist.length === 0) {
    return {
      playlist: [input.trackID],
      pendingJump: undefined,
      startImmediately: true,
    };
  }
  if (input.playlist.includes(input.trackID)) {
    return {
      playlist: [...input.playlist],
      pendingJump: undefined,
      startImmediately: false,
    };
  }

  return {
    playlist: [...input.playlist, input.trackID],
    pendingJump: input.trackID,
    startImmediately: false,
  };
}

export function nextTrackAtPlaybackBoundary(
  playlist: readonly string[],
  selected: string | undefined,
  pendingJump: string | undefined,
): string | undefined {
  if (playlist.length === 0) {
    return undefined;
  }
  if (pendingJump && playlist.includes(pendingJump)) {
    return pendingJump;
  }
  return playlist[
    (playlist.indexOf(selected ?? "") + 1) % playlist.length
  ];
}
