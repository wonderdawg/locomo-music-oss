import type {
  MusicCategoryKey,
  MusicCategorySet,
} from "../shared/music-categories";
import {
  EXISTING_BOLLYWOOD_HOUSE_CATEGORY_KEY,
  EXISTING_CATEGORY_IDENTITIES,
  EXISTING_HOUSE_CATEGORY_KEY,
  EXISTING_LATIN_HOUSE_CATEGORY_KEY,
  EXISTING_LATIN_TECHNO_CATEGORY_KEY,
} from "../shared/music-categories";
import {
  locomoMusicDarkStationArtwork,
  locomoMusicGenres,
  locomoMusicStationArtwork,
  type LocomoMusicColorTheme,
} from "./music-data";

export type { LocomoMusicColorTheme } from "./music-data";

export type CategoryPromptKind = "custom" | "existing-recipe" | "fixed";

export interface FixedCategoryPrompt {
  readonly lyricsOnPrompt?: string;
  readonly production: string;
  readonly vocals: string;
}

export interface LocomoMusicCategoryBehavior {
  readonly bpmCycle: readonly number[];
  readonly duration: number;
  readonly lyricsOff: "";
  readonly lyricsOn: "__AUTO__";
  readonly mode: "create";
  readonly promptKind: CategoryPromptKind;
}

interface CategoryBehaviorOverrides {
  readonly bpmCycle?: readonly number[];
  readonly duration?: number;
  readonly promptKind?: CategoryPromptKind;
}

export interface LocomoMusicCategory {
  readonly artist?: string;
  readonly artwork?: {
    readonly dark?: string;
    readonly light?: string;
  };
  readonly behavior?: CategoryBehaviorOverrides;
  readonly cohorts?: readonly ("global" | "us")[];
  readonly customPrompt?: string;
  readonly fixedPrompt?: FixedCategoryPrompt;
  readonly group: string;
  readonly key: MusicCategoryKey;
  readonly name: string;
  readonly set: MusicCategorySet;
}

export interface LocomoMusicCategorySetCatalog {
  readonly categories: readonly LocomoMusicCategory[];
  readonly defaults: CategoryBehaviorOverrides;
  readonly key: MusicCategorySet;
  readonly label: string;
}

export interface ResolvedLocomoMusicCategory extends LocomoMusicCategory {
  readonly behavior: LocomoMusicCategoryBehavior;
}

const SHARED_CATEGORY_DEFAULTS = Object.freeze({
  bpmCycle: Object.freeze([] as number[]),
  duration: 120,
  lyricsOff: "",
  lyricsOn: "__AUTO__",
  mode: "create",
  promptKind: "existing-recipe",
} as const satisfies LocomoMusicCategoryBehavior);

const RETIRED_EXISTING_CATEGORY_KEYS = new Set<MusicCategoryKey>([
  "existing/alternative",
  "existing/bluegrass",
  "existing/bebop",
  "existing/ambient",
  "existing/americana",
  "existing/doom-metal",
  "existing/new-jack-swing",
  "existing/neo-soul",
  "existing/bollywood-house",
  "existing/baroque",
  "existing/romantic",
  "existing/minimalist",
  "existing/dance-pop",
  "existing/trap",
  "existing/outlaw",
  "existing/modern-r-and-b",
  "existing/latin-trap",
]);

const identityByName = new Map(
  EXISTING_CATEGORY_IDENTITIES.map((identity) => [identity.name, identity]),
);

const existingBpmCycleByCategoryKey: Readonly<
  Partial<Record<MusicCategoryKey, readonly number[]>>
> = Object.freeze({
  [EXISTING_BOLLYWOOD_HOUSE_CATEGORY_KEY]: Object.freeze([
    122, 124, 126, 128,
  ]),
  [EXISTING_HOUSE_CATEGORY_KEY]: Object.freeze([120, 122, 124, 126]),
  [EXISTING_LATIN_HOUSE_CATEGORY_KEY]: Object.freeze([122, 124, 126, 128]),
  [EXISTING_LATIN_TECHNO_CATEGORY_KEY]: Object.freeze([128, 130, 132, 134]),
});

const FUTURE_FRENCH_HOUSE_LYRICS_ON_PROMPT =
  "Futuristic French-house track at 118 BPM, driven by a chopped 1970s disco-funk groove, warm analog bass, four-on-the-floor kick, crisp claps and syncopated rhythm guitar. Add sweeping low-pass filter automation, strong sidechain pumping, shimmering synth chords and a short robotic vocoder hook with original lyrics. Build from a tight repetitive loop into a dramatic filtered breakdown and euphoric final release. Retro-futuristic nightclub atmosphere: funky, mechanical, emotional and polished.";
const FUTURE_FRENCH_HOUSE_VOCODER_CLAUSE =
  " and a short robotic vocoder hook with original lyrics";
const FUTURE_FRENCH_HOUSE_LYRICS_OFF_PROMPT =
  FUTURE_FRENCH_HOUSE_LYRICS_ON_PROMPT.replace(
    FUTURE_FRENCH_HOUSE_VOCODER_CLAUSE,
    "",
  );

const incomingExistingCategories = Object.freeze([
  {
    artist: "Taylor Swift",
    artwork: Object.freeze({
      dark: locomoMusicDarkStationArtwork["Dance-pop"],
      light: locomoMusicStationArtwork["Dance-pop"],
    }),
    behavior: Object.freeze({ promptKind: "fixed" }),
    cohorts: ["us", "global"],
    fixedPrompt: Object.freeze({
      production:
        "Narrative Pop. Pop Narrative Pop track. Taylor Swift-inspired narrative pop with acoustic and clean electric guitars, warm piano, live drums, melodic bass, layered arrangements, polished modern production, and an immediate melodic hook.",
      vocals:
        "English female lead vocals with conversational phrasing, vivid first-person storytelling, precise internal rhyme, concrete details, compact verses, and a large singable chorus.",
    }),
    group: "Pop",
    key: "existing/narrative-pop",
    name: "Narrative Pop",
    set: "existing",
  },
  {
    artist: "Kendrick Lamar",
    artwork: Object.freeze({
      dark: locomoMusicDarkStationArtwork["Boom bap"],
      light: locomoMusicStationArtwork["Boom bap"],
    }),
    behavior: Object.freeze({ promptKind: "fixed" }),
    cohorts: ["us"],
    fixedPrompt: Object.freeze({
      production:
        "Cinematic Hip-Hop. Hip-hop Cinematic Hip-Hop track. Kendrick Lamar-inspired cinematic hip-hop with hard live-sounding drums, deep bass, tense orchestral strings, sparse piano, abrupt arrangement shifts, and sharply detailed widescreen production.",
      vocals:
        "English rap vocals with precise rhythmic control, agile cadence changes, distinct narrative perspectives, dense internal rhyme, and a forceful recurring refrain.",
    }),
    group: "Hip-hop",
    key: "existing/cinematic-hip-hop",
    name: "Cinematic Hip-Hop",
    set: "existing",
  },
  {
    artwork: Object.freeze({
      dark: locomoMusicDarkStationArtwork["Future French House"],
      light: locomoMusicStationArtwork["Future French House"],
    }),
    behavior: Object.freeze({ promptKind: "fixed" }),
    fixedPrompt: Object.freeze({
      lyricsOnPrompt: FUTURE_FRENCH_HOUSE_LYRICS_ON_PROMPT,
      production: FUTURE_FRENCH_HOUSE_LYRICS_OFF_PROMPT,
      vocals: "",
    }),
    group: "Electronic",
    key: "existing/future-french-house",
    name: "Future French House",
    set: "existing",
  },
] as const satisfies readonly LocomoMusicCategory[]);

const existingCategories = Object.freeze([
  ...locomoMusicGenres
    .flatMap((genre) =>
      genre.styles.map((style) => {
        const identity = identityByName.get(style.name);
        if (!identity) {
          throw new Error(
            `Missing stable category identity for existing station: ${style.name}`,
          );
        }
        const bpmCycle = existingBpmCycleByCategoryKey[identity.key];
        return Object.freeze({
          artwork: Object.freeze({
            dark: locomoMusicDarkStationArtwork[style.name],
            light: locomoMusicStationArtwork[style.name],
          }),
          behavior: bpmCycle ? Object.freeze({ bpmCycle }) : undefined,
          group: genre.name,
          key: identity.key,
          name: style.name,
          set: "existing",
        } satisfies LocomoMusicCategory);
      }),
    )
    .filter(
      (category) => !RETIRED_EXISTING_CATEGORY_KEYS.has(category.key),
    ),
  ...incomingExistingCategories,
]);

export const experimentalCategories = Object.freeze([
  {
    artist: "Drake",
    cohorts: ["us", "global"],
    fixedPrompt: {
      production:
        "Melodic Rap & R&B. Hip-hop and R&B Melodic Rap & R&B track. Drake-inspired melodic rap and contemporary R&B with sparse minor-key synth chords, deep sub-bass, crisp restrained trap drums, ambient vocal textures, a slow head-nod pocket, and spacious production.",
      vocals:
        "English male vocals alternating naturally between intimate melody and conversational rap, with relaxed behind-the-beat phrasing, compact bars, and a concise memorable hook.",
    },
    group: "Hip-hop and R&B",
    key: "experimental/melodic-rap-and-r-and-b",
    name: "Melodic Rap & R&B",
    set: "experimental",
  },
  {
    artist: "Morgan Wallen",
    cohorts: ["us"],
    fixedPrompt: {
      production:
        "Country Crossover. Country Country Crossover track. Morgan Wallen-inspired modern country crossover with strummed acoustic guitar, twangy electric fills, warm organ, punchy live drums, rounded bass, pop-sized hooks, and polished Nashville production.",
      vocals:
        "English male country vocals with a grainy conversational tone, Southern-inflected phrasing, concrete small-town storytelling, compact verses, and a broad singable chorus.",
    },
    group: "Country",
    key: "experimental/country-crossover",
    name: "Country Crossover",
    set: "experimental",
  },
  {
    artist: "Bad Bunny",
    cohorts: ["us", "global"],
    fixedPrompt: {
      production:
        "Latin Trap & Reggaetón. Latin Latin Trap & Reggaetón track. Bad Bunny-inspired Latin trap and reggaetón with a heavy dembow pulse, deep sub-bass, clipped trap hi-hats, dry hand percussion, hazy synth chords, sparse melodic motifs, and polished Caribbean club production.",
      vocals:
        "Spanish male vocals with relaxed low-register melody, conversational rhythmic phrasing, confident rap passages, compact lines, and a sticky memorable hook.",
    },
    group: "Latin",
    key: "experimental/latin-trap-and-reggaeton",
    name: "Latin Trap & Reggaetón",
    set: "experimental",
  },
  {
    artist: "The Weeknd",
    cohorts: ["global"],
    fixedPrompt: {
      production:
        "Dark Synth-Pop. Pop Dark Synth-Pop track. The Weeknd-inspired dark synth-pop with glossy analog synthesizers, pulsing arpeggios, gated electronic drums, deep melodic bass, neon eighties textures, minor-key hooks, and cinematic modern pop production.",
      vocals:
        "English male tenor vocals with smooth controlled phrasing, expressive upper-register lines, restrained melisma, concise verses, and a dramatic memorable chorus.",
    },
    group: "Pop",
    key: "experimental/dark-synth-pop",
    name: "Dark Synth-Pop",
    set: "experimental",
  },
  {
    artist: "Billie Eilish",
    cohorts: ["global"],
    fixedPrompt: {
      production:
        "Minimal Alt-Pop. Pop Minimal Alt-Pop track. Billie Eilish-inspired minimal alternative pop with close dry percussion, sub-heavy bass, sparse piano, detuned synth details, abrupt negative space, intimate sound design, and precise low-volume production.",
      vocals:
        "English female vocals recorded extremely close, with breathy controlled tone, quiet conversational phrasing, crisp consonants, layered whispers, and a compact unsettling hook.",
    },
    group: "Pop",
    key: "experimental/minimal-alt-pop",
    name: "Minimal Alt-Pop",
    set: "experimental",
  },
] as const satisfies readonly LocomoMusicCategory[]);

export const locomoMusicCategoryCatalogs: Readonly<
  Record<MusicCategorySet, LocomoMusicCategorySetCatalog>
> = Object.freeze({
  existing: Object.freeze({
    categories: existingCategories,
    defaults: Object.freeze({
      promptKind: "existing-recipe",
    }),
    key: "existing",
    label: "Existing",
  }),
  experimental: Object.freeze({
    categories: experimentalCategories,
    defaults: Object.freeze({
      promptKind: "fixed",
    }),
    key: "experimental",
    label: "Experimental",
  }),
} as const);

const categoryByKey = new Map<MusicCategoryKey, LocomoMusicCategory>(
  Object.values(locomoMusicCategoryCatalogs).flatMap((catalog) =>
    catalog.categories.map((category) => [category.key, category] as const),
  ),
);

export function resolveLocomoMusicCategory(
  key: MusicCategoryKey,
  runtimeCategories: readonly LocomoMusicCategory[] = [],
): ResolvedLocomoMusicCategory | undefined {
  const category =
    categoryByKey.get(key) ??
    runtimeCategories.find((candidate) => candidate.key === key);
  if (!category) return undefined;
  const setDefaults = locomoMusicCategoryCatalogs[category.set].defaults;
  return {
    ...category,
    behavior: {
      ...SHARED_CATEGORY_DEFAULTS,
      ...setDefaults,
      ...category.behavior,
    },
  };
}

export function resolveCategoryArtwork(
  category: LocomoMusicCategory,
  theme: LocomoMusicColorTheme,
): string | undefined {
  return theme === "dark"
    ? (category.artwork?.dark ?? category.artwork?.light)
    : category.artwork?.light;
}
