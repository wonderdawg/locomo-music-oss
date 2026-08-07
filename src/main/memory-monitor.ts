import { execFile } from "node:child_process";
import { freemem, totalmem } from "node:os";
import { promisify } from "node:util";

import type { MemoryStatus } from "../shared/app-contract";

const execFileAsync = promisify(execFile);
const gibibyte = 1024 ** 3;
const processMemoryProbeTimeoutMilliseconds = 4_000;

interface ProcessMemoryCommandResult {
  readonly stdout: string;
}

export interface ProcessMemoryProbeOptions {
  readonly platform?: NodeJS.Platform;
  readonly runCommand?: (
    file: string,
    arguments_: readonly string[],
  ) => Promise<ProcessMemoryCommandResult>;
}

export type GenerationMemoryEvent =
  | { readonly type: "started" }
  | { readonly type: "sample"; readonly bytes: number }
  | { readonly type: "finished" };

export interface GenerationMemoryState {
  readonly active: boolean;
  readonly currentBytes: number;
  readonly peakBytes?: number;
}

export function reduceGenerationMemory(
  state: GenerationMemoryState,
  event: GenerationMemoryEvent,
): GenerationMemoryState {
  if (event.type === "started") {
    return {
      active: true,
      currentBytes: state.currentBytes,
      peakBytes: undefined,
    };
  }
  if (event.type === "finished") {
    return { ...state, active: false };
  }

  const currentBytes = Math.max(0, event.bytes);
  return {
    active: state.active,
    currentBytes,
    peakBytes: state.active
      ? Math.max(state.peakBytes ?? 0, currentBytes)
      : state.peakBytes,
  };
}

// A clean 16 GB tester loaded ACE-Step, generated successfully, and retained
// about 4 GB available with a 6 GiB admission threshold. This is not a claim
// of support when less than 6 GiB is available before engine startup.
export const CPP_Q8_MINIMUM_AVAILABLE_BYTES = 6 * gibibyte;

export function minimumAvailableBytes(env = process.env): number {
  return minimumAvailableBytesForProfile("cpp-q8", env);
}

export function minimumAvailableBytesForProfile(
  _profile: "cpp-q8",
  env = process.env,
): number {
  const configured = Number(env.LOCOMO_MUSIC_MIN_AVAILABLE_MEMORY_GB);
  if (!Number.isFinite(configured) || configured <= 0) {
    return CPP_Q8_MINIMUM_AVAILABLE_BYTES;
  }
  return configured * gibibyte;
}

export function assessMemory(input: {
  readonly totalBytes: number;
  readonly availableBytes: number;
  readonly requiredBytes: number;
  readonly model: string;
}): MemoryStatus {
  return {
    status:
      input.availableBytes >= input.requiredBytes ? "loading" : "blocked",
    totalBytes: input.totalBytes,
    availableBytes: input.availableBytes,
    requiredBytes: input.requiredBytes,
    headroomBytes: input.availableBytes - input.requiredBytes,
    modelBytes: 0,
    generationActive: false,
    model: input.model,
    measuredAt: Date.now(),
  };
}

export async function readMemoryBytes(env = process.env): Promise<{
  readonly totalBytes: number;
  readonly availableBytes: number;
}> {
  const override = Number(env.LOCOMO_MUSIC_TEST_AVAILABLE_MEMORY_BYTES);
  if (Number.isFinite(override) && override >= 0) {
    return { totalBytes: totalmem(), availableBytes: override };
  }
  if (process.platform !== "darwin") {
    return { totalBytes: totalmem(), availableBytes: freemem() };
  }

  const [{ stdout: total }, { stdout: statistics }] = await Promise.all([
    execFileAsync("/usr/sbin/sysctl", ["-n", "hw.memsize"]),
    execFileAsync("/usr/bin/vm_stat"),
  ]);
  const totalBytes = Number(total.trim());
  const pageSize = Number(
    statistics.match(/page size of (\d+) bytes/)?.[1],
  );
  const pages = [
    "Pages free",
    "Pages inactive",
    "Pages speculative",
    "Pages purgeable",
  ].map((name) =>
    Number(statistics.match(new RegExp(`${name}:\\s+(\\d+)\\.`))?.[1]),
  );
  if (
    !Number.isFinite(totalBytes) ||
    !Number.isFinite(pageSize) ||
    pages.some((value) => !Number.isFinite(value))
  ) {
    return { totalBytes: totalmem(), availableBytes: freemem() };
  }
  return {
    totalBytes,
    availableBytes:
      pages.reduce((sum, value) => sum + value, 0) * pageSize,
  };
}

export async function readProcessTreeMemoryBytes(
  pid: number | undefined,
  options: ProcessMemoryProbeOptions = {},
): Promise<number> {
  if (!pid || !Number.isSafeInteger(pid) || pid <= 0) {
    return 0;
  }
  const runCommand = options.runCommand ?? runProcessMemoryCommand;
  if ((options.platform ?? process.platform) === "darwin") {
    try {
      const { stdout } = await runCommand("/usr/bin/footprint", [
        "--targetChildren",
        "--format",
        "bytes",
        "--noCategories",
        "--pid",
        String(pid),
      ]);
      const footprintBytes = parseProcessTreeFootprintBytes(stdout);
      if (footprintBytes !== undefined) {
        return footprintBytes;
      }
    } catch {
      // Fall through to RSS when footprint is unavailable or times out.
    }
  }

  try {
    const { stdout } = await runCommand("ps", [
      "-axo",
      "pid=,ppid=,rss=",
    ]);
    return sumProcessTreeRssBytes(pid, parseProcessRss(stdout));
  } catch {
    return 0;
  }
}

async function runProcessMemoryCommand(
  file: string,
  arguments_: readonly string[],
): Promise<ProcessMemoryCommandResult> {
  const { stdout } = await execFileAsync(file, [...arguments_], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: processMemoryProbeTimeoutMilliseconds,
  });
  return { stdout };
}

export function parseProcessTreeFootprintBytes(
  output: string,
): number | undefined {
  const summary = output.match(
    /^\s*Summary Footprint:\s*(\d+)\s+B\s*$/m,
  )?.[1];
  if (summary !== undefined) {
    return parseNonnegativeByteCount(summary);
  }

  const physicalFootprints = Array.from(
    output.matchAll(/^\s*phys_footprint:\s*(\d+)\s+B\s*$/gm),
    (match) => match[1],
  );
  const [physicalFootprint] = physicalFootprints;
  if (
    physicalFootprints.length !== 1 ||
    physicalFootprint === undefined
  ) {
    return undefined;
  }
  return parseNonnegativeByteCount(physicalFootprint);
}

export function parseProcessRss(output: string): {
  readonly processID: number;
  readonly parentID: number;
  readonly rssKibibytes: number;
}[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter(
      (columns) =>
        columns.length === 3 &&
        columns.every(Number.isFinite) &&
        Number.isSafeInteger(columns[0]) &&
        Number.isSafeInteger(columns[1]) &&
        Number.isSafeInteger(columns[2]) &&
        (columns[0] ?? 0) > 0 &&
        (columns[1] ?? -1) >= 0 &&
        (columns[2] ?? -1) >= 0,
    )
    .map(([processID, parentID, rssKibibytes]) => ({
      processID: processID ?? 0,
      parentID: parentID ?? 0,
      rssKibibytes: rssKibibytes ?? 0,
    }));
}

function parseNonnegativeByteCount(value: string): number | undefined {
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) && bytes >= 0
    ? bytes
    : undefined;
}

export function sumProcessTreeRssBytes(
  rootPID: number,
  processes: readonly {
    readonly processID: number;
    readonly parentID: number;
    readonly rssKibibytes: number;
  }[],
): number {
  const descendants = new Set([rootPID]);
  let changed = true;
  while (changed) {
    changed = false;
    processes.forEach((process) => {
      if (
        !descendants.has(process.parentID) ||
        descendants.has(process.processID)
      ) {
        return;
      }
      descendants.add(process.processID);
      changed = true;
    });
  }
  return processes
    .filter((process) => descendants.has(process.processID))
    .reduce(
      (total, process) => total + process.rssKibibytes * 1024,
      0,
    );
}
