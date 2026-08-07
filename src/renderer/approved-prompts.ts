import type { MusicPromptRecipeVersion } from "../shared/app-contract";
import type { MusicCategoryKey } from "../shared/music-categories";

export const APPROVED_PROMPTS_STORAGE_KEY =
  "locomo-music:approved-prompts" as const;

export interface ApprovedPromptExample {
  readonly approvedAt: string;
  readonly categoryKey: MusicCategoryKey | null;
  readonly promptRecipeVersion: MusicPromptRecipeVersion | null;
  readonly songID: string;
  readonly station: string | null;
  readonly title: string;
}

export type ApprovedPromptIndex = Readonly<
  Record<string, readonly ApprovedPromptExample[]>
>;

interface ApprovedPromptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readApprovedPromptIndex(
  storage: ApprovedPromptStorage,
): ApprovedPromptIndex {
  try {
    const saved = storage.getItem(APPROVED_PROMPTS_STORAGE_KEY);
    if (saved === null) return {};
    const parsed = JSON.parse(saved) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([prompt, value]) => {
        if (!prompt || !Array.isArray(value)) return [];
        const examples = value
          .filter(isApprovedPromptExample)
          .filter(
            (example, index, all) =>
              all.findIndex(
                (candidate) => candidate.songID === example.songID,
              ) === index,
          );
        return examples.length > 0 ? [[prompt, examples]] : [];
      }),
    );
  } catch {
    return {};
  }
}

export function writeApprovedPromptIndex(
  storage: ApprovedPromptStorage,
  index: ApprovedPromptIndex,
): void {
  storage.setItem(APPROVED_PROMPTS_STORAGE_KEY, JSON.stringify(index));
}

export function toggleApprovedPromptExample(
  index: ApprovedPromptIndex,
  prompt: string,
  example: ApprovedPromptExample,
): ApprovedPromptIndex {
  const examples = index[prompt] ?? [];
  const approved = examples.some(
    (candidate) => candidate.songID === example.songID,
  );
  const nextExamples = approved
    ? examples.filter((candidate) => candidate.songID !== example.songID)
    : [...examples, example];

  return Object.fromEntries([
    ...Object.entries(index).filter(([key]) => key !== prompt),
    ...(nextExamples.length > 0 ? [[prompt, nextExamples] as const] : []),
  ]);
}

function isApprovedPromptExample(
  value: unknown,
): value is ApprovedPromptExample {
  if (!value || typeof value !== "object") return false;
  const example = value as Partial<ApprovedPromptExample>;
  return (
    typeof example.approvedAt === "string" &&
    (example.categoryKey === null ||
      (typeof example.categoryKey === "string" &&
        /^(?:existing|experimental)\//u.test(example.categoryKey))) &&
    (example.promptRecipeVersion === null ||
      example.promptRecipeVersion === "custom" ||
      example.promptRecipeVersion === "v1" ||
      example.promptRecipeVersion === "v2.3") &&
    typeof example.songID === "string" &&
    example.songID.length > 0 &&
    (example.station === null || typeof example.station === "string") &&
    typeof example.title === "string" &&
    example.title.length > 0
  );
}
