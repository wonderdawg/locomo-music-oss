import { describe, expect, it } from "vitest";

import { locomoMusicCategoryCatalogs } from "../src/renderer/category-catalog";
import { locomoMusicGenres } from "../src/renderer/music-data";
import {
  LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  locomoMusicActivePromptRecipeByStation,
  locomoMusicStationPromptRecipes,
  type LocomoMusicStationPromptRecipes,
} from "../src/renderer/prompt-recipes";
import {
  countStationTrackVariations,
  createStationGenerationRequest,
  createStationGenerationRequestForRecipe,
} from "../src/renderer/radio";
import { existingCategoryKeyForName } from "../src/shared/music-categories";

const stationGroups = [
  {
    name: "Pop",
    stations: ["Synth-pop", "Dance-pop", "Indie pop"],
  },
  {
    name: "Rock",
    stations: ["Classic rock", "Punk rock", "Alternative"],
  },
  {
    name: "Hip-hop",
    stations: ["Boom bap", "Trap", "Lo-fi hip-hop"],
  },
  {
    name: "R&B",
    stations: ["Neo-soul", "Modern R&B", "New jack swing"],
  },
  {
    name: "Country",
    stations: ["Bluegrass", "Outlaw", "Country pop"],
  },
  {
    name: "Jazz",
    stations: ["Bebop", "Cool jazz", "Jazz fusion"],
  },
  {
    name: "Electronic",
    stations: ["House", "Bollywood house", "Techno", "Ambient"],
  },
  {
    name: "Latin Electronic",
    stations: ["Latin house", "Latin techno"],
  },
  {
    name: "Classical",
    stations: ["Baroque", "Romantic", "Minimalist"],
  },
  {
    name: "Folk",
    stations: ["Americana", "Celtic folk", "Indie folk"],
  },
  {
    name: "Metal",
    stations: ["Thrash metal", "Doom metal", "Progressive metal"],
  },
] as const;

const stationNames = stationGroups.flatMap((group) => group.stations);
const activeStationNames = locomoMusicCategoryCatalogs.existing.categories.map(
  (category) => category.name,
);

const bpmCycles: Readonly<Record<string, readonly number[]>> = {
  "Bollywood house": [122, 124, 126, 128],
  House: [120, 122, 124, 126],
  "Latin house": [122, 124, 126, 128],
  "Latin techno": [128, 130, 132, 134],
};

const expectedBpm = (station: string, count: number) => {
  const cycle = bpmCycles[station];
  return cycle?.[count % cycle.length];
};

const expectedV1StylePrompts: Record<string, string> = {
  "Synth-pop":
    "Polished synth-pop with luminous analog synthesizers, electronic drums, a strong melodic hook, warm bass, and a memorable chorus.",
  "Dance-pop":
    "Energetic dance-pop with a four-on-the-floor pulse, bright hooks, crisp modern drums, buoyant bass, and a euphoric polished chorus.",
  "Indie pop":
    "Characterful indie pop with organic textures, understated drums, melodic guitars, intimate energy, and an inventive memorable hook.",
  "Classic rock":
    "Classic rock with expressive electric guitars, live punchy drums, driving bass, blues-rooted riffs, dynamic solos, and a powerful chorus.",
  "Punk rock":
    "Fast raw punk rock with urgent power chords, aggressive live drums, lean bass, rebellious energy, and a direct shout-along hook.",
  Alternative:
    "Modern alternative rock with distinctive guitar textures, muscular drums, moody dynamics, unconventional details, and an emotionally charged chorus.",
  "Boom bap":
    "Raw boom-bap hip-hop with hard sampled drums, dusty breakbeats, deep bass, sparse chopped soul textures, head-nod swing, and no chiptune or video-game sounds.",
  Trap:
    "Dark modern hip-hop trap track with massive sub-bass, hard kicks, sharp snare, intricate rolling hi-hats, a sparse ominous minor-key motif, and no retro chiptune or video-game sounds.",
  "Lo-fi hip-hop":
    "Warm lo-fi hip-hop with dusty relaxed drums, mellow jazz chords, soft bass, subtle vinyl texture, laid-back human swing, and no chiptune or video-game melodies.",
  "Neo-soul":
    "Organic neo-soul with rich extended chords, deep pocket drums, warm electric piano, expressive bass, human timing, and intimate soulful melodies.",
  "Modern R&B":
    "Contemporary R&B with deep smooth bass, tight understated drums, atmospheric textures, intimate melodies, rich harmony, and polished spacious production.",
  "New jack swing":
    "New jack swing with syncopated punchy drum-machine grooves, bright keyboard stabs, funky bass, energetic rhythmic hooks, and glossy late-eighties R&B production.",
  Bluegrass:
    "Fast acoustic country bluegrass with driving banjo, fiddle, mandolin, flatpicked guitar, upright bass, tight live ensemble interplay, virtuosic breaks, and energetic high-lonesome character.",
  Outlaw:
    "Outlaw country with gritty vocals, raw electric and acoustic guitars, steady live drums, road-worn atmosphere, defiant storytelling, and unpolished organic production.",
  "Country pop":
    "Modern country-pop with warm acoustic guitar, melodic electric guitar, punchy drums, bright polished production, accessible storytelling, and a huge memorable chorus.",
  Bebop:
    "Fast acoustic bebop with agile horn lines, walking upright bass, syncopated ride cymbal, complex harmony, virtuosic improvisation, and lively ensemble interplay.",
  "Cool jazz":
    "Spacious cool jazz with restrained horns, subtle brushed drums, lyrical phrasing, understated upright bass, sophisticated harmony, and intimate room ambience.",
  "Jazz fusion":
    "Adventurous jazz fusion with electric keys, muscular bass, intricate drums, expressive lead improvisation, shifting rhythms, and detailed modern production.",
  House:
    "Driving house music with a powerful four-on-the-floor kick, warm rolling bass, syncopated percussion, soulful chord stabs, gradual builds, and a polished club mix.",
  "Bollywood house":
    "Modern Bollywood house with a firm four-on-the-floor kick, warm rolling bass, polished Indian film-pop harmony, expressive melodic hooks, selective tabla and dholak accents, restrained bansuri or plucked-string colors, bright synth and piano stabs, and spacious contemporary dancefloor production; house first, not generic festival EDM, bhangra, or a traditional ensemble.",
  Techno:
    "Hypnotic techno with relentless precise drums, dark pulsing bass, evolving industrial textures, minimal melodic content, tension-building automation, and a powerful club mix.",
  Ambient:
    "Immersive ambient electronic music with slowly evolving pads, spacious harmonic movement, delicate organic textures, minimal percussion, and a deep atmospheric sound field.",
  "Latin house":
    "Modern Latin house with a firm four-on-the-floor kick, warm syncopated bass, congas, timbales, claves and güiro, bright piano or organ stabs, soulful rhythmic energy, gradual club builds, and a spacious contemporary mix; house rather than reggaetón or conventional salsa.",
  "Latin techno":
    "Modern Latin techno with a precise driving kick, rolling sub pressure, dark hypnotic sequencing, tightly interlocked congas, timbales, claves and güiro, sparse tension-building automation, and disciplined underground club production; techno rather than reggaetón, salsa-pop, or a horn-band arrangement.",
  Baroque:
    "Elegant Baroque chamber music with contrapuntal melodic lines, harpsichord continuo, articulated strings, formal development, and historically inspired acoustic detail.",
  Romantic:
    "Sweeping Romantic orchestral music with expansive melody, rich chromatic harmony, dramatic dynamic contrasts, expressive strings, and an emotionally passionate arc.",
  Minimalist:
    "Modern minimalist classical music with repeating motifs, gradual harmonic change, precise layered rhythms, restrained instrumentation, and hypnotic evolving momentum.",
  Americana:
    "Earthy Americana with acoustic guitar, mandolin, restrained live drums, rootsy bass, weathered melodic character, and warm organic room production.",
  "Celtic folk":
    "Traditional Celtic folk with fiddle, tin whistle, acoustic strings, hand percussion, modal melodies, lively dance rhythm, and natural ensemble performance.",
  "Indie folk":
    "Intimate indie folk with fingerpicked acoustic guitar, soft organic textures, understated percussion, vulnerable melody, natural human timing, and warm close production.",
  "Thrash metal":
    "Ferocious thrash metal with rapid palm-muted riffs, aggressive live drums, fast double-kick patterns, snarling bass, sharp transitions, and relentless forward momentum.",
  "Doom metal":
    "Crushing doom metal with extremely heavy slow riffs, massive distorted guitars, cavernous drums, ominous bass, bleak atmosphere, and patient dramatic weight.",
  "Progressive metal":
    "Technical progressive metal with complex shifting meters, precise low-tuned riffs, virtuosic drums, atmospheric contrasts, evolving structure, and polished powerful production.",
};

const expectedV1VocalPrompts: Record<string, string> = {
  Pop:
    "English pop vocals with clear natural phrasing, a distinctive melodic personality, concise verses, and an immediately memorable sung chorus.",
  Rock:
    "English rock vocals with forceful natural delivery, clear words, dynamic emotion, concise verses, and a powerful singable chorus.",
  "Hip-hop":
    "English rap vocals with a natural modern flow, tight rhythmic pocket, clear intelligible words, confident human delivery, concise bars, and a memorable hook; no robotic, theatrical, or sing-song cadence.",
  "R&B":
    "English R&B vocals with soulful natural phrasing, intimate human delivery, tasteful runs, clear words, compact verses, and a smooth memorable hook.",
  Country:
    "English country vocals with natural conversational storytelling, clear words, grounded emotional delivery, concrete imagery, and a strong singable chorus.",
  Jazz:
    "English jazz vocals with relaxed behind-the-beat phrasing, clear lyrics, expressive human nuance, melodic improvisational character, and an elegant refrain.",
  Electronic:
    "English electronic-pop vocals with clean rhythmic phrasing, concise evocative lyrics, a distinctive human tone, and a short hook that integrates naturally with the production.",
  "Latin Electronic":
    "Electronic vocals and lyrics entirely in natural contemporary Spanish, with clear rhythmic phrasing, concise human lines, expressive call-and-response, and melodic hooks integrated into the club groove.",
  Classical:
    "English classical vocals with clear diction, lyrical melodic phrasing, emotionally coherent text, natural breath, and a composed recurring theme.",
  Folk:
    "English folk vocals with intimate natural storytelling, clear plainspoken words, vivid human detail, restrained delivery, and an emotionally direct refrain.",
  Metal:
    "English metal vocals with intense controlled delivery, rhythmically precise phrasing, intelligible words, compact forceful lines, and a commanding recurring hook.",
};

function expectedV1VocalPrompt(station: string, group: string) {
  if (station === "Bollywood house") {
    return "Bollywood-house vocals and lyrics entirely in natural contemporary Hindi, with expressive melodic phrasing, clear human diction, intimate emotional detail, a soaring film-pop hook, and responsive harmonies integrated with the house groove.";
  }
  return expectedV1VocalPrompts[group];
}

const promptRecipes =
  locomoMusicStationPromptRecipes as Readonly<
    Record<string, LocomoMusicStationPromptRecipes>
  >;
const activeRecipeStationNames = activeStationNames.filter(
  (station) => promptRecipes[station] !== undefined,
);
const approvedIndiePopInstrumentalPrompt =
  "Instrumental indie pop song with clean, spacious high-fidelity production, natural dynamics, clear separation, and a polished full-range mix.";

describe("station prompt recipes", () => {
  it("retains every exact V1 style and vocal recipe", () => {
    expect(Object.keys(promptRecipes)).toEqual(stationNames);
    expect(Object.keys(expectedV1StylePrompts)).toEqual(stationNames);

    stationGroups.forEach((group) => {
      group.stations.forEach((station) => {
        expect(promptRecipes[station]?.v1).toEqual({
          stylePrompt: expectedV1StylePrompts[station],
          vocalPrompt: expectedV1VocalPrompt(station, group.name),
        });
        expect(Object.isFrozen(promptRecipes[station]?.v1)).toBe(true);
      });
    });
  });

  it("selects V1 with the exact old prompt path and no V2.3 additions", () => {
    const allV23Additions = Object.values(promptRecipes).flatMap(
      (recipe) => [
        ...recipe["v2.3"].anchors,
        ...recipe["v2.3"].lyricDirections,
      ],
    );

    stationGroups.forEach((group) => {
      group.stations.forEach((station) => {
        if (!activeRecipeStationNames.includes(station)) return;
        const vocal = createStationGenerationRequestForRecipe(
          [station],
          false,
          11,
          "v1",
        );
        const instrumental = createStationGenerationRequestForRecipe(
          [station],
          true,
          11,
          "v1",
        );
        const stylePrompt = expectedV1StylePrompts[station];
        const vocalPrompt = expectedV1VocalPrompt(station, group.name);

        expect(vocal).toEqual({
          categoryKey: existingCategoryKeyForName(station),
          mode: "create",
          station,
          prompt: `${station}. ${group.name} ${station} track. ${stylePrompt} ${vocalPrompt}`,
          promptRecipeVersion: "v1",
          lyrics: "__AUTO__",
          duration: 120,
          bpm: expectedBpm(station, 11),
        });
        expect(instrumental).toEqual({
          categoryKey: existingCategoryKeyForName(station),
          mode: "create",
          station,
          prompt:
            station === "Indie pop"
              ? approvedIndiePopInstrumentalPrompt
              : `${station}. ${group.name} ${station} track. ${stylePrompt}`,
          promptRecipeVersion: "v1",
          lyrics: "",
          duration: 120,
          bpm: expectedBpm(station, 11),
        });
        allV23Additions.forEach((addition) => {
          expect(vocal?.prompt).not.toContain(addition);
          expect(instrumental?.prompt).not.toContain(addition);
        });
      });
    });
  });

  it("keeps the exact legacy recipe source and activates V2.3", () => {
    expect(
      locomoMusicGenres.map((genre) => ({
        name: genre.name,
        stations: genre.styles.map((style) => style.name),
      })),
    ).toEqual(stationGroups);
    expect(LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE).toBe("v2.3");
    expect(Object.keys(locomoMusicActivePromptRecipeByStation)).toEqual(
      stationNames,
    );
    expect(
      Object.values(locomoMusicActivePromptRecipeByStation),
    ).toEqual(Array.from({ length: stationNames.length }, () => "v2.3"));
  });

  it("interleaves the exact V1 prompt on every fifth eligible Existing vocal", () => {
    const excludedStations = new Set([
      "Baroque",
      "Romantic",
      "Minimalist",
      "Celtic folk",
    ]);
    const eligibleStations = stationNames.filter(
      (station) =>
        locomoMusicActivePromptRecipeByStation[station] === "v2.3" &&
        !excludedStations.has(station),
    );

    expect(eligibleStations).toHaveLength(29);
    eligibleStations.forEach((station) => {
      Array.from({ length: 10 }, (_, vocal) => {
        const instrumental = Math.floor(vocal / 3);
        const stationTrackState = {
          total: vocal + instrumental,
          vocal,
          instrumental,
        };

        expect(
          createStationGenerationRequest(
            [station],
            false,
            stationTrackState,
          ),
        ).toEqual(
          createStationGenerationRequestForRecipe(
            [station],
            false,
            stationTrackState,
            (vocal + 1) % 5 === 0 ? "v1" : "v2.3",
          ),
        );
      });
    });

    ["Baroque", "Romantic", "Minimalist", "Celtic folk"].forEach(
      (station) => {
        const stationTrackState = {
          total: 5,
          vocal: 4,
          instrumental: 1,
        };
        expect(
          createStationGenerationRequest(
            [station],
            false,
            stationTrackState,
          ),
        ).toEqual(
          createStationGenerationRequestForRecipe(
            [station],
            false,
            stationTrackState,
            "v2.3",
          ),
        );
      },
    );
  });

  it("lets only the Lyrics toggle choose an instrumental request", () => {
    const fifthVocalPending = {
      total: 5,
      vocal: 4,
      instrumental: 1,
    };
    expect(
      createStationGenerationRequest(
        ["House"],
        true,
        fifthVocalPending,
      ),
    ).toEqual(
      createStationGenerationRequestForRecipe(
        ["House"],
        true,
        fifthVocalPending,
        "v2.3",
      ),
    );

    const afterExplicitInstrumental = {
      total: 6,
      vocal: 4,
      instrumental: 2,
    };
    expect(
      createStationGenerationRequest(
        ["House"],
        false,
        afterExplicitInstrumental,
      ),
    ).toEqual(
      createStationGenerationRequestForRecipe(
        ["House"],
        false,
        afterExplicitInstrumental,
        "v1",
      ),
    );

    const lyricsOnAfterThreeInstrumentals = {
      total: 7,
      vocal: 4,
      instrumental: 3,
    };
    expect(
      createStationGenerationRequest(
        ["House"],
        false,
        lyricsOnAfterThreeInstrumentals,
      ),
    ).toEqual(
      createStationGenerationRequestForRecipe(
        ["House"],
        false,
        lyricsOnAfterThreeInstrumentals,
        "v1",
      ),
    );

    const nextLyricsOn = {
      total: 8,
      vocal: 5,
      instrumental: 3,
    };
    expect(
      createStationGenerationRequest(
        ["House"],
        false,
        nextLyricsOn,
      ),
    ).toEqual(
      createStationGenerationRequestForRecipe(
        ["House"],
        false,
        nextLyricsOn,
        "v2.3",
      ),
    );
  });

  it("restores Indie folk V2.3 variation with periodic V1 interleave", () => {
    Array.from({ length: 10 }, (_, vocal) => {
      const stationTrackState = {
        instrumental: Math.floor(vocal / 3),
        total: vocal + Math.floor(vocal / 3),
        vocal,
      };

      expect(
        createStationGenerationRequest(
          ["Indie folk"],
          false,
          stationTrackState,
        ),
      ).toEqual(
        createStationGenerationRequestForRecipe(
          ["Indie folk"],
          false,
          stationTrackState,
          (vocal + 1) % 5 === 0 ? "v1" : "v2.3",
        ),
      );
    });

    const lyricsOffState = { instrumental: 2, total: 6, vocal: 4 };
    expect(
      createStationGenerationRequest(
        ["Indie folk"],
        true,
        lyricsOffState,
      ),
    ).toEqual(
      createStationGenerationRequestForRecipe(
        ["Indie folk"],
        true,
        lyricsOffState,
        "v2.3",
      ),
    );
  });
});

describe("V2.3 station variation", () => {
  it("gives every station a complete, concise, station-specific recipe", () => {
    const allAnchors = new Set<string>();
    const allLyricDirections = new Set<string>();
    const stationsWithDedicatedInstrumentals: string[] = [];
    const prohibitedStructureLanguage =
      /\b(complete|one-minute|intro|verse|chorus|bridge|breakdown|climax|final|outro|ending|duration|jingle|commercial)\b/i;

    stationNames.forEach((station) => {
      const recipe = promptRecipes[station]?.["v2.3"];

      expect(recipe).toBeDefined();
      expect(recipe?.productionIdentity.length).toBeGreaterThan(20);
      expect(recipe?.vocalPrompt.length).toBeGreaterThan(20);
      expect(recipe?.anchors).toHaveLength(4);
      expect(new Set(recipe?.anchors).size).toBe(4);
      expect(recipe?.lyricDirections).toHaveLength(3);
      expect(new Set(recipe?.lyricDirections).size).toBe(3);
      expect(recipe?.lyricDirections[0]).toMatch(
        /sadness and (?:melancholy|longing|alienation)/,
      );
      expect(recipe?.lyricDirections[1]).toMatch(
        /(?:self-affirmation and aspiration|joy and self-affirmation|defiance and self-possession)/,
      );
      expect(recipe?.lyricDirections[2]).toMatch(
        /philosophical idea/,
      );
      expect(
        [
          recipe?.productionIdentity,
          recipe?.vocalPrompt,
          ...(recipe?.anchors ?? []),
          ...(recipe?.lyricDirections ?? []),
        ].join(" "),
      ).not.toMatch(prohibitedStructureLanguage);
      expect(Object.isFrozen(recipe)).toBe(true);
      expect(Object.isFrozen(recipe?.anchors)).toBe(true);
      expect(Object.isFrozen(recipe?.lyricDirections)).toBe(true);
      if (recipe?.instrumental) {
        stationsWithDedicatedInstrumentals.push(station);
        expect(
          recipe.instrumental.productionIdentity.length,
        ).toBeGreaterThan(20);
        expect(recipe.instrumental.anchors).toHaveLength(4);
        expect(new Set(recipe.instrumental.anchors).size).toBe(4);
        expect(Object.isFrozen(recipe.instrumental)).toBe(true);
        expect(Object.isFrozen(recipe.instrumental.anchors)).toBe(true);
        expect(
          [
            recipe.instrumental.productionIdentity,
            ...recipe.instrumental.anchors,
          ].join(" "),
        ).not.toMatch(prohibitedStructureLanguage);
      }

      recipe?.anchors.forEach((anchor) => allAnchors.add(anchor));
      recipe?.lyricDirections.forEach((direction) =>
        allLyricDirections.add(direction),
      );
    });

    expect(allAnchors.size).toBe(132);
    expect(allLyricDirections.size).toBe(99);
    expect(stationsWithDedicatedInstrumentals).toEqual(["Indie pop"]);
  });

  it("keeps Lyrics On vocal across the deterministic 16-track cycle", () => {
    const everyLyricDirection = Object.values(promptRecipes).flatMap(
      (recipe) => recipe["v2.3"].lyricDirections,
    );

    activeRecipeStationNames.forEach((station) => {
      const recipe = promptRecipes[station]!["v2.3"];
      const history: Array<{ readonly lyrics: string }> = [];
      const requests = Array.from({ length: 17 }, () => {
        const request = createStationGenerationRequestForRecipe(
          [station],
          false,
          countStationTrackVariations(history),
          "v2.3",
        )!;
        history.push({
          lyrics: request.lyrics === "" ? "" : "generated vocal",
        });
        return request;
      });
      const instrumentalPositions = requests
        .slice(0, 16)
        .flatMap((request, index) =>
          request.lyrics === "" ? [index] : [],
        );
      const vocalRequests = requests
        .slice(0, 16)
        .filter((request) => request.lyrics === "__AUTO__");
      const instrumentalRequests = requests
        .slice(0, 16)
        .filter((request) => request.lyrics === "");

      expect(instrumentalPositions).toEqual([]);
      expect(vocalRequests).toHaveLength(16);
      expect(instrumentalRequests).toHaveLength(0);
      requests.slice(0, 16).forEach((request, count) => {
        expect(request).toMatchObject({
          mode: "create",
          station,
          duration: 120,
        });
        expect(request.bpm).toBe(expectedBpm(station, count));
      });

      const observedPairings = vocalRequests.map((request, count) => {
        const prompt = request.prompt;
        const anchors = recipe.anchors.filter((anchor) =>
          prompt.includes(anchor),
        );
        const lyricDirections = recipe.lyricDirections.filter(
          (direction) => prompt.includes(direction),
        );

        expect(anchors).toEqual([recipe.anchors[count % 4]]);
        expect(lyricDirections).toEqual([
          recipe.lyricDirections[count % 3],
        ]);
        return `${anchors[0]}\n${lyricDirections[0]}`;
      });
      const expectedPairings = recipe.anchors.flatMap((anchor) =>
        recipe.lyricDirections.map(
          (direction) => `${anchor}\n${direction}`,
        ),
      );

      expect(new Set(observedPairings)).toEqual(
        new Set(expectedPairings),
      );
      expect(requests[12]?.prompt).toBe(vocalRequests[0]?.prompt);

      instrumentalRequests.forEach((request, index) => {
        const instrumentalAnchors =
          recipe.instrumental?.anchors ?? recipe.anchors;
        expect(
          instrumentalAnchors.filter((anchor) =>
            request.prompt.includes(anchor),
          ),
        ).toEqual([instrumentalAnchors[index]]);
        if (recipe.instrumental) {
          expect(request.prompt).toContain(
            recipe.instrumental.productionIdentity,
          );
        }
        everyLyricDirection.forEach((direction) => {
          expect(request.prompt).not.toContain(direction);
        });
      });
    });
  });

  it("keeps every V2.3 track instrumental when lyrics are off", () => {
    const everyLyricDirection = Object.values(promptRecipes).flatMap(
      (recipe) => recipe["v2.3"].lyricDirections,
    );

    activeRecipeStationNames.forEach((station) => {
      const recipe = promptRecipes[station]!["v2.3"];
      const instrumentalAnchors =
        recipe.instrumental?.anchors ?? recipe.anchors;
      const history: Array<{ readonly lyrics: string }> = [];

      Array.from({ length: 16 }, (_, count) => {
        const request = createStationGenerationRequestForRecipe(
          [station],
          true,
          countStationTrackVariations(history),
          "v2.3",
        );
        history.push({ lyrics: request?.lyrics ?? "" });

        expect(request?.lyrics).toBe("");
        if (station === "Indie pop") {
          expect(request?.prompt).toBe(
            approvedIndiePopInstrumentalPrompt,
          );
        } else {
          expect(
            instrumentalAnchors.filter((anchor) =>
              request?.prompt.includes(anchor),
            ),
          ).toEqual([instrumentalAnchors[count % 4]]);
        }
        if (recipe.instrumental && station !== "Indie pop") {
          expect(request?.prompt).toContain(
            recipe.instrumental.productionIdentity,
          );
        }
        everyLyricDirection.forEach((direction) => {
          expect(request?.prompt).not.toContain(direction);
        });
      });
    });
  });

  it("leaves generation duration, mode, lyrics, and station BPM unchanged", () => {
    activeStationNames.forEach((station) => {
      const vocal = createStationGenerationRequest(
        [station],
        false,
        5,
      );
      const instrumental = createStationGenerationRequest(
        [station],
        true,
        5,
      );

      expect(vocal).toMatchObject({
        mode: "create",
        station,
        lyrics: "__AUTO__",
        duration: 120,
      });
      expect(instrumental).toMatchObject({
        mode: "create",
        station,
        lyrics: "",
        duration: 120,
      });
      expect(vocal?.bpm).toBe(expectedBpm(station, 5));
      expect(instrumental?.bpm).toBe(expectedBpm(station, 5));
    });
  });
});

describe("approved Indie pop V2.3 reference", () => {
  it("remains byte-for-byte equivalent to the approved content", () => {
    expect(promptRecipes["Indie pop"]?.["v2.3"]).toEqual({
      productionIdentity:
        "Characterful indie pop with organic close-miked textures, understated live drums, warm bass, intimate energy, inventive melodic details, and slightly imperfect bedroom-studio production.",
      vocalPrompt:
        "English pop vocals with clear natural phrasing and a distinctive melodic personality.",
      anchors: [
        "The defining musical detail is a distinctive guitar figure. Let it recur through repeated organic waves: close, lightly played restraint gives way to fuller guitar-and-drum surges, then the band eases back before gathering force again.",
        "The defining musical detail is an intimate vocal melody with loose harmonies. Close voice and spare guitar repeatedly draw the band inward, then open into harmony-rich ensemble swells that relax and rise again.",
        "The defining musical detail is a warm, slightly off-kilter bass-and-drum groove. Picked bass and straight live drums repeatedly tighten into restrained pockets, then push the whole band into emotionally charged lifts before releasing into lean motion again.",
        "The defining musical detail is a simple piano, organ, or analog-synth phrase. Let it pass between exposed, intimate spaces and fuller guitar-keyboard ensemble swells, repeatedly falling away and gathering emotional force again.",
      ],
      lyricDirections: [
        "The lyrics approach sadness and melancholy through intimate details and longing held in restraint, while recurring flashes of catharsis press against that composure; keep the language lived-in, natural, and emotionally ambiguous.",
        "The lyrics express self-affirmation and aspiration through earned confidence and forward motion, with doubt repeatedly testing conviction so every assertion feels specific, human, and hard-won rather than slogan-like.",
        "The lyrics explore a philosophical idea through concrete images, letting apparent certainty repeatedly loosen into wonder and renewed questioning; keep the voice natural, curious, and reflectively unresolved.",
      ],
      instrumental: {
        productionIdentity:
          "Melodic guitar-band instrumental indie pop with steady straight-eighth live drums, a crisp backbeat, supportive root-note electric bass, chiming and lightly overdriven guitars, occasional warm keyboard color, bittersweet harmony, and punchy slightly raw production. Compact instrumental passages repeatedly expand into bright full-band lifts, fall back to intimate guitar textures, and build again. Keep the rhythm direct, the melodic hooks concise, and the ensemble unmistakably indie pop.",
        anchors: [
          "A chiming single-note guitar theme returns in varied forms, starting exposed and delicate before doubled guitars and the full rhythm section widen it into a bright ensemble lift.",
          "Two clean electric guitars trade a concise melodic figure in imperfect harmony, moving between close bedroom-studio detail and fuller overdriven band surges.",
          "A bright guitar arpeggio and compact piano phrase alternate as the central hooks while steady drums and supportive bass carry the arrangement through restrained passages and open full-band releases.",
          "Lightly overdriven guitar chords establish a bittersweet progression, then a clear lead-guitar theme rises above the band as each return becomes broader, louder, and more emotionally charged.",
        ],
      },
    });

    expect(
      createStationGenerationRequestForRecipe(
        ["Indie pop"],
        false,
        0,
        "v2.3",
      )?.prompt,
    ).toBe(
      "Indie pop. Pop Indie pop track. Characterful indie pop with organic close-miked textures, understated live drums, warm bass, intimate energy, inventive melodic details, and slightly imperfect bedroom-studio production. The defining musical detail is a distinctive guitar figure. Let it recur through repeated organic waves: close, lightly played restraint gives way to fuller guitar-and-drum surges, then the band eases back before gathering force again. English pop vocals with clear natural phrasing and a distinctive melodic personality. The lyrics approach sadness and melancholy through intimate details and longing held in restraint, while recurring flashes of catharsis press against that composure; keep the language lived-in, natural, and emotionally ambiguous.",
    );
    expect(
      createStationGenerationRequestForRecipe(
        ["Indie pop"],
        false,
        {
          total: 14,
          vocal: 11,
          instrumental: 3,
        },
        "v2.3",
      )?.prompt,
    ).toBe(
      "Indie pop. Pop Indie pop track. Characterful indie pop with organic close-miked textures, understated live drums, warm bass, intimate energy, inventive melodic details, and slightly imperfect bedroom-studio production. The defining musical detail is a simple piano, organ, or analog-synth phrase. Let it pass between exposed, intimate spaces and fuller guitar-keyboard ensemble swells, repeatedly falling away and gathering emotional force again. English pop vocals with clear natural phrasing and a distinctive melodic personality. The lyrics explore a philosophical idea through concrete images, letting apparent certainty repeatedly loosen into wonder and renewed questioning; keep the voice natural, curious, and reflectively unresolved.",
    );
    expect(
      Array.from(
        { length: 4 },
        (_, count) =>
          createStationGenerationRequestForRecipe(
            ["Indie pop"],
            true,
            count,
            "v2.3",
          )?.prompt,
      ),
    ).toEqual(
      Array.from(
        { length: 4 },
        () => approvedIndiePopInstrumentalPrompt,
      ),
    );
  });
});
