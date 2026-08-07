import type { MusicCategoryKey } from "../shared/music-categories";

const STATION_MASK_ROOT = "./assets/station-masks";

export type LocomoMusicStationCardArtworkKey =
  | MusicCategoryKey
  | "favorites";

export const locomoMusicStationCardArtwork: Readonly<
  Partial<Record<LocomoMusicStationCardArtworkKey, string>>
> = Object.freeze({
  "existing/future-french-house": `${STATION_MASK_ROOT}/future-french-house.svg`,
  "existing/latin-house": `${STATION_MASK_ROOT}/latin-house.svg`,
  "existing/house": `${STATION_MASK_ROOT}/house.svg`,
  favorites: `${STATION_MASK_ROOT}/favorites.svg`,
  "existing/synth-pop": `${STATION_MASK_ROOT}/synth-pop.svg`,
  "existing/indie-pop": `${STATION_MASK_ROOT}/indie-pop.svg`,
  "existing/classic-rock": `${STATION_MASK_ROOT}/classic-rock.svg`,
  "existing/punk-rock": `${STATION_MASK_ROOT}/punk-rock.svg`,
  "existing/boom-bap": `${STATION_MASK_ROOT}/boom-bap.svg`,
  "existing/lo-fi-hip-hop": `${STATION_MASK_ROOT}/lo-fi-hip-hop.svg`,
  "existing/country-pop": `${STATION_MASK_ROOT}/country-pop.svg`,
  "existing/cool-jazz": `${STATION_MASK_ROOT}/cool-jazz.svg`,
  "existing/jazz-fusion": `${STATION_MASK_ROOT}/jazz-fusion.svg`,
  "existing/techno": `${STATION_MASK_ROOT}/techno.svg`,
  "existing/latin-techno": `${STATION_MASK_ROOT}/latin-techno.svg`,
  "existing/indie-folk": `${STATION_MASK_ROOT}/indie-folk.svg`,
  "existing/thrash-metal": `${STATION_MASK_ROOT}/thrash-metal.svg`,
  "existing/progressive-metal": `${STATION_MASK_ROOT}/progressive-metal.svg`,
  "existing/cinematic-hip-hop": `${STATION_MASK_ROOT}/cinematic-hip-hop.svg`,
});

export function resolveLocomoMusicStationCardArtwork(
  artworkKey: LocomoMusicStationCardArtworkKey,
): string | undefined {
  return locomoMusicStationCardArtwork[artworkKey];
}
