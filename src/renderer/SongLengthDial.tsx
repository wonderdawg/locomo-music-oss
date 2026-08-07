import { For } from "solid-js";

export const SONG_DURATION_STORAGE_KEY =
  "locomo-music:song-duration-minutes" as const;
export const SONG_DURATION_MINUTES_MIN = 1 as const;
export const SONG_DURATION_MINUTES_MAX = 10 as const;
export const SONG_DURATION_DEFAULT_MINUTES = 2 as const;
export const SONG_DURATION_MINUTE_OPTIONS = [
  1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10,
] as const;

export interface SongDurationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function isSongDurationMinutes(value: unknown): value is number {
  return SONG_DURATION_MINUTE_OPTIONS.some(
    (minutes) => minutes === value,
  );
}

export function readSongDurationMinutes(
  storage: SongDurationStorage,
): number {
  try {
    const saved = storage.getItem(SONG_DURATION_STORAGE_KEY);
    if (saved === null || saved.trim() === "") {
      return SONG_DURATION_DEFAULT_MINUTES;
    }
    const minutes = Number(saved);
    return isSongDurationMinutes(minutes)
      ? minutes
      : SONG_DURATION_DEFAULT_MINUTES;
  } catch {
    return SONG_DURATION_DEFAULT_MINUTES;
  }
}

export function writeSongDurationMinutes(
  storage: SongDurationStorage,
  minutes: number,
): void {
  if (!isSongDurationMinutes(minutes)) {
    throw new Error(
      "Song length must be a whole number from 1 to 10 minutes or exactly 1.5 or 2.5 minutes.",
    );
  }
  storage.setItem(SONG_DURATION_STORAGE_KEY, String(minutes));
}

const SONG_LENGTH_DIAL_MIN_ANGLE = -135;
const SONG_LENGTH_DIAL_MAX_ANGLE = 135;

export function formatSongDuration(minutes: number): string {
  return `${minutes} min.`;
}

export function songDurationDialAngle(minutes: number): number {
  const range = SONG_DURATION_MINUTES_MAX - SONG_DURATION_MINUTES_MIN;
  return (
    SONG_LENGTH_DIAL_MIN_ANGLE +
    ((minutes - SONG_DURATION_MINUTES_MIN) / range) *
      (SONG_LENGTH_DIAL_MAX_ANGLE - SONG_LENGTH_DIAL_MIN_ANGLE)
  );
}

export function songDurationAtPoint(input: {
  readonly centerX: number;
  readonly centerY: number;
  readonly pointerX: number;
  readonly pointerY: number;
}): number {
  let angle =
    (Math.atan2(
      input.pointerY - input.centerY,
      input.pointerX - input.centerX,
    ) *
      180) /
      Math.PI +
    90;
  if (angle > 180) angle -= 360;
  const clamped = Math.max(
    SONG_LENGTH_DIAL_MIN_ANGLE,
    Math.min(SONG_LENGTH_DIAL_MAX_ANGLE, angle),
  );
  const ratio =
    (clamped - SONG_LENGTH_DIAL_MIN_ANGLE) /
    (SONG_LENGTH_DIAL_MAX_ANGLE - SONG_LENGTH_DIAL_MIN_ANGLE);
  const pointedMinutes =
    SONG_DURATION_MINUTES_MIN +
    ratio *
      (SONG_DURATION_MINUTES_MAX - SONG_DURATION_MINUTES_MIN);
  return SONG_DURATION_MINUTE_OPTIONS.reduce<number>(
    (nearest, option) =>
      Math.abs(option - pointedMinutes) <
      Math.abs(nearest - pointedMinutes)
        ? option
        : nearest,
    SONG_DURATION_MINUTE_OPTIONS[0],
  );
}

export function songDurationAfterArrowKey(
  minutes: number,
  key: string,
): number | undefined {
  const currentIndex = SONG_DURATION_MINUTE_OPTIONS.findIndex(
    (option) => option === minutes,
  );
  if (currentIndex < 0) return undefined;
  if (key === "ArrowUp" || key === "ArrowRight") {
    return (
      SONG_DURATION_MINUTE_OPTIONS[
        Math.min(
          SONG_DURATION_MINUTE_OPTIONS.length - 1,
          currentIndex + 1,
        )
      ] ?? minutes
    );
  }
  if (key === "ArrowDown" || key === "ArrowLeft") {
    return (
      SONG_DURATION_MINUTE_OPTIONS[
        Math.max(0, currentIndex - 1)
      ] ?? minutes
    );
  }
  return undefined;
}

const MINUTE_TICKS = SONG_DURATION_MINUTE_OPTIONS;

export function SongLengthDial(props: {
  readonly minutes: number;
  readonly onChange: (minutes: number) => void;
}) {
  let activePointer: number | undefined;

  const selectAtPointer = (
    element: HTMLDivElement,
    event: PointerEvent,
  ) => {
    const bounds = element.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    if (Math.hypot(event.clientX - centerX, event.clientY - centerY) < 20) {
      return;
    }
    props.onChange(
      songDurationAtPoint({
        centerX,
        centerY,
        pointerX: event.clientX,
        pointerY: event.clientY,
      }),
    );
  };

  return (
    <div
      class="song-length-dial"
      data-song-length-dial
      role="slider"
      tabIndex={0}
      aria-label="Song length"
      aria-valuemin={SONG_DURATION_MINUTES_MIN}
      aria-valuemax={SONG_DURATION_MINUTES_MAX}
      aria-valuenow={props.minutes}
      aria-valuetext={`${props.minutes} minutes`}
      onKeyDown={(event) => {
        const next = songDurationAfterArrowKey(
          props.minutes,
          event.key,
        );
        if (next === undefined) return;
        event.preventDefault();
        props.onChange(next);
      }}
      onPointerDown={(event) => {
        activePointer = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        selectAtPointer(event.currentTarget, event);
      }}
      onPointerMove={(event) => {
        if (event.pointerId !== activePointer) return;
        selectAtPointer(event.currentTarget, event);
      }}
      onPointerUp={(event) => {
        if (event.pointerId !== activePointer) return;
        selectAtPointer(event.currentTarget, event);
        activePointer = undefined;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        activePointer = undefined;
      }}
      onLostPointerCapture={() => {
        activePointer = undefined;
      }}
    >
      <span class="song-length-dial__ticks" aria-hidden="true">
        <For each={MINUTE_TICKS}>
          {(minutes) => (
            <span
              class="song-length-dial__tick"
              classList={{
                "song-length-dial__tick--selected":
                  minutes === props.minutes,
              }}
              style={{
                transform: `translate(-50%, -50%) rotate(${songDurationDialAngle(minutes)}deg) translateY(-44px)`,
              }}
            />
          )}
        </For>
      </span>
      <span class="song-length-dial__knob" aria-hidden="true">
        <span
          class="song-length-dial__indicator"
          style={{
            transform: `rotate(${songDurationDialAngle(props.minutes)}deg)`,
          }}
        >
          <span />
        </span>
      </span>
      <span class="song-length-dial__value" aria-hidden="true">
        {formatSongDuration(props.minutes)}
      </span>
    </div>
  );
}
