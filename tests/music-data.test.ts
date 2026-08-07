import { describe, expect, it } from "vitest";

import {
  locomoMusicDarkStationArtwork,
  locomoMusicGenres,
  locomoMusicStationArtwork,
  resolveLocomoMusicStationArtwork,
} from "../src/renderer/music-data";

describe("station artwork themes", () => {
  it("uses Dark-only companions for every station", () => {
    const stations = locomoMusicGenres.flatMap((genre) =>
      genre.styles.map((style) => style.name),
    );
    const artworkStations = [...stations, "Future French House"];
    expect(Object.keys(locomoMusicDarkStationArtwork).sort()).toEqual(
      [...artworkStations].sort(),
    );
    expect(Object.keys(locomoMusicStationArtwork).sort()).toEqual(
      [...artworkStations].sort(),
    );

    for (const station of artworkStations) {
      expect(resolveLocomoMusicStationArtwork(station, "dark")).toBe(
        locomoMusicDarkStationArtwork[station],
      );
      expect(resolveLocomoMusicStationArtwork(station, "light")).toBe(
        locomoMusicStationArtwork[station],
      );
    }
  });

  it("keeps the original artwork as the fallback for unknown stations", () => {
    expect(resolveLocomoMusicStationArtwork("Unknown", "light")).toBeUndefined();
    expect(resolveLocomoMusicStationArtwork("Unknown", "dark")).toBeUndefined();
  });

  it("maps the featured house stations to their approved artwork", () => {
    expect(locomoMusicStationArtwork["Bollywood house"]).toBe(
      locomoMusicStationArtwork.House,
    );
    expect(locomoMusicDarkStationArtwork["Bollywood house"]).toBe(
      locomoMusicDarkStationArtwork.House,
    );
    expect(locomoMusicStationArtwork["Future French House"]).toBe(
      "./assets/stations/future-french-house.png",
    );
    expect(locomoMusicDarkStationArtwork["Future French House"]).toBe(
      "./assets/stations-dark/future-french-house.png",
    );
    expect(locomoMusicStationArtwork["Latin house"]).toBe(
      "./assets/stations/latin-house.png",
    );
    expect(locomoMusicDarkStationArtwork["Latin house"]).toBe(
      "./assets/stations-dark/latin-house.png",
    );
    expect(locomoMusicStationArtwork["Latin techno"]).toBe(
      locomoMusicStationArtwork.Techno,
    );
    expect(locomoMusicDarkStationArtwork["Latin techno"]).toBe(
      locomoMusicDarkStationArtwork.Techno,
    );
  });

  it("keeps the Doom Dark-only seam repair separate from its Light source", () => {
    // The Dark derivative makes source-alpha columns x=1264..1266 opaque
    // before inversion so the source seam becomes transparent. The original
    // Light artwork remains byte-for-byte untouched.
    expect(resolveLocomoMusicStationArtwork("Doom metal", "light")).toBe(
      "./assets/stations/doom-metal.png",
    );
    expect(resolveLocomoMusicStationArtwork("Doom metal", "dark")).toBe(
      "./assets/stations-dark/doom-metal.png",
    );
  });
});
