import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";

import {
  APP_NAME,
  type OvernightSystemStatus,
} from "../shared/app-contract";

import {
  APPEARANCE_OPTIONS,
  APPEARANCE_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  readAppearancePreference,
  resolveAppearance,
  writeAppearancePreference,
  type AppearancePreference,
} from "./appearance";
import {
  AUTOMATIC_GENERATION_LIMIT_STORAGE_KEY,
  MAX_AUTOMATIC_GENERATION_LIMIT,
  MIN_AUTOMATIC_GENERATION_LIMIT,
  readAutomaticGenerationLimit,
  validateAutomaticGenerationLimit,
  writeAutomaticGenerationLimit,
} from "./automatic-generation-limit";
import { locomoMusicCategoryCatalogs } from "./category-catalog";
import { visibleCategoryTiles } from "./favorites";
import {
  createOvernightBatch,
  isOvernightEligible,
  overnightBatchProgress,
  OVERNIGHT_BATCH_STORAGE_KEY,
  OVERNIGHT_IDLE_THRESHOLD_SECONDS,
  readOvernightBatch,
  snapshotOvernightBatchCategories,
  writeOvernightBatch,
} from "./overnight-batch";
import { createCategoryGenerationRequest } from "./radio";

export function SettingsWindow() {
  const systemAppearance = window.matchMedia(
    "(prefers-color-scheme: dark)",
  );
  const [preference, setPreference] =
    createSignal<AppearancePreference>(
      readAppearancePreference(window.localStorage),
    );
  const [batch, setBatch] = createSignal(
    readOvernightBatch(window.localStorage),
  );
  const [conditions, setConditions] =
    createSignal<OvernightSystemStatus>();
  const [runtimeReady, setRuntimeReady] = createSignal<boolean>();
  const [appVersion, setAppVersion] = createSignal<string>();
  const [batchError, setBatchError] = createSignal("");
  const [automaticGenerationLimit, setAutomaticGenerationLimit] =
    createSignal(readAutomaticGenerationLimit(window.localStorage));
  const overnightSnapshot = snapshotOvernightBatchCategories(
    visibleCategoryTiles(
      locomoMusicCategoryCatalogs.existing.categories,
      "existing",
    ),
    (categoryKey) =>
      createCategoryGenerationRequest(categoryKey, false, 0) !==
      undefined,
  );
  const progress = createMemo(() => {
    const current = batch();
    return current ? overnightBatchProgress(current) : undefined;
  });

  const applyAppearance = (nextPreference: AppearancePreference) => {
    setPreference(nextPreference);
    document.documentElement.dataset.theme = resolveAppearance(
      nextPreference,
      systemAppearance.matches,
    );
  };

  const selectAppearance = (nextPreference: AppearancePreference) => {
    writeAppearancePreference(window.localStorage, nextPreference);
    applyAppearance(nextPreference);
  };

  applyAppearance(preference());

  const refreshConditions = () =>
    window.locomoMusic
      .getOvernightSystemStatus()
      .then(setConditions, () => setConditions(undefined));
  const refreshRuntimeStatus = () =>
    window.locomoMusic
      .getRuntimeSetupStatus()
      .then(
        (status) => setRuntimeReady(status.ready),
        () => setRuntimeReady(false),
      );

  const armOvernightBatch = () => {
    if (runtimeReady() !== true) {
      setBatchError(
        "Install the music runtime before arming Overnight Batch.",
      );
      return;
    }
    try {
      const next = createOvernightBatch(
        overnightSnapshot,
        crypto.randomUUID(),
        Date.now(),
      );
      writeOvernightBatch(window.localStorage, next);
      setBatch(next);
      setBatchError("");
      void refreshConditions();
    } catch (cause) {
      setBatchError(
        cause instanceof Error
          ? cause.message
          : "Could not arm the overnight batch.",
      );
    }
  };

  const cancelOvernightBatch = () => {
    try {
      writeOvernightBatch(window.localStorage, undefined);
      setBatch(undefined);
      setBatchError("");
    } catch {
      setBatchError("Could not cancel the overnight batch.");
    }
  };

  const saveAutomaticGenerationLimit = (input: HTMLInputElement) => {
    const next = validateAutomaticGenerationLimit(input.value);
    if (next === undefined) {
      input.value = String(automaticGenerationLimit());
      return;
    }
    try {
      setAutomaticGenerationLimit(
        writeAutomaticGenerationLimit(window.localStorage, next),
      );
    } catch {
      input.value = String(automaticGenerationLimit());
    }
  };

  const overnightStatus = createMemo(() => {
    if (batchError()) return batchError();
    if (runtimeReady() === undefined) {
      return "Checking music generation setup…";
    }
    if (!runtimeReady()) {
      return "Paused — install the music runtime to generate overnight.";
    }
    const current = batch();
    if (!current) {
      return `Ready to add ${overnightSnapshot.length * 5} songs.`;
    }
    if (current.status === "completed") {
      return "Complete — the one-shot batch disarmed itself.";
    }
    const system = conditions();
    if (!system) {
      return "Checking idle time and power…";
    }
    if (!system.supported) {
      return "Paused — overnight batches require macOS.";
    }
    if (current.pending?.inFlight) {
      const category = current.categories.find(
        (candidate) =>
          candidate.key === current.pending?.categoryKey,
      );
      const categoryName = category?.name ?? "the next category";
      if (!system.onExternalPower) {
        return `Finishing ${categoryName}, then pausing — external power disconnected.`;
      }
      if (!isOvernightEligible(system)) {
        return `Finishing ${categoryName}, then pausing — activity detected.`;
      }
      return `Generating ${categoryName}…`;
    }
    if (!system.onExternalPower) {
      return "Paused — connect this Mac to external power.";
    }
    if (!isOvernightEligible(system)) {
      const minutes = Math.max(
        1,
        Math.ceil(
          (OVERNIGHT_IDLE_THRESHOLD_SECONDS - system.idleSeconds) / 60,
        ),
      );
      return `Armed — starts after ${minutes} more minute${
        minutes === 1 ? "" : "s"
      } unused.`;
    }
    return "Ready — waiting for the generation queue.";
  });

  onMount(() => {
    const refreshSystemAppearance = () =>
      applyAppearance(preference());
    const refreshStoredAppearance = (event: StorageEvent) => {
      if (
        event.key === APPEARANCE_STORAGE_KEY ||
        event.key === LEGACY_THEME_STORAGE_KEY ||
        event.key === null
      ) {
        applyAppearance(readAppearancePreference(window.localStorage));
      }
      if (
        event.key === OVERNIGHT_BATCH_STORAGE_KEY ||
        event.key === null
      ) {
        setBatch(readOvernightBatch(window.localStorage));
        setBatchError("");
      }
      if (
        event.key === AUTOMATIC_GENERATION_LIMIT_STORAGE_KEY ||
        event.key === null
      ) {
        setAutomaticGenerationLimit(
          readAutomaticGenerationLimit(window.localStorage),
        );
      }
    };

    systemAppearance.addEventListener(
      "change",
      refreshSystemAppearance,
    );
    window.addEventListener("storage", refreshStoredAppearance);
    const unsubscribeConditions =
      window.locomoMusic.onOvernightSystemStatus(setConditions);
    void window.locomoMusic
      .getAppInfo()
      .then(
        (info) => setAppVersion(info.version),
        () => setAppVersion(undefined),
      );
    void refreshConditions();
    void refreshRuntimeStatus();
    const conditionsTimer = window.setInterval(
      () => void refreshConditions(),
      5_000,
    );
    const runtimeTimer = window.setInterval(
      () => void refreshRuntimeStatus(),
      750,
    );
    onCleanup(() => {
      systemAppearance.removeEventListener(
        "change",
        refreshSystemAppearance,
      );
      window.removeEventListener("storage", refreshStoredAppearance);
      unsubscribeConditions();
      window.clearInterval(conditionsTimer);
      window.clearInterval(runtimeTimer);
    });
  });

  return (
    <main class="settings-window" data-settings-surface>
      <section aria-labelledby="appearance-heading">
        <h1 id="appearance-heading">Appearance</h1>
        <p>Choose how {APP_NAME} looks.</p>
        <fieldset class="settings-window__appearance">
          <legend class="sr-only">Appearance</legend>
          <For each={APPEARANCE_OPTIONS}>
            {(option) => (
              <label class="settings-window__appearance-option">
                <input
                  type="radio"
                  name="appearance"
                  value={option.value}
                  checked={preference() === option.value}
                  onChange={() => selectAppearance(option.value)}
                />
                <span>{option.label}</span>
              </label>
            )}
          </For>
        </fieldset>
      </section>
      <section
        aria-labelledby="automatic-generation-heading"
        data-automatic-generation-settings
      >
        <label class="settings-window__automatic-generation-card">
          <span>
            <strong id="automatic-generation-heading">
              Automatic songs
            </strong>
            <small>Per category selection · 1–100</small>
          </span>
          <input
            type="number"
            aria-label="Automatic songs per category selection"
            data-automatic-generation-limit
            min={MIN_AUTOMATIC_GENERATION_LIMIT}
            max={MAX_AUTOMATIC_GENERATION_LIMIT}
            step="1"
            value={automaticGenerationLimit()}
            onChange={(event) =>
              saveAutomaticGenerationLimit(event.currentTarget)
            }
          />
        </label>
      </section>
      <section
        class="settings-window__overnight"
        aria-labelledby="overnight-heading"
        data-overnight-batch-settings
        data-generation-available={runtimeReady() ? "true" : "false"}
      >
        <div class="settings-window__section-heading">
          <div>
            <h1 id="overnight-heading">Overnight Batch</h1>
            <p>One shot, five new songs per Existing category.</p>
          </div>
          <Show
            when={batch()?.status === "armed"}
            fallback={
              <button
                type="button"
                data-overnight-batch-arm
                disabled={
                  runtimeReady() !== true || overnightSnapshot.length === 0
                }
                onClick={armOvernightBatch}
              >
                {batch()?.status === "completed" ? "Run again" : "Arm"}
              </button>
            }
          >
            <button
              type="button"
              class="settings-window__secondary-action"
              data-overnight-batch-cancel
              onClick={cancelOvernightBatch}
            >
              Cancel
            </button>
          </Show>
        </div>
        <div class="settings-window__overnight-card">
          <div class="settings-window__overnight-status">
            <span
              class="settings-window__status-dot"
              classList={{
                "settings-window__status-dot--ready":
                  runtimeReady() === true &&
                  batch()?.status === "armed" &&
                  Boolean(conditions() && isOvernightEligible(conditions()!)),
                "settings-window__status-dot--complete":
                  batch()?.status === "completed",
              }}
            />
            <span data-overnight-batch-status>{overnightStatus()}</span>
          </div>
          <Show when={progress()}>
            {(current) => (
              <>
                <div class="settings-window__progress-row">
                  <span>Completed</span>
                  <strong data-overnight-batch-progress>
                    {current().completed}/{current().total}
                  </strong>
                </div>
                <div
                  class="settings-window__progress-track"
                  aria-hidden="true"
                >
                  <span
                    style={{
                      width: `${
                        (current().completed / current().total) * 100
                      }%`,
                    }}
                  />
                </div>
              </>
            )}
          </Show>
          <p class="settings-window__prerequisites">
            Locomo stays open · 15 minutes unused · external power
          </p>
          <Show when={(progress()?.failedAttempts ?? 0) > 0}>
            <p
              class="settings-window__failure-count"
              data-overnight-batch-failure-count
            >
              {progress()!.failedAttempts} failed generation attempt
              {progress()!.failedAttempts === 1 ? "" : "s"}
            </p>
          </Show>
          <Show when={batch()?.lastFailure}>
            {(failure) => (
              <p
                class="settings-window__failure"
                data-overnight-batch-failure
              >
                {failure().categoryName}: {failure().message}. {failure()
                  .disposition === "retrying"
                  ? "Retry queued once."
                  : failure().disposition === "recovered"
                    ? "Retry succeeded."
                    : "Item skipped; the five-song target remains."}
              </p>
            )}
          </Show>
        </div>
      </section>
      <Show when={appVersion()}>
        {(version) => (
          <footer class="settings-window__version" data-app-version>
            {APP_NAME} · Version {version()}
          </footer>
        )}
      </Show>
    </main>
  );
}
