import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  assertTrustedIpcSender,
  createTrustedIpcMain,
  type IpcSenderEvent,
  type IpcSenderTrustOptions,
  UNTRUSTED_IPC_SENDER_ERROR_MESSAGE,
} from "../src/main/ipc-sender-trust";
import {
  INVALID_PRIVILEGED_IPC_PAYLOAD_ERROR_MESSAGE,
  PRIVILEGED_IPC_PAYLOAD_CHANNELS,
} from "../src/main/ipc-payload-validation";
import { IPC_CHANNELS } from "../src/shared/app-contract";

const bundledRendererPath =
  "/Applications/Locomo Music OSS.app/Contents/Resources/app.asar/dist-renderer/index.html";
const packagedOptions: IpcSenderTrustOptions = {
  bundledRendererPath,
  isPackaged: true,
  rendererDevelopmentUrl: undefined,
};
const developmentOptions: IpcSenderTrustOptions = {
  bundledRendererPath,
  isPackaged: false,
  rendererDevelopmentUrl: "http://localhost:5173/",
};

interface TestFrame {
  destroyed: boolean;
  detached: boolean;
  frameTreeNodeId: number;
  isDestroyed(): boolean;
  origin: string;
  parent: TestFrame | null;
  processId: number;
  routingId: number;
  top: TestFrame | null;
  url: string;
}

interface TestSender {
  currentUrl: string;
  destroyed: boolean;
  getURL(): string;
  isDestroyed(): boolean;
  mainFrame: TestFrame;
}

interface TestEvent extends IpcSenderEvent {
  frameId: number;
  processId: number;
  sender: TestSender | undefined;
  senderFrame: TestFrame | null;
}

interface SenderFixture {
  event: TestEvent;
  frame: TestFrame;
  sender: TestSender;
}

function createFrame(
  url: string,
  overrides: Partial<
    Pick<
      TestFrame,
      "frameTreeNodeId" | "origin" | "processId" | "routingId"
    >
  > = {},
): TestFrame {
  const frame: TestFrame = {
    destroyed: false,
    detached: false,
    frameTreeNodeId: overrides.frameTreeNodeId ?? 41,
    isDestroyed() {
      return this.destroyed;
    },
    origin: overrides.origin ?? rendererOrigin(url),
    parent: null,
    processId: overrides.processId ?? 7,
    routingId: overrides.routingId ?? 11,
    top: null,
    url,
  };
  frame.top = frame;
  return frame;
}

function createSenderFixture(
  url: string,
  overrides: Parameters<typeof createFrame>[1] = {},
): SenderFixture {
  const frame = createFrame(url, overrides);
  const sender: TestSender = {
    currentUrl: url,
    destroyed: false,
    getURL() {
      return this.currentUrl;
    },
    isDestroyed() {
      return this.destroyed;
    },
    mainFrame: frame,
  };
  return {
    event: {
      frameId: frame.routingId,
      processId: frame.processId,
      sender,
      senderFrame: frame,
    },
    frame,
    sender,
  };
}

function rendererOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "null";
  }
}

function expectTrusted(
  event: IpcSenderEvent,
  options: IpcSenderTrustOptions,
): void {
  expect(() => assertTrustedIpcSender(event, options)).not.toThrow();
}

function expectRejected(
  event: IpcSenderEvent,
  options: IpcSenderTrustOptions,
): void {
  expect(() => assertTrustedIpcSender(event, options)).toThrow(
    UNTRUSTED_IPC_SENDER_ERROR_MESSAGE,
  );
}

describe("privileged IPC sender trust", () => {
  const packagedMainUrl = pathToFileURL(bundledRendererPath).toString();
  const packagedSettingsUrl = new URL(packagedMainUrl);
  packagedSettingsUrl.searchParams.set("view", "settings");

  it.each([
    ["main", packagedMainUrl],
    ["Settings", packagedSettingsUrl.toString()],
  ])("accepts the packaged %s renderer", (_view, url) => {
    expectTrusted(
      createSenderFixture(url, { origin: "file://" }).event,
      packagedOptions,
    );
  });

  it.each([
    ["http://localhost:5173/", "http://localhost:5173/renderer"],
    ["http://127.0.0.1:4173/", "http://127.0.0.1:4173/?view=settings"],
    ["http://[::1]:8080/", "http://[::1]:8080/dev/renderer"],
  ])(
    "accepts the configured loopback development origin %s",
    (rendererDevelopmentUrl, senderUrl) => {
      expectTrusted(createSenderFixture(senderUrl).event, {
        ...developmentOptions,
        rendererDevelopmentUrl,
      });
    },
  );

  it.each([
    ["remote HTTP", "http://remote.example/renderer"],
    ["remote HTTPS", "https://remote.example/renderer"],
    ["loopback HTTPS", "https://localhost:5173/renderer"],
    ["different loopback port", "http://localhost:5174/renderer"],
    ["credential-bearing", "http://user:password@localhost:5173/renderer"],
    ["malformed", "not a URL"],
  ])("rejects a %s development sender", (_case, url) => {
    expectRejected(createSenderFixture(url).event, developmentOptions);
  });

  it.each([
    ["wrong file", "file:///tmp/dist-renderer/index.html"],
    ["unexpected view", `${packagedMainUrl}?view=unexpected`],
  ])("rejects a packaged sender with the %s", (_case, url) => {
    expectRejected(
      createSenderFixture(url, { origin: "file://" }).event,
      packagedOptions,
    );
  });

  it("rejects the packaged path with an unexpected frame origin", () => {
    expectRejected(createSenderFixture(packagedMainUrl).event, packagedOptions);
  });

  it("rejects a subframe", () => {
    const fixture = createSenderFixture("http://localhost:5173/");
    const mainFrame = createFrame("http://localhost:5173/", {
      frameTreeNodeId: 99,
      routingId: 19,
    });
    fixture.frame.parent = mainFrame;
    fixture.frame.top = mainFrame;
    fixture.sender.mainFrame = mainFrame;

    expectRejected(fixture.event, developmentOptions);
  });

  it.each([
    ["event frame ID", (fixture: SenderFixture) => {
      fixture.event.frameId += 1;
    }],
    ["event process ID", (fixture: SenderFixture) => {
      fixture.event.processId += 1;
    }],
    ["WebContents main frame", (fixture: SenderFixture) => {
      fixture.sender.mainFrame = createFrame(fixture.frame.url, {
        frameTreeNodeId: 99,
        routingId: 19,
      });
    }],
    ["WebContents URL", (fixture: SenderFixture) => {
      fixture.sender.currentUrl = "http://localhost:5173/stale";
    }],
    ["frame origin", (fixture: SenderFixture) => {
      fixture.frame.origin = "https://remote.example";
    }],
  ])("rejects a mismatched %s", (_case, mutate) => {
    const fixture = createSenderFixture("http://localhost:5173/");
    mutate(fixture);
    expectRejected(fixture.event, developmentOptions);
  });

  it.each([
    ["missing frame", (fixture: SenderFixture) => {
      fixture.event.senderFrame = null;
    }],
    ["missing WebContents", (fixture: SenderFixture) => {
      fixture.event.sender = undefined;
    }],
    ["destroyed frame", (fixture: SenderFixture) => {
      fixture.frame.destroyed = true;
    }],
    ["detached frame", (fixture: SenderFixture) => {
      fixture.frame.detached = true;
    }],
    ["destroyed WebContents", (fixture: SenderFixture) => {
      fixture.sender.destroyed = true;
    }],
  ])("rejects a stale or %s", (_case, mutate) => {
    const fixture = createSenderFixture("http://localhost:5173/");
    mutate(fixture);
    expectRejected(fixture.event, developmentOptions);
  });

  it("guards handle and on callbacks before privileged work", () => {
    const invokeHandlers = new Map<string, (...args: any[]) => any>();
    const eventHandlers = new Map<string, (...args: any[]) => any>();
    const ipcMain = createTrustedIpcMain(
      {
        handle: (channel, listener) => {
          invokeHandlers.set(channel, listener);
        },
        on: (channel, listener) => {
          eventHandlers.set(channel, listener);
        },
      },
      developmentOptions,
    );
    const invokeWork = vi.fn((_event: unknown, value: string) => value);
    const eventWork = vi.fn();
    ipcMain.handle(IPC_CHANNELS.readTrack, invokeWork);
    ipcMain.on(IPC_CHANNELS.readTrack, eventWork);
    const invoke = invokeHandlers.get(IPC_CHANNELS.readTrack);
    const send = eventHandlers.get(IPC_CHANNELS.readTrack);
    if (!invoke || !send) throw new Error("Test IPC handlers were not registered.");
    const trustedEvent = createSenderFixture("http://localhost:5173/").event;
    const trackID = "123e4567-e89b-42d3-a456-426614174000";
    expect(invoke(trustedEvent, trackID)).toBe(trackID);
    send(trustedEvent, trackID);
    expect(invokeWork).toHaveBeenCalledOnce();
    expect(eventWork).toHaveBeenCalledOnce();
    invokeWork.mockClear();
    eventWork.mockClear();
    const rejectedEvent = createSenderFixture(
      "https://remote.example/renderer",
    ).event;

    expect(() => invoke(rejectedEvent, trackID)).toThrow(
      UNTRUSTED_IPC_SENDER_ERROR_MESSAGE,
    );
    expect(() => send(rejectedEvent, trackID)).not.toThrow();
    expect(invokeWork).not.toHaveBeenCalled();
    expect(eventWork).not.toHaveBeenCalled();

    expect(() => invoke(trustedEvent, "not-a-track-id")).toThrow(
      INVALID_PRIVILEGED_IPC_PAYLOAD_ERROR_MESSAGE,
    );
    expect(() => send(trustedEvent, "not-a-track-id")).not.toThrow();
    expect(invokeWork).not.toHaveBeenCalled();
    expect(eventWork).not.toHaveBeenCalled();
  });

  it("routes all 18 renderer-to-main registrations through the guard", async () => {
    const mainDirectory = new URL("../src/main/", import.meta.url);
    const entries = await readdir(mainDirectory, { withFileTypes: true });
    const sources = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
        .map(async (entry) => [
          entry.name,
          await readFile(new URL(entry.name, mainDirectory), "utf8"),
        ] as const),
    );
    const rawRegistrations: string[] = [];
    for (const [file, source] of sources) {
      for (const importMatch of source.matchAll(
        /import\s*{([\s\S]*?)}\s*from\s*"electron";/g,
      )) {
        for (const specifier of (importMatch[1] ?? "").split(",")) {
          const ipcMainImport = /^ipcMain(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(
            specifier.trim(),
          );
          if (!ipcMainImport) continue;
          const alias = ipcMainImport[1] ?? "ipcMain";
          const registrationPattern = new RegExp(
            `\\b${alias}\\.(?:handle|on)\\s*\\(`,
            "g",
          );
          if (registrationPattern.test(source)) {
            rawRegistrations.push(`${file}:${alias}`);
          }
        }
      }
    }
    expect(rawRegistrations).toEqual([]);

    const main = sources.find(([file]) => file === "main.ts")?.[1];
    if (!main) throw new Error("Could not read the main process entry point.");
    expect(main).toContain(
      "const ipcMain = createTrustedIpcMain(electronIpcMain, {",
    );
    const registrations = Array.from(
      main.matchAll(
        /\bipcMain\.(handle|on)\s*\(\s*IPC_CHANNELS\.([A-Za-z0-9_]+)/g,
      ),
      (match) => ({ kind: match[1], channel: match[2] }),
    );
    expect(registrations).toHaveLength(18);
    expect(registrations.filter(({ kind }) => kind === "handle")).toHaveLength(
      18,
    );
    expect(registrations.filter(({ kind }) => kind === "on")).toHaveLength(0);
    expect(new Set(registrations.map(({ channel }) => channel)).size).toBe(18);
    const registeredChannelValues = registrations.map(
      ({ channel }) =>
        IPC_CHANNELS[channel as keyof typeof IPC_CHANNELS],
    );
    expect(new Set(registeredChannelValues)).toEqual(
      new Set(PRIVILEGED_IPC_PAYLOAD_CHANNELS),
    );

    const preload = await readFile(
      new URL("../src/preload/preload.ts", import.meta.url),
      "utf8",
    );
    const rendererToMainChannels = new Set(
      Array.from(
        preload.matchAll(
          /\bipcRenderer\.(?:invoke|send)\s*\(\s*IPC_CHANNELS\.([A-Za-z0-9_]+)/g,
        ),
        (match) => match[1],
      ),
    );
    expect(new Set(registrations.map(({ channel }) => channel))).toEqual(
      rendererToMainChannels,
    );
  });
});
