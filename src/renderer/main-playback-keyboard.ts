const playbackShortcutBlockedTargetSelector = [
  "input",
  "textarea",
  "select",
  "summary",
  "audio",
  "video",
  "dialog",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="option"]',
  '[role="dialog"]',
  '[aria-modal="true"]',
  "[data-settings-surface]",
].join(",");

export type MainPlaybackShortcutTrack = {
  readonly id: string;
};

export type MainPlaybackShortcutEvent = {
  readonly altKey: boolean;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly defaultPrevented: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly repeat: boolean;
  readonly target: EventTarget | null;
  preventDefault(): void;
};

export type MainPlaybackShortcutContext<
  Track extends MainPlaybackShortcutTrack,
> = {
  readonly currentTrack: Track | undefined;
  readonly visibleTracks: readonly Track[];
  playTrack(track: Track): void;
  revealTrack(trackID: string): void;
};

export function handleMainPlaybackShortcut<
  Track extends MainPlaybackShortcutTrack,
>(
  event: MainPlaybackShortcutEvent,
  context: MainPlaybackShortcutContext<Track>,
): boolean {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    isPlaybackShortcutBlockedTarget(event.target)
  ) {
    return false;
  }

  const current = context.currentTrack;
  if (!current) return false;

  const space = event.key === " " || event.code === "Space";
  if (space) {
    event.preventDefault();
    context.playTrack(current);
    return true;
  }

  const direction =
    event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowUp"
        ? -1
        : 0;
  if (direction === 0) return false;
  const currentIndex = context.visibleTracks.findIndex(
    (track) => track.id === current.id,
  );
  if (currentIndex < 0) return false;
  const adjacent = context.visibleTracks[currentIndex + direction];
  if (!adjacent) return false;

  event.preventDefault();
  context.playTrack(adjacent);
  context.revealTrack(adjacent.id);
  return true;
}

export type PlaylistTrackRow = {
  readonly dataset: { readonly playlistTrackId?: string };
  scrollIntoView(options?: ScrollIntoViewOptions): void;
};

export function revealPlaylistTrack(
  rows: Iterable<PlaylistTrackRow>,
  trackID: string,
): boolean {
  const row = [...rows].find(
    (candidate) => candidate.dataset.playlistTrackId === trackID,
  );
  if (!row) return false;
  row.scrollIntoView({ block: "nearest" });
  return true;
}

function isPlaybackShortcutBlockedTarget(target: EventTarget | null): boolean {
  const candidate = target as
    | { closest?: (selector: string) => unknown }
    | null;
  return (
    typeof candidate?.closest === "function" &&
    candidate.closest(playbackShortcutBlockedTargetSelector) != null
  );
}
