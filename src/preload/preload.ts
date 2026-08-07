import { contextBridge, ipcRenderer } from "electron";

import {
  IPC_CHANNELS,
  type LocomoMusicBridge,
  type MemoryStatus,
  type MusicTrackAudio,
  type OvernightSystemStatus,
} from "../shared/app-contract";

const bridge = {
  copyDiagnostics: () =>
    ipcRenderer.invoke(IPC_CHANNELS.copyDiagnostics),
  expandWindow: () => ipcRenderer.invoke(IPC_CHANNELS.expandWindow),
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo),
  getMemoryStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getMemoryStatus),
  getOvernightSystemStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getOvernightSystemStatus),
  getRuntimeSetupStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getRuntimeSetupStatus),
  getTrackGenerationDetails: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.getTrackGenerationDetails, id),
  onMemoryStatus: (callback) => {
    const handler = (_event: unknown, status: MemoryStatus) =>
      callback(status);
    ipcRenderer.on(IPC_CHANNELS.memoryStatus, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.memoryStatus, handler);
  },
  onOvernightSystemStatus: (callback) => {
    const handler = (
      _event: unknown,
      status: OvernightSystemStatus,
    ) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.overnightSystemStatus, handler);
    return () =>
      ipcRenderer.removeListener(
        IPC_CHANNELS.overnightSystemStatus,
        handler,
      );
  },
  retryLocalModel: () =>
    ipcRenderer.invoke(IPC_CHANNELS.retryLocalModel),
  startRuntimeSetup: () =>
    ipcRenderer.invoke(IPC_CHANNELS.startRuntimeSetup),
  prepare: () => ipcRenderer.invoke(IPC_CHANNELS.prepareMusic),
  generate: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateTrack, input),
  list: () => ipcRenderer.invoke(IPC_CHANNELS.listTracks),
  read: async (id): Promise<MusicTrackAudio> => {
    const value = (await ipcRenderer.invoke(
      IPC_CHANNELS.readTrack,
      id,
    )) as Omit<MusicTrackAudio, "bytes"> & {
      readonly bytes: ArrayBuffer | Uint8Array;
    };

    return {
      audioFormat: value.audioFormat,
      bytes:
        value.bytes instanceof ArrayBuffer
          ? value.bytes
          : (value.bytes.buffer.slice(
              value.bytes.byteOffset,
              value.bytes.byteOffset + value.bytes.byteLength,
            ) as ArrayBuffer),
      fileExtension: value.fileExtension,
      mimeType: value.mimeType,
    };
  },
  delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteTrack, id),
  setFavorite: (id, isFavorite) =>
    ipcRenderer.invoke(IPC_CHANNELS.setTrackFavorite, id, isFavorite),
  trackPlaybackStarted: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.trackPlaybackStarted, id),
  setOvernightGenerationActive: (active) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.setOvernightGenerationActive,
      active,
    ),
  setTrackDetailsPaneOpen: (open) =>
    ipcRenderer.invoke(IPC_CHANNELS.setTrackDetailsPaneOpen, open),
} satisfies LocomoMusicBridge;

contextBridge.exposeInMainWorld("locomoMusic", Object.freeze(bridge));
