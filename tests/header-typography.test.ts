import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

function sha256(source: Buffer | string): string {
  return createHash("sha256").update(source).digest("hex");
}

function cssBlock(source: string, opening: string): string {
  const start = source.indexOf(opening);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 2);
}

describe("Locomo header typography", () => {
  it("bundles the exact accepted Geist Black font and its license", async () => {
    const [font, license] = await Promise.all([
      readFile(
        new URL(
          "../src/renderer/assets/Geist-Black.ttf",
          import.meta.url,
        ),
      ),
      readFile(
        new URL(
          "../src/renderer/public/licenses/Geist-OFL.txt",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

    expect(sha256(font)).toBe(
      "98aaed4646179cb6eea9b37744fd6b2cff833b8090f93c0292ee644edb96f5a5",
    );
    expect(sha256(license)).toBe(
      "942560b236adfa83745b2c64e5fc09ebaf91cb331751b1157eb92187e5d6e930",
    );
    expect(license).toContain(
      "Copyright 2024 The Geist Project Authors",
    );
    expect(license).toContain(
      "SIL OPEN FONT LICENSE Version 1.1",
    );
  });

  it("applies the exact wordmark treatment only to the centered Mac header", async () => {
    const [renderer, styles] = await Promise.all([
      readFile(
        new URL("../src/renderer/renderer.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/renderer/styles.css", import.meta.url),
        "utf8",
      ),
    ]);
    const fontFace = cssBlock(
      styles,
      '@font-face {\n  font-family: "Geist";',
    );
    const header = cssBlock(styles, ".window-chrome__title {");
    const music = cssBlock(styles, ".window-chrome__title-music {");

    expect(fontFace).toContain('font-family: "Geist";');
    expect(fontFace).toContain("font-weight: 900;");
    expect(fontFace).toContain(
      'src: url("./assets/Geist-Black.ttf") format("truetype");',
    );
    expect(header).toContain('font-family: "Geist";');
    expect(header).toContain("font-weight: 900;");
    expect(header).toContain("letter-spacing: -0.08em;");
    expect(header).toContain("font-size: 18px;");
    expect(header).toContain("line-height: 38px;");
    expect(header).toContain("position: absolute;");
    expect(header).toContain("inset: 0;");
    expect(music).toBe(`.window-chrome__title-music {
  color: color-mix(
    in srgb,
    var(--locomo-foreground) 64%,
    var(--locomo-surface)
  );
}`);
    expect(renderer).toMatch(
      /Locomo\s*<span class="window-chrome__title-music">Music OSS<\/span>/u,
    );

    const otherStyles = styles
      .replace(fontFace, "")
      .replace(header, "")
      .replace(music, "");
    expect(otherStyles).not.toContain('font-family: "Geist";');
    expect(otherStyles).not.toContain("Geist-Black.ttf");
  });
});
