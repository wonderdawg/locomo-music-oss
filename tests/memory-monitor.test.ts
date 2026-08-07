import { describe, expect, it } from "vitest";

import {
  assessMemory,
  CPP_Q8_MINIMUM_AVAILABLE_BYTES,
  minimumAvailableBytes,
  minimumAvailableBytesForProfile,
  parseProcessRss,
  parseProcessTreeFootprintBytes,
  readMemoryBytes,
  readProcessTreeMemoryBytes,
  reduceGenerationMemory,
  sumProcessTreeRssBytes,
} from "../src/main/memory-monitor";

const gibibyte = 1024 ** 3;

describe("ACE-Step memory admission", () => {
  it("uses the validated 6 GiB C++ Q8 budget by default", () => {
    expect(CPP_Q8_MINIMUM_AVAILABLE_BYTES).toBe(6 * gibibyte);
    expect(minimumAvailableBytes({})).toBe(6 * gibibyte);
  });

  it("keeps the default threshold adjustable for validation", () => {
    expect(
      minimumAvailableBytes({
        LOCOMO_MUSIC_MIN_AVAILABLE_MEMORY_GB: "12",
      }),
    ).toBe(12 * gibibyte);
  });

  it("keeps the C++ Q8 threshold adjustable for validation", () => {
    expect(minimumAvailableBytesForProfile("cpp-q8", {})).toBe(
      6 * gibibyte,
    );
    expect(
      minimumAvailableBytesForProfile("cpp-q8", {
        LOCOMO_MUSIC_MIN_AVAILABLE_MEMORY_GB: "12",
      }),
    ).toBe(12 * gibibyte);
  });

  it("admits loading only when the complete runtime has enough room", () => {
    const loading = assessMemory({
      totalBytes: 64,
      availableBytes: 50,
      requiredBytes: 48,
      model: "ACE-Step XL + 4B",
    });
    const blocked = assessMemory({
      totalBytes: 64,
      availableBytes: 40,
      requiredBytes: 48,
      model: "ACE-Step XL + 4B",
    });

    expect(loading.status).toBe("loading");
    expect(loading.headroomBytes).toBe(2);
    expect(blocked.status).toBe("blocked");
    expect(blocked.headroomBytes).toBe(-8);
  });

  it("supports a deterministic available-memory probe", async () => {
    await expect(
      readMemoryBytes({
        LOCOMO_MUSIC_TEST_AVAILABLE_MEMORY_BYTES: "1234",
      }),
    ).resolves.toMatchObject({ availableBytes: 1234 });
  });

  it("measures only the complete ACE-Step subprocess tree", () => {
    expect(
      sumProcessTreeRssBytes(100, [
        { processID: 10, parentID: 1, rssKibibytes: 900 },
        { processID: 100, parentID: 10, rssKibibytes: 10 },
        { processID: 101, parentID: 100, rssKibibytes: 20 },
        { processID: 102, parentID: 101, rssKibibytes: 30 },
        { processID: 200, parentID: 10, rssKibibytes: 800 },
      ]),
    ).toBe(60 * 1024);
  });

  it("parses the de-duplicated macOS footprint for a process tree", () => {
    expect(
      parseProcessTreeFootprintBytes(`
======================================================================
uv [100]: 64-bit    Footprint: 1048816 B (16384 bytes per page)
======================================================================

Auxiliary data:
    phys_footprint: 1065200 B

======================================================================
python [101]: 64-bit    Footprint: 50465865728 B (16384 bytes per page)
======================================================================

Auxiliary data:
    phys_footprint: 50465882112 B

======================================================================
Summary Footprint: 50466914560 B
======================================================================
`),
    ).toBe(50_466_914_560);
  });

  it("uses the physical-footprint ledger for a single macOS process", () => {
    expect(
      parseProcessTreeFootprintBytes(`
python [101]: 64-bit    Footprint: 50465865728 B (16384 bytes per page)
Auxiliary data:
    phys_footprint: 50465882112 B
    phys_footprint_peak: 51000000000 B
`),
    ).toBe(50_465_882_112);
  });

  it("falls back to complete-tree RSS when footprint fails", async () => {
    const commands: string[] = [];
    const measured = await readProcessTreeMemoryBytes(100, {
      platform: "darwin",
      async runCommand(file, arguments_) {
        commands.push(`${file} ${arguments_.join(" ")}`);
        if (file === "/usr/bin/footprint") {
          throw new Error("footprint unavailable");
        }
        return {
          stdout: `
  10     1   900
 100    10    10
 101   100    20
malformed process row
 102   101    30
 200    10   800
`,
        };
      },
    });

    expect(measured).toBe(60 * 1024);
    expect(commands).toEqual([
      "/usr/bin/footprint --targetChildren --format bytes --noCategories --pid 100",
      "ps -axo pid=,ppid=,rss=",
    ]);
  });

  it("uses RSS directly on platforms without macOS footprint", async () => {
    const commands: string[] = [];
    const measured = await readProcessTreeMemoryBytes(100, {
      platform: "linux",
      async runCommand(file) {
        commands.push(file);
        return {
          stdout: "100 10 10\n101 100 20\n",
        };
      },
    });

    expect(measured).toBe(30 * 1024);
    expect(commands).toEqual(["ps"]);
  });

  it("rejects malformed footprint and RSS rows", () => {
    expect(
      parseProcessTreeFootprintBytes(
        "Summary Footprint: not-a-number B",
      ),
    ).toBeUndefined();
    expect(
      parseProcessRss(
        "100 10 20\n101 100 NaN\n102 100 -1\n103 100 30 extra\n",
      ),
    ).toEqual([
      { processID: 100, parentID: 10, rssKibibytes: 20 },
    ]);
  });
});

describe("generation memory lifecycle", () => {
  it("resets at generation start and retains the peak after completion", () => {
    const previous = {
      active: false,
      currentBytes: 700,
      peakBytes: 7_560,
    };
    const started = reduceGenerationMemory(previous, {
      type: "started",
    });
    const loading = reduceGenerationMemory(started, {
      type: "sample",
      bytes: 7_560,
    });
    const unloaded = reduceGenerationMemory(loading, {
      type: "sample",
      bytes: 700,
    });
    const finished = reduceGenerationMemory(unloaded, {
      type: "finished",
    });

    expect(started).toEqual({
      active: true,
      currentBytes: 700,
      peakBytes: undefined,
    });
    expect(unloaded).toEqual({
      active: true,
      currentBytes: 700,
      peakBytes: 7_560,
    });
    expect(finished).toEqual({
      active: false,
      currentBytes: 700,
      peakBytes: 7_560,
    });
    expect(
      reduceGenerationMemory(finished, { type: "started" }),
    ).toEqual({
      active: true,
      currentBytes: 700,
      peakBytes: undefined,
    });
  });

  it("updates idle current memory without inventing a generation peak", () => {
    expect(
      reduceGenerationMemory(
        { active: false, currentBytes: 900 },
        { type: "sample", bytes: 650 },
      ),
    ).toEqual({
      active: false,
      currentBytes: 650,
      peakBytes: undefined,
    });
  });
});
