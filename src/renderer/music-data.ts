export const locomoMusicStationArtwork: Record<string, string> = {
  "Synth-pop": "./assets/stations/synth-pop.png",
  "Dance-pop": "./assets/stations/dance-pop.png",
  "Indie pop": "./assets/stations/indie-pop.png",
  "Classic rock": "./assets/stations/classic-rock.png",
  "Punk rock": "./assets/stations/punk-rock.png",
  Alternative: "./assets/stations/alternative.png",
  "Boom bap": "./assets/stations/boom-bap.png",
  Trap: "./assets/stations/trap.png",
  "Lo-fi hip-hop": "./assets/stations/lo-fi-hip-hop.png",
  "Neo-soul": "./assets/stations/neo-soul.png",
  "Modern R&B": "./assets/stations/modern-r-and-b.png",
  "New jack swing": "./assets/stations/new-jack-swing.png",
  Bluegrass: "./assets/stations/bluegrass.png",
  Outlaw: "./assets/stations/outlaw.png",
  "Country pop": "./assets/stations/country-pop.png",
  Bebop: "./assets/stations/bebop.png",
  "Cool jazz": "./assets/stations/cool-jazz.png",
  "Jazz fusion": "./assets/stations/jazz-fusion.png",
  House: "./assets/stations/house.png",
  "Future French House": "./assets/stations/future-french-house.png",
  "Bollywood house": "./assets/stations/house.png",
  Techno: "./assets/stations/techno.png",
  Ambient: "./assets/stations/ambient.png",
  "Latin house": "./assets/stations/latin-house.png",
  "Latin techno": "./assets/stations/techno.png",
  Baroque: "./assets/stations/baroque.png",
  Romantic: "./assets/stations/romantic.png",
  Minimalist: "./assets/stations/minimalist.png",
  Americana: "./assets/stations/americana.png",
  "Celtic folk": "./assets/stations/celtic-folk.png",
  "Indie folk": "./assets/stations/indie-folk.png",
  "Thrash metal": "./assets/stations/thrash-metal.png",
  "Doom metal": "./assets/stations/doom-metal.png",
  "Progressive metal": "./assets/stations/progressive-metal.png",
};

export type LocomoMusicColorTheme = "light" | "dark";

export const locomoMusicDarkStationArtwork: Record<string, string> = {
  "Synth-pop": "./assets/stations-dark/synth-pop.png",
  "Dance-pop": "./assets/stations-dark/dance-pop.png",
  "Indie pop": "./assets/stations-dark/indie-pop.png",
  "Classic rock": "./assets/stations-dark/classic-rock.png",
  "Punk rock": "./assets/stations-dark/punk-rock.png",
  Alternative: "./assets/stations-dark/alternative.png",
  "Boom bap": "./assets/stations-dark/boom-bap.png",
  Trap: "./assets/stations-dark/trap.png",
  "Lo-fi hip-hop": "./assets/stations-dark/lo-fi-hip-hop.png",
  "Neo-soul": "./assets/stations-dark/neo-soul.png",
  "Modern R&B": "./assets/stations-dark/modern-r-and-b.png",
  "New jack swing": "./assets/stations-dark/new-jack-swing.png",
  Bluegrass: "./assets/stations-dark/bluegrass.png",
  Outlaw: "./assets/stations-dark/outlaw.png",
  "Country pop": "./assets/stations-dark/country-pop.png",
  Bebop: "./assets/stations-dark/bebop.png",
  "Cool jazz": "./assets/stations-dark/cool-jazz.png",
  "Jazz fusion": "./assets/stations-dark/jazz-fusion.png",
  House: "./assets/stations-dark/house.png",
  "Future French House":
    "./assets/stations-dark/future-french-house.png",
  "Bollywood house": "./assets/stations-dark/house.png",
  Techno: "./assets/stations-dark/techno.png",
  Ambient: "./assets/stations-dark/ambient.png",
  "Latin house": "./assets/stations-dark/latin-house.png",
  "Latin techno": "./assets/stations-dark/techno.png",
  Baroque: "./assets/stations-dark/baroque.png",
  Romantic: "./assets/stations-dark/romantic.png",
  Minimalist: "./assets/stations-dark/minimalist.png",
  Americana: "./assets/stations-dark/americana.png",
  "Celtic folk": "./assets/stations-dark/celtic-folk.png",
  "Indie folk": "./assets/stations-dark/indie-folk.png",
  "Thrash metal": "./assets/stations-dark/thrash-metal.png",
  "Doom metal": "./assets/stations-dark/doom-metal.png",
  "Progressive metal": "./assets/stations-dark/progressive-metal.png",
};

export function resolveLocomoMusicStationArtwork(
  station: string,
  theme: LocomoMusicColorTheme,
) {
  if (theme === "dark") {
    return (
      locomoMusicDarkStationArtwork[station] ??
      locomoMusicStationArtwork[station]
    );
  }
  return locomoMusicStationArtwork[station];
}

export const locomoMusicStationPromptAnchors: Record<
  string,
  readonly string[]
> = {
  "Indie pop": [
    "The defining musical detail is a distinctive guitar figure. Let it recur through repeated organic waves: close, lightly played restraint gives way to fuller guitar-and-drum surges, then the band eases back before gathering force again.",
    "The defining musical detail is an intimate vocal melody with loose harmonies. Close voice and spare guitar repeatedly draw the band inward, then open into harmony-rich ensemble swells that relax and rise again.",
    "The defining musical detail is a warm, slightly off-kilter bass-and-drum groove. Picked bass and straight live drums repeatedly tighten into restrained pockets, then push the whole band into emotionally charged lifts before releasing into lean motion again.",
    "The defining musical detail is a simple piano, organ, or analog-synth phrase. Let it pass between exposed, intimate spaces and fuller guitar-keyboard ensemble swells, repeatedly falling away and gathering emotional force again.",
  ],
};

export const locomoMusicStationLyricDirections: Record<
  string,
  readonly string[]
> = {
  "Indie pop": [
    "The lyrics approach sadness and melancholy through intimate details and longing held in restraint, while recurring flashes of catharsis press against that composure; keep the language lived-in, natural, and emotionally ambiguous.",
    "The lyrics express self-affirmation and aspiration through earned confidence and forward motion, with doubt repeatedly testing conviction so every assertion feels specific, human, and hard-won rather than slogan-like.",
    "The lyrics explore a philosophical idea through concrete images, letting apparent certainty repeatedly loosen into wonder and renewed questioning; keep the voice natural, curious, and reflectively unresolved.",
  ],
};

export const locomoMusicStationVocalPrompts: Record<string, string> = {
  "Bollywood house":
    "Bollywood-house vocals and lyrics entirely in natural contemporary Hindi, with expressive melodic phrasing, clear human diction, intimate emotional detail, a soaring film-pop hook, and responsive harmonies integrated with the house groove.",
  "Indie pop":
    "English pop vocals with clear natural phrasing and a distinctive melodic personality.",
};

export const locomoMusicStationInstrumentalPromptRecipes = {
  "Indie pop": {
    productionIdentity:
      "Melodic guitar-band instrumental indie pop with steady straight-eighth live drums, a crisp backbeat, supportive root-note electric bass, chiming and lightly overdriven guitars, occasional warm keyboard color, bittersweet harmony, and punchy slightly raw production. Compact instrumental passages repeatedly expand into bright full-band lifts, fall back to intimate guitar textures, and build again. Keep the rhythm direct, the melodic hooks concise, and the ensemble unmistakably indie pop.",
    anchors: [
      "A chiming single-note guitar theme returns in varied forms, starting exposed and delicate before doubled guitars and the full rhythm section widen it into a bright ensemble lift.",
      "Two clean electric guitars trade a concise melodic figure in imperfect harmony, moving between close bedroom-studio detail and fuller overdriven band surges.",
      "A bright guitar arpeggio and compact piano phrase alternate as the central hooks while steady drums and supportive bass carry the arrangement through restrained passages and open full-band releases.",
      "Lightly overdriven guitar chords establish a bittersweet progression, then a clear lead-guitar theme rises above the band as each return becomes broader, louder, and more emotionally charged.",
    ],
  },
} as const;

export const locomoMusicGenres = [
  {
    name: "Pop",
    vocalPrompt:
      "English pop vocals with clear natural phrasing, a distinctive melodic personality, concise verses, and an immediately memorable sung chorus.",
    styles: [
      {
        name: "Synth-pop",
        prompt:
          "Polished synth-pop with luminous analog synthesizers, electronic drums, a strong melodic hook, warm bass, and a memorable chorus.",
      },
      {
        name: "Dance-pop",
        prompt:
          "Energetic dance-pop with a four-on-the-floor pulse, bright hooks, crisp modern drums, buoyant bass, and a euphoric polished chorus.",
      },
      {
        name: "Indie pop",
        prompt:
          "Characterful indie pop with organic close-miked textures, understated live drums, warm bass, intimate energy, inventive melodic details, and slightly imperfect bedroom-studio production.",
      },
    ],
  },
  {
    name: "Rock",
    vocalPrompt:
      "English rock vocals with forceful natural delivery, clear words, dynamic emotion, concise verses, and a powerful singable chorus.",
    styles: [
      {
        name: "Classic rock",
        prompt:
          "Classic rock with expressive electric guitars, live punchy drums, driving bass, blues-rooted riffs, dynamic solos, and a powerful chorus.",
      },
      {
        name: "Punk rock",
        prompt:
          "Fast raw punk rock with urgent power chords, aggressive live drums, lean bass, rebellious energy, and a direct shout-along hook.",
      },
      {
        name: "Alternative",
        prompt:
          "Modern alternative rock with distinctive guitar textures, muscular drums, moody dynamics, unconventional details, and an emotionally charged chorus.",
      },
    ],
  },
  {
    name: "Hip-hop",
    vocalPrompt:
      "English rap vocals with a natural modern flow, tight rhythmic pocket, clear intelligible words, confident human delivery, concise bars, and a memorable hook; no robotic, theatrical, or sing-song cadence.",
    styles: [
      {
        name: "Boom bap",
        prompt:
          "Raw boom-bap hip-hop with hard sampled drums, dusty breakbeats, deep bass, sparse chopped soul textures, head-nod swing, and no chiptune or video-game sounds.",
      },
      {
        name: "Trap",
        prompt:
          "Dark modern hip-hop trap track with massive sub-bass, hard kicks, sharp snare, intricate rolling hi-hats, a sparse ominous minor-key motif, and no retro chiptune or video-game sounds.",
      },
      {
        name: "Lo-fi hip-hop",
        prompt:
          "Warm lo-fi hip-hop with dusty relaxed drums, mellow jazz chords, soft bass, subtle vinyl texture, laid-back human swing, and no chiptune or video-game melodies.",
      },
    ],
  },
  {
    name: "R&B",
    vocalPrompt:
      "English R&B vocals with soulful natural phrasing, intimate human delivery, tasteful runs, clear words, compact verses, and a smooth memorable hook.",
    styles: [
      {
        name: "Neo-soul",
        prompt:
          "Organic neo-soul with rich extended chords, deep pocket drums, warm electric piano, expressive bass, human timing, and intimate soulful melodies.",
      },
      {
        name: "Modern R&B",
        prompt:
          "Contemporary R&B with deep smooth bass, tight understated drums, atmospheric textures, intimate melodies, rich harmony, and polished spacious production.",
      },
      {
        name: "New jack swing",
        prompt:
          "New jack swing with syncopated punchy drum-machine grooves, bright keyboard stabs, funky bass, energetic rhythmic hooks, and glossy late-eighties R&B production.",
      },
    ],
  },
  {
    name: "Country",
    vocalPrompt:
      "English country vocals with natural conversational storytelling, clear words, grounded emotional delivery, concrete imagery, and a strong singable chorus.",
    styles: [
      {
        name: "Bluegrass",
        prompt:
          "Fast acoustic country bluegrass with driving banjo, fiddle, mandolin, flatpicked guitar, upright bass, tight live ensemble interplay, virtuosic breaks, and energetic high-lonesome character.",
      },
      {
        name: "Outlaw",
        prompt:
          "Outlaw country with gritty vocals, raw electric and acoustic guitars, steady live drums, road-worn atmosphere, defiant storytelling, and unpolished organic production.",
      },
      {
        name: "Country pop",
        prompt:
          "Modern country-pop with warm acoustic guitar, melodic electric guitar, punchy drums, bright polished production, accessible storytelling, and a huge memorable chorus.",
      },
    ],
  },
  {
    name: "Jazz",
    vocalPrompt:
      "English jazz vocals with relaxed behind-the-beat phrasing, clear lyrics, expressive human nuance, melodic improvisational character, and an elegant refrain.",
    styles: [
      {
        name: "Bebop",
        prompt:
          "Fast acoustic bebop with agile horn lines, walking upright bass, syncopated ride cymbal, complex harmony, virtuosic improvisation, and lively ensemble interplay.",
      },
      {
        name: "Cool jazz",
        prompt:
          "Spacious cool jazz with restrained horns, subtle brushed drums, lyrical phrasing, understated upright bass, sophisticated harmony, and intimate room ambience.",
      },
      {
        name: "Jazz fusion",
        prompt:
          "Adventurous jazz fusion with electric keys, muscular bass, intricate drums, expressive lead improvisation, shifting rhythms, and detailed modern production.",
      },
    ],
  },
  {
    name: "Electronic",
    vocalPrompt:
      "English electronic-pop vocals with clean rhythmic phrasing, concise evocative lyrics, a distinctive human tone, and a short hook that integrates naturally with the production.",
    styles: [
      {
        name: "House",
        prompt:
          "Driving house music with a powerful four-on-the-floor kick, warm rolling bass, syncopated percussion, soulful chord stabs, gradual builds, and a polished club mix.",
      },
      {
        name: "Bollywood house",
        prompt:
          "Modern Bollywood house with a firm four-on-the-floor kick, warm rolling bass, polished Indian film-pop harmony, expressive melodic hooks, selective tabla and dholak accents, restrained bansuri or plucked-string colors, bright synth and piano stabs, and spacious contemporary dancefloor production; house first, not generic festival EDM, bhangra, or a traditional ensemble.",
      },
      {
        name: "Techno",
        prompt:
          "Hypnotic techno with relentless precise drums, dark pulsing bass, evolving industrial textures, minimal melodic content, tension-building automation, and a powerful club mix.",
      },
      {
        name: "Ambient",
        prompt:
          "Immersive ambient electronic music with slowly evolving pads, spacious harmonic movement, delicate organic textures, minimal percussion, and a deep atmospheric sound field.",
      },
    ],
  },
  {
    name: "Latin Electronic",
    vocalPrompt:
      "Electronic vocals and lyrics entirely in natural contemporary Spanish, with clear rhythmic phrasing, concise human lines, expressive call-and-response, and melodic hooks integrated into the club groove.",
    styles: [
      {
        name: "Latin house",
        prompt:
          "Modern Latin house with a firm four-on-the-floor kick, warm syncopated bass, congas, timbales, claves and güiro, bright piano or organ stabs, soulful rhythmic energy, gradual club builds, and a spacious contemporary mix; house rather than reggaetón or conventional salsa.",
      },
      {
        name: "Latin techno",
        prompt:
          "Modern Latin techno with a precise driving kick, rolling sub pressure, dark hypnotic sequencing, tightly interlocked congas, timbales, claves and güiro, sparse tension-building automation, and disciplined underground club production; techno rather than reggaetón, salsa-pop, or a horn-band arrangement.",
      },
    ],
  },
  {
    name: "Classical",
    vocalPrompt:
      "English classical vocals with clear diction, lyrical melodic phrasing, emotionally coherent text, natural breath, and a composed recurring theme.",
    styles: [
      {
        name: "Baroque",
        prompt:
          "Elegant Baroque chamber music with contrapuntal melodic lines, harpsichord continuo, articulated strings, formal development, and historically inspired acoustic detail.",
      },
      {
        name: "Romantic",
        prompt:
          "Sweeping Romantic orchestral music with expansive melody, rich chromatic harmony, dramatic dynamic contrasts, expressive strings, and an emotionally passionate arc.",
      },
      {
        name: "Minimalist",
        prompt:
          "Modern minimalist classical music with repeating motifs, gradual harmonic change, precise layered rhythms, restrained instrumentation, and hypnotic evolving momentum.",
      },
    ],
  },
  {
    name: "Folk",
    vocalPrompt:
      "English folk vocals with intimate natural storytelling, clear plainspoken words, vivid human detail, restrained delivery, and an emotionally direct refrain.",
    styles: [
      {
        name: "Americana",
        prompt:
          "Earthy Americana with acoustic guitar, mandolin, restrained live drums, rootsy bass, weathered melodic character, and warm organic room production.",
      },
      {
        name: "Celtic folk",
        prompt:
          "Traditional Celtic folk with fiddle, tin whistle, acoustic strings, hand percussion, modal melodies, lively dance rhythm, and natural ensemble performance.",
      },
      {
        name: "Indie folk",
        prompt:
          "Intimate indie folk with fingerpicked acoustic guitar, soft organic textures, understated percussion, vulnerable melody, natural human timing, and warm close production.",
      },
    ],
  },
  {
    name: "Metal",
    vocalPrompt:
      "English metal vocals with intense controlled delivery, rhythmically precise phrasing, intelligible words, compact forceful lines, and a commanding recurring hook.",
    styles: [
      {
        name: "Thrash metal",
        prompt:
          "Ferocious thrash metal with rapid palm-muted riffs, aggressive live drums, fast double-kick patterns, snarling bass, sharp transitions, and relentless forward momentum.",
      },
      {
        name: "Doom metal",
        prompt:
          "Crushing doom metal with extremely heavy slow riffs, massive distorted guitars, cavernous drums, ominous bass, bleak atmosphere, and patient dramatic weight.",
      },
      {
        name: "Progressive metal",
        prompt:
          "Technical progressive metal with complex shifting meters, precise low-tuned riffs, virtuosic drums, atmospheric contrasts, evolving structure, and polished powerful production.",
      },
    ],
  },
] as const;
