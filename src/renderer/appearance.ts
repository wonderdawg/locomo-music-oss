export const APPEARANCE_STORAGE_KEY =
  "locomo-music:appearance" as const;
export const LEGACY_THEME_STORAGE_KEY =
  "locomo-music:theme" as const;

export const APPEARANCE_OPTIONS = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
] as const;

export type AppearancePreference =
  (typeof APPEARANCE_OPTIONS)[number]["value"];
export type ResolvedAppearance = "light" | "dark";

export interface AppearanceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isAppearancePreference(
  value: string | null,
): value is AppearancePreference {
  return APPEARANCE_OPTIONS.some((option) => option.value === value);
}

function isLegacyExplicitTheme(
  value: string | null,
): value is ResolvedAppearance {
  return value === "light" || value === "dark";
}

export function readAppearancePreference(
  storage: AppearanceStorage,
): AppearancePreference {
  let legacyTheme: string | null;
  try {
    const saved = storage.getItem(APPEARANCE_STORAGE_KEY);
    if (isAppearancePreference(saved)) {
      return saved;
    }

    legacyTheme = storage.getItem(LEGACY_THEME_STORAGE_KEY);
  } catch {
    return "system";
  }

  if (isLegacyExplicitTheme(legacyTheme)) {
    try {
      storage.setItem(APPEARANCE_STORAGE_KEY, legacyTheme);
    } catch {
      // Keep honoring the explicit legacy choice if migration cannot write.
    }
    return legacyTheme;
  }

  return "system";
}

export function writeAppearancePreference(
  storage: AppearanceStorage,
  preference: AppearancePreference,
): void {
  storage.setItem(APPEARANCE_STORAGE_KEY, preference);
}

export function resolveAppearance(
  preference: AppearancePreference,
  systemUsesDark: boolean,
): ResolvedAppearance {
  if (preference === "system") {
    return systemUsesDark ? "dark" : "light";
  }

  return preference;
}
