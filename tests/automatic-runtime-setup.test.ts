import { describe, expect, it, vi } from "vitest";

import type { RuntimeSetupStatus } from "../src/shared/app-contract";
import {
  createRuntimeSetupController,
  type RuntimeSetupClient,
} from "../src/renderer/runtime-setup-controller";

const notInstalled: RuntimeSetupStatus = {
  phase: "not-installed",
  ready: false,
  running: false,
  message: "Not installed.",
  completedSteps: 0,
  totalSteps: 3,
  requiredBytes: 16 * 1024 ** 3,
};

const running: RuntimeSetupStatus = {
  ...notInstalled,
  phase: "downloading-models",
  running: true,
  message: "Installing model 1/4.",
  completedSteps: 1,
};

function createHarness(options: {
  readonly isPackaged: boolean;
  readonly status?: RuntimeSetupStatus;
  readonly start?: () => Promise<RuntimeSetupStatus>;
}) {
  const statuses: RuntimeSetupStatus[] = [];
  const automaticModes: boolean[] = [];
  const onReady = vi.fn();
  const client: RuntimeSetupClient = {
    getAppInfo: vi.fn(async () => ({ isPackaged: options.isPackaged })),
    getRuntimeSetupStatus: vi.fn(async () => options.status ?? notInstalled),
    startRuntimeSetup: vi.fn(options.start ?? (async () => running)),
  };
  const controller = createRuntimeSetupController({
    client,
    onAutomaticMode: (enabled) => automaticModes.push(enabled),
    onReady,
    onStatus: (status) => statuses.push(status),
  });
  return { automaticModes, client, controller, onReady, statuses };
}

describe("automatic packaged runtime setup", () => {
  it("starts once on an eligible packaged first run", async () => {
    const harness = createHarness({ isPackaged: true });

    await Promise.all([
      harness.controller.initialize(),
      harness.controller.initialize(),
    ]);

    expect(harness.automaticModes).toEqual([true]);
    expect(harness.client.startRuntimeSetup).toHaveBeenCalledOnce();
    expect(harness.statuses).toEqual([notInstalled, running]);
  });

  it("does not auto-start in ordinary development", async () => {
    const harness = createHarness({ isPackaged: false });

    await harness.controller.initialize();

    expect(harness.automaticModes).toEqual([false]);
    expect(harness.client.startRuntimeSetup).not.toHaveBeenCalled();
    expect(harness.statuses).toEqual([notInstalled]);
  });

  it("guards concurrent starts", async () => {
    let resolveStart: ((status: RuntimeSetupStatus) => void) | undefined;
    const harness = createHarness({
      isPackaged: true,
      start: () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    });

    const first = harness.controller.start();
    const second = harness.controller.start();

    expect(first).toBe(second);
    expect(harness.client.startRuntimeSetup).toHaveBeenCalledOnce();
    resolveStart?.(running);
    await first;
  });

  it("stops after a terminal disk error and preserves manual retry", async () => {
    const insufficientDisk: RuntimeSetupStatus = {
      ...notInstalled,
      phase: "error",
      errorCode: "insufficient-disk",
      error: "C++ Q8 setup needs 16.0 GB free; 4.0 GB is available.",
      message: "C++ Q8 setup stopped.",
      freeBytes: 4 * 1024 ** 3,
      requiredBytes: 16 * 1024 ** 3,
    };
    const harness = createHarness({
      isPackaged: true,
      status: insufficientDisk,
      start: async () => running,
    });

    await harness.controller.initialize();
    await harness.controller.refresh();
    expect(harness.client.startRuntimeSetup).not.toHaveBeenCalled();
    expect(harness.statuses.at(-1)?.error).toBe(
      "C++ Q8 setup needs 16.0 GB free; 4.0 GB is available.",
    );

    await harness.controller.start();
    expect(harness.client.startRuntimeSetup).toHaveBeenCalledOnce();
    expect(harness.statuses.at(-1)).toEqual(running);
  });

  it("reports polled progress without starting another install", async () => {
    const progress: RuntimeSetupStatus = {
      ...running,
      completedSteps: 2,
      message: "Pinned model stack verified.",
    };
    const harness = createHarness({
      isPackaged: true,
      status: progress,
    });

    await harness.controller.initialize();
    await harness.controller.refresh();

    expect(harness.client.startRuntimeSetup).not.toHaveBeenCalled();
    expect(harness.statuses).toEqual([progress, progress]);
  });

  it("leaves an installed runtime unchanged and signals readiness", async () => {
    const ready: RuntimeSetupStatus = {
      ...notInstalled,
      phase: "ready",
      ready: true,
      message: "Ready.",
      completedSteps: 3,
      requiredBytes: undefined,
    };
    const harness = createHarness({ isPackaged: true, status: ready });

    await harness.controller.initialize();

    expect(harness.client.startRuntimeSetup).not.toHaveBeenCalled();
    expect(harness.onReady).toHaveBeenCalledOnce();
  });

  it("re-evaluates an interrupted partial install on relaunch", async () => {
    const firstLaunch = createHarness({ isPackaged: true });
    const secondLaunch = createHarness({ isPackaged: true });

    await firstLaunch.controller.initialize();
    await secondLaunch.controller.initialize();

    expect(firstLaunch.client.startRuntimeSetup).toHaveBeenCalledOnce();
    expect(secondLaunch.client.startRuntimeSetup).toHaveBeenCalledOnce();
  });
});
