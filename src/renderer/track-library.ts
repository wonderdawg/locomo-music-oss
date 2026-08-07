import type {
  LocomoMusicBridge,
  MusicTrack,
  MusicTrackAudio,
} from "../shared/app-contract";

type TrackLibraryBridge = Pick<LocomoMusicBridge, "list" | "read">;

export interface LazyTrackLibraryClient {
  listMetadata(): Promise<MusicTrack[]>;
  readAudio(id: string): Promise<MusicTrackAudio>;
}

export interface LatestRequestGate {
  begin(): number;
  cancel(): void;
  isCurrent(request: number): boolean;
}

export function createLazyTrackLibraryClient(
  bridge: TrackLibraryBridge,
): LazyTrackLibraryClient {
  const pendingAudio = new Map<string, Promise<MusicTrackAudio>>();

  return {
    listMetadata() {
      return bridge.list();
    },
    readAudio(id) {
      const existing = pendingAudio.get(id);
      if (existing) return existing;

      let request: Promise<MusicTrackAudio>;
      request = Promise.resolve()
        .then(() => bridge.read(id))
        .finally(() => {
          if (pendingAudio.get(id) === request) {
            pendingAudio.delete(id);
          }
        });
      pendingAudio.set(id, request);
      return request;
    },
  };
}

export function upsertCompletedTrack(
  tracks: readonly MusicTrack[],
  completed: MusicTrack,
): MusicTrack[] {
  return [
    completed,
    ...tracks.filter((track) => track.id !== completed.id),
  ];
}

export function markTrackPlayed(
  tracks: MusicTrack[],
  id: string,
): MusicTrack[] {
  let changed = false;
  const next = tracks.map((track) => {
    if (track.id !== id || track.isPlayed) return track;
    changed = true;
    return { ...track, isPlayed: true };
  });
  return changed ? next : tracks;
}

export function createLatestRequestGate(): LatestRequestGate {
  let current = 0;
  return {
    begin() {
      current += 1;
      return current;
    },
    cancel() {
      current += 1;
    },
    isCurrent(request) {
      return request === current;
    },
  };
}
