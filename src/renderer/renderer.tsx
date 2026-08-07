import {
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { render } from "solid-js/web";

import {
  APP_NAME,
  type MemoryStatus,
  type RuntimeSetupStatus,
} from "../shared/app-contract";
import {
  APPEARANCE_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  readAppearancePreference,
  resolveAppearance,
  type ResolvedAppearance,
} from "./appearance";
import { LocomoMusicStudio } from "./LocomoMusicStudio";
import {
  CURRENT_MEMORY_EXPLANATION,
  memoryPopoverDisplay,
} from "./memory-display";
import { createRuntimeSetupController } from "./runtime-setup-controller";
import {
  isMusicGenerationAvailable,
  musicGenerationWaitingState,
  scheduleApplicationRevealAfterPaint,
  shouldMountStudio,
  type MusicEngineState,
  type MusicLibraryState,
} from "./runtime-setup-presentation";
import { SettingsWindow } from "./SettingsWindow";
import "./styles.css";

function WindowChrome() {
  return (
    <header class="window-chrome">
      <span class="window-chrome__title" aria-hidden="true">
        Locomo <span class="window-chrome__title-music">Music OSS</span>
      </span>
    </header>
  );
}

function MemoryIndicator() {
  const empty: MemoryStatus = {
    status: "checking",
    totalBytes: 0,
    availableBytes: 0,
    requiredBytes: 0,
    headroomBytes: 0,
    modelBytes: 0,
    generationActive: false,
    model:
      "ACE-Step/acestep-v15-xl-turbo + ACE-Step/acestep-5Hz-lm-4B",
    measuredAt: Date.now(),
  };
  const [status, setStatus] = createSignal(empty);
  const [diagnosticsCopyStatus, setDiagnosticsCopyStatus] =
    createSignal<"idle" | "copying" | "copied" | "error">("idle");
  let diagnosticsResetTimer: number | undefined;
  const format = (bytes: number) =>
    `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  const label = createMemo(() => {
    if (status().status === "ready") return "Ready";
    if (
      status().status === "blocked" ||
      status().status === "error"
    ) {
      return "Not ready";
    }
    return "Starting…";
  });
  const percent = (bytes: number) => {
    if (status().totalBytes <= 0) return "0%";
    return `${Math.max(
      0,
      Math.min(100, (bytes / status().totalBytes) * 100),
    )}%`;
  };
  const display = createMemo(() => memoryPopoverDisplay(status()));
  const peakValue = createMemo(() => {
    const peakBytes = display().peakBytes;
    return peakBytes === undefined
      ? display().peakPlaceholder
      : format(peakBytes);
  });
  const copyDiagnostics = async () => {
    if (diagnosticsCopyStatus() === "copying") return;
    setDiagnosticsCopyStatus("copying");
    if (diagnosticsResetTimer !== undefined) {
      window.clearTimeout(diagnosticsResetTimer);
    }
    try {
      await window.locomoMusic.copyDiagnostics();
      setDiagnosticsCopyStatus("copied");
    } catch {
      setDiagnosticsCopyStatus("error");
    }
    diagnosticsResetTimer = window.setTimeout(
      () => setDiagnosticsCopyStatus("idle"),
      2_000,
    );
  };

  onMount(() => {
    void window.locomoMusic.getMemoryStatus().then(setStatus);
    const unsubscribe = window.locomoMusic.onMemoryStatus(setStatus);
    onCleanup(() => {
      unsubscribe();
      if (diagnosticsResetTimer !== undefined) {
        window.clearTimeout(diagnosticsResetTimer);
      }
    });
  });

  return (
    <div
      class="memory-indicator"
      data-memory-status={status().status}
    >
      <button
        type="button"
        class={`memory-indicator__button memory-indicator__button--${status().status}`}
        aria-label={`${label()}. Show memory details`}
      >
        <span class="memory-indicator__dot" />
        <span>{label()}</span>
        <span class="memory-indicator__divider" />
        <span class="memory-indicator__local">Local</span>
      </button>
      <section class="memory-indicator__popover">
        <div class="memory-indicator__title">Runtime</div>
        <p>{status().model}</p>
        <Show
          when={status().status === "ready"}
          fallback={
            <>
              <div class="memory-indicator__title">
                Not enough room
              </div>
              <p>Close a few large apps, then check again.</p>
              <div class="memory-bar memory-bar--blocked">
                <div
                  class="memory-bar__other"
                  style={{
                    width: percent(
                      status().totalBytes - status().availableBytes,
                    ),
                  }}
                />
                <div
                  class="memory-bar__free"
                  style={{ width: percent(status().availableBytes) }}
                />
                <div
                  class="memory-bar__needed"
                  style={{ width: percent(status().requiredBytes) }}
                />
              </div>
              <div class="memory-legend">
                <span>
                  <i class="memory-key memory-key--other" />
                  {display().residualLabel}
                </span>
                <span>
                  <i class="memory-key memory-key--needed" />
                  AI needs this space
                </span>
              </div>
              <dl>
                <div>
                  <dt>{display().availableLabel}</dt>
                  <dd>{format(display().availableBytes)}</dd>
                </div>
                <div>
                  <dt>AI needs</dt>
                  <dd>{format(status().requiredBytes)}</dd>
                </div>
              </dl>
            </>
          }
        >
          <div class="memory-indicator__title">Memory</div>
          <p>{CURRENT_MEMORY_EXPLANATION}</p>
          <div class="memory-bar">
            <div
              class="memory-bar__other"
              style={{ width: percent(display().residualBytes) }}
            />
            <div
              class="memory-bar__model"
              style={{ width: percent(display().currentAIStackBytes) }}
            />
            <div
              class="memory-bar__free"
              style={{ width: percent(display().availableBytes) }}
            />
          </div>
          <div class="memory-legend">
            <span>
              <i class="memory-key memory-key--other" />
              {display().residualLabel}
            </span>
            <span>
              <i class="memory-key memory-key--model" />
              {display().currentAILabel}
            </span>
            <span>
              <i class="memory-key memory-key--free" />
              {display().availableLabel}
            </span>
          </div>
          <dl>
            <div>
              <dt>{display().residualLabel}</dt>
              <dd>{format(display().residualBytes)}</dd>
            </div>
            <div>
              <dt>{display().currentAILabel}</dt>
              <dd>{format(display().currentAIBytes)}</dd>
            </div>
            <div>
              <dt>{display().availableLabel}</dt>
              <dd>{format(display().availableBytes)}</dd>
            </div>
          </dl>
          <div class="memory-generation-peak">
            <span>{display().peakLabel}</span>
            <strong>{peakValue()}</strong>
          </div>
        </Show>
        <div class="memory-indicator__diagnostics">
          <button
            type="button"
            data-copy-diagnostics
            disabled={diagnosticsCopyStatus() === "copying"}
            onClick={() => void copyDiagnostics()}
          >
            {diagnosticsCopyStatus() === "copying"
              ? "Copying…"
              : diagnosticsCopyStatus() === "copied"
                ? "Copied diagnostics"
                : "Copy diagnostics"}
          </button>
          <span aria-live="polite" data-copy-diagnostics-status>
            {diagnosticsCopyStatus() === "error"
              ? "Could not copy diagnostics."
              : ""}
          </span>
        </div>
      </section>
    </div>
  );
}

function RuntimeSetupSurface(props: {
  readonly automatic: boolean;
  readonly onStart: () => void;
  readonly progress: number;
  readonly status: RuntimeSetupStatus;
}) {
  const downloaded = () =>
    formatDecimalGigabytes(props.status.downloadedBytes ?? 0);
  const total = () =>
    formatDecimalGigabytes(props.status.downloadTotalBytes ?? 0);
  return (
    <aside
      aria-label="Music generation setup"
      data-runtime-setup-surface
      class="rounded-xl border border-locomo-contrast/40 bg-locomo-contrast/[0.045] p-4 text-locomo-foreground"
    >
      <div class="flex items-start gap-4">
        <div class="min-w-0 flex-1">
          <p class="text-[14px] font-semibold">
            Set up local music generation
          </p>
          <p class="mt-1 text-[11px] leading-4 text-locomo-contrast/60">
            Browse and play now. Downloads about 10.9 GB. Requires 16 GB
            free.
          </p>
          <p class="mt-1 text-[10px] leading-4 text-locomo-contrast/55">
            If you close Locomo, setup will continue when you reopen it.
          </p>
        </div>
        <Show
          when={
            !props.status.running &&
            (!props.automatic || props.status.phase === "error")
          }
        >
          <button
            type="button"
            data-runtime-setup-action
            class="shrink-0 rounded-full border border-locomo-foreground bg-locomo-foreground px-3 py-1.5 text-[11px] font-semibold text-locomo-surface transition-colors hover:bg-transparent hover:text-locomo-foreground"
            onClick={props.onStart}
          >
            {props.status.errorCode === "insufficient-disk"
              ? "Check again"
              : props.status.phase === "error"
                ? "Retry setup"
                : "Install music runtime"}
          </button>
        </Show>
      </div>
      <div
        aria-hidden="true"
        class="mt-3 h-1 overflow-hidden rounded-full bg-locomo-contrast/15"
      >
        <div
          class="h-full rounded-full bg-locomo-foreground transition-[width] duration-300"
          style={{ width: `${props.progress}%` }}
        />
      </div>
      <div class="mt-2 flex items-center justify-between gap-3 text-[10px] text-locomo-contrast/55">
        <p
          aria-live="polite"
          data-runtime-setup-status
          class="min-w-0 truncate"
          classList={{ "text-locomo-danger": props.status.phase === "error" }}
        >
          {props.status.error || props.status.message || "Checking setup…"}
        </p>
        <p data-runtime-setup-bytes class="shrink-0 tabular-nums">
          {downloaded()} of {total()}
        </p>
      </div>
    </aside>
  );
}

function EngineFailureSurface(props: {
  readonly error: string;
  readonly onRetry: () => void;
}) {
  return (
    <aside
      aria-label="Music engine failure"
      data-engine-failure-surface
      class="rounded-xl border border-black/20 bg-[#111313] p-4 text-white shadow-sm"
    >
      <div class="flex items-start gap-4">
        <div class="min-w-0 flex-1">
          <p class="text-[14px] font-semibold">Music engine stopped</p>
          <p class="mt-1 text-[11px] leading-4 text-white/60">
            {props.error}
          </p>
          <p class="mt-1 text-[10px] leading-4 text-white/55">
            Your saved songs remain available to play.
          </p>
        </div>
        <button
          type="button"
          data-engine-retry
          class="shrink-0 rounded-full bg-[#c7f000] px-3 py-1.5 text-[11px] font-semibold text-black hover:bg-[#d8ff32]"
          onClick={props.onRetry}
        >
          Try again
        </button>
      </div>
    </aside>
  );
}

function App() {
  const systemAppearance = window.matchMedia(
    "(prefers-color-scheme: dark)",
  );
  const initialPreference = readAppearancePreference(
    window.localStorage,
  );
  const [theme, setTheme] = createSignal<ResolvedAppearance>(
    resolveAppearance(initialPreference, systemAppearance.matches),
  );
  const [runtime, setRuntime] = createSignal<RuntimeSetupStatus>();
  const [automaticSetup, setAutomaticSetup] = createSignal(false);
  const [engine, setEngine] = createSignal<MusicEngineState>("checking");
  const [engineError, setEngineError] = createSignal("");
  const [library, setLibrary] = createSignal<MusicLibraryState>("loading");
  let cancelApplicationReveal: (() => void) | undefined;
  let preparation: Promise<void> | undefined;

  const refreshAppearance = () => {
    const nextTheme = resolveAppearance(
      readAppearancePreference(window.localStorage),
      systemAppearance.matches,
    );
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  };

  refreshAppearance();
  const progress = createMemo(() => {
    const status = runtime();
    const downloadedBytes = status?.downloadedBytes ?? 0;
    const totalBytes = status?.downloadTotalBytes ?? 0;
    return totalBytes > 0
      ? Math.round((downloadedBytes / totalBytes) * 100)
      : 0;
  });
  const displayedSetupStatus = createMemo(() => {
    const status = runtime();
    if (!status) return undefined;
    if (
      automaticSetup() &&
      status.ready &&
      engine() === "loading"
    ) {
      return {
        ...status,
        phase: "starting-engine" as const,
        ready: false,
        running: true,
        message: "Starting music engine…",
      };
    }
    return status.ready ? undefined : status;
  });
  const generationAvailable = createMemo(
    () => isMusicGenerationAvailable(runtime(), engine()),
  );
  const studioVisible = createMemo(() => shouldMountStudio(library()));

  const prepareMusic = () => {
    if (preparation || engine() === "ready") return;
    setEngine("loading");
    setEngineError("");
    document.documentElement.dataset.musicEngineStatus = "loading";
    preparation = window.locomoMusic.prepare().then(
      () => {
        setEngine("ready");
        document.documentElement.dataset.musicEngineStatus = "ready";
      },
      (cause: unknown) => {
        setEngine("error");
        setEngineError(
          (cause instanceof Error
            ? cause.message
            : "The local music engine could not start."
          )
            .replace(
              /^Error invoking remote method 'locomo-music:prepare': Error:\s*/,
              "",
            )
            .split("\n")[0]
            ?.slice(0, 240) || "The local music engine could not start.",
        );
        document.documentElement.dataset.musicEngineStatus = "failed";
        preparation = undefined;
      },
    );
  };

  const setupController = createRuntimeSetupController({
    client: window.locomoMusic,
    onAutomaticMode: setAutomaticSetup,
    onReady: prepareMusic,
    onStatus: setRuntime,
  });

  const reportSetupStartFailure = (cause: unknown) => {
    const current = runtime();
    setRuntime({
      phase: "error",
      ready: false,
      running: false,
      message: "Setup stopped.",
      completedSteps: current?.completedSteps ?? 0,
      totalSteps: current?.totalSteps ?? 3,
      downloadedBytes: current?.downloadedBytes,
      downloadTotalBytes: current?.downloadTotalBytes,
      error:
        cause instanceof Error
          ? cause.message
          : "Setup could not start.",
    });
  };

  onMount(() => {
    let disposed = false;
    let timer: number | undefined;
    const refreshStoredAppearance = (event: StorageEvent) => {
      if (
        event.key === APPEARANCE_STORAGE_KEY ||
        event.key === LEGACY_THEME_STORAGE_KEY ||
        event.key === null
      ) {
        refreshAppearance();
      }
    };
    document.documentElement.dataset.musicEngineStatus = "checking";
    document.documentElement.dataset.musicLibraryStatus = "loading";
    systemAppearance.addEventListener("change", refreshAppearance);
    window.addEventListener("storage", refreshStoredAppearance);
    void window.locomoMusic.list().then(
      () => {
        if (disposed) return;
        setLibrary("ready");
        document.documentElement.dataset.musicLibraryStatus = "ready";
        cancelApplicationReveal = scheduleApplicationRevealAfterPaint({
          cancelFrame: (handle) => window.cancelAnimationFrame(handle),
          requestFrame: (callback) =>
            window.requestAnimationFrame(callback),
          reveal: () => {
            if (disposed) return;
            document.documentElement.dataset.applicationReady = "true";
            document.getElementById("root")?.removeAttribute("inert");
            document.getElementById("locomo-startup-ghost")?.remove();
          },
        });
      },
      (cause: unknown) => {
        if (disposed) return;
        setLibrary("error");
        document.documentElement.dataset.musicLibraryStatus = "failed";
        console.error(`${APP_NAME} could not open its song library.`, cause);
      },
    );
    void setupController.initialize().then(
      () => {
        document.documentElement.dataset.bridgeStatus = "ready";
        timer = window.setInterval(
          () =>
            void setupController.refresh().catch(() => {
              document.documentElement.dataset.bridgeStatus = "failed";
            }),
          750,
        );
      },
      (cause: unknown) => {
        document.documentElement.dataset.bridgeStatus = "failed";
        if (!disposed && runtime()) reportSetupStartFailure(cause);
      },
    );
    onCleanup(() => {
      disposed = true;
      systemAppearance.removeEventListener(
        "change",
        refreshAppearance,
      );
      window.removeEventListener("storage", refreshStoredAppearance);
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
      cancelApplicationReveal?.();
    });
  });

  const beginSetup = async () => {
    try {
      await setupController.start();
    } catch (cause: unknown) {
      reportSetupStartFailure(cause);
    }
  };

  return (
    <>
      <Show when={studioVisible()}>
        <WindowChrome />
        <LocomoMusicStudio
          generationAvailable={generationAvailable()}
          generationWaitingState={musicGenerationWaitingState(
            runtime(),
            engine(),
          )}
          setupSurface={
            runtime()?.ready && engine() === "error" ? (
              <EngineFailureSurface
                error={engineError()}
                onRetry={prepareMusic}
              />
            ) : displayedSetupStatus() ? (
              <RuntimeSetupSurface
                automatic={automaticSetup()}
                onStart={() => void beginSetup()}
                progress={progress()}
                status={displayedSetupStatus()!}
              />
            ) : undefined
          }
          theme={theme()}
        />
      </Show>
    </>
  );
}

function formatDecimalGigabytes(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

function SettingsView() {
  return (
    <>
      <SettingsWindow />
      <MemoryIndicator />
    </>
  );
}

const root = document.querySelector<HTMLElement>("#root");
if (!root) {
  throw new Error(`${APP_NAME} could not find its renderer root.`);
}

const rendererView = new URLSearchParams(window.location.search).get(
  "view",
);
const isSettingsView = rendererView === "settings";
document.documentElement.dataset.view = isSettingsView
  ? "settings"
  : "main";
document.documentElement.dataset.applicationReady = isSettingsView
  ? "true"
  : "false";
if (isSettingsView) {
  document.title = "Settings";
  root.removeAttribute("inert");
  document.getElementById("locomo-startup-ghost")?.remove();
}

render(() => (isSettingsView ? <SettingsView /> : <App />), root);
