import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  SETTINGS_WINDOW_HEIGHT,
  SETTINGS_WINDOW_WIDTH,
} from "../src/shared/window-layout";

describe("runtime status placement", () => {
  it("moves the complete runtime status control from the studio into Settings", async () => {
    const source = await readFile(
      new URL("../src/renderer/renderer.tsx", import.meta.url),
      "utf8",
    );
    const appStart = source.indexOf("function App()");
    const settingsViewStart = source.indexOf("function SettingsView()");
    const settingsViewEnd = source.indexOf("const root", settingsViewStart);
    const app = source.slice(appStart, settingsViewStart);
    const settingsView = source.slice(settingsViewStart, settingsViewEnd);

    expect(appStart).toBeGreaterThanOrEqual(0);
    expect(settingsViewStart).toBeGreaterThan(appStart);
    expect(app).not.toContain("<MemoryIndicator />");
    expect(settingsView).toContain("<SettingsWindow />");
    expect(settingsView).toContain("<MemoryIndicator />");
    expect(source).toContain(
      "isSettingsView ? <SettingsView /> : <App />",
    );
  });

  it("preserves readiness, Local labeling, model details, hover, and accessibility", async () => {
    const [source, styles] = await Promise.all([
      readFile(
        new URL("../src/renderer/renderer.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/renderer/styles.css", import.meta.url),
        "utf8",
      ),
    ]);
    const indicatorStart = source.indexOf("function MemoryIndicator()");
    const indicatorEnd = source.indexOf("function App()", indicatorStart);
    const indicator = source.slice(indicatorStart, indicatorEnd);

    expect(indicatorStart).toBeGreaterThanOrEqual(0);
    expect(indicator).toContain('return "Ready"');
    expect(indicator).toContain('return "Not ready"');
    expect(indicator).toContain('return "Starting…"');
    expect(indicator).toContain("window.locomoMusic.getMemoryStatus()");
    expect(indicator).toContain("window.locomoMusic.onMemoryStatus(setStatus)");
    expect(indicator).toContain("data-memory-status={status().status}");
    expect(indicator).toContain("aria-label={`${label()}. Show memory details`}");
    expect(indicator).toContain('<span class="memory-indicator__local">Local</span>');
    expect(indicator).toContain("<p>{status().model}</p>");
    expect(indicator).toContain('class="memory-indicator__popover"');
    expect(indicator).toContain("window.locomoMusic.copyDiagnostics()");
    expect(indicator).toContain("data-copy-diagnostics");
    expect(indicator).toContain('aria-live="polite"');
    expect(indicator).toContain('"Copy diagnostics"');
    expect(styles).toContain(
      ".memory-indicator:hover .memory-indicator__popover",
    );
    expect(styles).toContain(
      ".memory-indicator:focus-within .memory-indicator__popover",
    );
    expect(styles).toContain(".memory-indicator__diagnostics button");
  });

  it("budgets a fixed Settings window for the complete active Overnight state", async () => {
    const source = await readFile(
      new URL("../src/main/main.ts", import.meta.url),
      "utf8",
    );
    const settingsStart = source.indexOf(
      "function createSettingsWindow(): BrowserWindow {",
    );
    const settingsEnd = source.indexOf("function createWindow", settingsStart);
    const settingsWindow = source.slice(settingsStart, settingsEnd);

    expect(settingsStart).toBeGreaterThanOrEqual(0);
    expect(SETTINGS_WINDOW_HEIGHT).toBe(550);
    expect(SETTINGS_WINDOW_WIDTH).toBe(480);
    expect(settingsWindow).toContain("height: SETTINGS_WINDOW_HEIGHT,");
    expect(settingsWindow).toContain("width: SETTINGS_WINDOW_WIDTH,");
  });

  it("fits the complete Settings stack without scrolling or shrinking its text", async () => {
    const source = await readFile(
      new URL("../src/renderer/styles.css", import.meta.url),
      "utf8",
    );
    const settingsStart = source.indexOf(".settings-window {");
    const settingsEnd = source.indexOf(".memory-indicator {", settingsStart);
    const settings = source.slice(settingsStart, settingsEnd);

    expect(settingsStart).toBeGreaterThanOrEqual(0);
    expect(settings).toContain("gap: 12px;");
    expect(settings).toContain("overflow: hidden;");
    expect(settings).toContain("padding: 18px 32px;");
    expect(settings).toContain("font-size: 20px;");
    expect(settings).toContain("font-size: 13px;");
    expect(settings).toContain("padding: 10px 14px;");
    expect(settings).toContain("padding: 12px 14px;");
    expect(settings).toContain(
      ".settings-window__automatic-generation-card",
    );
    expect(settings).toContain("height: 28px;");
    expect(settings).not.toContain("overflow-y: auto;");
  });

  it("includes every active Overnight row in the fixed-height Settings surface", async () => {
    const source = await readFile(
      new URL("../src/renderer/SettingsWindow.tsx", import.meta.url),
      "utf8",
    );
    const overnightStart = source.indexOf(
      'data-overnight-batch-settings',
    );
    const overnight = source.slice(overnightStart);

    expect(overnightStart).toBeGreaterThanOrEqual(0);
    expect(overnight).toContain("data-overnight-batch-cancel");
    expect(overnight).toContain("data-overnight-batch-status");
    expect(overnight).toContain("data-overnight-batch-progress");
    expect(overnight).toContain('class="settings-window__progress-track"');
    expect(overnight).toContain('class="settings-window__prerequisites"');
    expect(overnight).toContain("data-overnight-batch-failure-count");
    expect(overnight).toContain("data-overnight-batch-failure");
  });

  it("shows the installed app version dynamically in the fixed Settings footer", async () => {
    const [source, styles] = await Promise.all([
      readFile(
        new URL("../src/renderer/SettingsWindow.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/renderer/styles.css", import.meta.url),
        "utf8",
      ),
    ]);
    const versionStylesStart = styles.indexOf(
      ".settings-window__version {",
    );
    const versionStylesEnd = styles.indexOf(
      ".memory-indicator {",
      versionStylesStart,
    );
    const versionStyles = styles.slice(
      versionStylesStart,
      versionStylesEnd,
    );

    expect(source).toContain(".getAppInfo()");
    expect(source).toContain("setAppVersion(info.version)");
    expect(source).toContain("{APP_NAME} · Version {version()}");
    expect(source).not.toMatch(
      /Locomo Music OSS · Version \d+\.\d+\.\d+/u,
    );
    expect(versionStylesStart).toBeGreaterThanOrEqual(0);
    expect(versionStyles).toContain("margin-top: auto;");
    expect(versionStyles).toContain("font-size: 10px;");
  });
});
