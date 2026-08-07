export const MUSIC_CATEGORY_SETS = ["existing", "experimental"] as const;

export type MusicCategorySet = (typeof MUSIC_CATEGORY_SETS)[number];
export type MusicCategoryKey = `${MusicCategorySet}/${string}`;

export interface ExistingCategoryIdentity {
  readonly key: MusicCategoryKey;
  readonly name: string;
}

export const EXISTING_CATEGORY_IDENTITIES = Object.freeze([
  { key: "existing/synth-pop", name: "Synth-pop" },
  { key: "existing/dance-pop", name: "Dance-pop" },
  { key: "existing/indie-pop", name: "Indie pop" },
  { key: "existing/classic-rock", name: "Classic rock" },
  { key: "existing/punk-rock", name: "Punk rock" },
  { key: "existing/alternative", name: "Alternative" },
  { key: "existing/boom-bap", name: "Boom bap" },
  { key: "existing/trap", name: "Trap" },
  { key: "existing/lo-fi-hip-hop", name: "Lo-fi hip-hop" },
  { key: "existing/neo-soul", name: "Neo-soul" },
  { key: "existing/modern-r-and-b", name: "Modern R&B" },
  { key: "existing/new-jack-swing", name: "New jack swing" },
  { key: "existing/bluegrass", name: "Bluegrass" },
  { key: "existing/outlaw", name: "Outlaw" },
  { key: "existing/country-pop", name: "Country pop" },
  { key: "existing/bebop", name: "Bebop" },
  { key: "existing/cool-jazz", name: "Cool jazz" },
  { key: "existing/jazz-fusion", name: "Jazz fusion" },
  { key: "existing/house", name: "House" },
  { key: "existing/bollywood-house", name: "Bollywood house" },
  { key: "existing/future-french-house", name: "Future French House" },
  { key: "existing/techno", name: "Techno" },
  { key: "existing/ambient", name: "Ambient" },
  { key: "existing/latin-house", name: "Latin house" },
  { key: "existing/latin-techno", name: "Latin techno" },
  { key: "existing/latin-trap", name: "Latin trap" },
  { key: "existing/baroque", name: "Baroque" },
  { key: "existing/romantic", name: "Romantic" },
  { key: "existing/minimalist", name: "Minimalist" },
  { key: "existing/americana", name: "Americana" },
  { key: "existing/celtic-folk", name: "Celtic folk" },
  { key: "existing/indie-folk", name: "Indie folk" },
  { key: "existing/thrash-metal", name: "Thrash metal" },
  { key: "existing/doom-metal", name: "Doom metal" },
  { key: "existing/progressive-metal", name: "Progressive metal" },
  { key: "existing/narrative-pop", name: "Narrative Pop" },
  { key: "existing/cinematic-hip-hop", name: "Cinematic Hip-Hop" },
] as const satisfies readonly ExistingCategoryIdentity[]);

export const EXISTING_HOUSE_CATEGORY_KEY =
  "existing/house" satisfies MusicCategoryKey;
export const EXISTING_BOLLYWOOD_HOUSE_CATEGORY_KEY =
  "existing/bollywood-house" satisfies MusicCategoryKey;
export const EXISTING_LATIN_HOUSE_CATEGORY_KEY =
  "existing/latin-house" satisfies MusicCategoryKey;
export const EXISTING_LATIN_TECHNO_CATEGORY_KEY =
  "existing/latin-techno" satisfies MusicCategoryKey;
export const EXISTING_LATIN_TRAP_CATEGORY_KEY =
  "existing/latin-trap" satisfies MusicCategoryKey;
export const EXISTING_INDIE_POP_CATEGORY_KEY =
  "existing/indie-pop" satisfies MusicCategoryKey;

export function existingCategoryKeyForName(
  name: string,
): MusicCategoryKey | undefined {
  return EXISTING_CATEGORY_IDENTITIES.find(
    (identity) => identity.name === name,
  )?.key;
}

export function musicCategorySetFromKey(
  key: MusicCategoryKey,
): MusicCategorySet {
  return key.startsWith("experimental/") ? "experimental" : "existing";
}
