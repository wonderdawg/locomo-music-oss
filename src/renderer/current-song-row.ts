export function isCurrentSongRow(
  trackID: string,
  selectedTrackID: string | undefined,
) {
  return trackID === selectedTrackID;
}

export function formatSongRowDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
