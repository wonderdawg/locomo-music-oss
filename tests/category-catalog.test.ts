import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { resolveMusicVocalLanguage } from "../src/main/music-vocal-language";
import {
  experimentalCategories,
  locomoMusicCategoryCatalogs,
  resolveLocomoMusicCategory,
} from "../src/renderer/category-catalog";
import {
  locomoMusicDarkStationArtwork,
  locomoMusicGenres,
  locomoMusicStationArtwork,
} from "../src/renderer/music-data";
import {
  createCategoryGenerationRequest,
  createLatinHouseV23V1RollbackRequest,
  createStationGenerationRequest,
  createStationGenerationRequestForRecipe,
  filterTracksForCategory,
  generationResultMatchesSelection,
  seedCategoryPlaylist,
  shouldGenerateAfterQueueDrain,
  switchRadioCategorySet,
  TEMPORARY_LATIN_HOUSE_LYRICS_ON_PROMPT,
} from "../src/renderer/radio";
import {
  EXISTING_CATEGORY_IDENTITIES,
  type MusicCategoryKey,
} from "../src/shared/music-categories";
const retiredExistingStations = [
  { key: "existing/dance-pop", name: "Dance-pop" },
  { key: "existing/alternative", name: "Alternative" },
  { key: "existing/trap", name: "Trap" },
  { key: "existing/neo-soul", name: "Neo-soul" },
  { key: "existing/modern-r-and-b", name: "Modern R&B" },
  { key: "existing/new-jack-swing", name: "New jack swing" },
  { key: "existing/bluegrass", name: "Bluegrass" },
  { key: "existing/outlaw", name: "Outlaw" },
  { key: "existing/bebop", name: "Bebop" },
  { key: "existing/bollywood-house", name: "Bollywood house" },
  { key: "existing/ambient", name: "Ambient" },
  { key: "existing/latin-trap", name: "Latin trap" },
  { key: "existing/baroque", name: "Baroque" },
  { key: "existing/romantic", name: "Romantic" },
  { key: "existing/minimalist", name: "Minimalist" },
  { key: "existing/americana", name: "Americana" },
  { key: "existing/doom-metal", name: "Doom metal" },
] as const satisfies readonly {
  readonly key: MusicCategoryKey;
  readonly name: string;
}[];

const approvedExperimentalPrompts: readonly {
  readonly artist?: string;
  readonly key: MusicCategoryKey;
  readonly name: string;
  readonly off: string;
  readonly on: string;
}[] = [
  {
    artist: "Drake",
    key: "experimental/melodic-rap-and-r-and-b",
    name: "Melodic Rap & R&B",
    off: "Melodic Rap & R&B. Hip-hop and R&B Melodic Rap & R&B track. Drake-inspired melodic rap and contemporary R&B with sparse minor-key synth chords, deep sub-bass, crisp restrained trap drums, ambient vocal textures, a slow head-nod pocket, and spacious production.",
    on: "Melodic Rap & R&B. Hip-hop and R&B Melodic Rap & R&B track. Drake-inspired melodic rap and contemporary R&B with sparse minor-key synth chords, deep sub-bass, crisp restrained trap drums, ambient vocal textures, a slow head-nod pocket, and spacious production. English male vocals alternating naturally between intimate melody and conversational rap, with relaxed behind-the-beat phrasing, compact bars, and a concise memorable hook.",
  },
  {
    artist: "Morgan Wallen",
    key: "experimental/country-crossover",
    name: "Country Crossover",
    off: "Country Crossover. Country Country Crossover track. Morgan Wallen-inspired modern country crossover with strummed acoustic guitar, twangy electric fills, warm organ, punchy live drums, rounded bass, pop-sized hooks, and polished Nashville production.",
    on: "Country Crossover. Country Country Crossover track. Morgan Wallen-inspired modern country crossover with strummed acoustic guitar, twangy electric fills, warm organ, punchy live drums, rounded bass, pop-sized hooks, and polished Nashville production. English male country vocals with a grainy conversational tone, Southern-inflected phrasing, concrete small-town storytelling, compact verses, and a broad singable chorus.",
  },
  {
    artist: "Bad Bunny",
    key: "experimental/latin-trap-and-reggaeton",
    name: "Latin Trap & Reggaetón",
    off: "Latin Trap & Reggaetón. Latin Latin Trap & Reggaetón track. Bad Bunny-inspired Latin trap and reggaetón with a heavy dembow pulse, deep sub-bass, clipped trap hi-hats, dry hand percussion, hazy synth chords, sparse melodic motifs, and polished Caribbean club production.",
    on: "Latin Trap & Reggaetón. Latin Latin Trap & Reggaetón track. Bad Bunny-inspired Latin trap and reggaetón with a heavy dembow pulse, deep sub-bass, clipped trap hi-hats, dry hand percussion, hazy synth chords, sparse melodic motifs, and polished Caribbean club production. Spanish male vocals with relaxed low-register melody, conversational rhythmic phrasing, confident rap passages, compact lines, and a sticky memorable hook.",
  },
  {
    artist: "The Weeknd",
    key: "experimental/dark-synth-pop",
    name: "Dark Synth-Pop",
    off: "Dark Synth-Pop. Pop Dark Synth-Pop track. The Weeknd-inspired dark synth-pop with glossy analog synthesizers, pulsing arpeggios, gated electronic drums, deep melodic bass, neon eighties textures, minor-key hooks, and cinematic modern pop production.",
    on: "Dark Synth-Pop. Pop Dark Synth-Pop track. The Weeknd-inspired dark synth-pop with glossy analog synthesizers, pulsing arpeggios, gated electronic drums, deep melodic bass, neon eighties textures, minor-key hooks, and cinematic modern pop production. English male tenor vocals with smooth controlled phrasing, expressive upper-register lines, restrained melisma, concise verses, and a dramatic memorable chorus.",
  },
  {
    artist: "Billie Eilish",
    key: "experimental/minimal-alt-pop",
    name: "Minimal Alt-Pop",
    off: "Minimal Alt-Pop. Pop Minimal Alt-Pop track. Billie Eilish-inspired minimal alternative pop with close dry percussion, sub-heavy bass, sparse piano, detuned synth details, abrupt negative space, intimate sound design, and precise low-volume production.",
    on: "Minimal Alt-Pop. Pop Minimal Alt-Pop track. Billie Eilish-inspired minimal alternative pop with close dry percussion, sub-heavy bass, sparse piano, detuned synth details, abrupt negative space, intimate sound design, and precise low-volume production. English female vocals recorded extremely close, with breathy controlled tone, quiet conversational phrasing, crisp consonants, layered whispers, and a compact unsettling hook.",
  },
];

const approvedIncomingExistingPrompts = [
  {
    art: "Dance-pop",
    artist: "Taylor Swift",
    key: "existing/narrative-pop" as const,
    language: "en",
    name: "Narrative Pop",
    off: "Narrative Pop. Pop Narrative Pop track. Taylor Swift-inspired narrative pop with acoustic and clean electric guitars, warm piano, live drums, melodic bass, layered arrangements, polished modern production, and an immediate melodic hook.",
    on: "Narrative Pop. Pop Narrative Pop track. Taylor Swift-inspired narrative pop with acoustic and clean electric guitars, warm piano, live drums, melodic bass, layered arrangements, polished modern production, and an immediate melodic hook. English female lead vocals with conversational phrasing, vivid first-person storytelling, precise internal rhyme, concrete details, compact verses, and a large singable chorus.",
  },
  {
    art: "Boom bap",
    artist: "Kendrick Lamar",
    key: "existing/cinematic-hip-hop" as const,
    language: "en",
    name: "Cinematic Hip-Hop",
    off: "Cinematic Hip-Hop. Hip-hop Cinematic Hip-Hop track. Kendrick Lamar-inspired cinematic hip-hop with hard live-sounding drums, deep bass, tense orchestral strings, sparse piano, abrupt arrangement shifts, and sharply detailed widescreen production.",
    on: "Cinematic Hip-Hop. Hip-hop Cinematic Hip-Hop track. Kendrick Lamar-inspired cinematic hip-hop with hard live-sounding drums, deep bass, tense orchestral strings, sparse piano, abrupt arrangement shifts, and sharply detailed widescreen production. English rap vocals with precise rhythmic control, agile cadence changes, distinct narrative perspectives, dense internal rhyme, and a forceful recurring refrain.",
  },
  {
    art: "Future French House",
    artist: undefined,
    key: "existing/future-french-house" as const,
    language: "en",
    name: "Future French House",
    off: "Futuristic French-house track at 118 BPM, driven by a chopped 1970s disco-funk groove, warm analog bass, four-on-the-floor kick, crisp claps and syncopated rhythm guitar. Add sweeping low-pass filter automation, strong sidechain pumping, shimmering synth chords. Build from a tight repetitive loop into a dramatic filtered breakdown and euphoric final release. Retro-futuristic nightclub atmosphere: funky, mechanical, emotional and polished.",
    on: "Futuristic French-house track at 118 BPM, driven by a chopped 1970s disco-funk groove, warm analog bass, four-on-the-floor kick, crisp claps and syncopated rhythm guitar. Add sweeping low-pass filter automation, strong sidechain pumping, shimmering synth chords and a short robotic vocoder hook with original lyrics. Build from a tight repetitive loop into a dramatic filtered breakdown and euphoric final release. Retro-futuristic nightclub atmosphere: funky, mechanical, emotional and polished.",
  },
] as const;

const sha256 = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function withoutCategoryKey<T extends { readonly categoryKey: unknown }>(
  request: T,
) {
  const { categoryKey: _categoryKey, ...existingShape } = request;
  return existingShape;
}

describe("genre-set catalogs", () => {
  it("retires the removed stations while preserving the accepted additions", () => {
    expect(locomoMusicCategoryCatalogs.existing.label).toBe("Existing");
    expect(locomoMusicCategoryCatalogs.existing.categories).toHaveLength(20);
    expect(locomoMusicCategoryCatalogs.experimental.categories).toHaveLength(
      5,
    );
    expect(locomoMusicCategoryCatalogs.experimental.categories).toEqual(
      experimentalCategories,
    );
    expect(
      new Set(
        Object.values(locomoMusicCategoryCatalogs).flatMap((catalog) =>
          catalog.categories.map((category) => category.key),
        ),
      ).size,
    ).toBe(25);
    expect(
      locomoMusicCategoryCatalogs.experimental.categories.map(
        (category) => category.key,
      ),
    ).toEqual(approvedExperimentalPrompts.map((prompt) => prompt.key));
    expect(experimentalCategories.at(-1)).toMatchObject({
      group: "Pop",
      key: "experimental/minimal-alt-pop",
      name: "Minimal Alt-Pop",
      set: "experimental",
    });

    const activeExistingKeys = new Set(
      locomoMusicCategoryCatalogs.existing.categories.map(
        (category) => category.key,
      ),
    );
    expect(
      EXISTING_CATEGORY_IDENTITIES.filter(
        (identity) => !activeExistingKeys.has(identity.key),
      ),
    ).toEqual(retiredExistingStations);
    retiredExistingStations.forEach((station) => {
      expect(resolveLocomoMusicCategory(station.key)).toBeUndefined();
      expect(
        createCategoryGenerationRequest(station.key, false, 0),
      ).toBeUndefined();
      expect(
        createStationGenerationRequest([station.name], false, 0),
      ).toBeUndefined();
      expect(
        createStationGenerationRequestForRecipe(
          [station.name],
          false,
          0,
          "v1",
        ),
      ).toBeUndefined();
    });
  });

  it("retains the original recipe source and locks the intentional active matrix", () => {
    const originalGenres = locomoMusicGenres
      .filter((genre) => genre.name !== "Latin Electronic")
      .map((genre) => ({
        ...genre,
        styles: genre.styles.filter(
          (style) => style.name !== "Bollywood house",
        ),
      }));
    const originalStationNames = new Set<string>(
      originalGenres.flatMap((genre) =>
        genre.styles.map((style) => style.name),
      ),
    );
    const originalArtwork = Object.fromEntries(
      Object.entries(locomoMusicStationArtwork).filter(([station]) =>
        originalStationNames.has(station),
      ),
    );
    const originalDarkArtwork = Object.fromEntries(
      Object.entries(locomoMusicDarkStationArtwork).filter(([station]) =>
        originalStationNames.has(station),
      ),
    );

    expect(sha256(originalGenres)).toBe(
      "684b13852cccdc45ff311c8987c12d761e5f8befbb64845e848c640108d56c01",
    );
    expect(sha256(originalArtwork)).toBe(
      "800095340a6fbff2d617943ee8145273743af581595c5a3fd0a864e541f8ea8f",
    );
    expect(sha256(originalDarkArtwork)).toBe(
      "de03c3470198766677f22342ad5b96df1d83e6a1f517c112d54537c06dbb0466",
    );

    const stations = locomoMusicCategoryCatalogs.existing.categories
      .filter(
        (category) =>
          resolveLocomoMusicCategory(category.key)?.behavior.promptKind ===
          "existing-recipe",
      )
      .map((category) => category.name);
    const defaultMatrix = stations.flatMap((station) =>
      Array.from({ length: 16 }, (_, count) =>
        [false, true].map((instrumental) =>
          withoutCategoryKey(
            createStationGenerationRequest(
              [station],
              instrumental,
              count,
            )!,
          ),
        ),
      ),
    );
    const v1Matrix = stations.flatMap((station) =>
      Array.from({ length: 4 }, (_, count) =>
        [false, true].map((instrumental) =>
          withoutCategoryKey(
            createStationGenerationRequestForRecipe(
              [station],
              instrumental,
              count,
              "v1",
            )!,
          ),
        ),
      ),
    );

    expect(sha256(defaultMatrix)).toBe(
      "badc7532ae476949ce4e5fa6222e7e18bcf621eb27d60b7098b124bf9c16e488",
    );
    expect(sha256(v1Matrix)).toBe(
      "4e6c56853165e82ba3407f15fd59ca9a36a0917ca35c793347f159b522c00853",
    );
  });

  it("keeps Latin house and Latin techno in Existing with recipe prompts and BPM cycles", () => {
    const cases = [
      {
        bpm: [122, 124, 126, 128],
        key: "existing/latin-house" as const,
        name: "Latin house",
        production: "Modern Latin house with a firm four-on-the-floor foundation",
        vocal:
          "Latin-house vocals and lyrics entirely in natural contemporary Spanish",
      },
      {
        bpm: [128, 130, 132, 134],
        key: "existing/latin-techno" as const,
        name: "Latin techno",
        production: "Modern Latin techno with precise machine propulsion",
        vocal:
          "Latin-techno vocals and lyrics entirely in natural contemporary Spanish",
      },
    ];

    cases.forEach((expected) => {
      const category = resolveLocomoMusicCategory(expected.key);
      expect(category).toMatchObject({
        group: "Latin Electronic",
        key: expected.key,
        name: expected.name,
        set: "existing",
      });
      expect(category?.behavior).toMatchObject({
        bpmCycle: expected.bpm,
        promptKind: "existing-recipe",
      });
      expect(
        locomoMusicCategoryCatalogs.experimental.categories.some(
          (candidate) => candidate.name === expected.name,
        ),
      ).toBe(false);

      const vocal = createCategoryGenerationRequest(expected.key, false, 0);
      const instrumental = createCategoryGenerationRequest(
        expected.key,
        true,
        0,
      );
      expect(vocal).toMatchObject({
        bpm: expected.bpm[0],
        categoryKey: expected.key,
        lyrics: "__AUTO__",
        station: expected.name,
      });
      if (expected.key === "existing/latin-house") {
        expect(vocal?.prompt).toBe(
          TEMPORARY_LATIN_HOUSE_LYRICS_ON_PROMPT,
        );
        const rollback = createLatinHouseV23V1RollbackRequest(false, 0);
        expect(rollback?.prompt).toContain(expected.production);
        expect(rollback?.prompt).toContain(expected.vocal);
        expect(rollback?.prompt).not.toBe(vocal?.prompt);
      } else {
        expect(vocal?.prompt).toContain(expected.production);
        expect(vocal?.prompt).toContain(expected.vocal);
      }
      expect(vocal?.prompt).not.toMatch(
        /English|Spanglish|bilingual|code[- ]?switch/i,
      );
      expect(instrumental).toMatchObject({
        bpm: expected.bpm[0],
        categoryKey: expected.key,
        lyrics: "",
        station: expected.name,
      });
      expect(instrumental?.prompt).toContain(expected.production);
      expect(instrumental?.prompt).not.toContain(expected.vocal);
    });
  });

  it("temporarily fixes only Latin house lyrics-on prompt content", () => {
    const vocal = createCategoryGenerationRequest(
      "existing/latin-house",
      false,
      5,
      173,
    );
    const instrumental = createCategoryGenerationRequest(
      "existing/latin-house",
      true,
      5,
      173,
    );
    const rollbackInstrumental = createLatinHouseV23V1RollbackRequest(
      true,
      5,
      173,
    );

    expect(vocal).toMatchObject({
      bpm: 124,
      duration: 173,
      lyrics: "__AUTO__",
      prompt: TEMPORARY_LATIN_HOUSE_LYRICS_ON_PROMPT,
    });
    expect(instrumental).toEqual(rollbackInstrumental);
  });

  it("keeps every incoming Existing station fixed, language-correct, and strict across the lyrics toggle", () => {
    const bannedInstrumentalLanguage =
      /vocal|lyric|sing|rapper|voice|language/i;

    approvedIncomingExistingPrompts.forEach((expected) => {
      const category = resolveLocomoMusicCategory(expected.key);
      expect(category).toMatchObject({
        group: expect.any(String),
        key: expected.key,
        name: expected.name,
        set: "existing",
      });
      expect(category?.artist).toBe(expected.artist);
      expect(category?.behavior).toMatchObject({
        bpmCycle: [],
        duration: 120,
        promptKind: "fixed",
      });
      expect(category?.artwork).toEqual({
        dark: locomoMusicDarkStationArtwork[expected.art],
        light: locomoMusicStationArtwork[expected.art],
      });
      expect(
        locomoMusicCategoryCatalogs.experimental.categories.some(
          (candidate) => candidate.name === expected.name,
        ),
      ).toBe(false);

      [0, 1, 4, 5, 17].forEach((count) => {
        const vocal = createCategoryGenerationRequest(
          expected.key,
          false,
          count,
        );
        const instrumental = createCategoryGenerationRequest(
          expected.key,
          true,
          count,
        );
        expect(vocal).toEqual({
          categoryKey: expected.key,
          duration: 120,
          lyrics: "__AUTO__",
          mode: "create",
          prompt: expected.on,
          promptRecipeVersion: "custom",
          station: expected.name,
        });
        expect(instrumental).toEqual({
          categoryKey: expected.key,
          duration: 120,
          lyrics: "",
          mode: "create",
          prompt: expected.off,
          promptRecipeVersion: "custom",
          station: expected.name,
        });
        expect(instrumental?.prompt).not.toMatch(
          bannedInstrumentalLanguage,
        );
        expect(
          resolveMusicVocalLanguage({
            categoryKey: expected.key,
            lyrics: vocal!.lyrics,
          }),
        ).toBe(expected.language);
        expect(
          resolveMusicVocalLanguage({
            categoryKey: expected.key,
            lyrics: instrumental!.lyrics,
          }),
        ).toBe("en");
      });

      expect(
        createStationGenerationRequest([expected.name], false, 5),
      ).toEqual(
        createCategoryGenerationRequest(expected.key, false, 5),
      );
      expect(
        createStationGenerationRequest([expected.name], true, 5),
      ).toEqual(
        createCategoryGenerationRequest(expected.key, true, 5),
      );
    });
  });

  it("uses each exact approved fixed prompt without hidden variation", () => {
    approvedExperimentalPrompts.forEach((expected) => {
      const category = resolveLocomoMusicCategory(expected.key);
      expect(category).toMatchObject({
        key: expected.key,
        name: expected.name,
        set: "experimental",
      });
      expect(category?.artist).toBe(expected.artist);
      expect(category?.behavior).toMatchObject({
        bpmCycle: [],
        duration: 120,
        promptKind: "fixed",
      });

      [0, 1, 15].forEach((count) => {
        expect(
          createCategoryGenerationRequest(expected.key, false, count),
        ).toEqual({
          categoryKey: expected.key,
          duration: 120,
          lyrics: "__AUTO__",
          mode: "create",
          prompt: expected.on,
          promptRecipeVersion: "custom",
          station: expected.name,
        });
        expect(
          createCategoryGenerationRequest(expected.key, true, count),
        ).toEqual({
          categoryKey: expected.key,
          duration: 120,
          lyrics: "",
          mode: "create",
          prompt: expected.off,
          promptRecipeVersion: "custom",
          station: expected.name,
        });
      });
      if (expected.artist) {
        expect(expected.on).toContain(expected.artist);
        expect(expected.off).toContain(expected.artist);
      }
    });
  });

  it("isolates tracks and behavior by composite key even when names or prompts collide", () => {
    const samePrompt = "Same Name. Deliberately identical prompt.";
    const tracks = [
      {
        categoryKey: "existing/house" as const,
        id: "existing-track",
        prompt: samePrompt,
      },
      {
        categoryKey: "experimental/narrative-pop" as const,
        id: "experimental-track",
        prompt: samePrompt,
      },
      {
        categoryKey: "experimental/future-french-house" as const,
        id: "future-french-house-track",
        prompt: samePrompt,
      },
      { categoryKey: null, id: "unknown-track", prompt: samePrompt },
    ];

    expect(filterTracksForCategory(tracks, "existing/house")).toEqual([
      tracks[0],
    ]);
    expect(
      seedCategoryPlaylist(tracks, "experimental/narrative-pop").playlist,
    ).toEqual(["experimental-track"]);
    expect(
      seedCategoryPlaylist(
        tracks,
        "experimental/future-french-house",
      ).playlist,
    ).toEqual(["future-french-house-track"]);
    expect(
      generationResultMatchesSelection(
        {
          categoryKey: "existing/house",
          selectionEpoch: 4,
        },
        "experimental/narrative-pop",
        4,
      ),
    ).toBe(false);
  });

  it("clears switch-local radio state, retains preferences, and rejects stale in-flight results", () => {
    const reset = switchRadioCategorySet(
      {
        autoCreate: true,
        categoryKey: "existing/house",
        categorySet: "existing",
        generationQueue: ["queued"],
        instrumental: true,
        pendingJump: "pending",
        playingTrackID: "playing",
        playlist: ["one", "two"],
        progress: 42,
        selectedTrackID: "selected",
        selectionEpoch: 8,
      },
      "experimental",
    );

    expect(reset).toEqual({
      autoCreate: true,
      categoryKey: undefined,
      categorySet: "experimental",
      generationQueue: [],
      instrumental: true,
      pendingJump: undefined,
      playingTrackID: undefined,
      playlist: [],
      progress: 0,
      selectedTrackID: undefined,
      selectionEpoch: 9,
    });
    expect(
      generationResultMatchesSelection(
        { categoryKey: "existing/house", selectionEpoch: 8 },
        "existing/house",
        reset.selectionEpoch,
      ),
    ).toBe(false);
  });

  it("restarts Auto-create after stale work drains without duplicating queued work", () => {
    expect(
      shouldGenerateAfterQueueDrain({
        autoCreate: true,
        categoryKey: "experimental/narrative-pop",
        disposed: false,
        queuedRequests: 0,
      }),
    ).toBe(true);
    expect(
      shouldGenerateAfterQueueDrain({
        autoCreate: true,
        categoryKey: "experimental/narrative-pop",
        disposed: false,
        queuedRequests: 1,
      }),
    ).toBe(false);
    expect(
      shouldGenerateAfterQueueDrain({
        autoCreate: false,
        categoryKey: "experimental/narrative-pop",
        disposed: false,
        queuedRequests: 0,
      }),
    ).toBe(false);
  });
});
