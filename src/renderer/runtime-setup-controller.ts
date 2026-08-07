import type {
  AppInfo,
  RuntimeSetupStatus,
} from "../shared/app-contract";

export interface RuntimeSetupClient {
  getAppInfo(): Promise<Pick<AppInfo, "isPackaged">>;
  getRuntimeSetupStatus(): Promise<RuntimeSetupStatus>;
  startRuntimeSetup(): Promise<RuntimeSetupStatus>;
}

export interface RuntimeSetupController {
  initialize(): Promise<void>;
  refresh(): Promise<RuntimeSetupStatus>;
  start(): Promise<RuntimeSetupStatus>;
}

export function createRuntimeSetupController(options: {
  readonly client: RuntimeSetupClient;
  readonly onAutomaticMode: (enabled: boolean) => void;
  readonly onReady: () => void;
  readonly onStatus: (status: RuntimeSetupStatus) => void;
}): RuntimeSetupController {
  let initialization: Promise<void> | undefined;
  let startInFlight: Promise<RuntimeSetupStatus> | undefined;

  const accept = (status: RuntimeSetupStatus) => {
    options.onStatus(status);
    if (status.ready) options.onReady();
    return status;
  };

  const start = () => {
    if (startInFlight) return startInFlight;

    const request = options.client.startRuntimeSetup().then(accept);
    startInFlight = request;
    void request.then(
      () => {
        if (startInFlight === request) startInFlight = undefined;
      },
      () => {
        if (startInFlight === request) startInFlight = undefined;
      },
    );
    return request;
  };

  return {
    initialize() {
      initialization ??= (async () => {
        const [info, status] = await Promise.all([
          options.client.getAppInfo(),
          options.client.getRuntimeSetupStatus(),
        ]);
        options.onAutomaticMode(info.isPackaged);
        accept(status);
        if (
          info.isPackaged &&
          status.phase === "not-installed" &&
          !status.running
        ) {
          await start();
        }
      })();
      return initialization;
    },
    async refresh() {
      return accept(await options.client.getRuntimeSetupStatus());
    },
    start,
  };
}
