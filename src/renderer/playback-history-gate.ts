export interface PlaybackHistoryGate {
  ended(trackID: string | undefined): void;
  released(trackID?: string): void;
  started(trackID: string | undefined): boolean;
}

export function createPlaybackHistoryGate(
  markPlayed: (trackID: string) => void,
): PlaybackHistoryGate {
  let markedTrackID: string | undefined;

  return {
    ended(trackID) {
      if (trackID === markedTrackID) markedTrackID = undefined;
    },
    released(trackID) {
      if (trackID === undefined || trackID === markedTrackID) {
        markedTrackID = undefined;
      }
    },
    started(trackID) {
      if (!trackID || markedTrackID === trackID) return false;
      markedTrackID = trackID;
      markPlayed(trackID);
      return true;
    },
  };
}
