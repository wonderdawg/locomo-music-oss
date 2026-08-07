import path from "node:path";
import { access } from "node:fs/promises";

import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain as electronIpcMain,
  Menu,
  nativeTheme,
  powerMonitor,
  powerSaveBlocker,
  screen,
} from "electron";

import {
  APP_ID,
  APP_NAME,
  DEVELOPMENT_APP_ID,
  assertMusicGenerationDurationSeconds,
  IPC_CHANNELS,
  type AppInfo,
  type MemoryStatus,
  type MusicGenerationRequest,
  type OvernightSystemStatus,
  type RuntimeSetupStatus,
} from "../shared/app-contract";
import {
  MINIMUM_WINDOW_HEIGHT,
  SETTINGS_WINDOW_HEIGHT,
  SETTINGS_WINDOW_WIDTH,
  studioPaneWidths,
} from "../shared/window-layout";
import { createApplicationMenuTemplate } from "./application-menu";
import { resolveCppRuntimeLocations } from "./cpp-runtime-manifest";
import {
  assessMemory,
  type GenerationMemoryEvent,
  readMemoryBytes,
  reduceGenerationMemory,
} from "./memory-monitor";
import { createOvernightPowerSaveBlocker } from "./overnight-power";
import { resolveNativeCodeLocations } from "./native-code-paths";
import { createTrustedIpcMain } from "./ipc-sender-trust";
import { resolveRendererDevelopmentUrl } from "./renderer-development-url";
import { formatProductDiagnostics } from "./product-diagnostics";
import {
  createActiveMusicBackend,
  resolveBackendRuntimeRoot,
  resolveMusicBackendProfile,
} from "./music-backend";
import {
  ensureStorageLocations,
  isPathWithin,
  resolveStorageLocations,
} from "./storage";
import { resolveTrackGenerationDetails } from "./track-generation-details";
import {
  collapsedWindowBounds,
  expandWindowOnce,
  responsiveWindowBounds,
  setTrackDetailsPaneOpen,
} from "./window-reveal";

const rendererDevelopmentUrl = resolveRendererDevelopmentUrl(
  process.env.LOCOMO_MUSIC_RENDERER_URL,
  app.isPackaged,
);
const bundledRendererPath = path.join(
  __dirname,
  "..",
  "dist-renderer",
  "index.html",
);
const ipcMain = createTrustedIpcMain(electronIpcMain, {
  bundledRendererPath,
  isPackaged: app.isPackaged,
  rendererDevelopmentUrl,
});
const isSmokeTest = process.argv.includes("--smoke-test");
const isRuntimeSetup = process.argv.includes("--setup-runtime");
const isReviewSong = process.argv.includes("--review-song");
const isAutomatedRun = isSmokeTest || isRuntimeSetup || isReviewSong;

app.setName(APP_NAME);
const storageNamespace = app.isPackaged ? APP_ID : DEVELOPMENT_APP_ID;
const storageLocations = resolveStorageLocations(
  app.getPath("appData"),
  storageNamespace,
);
ensureStorageLocations(storageLocations);
app.setPath("userData", storageLocations.userData);
app.setPath("sessionData", storageLocations.sessionData);
const hasSingleInstanceLock = app.requestSingleInstanceLock();

const retainedTrackProofs = resolveCppRuntimeLocations(
  resolveBackendRuntimeRoot(storageLocations, "cpp-q8"),
).proofs;

const appResourcesRoot = app.isPackaged
  ? process.resourcesPath
  : path.join(app.getAppPath(), "resources");
const nativeCode = resolveNativeCodeLocations({
  isPackaged: app.isPackaged,
  resourcesRoot: appResourcesRoot,
});
const activeBackend = createActiveMusicBackend({
  nativeCode,
  profile: resolveMusicBackendProfile(),
  resourcesRoot: appResourcesRoot,
  storage: storageLocations,
});
const runtimeSetupService = activeBackend.runtimeSetupService;
const musicService = activeBackend.musicService;
const musicModel = activeBackend.model;
let settingsWindow: BrowserWindow | undefined;
let retryMemoryAdmission: (() => void) | undefined;
let memoryTimer: ReturnType<typeof setInterval> | undefined;
let generationMemoryRevision = 0;
let musicPreparation: Promise<void> | undefined;
const overnightPowerOwnersWithCleanup = new Set<number>();
const overnightPower = createOvernightPowerSaveBlocker(powerSaveBlocker);
const stopMusicEngineExitObservation = musicService.observeEngineExit(
  ({ exitCode, signal }) => {
    console.error("The local music engine exited.", { exitCode, signal });
  },
);
let memoryStatus: MemoryStatus = {
  status: "checking",
  totalBytes: 0,
  availableBytes: 0,
  requiredBytes: activeBackend.minimumAvailableBytes(),
  headroomBytes: 0,
  modelBytes: 0,
  generationActive: false,
  model: musicModel,
  measuredAt: Date.now(),
};

function updateMemoryStatus(status: MemoryStatus): void {
  memoryStatus = status;
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC_CHANNELS.memoryStatus, status);
  });
}

function getOvernightSystemStatus(): OvernightSystemStatus {
  return {
    idleSeconds: powerMonitor.getSystemIdleTime(),
    onExternalPower: !powerMonitor.isOnBatteryPower(),
    supported: process.platform === "darwin",
  };
}

function broadcastOvernightSystemStatus(): void {
  const status = getOvernightSystemStatus();
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(
      IPC_CHANNELS.overnightSystemStatus,
      status,
    );
  });
}

function installOvernightSystemMonitoring(): void {
  powerMonitor.on("on-ac", broadcastOvernightSystemStatus);
  powerMonitor.on("on-battery", broadcastOvernightSystemStatus);
  powerMonitor.on("resume", broadcastOvernightSystemStatus);
  powerMonitor.on("unlock-screen", broadcastOvernightSystemStatus);
}

function handleGenerationMemoryEvent(
  event: GenerationMemoryEvent,
): void {
  generationMemoryRevision += 1;
  const generation = reduceGenerationMemory(
    {
      active: memoryStatus.generationActive,
      currentBytes: memoryStatus.modelBytes,
      peakBytes: memoryStatus.generationPeakBytes,
    },
    event,
  );
  updateMemoryStatus({
    ...memoryStatus,
    generationActive: generation.active,
    generationPeakBytes: generation.peakBytes,
    modelBytes: generation.currentBytes,
    measuredAt: Date.now(),
  });
}

const stopGenerationMemoryObservation =
  musicService.observeGenerationMemory(handleGenerationMemoryEvent);

async function refreshReadyMemoryStatus(): Promise<void> {
  if (memoryStatus.status !== "ready") {
    return;
  }
  const revisionBeforeMeasurement = generationMemoryRevision;
  const [measured, sampledModelBytes] = await Promise.all([
    readMemoryBytes(),
    musicService.memoryBytes(),
  ]);
  if (memoryStatus.status !== "ready") {
    return;
  }
  // A generation sample may arrive while the slower idle probe is running.
  // In that case, preserve the newer lifecycle-aware current value and peak.
  const generation =
    revisionBeforeMeasurement === generationMemoryRevision
      ? reduceGenerationMemory(
          {
            active: memoryStatus.generationActive,
            currentBytes: memoryStatus.modelBytes,
            peakBytes: memoryStatus.generationPeakBytes,
          },
          { type: "sample", bytes: sampledModelBytes },
        )
      : {
          active: memoryStatus.generationActive,
          currentBytes: memoryStatus.modelBytes,
          peakBytes: memoryStatus.generationPeakBytes,
        };
  updateMemoryStatus({
    ...assessMemory({
      ...measured,
      requiredBytes: activeBackend.minimumAvailableBytes(),
      model: musicModel,
    }),
    status: "ready",
    generationActive: generation.active,
    generationPeakBytes: generation.peakBytes,
    modelBytes: generation.currentBytes,
  });
}

async function waitForMemoryAdmission(): Promise<void> {
  while (true) {
    updateMemoryStatus({
      ...memoryStatus,
      status: "checking",
      detail: undefined,
      measuredAt: Date.now(),
    });
    const measured = await readMemoryBytes();
    const status = assessMemory({
      ...measured,
      requiredBytes: activeBackend.minimumAvailableBytes(),
      model: musicModel,
    });
    updateMemoryStatus(status);
    if (status.status === "loading") {
      return;
    }
    await new Promise<void>((resolveAdmission) => {
      retryMemoryAdmission = resolveAdmission;
    });
    retryMemoryAdmission = undefined;
  }
}

async function getRuntimeSetupStatus(): Promise<RuntimeSetupStatus> {
  return runtimeSetupService.getStatus();
}

async function startRuntimeSetup(): Promise<RuntimeSetupStatus> {
  return runtimeSetupService.start();
}

async function copyDiagnostics(): Promise<void> {
  const runtimeStatus = await getRuntimeSetupStatus().catch(() => ({
    phase: "error" as const,
    ready: false,
    running: false,
    message: "Unavailable.",
    completedSteps: 0,
    totalSteps: 0,
  }));
  clipboard.writeText(
    formatProductDiagnostics({
      appVersion: app.getVersion(),
      backend: activeBackend.profile,
      buildVersion: app.getVersion(),
      engineStatus: memoryStatus.status,
      generatedAt: new Date(),
      runtimePhase: runtimeStatus.phase,
    }),
  );
}

function prepareMusic(): Promise<void> {
  musicPreparation ??= (async () => {
    await waitForMemoryAdmission();
    await musicService.prepare();
    updateMemoryStatus({
      ...memoryStatus,
      status: "ready",
      modelBytes: await musicService.memoryBytes(),
      detail: undefined,
      measuredAt: Date.now(),
    });
    memoryTimer ??= setInterval(
      () => void refreshReadyMemoryStatus(),
      5_000,
    );
    memoryTimer.unref();
  })().catch((error: unknown) => {
    updateMemoryStatus({
      ...memoryStatus,
      status: "error",
      detail: String(error),
      measuredAt: Date.now(),
    });
    musicPreparation = undefined;
    throw error;
  });
  return musicPreparation;
}

function getAppInfo(): AppInfo {
  return {
    bundleId: APP_ID,
    isPackaged: app.isPackaged,
    name: APP_NAME,
    paths: storageLocations,
    platform: process.platform,
    version: app.getVersion(),
  };
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.copyDiagnostics, () => copyDiagnostics());
  ipcMain.handle(IPC_CHANNELS.expandWindow, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return;
    }

    expandWindowOnce(
      window,
      screen.getDisplayMatching(window.getBounds()).workArea,
    );
  });
  ipcMain.handle(IPC_CHANNELS.getAppInfo, () => getAppInfo());
  ipcMain.handle(IPC_CHANNELS.getMemoryStatus, () => memoryStatus);
  ipcMain.handle(
    IPC_CHANNELS.getOvernightSystemStatus,
    getOvernightSystemStatus,
  );
  ipcMain.handle(IPC_CHANNELS.getRuntimeSetupStatus, () =>
    getRuntimeSetupStatus(),
  );
  ipcMain.handle(
    IPC_CHANNELS.getTrackGenerationDetails,
    (_event, id: unknown) =>
      resolveTrackGenerationDetails({
        proofsRoot: retainedTrackProofs,
        readPrompt: (trackID) => musicService.readPrompt(trackID),
        trackID: id,
      }),
  );
  ipcMain.handle(IPC_CHANNELS.startRuntimeSetup, () =>
    startRuntimeSetup(),
  );
  ipcMain.handle(IPC_CHANNELS.prepareMusic, () => prepareMusic());
  ipcMain.handle(IPC_CHANNELS.retryLocalModel, () => {
    if (
      memoryStatus.status !== "blocked" &&
      memoryStatus.status !== "error"
    ) {
      return memoryStatus;
    }
    updateMemoryStatus({
      ...memoryStatus,
      status: "checking",
      detail: undefined,
      measuredAt: Date.now(),
    });
    retryMemoryAdmission?.();
    return memoryStatus;
  });
  ipcMain.handle(
    IPC_CHANNELS.generateTrack,
    async (_event, input: MusicGenerationRequest) => {
      if (
        app.isPackaged &&
        input.reusePlannerCaptionFromTrackID
      ) {
        throw new Error("Another take is available only in development.");
      }
      assertMusicGenerationDurationSeconds(input.duration);
      await prepareMusic();
      return musicService.generate(input);
    },
  );
  ipcMain.handle(IPC_CHANNELS.listTracks, () => musicService.list());
  ipcMain.handle(IPC_CHANNELS.readTrack, (_event, id: string) =>
    musicService.read(id),
  );
  ipcMain.handle(IPC_CHANNELS.deleteTrack, (_event, id: string) =>
    musicService.delete(id),
  );
  ipcMain.handle(
    IPC_CHANNELS.setTrackFavorite,
    (_event, id: string, isFavorite: boolean) =>
      musicService.setFavorite(id, isFavorite),
  );
  ipcMain.handle(
    IPC_CHANNELS.trackPlaybackStarted,
    (_event, id: string) => musicService.markPlayed(id),
  );
  ipcMain.handle(
    IPC_CHANNELS.setOvernightGenerationActive,
    (event, active: unknown) => {
      if (typeof active !== "boolean") {
        throw new Error("Invalid overnight generation state.");
      }
      const ownerID = event.sender.id;
      overnightPower.setActive(ownerID, active);
      if (overnightPowerOwnersWithCleanup.has(ownerID)) return;
      overnightPowerOwnersWithCleanup.add(ownerID);
      event.sender.once("destroyed", () => {
        overnightPowerOwnersWithCleanup.delete(ownerID);
        overnightPower.release(ownerID);
      });
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.setTrackDetailsPaneOpen,
    (event, open: boolean) => {
      if (typeof open !== "boolean") return;
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) return;
      setTrackDetailsPaneOpen(
        window,
        screen.getDisplayMatching(window.getBounds()).workArea,
        open,
      );
    },
  );
}

async function loadRenderer(
  window: BrowserWindow,
  view: "main" | "settings" = "main",
): Promise<void> {
  if (rendererDevelopmentUrl) {
    const rendererUrl = new URL(rendererDevelopmentUrl);
    if (view === "settings") {
      rendererUrl.searchParams.set("view", "settings");
    }
    await window.loadURL(rendererUrl.toString());
    return;
  }

  if (view === "settings") {
    await window.loadFile(bundledRendererPath, {
      query: { view: "settings" },
    });
    return;
  }

  await window.loadFile(bundledRendererPath);
}

async function runSmokeVerification(window: BrowserWindow): Promise<void> {
  try {
    await waitForRendererBridge(window);
    const runtime = await runtimeSetupService.getStatus();
    if (runtime.ready) {
      const memory = await waitForMemoryDecision();
      if (
        memory.status !== "blocked" &&
        memory.status !== "error"
      ) {
        await waitForMusicEngine(window);
      }
    }
    const rendererResult = (await window.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const deadline = Date.now() + 5000;

        const check = async () => {
          if (document.documentElement.dataset.bridgeStatus === "ready") {
            const info = await window.locomoMusic.getAppInfo();
            const library = await window.locomoMusic.list();
            if (
              document.documentElement.dataset.applicationReady !== "true"
            ) {
              if (Date.now() >= deadline) {
                reject(new Error("Renderer application did not become ready."));
                return;
              }
              setTimeout(check, 25);
              return;
            }
            const memory = await window.locomoMusic.getMemoryStatus();
            const runtime = await window.locomoMusic.getRuntimeSetupStatus();
            const studio = document.querySelector(".locomo-studio");
            const categoryPane = document.querySelector(
              "[data-category-pane]"
            );
            const categoryGrid = document.querySelector(
              "[data-category-grid]"
            );
            const text = document.body.textContent ?? "";
            const stationButtons = Array.from(
              document.querySelectorAll("[data-station]")
            );
            const chrome = document.querySelector(".window-chrome");
            const chromeTitle = document.querySelector(
              ".window-chrome__title"
            );
            const chromeRect = chrome?.getBoundingClientRect();
            const chromeTitleRect = chromeTitle?.getBoundingClientRect();
            const stationArtworkLoaded = (
              await Promise.all(
                stationButtons.map(
                  (button) =>
                    new Promise((resolveImage) => {
                      const source = getComputedStyle(button).backgroundImage
                        .match(/^url\\(["']?(.*?)["']?\\)$/)?.[1];
                      if (!source) {
                        resolveImage(false);
                        return;
                      }
                      const image = new Image();
                      image.onload = () => resolveImage(true);
                      image.onerror = () => resolveImage(false);
                      image.src = source;
                    })
                )
              )
            ).every(Boolean);
            resolve({
              applicationReady:
                document.documentElement.dataset.applicationReady,
              bridgeStatus: document.documentElement.dataset.bridgeStatus,
              chromeDrag: chrome
                ? getComputedStyle(chrome).getPropertyValue(
                    "-webkit-app-region"
                  )
                : "",
              chromeHeight: chromeRect?.height,
              chromeTitle: chrome?.textContent?.trim(),
              chromeTitleCenterDelta:
                chromeTitleRect
                  ? Math.abs(
                      chromeTitleRect.x +
                        chromeTitleRect.width / 2 -
                        window.innerWidth / 2
                    )
                  : undefined,
              cleanCategoryLaunch: Boolean(
                categoryPane &&
                  categoryGrid &&
                  !document.querySelector("[data-control-pane]") &&
                  !document.querySelector("[data-category-set-selector]") &&
                  !document.querySelector("[data-generation-toggle]")
              ),
              continuousGeneration: studio?.getAttribute(
                "data-continuous-generation"
              ),
              copyPresent:
                text.includes("Tap to play") &&
                !text.includes("One station plays at a time") &&
                !text.includes(
                  "Loops continuously while new songs generate"
                ),
              info,
              initialWindowWidth: window.innerWidth,
              libraryCount: library.length,
              memory,
              memoryIndicatorPresent: Boolean(
                document.querySelector(".memory-indicator")
              ),
              rendererBackground: getComputedStyle(
                document.querySelector(".locomo-studio") ?? document.body
              ).backgroundColor,
              rendererTheme: document.documentElement.dataset.theme,
              runtime,
              setupActionPresent: Boolean(
                document.querySelector("[data-runtime-setup-action]")
              ),
              setupOverlayPresent: Boolean(
                document.querySelector("[data-runtime-setup-overlay]")
              ),
              stationArtworkLoaded,
              stationCount: stationButtons.length,
              themeControlPresent: Boolean(
                document.querySelector(
                  '.window-chrome [aria-label="Color theme"]'
                )
              )
            });
            return;
          }

          if (Date.now() >= deadline) {
            reject(new Error("Renderer bridge did not become ready."));
            return;
          }

          setTimeout(check, 25);
        };

        void check();
      });
    `)) as {
      applicationReady?: string;
      bridgeStatus: string;
      cleanCategoryLaunch: boolean;
      chromeDrag: string;
      chromeHeight?: number;
      chromeTitle?: string;
      chromeTitleCenterDelta?: number;
      continuousGeneration?: string | null;
      copyPresent: boolean;
      info: AppInfo;
      initialWindowWidth: number;
      libraryCount: number;
      memory: MemoryStatus;
      memoryIndicatorPresent: boolean;
      rendererBackground: string;
      rendererTheme?: string;
      runtime: RuntimeSetupStatus;
      setupActionPresent: boolean;
      setupOverlayPresent: boolean;
      stationArtworkLoaded: boolean;
      stationCount: number;
      themeControlPresent: boolean;
    };
    const settingsStatus = await waitForSettingsMemoryIndicator(
      createSettingsWindow(),
      rendererResult.memory.status,
    );

    const validIdentity =
      rendererResult.info.bundleId === APP_ID &&
      rendererResult.info.name === APP_NAME;
    const validStorage =
      rendererResult.info.paths.userData === storageLocations.userData &&
      isPathWithin(
        storageLocations.userData,
        rendererResult.info.paths.library,
      ) &&
      isPathWithin(
        storageLocations.userData,
        rendererResult.info.paths.runtime,
      ) &&
      isPathWithin(
        storageLocations.userData,
        rendererResult.info.paths.sessionData,
      );
    const validChrome =
      rendererResult.chromeDrag === "drag" &&
      rendererResult.chromeHeight === 38 &&
      rendererResult.chromeTitle === APP_NAME &&
      (rendererResult.chromeTitleCenterDelta ?? 1) < 0.5 &&
      !rendererResult.memoryIndicatorPresent &&
      !rendererResult.themeControlPresent &&
      (rendererResult.rendererTheme === "light"
        ? rendererResult.rendererBackground === "rgb(205, 229, 11)"
        : rendererResult.rendererTheme === "dark" &&
          rendererResult.rendererBackground === "rgb(25, 25, 25)");
    const validSettingsStatus =
      settingsStatus.status === rendererResult.memory.status &&
      settingsStatus.buttonDrag === "no-drag" &&
      settingsStatus.buttonHeight === 26 &&
      settingsStatus.buttonRight === 10 &&
      settingsStatus.buttonTop === 7 &&
      settingsStatus.popoverWidth === 292 &&
      settingsStatus.popoverText?.includes(rendererResult.memory.model) &&
      (rendererResult.memory.status === "ready"
        ? settingsStatus.buttonText === "ReadyLocal" &&
          settingsStatus.popoverText.includes("Locomo Music AI")
        : rendererResult.memory.status === "blocked" ||
            rendererResult.memory.status === "error"
          ? settingsStatus.buttonText === "Not readyLocal" &&
            settingsStatus.popoverText.includes("Not enough room") &&
            settingsStatus.popoverText.includes(
              `${(
                rendererResult.memory.requiredBytes /
                1024 ** 3
              ).toFixed(1)} GB`,
            )
          : settingsStatus.buttonText === "Starting…Local");
    const generationAvailable =
      rendererResult.runtime.ready &&
      rendererResult.memory.status === "ready";
    const validRendererState =
      rendererResult.applicationReady === "true" &&
      rendererResult.cleanCategoryLaunch &&
      rendererResult.continuousGeneration ===
        (generationAvailable ? "running" : "stopped") &&
      rendererResult.copyPresent &&
      rendererResult.initialWindowWidth ===
        window.getContentBounds().width &&
      !rendererResult.setupOverlayPresent &&
      rendererResult.stationArtworkLoaded &&
      rendererResult.stationCount === 30;

    if (
      rendererResult.bridgeStatus !== "ready" ||
      rendererResult.libraryCount < 0 ||
      !validRendererState ||
      !validChrome ||
      !validIdentity ||
      !validSettingsStatus ||
      !validStorage
    ) {
      console.error(
        "LOCOMO_MUSIC_SMOKE_DETAILS",
        JSON.stringify({
          rendererResult,
          validChrome,
          validIdentity,
          validRendererState,
          validSettingsStatus,
          validStorage,
        }),
      );
      throw new Error("Development smoke verification returned invalid state.");
    }

    console.log(
      "LOCOMO_MUSIC_SMOKE_OK",
      JSON.stringify(rendererResult),
    );
    app.exit(0);
  } catch (error) {
    console.error("LOCOMO_MUSIC_SMOKE_FAILED", error);
    app.exit(1);
  }
}

async function waitForSettingsMemoryIndicator(
  window: BrowserWindow,
  expectedStatus: MemoryStatus["status"],
): Promise<{
  readonly buttonDrag: string;
  readonly buttonHeight?: number;
  readonly buttonRight?: number;
  readonly buttonText?: string;
  readonly buttonTop?: number;
  readonly popoverText?: string;
  readonly popoverWidth?: number;
  readonly status?: string;
}> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const result = (await window.webContents.executeJavaScript(`
        (() => {
          const indicator = document.querySelector(".memory-indicator");
          const button = document.querySelector(
            ".memory-indicator__button"
          );
          const popover = document.querySelector(
            ".memory-indicator__popover"
          );
          const buttonRect = button?.getBoundingClientRect();
          return {
            buttonDrag: button
              ? getComputedStyle(button).getPropertyValue(
                  "-webkit-app-region"
                )
              : "",
            buttonHeight: buttonRect?.height,
            buttonRight: buttonRect
              ? window.innerWidth - buttonRect.right
              : undefined,
            buttonText: button?.textContent
              ?.replace(/\\s+/g, " ")
              .trim(),
            buttonTop: buttonRect?.top,
            popoverText: popover?.textContent
              ?.replace(/\\s+/g, " ")
              .trim(),
            popoverWidth: popover?.getBoundingClientRect().width,
            status: indicator?.getAttribute("data-memory-status")
          };
        })()
      `)) as {
        readonly buttonDrag: string;
        readonly buttonHeight?: number;
        readonly buttonRight?: number;
        readonly buttonText?: string;
        readonly buttonTop?: number;
        readonly popoverText?: string;
        readonly popoverWidth?: number;
        readonly status?: string;
      };
      if (result.status === expectedStatus) return result;
    } catch {
      // The Settings renderer may still be loading.
    }
    await sleep(25);
  }
  throw new Error("Memory status did not reach the Settings renderer.");
}

async function waitForMemoryDecision(): Promise<MemoryStatus> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (memoryStatus.status !== "checking") {
      return memoryStatus;
    }
    await sleep(50);
  }
  throw new Error("Memory admission did not finish checking.");
}

async function waitForRendererBridge(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const deadline = Date.now() + 10000;
      const check = () => {
        if (document.documentElement.dataset.bridgeStatus === "ready") {
          resolve();
          return;
        }
        if (
          document.documentElement.dataset.bridgeStatus === "failed" ||
          Date.now() >= deadline
        ) {
          reject(new Error("Renderer bridge did not become ready."));
          return;
        }
        setTimeout(check, 50);
      };
      check();
    })
  `);
}

async function waitForMusicEngine(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const deadline = Date.now() + 5 * 60 * 1000;
      const check = () => {
        if (document.documentElement.dataset.musicEngineStatus === "ready") {
          resolve();
          return;
        }
        if (
          document.documentElement.dataset.musicEngineStatus === "failed" ||
          Date.now() >= deadline
        ) {
          reject(new Error("The local music engine did not become ready."));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    })
  `);
}

async function runRuntimeSetup(window: BrowserWindow): Promise<void> {
  try {
    await waitForRendererBridge(window);
    let status = await runtimeSetupService.getStatus();
    if (!status.ready) {
      const clicked = (await window.webContents.executeJavaScript(`
        (() => {
          const button = document.querySelector(
            "[data-runtime-setup-action]"
          );
          if (!(button instanceof HTMLButtonElement)) return false;
          button.click();
          return true;
        })()
      `)) as boolean;
      if (!clicked) {
        throw new Error("The renderer did not expose its setup action.");
      }
    }

    let previous = "";
    const deadline = Date.now() + 24 * 60 * 60 * 1_000;
    while (Date.now() < deadline) {
      status = await runtimeSetupService.getStatus();
      const summary = `${status.phase}:${status.completedSteps}:${status.message}`;
      if (summary !== previous) {
        console.log("LOCOMO_MUSIC_SETUP_PROGRESS", JSON.stringify(status));
        previous = summary;
      }
      if (status.ready) {
        console.log(
          "LOCOMO_MUSIC_SETUP_OK",
          JSON.stringify({
            backendProfile: activeBackend.profile,
            runtimeRoot: activeBackend.runtimeRoot,
            status,
          }),
        );
        app.exit(0);
        return;
      }
      if (status.phase === "error") {
        throw new Error(status.error || status.message);
      }
      await sleep(1_000);
    }
    throw new Error("Private runtime setup timed out.");
  } catch (error) {
    console.error("LOCOMO_MUSIC_SETUP_FAILED", error);
    app.exit(1);
  }
}

async function runReviewSong(window: BrowserWindow): Promise<void> {
  try {
    await waitForRendererBridge(window);
    const status = await runtimeSetupService.getStatus();
    if (!status.ready) {
      throw new Error("The private runtime must be installed before review.");
    }
    await waitForMusicEngine(window);
    const baseline = new Set(
      (await musicService.list()).map((track) => track.id),
    );
    const started = (await window.webContents.executeJavaScript(`
      (() => {
        if (document.querySelector("[data-runtime-setup-overlay]")) {
          return { ok: false, reason: "setup-overlay-visible" };
        }
        const studio = document.querySelector(".locomo-studio");
        const station = document.querySelector('[data-station="House"]');
        const durationSeconds = Number(
          studio?.getAttribute("data-generation-duration-seconds")
        );
        if (
          !(studio instanceof HTMLElement) ||
          !(station instanceof HTMLButtonElement) ||
          !Number.isInteger(durationSeconds) ||
          durationSeconds < 60 ||
          durationSeconds > 600
        ) {
          return { ok: false, reason: "radio-controls-missing" };
        }
        station.click();
        const generationToggle = document.querySelector(
          "[data-generation-toggle]"
        );
        if (!(generationToggle instanceof HTMLButtonElement)) {
          return { ok: false, reason: "generation-toggle-missing" };
        }
        if (generationToggle.getAttribute("aria-pressed") === "true") {
          generationToggle.click();
        }
        return {
          autoCreate: generationToggle.getAttribute("aria-pressed"),
          durationSeconds,
          ok: true,
          station: station.getAttribute("data-station")
        };
      })()
    `)) as {
      autoCreate?: string | null;
      durationSeconds?: number;
      ok: boolean;
      reason?: string;
      station?: string | null;
    };
    if (
      !started.ok ||
      started.station !== "House" ||
      started.durationSeconds === undefined ||
      started.autoCreate !== "false"
    ) {
      throw new Error(
        `The renderer did not start exactly one House generation (${started.reason ?? "invalid state"}).`,
      );
    }
    const admittedDurationSeconds = started.durationSeconds;

    const deadline = Date.now() + 2 * 60 * 60 * 1_000;
    let lastProgressAt = 0;
    while (Date.now() < deadline) {
      const fresh = (await musicService.list()).find(
        (track) => !baseline.has(track.id),
      );
      if (fresh) {
        let proof = await musicService.getLastRuntimeProof();
        for (
          let attempt = 0;
          proof?.track.id !== fresh.id && attempt < 20;
          attempt += 1
        ) {
          await sleep(250);
          proof = await musicService.getLastRuntimeProof();
        }
        const songPath = musicService.trackPath(fresh.id);
        const playback = (await window.webContents.executeJavaScript(`
          (async () => {
            const audio = document.querySelector("audio");
            if (!(audio instanceof HTMLAudioElement)) {
              return { ok: false, reason: "audio-element-missing" };
            }
            if (audio.paused) {
              const playButton = Array.from(
                document.querySelectorAll('button[aria-label="Play"]')
              )[0];
              if (playButton instanceof HTMLButtonElement) {
                playButton.click();
              }
            }
            const deadline = Date.now() + 5000;
            while (
              (audio.paused || !audio.currentSrc || audio.readyState < 2) &&
              Date.now() < deadline
            ) {
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
            const result = {
              currentSrc: audio.currentSrc,
              ok:
                !audio.paused &&
                audio.currentSrc.startsWith("blob:") &&
                audio.readyState >= 2,
              paused: audio.paused,
              readyState: audio.readyState
            };
            audio.pause();
            return result;
          })()
        `)) as {
          currentSrc?: string;
          ok: boolean;
          paused?: boolean;
          readyState?: number;
          reason?: string;
        };
        if (!playback.ok) {
          throw new Error(
            `The generated library did not pass playback verification (${playback.reason ?? "audio-not-playing"}).`,
          );
        }
        if (!proof) {
          throw new Error(
            "The generated track did not write a runtime proof.",
          );
        }
        activeBackend.assertRuntimeProof(proof);
        if (
          proof.track.id !== fresh.id ||
          proof.track.path !== songPath ||
          !proof.planner.healthInitialized ||
          proof.request.thinking !== true ||
          !proof.request.sampleMode ||
          proof.request.duration !== admittedDurationSeconds ||
          proof.request.inferenceSteps !== 8 ||
          proof.request.vocalLanguage !== "en" ||
          proof.port <= 0 ||
          !isPathWithin(activeBackend.runtimeRoot, proof.planner.path) ||
          !isPathWithin(activeBackend.runtimeRoot, proof.mainModel.path) ||
          !isPathWithin(storageLocations.library, songPath)
        ) {
          throw new Error(
            "The generated track failed exact private runtime/planner proof.",
          );
        }
        await access(songPath);
        console.log(
          "LOCOMO_MUSIC_REVIEW_SONG_OK",
          JSON.stringify({ playback, proof, track: fresh }),
        );
        musicService.dispose();
        await sleep(100);
        app.exit(0);
        return;
      }
      if (Date.now() - lastProgressAt >= 30_000) {
        console.log(
          "LOCOMO_MUSIC_REVIEW_PROGRESS",
          JSON.stringify({ elapsedSeconds: Math.floor((Date.now() - (deadline - 2 * 60 * 60 * 1_000)) / 1_000) }),
        );
        lastProgressAt = Date.now();
      }
      await sleep(2_000);
    }
    throw new Error("The review song did not finish before the deadline.");
  } catch (error) {
    console.error("LOCOMO_MUSIC_REVIEW_SONG_FAILED", error);
    app.exit(1);
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) =>
    setTimeout(resolveSleep, milliseconds),
  );
}

function createWindow(): BrowserWindow {
  const targetWorkArea = screen.getPrimaryDisplay().workArea;
  const initialBounds = collapsedWindowBounds(targetWorkArea);
  const minimumHeight = Math.min(
    MINIMUM_WINDOW_HEIGHT,
    initialBounds.height,
  );
  const window = new BrowserWindow({
    backgroundColor: "#cde50b",
    ...initialBounds,
    minHeight: minimumHeight,
    minWidth: Math.min(
      studioPaneWidths(minimumHeight).left,
      initialBounds.width,
    ),
    fullscreenable: false,
    maximizable: false,
    maxHeight: initialBounds.height,
    maxWidth: targetWorkArea.width,
    show: false,
    title: APP_NAME,
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hidden" as const,
          trafficLightPosition: { x: 14, y: 14 },
        }
      : {}),
    webPreferences: {
      contextIsolation: true,
      devTools: Boolean(rendererDevelopmentUrl),
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
  });

  if (!isAutomatedRun) {
    window.once("ready-to-show", () => {
      window.show();
    });
  }

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  window.on("will-resize", (event, proposedBounds) => {
    const nextBounds = responsiveWindowBounds(
      window,
      proposedBounds,
      screen.getDisplayMatching(proposedBounds).workArea,
    );
    if (
      nextBounds.x === proposedBounds.x &&
      nextBounds.y === proposedBounds.y &&
      nextBounds.width === proposedBounds.width &&
      nextBounds.height === proposedBounds.height
    ) {
      return;
    }

    event.preventDefault();
    const [, maximumHeight = 0] = window.getMaximumSize();
    window.setMaximumSize(
      screen.getDisplayMatching(nextBounds).workArea.width,
      maximumHeight,
    );
    window.setBounds(nextBounds, false);
  });

  void loadRenderer(window)
    .then(() => {
      if (isSmokeTest) {
        return runSmokeVerification(window);
      }
      if (isRuntimeSetup) {
        return runRuntimeSetup(window);
      }
      if (isReviewSong) {
        return runReviewSong(window);
      }

      return undefined;
    })
    .catch((error: unknown) => {
      console.error(`Failed to load the ${APP_NAME} renderer.`, error);
      app.exit(1);
    });

  return window;
}

function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  const window = new BrowserWindow({
    backgroundColor: nativeTheme.shouldUseDarkColors
      ? "#191919"
      : "#cde50b",
    fullscreenable: false,
    height: SETTINGS_WINDOW_HEIGHT,
    maximizable: false,
    minimizable: false,
    resizable: false,
    show: false,
    title: "Settings",
    webPreferences: {
      contextIsolation: true,
      devTools: Boolean(rendererDevelopmentUrl),
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
    width: SETTINGS_WINDOW_WIDTH,
  });
  settingsWindow = window;

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  window.on("closed", () => {
    if (settingsWindow === window) {
      settingsWindow = undefined;
    }
  });

  void loadRenderer(window, "settings")
    .then(() => {
      if (!window.isDestroyed()) {
        window.show();
        window.focus();
      }
    })
    .catch((error: unknown) => {
      console.error(`Failed to load ${APP_NAME} Settings.`, error);
      window.destroy();
    });

  return window;
}

function installApplicationMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      createApplicationMenuTemplate({
        appName: APP_NAME,
        onOpenSettings: () => createSettingsWindow(),
      }),
    ),
  );
}

registerIpcHandlers();

void app.whenReady().then(() => {
  if (!hasSingleInstanceLock) {
    app.quit();
    return;
  }
  installOvernightSystemMonitoring();
  installApplicationMenu();
  void getRuntimeSetupStatus()
    .then((status) => {
      if (status.ready) {
        return prepareMusic();
      }
      return undefined;
    })
    .catch((error: unknown) => {
      console.error(`${APP_NAME} could not prepare its local engine.`, error);
    });
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("second-instance", () => {
  const [window] = BrowserWindow.getAllWindows();
  if (window) {
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (memoryTimer) {
    clearInterval(memoryTimer);
  }
  stopGenerationMemoryObservation();
  stopMusicEngineExitObservation();
  overnightPower.dispose();
  musicService.dispose();
});
