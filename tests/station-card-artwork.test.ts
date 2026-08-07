import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { locomoMusicCategoryCatalogs } from "../src/renderer/category-catalog";
import { visibleCategoryTiles } from "../src/renderer/favorites";
import {
  locomoMusicStationCardArtwork,
  resolveLocomoMusicStationCardArtwork,
} from "../src/renderer/station-card-artwork";

const expectedArtwork = Object.freeze({
  "existing/future-french-house":
    "./assets/station-masks/future-french-house.svg",
  "existing/latin-house": "./assets/station-masks/latin-house.svg",
  "existing/house": "./assets/station-masks/house.svg",
  favorites: "./assets/station-masks/favorites.svg",
  "existing/synth-pop": "./assets/station-masks/synth-pop.svg",
  "existing/indie-pop": "./assets/station-masks/indie-pop.svg",
  "existing/classic-rock": "./assets/station-masks/classic-rock.svg",
  "existing/punk-rock": "./assets/station-masks/punk-rock.svg",
  "existing/boom-bap": "./assets/station-masks/boom-bap.svg",
  "existing/lo-fi-hip-hop": "./assets/station-masks/lo-fi-hip-hop.svg",
  "existing/country-pop": "./assets/station-masks/country-pop.svg",
  "existing/cool-jazz": "./assets/station-masks/cool-jazz.svg",
  "existing/jazz-fusion": "./assets/station-masks/jazz-fusion.svg",
  "existing/techno": "./assets/station-masks/techno.svg",
  "existing/latin-techno": "./assets/station-masks/latin-techno.svg",
  "existing/indie-folk": "./assets/station-masks/indie-folk.svg",
  "existing/thrash-metal": "./assets/station-masks/thrash-metal.svg",
  "existing/progressive-metal":
    "./assets/station-masks/progressive-metal.svg",
  "existing/cinematic-hip-hop":
    "./assets/station-masks/cinematic-hip-hop.svg",
});

const expectedSvgHashes = Object.freeze({
  "boom-bap.svg":
    "3fd5cacabd5c2fb7e3571fb99e40be15fe53738b75654df88dfbfe17b5c961e7",
  "cinematic-hip-hop.svg":
    "dce9217ee4ff3ba5ec502bbb093f2d8d4e7935cd730ef20cabc4bd254b20ab0d",
  "classic-rock.svg":
    "408187d785d25592d48fae0747d109ea18f8d9278f865af7d23c4d72eb780e26",
  "cool-jazz.svg":
    "57aec31d257ad3600bcbef43544b431d173f52fb9ec39f472266b3ac8c2356db",
  "country-pop.svg":
    "cb030da4ece0d4df076e2a1e295e6afffd4e0e659241a24773e8b0a0861dfbd6",
  "favorites.svg":
    "00c48061607ae0fb10fd53a50b29d3359a8fa679cc361ebf0e9c98f602a64753",
  "future-french-house.svg":
    "339e80dc0f2948eb329907dc74d8957e03a6902c7b86dbba21ecac1bb1f0d6f4",
  "house.svg":
    "e9e908c0e1d1d1971c16cd5a2d0799785cc48281bc0bb558096492eeb86fdb9f",
  "indie-folk.svg":
    "67c85a2a7db2a6711bf3f17b3fd54e6ba63960b566cda28bf2c5e880abcf6b3b",
  "indie-pop.svg":
    "32fc638c340a66ccacadf6432e4b368acc338873bd9a563313e781fd1d2ee4bd",
  "jazz-fusion.svg":
    "6e31f63849c98beb2f50779f34cad21f0a9866e978f6fb0847d168886a9778e2",
  "latin-house.svg":
    "6d72f77dab563237d617c35de5375386498c2586ec1ceefc5d76eb7284205878",
  "latin-techno.svg":
    "4831a8922c83d99d32b3062fff5ab57f77154cf6b54c2813ee79ed0f00f19a43",
  "lo-fi-hip-hop.svg":
    "9b9a51ab29baf1b6a4808389076bb494808ccb2d31d2ca365c8ec8e1d3feaacf",
  "progressive-metal.svg":
    "4af67f6fc63be9f12b10c186b85441865ef89bb33f3e7e8b1c8e7fab9322f3ad",
  "punk-rock.svg":
    "b92f7edf17454300acfc6dbd15028bd40834746a2bb481c9e70332fb0acc399a",
  "synth-pop.svg":
    "073ba413b5f759662e9a1fb5791ee13293cba8f09a612f0b50c7a6ce70663f83",
  "techno.svg":
    "50b5faf8eca99c3b106eed084feca3963a4a4c5b66107f3120f23eeaa82c0fbe",
  "thrash-metal.svg":
    "de008b622116b312146138685f2af78d00516edb70471d522611ee161a95b858",
});

describe("station card SVG artwork", () => {
  it("maps one distinct approved SVG to each of the 19 visible cards", () => {
    const visibleArtworkKeys = visibleCategoryTiles(
      locomoMusicCategoryCatalogs.existing.categories,
      "existing",
    )
      .map((tile) => tile.key);

    expect(locomoMusicStationCardArtwork).toEqual(expectedArtwork);
    expect(new Set(Object.values(expectedArtwork)).size).toBe(19);
    expect(new Set(visibleArtworkKeys)).toEqual(
      new Set(Object.keys(expectedArtwork)),
    );
    expect(resolveLocomoMusicStationCardArtwork("favorites")).toBe(
      "./assets/station-masks/favorites.svg",
    );
    expect(
      resolveLocomoMusicStationCardArtwork("existing/latin-techno"),
    ).not.toBe(
      resolveLocomoMusicStationCardArtwork("existing/techno"),
    );
    expect(
      resolveLocomoMusicStationCardArtwork("existing/cinematic-hip-hop"),
    ).not.toBe(resolveLocomoMusicStationCardArtwork("existing/boom-bap"));
    expect(
      resolveLocomoMusicStationCardArtwork("existing/narrative-pop"),
    ).toBeUndefined();
  });

  it("keeps the 19 approved masters as path-only currentColor vectors", async () => {
    const assetDirectory = new URL(
      "../src/renderer/public/assets/station-masks/",
      import.meta.url,
    );
    const fileNames = (await readdir(assetDirectory)).sort();

    expect(fileNames).toEqual(Object.keys(expectedSvgHashes).sort());

    for (const fileName of fileNames) {
      const contents = await readFile(new URL(fileName, assetDirectory));
      const source = contents.toString("utf8");

      expect(createHash("sha256").update(contents).digest("hex")).toBe(
        expectedSvgHashes[fileName as keyof typeof expectedSvgHashes],
      );
      expect(source).toContain('viewBox="0 0 1254 1254"');
      expect(source).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(source).toContain('fill="currentColor"');
      expect(source).not.toMatch(/<image\b|data:image|(?:xlink:)?href=/iu);
      expect(source).not.toMatch(/fill="#[0-9a-f]+"/iu);
      expect(
        new Set(
          [...source.matchAll(/<\/?([a-z][\w:-]*)\b/giu)].map(
            (match) => match[1],
          ),
        ),
      ).toEqual(new Set(["svg", "path"]));
    }
  });

  it("colors the shared masks with the exact light and dark theme ink", async () => {
    const styles = await readFile(
      new URL("../src/renderer/styles.css", import.meta.url),
      "utf8",
    );
    const darkThemeStart = styles.indexOf(':root[data-theme="dark"] {');
    const darkThemeEnd = styles.indexOf("}", darkThemeStart);
    const darkTheme = styles.slice(darkThemeStart, darkThemeEnd);

    expect(styles).toContain("--locomo-yellow: #cde50b;");
    expect(styles).toContain("--locomo-ink: #191919;");
    expect(styles).toContain("--locomo-foreground: var(--locomo-ink);");
    expect(darkTheme).toContain(
      "--locomo-foreground: var(--locomo-yellow);",
    );
  });
});
