const ANALYSER_FFT_SIZE = 1_024;
const ENERGY_ATTACK = 0.5;
const ENERGY_GAIN = 28;
const ENERGY_PEAK_WEIGHT = 0.25;
const ENERGY_RELEASE = 0.2;
const ENERGY_TRAIL = 0.045;
const FRAME_INTERVAL_MS = 1_000 / 30;
const NEWEST_POINT_RESPONSE = 0.65;

export const NOW_PLAYING_WAVEFORM_AMPLITUDE = 9;
export const NOW_PLAYING_WAVEFORM_HEIGHT = 20;
export const NOW_PLAYING_WAVEFORM_POINT_COUNT = 11;
export const NOW_PLAYING_WAVEFORM_WIDTH = 96;

export interface EnergyContourState {
  readonly energyPoints: Float32Array<ArrayBuffer>;
  fastLevel: number;
  initialized: boolean;
  readonly points: Float32Array<ArrayBuffer>;
  slowLevel: number;
}

export interface LiveAudioWaveformRuntime {
  readonly cancelFrame: (handle: number) => void;
  readonly createAudioContext: () => AudioContext;
  readonly paintFrame: (
    canvas: HTMLCanvasElement,
    points: ArrayLike<number>,
  ) => void;
  readonly prefersReducedMotion: () => boolean;
  readonly requestFrame: (callback: FrameRequestCallback) => number;
  readonly subscribeToReducedMotion: (
    listener: () => void,
  ) => () => void;
}

export function createEnergyContourState(): EnergyContourState {
  return {
    energyPoints: new Float32Array(NOW_PLAYING_WAVEFORM_POINT_COUNT),
    fastLevel: 0,
    initialized: false,
    points: new Float32Array(NOW_PLAYING_WAVEFORM_POINT_COUNT),
    slowLevel: 0,
  };
}

export function resetEnergyContour(state: EnergyContourState): void {
  state.energyPoints.fill(0);
  state.fastLevel = 0;
  state.initialized = false;
  state.points.fill(0);
  state.slowLevel = 0;
}

export function updateEnergyContour(
  samples: ArrayLike<number>,
  state: EnergyContourState,
): Float32Array<ArrayBuffer> {
  let peak = 0;
  let sumOfSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    peak = Math.max(peak, Math.abs(sample));
    sumOfSquares += sample * sample;
  }
  const rootMeanSquare = Math.sqrt(
    sumOfSquares / Math.max(1, samples.length),
  );
  const energy =
    rootMeanSquare * (1 - ENERGY_PEAK_WEIGHT) +
    peak * ENERGY_PEAK_WEIGHT;

  if (!state.initialized) {
    state.fastLevel = energy;
    state.initialized = true;
    state.slowLevel = energy;
    return state.points;
  }

  const response = energy > state.fastLevel
    ? ENERGY_ATTACK
    : ENERGY_RELEASE;
  state.fastLevel += (energy - state.fastLevel) * response;
  state.slowLevel += (energy - state.slowLevel) * ENERGY_TRAIL;
  const target = Math.tanh(
    (state.fastLevel - state.slowLevel) * ENERGY_GAIN,
  );
  const newestPoint = state.energyPoints.length - 2;
  const previousNewest = state.energyPoints[newestPoint] ?? 0;

  for (let point = 1; point < newestPoint; point += 1) {
    state.energyPoints[point] = state.energyPoints[point + 1] ?? 0;
  }
  state.energyPoints[newestPoint] =
    previousNewest +
    (target - previousNewest) * NEWEST_POINT_RESPONSE;

  let localMean = 0;
  for (let point = 1; point <= newestPoint; point += 1) {
    localMean += state.energyPoints[point] ?? 0;
  }
  localMean /= newestPoint;
  for (let point = 1; point <= newestPoint; point += 1) {
    state.points[point] = clamp(
      (state.energyPoints[point] ?? 0) - localMean,
      -1,
      1,
    );
  }
  state.points[0] = 0;
  state.points[state.points.length - 1] = 0;
  return state.points;
}

export function paintNowPlayingWaveform(
  canvas: HTMLCanvasElement,
  points: ArrayLike<number> = new Float32Array(
    NOW_PLAYING_WAVEFORM_POINT_COUNT,
  ),
): void {
  const context = canvas.getContext("2d");
  if (!context) return;

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(NOW_PLAYING_WAVEFORM_WIDTH * pixelRatio);
  const pixelHeight = Math.round(
    NOW_PLAYING_WAVEFORM_HEIGHT * pixelRatio,
  );
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const rootStyles = window.getComputedStyle(document.documentElement);
  const lineColor =
    rootStyles.getPropertyValue("--locomo-contrast").trim() || "#000";
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(
    0,
    0,
    NOW_PLAYING_WAVEFORM_WIDTH,
    NOW_PLAYING_WAVEFORM_HEIGHT,
  );
  context.beginPath();
  context.globalAlpha = 0.55;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 1;
  context.strokeStyle = lineColor;

  const centerY = NOW_PLAYING_WAVEFORM_HEIGHT / 2;
  const lastPoint = Math.max(1, points.length - 1);
  const pointY = (point: number) =>
    centerY +
    (points[point] ?? 0) * NOW_PLAYING_WAVEFORM_AMPLITUDE;

  context.moveTo(0, pointY(0));
  for (let point = 1; point < lastPoint; point += 1) {
    const x = (point / lastPoint) * NOW_PLAYING_WAVEFORM_WIDTH;
    const nextX =
      ((point + 1) / lastPoint) * NOW_PLAYING_WAVEFORM_WIDTH;
    context.quadraticCurveTo(
      x,
      pointY(point),
      (x + nextX) / 2,
      (pointY(point) + pointY(point + 1)) / 2,
    );
  }
  context.lineTo(NOW_PLAYING_WAVEFORM_WIDTH, pointY(lastPoint));
  context.stroke();
}

export function attachLiveAudioWaveform(
  audio: HTMLAudioElement,
  getCanvas: () => HTMLCanvasElement | undefined,
  runtime: LiveAudioWaveformRuntime = createBrowserRuntime(),
): () => void {
  const contour = createEnergyContourState();
  let analyser: AnalyserNode | undefined;
  let audioContext: AudioContext | undefined;
  let mediaSource: MediaElementAudioSourceNode | undefined;
  let setup: Promise<AnalyserNode | undefined> | undefined;
  let frame: number | undefined;
  let lastFrameTime = Number.NEGATIVE_INFINITY;
  let disposed = false;
  let graphUnavailable = false;
  let samples = new Float32Array(ANALYSER_FFT_SIZE);

  const currentCanvas = () => {
    const canvas = getCanvas();
    return canvas && canvas.isConnected !== false ? canvas : undefined;
  };
  const paint = () => {
    const canvas = currentCanvas();
    if (canvas) runtime.paintFrame(canvas, contour.points);
  };
  const stop = (resetLine: boolean) => {
    if (frame !== undefined) runtime.cancelFrame(frame);
    frame = undefined;
    lastFrameTime = Number.NEGATIVE_INFINITY;
    if (!resetLine) return;
    resetEnergyContour(contour);
    paint();
  };

  const ensureAnalyser = async (): Promise<AnalyserNode | undefined> => {
    if (disposed || graphUnavailable) return undefined;
    if (analyser && audioContext) {
      if (audioContext.state === "suspended") {
        try {
          await audioContext.resume();
        } catch {
          return undefined;
        }
      }
      return audioContext.state === "running" ? analyser : undefined;
    }
    if (setup) return setup;

    setup = (async () => {
      let nextAnalyser: AnalyserNode | undefined;
      let nextContext: AudioContext | undefined;
      let nextSource: MediaElementAudioSourceNode | undefined;
      try {
        nextContext = runtime.createAudioContext();
        if (nextContext.state === "suspended") {
          await nextContext.resume();
        }
        if (
          disposed ||
          runtime.prefersReducedMotion() ||
          audio.paused ||
          audio.ended ||
          nextContext.state !== "running"
        ) {
          void nextContext.close().catch(() => undefined);
          return undefined;
        }

        nextAnalyser = nextContext.createAnalyser();
        nextAnalyser.fftSize = ANALYSER_FFT_SIZE;
        nextAnalyser.smoothingTimeConstant = 0;
        nextSource = nextContext.createMediaElementSource(audio);
        nextSource.connect(nextAnalyser);
        nextAnalyser.connect(nextContext.destination);

        if (disposed) {
          nextSource.disconnect();
          nextAnalyser.disconnect();
          void nextContext.close().catch(() => undefined);
          return undefined;
        }

        analyser = nextAnalyser;
        audioContext = nextContext;
        mediaSource = nextSource;
        samples = new Float32Array(nextAnalyser.fftSize);
        return nextAnalyser;
      } catch {
        if (nextSource && nextContext) {
          graphUnavailable = true;
          audioContext = nextContext;
          mediaSource = nextSource;
          try {
            nextSource.disconnect();
            nextAnalyser?.disconnect();
            nextSource.connect(nextContext.destination);
          } catch {
            // Keep the attached context alive; a second source is invalid.
          }
        } else if (nextContext) {
          void nextContext.close().catch(() => undefined);
        }
        return undefined;
      }
    })().finally(() => {
      setup = undefined;
    });
    return setup;
  };

  const renderFrame = (now: number) => {
    frame = undefined;
    if (
      disposed ||
      runtime.prefersReducedMotion() ||
      audio.paused ||
      audio.ended ||
      !analyser
    ) {
      stop(true);
      return;
    }

    if (now - lastFrameTime >= FRAME_INTERVAL_MS) {
      lastFrameTime = now;
      const canvas = currentCanvas();
      if (canvas) {
        try {
          analyser.getFloatTimeDomainData(samples);
          runtime.paintFrame(
            canvas,
            updateEnergyContour(samples, contour),
          );
        } catch {
          stop(true);
          return;
        }
      }
    }
    frame = runtime.requestFrame(renderFrame);
  };

  const start = async () => {
    if (runtime.prefersReducedMotion()) return;
    const activeAnalyser = await ensureAnalyser();
    if (
      !activeAnalyser ||
      disposed ||
      runtime.prefersReducedMotion() ||
      audio.paused ||
      audio.ended ||
      frame !== undefined
    ) {
      return;
    }
    frame = runtime.requestFrame(renderFrame);
  };

  const onPlay = () => void start();
  const onStop = () => stop(true);
  const onSeeking = () => stop(true);
  const onSeeked = () => {
    if (!audio.paused && !audio.ended) void start();
  };
  const onReducedMotionChange = () => {
    if (runtime.prefersReducedMotion()) {
      stop(true);
    } else if (!audio.paused && !audio.ended) {
      void start();
    }
  };

  audio.addEventListener("play", onPlay);
  audio.addEventListener("pause", onStop);
  audio.addEventListener("ended", onStop);
  audio.addEventListener("emptied", onStop);
  audio.addEventListener("seeking", onSeeking);
  audio.addEventListener("seeked", onSeeked);
  const unsubscribeFromReducedMotion =
    runtime.subscribeToReducedMotion(onReducedMotionChange);
  paint();
  if (!audio.paused && !audio.ended) void start();

  return () => {
    if (disposed) return;
    disposed = true;
    audio.removeEventListener("play", onPlay);
    audio.removeEventListener("pause", onStop);
    audio.removeEventListener("ended", onStop);
    audio.removeEventListener("emptied", onStop);
    audio.removeEventListener("seeking", onSeeking);
    audio.removeEventListener("seeked", onSeeked);
    unsubscribeFromReducedMotion();
    stop(false);
    analyser?.disconnect();
    mediaSource?.disconnect();
    if (audioContext) {
      void audioContext.close().catch(() => undefined);
    }
  };
}

function createBrowserRuntime(): LiveAudioWaveformRuntime {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  return {
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    createAudioContext: () => new window.AudioContext(),
    paintFrame: paintNowPlayingWaveform,
    prefersReducedMotion: () => reducedMotion.matches,
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    subscribeToReducedMotion: (listener) => {
      reducedMotion.addEventListener("change", listener);
      return () => reducedMotion.removeEventListener("change", listener);
    },
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
