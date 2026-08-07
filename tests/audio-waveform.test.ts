import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  attachLiveAudioWaveform,
  createEnergyContourState,
  NOW_PLAYING_WAVEFORM_AMPLITUDE,
  NOW_PLAYING_WAVEFORM_HEIGHT,
  NOW_PLAYING_WAVEFORM_POINT_COUNT,
  NOW_PLAYING_WAVEFORM_WIDTH,
  resetEnergyContour,
  updateEnergyContour,
  type LiveAudioWaveformRuntime,
} from "../src/renderer/audio-waveform";

describe("Beat-responsive Quiet Breath Now Playing visualizer", () => {
  it("builds a deterministic contour from energy changes, not raw phase", () => {
    const positiveState = createEnergyContourState();
    const invertedState = createEnergyContourState();
    const quiet = signal(0.08);
    const loud = signal(0.8);

    updateEnergyContour(quiet, positiveState);
    updateEnergyContour(invert(quiet), invertedState);
    const positive = updateEnergyContour(loud, positiveState);
    const inverted = updateEnergyContour(invert(loud), invertedState);

    expect(Array.from(positive)).toEqual(Array.from(inverted));
    expect(positive).toHaveLength(NOW_PLAYING_WAVEFORM_POINT_COUNT);
    expect(positive[0]).toBe(0);
    expect(positive[positive.length - 1]).toBe(0);
    expect(positive.some((point) => point > 0)).toBe(true);
    expect(positive.some((point) => point < 0)).toBe(true);
    expect(Math.max(...positive)).toBeGreaterThan(0.35);
    expect(
      positive.slice(1, -1).reduce((sum, point) => sum + point, 0),
    ).toBeCloseTo(0, 6);

    for (let frame = 0; frame < 40; frame += 1) {
      updateEnergyContour(new Float32Array(512).fill(8), positiveState);
    }
    expect(
      positive.every(
        (point) => Number.isFinite(point) && Math.abs(point) <= 1,
      ),
    ).toBe(true);

    resetEnergyContour(positiveState);
    expect(positive.every((point) => point === 0)).toBe(true);
  });

  it("responds more strongly to real peaks than equal-RMS steady energy", () => {
    const steadyState = createEnergyContourState();
    const beatState = createEnergyContourState();
    const silence = new Float32Array(512);
    const steady = Float32Array.from(
      { length: 512 },
      (_, index) => (index % 2 === 0 ? 0.04 : -0.04),
    );
    const beat = new Float32Array(512);
    const beatPeak = 0.04 * Math.sqrt(512 / 4);
    for (let index = 0; index < 4; index += 1) {
      beat[index] = index % 2 === 0 ? beatPeak : -beatPeak;
    }

    updateEnergyContour(silence, steadyState);
    updateEnergyContour(silence, beatState);
    const steadyPoints = updateEnergyContour(steady, steadyState);
    const beatPoints = updateEnergyContour(beat, beatState);
    const maximumMovement = (points: Float32Array<ArrayBuffer>) =>
      Math.max(...points.map((point) => Math.abs(point)));

    expect(rootMeanSquare(beat)).toBeCloseTo(
      rootMeanSquare(steady),
      6,
    );
    expect(maximumMovement(beatPoints)).toBeGreaterThan(
      maximumMovement(steadyPoints) * 1.5,
    );
    expect(beatPoints[0]).toBe(0);
    expect(beatPoints[beatPoints.length - 1]).toBe(0);
    expect(beatPoints.some((point) => point > 0)).toBe(true);
    expect(beatPoints.some((point) => point < 0)).toBe(true);
  });

  it("creates one graph and reuses it across seeks and blob track changes", async () => {
    const harness = createHarness();
    const dispose = attachLiveAudioWaveform(
      harness.audio as unknown as HTMLAudioElement,
      () => harness.canvas,
      harness.runtime,
    );

    harness.audio.paused = false;
    harness.audio.dispatchEvent(new Event("play"));
    await harness.waitForFrameCount(1);

    harness.audio.paused = true;
    harness.audio.dispatchEvent(new Event("pause"));
    harness.audio.paused = false;
    harness.audio.dispatchEvent(new Event("play"));
    await harness.waitForFrameCount(2);

    harness.audio.dispatchEvent(new Event("seeking"));
    harness.audio.dispatchEvent(new Event("seeked"));
    await harness.waitForFrameCount(3);

    harness.audio.paused = true;
    harness.audio.dispatchEvent(new Event("pause"));
    harness.audio.src = "blob:second-track";
    harness.audio.dispatchEvent(new Event("emptied"));
    harness.audio.paused = false;
    harness.audio.dispatchEvent(new Event("play"));
    await harness.waitForFrameCount(4);

    expect(harness.createAudioContext).toHaveBeenCalledOnce();
    expect(harness.createAnalyser).toHaveBeenCalledOnce();
    expect(harness.createMediaElementSource).toHaveBeenCalledOnce();
    expect(harness.analyser.fftSize).toBe(1_024);
    expect(harness.analyser.smoothingTimeConstant).toBe(0);
    expect(harness.mediaSource.connect).toHaveBeenCalledOnce();
    expect(harness.mediaSource.connect).toHaveBeenCalledWith(
      harness.analyser,
    );
    expect(harness.mediaSource.connect).not.toHaveBeenCalledWith(
      harness.destination,
    );
    expect(harness.analyser.connect).toHaveBeenCalledOnce();
    expect(harness.analyser.connect).toHaveBeenCalledWith(
      harness.destination,
    );

    dispose();
  });

  it("draws only while playing, flattens on pause/end, resumes, and cleans up", async () => {
    const harness = createHarness();
    const dispose = attachLiveAudioWaveform(
      harness.audio as unknown as HTMLAudioElement,
      () => harness.canvas,
      harness.runtime,
    );

    expect(harness.createAudioContext).not.toHaveBeenCalled();
    expect(harness.lastPaintIsFlat()).toBe(true);

    harness.audio.paused = false;
    harness.audio.dispatchEvent(new Event("play"));
    await harness.waitForFrameCount(1);
    harness.setAmplitude(0.08);
    harness.runNextFrame(34);
    harness.setAmplitude(0.8);
    harness.runNextFrame(68);

    expect(harness.getFloatTimeDomainData).toHaveBeenCalledTimes(2);
    expect(harness.lastPaintHasMotion()).toBe(true);

    harness.audio.paused = true;
    harness.audio.dispatchEvent(new Event("pause"));
    expect(harness.pendingFrames()).toBe(0);
    expect(harness.lastPaintIsFlat()).toBe(true);

    harness.setContextState("suspended");
    harness.audio.paused = false;
    harness.audio.dispatchEvent(new Event("play"));
    await harness.waitForFrameCount(4);
    expect(harness.resume).toHaveBeenCalledOnce();

    harness.audio.ended = true;
    harness.audio.dispatchEvent(new Event("ended"));
    expect(harness.pendingFrames()).toBe(0);
    expect(harness.lastPaintIsFlat()).toBe(true);

    harness.audio.ended = false;
    harness.audio.dispatchEvent(new Event("play"));
    await harness.waitForFrameCount(5);
    dispose();

    expect(harness.pendingFrames()).toBe(0);
    expect(harness.analyser.disconnect).toHaveBeenCalledOnce();
    expect(harness.mediaSource.disconnect).toHaveBeenCalledOnce();
    expect(harness.close).toHaveBeenCalledOnce();
    expect(harness.unsubscribeFromReducedMotion).toHaveBeenCalledOnce();

    harness.audio.dispatchEvent(new Event("play"));
    await Promise.resolve();
    expect(harness.requestFrame).toHaveBeenCalledTimes(5);
  });

  it("stays flat and avoids the audio graph when reduced motion is active", async () => {
    const harness = createHarness(true);
    const dispose = attachLiveAudioWaveform(
      harness.audio as unknown as HTMLAudioElement,
      () => harness.canvas,
      harness.runtime,
    );

    harness.audio.paused = false;
    harness.audio.dispatchEvent(new Event("play"));
    await Promise.resolve();
    expect(harness.createAudioContext).not.toHaveBeenCalled();
    expect(harness.requestFrame).not.toHaveBeenCalled();
    expect(harness.lastPaintIsFlat()).toBe(true);

    harness.setReducedMotion(false);
    await harness.waitForFrameCount(1);
    expect(harness.createAudioContext).toHaveBeenCalledOnce();

    harness.setReducedMotion(true);
    expect(harness.pendingFrames()).toBe(0);
    expect(harness.lastPaintIsFlat()).toBe(true);
    dispose();
  });

  it("uses the shortened accessible canvas and contains no fake motion", async () => {
    const [studioSource, waveformSource] = await Promise.all([
      readFile(
        new URL(
          "../src/renderer/LocomoMusicStudio.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../src/renderer/audio-waveform.ts", import.meta.url),
        "utf8",
      ),
    ]);
    const waveformStart = studioSource.indexOf(
      "data-now-playing-waveform",
    );
    const waveformEnd = studioSource.indexOf("/>", waveformStart);
    const waveformElement = studioSource.slice(
      waveformStart,
      waveformEnd,
    );

    expect(NOW_PLAYING_WAVEFORM_AMPLITUDE).toBe(9);
    expect(NOW_PLAYING_WAVEFORM_HEIGHT).toBe(20);
    expect(NOW_PLAYING_WAVEFORM_WIDTH).toBe(96);
    expect(waveformStart).toBeGreaterThan(-1);
    expect(waveformElement).toContain('aria-hidden="true"');
    expect(waveformElement).toContain("h-5 w-24");
    expect(waveformSource).toContain("getFloatTimeDomainData(samples)");
    expect(waveformSource).toContain(
      '"(prefers-reduced-motion: reduce)"',
    );
    expect(waveformSource).not.toContain("Math.random");
  });
});

class FakeAudioElement extends EventTarget {
  ended = false;
  paused = true;
  src = "blob:first-track";
}

function createHarness(initialReducedMotion = false) {
  const audio = new FakeAudioElement();
  const canvas = { isConnected: true } as HTMLCanvasElement;
  const destination = {} as AudioDestinationNode;
  let amplitude = 0.08;
  let contextState: AudioContextState = "running";
  let reducedMotion = initialReducedMotion;
  let reducedMotionListener: (() => void) | undefined;
  const callbacks = new Map<number, FrameRequestCallback>();
  const paintedFrames: number[][] = [];
  let nextFrame = 0;

  const getFloatTimeDomainData = vi.fn((target: Float32Array) => {
    target.set(signal(amplitude, target.length));
  });
  const analyser = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    fftSize: 2_048,
    getFloatTimeDomainData,
    smoothingTimeConstant: 0.8,
  } as unknown as AnalyserNode;
  const mediaSource = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as MediaElementAudioSourceNode;
  const close = vi.fn(() => {
    contextState = "closed";
    return Promise.resolve();
  });
  const resume = vi.fn(() => {
    contextState = "running";
    return Promise.resolve();
  });
  const createAnalyser = vi.fn(() => analyser);
  const createMediaElementSource = vi.fn(() => mediaSource);
  const audioContext = {
    close,
    createAnalyser,
    createMediaElementSource,
    destination,
    resume,
    get state() {
      return contextState;
    },
  } as unknown as AudioContext;
  const createAudioContext = vi.fn(() => audioContext);
  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    nextFrame += 1;
    callbacks.set(nextFrame, callback);
    return nextFrame;
  });
  const cancelFrame = vi.fn((handle: number) => {
    callbacks.delete(handle);
  });
  const unsubscribeFromReducedMotion = vi.fn();
  const runtime: LiveAudioWaveformRuntime = {
    cancelFrame,
    createAudioContext,
    paintFrame: (_canvas, points) => {
      paintedFrames.push(Array.from(points));
    },
    prefersReducedMotion: () => reducedMotion,
    requestFrame,
    subscribeToReducedMotion: (listener) => {
      reducedMotionListener = listener;
      return unsubscribeFromReducedMotion;
    },
  };

  return {
    analyser,
    audio,
    cancelFrame,
    canvas,
    close,
    createAnalyser,
    createAudioContext,
    createMediaElementSource,
    destination,
    getFloatTimeDomainData,
    mediaSource,
    requestFrame,
    resume,
    runtime,
    unsubscribeFromReducedMotion,
    lastPaintHasMotion: () =>
      paintedFrames.at(-1)?.some((point) => Math.abs(point) > 0) === true,
    lastPaintIsFlat: () =>
      paintedFrames.at(-1)?.every((point) => point === 0) === true,
    pendingFrames: () => callbacks.size,
    runNextFrame: (now: number) => {
      const entry = callbacks.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined;
      if (!entry) throw new Error("No animation frame is pending");
      callbacks.delete(entry[0]);
      entry[1](now);
    },
    setAmplitude: (nextAmplitude: number) => {
      amplitude = nextAmplitude;
    },
    setContextState: (nextState: AudioContextState) => {
      contextState = nextState;
    },
    setReducedMotion: (nextReducedMotion: boolean) => {
      reducedMotion = nextReducedMotion;
      reducedMotionListener?.();
    },
    waitForFrameCount: (count: number) =>
      vi.waitFor(() => expect(requestFrame).toHaveBeenCalledTimes(count)),
  };
}

function invert(samples: Float32Array): Float32Array {
  return Float32Array.from(samples, (sample) => -sample);
}

function signal(amplitude: number, length = 512): Float32Array {
  return Float32Array.from(
    { length },
    (_, index) => Math.sin(index / 9) * amplitude,
  );
}

function rootMeanSquare(samples: Float32Array): number {
  return Math.sqrt(
    samples.reduce((sum, sample) => sum + sample * sample, 0) /
      samples.length,
  );
}
