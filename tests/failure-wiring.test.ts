import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("OSS production-service exclusions", () => {
  it("contains no telemetry, updater, or Apple Music wiring", async () => {
    const [main, preload, renderer, contract, packageJson] = await Promise.all([
      readFile(new URL("../src/main/main.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/preload/preload.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/renderer/renderer.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/shared/app-contract.ts", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
    ]);
    const composed = [main, preload, renderer, contract, packageJson].join("\n");

    for (const forbidden of [
      "posthog",
      "electron-updater",
      "createAppUpdateController",
      "reportRendererFatal",
      "syncAppleMusic",
      "appUpdateStatus",
      "checkAppUpdate",
      "downloadAppUpdate",
      "restartToUpdate",
    ]) {
      expect(composed.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("keeps diagnostics local and explicit", async () => {
    const [main, diagnostics] = await Promise.all([
      readFile(new URL("../src/main/main.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../src/main/product-diagnostics.ts", import.meta.url),
        "utf8",
      ),
    ]);
    expect(main).toContain("clipboard.writeText(");
    expect(main).toContain("formatProductDiagnostics({");
    expect(diagnostics).not.toMatch(/fetch\(|https?:|posthog|telemetry/iu);
  });
});
