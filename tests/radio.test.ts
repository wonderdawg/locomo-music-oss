import { readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { locomoMusicCategoryCatalogs } from "../src/renderer/category-catalog";
import {
  locomoMusicGenres,
  locomoMusicStationArtwork,
  locomoMusicStationLyricDirections,
  locomoMusicStationPromptAnchors,
} from "../src/renderer/music-data";
import {
  admitGeneratedTrack,
  countStationTrackVariations,
  createStationGenerationRequest,
  createStationGenerationRequestForRecipe,
  nextTrackAtPlaybackBoundary,
  seedCategoryPlaylist,
} from "../src/renderer/radio";

describe("station radio parity", () => {
  it("ships all 33 unique recipe stations and featured artwork", async () => {
    const stations = locomoMusicGenres.flatMap((genre) =>
      genre.styles.map((style) => style.name),
    );
    const artworkStations = [...stations, "Future French House"];
    const assets = await readdir(
      path.join(
        process.cwd(),
        "src",
        "renderer",
        "public",
        "assets",
        "stations",
      ),
    );

    expect(stations).toHaveLength(33);
    expect(new Set(stations).size).toBe(33);
    expect(Object.keys(locomoMusicStationArtwork).sort()).toEqual(
      [...artworkStations].sort(),
    );
    expect(assets.filter((asset) => asset.endsWith(".png"))).toHaveLength(
      32,
    );
    expect(locomoMusicStationArtwork["Bollywood house"]).toBe(
      locomoMusicStationArtwork.House,
    );
    expect(locomoMusicStationArtwork["Future French House"]).toBe(
      "./assets/stations/future-french-house.png",
    );
    expect(locomoMusicStationArtwork["Latin house"]).toBe(
      "./assets/stations/latin-house.png",
    );
    expect(locomoMusicStationArtwork["Latin techno"]).toBe(
      locomoMusicStationArtwork.Techno,
    );
  });

  it("keeps exact V1 prompt composition and unrelated request settings", () => {
    const vocal = createStationGenerationRequestForRecipe(
      ["House"],
      false,
      0,
      "v1",
    );
    const instrumental = createStationGenerationRequestForRecipe(
      ["House"],
      true,
      1,
      "v1",
    );

    expect(vocal).toEqual({
      categoryKey: "existing/house",
      mode: "create",
      station: "House",
      prompt:
        "House. Electronic House track. Driving house music with a powerful four-on-the-floor kick, warm rolling bass, syncopated percussion, soulful chord stabs, gradual builds, and a polished club mix. English electronic-pop vocals with clean rhythmic phrasing, concise evocative lyrics, a distinctive human tone, and a short hook that integrates naturally with the production.",
      promptRecipeVersion: "v1",
      lyrics: "__AUTO__",
      duration: 120,
      bpm: 120,
    });
    expect(instrumental?.lyrics).toBe("");
    expect(instrumental?.prompt).not.toContain(
      "English electronic-pop vocals",
    );
    expect(
      [0, 1, 2, 3, 4].map(
        (count) =>
          createStationGenerationRequest(["House"], false, count)?.bpm,
      ),
    ).toEqual([120, 122, 124, 126, 120]);
  });

  it("preserves all twelve Indie pop vocal pairings while Lyrics is on", () => {
    const anchors =
      locomoMusicStationPromptAnchors["Indie pop"] ?? [];
    const lyricDirections =
      locomoMusicStationLyricDirections["Indie pop"] ?? [];
    const history: Array<{ readonly lyrics: string }> = [];
    const requests = Array.from({ length: 17 }, () => {
      const request = createStationGenerationRequestForRecipe(
        ["Indie pop"],
        false,
        countStationTrackVariations(history),
        "v2.3",
      )!;
      history.push({
        lyrics: request.lyrics === "" ? "" : "generated vocal",
      });
      return request;
    });
    const vocalPrompts = requests
      .filter((request) => request.lyrics === "__AUTO__")
      .map((request) => request.prompt);
    const pairings = vocalPrompts.slice(0, 12).map((prompt) => {
      const matchingAnchors = anchors.filter((anchor) =>
        prompt.includes(anchor),
      );
      const matchingDirections = lyricDirections.filter((direction) =>
        prompt.includes(direction),
      );

      expect(matchingAnchors).toHaveLength(1);
      expect(matchingDirections).toHaveLength(1);
      return `${matchingAnchors[0]} ${matchingDirections[0]}`;
    });
    const expectedPairings = anchors.flatMap((anchor) =>
      lyricDirections.map((direction) => `${anchor} ${direction}`),
    );

    expect(lyricDirections).toEqual([
      "The lyrics approach sadness and melancholy through intimate details and longing held in restraint, while recurring flashes of catharsis press against that composure; keep the language lived-in, natural, and emotionally ambiguous.",
      "The lyrics express self-affirmation and aspiration through earned confidence and forward motion, with doubt repeatedly testing conviction so every assertion feels specific, human, and hard-won rather than slogan-like.",
      "The lyrics explore a philosophical idea through concrete images, letting apparent certainty repeatedly loosen into wonder and renewed questioning; keep the voice natural, curious, and reflectively unresolved.",
    ]);
    expect(Object.keys(locomoMusicStationLyricDirections)).toEqual([
      "Indie pop",
    ]);
    expect(
      requests.slice(0, 16).flatMap((request, index) =>
        request.lyrics === "" ? [index] : [],
      ),
    ).toEqual([]);
    expect(new Set(vocalPrompts.slice(0, 12)).size).toBe(12);
    expect([...pairings].sort()).toEqual([...expectedPairings].sort());
    expect(vocalPrompts[12]).toBe(vocalPrompts[0]);
    requests.forEach((request) => {
      const prompt = request.prompt;
      expect(prompt).not.toMatch(
        /\b(complete|one-minute|intro|verse|chorus|midpoint|return|land|final|outro|end|ending|emerge|become)\b/i,
      );
    });
  });

  it("uses the dedicated Indie pop instrumental prompt without lyric directions", () => {
    const lyricDirections =
      locomoMusicStationLyricDirections["Indie pop"] ?? [];
    const requests = Array.from({ length: 5 }, (_, count) =>
      createStationGenerationRequest(["Indie pop"], true, count),
    );

    expect(
      new Set(
        requests.slice(0, 4).map((request) => request?.prompt),
      ).size,
    ).toBe(1);
    expect(requests[4]?.prompt).toBe(requests[0]?.prompt);
    requests.forEach((request) => {
      expect(request?.lyrics).toBe("");
      expect(request?.prompt).toBe(
        "Instrumental indie pop song with clean, spacious high-fidelity production, natural dynamics, clear separation, and a polished full-range mix.",
      );
      lyricDirections.forEach((direction) => {
        expect(request?.prompt).not.toContain(direction);
      });
    });
  });

  it("gives other stations their own lyric directions", () => {
    const lyricDirections =
      locomoMusicStationLyricDirections["Indie pop"] ?? [];
    const otherStations = locomoMusicCategoryCatalogs.existing.categories
      .filter(
        (category) => category.behavior?.promptKind !== "fixed",
      )
      .map((category) => category.name)
      .filter(
        (station) => station !== "Indie pop" && station !== "Indie folk",
      );

    otherStations.forEach((station) => {
      const request = createStationGenerationRequest(
        [station],
        false,
        5,
      );
      const firstRequest = createStationGenerationRequest(
        [station],
        false,
        0,
      );

      expect(request?.lyrics).toBe("__AUTO__");
      expect(request?.prompt).not.toBe(firstRequest?.prompt);
      lyricDirections.forEach((direction) => {
        expect(request?.prompt).not.toContain(direction);
      });
    });
  });

  it("seeds with the fourth-newest track, otherwise the oldest", () => {
    const tracks = [1, 2, 3, 4, 5].map((number) => ({
      categoryKey: "existing/house" as const,
      id: `track-${number}`,
      prompt: "House. Test",
    }));

    expect(seedCategoryPlaylist(tracks, "existing/house")).toMatchObject({
      playlist: [
        "track-5",
        "track-4",
        "track-3",
        "track-2",
        "track-1",
      ],
      startingTrack: tracks[3],
    });
    expect(
      seedCategoryPlaylist(tracks.slice(0, 3), "existing/house")
        .startingTrack,
    ).toBe(tracks[2]);
  });

  it("starts an empty station immediately and queues each later song", () => {
    const first = admitGeneratedTrack({
      playlist: [],
      trackID: "fresh-1",
    });
    expect(first).toEqual({
      playlist: ["fresh-1"],
      pendingJump: undefined,
      startImmediately: true,
    });

    const admitted = admitGeneratedTrack({
      playlist: ["old-1"],
      trackID: "fresh-1",
    });
    expect(admitted.playlist).toEqual([
      "old-1",
      "fresh-1",
    ]);
    expect(admitted.pendingJump).toBe("fresh-1");
    expect(
      nextTrackAtPlaybackBoundary(
        admitted.playlist,
        "old-1",
        admitted.pendingJump,
      ),
    ).toBe("fresh-1");
    expect(
      nextTrackAtPlaybackBoundary(
        admitted.playlist,
        "fresh-1",
        undefined,
      ),
    ).toBe("old-1");
  });
});
