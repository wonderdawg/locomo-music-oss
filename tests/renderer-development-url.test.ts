import { describe, expect, it } from "vitest";

import { resolveRendererDevelopmentUrl } from "../src/main/renderer-development-url";

describe("renderer development URL", () => {
  it("ignores every override in packaged builds", () => {
    for (const overrideUrl of [
      "http://127.0.0.1:5173",
      "https://remote.example/renderer",
      "not a URL",
    ]) {
      expect(resolveRendererDevelopmentUrl(overrideUrl, true)).toBeUndefined();
    }
  });

  it.each([
    ["http://localhost:5173", "http://localhost:5173/"],
    ["http://127.0.0.1:4173/renderer", "http://127.0.0.1:4173/renderer"],
    ["http://[::1]:8080?mode=dev", "http://[::1]:8080/?mode=dev"],
  ])("permits the loopback development URL %s", (overrideUrl, expected) => {
    expect(resolveRendererDevelopmentUrl(overrideUrl, false)).toBe(expected);
  });

  it.each([
    "https://localhost:5173",
    "https://remote.example/renderer",
    "http://remote.example/renderer",
    "http://localhost.remote.example:5173",
    "http://127.0.0.2:5173",
    "http://127.1:5173",
    "http://[::2]:5173",
    "file:///tmp/renderer.html",
    "data:text/html,renderer",
    "javascript:alert(1)",
    "locomo-music://localhost/renderer",
    "http://user:password@localhost:5173",
    "http://@localhost:5173",
    "http://localhost:70000",
    "http://[::1",
    "not a URL",
    " http://localhost:5173",
  ])("rejects the development override %s", (overrideUrl) => {
    expect(resolveRendererDevelopmentUrl(overrideUrl, false)).toBeUndefined();
  });
});
