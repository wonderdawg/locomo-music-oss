import { describe, expect, it } from "vitest";

import {
  APPEARANCE_OPTIONS,
  APPEARANCE_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  readAppearancePreference,
  resolveAppearance,
  writeAppearancePreference,
  type AppearanceStorage,
} from "../src/renderer/appearance";

class MemoryStorage implements AppearanceStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("appearance settings", () => {
  it("offers exactly Light, Dark, and System", () => {
    expect(APPEARANCE_OPTIONS).toEqual([
      { label: "Light", value: "light" },
      { label: "Dark", value: "dark" },
      { label: "System", value: "system" },
    ]);
  });

  it("defaults installations without a saved choice to System", () => {
    expect(readAppearancePreference(new MemoryStorage())).toBe(
      "system",
    );
  });

  it.each(["light", "dark"] as const)(
    "preserves a saved explicit %s choice",
    (saved) => {
      const storage = new MemoryStorage();
      storage.setItem(APPEARANCE_STORAGE_KEY, saved);

      expect(readAppearancePreference(storage)).toBe(saved);
    },
  );

  it.each(["light", "dark"] as const)(
    "migrates a legacy explicit %s choice",
    (legacy) => {
      const storage = new MemoryStorage();
      storage.setItem(LEGACY_THEME_STORAGE_KEY, legacy);

      expect(readAppearancePreference(storage)).toBe(legacy);
      expect(storage.getItem(APPEARANCE_STORAGE_KEY)).toBe(legacy);
    },
  );

  it("keeps a legacy explicit choice if migration storage is read-only", () => {
    const storage: AppearanceStorage = {
      getItem: (key) =>
        key === LEGACY_THEME_STORAGE_KEY ? "dark" : null,
      setItem: () => {
        throw new Error("read-only");
      },
    };

    expect(readAppearancePreference(storage)).toBe("dark");
  });

  it("persists all three appearance preferences", () => {
    const storage = new MemoryStorage();

    for (const option of APPEARANCE_OPTIONS) {
      writeAppearancePreference(storage, option.value);
      expect(readAppearancePreference(storage)).toBe(option.value);
    }
  });

  it("resolves System live while explicit choices remain fixed", () => {
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("light", true)).toBe("light");
    expect(resolveAppearance("dark", false)).toBe("dark");
  });
});
