export interface PowerSaveBlockerAdapter {
  isStarted(id: number): boolean;
  start(type: "prevent-app-suspension"): number;
  stop(id: number): void;
}

export interface OvernightPowerSaveBlocker {
  dispose(): void;
  isActive(): boolean;
  release(ownerID: number): void;
  setActive(ownerID: number, active: boolean): void;
}

export function createOvernightPowerSaveBlocker(
  adapter: PowerSaveBlockerAdapter,
): OvernightPowerSaveBlocker {
  const activeOwners = new Set<number>();
  let blockerID: number | undefined;

  const stop = () => {
    if (blockerID === undefined) return;
    if (adapter.isStarted(blockerID)) adapter.stop(blockerID);
    blockerID = undefined;
  };

  const synchronize = () => {
    if (activeOwners.size > 0) {
      if (
        blockerID === undefined ||
        !adapter.isStarted(blockerID)
      ) {
        blockerID = adapter.start("prevent-app-suspension");
      }
      return;
    }
    stop();
  };

  return {
    dispose: () => {
      activeOwners.clear();
      stop();
    },
    isActive: () =>
      blockerID !== undefined && adapter.isStarted(blockerID),
    release: (ownerID) => {
      activeOwners.delete(ownerID);
      synchronize();
    },
    setActive: (ownerID, active) => {
      if (active) activeOwners.add(ownerID);
      else activeOwners.delete(ownerID);
      synchronize();
    },
  };
}
