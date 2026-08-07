import { describe, expect, it } from "vitest";

import {
  createOvernightPowerSaveBlocker,
  type PowerSaveBlockerAdapter,
} from "../src/main/overnight-power";

describe("overnight power-save blocker", () => {
  it("blocks app suspension only while at least one overnight owner is active", () => {
    const started = new Set<number>();
    const starts: string[] = [];
    const stops: number[] = [];
    let nextID = 1;
    const adapter: PowerSaveBlockerAdapter = {
      isStarted: (id) => started.has(id),
      start: (type) => {
        starts.push(type);
        const id = nextID;
        nextID += 1;
        started.add(id);
        return id;
      },
      stop: (id) => {
        stops.push(id);
        started.delete(id);
      },
    };
    const blocker = createOvernightPowerSaveBlocker(adapter);

    expect(blocker.isActive()).toBe(false);
    blocker.setActive(10, true);
    blocker.setActive(10, true);
    blocker.setActive(20, true);
    expect(starts).toEqual(["prevent-app-suspension"]);
    expect(blocker.isActive()).toBe(true);

    blocker.setActive(10, false);
    expect(blocker.isActive()).toBe(true);
    expect(stops).toEqual([]);
    blocker.release(20);
    expect(blocker.isActive()).toBe(false);
    expect(stops).toEqual([1]);

    blocker.setActive(30, true);
    expect(starts).toEqual([
      "prevent-app-suspension",
      "prevent-app-suspension",
    ]);
    blocker.dispose();
    expect(blocker.isActive()).toBe(false);
    expect(stops).toEqual([1, 2]);
  });
});
