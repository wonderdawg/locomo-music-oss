import { pathToFileURL } from "node:url";

import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";

import { assertValidPrivilegedIpcPayload } from "./ipc-payload-validation";
import { resolveRendererDevelopmentUrl } from "./renderer-development-url";

export const UNTRUSTED_IPC_SENDER_ERROR_MESSAGE =
  "Blocked privileged IPC from an untrusted renderer.";
const PACKAGED_RENDERER_ORIGIN = "file://";

export interface IpcSenderTrustOptions {
  readonly bundledRendererPath: string;
  readonly isPackaged: boolean;
  readonly rendererDevelopmentUrl: string | undefined;
}

interface IpcSenderFrame {
  readonly detached: boolean;
  readonly frameTreeNodeId: number;
  isDestroyed(): boolean;
  readonly origin: string;
  readonly parent: IpcSenderFrame | null;
  readonly processId: number;
  readonly routingId: number;
  readonly top: IpcSenderFrame | null;
  readonly url: string;
}

interface IpcSenderWebContents {
  getURL(): string;
  isDestroyed(): boolean;
  readonly mainFrame: IpcSenderFrame;
}

export interface IpcSenderEvent {
  readonly frameId?: number;
  readonly processId?: number;
  readonly sender?: IpcSenderWebContents | null;
  readonly senderFrame?: IpcSenderFrame | null;
}

type InvokeHandler = (
  event: IpcMainInvokeEvent,
  ...args: any[]
) => Promise<any> | any;
type EventHandler = (event: IpcMainEvent, ...args: any[]) => void;

interface IpcMainRegistrationAdapter {
  handle(channel: string, listener: InvokeHandler): void;
  on(channel: string, listener: EventHandler): unknown;
}

export interface TrustedIpcMain {
  handle(channel: string, listener: InvokeHandler): void;
  on(channel: string, listener: EventHandler): void;
}

export function assertTrustedIpcSender(
  event: IpcSenderEvent,
  options: IpcSenderTrustOptions,
): void {
  let trusted = false;
  try {
    trusted = isTrustedIpcSender(event, options);
  } catch {
    trusted = false;
  }
  if (!trusted) {
    throw new Error(UNTRUSTED_IPC_SENDER_ERROR_MESSAGE);
  }
}

export function createTrustedIpcMain(
  electronIpcMain: IpcMainRegistrationAdapter,
  options: IpcSenderTrustOptions,
): TrustedIpcMain {
  return {
    handle: (channel, listener) => {
      electronIpcMain.handle(channel, (event, ...args) => {
        assertTrustedIpcSender(event, options);
        assertValidPrivilegedIpcPayload(channel, args);
        return listener(event, ...args);
      });
    },
    on: (channel, listener) => {
      electronIpcMain.on(channel, (event, ...args) => {
        try {
          assertTrustedIpcSender(event, options);
          assertValidPrivilegedIpcPayload(channel, args);
        } catch {
          // Fire-and-forget IPC has no reply path, so reject by dropping it.
          return;
        }
        listener(event, ...args);
      });
    },
  };
}

function isTrustedIpcSender(
  event: IpcSenderEvent,
  options: IpcSenderTrustOptions,
): boolean {
  const sender = event.sender;
  const frame = event.senderFrame;
  if (!sender || !frame || sender.isDestroyed()) return false;
  if (frame.isDestroyed() || frame.detached || frame.parent !== null) {
    return false;
  }

  const mainFrame = sender.mainFrame;
  if (
    !mainFrame ||
    mainFrame.isDestroyed() ||
    mainFrame.detached ||
    mainFrame.parent !== null ||
    !frame.top ||
    !mainFrame.top
  ) {
    return false;
  }
  if (
    !isSameFrame(frame, mainFrame) ||
    !isSameFrame(frame, frame.top) ||
    !isSameFrame(mainFrame, mainFrame.top)
  ) {
    return false;
  }
  if (
    event.processId !== frame.processId ||
    event.frameId !== frame.routingId ||
    mainFrame.url !== frame.url ||
    mainFrame.origin !== frame.origin ||
    sender.getURL() !== frame.url
  ) {
    return false;
  }

  return isExpectedRendererLocation(frame.url, frame.origin, options);
}

function isSameFrame(left: IpcSenderFrame, right: IpcSenderFrame): boolean {
  return (
    left.frameTreeNodeId === right.frameTreeNodeId &&
    left.processId === right.processId &&
    left.routingId === right.routingId
  );
}

function isExpectedRendererLocation(
  frameUrl: string,
  frameOrigin: string,
  options: IpcSenderTrustOptions,
): boolean {
  if (options.isPackaged) {
    const mainUrl = pathToFileURL(options.bundledRendererPath).toString();
    const settingsUrl = new URL(mainUrl);
    settingsUrl.searchParams.set("view", "settings");
    const canonicalFrameUrl = new URL(frameUrl).toString();
    return (
      canonicalFrameUrl === frameUrl &&
      (canonicalFrameUrl === mainUrl ||
        canonicalFrameUrl === settingsUrl.toString()) &&
      frameOrigin === PACKAGED_RENDERER_ORIGIN
    );
  }

  const expectedDevelopmentUrl = resolveRendererDevelopmentUrl(
    options.rendererDevelopmentUrl,
    false,
  );
  const senderDevelopmentUrl = resolveRendererDevelopmentUrl(
    frameUrl,
    false,
  );
  if (!expectedDevelopmentUrl || !senderDevelopmentUrl) return false;
  if (senderDevelopmentUrl !== frameUrl) return false;

  const expectedOrigin = new URL(expectedDevelopmentUrl).origin;
  const senderOrigin = new URL(senderDevelopmentUrl).origin;
  return senderOrigin === expectedOrigin && frameOrigin === senderOrigin;
}
