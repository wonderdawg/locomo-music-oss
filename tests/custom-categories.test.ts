import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { resolveLocomoMusicCategory } from "../src/renderer/category-catalog";
import {
  CUSTOM_CATEGORIES_STORAGE_KEY,
  createCustomCategoryDefinition,
  customCategoryDefinitionToCategory,
  readCustomCategoryDefinitions,
  writeCustomCategoryDefinitions,
  type CustomCategoryStorage,
} from "../src/renderer/custom-categories";
import {
  createCategoryGenerationRequest,
  shouldGenerateOnCategorySelection,
} from "../src/renderer/radio";

class MemoryStorage implements CustomCategoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("local custom categories", () => {
  it("persists stable IDs, deterministic names, and the exact pasted prompt", () => {
    const exactPrompt =
      "  Glass harmonica and brushed drums.\nKeep the silence intact.  ";
    const first = createCustomCategoryDefinition(
      [],
      exactPrompt,
      "11111111-1111-4111-8111-111111111111",
    );
    const second = createCustomCategoryDefinition(
      [first],
      "Second prompt",
      "22222222-2222-4222-8222-222222222222",
    );

    expect(first).toEqual({
      id: "experimental/custom-11111111-1111-4111-8111-111111111111",
      name: "Custom 1",
      prompt: exactPrompt,
    });
    expect(second.name).toBe("Custom 2");

    const storage = new MemoryStorage();
    writeCustomCategoryDefinitions(storage, [first, second]);
    expect(readCustomCategoryDefinitions(storage)).toEqual([
      first,
      second,
    ]);
    expect(
      JSON.parse(storage.getItem(CUSTOM_CATEGORIES_STORAGE_KEY) ?? "[]")[0]
        .prompt,
    ).toBe(exactPrompt);
  });

  it("rejects empty input and ignores malformed persisted definitions", () => {
    expect(() =>
      createCustomCategoryDefinition([], " \n\t ", "unused"),
    ).toThrow("cannot be empty");

    const storage = new MemoryStorage();
    storage.setItem(
      CUSTOM_CATEGORIES_STORAGE_KEY,
      JSON.stringify([
        {
          id: "experimental/custom-valid-id",
          name: "Custom 1",
          prompt: "Exact valid prompt",
        },
        {
          id: "experimental/custom-bad/id",
          name: "Custom 2",
          prompt: "Invalid ID",
        },
        {
          id: "experimental/custom-empty",
          name: "Custom 3",
          prompt: "   ",
        },
      ]),
    );

    expect(readCustomCategoryDefinitions(storage)).toEqual([
      {
        id: "experimental/custom-valid-id",
        name: "Custom 1",
        prompt: "Exact valid prompt",
      },
    ]);
  });

  it("uses the exact custom prompt with the existing Lyrics mechanics", () => {
    const exactPrompt = "  Raw prompt.\nDo not rewrite this.  ";
    const definition = createCustomCategoryDefinition(
      [],
      exactPrompt,
      "stable-id",
    );
    const runtimeCategory =
      customCategoryDefinitionToCategory(definition);

    expect(
      resolveLocomoMusicCategory(definition.id, [runtimeCategory]),
    ).toMatchObject({
      customPrompt: exactPrompt,
      key: definition.id,
      name: "Custom 1",
      set: "experimental",
      behavior: {
        promptKind: "custom",
      },
    });
    expect(
      createCategoryGenerationRequest(
        definition.id,
        false,
        0,
        180,
        [runtimeCategory],
      ),
    ).toEqual({
      categoryKey: definition.id,
      duration: 180,
      lyrics: "__AUTO__",
      mode: "create",
      prompt: exactPrompt,
      promptRecipeVersion: "custom",
      station: "Custom 1",
    });
    expect(
      createCategoryGenerationRequest(
        definition.id,
        true,
        0,
        180,
        [runtimeCategory],
      ),
    ).toMatchObject({
      lyrics: "",
      prompt: exactPrompt,
    });
  });

  it("always starts one empty custom category and leaves continuation to Auto-create", () => {
    expect(
      shouldGenerateOnCategorySelection({
        autoCreate: false,
        isCustomCategory: true,
        preloadedTrackCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldGenerateOnCategorySelection({
        autoCreate: false,
        isCustomCategory: true,
        preloadedTrackCount: 1,
      }),
    ).toBe(false);
    expect(
      shouldGenerateOnCategorySelection({
        autoCreate: false,
        isCustomCategory: false,
        preloadedTrackCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldGenerateOnCategorySelection({
        autoCreate: true,
        isCustomCategory: true,
        preloadedTrackCount: 1,
      }),
    ).toBe(true);
  });

  it("keeps the creator modal and tile within the reduced first-pass scope", async () => {
    const source = await readFile(
      new URL(
        "../src/renderer/LocomoMusicStudio.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).toContain("data-add-category");
    expect(source).toContain("data-add-category-modal");
    expect(source).toContain("Paste your prompt here…");
    expect(source).toContain(
      "disabled={customCategoryPrompt().trim().length === 0}",
    );
    expect(source).toContain('event.key !== "Escape"');
    expect(source).toContain("group-hover/station:opacity-100");
    expect(source).not.toContain("data-delete-custom-category");
    expect(source).not.toContain("deleteCustomCategoryAndSongs");

    const addStart = source.indexOf("const addCustomCategory =");
    const addEnd = source.indexOf(
      "return (",
      addStart,
    );
    const addSource = source.slice(addStart, addEnd);
    expect(addSource).toContain("writeCustomCategoryDefinitions(");
    expect(addSource).toContain("closeAddCategory();");
    expect(addSource).not.toContain("selectStation(");
    expect(addSource).not.toContain("requestWindowExpansion");
  });
});
