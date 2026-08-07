import {
  EXISTING_CATEGORY_IDENTITIES,
  type MusicCategoryKey,
} from "../shared/music-categories";

const MAX_GENERATED_TRACK_TITLE_LENGTH = 24;
const GENERATED_TRACK_TITLE_FALLBACK = "New Song";

export function createGeneratedTrackTitle(
  lyrics: string | undefined,
  prompt: string,
): string {
  const lines = (lyrics ?? "")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\[[^\]]+\]\s*/, "")
        .replace(/[^\p{L}\p{N}' -]/gu, "")
        .trim(),
    )
    .filter((line) => line.split(/\s+/).length >= 2);
  const counts = new Map<string, number>();
  lines.forEach((line) =>
    counts.set(line, (counts.get(line) ?? 0) + 1),
  );
  const candidate = lines.toSorted(
    (left, right) =>
      (counts.get(right) ?? 0) - (counts.get(left) ?? 0),
  )[0];
  const words = (candidate ?? prompt.split(".")[0] ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(
      (word) =>
        `${word[0]?.toUpperCase() ?? ""}${word.slice(1).toLowerCase()}`,
    );
  const titleWords: string[] = [];
  for (const word of words) {
    const nextTitle = [...titleWords, word].join(" ");
    if ([...nextTitle].length > MAX_GENERATED_TRACK_TITLE_LENGTH) break;
    titleWords.push(word);
  }

  return titleWords.join(" ") || GENERATED_TRACK_TITLE_FALLBACK;
}

const INSTRUMENTAL_TITLE_NUMBER_SPACE = 100_000;
const existingInstrumentalLabels = new Map<MusicCategoryKey, string>(
  EXISTING_CATEGORY_IDENTITIES.map(
    ({ key, name }) => [key, name] as const,
  ),
);
const shortInstrumentalLabels: Readonly<
  Partial<Record<MusicCategoryKey, string>>
> = Object.freeze({
  "existing/new-jack-swing": "New Jack",
  "existing/future-french-house": "French House",
  "experimental/narrative-pop": "Narrative Pop",
  "experimental/melodic-rap-and-r-and-b": "Melodic R&B",
  "experimental/country-crossover": "Country Crossover",
  "experimental/cinematic-hip-hop": "Cinematic Hip-Hop",
  "experimental/latin-trap-and-reggaeton": "Latin Trap",
  "experimental/dark-synth-pop": "Dark Synth-Pop",
  "experimental/minimal-alt-pop": "Minimal Alt-Pop",
});

export function createGenerationTrackTitle(input: {
  readonly categoryKey: MusicCategoryKey;
  readonly generatedLyrics: string | undefined;
  readonly id: string;
  readonly prompt: string;
  readonly requestedLyrics: string;
}): string {
  if (input.requestedLyrics !== "") {
    return createGeneratedTrackTitle(
      input.generatedLyrics,
      input.prompt,
    );
  }

  const suffix = compactInstrumentalNumber(input.id);
  const label =
    shortInstrumentalLabels[input.categoryKey] ??
    existingInstrumentalLabels.get(input.categoryKey) ??
    "Instrumental";
  const title = `${label} ${suffix}`;
  const wordCount = title.split(/\s+/).length;

  return wordCount <= 3 && [...title].length <= MAX_GENERATED_TRACK_TITLE_LENGTH
    ? title
    : `Instrumental ${suffix}`;
}

function compactInstrumentalNumber(id: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return String((hash >>> 0) % INSTRUMENTAL_TITLE_NUMBER_SPACE);
}
