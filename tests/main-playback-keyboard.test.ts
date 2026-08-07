import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  handleMainPlaybackShortcut,
  revealPlaylistTrack,
  type MainPlaybackShortcutEvent,
} from "../src/renderer/main-playback-keyboard";

const categoryTracks = [
  { id: "category-first" },
  { id: "category-middle" },
  { id: "category-last" },
] as const;
const favoriteTracks = [
  { id: "favorite-newest" },
  { id: "favorite-oldest" },
] as const;

describe("main-window playback keyboard shortcuts", () => {
  it.each([
    ["playing to paused", true],
    ["paused to playing", false],
  ])("delegates Space through the existing toggle path: %s", (_, playing) => {
    const event = keyboardEvent({ code: "Space", key: " " });
    let isPlaying = playing;
    const playTrack = vi.fn(() => {
      isPlaying = !isPlaying;
    });

    expect(
      handleMainPlaybackShortcut(event, {
        currentTrack: categoryTracks[1],
        visibleTracks: categoryTracks,
        playTrack,
        revealTrack: vi.fn(),
      }),
    ).toBe(true);
    expect(playTrack).toHaveBeenCalledWith(categoryTracks[1]);
    expect(isPlaying).toBe(!playing);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("plays adjacent tracks immediately in the displayed order", () => {
    const down = keyboardEvent({ key: "ArrowDown" });
    const up = keyboardEvent({ key: "ArrowUp" });
    const playTrack = vi.fn();
    const revealTrack = vi.fn();
    const context = {
      currentTrack: categoryTracks[1],
      visibleTracks: categoryTracks,
      playTrack,
      revealTrack,
    };

    expect(handleMainPlaybackShortcut(down, context)).toBe(true);
    expect(playTrack).toHaveBeenLastCalledWith(categoryTracks[2]);
    expect(revealTrack).toHaveBeenLastCalledWith("category-last");
    expect(handleMainPlaybackShortcut(up, context)).toBe(true);
    expect(playTrack).toHaveBeenLastCalledWith(categoryTracks[0]);
    expect(revealTrack).toHaveBeenLastCalledWith("category-first");
  });

  it("uses the same visible-order behavior for Favorites", () => {
    const playTrack = vi.fn();
    const revealTrack = vi.fn();
    const event = keyboardEvent({ key: "ArrowDown" });

    expect(
      handleMainPlaybackShortcut(event, {
        currentTrack: favoriteTracks[0],
        visibleTracks: favoriteTracks,
        playTrack,
        revealTrack,
      }),
    ).toBe(true);
    expect(playTrack).toHaveBeenCalledWith(favoriteTracks[1]);
    expect(revealTrack).toHaveBeenCalledWith("favorite-oldest");
  });

  it("does not wrap at either playlist boundary", () => {
    const playTrack = vi.fn();
    const revealTrack = vi.fn();
    const firstEvent = keyboardEvent({ key: "ArrowUp" });
    const lastEvent = keyboardEvent({ key: "ArrowDown" });

    expect(
      handleMainPlaybackShortcut(firstEvent, {
        currentTrack: categoryTracks[0],
        visibleTracks: categoryTracks,
        playTrack,
        revealTrack,
      }),
    ).toBe(false);
    expect(
      handleMainPlaybackShortcut(lastEvent, {
        currentTrack: categoryTracks[2],
        visibleTracks: categoryTracks,
        playTrack,
        revealTrack,
      }),
    ).toBe(false);
    expect(playTrack).not.toHaveBeenCalled();
    expect(revealTrack).not.toHaveBeenCalled();
    expect(firstEvent.preventDefault).not.toHaveBeenCalled();
    expect(lastEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("ignores arrows without a current displayed playlist context", () => {
    const noCurrent = keyboardEvent({ key: "ArrowDown" });
    const currentNotVisible = keyboardEvent({ key: "ArrowDown" });
    const playTrack = vi.fn();
    const context = {
      currentTrack: undefined,
      visibleTracks: categoryTracks,
      playTrack,
      revealTrack: vi.fn(),
    };
    expect(handleMainPlaybackShortcut(noCurrent, context)).toBe(false);
    expect(
      handleMainPlaybackShortcut(currentNotVisible, {
        ...context,
        currentTrack: { id: "other-category" },
      }),
    ).toBe(false);
    expect(playTrack).not.toHaveBeenCalled();
    expect(noCurrent.preventDefault).not.toHaveBeenCalled();
    expect(currentNotVisible.preventDefault).not.toHaveBeenCalled();
  });

  it("ignores Space without a current track", () => {
    const event = keyboardEvent({ code: "Space", key: " " });
    const playTrack = vi.fn();
    expect(
      handleMainPlaybackShortcut(event, {
        currentTrack: undefined,
        visibleTracks: categoryTracks,
        playTrack,
        revealTrack: vi.fn(),
      }),
    ).toBe(false);
    expect(playTrack).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it.each([
    {
      event: { code: "Space", key: " " },
      name: "focused category-card button",
      selectorTokens: ["button", "[data-category-card]"],
      track: categoryTracks[1],
    },
    {
      event: { code: "Space", key: " " },
      name: "focused now-playing button",
      selectorTokens: ["button", "[data-now-playing-play]"],
      track: categoryTracks[1],
    },
    {
      event: { key: "ArrowDown" },
      name: "focused playlist-track button",
      selectorTokens: ["button", "[data-playlist-track-id]"],
      track: categoryTracks[2],
    },
  ])("handles playback keys from a $name", ({ event, selectorTokens, track }) => {
    const keyboard = keyboardEvent({
      ...event,
      target: shortcutTarget(...selectorTokens),
    });
    const playTrack = vi.fn();
    const revealTrack = vi.fn();

    expect(
      handleMainPlaybackShortcut(keyboard, {
        currentTrack: categoryTracks[1],
        visibleTracks: categoryTracks,
        playTrack,
        revealTrack,
      }),
    ).toBe(true);
    expect(playTrack).toHaveBeenCalledWith(track);
    if (event.key === "ArrowDown") {
      expect(revealTrack).toHaveBeenCalledWith(track.id);
    }
    expect(keyboard.preventDefault).toHaveBeenCalledOnce();
  });

  it.each([
    ["ordinary link", "a"],
    ["link role", '[role="link"]'],
    ["generic tabindex", "[tabindex]"],
  ])("does not suppress Space after focusing an %s", (_, selectorToken) => {
    const event = keyboardEvent({
      code: "Space",
      key: " ",
      target: shortcutTarget(selectorToken),
    });
    const playTrack = vi.fn();

    expect(
      handleMainPlaybackShortcut(event, {
        currentTrack: categoryTracks[0],
        visibleTracks: categoryTracks,
        playTrack,
        revealTrack: vi.fn(),
      }),
    ).toBe(true);
    expect(playTrack).toHaveBeenCalledWith(categoryTracks[0]);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it.each([
    ["text input", ["input"]],
    ["playback-position range", ["input", 'input[type="range"]']],
    ["textarea", ["textarea"]],
    ["select", ["select"]],
    ["summary", ["summary"]],
    [
      "editable content",
      ['[contenteditable]:not([contenteditable="false"])'],
    ],
    ["slider role", ['[role="slider"]']],
    ["dialog descendant", ['[role="dialog"]']],
    ["native dialog descendant", ["dialog"]],
    ["Settings descendant", ["[data-settings-surface]"]],
  ])("does not hijack playback keys from a %s", (_, selectorTokens) => {
    const event = keyboardEvent({
      code: "Space",
      key: " ",
      target: shortcutTarget(...selectorTokens),
    });
    const playTrack = vi.fn();
    expect(
      handleMainPlaybackShortcut(event, {
        currentTrack: categoryTracks[0],
        visibleTracks: categoryTracks,
        playTrack,
        revealTrack: vi.fn(),
      }),
    ).toBe(false);
    expect(playTrack).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it.each([
    { altKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { repeat: true },
    { defaultPrevented: true },
  ])("ignores modified, repeated, or previously handled keys", (overrides) => {
    const event = keyboardEvent({
      code: "Space",
      key: " ",
      ...overrides,
    });
    const playTrack = vi.fn();
    expect(
      handleMainPlaybackShortcut(event, {
        currentTrack: categoryTracks[0],
        visibleTracks: categoryTracks,
        playTrack,
        revealTrack: vi.fn(),
      }),
    ).toBe(false);
    expect(playTrack).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("reveals only the matching adjacent row using nearest scrolling", () => {
    const first = playlistRow("first");
    const adjacent = playlistRow("adjacent");
    const last = playlistRow("last");

    expect(
      revealPlaylistTrack([first, adjacent, last], "adjacent"),
    ).toBe(true);
    expect(adjacent.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
    });
    expect(first.scrollIntoView).not.toHaveBeenCalled();
    expect(last.scrollIntoView).not.toHaveBeenCalled();
    expect(revealPlaylistTrack([first, last], "missing")).toBe(false);
  });

  it("wires only the main studio playback path without category or generation side effects", async () => {
    const source = await readFile(
      new URL("../src/renderer/LocomoMusicStudio.tsx", import.meta.url),
      "utf8",
    );
    const handlerStart = source.indexOf(
      "const handlePlaybackKeyboard = (event: KeyboardEvent) => {",
    );
    const handlerEnd = source.indexOf(
      "const handleOvernightStorage",
      handlerStart,
    );
    const handler = source.slice(handlerStart, handlerEnd);
    const playStart = source.indexOf("const play = async (track: MusicTrack)");
    const playEnd = source.indexOf("const downloadTrack", playStart);
    const play = source.slice(playStart, playEnd);

    expect(handler).toContain("handleMainPlaybackShortcut(event");
    expect(handler).toContain("visibleTracks: stationTracks()");
    expect(handler).toContain("playTrack: (track) => void play(track)");
    expect(handler).toContain("revealPlaylistTrack(");
    expect(handler).not.toContain("selectStation");
    expect(handler).not.toContain("setSelectionKey");
    expect(handler).not.toContain("generate(");
    expect(source).toContain("handledPlaybackKeyboardEvents.add(event)");
    expect(source).toContain(
      "if (handledPlaybackKeyboardEvents.has(event)) return",
    );
    expect(source).toContain(
      '"keydown",\n      handlePlaybackKeyboard,\n      true,',
    );
    expect(source).not.toContain(
      'window.addEventListener("keydown", handlePlaybackKeyboard)',
    );
    expect(source).toContain("data-playlist-track-id={track.id}");
    expect(play).toContain("if (playing() === track.id)");
    expect(play).toContain("audio.pause()");
    expect(play).toContain("await audio.play()");
  });
});

function keyboardEvent(
  overrides: Partial<MainPlaybackShortcutEvent> = {},
): MainPlaybackShortcutEvent {
  return {
    altKey: false,
    code: "",
    ctrlKey: false,
    defaultPrevented: false,
    key: "",
    metaKey: false,
    preventDefault: vi.fn(),
    repeat: false,
    target: null,
    ...overrides,
  };
}

function shortcutTarget(...selectorTokens: string[]): EventTarget {
  return {
    closest(selector: string) {
      return selector
        .split(",")
        .map((candidate) => candidate.trim())
        .some((candidate) => selectorTokens.includes(candidate))
        ? this
        : null;
    },
  } as unknown as EventTarget;
}

function playlistRow(id: string) {
  return {
    dataset: { playlistTrackId: id },
    scrollIntoView: vi.fn(),
  };
}
