import type {
  MusicAudioFormat,
  MusicTrack,
  MusicTrackAudio,
} from "../shared/app-contract";

export function canonicalAudioBadge(
  format: MusicAudioFormat,
): "AAC" | undefined {
  return format === "aac" ? "AAC" : undefined;
}

export function trackDownloadFileName(
  track: Pick<MusicTrack, "fileExtension" | "prompt">,
): string {
  const stem =
    track.prompt.slice(0, 48).replaceAll(/[^a-z0-9]+/gi, "-") ||
    "locomo-track";
  return `${stem}${track.fileExtension}`;
}

export function createTrackAudioBlob(
  audio: Pick<MusicTrackAudio, "bytes" | "mimeType">,
): Blob {
  return new Blob([audio.bytes], { type: audio.mimeType });
}

export function runDownloadSongAction<Result>(
  event: Pick<MouseEvent, "stopPropagation">,
  download: () => Result,
): Result {
  event.stopPropagation();
  return download();
}
