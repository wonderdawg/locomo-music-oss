import type { MusicCategoryKey } from "../shared/music-categories";
import type { LocomoMusicCategory } from "./category-catalog";

export const CUSTOM_CATEGORIES_STORAGE_KEY =
  "locomo-music:custom-categories" as const;
export const CUSTOM_CATEGORY_ID_PREFIX =
  "experimental/custom-" as const;

export interface CustomCategoryDefinition {
  readonly id: MusicCategoryKey;
  readonly name: string;
  readonly prompt: string;
}

export interface CustomCategoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readCustomCategoryDefinitions(
  storage: CustomCategoryStorage,
): CustomCategoryDefinition[] {
  let parsed: unknown;
  try {
    const saved = storage.getItem(CUSTOM_CATEGORIES_STORAGE_KEY);
    if (saved === null) return [];
    parsed = JSON.parse(saved);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const ids = new Set<string>();
  const names = new Set<string>();
  return parsed.filter((value): value is CustomCategoryDefinition => {
    if (!isCustomCategoryDefinition(value)) return false;
    if (ids.has(value.id) || names.has(value.name)) return false;
    ids.add(value.id);
    names.add(value.name);
    return true;
  });
}

export function writeCustomCategoryDefinitions(
  storage: CustomCategoryStorage,
  definitions: readonly CustomCategoryDefinition[],
): void {
  storage.setItem(
    CUSTOM_CATEGORIES_STORAGE_KEY,
    JSON.stringify(definitions),
  );
}

export function createCustomCategoryDefinition(
  definitions: readonly CustomCategoryDefinition[],
  prompt: string,
  generatedID: string,
): CustomCategoryDefinition {
  if (prompt.trim().length === 0) {
    throw new Error("A custom category prompt cannot be empty.");
  }
  if (!/^[a-zA-Z0-9-]+$/.test(generatedID)) {
    throw new Error("A custom category ID must be URL-safe.");
  }

  const id = `${CUSTOM_CATEGORY_ID_PREFIX}${generatedID}` as MusicCategoryKey;
  if (definitions.some((definition) => definition.id === id)) {
    throw new Error("A custom category ID must be unique.");
  }

  const nextNumber =
    definitions.reduce(
      (highest, definition) =>
        Math.max(highest, customCategoryNumber(definition.name) ?? 0),
      0,
    ) + 1;

  return {
    id,
    name: `Custom ${nextNumber}`,
    prompt,
  };
}

export function customCategoryDefinitionToCategory(
  definition: CustomCategoryDefinition,
): LocomoMusicCategory {
  return {
    behavior: { promptKind: "custom" },
    customPrompt: definition.prompt,
    group: "CUSTOM",
    key: definition.id,
    name: definition.name,
    set: "experimental",
  };
}

function isCustomCategoryDefinition(
  value: unknown,
): value is CustomCategoryDefinition {
  if (!value || typeof value !== "object") return false;
  const definition = value as Partial<CustomCategoryDefinition>;
  return (
    typeof definition.id === "string" &&
    isCustomCategoryID(definition.id) &&
    typeof definition.name === "string" &&
    customCategoryNumber(definition.name) !== undefined &&
    typeof definition.prompt === "string" &&
    definition.prompt.trim().length > 0
  );
}

function isCustomCategoryID(value: string): value is MusicCategoryKey {
  return (
    value.startsWith(CUSTOM_CATEGORY_ID_PREFIX) &&
    /^[a-zA-Z0-9-]+$/.test(
      value.slice(CUSTOM_CATEGORY_ID_PREFIX.length),
    )
  );
}

function customCategoryNumber(name: string): number | undefined {
  const match = /^Custom ([1-9]\d*)$/.exec(name);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : undefined;
}
