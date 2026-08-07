import {
  locomoMusicGenres,
  locomoMusicStationInstrumentalPromptRecipes,
  locomoMusicStationLyricDirections,
  locomoMusicStationPromptAnchors,
  locomoMusicStationVocalPrompts,
} from "./music-data";

export type LocomoMusicStationName =
  (typeof locomoMusicGenres)[number]["styles"][number]["name"];

export type LocomoMusicPromptRecipeVersion = "v1" | "v2.3";

type FourPromptAnchors = readonly [
  string,
  string,
  string,
  string,
];

type ThreeLyricDirections = readonly [string, string, string];

export interface LocomoMusicV1PromptRecipe {
  readonly stylePrompt: string;
  readonly vocalPrompt: string;
}

export interface LocomoMusicV23PromptRecipe {
  readonly productionIdentity: string;
  readonly vocalPrompt: string;
  readonly anchors: FourPromptAnchors;
  readonly lyricDirections: ThreeLyricDirections;
  readonly instrumental?: {
    readonly productionIdentity: string;
    readonly anchors: FourPromptAnchors;
  };
}

export interface LocomoMusicStationPromptRecipes {
  readonly v1: LocomoMusicV1PromptRecipe;
  readonly "v2.3": LocomoMusicV23PromptRecipe;
}

// Change this one value to "v1" to restore every station still using
// LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE. Change one map entry below instead
// when restoring a single station.
export const LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE: LocomoMusicPromptRecipeVersion =
  "v2.3";

export const locomoMusicActivePromptRecipeByStation = Object.freeze({
  "Synth-pop": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Dance-pop": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Indie pop": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Classic rock": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Punk rock": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  Alternative: LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Boom bap": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  Trap: LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Lo-fi hip-hop": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Neo-soul": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Modern R&B": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "New jack swing": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  Bluegrass: LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  Outlaw: LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Country pop": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  Bebop: LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Cool jazz": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Jazz fusion": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  House: LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Bollywood house": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  Techno: LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  Ambient: LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Latin house": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Latin techno": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  Baroque: LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  Romantic: LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  Minimalist: LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  Americana: LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Celtic folk": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Indie folk": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Thrash metal": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Doom metal": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
  "Progressive metal": LOCOMO_MUSIC_DEFAULT_PROMPT_RECIPE,
} as const satisfies Record<
  LocomoMusicStationName,
  LocomoMusicPromptRecipeVersion
>);

const stationCatalog = locomoMusicGenres.flatMap((genre) =>
  genre.styles.map((style) => ({
    name: style.name,
    stylePrompt: String(style.prompt),
    vocalPrompt: String(genre.vocalPrompt),
  })),
);

function catalogEntry(station: LocomoMusicStationName) {
  const entry = stationCatalog.find(
    (candidate) => candidate.name === station,
  );
  if (!entry) {
    throw new Error(`Missing Locomo Music station catalog entry: ${station}`);
  }
  return entry;
}

function exactV1Recipe(
  station: LocomoMusicStationName,
): LocomoMusicV1PromptRecipe {
  const entry = catalogEntry(station);
  return Object.freeze({
    stylePrompt:
      station === "Indie pop"
        ? "Characterful indie pop with organic textures, understated drums, melodic guitars, intimate energy, and an inventive memorable hook."
        : entry.stylePrompt,
    vocalPrompt:
      station === "Bollywood house"
        ? locomoMusicStationVocalPrompts[station]!
        : entry.vocalPrompt,
  });
}

function fourPromptAnchors(
  anchors: readonly string[],
): FourPromptAnchors {
  if (anchors.length !== 4) {
    throw new Error("A V2.3 station recipe requires four prompt anchors.");
  }
  return Object.freeze([
    anchors[0]!,
    anchors[1]!,
    anchors[2]!,
    anchors[3]!,
  ]);
}

function threeLyricDirections(
  directions: readonly string[],
): ThreeLyricDirections {
  if (directions.length !== 3) {
    throw new Error("A V2.3 station recipe requires three lyric directions.");
  }
  return Object.freeze([
    directions[0]!,
    directions[1]!,
    directions[2]!,
  ]);
}

function v23Recipe(
  productionIdentity: string,
  vocalPrompt: string,
  anchors: FourPromptAnchors,
  lyricDirections: ThreeLyricDirections,
  instrumental?: {
    readonly productionIdentity: string;
    readonly anchors: FourPromptAnchors;
  },
): LocomoMusicV23PromptRecipe {
  return Object.freeze({
    productionIdentity,
    vocalPrompt,
    anchors: Object.freeze(anchors),
    lyricDirections: Object.freeze(lyricDirections),
    ...(instrumental
      ? {
          instrumental: Object.freeze({
            productionIdentity: instrumental.productionIdentity,
            anchors: Object.freeze(instrumental.anchors),
          }),
        }
      : {}),
  });
}

const approvedIndiePopV23Recipe = v23Recipe(
  catalogEntry("Indie pop").stylePrompt,
  locomoMusicStationVocalPrompts["Indie pop"]!,
  fourPromptAnchors(
    locomoMusicStationPromptAnchors["Indie pop"] ?? [],
  ),
  threeLyricDirections(
    locomoMusicStationLyricDirections["Indie pop"] ?? [],
  ),
  {
    productionIdentity:
      locomoMusicStationInstrumentalPromptRecipes["Indie pop"]
        .productionIdentity,
    anchors: fourPromptAnchors(
      locomoMusicStationInstrumentalPromptRecipes["Indie pop"].anchors,
    ),
  },
);

export const locomoMusicStationPromptRecipes = Object.freeze({
  "Synth-pop": {
    v1: exactV1Recipe("Synth-pop"),
    "v2.3": v23Recipe(
      "Tactile synth-pop with luminous analog color, crisp electronic rhythm, warm low end, and focused melodic character.",
      "English synth-pop vocals with poised rhythmic phrasing, a distinctive human tone, and clean melodic expression.",
      [
        "The defining musical detail is an interlocking analog arpeggio with subtle filter movement.",
        "The defining musical detail is a dry drum-machine groove accented by syncopated handclaps.",
        "The defining musical detail is chorused poly-synth chords carrying bittersweet suspended harmony.",
        "The defining musical detail is a singing monophonic synth motif with expressive pitch glide.",
      ],
      [
        "The lyrics approach sadness and melancholy through emotional distance, fractured memory, and private feeling beneath polished surfaces.",
        "The lyrics express self-affirmation and aspiration through reinvention, self-possession, and confidence in one's own design.",
        "The lyrics explore a philosophical idea through images of signals, reflections, and repetition that question what makes identity feel real.",
      ],
    ),
  },
  "Dance-pop": {
    v1: exactV1Recipe("Dance-pop"),
    "v2.3": v23Recipe(
      "Precision dance-pop with propulsive club rhythm, bright melodic clarity, elastic low end, and immaculate modern production.",
      "English dance-pop vocals with bright rhythmic phrasing, confident human energy, and precise melodic focus.",
      [
        "The defining musical detail is syncopated piano-house chord stabs against a firm four-on-the-floor kick.",
        "The defining musical detail is an elastic synth-bass phrase that leaves clean space around the kick.",
        "The defining musical detail is a bright percussive synth motif built from clipped repeated notes.",
        "The defining musical detail is layered claps, shakers, and rim accents creating buoyant sixteenth-note motion.",
      ],
      [
        "The lyrics approach sadness and melancholy through private heartbreak held beneath public composure and physical motion.",
        "The lyrics express self-affirmation and aspiration through bodily confidence, chosen joy, and unapologetic agency.",
        "The lyrics explore a philosophical idea through rhythm, collective release, and questions about freedom, desire, and belonging.",
      ],
    ),
  },
  "Indie pop": {
    v1: exactV1Recipe("Indie pop"),
    "v2.3": approvedIndiePopV23Recipe,
  },
  "Classic rock": {
    v1: exactV1Recipe("Classic rock"),
    "v2.3": v23Recipe(
      "Live-room classic rock with valve-driven guitars, muscular acoustic drums, grounded bass, blues-shaped harmony, and unvarnished ensemble energy.",
      "English classic-rock vocals with a warm forceful tone, clear words, blues-shaped phrasing, and unvarnished emotion.",
      [
        "The defining musical detail is an open-string electric-guitar riff colored by bent thirds and suspended chord tones.",
        "The defining musical detail is a loose, snare-forward backbeat with ringing ride-cymbal wash.",
        "The defining musical detail is twin electric guitars interlocking complementary rhythm voicings.",
        "The defining musical detail is a Hammond-organ countermelody with rotary-speaker grit.",
      ],
      [
        "The lyrics approach sadness and melancholy through plainspoken regret, changed relationships, and memories that resist nostalgia.",
        "The lyrics express self-affirmation and aspiration through hard-won independence, resilience, and willingness to risk change.",
        "The lyrics explore a philosophical idea through freedom, consequence, time, and the weight of ordinary choices.",
      ],
    ),
  },
  "Punk rock": {
    v1: exactV1Recipe("Punk rock"),
    "v2.3": v23Recipe(
      "Lean punk rock with abrasive amp tone, hard live drums, blunt melodic instinct, and tightly wound collective urgency.",
      "English punk vocals with blunt intelligible phrasing, urgent human attack, and conviction without theatrical polish.",
      [
        "The defining musical detail is rapid downstroked power chords with a terse chromatic turnaround.",
        "The defining musical detail is a snare-forward two-beat drum attack with minimal fills.",
        "The defining musical detail is a melodic bass countermelody that refuses to merely double the guitar.",
        "The defining musical detail is short stop-start silences sharpening the full ensemble attack.",
      ],
      [
        "The lyrics approach sadness and melancholy through grief, isolation, and disappointment stated with blunt specificity and no self-pity.",
        "The lyrics express self-affirmation and aspiration through autonomy, solidarity, and refusal to shrink under pressure.",
        "The lyrics explore a philosophical idea through authority, belonging, and the moral cost of obedience.",
      ],
    ),
  },
  Alternative: {
    v1: exactV1Recipe("Alternative"),
    "v2.3": v23Recipe(
      "Texturally adventurous alternative rock with tactile distortion, muscular human drums, moody harmonic color, and emotionally direct production.",
      "English alternative-rock vocals with direct emotional presence, flexible dynamics, clear words, and an individual melodic character.",
      [
        "The defining musical detail is open-string dissonant guitar voicings in an alternate tuning.",
        "The defining musical detail is a tom-heavy groove that shifts accents without losing weight.",
        "The defining musical detail is a tense melodic bass ostinato beneath sparse harmony.",
        "The defining musical detail is pitched feedback and granular noise functioning as a countertexture.",
      ],
      [
        "The lyrics approach sadness and melancholy through alienation, memory, and emotional contradiction rendered in oblique concrete images.",
        "The lyrics express self-affirmation and aspiration through reclaimed identity, endurance of uncertainty, and rejection of inherited scripts.",
        "The lyrics explore a philosophical idea through perception, authenticity, and belonging without resolving their tensions.",
      ],
    ),
  },
  "Boom bap": {
    v1: exactV1Recipe("Boom bap"),
    "v2.3": v23Recipe(
      "Sample-rooted boom bap with hard drum breaks, weighty low end, sparse harmonic grit, and unquantized head-nod swing.",
      "English rap vocals with grounded cadence, tight pocket, crisp intelligibility, and confident unforced delivery.",
      [
        "The defining musical detail is a micro-chopped soul sample with audible grain.",
        "The defining musical detail is a swung breakbeat with a heavy, slightly late snare.",
        "The defining musical detail is a sparse minor-key piano loop with unresolved voicings.",
        "The defining musical detail is a blunt bass riff leaving wide pockets for the drums.",
      ],
      [
        "The lyrics approach sadness and melancholy through personal loss, social pressure, and memory grounded in specific places and objects.",
        "The lyrics express self-affirmation and aspiration through disciplined craft, survival, community uplift, and earned self-belief.",
        "The lyrics explore a philosophical idea through power, legacy, time, and moral cost using layered observation.",
      ],
    ),
  },
  Trap: {
    v1: exactV1Recipe("Trap"),
    "v2.3": v23Recipe(
      "Modern trap with cavernous sub-bass, precise programmed drums, sparse minor-key space, and stark high-contrast sound design.",
      "English trap vocals with controlled rhythmic precision, elastic cadence, clear words, and a cool human presence.",
      [
        "The defining musical detail is an 808 sub-bass phrase bending between chord tones with controlled distortion.",
        "The defining musical detail is a hi-hat grid interrupted by triplet flurries and abrupt rests.",
        "The defining musical detail is a hollow two-note synth motif built around an uneasy interval.",
        "The defining musical detail is a low detuned pad supplying a cold harmonic undertow beneath the sparse motif.",
      ],
      [
        "The lyrics approach sadness and melancholy through grief, isolation, and mistrust beneath a controlled exterior.",
        "The lyrics express self-affirmation and aspiration through discipline, self-definition, and ambition that survives pressure.",
        "The lyrics explore a philosophical idea through loyalty, value, consequence, and the tension between success and peace.",
      ],
    ),
  },
  "Lo-fi hip-hop": {
    v1: exactV1Recipe("Lo-fi hip-hop"),
    "v2.3": v23Recipe(
      "Intimate lo-fi hip-hop with soft-edged drums, muted harmony, restrained bass, tactile room noise, and an unquantized pocket.",
      "English rap vocals with relaxed behind-the-beat flow, intimate diction, clear words, and understated human presence.",
      [
        "The defining musical detail is a jazz-guitar chord fragment looping with audible tape grain and an imperfect seam.",
        "The defining musical detail is a lazy kick-and-snare pocket sitting deliberately behind the beat.",
        "The defining musical detail is woozy electric-piano voicings with subtle pitch instability.",
        "The defining musical detail is a fragmentary vibraphone or woodwind motif separated by generous silence.",
      ],
      [
        "The lyrics approach sadness and melancholy through quiet loneliness, missed connection, and ordinary routines rendered in small sensory details.",
        "The lyrics express self-affirmation and aspiration through patient growth, self-acceptance, and respect for incremental progress.",
        "The lyrics explore a philosophical idea through attention, memory, and impermanence reflected in everyday objects and spaces.",
      ],
    ),
  },
  "Neo-soul": {
    v1: exactV1Recipe("Neo-soul"),
    "v2.3": v23Recipe(
      "Organic neo-soul with an elastic pocket, harmonically rich voicings, warm close-miked timbres, and conversational melodic phrasing.",
      "English neo-soul vocals with intimate conversational phrasing, supple melodic nuance, clear words, and tasteful runs.",
      [
        "The defining musical detail is a laid-back pocket built from feathered ghost notes and a slightly late snare.",
        "The defining musical detail is extended harmony with chromatic inner voices and unresolved color tones.",
        "The defining musical detail is a supple melodic bass line that plays across the bar line.",
        "The defining musical detail is conversational call-and-response between lead phrases and small ensemble accents.",
      ],
      [
        "The lyrics approach sadness and melancholy through longing, ambivalence, and self-accountability inside an intimate relationship.",
        "The lyrics express self-affirmation and aspiration through self-worth, emotional boundaries, and growth that does not deny vulnerability.",
        "The lyrics explore a philosophical idea through love, identity, and spiritual connection using sensual concrete imagery and open questions.",
      ],
    ),
  },
  "Modern R&B": {
    v1: exactV1Recipe("Modern R&B"),
    "v2.3": v23Recipe(
      "Spacious contemporary R&B with sculpted low end, understated drums, atmospheric harmonic color, and close intimate melodic focus.",
      "English contemporary R&B vocals with close restrained delivery, fluid rhythmic phrasing, clear words, and selective ornament.",
      [
        "The defining musical detail is a sub-bass phrase with restrained slides and deliberate rests.",
        "The defining musical detail is a dry syncopated drum pocket shaped as much by silence as by hits.",
        "The defining musical detail is suspended two-chord harmony colored by soft detuned pads.",
        "The defining musical detail is a glassy plucked motif placed just behind the beat.",
      ],
      [
        "The lyrics approach sadness and melancholy through emotional distance, unsaid needs, and the private aftermath of intimacy.",
        "The lyrics express self-affirmation and aspiration through clear boundaries, self-respect, and ownership of desire.",
        "The lyrics explore a philosophical idea through desire, perception, reciprocity, and what people owe one another.",
      ],
    ),
  },
  "New jack swing": {
    v1: exactV1Recipe("New jack swing"),
    "v2.3": v23Recipe(
      "New jack swing with crisp swing-programmed drums, punchy synth funk, elastic bass, bright chord color, and polished R&B immediacy.",
      "English new jack swing vocals with crisp rhythmic attack, charismatic human energy, clear words, and agile soulful phrasing.",
      [
        "The defining musical detail is a swung drum-machine pattern with a sharp snare and ghosted kick syncopation.",
        "The defining musical detail is clipped synth-brass chord punches arranged in cross-rhythm.",
        "The defining musical detail is a rubbery octave bass riff locked to sixteenth-note swing.",
        "The defining musical detail is a bright digital-keyboard motif colored by jazzy passing chords.",
      ],
      [
        "The lyrics approach sadness and melancholy through romantic disappointment, mixed signals, and the tension between composure and hurt.",
        "The lyrics express self-affirmation and aspiration through charisma, self-respect, and shared celebration without empty bravado.",
        "The lyrics explore a philosophical idea through attraction, image, authenticity, and the effect of social performance on intimacy.",
      ],
    ),
  },
  Bluegrass: {
    v1: exactV1Recipe("Bluegrass"),
    "v2.3": v23Recipe(
      "Close-miked acoustic bluegrass with a driving string-band pulse, high-lonesome melodic character, precise ensemble interplay, and natural room presence.",
      "English bluegrass vocals with clear high-lonesome tone, close natural harmony, plainspoken diction, and acoustic immediacy.",
      [
        "The defining musical detail is a syncopated three-finger banjo roll driving the harmonic pulse.",
        "The defining musical detail is a modal fiddle line colored by open-string drones and double-stops.",
        "The defining musical detail is a crisp mandolin chop that turns the offbeat into percussion.",
        "The defining musical detail is a flatpicked guitar crosspicking pattern threaded with ringing open strings.",
      ],
      [
        "The lyrics approach sadness and melancholy through loss, separation, and inherited sorrow rendered in precise details of family, work, and place.",
        "The lyrics express self-affirmation and aspiration through perseverance, skilled work, communal belonging, and personal dignity.",
        "The lyrics explore a philosophical idea through fate, mortality, stewardship, and the tension between tradition and change.",
      ],
    ),
  },
  Outlaw: {
    v1: exactV1Recipe("Outlaw"),
    "v2.3": v23Recipe(
      "Unvarnished outlaw country with dry live-room sound, a lean rhythm section, weathered twang, and plainspoken emotional gravity.",
      "English outlaw-country vocals with weathered conversational tone, clear words, restrained grit, and unsentimental authority.",
      [
        "The defining musical detail is a low baritone-guitar riff with clipped bends.",
        "The defining musical detail is a loping two-step pocket with a dry snare and minimal ornament.",
        "The defining musical detail is restrained pedal-steel dissonance against plain major chords.",
        "The defining musical detail is a rough acoustic strum colored by sparse honky-tonk piano fills.",
      ],
      [
        "The lyrics approach sadness and melancholy through regret, estrangement, and consequence rendered in concrete unsentimental recollection.",
        "The lyrics express self-affirmation and aspiration through personal freedom, earned dignity, and accountability for one's choices.",
        "The lyrics explore a philosophical idea through law, conscience, loyalty, and the cost of independence.",
      ],
    ),
  },
  "Country pop": {
    v1: exactV1Recipe("Country pop"),
    "v2.3": v23Recipe(
      "Contemporary country-pop with natural string textures, precise live drums, melodic twang, clear harmonic warmth, and refined modern production.",
      "English country-pop vocals with natural conversational phrasing, clear words, grounded warmth, and polished melodic confidence.",
      [
        "The defining musical detail is a palm-muted acoustic-guitar pattern supplying crisp syncopation.",
        "The defining musical detail is a clean electric-guitar motif with bent scale tones and dotted delay.",
        "The defining musical detail is restrained fiddle double-stops adding country inflection to polished harmony.",
        "The defining musical detail is a tight kick-and-clap pocket layered with organic hand percussion.",
      ],
      [
        "The lyrics approach sadness and melancholy through distance, regret, and change rendered in small domestic and place-specific details.",
        "The lyrics express self-affirmation and aspiration through self-trust, grounded ambition, and courage to choose one's own terms.",
        "The lyrics explore a philosophical idea through home, identity, commitment, and ordinary measures of a good life.",
      ],
    ),
  },
  Bebop: {
    v1: exactV1Recipe("Bebop"),
    "v2.3": v23Recipe(
      "Fast acoustic bebop with crisp ride-cymbal swing, chromatic functional harmony, walking upright bass, agile ensemble interplay, and dry small-room presence.",
      "English bebop vocals with agile behind-the-beat phrasing, clear diction, conversational swing, and improvisational melodic instinct.",
      [
        "The defining musical detail is a tight alto saxophone and trumpet unison head built from angular chromatic enclosures.",
        "The defining musical detail is clipped piano shell voicings punctuating altered dominants without crowding the horn lines.",
        "The defining musical detail is ride-cymbal swing punctuated by irregular snare bombs and a feathered bass drum.",
        "The defining musical detail is a fluid eighth-note solo line targeting upper chord tones across rapid changes.",
      ],
      [
        "The lyrics approach sadness and melancholy through quick-witted self-observation, missed connection, and bittersweet restraint.",
        "The lyrics express self-affirmation and aspiration through creative nerve, hard-won fluency, and delight in taking risks.",
        "The lyrics explore a philosophical idea through improvisation, listening, and the tension between freedom and form.",
      ],
    ),
  },
  "Cool jazz": {
    v1: exactV1Recipe("Cool jazz"),
    "v2.3": v23Recipe(
      "Spacious cool jazz with understated acoustic ensemble tone, lyrical harmony, restrained dynamics, and intimate room detail.",
      "English cool-jazz vocals with intimate restrained tone, relaxed phrasing, clear diction, and subtle expressive nuance.",
      [
        "The defining musical detail is dry baritone-saxophone and trumpet counterpoint with wide melodic spacing.",
        "The defining musical detail is a muted-trumpet melody suspended over soft brushes and sparse accompaniment.",
        "The defining musical detail is a chordless tenor-saxophone texture that leaves harmony to bass motion and melodic implication.",
        "The defining musical detail is close-voiced guitar harmony colored by upper extensions and deliberate silence.",
      ],
      [
        "The lyrics approach sadness and melancholy through emotional distance, small gestures, and poised understatement.",
        "The lyrics express self-affirmation and aspiration through quiet self-possession, patience, and openness to possibility.",
        "The lyrics explore a philosophical idea through silence, perspective, and the ambiguity between detachment and care.",
      ],
    ),
  },
  "Jazz fusion": {
    v1: exactV1Recipe("Jazz fusion"),
    "v2.3": v23Recipe(
      "Adventurous electric jazz fusion with deep rhythmic pocket, extended harmony, virtuosic ensemble precision, saturated analog color, and detailed modern production.",
      "English jazz-fusion vocals with rhythmically agile phrasing, clear diction, expressive range, and adventurous melodic character.",
      [
        "The defining musical detail is a dry Rhodes-and-clavinet interlock shaping a sixteenth-note funk pocket.",
        "The defining musical detail is an exact guitar, synthesizer, and bass unison line grouped five-plus-five-plus-six.",
        "The defining musical detail is a singing fretless-bass counterline set against broken-beat drumming.",
        "The defining musical detail is an overdriven lead voice using chromatic outside phrases over a suspended modal vamp.",
      ],
      [
        "The lyrics approach sadness and melancholy through fractured memory, restless thought, and unresolved emotional dissonance.",
        "The lyrics express self-affirmation and aspiration through curiosity, technical courage, and the freedom to cross boundaries.",
        "The lyrics explore a philosophical idea through interdependence, adaptation, and the tension between structure and spontaneity.",
      ],
    ),
  },
  House: {
    v1: exactV1Recipe("House"),
    "v2.3": v23Recipe(
      "Club-focused house with a weighty four-on-the-floor kick, warm low end, humanized syncopation, soulful harmonic color, and a clean spacious mix.",
      "English house vocals with soulful rhythmic phrasing, concise clear lines, human warmth, and an effortless club-scale presence.",
      [
        "The defining musical detail is an offbeat minor-seventh piano or organ stab with a dry percussive attack.",
        "The defining musical detail is a rounded syncopated bassline leaving clean spectral space for the kick.",
        "The defining musical detail is a loose lattice of shuffled hi-hats and congas around the straight quarter-note pulse.",
        "The defining musical detail is a restrained acid line articulated by resonant sixteenth-note accents.",
      ],
      [
        "The lyrics approach sadness and melancholy through private loneliness inside collective motion, remembered touch, and the wish for release.",
        "The lyrics express self-affirmation and aspiration through chosen community, embodied confidence, and the freedom to belong.",
        "The lyrics explore a philosophical idea through repetition, collective rhythm, and the porous boundary between self and crowd.",
      ],
    ),
  },
  "Bollywood house": {
    v1: exactV1Recipe("Bollywood house"),
    "v2.3": v23Recipe(
      "Modern Bollywood house with a firm four-on-the-floor foundation, warm rolling low end, polished Indian film-pop harmony, selective acoustic percussion and instrumental color, expressive melodic lift, and spacious contemporary dancefloor production.",
      "Bollywood-house vocals and lyrics entirely in natural contemporary Hindi, with expressive melodic phrasing, clear human diction, intimate emotional detail, a soaring film-pop hook, and responsive harmonies integrated with the house groove.",
      [
        "The defining musical detail is a lyrical bansuri phrase answering bright piano and synth stabs over the steady house pulse.",
        "The defining musical detail is a light tabla-and-dholak syncopation woven around the straight kick, then opening into claps and wider percussion accents.",
        "The defining musical detail is a sweeping string melody shaped like an Indian film-pop refrain, carried by warm bass and restrained club drums.",
        "The defining musical detail is a concise plucked-string motif with subtle meend-like bends, echoed by soft synths while the house groove stays clean and direct.",
      ],
      [
        "The lyrics approach sadness and melancholy through a missed train, a rain-lit city, and words withheld after a crowded celebration; keep the Hindi imagery intimate and unsentimental.",
        "The lyrics express self-affirmation and aspiration through chosen love, public joy, and the courage to step into a new life; keep the Hindi language specific, warm, and human.",
        "The lyrics explore a philosophical idea through fate, memory, and the way a shared dance can make past and present feel simultaneous; use concrete Hindi images rather than abstractions.",
      ],
    ),
  },
  Techno: {
    v1: exactV1Recipe("Techno"),
    "v2.3": v23Recipe(
      "Hypnotic techno with precise machine drums, physical sub pressure, sparse tonal material, tactile texture, and disciplined club-scale production.",
      "English techno vocals with spare precise diction, controlled human tone, and phrasing embedded in the machine rhythm.",
      [
        "The defining musical detail is a rolling low-frequency rumble generated from a tuned kick and dark room resonance.",
        "The defining musical detail is a minor-ninth chord pulse wrapped in tape-dark dub delay.",
        "The defining musical detail is metallic percussion interlocking in a three-against-four rhythmic lattice.",
        "The defining musical detail is an elastic FM sequence with syncopated accents and restrained harmonic color.",
      ],
      [
        "The lyrics approach sadness and melancholy through anonymous infrastructure, sensory isolation, and memories that resist erasure.",
        "The lyrics express self-affirmation and aspiration through autonomy, bodily resolve, and reclaiming space from systems of control.",
        "The lyrics explore a philosophical idea through technology, repetition, and the boundary between agency and surrender.",
      ],
    ),
  },
  Ambient: {
    v1: exactV1Recipe("Ambient"),
    "v2.3": v23Recipe(
      "Immersive ambient electronic music with spacious harmonic color, tactile timbre, minimal pulse, and deep dimensional mixing.",
      "English ambient vocals with breath-led clarity, restrained melodic contour, and an intimate tone integrated with the sound field.",
      [
        "The defining musical detail is a granular harmonic cloud formed from bowed acoustic fragments.",
        "The defining musical detail is a low sine drone colored by close beating partials and gentle harmonic friction.",
        "The defining musical detail is isolated felt-piano tones surrounded by long diffuse reverb.",
        "The defining musical detail is a field-recorded air texture braided with soft modular overtones.",
      ],
      [
        "The lyrics approach sadness and melancholy through absence, fragile sensory images, and memory dissolving into place.",
        "The lyrics express self-affirmation and aspiration through inner steadiness, renewal, and openness to uncertainty.",
        "The lyrics explore a philosophical idea through scale, impermanence, and the boundary between self and environment.",
      ],
    ),
  },
  "Latin house": {
    v1: exactV1Recipe("Latin house"),
    "v2.3": v23Recipe(
      "Modern Latin house with a firm four-on-the-floor foundation, warm low end, syncopated Afro-Latin hand percussion, bright harmonic stabs, soulful rhythmic lift, and spacious contemporary club production.",
      "Latin-house vocals and lyrics entirely in natural contemporary Spanish, with soulful rhythmic phrasing, concise human lines, expressive call-and-response, and an effortless club-scale hook.",
      [
        "The defining musical detail is a clipped piano montuno fragment answering bright offbeat house stabs across the four-on-the-floor pulse.",
        "The defining musical detail is a loose conga, timbale, clave, and güiro lattice that repeatedly gathers around the straight kick before opening into wider percussion breaks.",
        "The defining musical detail is a warm syncopated bassline leaving space for short vocal calls and communal responses.",
        "The defining musical detail is a filtered organ-and-hand-percussion exchange that rises through restrained club builds and releases back into the groove.",
      ],
      [
        "The lyrics approach sadness and longing through distance inside a crowded room, remembered touch, and movement used to hold loss at bay.",
        "The lyrics express joy and self-affirmation through embodied confidence, chosen community, flirtation, and the freedom of moving together.",
        "The lyrics explore a philosophical idea through rhythm, repetition, and the way a shared dance can briefly dissolve the boundary between strangers.",
      ],
    ),
  },
  "Latin techno": {
    v1: exactV1Recipe("Latin techno"),
    "v2.3": v23Recipe(
      "Modern Latin techno with precise machine propulsion, physical sub pressure, tightly controlled Afro-Latin percussion, sparse dark sequencing, tactile tension, and disciplined underground club production.",
      "Latin-techno vocals and lyrics entirely in natural contemporary Spanish, with spare percussive diction, controlled human intensity, concise repeated phrases, and chant-like responses embedded in the machine rhythm.",
      [
        "The defining musical detail is a dry timbale-rim and clave pattern interlocking with metallic hats in a shifting three-against-four lattice.",
        "The defining musical detail is a rolling conga-and-low-tom cadence emerging through a tuned kick rumble and dark room resonance.",
        "The defining musical detail is a restrained güiro pulse acting as a high-frequency clock beneath dub-dark delays and sparse vocal fragments.",
        "The defining musical detail is an elastic FM sequence whose syncopated accents mirror a Latin bell pattern without breaking the techno drive.",
      ],
      [
        "The lyrics approach sadness and alienation through sleepless streets, sensory fragments, and private memory persisting beneath collective motion.",
        "The lyrics express defiance and self-possession through bodily resolve, nocturnal freedom, and reclaiming space from systems of control.",
        "The lyrics explore a philosophical idea through machinery, inherited rhythm, and the tension between repetition, memory, and personal agency.",
      ],
    ),
  },
  Baroque: {
    v1: exactV1Recipe("Baroque"),
    "v2.3": v23Recipe(
      "Historically informed Baroque chamber music with articulate phrasing, transparent counterpoint, functional harmony, terraced dynamics, and natural acoustic detail.",
      "English Baroque vocals with clear diction, agile ornamentation, natural breath, and poised chamber-scale expression.",
      [
        "The defining musical detail is an imitative subject shared cleanly among three independent voices.",
        "The defining musical detail is a repeating ground bass supporting a freely ornamented upper voice.",
        "The defining musical detail is a measured sarabande pulse emphasizing the second beat beneath expressive suspensions.",
        "The defining musical detail is crisp antiphony between a concertino trio and the ripieno ensemble.",
      ],
      [
        "The lyrics approach sadness and melancholy through loss, transience, and the conflict between earthly desire and restraint.",
        "The lyrics express self-affirmation and aspiration through moral courage, disciplined hope, and grace under adversity.",
        "The lyrics explore a philosophical idea through mortality, providence, and the tension between reason and passion.",
      ],
    ),
  },
  Romantic: {
    v1: exactV1Recipe("Romantic"),
    "v2.3": v23Recipe(
      "Romantic orchestral music with expansive cantabile melody, chromatic harmony, elastic rubato, saturated acoustic color, and emotionally direct performance.",
      "English Romantic-classical vocals with clear diction, expansive legato, natural breath, and emotionally direct tonal color.",
      [
        "The defining musical detail is a solo-cello cantabile line supported by divided-string suspensions.",
        "The defining musical detail is a warm chromatic-mediant sonority colored by horns and low clarinets.",
        "The defining musical detail is a restless triplet accompaniment beneath a terse dotted-rhythm motif.",
        "The defining musical detail is a piano arpeggio whose inner voice carries a veiled countermelody.",
      ],
      [
        "The lyrics approach sadness and melancholy through impossible longing, vivid memory, and emotional contradiction.",
        "The lyrics express self-affirmation and aspiration through individual will, transformative love, and pursuit of an ideal.",
        "The lyrics explore a philosophical idea through nature, fate, and the conflict between freedom and necessity.",
      ],
    ),
  },
  Minimalist: {
    v1: exactV1Recipe("Minimalist"),
    "v2.3": v23Recipe(
      "Modern minimalist classical music with precise repetition, additive rhythm, restrained modal harmony, transparent orchestration, and steady acoustic presence.",
      "English minimalist-classical vocals with precise diction, steady natural pulse, restrained expression, and focused tonal purity.",
      [
        "The defining musical detail is a pair of identical piano cells set one eighth-note apart.",
        "The defining musical detail is an additive rhythm alternating five-note and seven-note groupings over a steady pulse.",
        "The defining musical detail is an interlocking marimba canon producing a clear resultant melody.",
        "The defining musical detail is sustained strings pivoting on common tones within a narrow modal collection.",
      ],
      [
        "The lyrics approach sadness and melancholy through a recurring image, incremental change, and unresolved absence.",
        "The lyrics express self-affirmation and aspiration through patient persistence, focused attention, and the power of small acts.",
        "The lyrics explore a philosophical idea through repetition, perception, and difference emerging from sameness.",
      ],
    ),
  },
  Americana: {
    v1: exactV1Recipe("Americana"),
    "v2.3": v23Recipe(
      "Earthy Americana with a close live-ensemble feel, weathered acoustic tone, understated groove, plainspoken melody, and warm room production.",
      "English Americana vocals with plainspoken clarity, weathered natural tone, restrained emotion, and grounded storytelling.",
      [
        "The defining musical detail is an alternating-thumb acoustic-guitar pattern answered by spare dobro phrases.",
        "The defining musical detail is a dry snare shuffle and upright bass forming an unhurried two-beat pocket.",
        "The defining musical detail is a fiddle melody leaning on open-string drones and modal double-stops.",
        "The defining musical detail is a small-amplifier tremolo guitar sharing close voicings with pump organ.",
      ],
      [
        "The lyrics approach sadness and melancholy through a specific place, traces of family history, and the consequences of ordinary choices.",
        "The lyrics express self-affirmation and aspiration through earned resilience, self-reliance, and building a life with others.",
        "The lyrics explore a philosophical idea through inheritance, belonging, and the tension between freedom and obligation.",
      ],
    ),
  },
  "Celtic folk": {
    v1: exactV1Recipe("Celtic folk"),
    "v2.3": v23Recipe(
      "Traditional Celtic folk with acoustic ensemble tone, modal melodic language, idiomatic ornamentation, rhythmic lift, and unvarnished room presence.",
      "English Celtic-folk vocals with clear storytelling diction, natural ornament, communal warmth, and unvarnished acoustic presence.",
      [
        "The defining musical detail is fiddle and flute sharing a tightly ornamented reel in Dorian mode.",
        "The defining musical detail is a lilting six-eight jig supported by bouzouki cross-rhythm and restrained bodhrán.",
        "The defining musical detail is an uilleann-pipe air voiced in free rhythm over a quiet drone.",
        "The defining musical detail is a Scottish strathspey snap shaping the fiddle melody above open-string guitar voicings.",
      ],
      [
        "The lyrics approach sadness and melancholy through absence, remembered landscape, and grief held in communal memory.",
        "The lyrics express self-affirmation and aspiration through communal endurance, skill passed hand to hand, and belonging chosen as well as inherited.",
        "The lyrics explore a philosophical idea through fate, reciprocity with place, and the tension between memory and change.",
      ],
    ),
  },
  "Indie folk": {
    v1: exactV1Recipe("Indie folk"),
    "v2.3": v23Recipe(
      "Intimate indie folk with close acoustic texture, unforced human timing, understated arrangement, vulnerable melody, and warm home-recorded detail.",
      "English indie-folk vocals with intimate close delivery, clear plainspoken words, fragile nuance, and unforced melody.",
      [
        "The defining musical detail is an alternate-tuned fingerpicked guitar letting open strings ring through suspended chords.",
        "The defining musical detail is two close voices holding imperfect parallel harmony around a narrow melody.",
        "The defining musical detail is muted floor tom and hand percussion forming a soft asymmetrical pulse.",
        "The defining musical detail is bowed cello and pump organ sharing a grainy low-register drone.",
      ],
      [
        "The lyrics approach sadness and melancholy through domestic details, unsaid hurt, and the unreliable texture of memory.",
        "The lyrics express self-affirmation and aspiration through honest self-recognition, modest acts of courage, and uncertain hope.",
        "The lyrics explore a philosophical idea through ordinary objects, sustained attention, and identity formed in relation to others.",
      ],
    ),
  },
  "Thrash metal": {
    v1: exactV1Recipe("Thrash metal"),
    "v2.3": v23Recipe(
      "Ferocious thrash metal with dry high-gain attack, rapid riff discipline, aggressive live drums, articulate low end, and raw controlled production.",
      "English thrash-metal vocals with sharp rhythmic precision, intelligible words, controlled aggression, and raw human force.",
      [
        "The defining musical detail is a rapid downpicked pedal-tone riff punctuated by chromatic power-chord jabs.",
        "The defining musical detail is a tightly muted triplet gallop locked to a precise double-kick pattern.",
        "The defining musical detail is dissonant twin-guitar harmony crossing a hard skank-beat pulse.",
        "The defining musical detail is a bass-led stop-start riff reinforced by sharp snare-and-tom punctuation.",
      ],
      [
        "The lyrics approach sadness and melancholy through betrayal, corrosive anger, and damage concealed beneath defiance.",
        "The lyrics express self-affirmation and aspiration through refusal to submit, disciplined rage, and solidarity under pressure.",
        "The lyrics explore a philosophical idea through power, violence, and the moral cost of obedience.",
      ],
    ),
  },
  "Doom metal": {
    v1: exactV1Recipe("Doom metal"),
    "v2.3": v23Recipe(
      "Crushing doom metal with slow massive riffs, saturated low-tuned guitars, cavernous acoustic drums, ominous harmonic weight, and spacious analog grit.",
      "English doom-metal vocals with grave sustained tone, intelligible words, measured phrasing, and immense human weight.",
      [
        "The defining musical detail is a tritone-heavy guitar chord suspended against ringing amplifier feedback and floor-tom resonance.",
        "The defining musical detail is a blues-rooted fuzz riff shaped by wide bends and dragging triplet swing.",
        "The defining musical detail is a low pipe-organ line doubling a descending Phrygian guitar figure.",
        "The defining musical detail is a funereal bass melody moving independently beneath sustained open-fifth guitar chords.",
      ],
      [
        "The lyrics approach sadness and melancholy through grief, physical heaviness, and memory that cannot be escaped.",
        "The lyrics express self-affirmation and aspiration through endurance without false optimism, dignity in suffering, and refusal to be erased.",
        "The lyrics explore a philosophical idea through mortality, entropy, and the search for meaning under cosmic indifference.",
      ],
    ),
  },
  "Progressive metal": {
    v1: exactV1Recipe("Progressive metal"),
    "v2.3": v23Recipe(
      "Technical progressive metal with precise low-tuned articulation, complex meter, broad harmonic vocabulary, virtuosic ensemble control, and detailed powerful production.",
      "English progressive-metal vocals with precise diction, controlled intensity, wide expressive range, and rhythmically agile phrasing.",
      [
        "The defining musical detail is a low-string sixteenth-note riff grouped three-plus-three-plus-two-plus-two against a steady backbeat.",
        "The defining musical detail is a displaced polymetric ostinato whose phase relationship spans a longer drum cycle.",
        "The defining musical detail is a clean extended-chord arpeggio carrying Lydian color above a fixed pedal tone.",
        "The defining musical detail is a tightly harmonized guitar-and-synth lead with wide intervallic contours.",
      ],
      [
        "The lyrics approach sadness and melancholy through fragmented memory, internal contradiction, and the failure of control.",
        "The lyrics express self-affirmation and aspiration through self-mastery, intellectual courage, and breaking inherited limits.",
        "The lyrics explore a philosophical idea through consciousness, recursion, and freedom inside complex systems.",
      ],
    ),
  },
} as const satisfies Record<
  LocomoMusicStationName,
  LocomoMusicStationPromptRecipes
>);
