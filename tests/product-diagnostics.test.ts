import { describe, expect, it } from "vitest";

import {
  DIAGNOSTICS_MAX_CHARACTERS,
  formatProductDiagnostics,
} from "../src/main/product-diagnostics";

describe("privacy-safe local diagnostics", () => {
  it("formats a bounded report containing only explicit local status fields", () => {
    const report = formatProductDiagnostics({
      appVersion: "0.1.0",
      backend: "cpp-q8",
      buildVersion: "0.1.0",
      engineStatus: "error",
      generatedAt: new Date("2026-08-04T13:00:00.000Z"),
      runtimePhase: "ready",
    });

    expect(report).toContain("Locomo Music OSS diagnostics");
    expect(report).toContain("App version: 0.1.0");
    expect(report).toContain("Build: 0.1.0");
    expect(report).toContain("Backend: cpp-q8");
    expect(report).toContain("Runtime phase: ready");
    expect(report).toContain("Engine status: error");
    expect(report.length).toBeLessThanOrEqual(
      DIAGNOSTICS_MAX_CHARACTERS + 1,
    );
    for (const forbidden of [
      "/Users/",
      "prompt",
      "lyrics",
      "failures",
      "telemetry",
    ]) {
      expect(report.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("normalizes malformed versions and dates instead of echoing them", () => {
    const report = formatProductDiagnostics({
      appVersion: "/Users/private",
      backend: "cpp-q8",
      buildVersion: "\nprivate",
      engineStatus: "ready",
      generatedAt: new Date(Number.NaN),
      runtimePhase: "checking",
    });
    expect(report).not.toContain("/Users/private");
    expect(report).not.toContain("\nprivate");
    expect(report.match(/unknown/gu)).toHaveLength(3);
  });
});
