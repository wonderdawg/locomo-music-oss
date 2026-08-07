import type {
  LocalModelStatus,
  RuntimeSetupPhase,
} from "../shared/app-contract";
import type { MusicBackendProfile } from "./music-backend";

export const DIAGNOSTICS_MAX_CHARACTERS = 8_192;

const RUNTIME_PHASES = new Set<RuntimeSetupPhase>([
  "checking",
  "not-installed",
  "checking-disk",
  "installing-helper",
  "downloading-models",
  "verifying",
  "starting-engine",
  "ready",
  "error",
]);
const BACKEND_PROFILES = new Set<MusicBackendProfile>(["cpp-q8"]);
const ENGINE_STATUSES = new Set<LocalModelStatus>([
  "checking",
  "blocked",
  "loading",
  "ready",
  "error",
]);
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/u;

export function formatProductDiagnostics(options: {
  readonly appVersion: string;
  readonly backend: MusicBackendProfile;
  readonly buildVersion: string;
  readonly engineStatus: LocalModelStatus;
  readonly generatedAt: Date;
  readonly runtimePhase: RuntimeSetupPhase;
}): string {
  const appVersion = safeVersion(options.appVersion);
  const buildVersion = safeVersion(options.buildVersion);
  const backend = BACKEND_PROFILES.has(options.backend)
    ? options.backend
    : "unknown";
  const engineStatus = ENGINE_STATUSES.has(options.engineStatus)
    ? options.engineStatus
    : "unknown";
  const runtimePhase = RUNTIME_PHASES.has(options.runtimePhase)
    ? options.runtimePhase
    : "unknown";
  const generatedAt = Number.isFinite(options.generatedAt.getTime())
    ? options.generatedAt.toISOString()
    : "unknown";
  const lines = [
    "Locomo Music OSS diagnostics",
    `App version: ${appVersion}`,
    `Build: ${buildVersion}`,
    `Generated: ${generatedAt}`,
    `Backend: ${backend}`,
    `Runtime phase: ${runtimePhase}`,
    `Engine status: ${engineStatus}`,
  ];
  return `${lines.join("\n").slice(0, DIAGNOSTICS_MAX_CHARACTERS)}\n`;
}

function safeVersion(value: string): string {
  return VERSION_PATTERN.test(value) ? value : "unknown";
}
