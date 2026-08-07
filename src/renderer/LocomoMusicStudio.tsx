import {
  Download,
  Heart,
  Music2,
  Pause,
  Play,
  Recycle,
  ThumbsUp,
  Trash2,
} from "lucide-solid";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import type { JSX } from "solid-js";

import type {
  MusicGenerationRequest,
  MusicTrack,
  MusicTrackGenerationDetails,
  OvernightSystemStatus,
} from "../shared/app-contract";
import type {
  MusicCategoryKey,
  MusicCategorySet,
} from "../shared/music-categories";
import {
  RIGHT_PANE_WIDTH,
  studioHeightLayout,
  studioPaneWidths,
  TRACK_DETAILS_PANE_WIDTH,
} from "../shared/window-layout";
import {
  readApprovedPromptIndex,
  toggleApprovedPromptExample,
  writeApprovedPromptIndex,
} from "./approved-prompts";
import {
  createAutomaticGenerationRunController,
  readAutomaticGenerationLimit,
  type AutomaticGenerationRunSnapshot,
} from "./automatic-generation-limit";
import { createPlaybackHistoryGate } from "./playback-history-gate";
import {
  attachLiveAudioWaveform,
  paintNowPlayingWaveform,
} from "./audio-waveform";
import {
  locomoMusicCategoryCatalogs,
  resolveLocomoMusicCategory,
  type LocomoMusicColorTheme,
} from "./category-catalog";
import {
  createGenerationForSelection,
  FAVORITES_COLLECTION_KEY,
  FAVORITES_EMPTY_STATE,
  favoriteActionLabel,
  favoriteSourceCategoryLabel,
  filterFavoriteTracks,
  generationCategoryForSelection,
  isFeaturedExistingCategoryTile,
  runFavoriteToggleAction,
  seedFavoritesPlaylist,
  visibleCategoryTiles,
  type MusicSelectionKey,
  type VisibleCategoryTile,
} from "./favorites";
import {
  admitGeneratedTrack,
  countStationTrackVariations,
  createCategoryGenerationIntentGate,
  createCategoryGenerationRequest,
  filterTracksForCategory,
  generationResultMatchesSelection,
  nextTrackAtPlaybackBoundary,
  seedCategoryPlaylist,
  shouldGenerateAfterQueueDrain,
  shouldGenerateOnCategorySelection,
} from "./radio";
import { readSongDurationMinutes } from "./SongLengthDial";
import {
  formatSongRowDuration,
  isCurrentSongRow,
} from "./current-song-row";
import {
  handleMainPlaybackShortcut,
  revealPlaylistTrack,
} from "./main-playback-keyboard";
import {
  createCustomCategoryDefinition,
  customCategoryDefinitionToCategory,
  readCustomCategoryDefinitions,
  writeCustomCategoryDefinitions,
  type CustomCategoryDefinition,
} from "./custom-categories";
import {
  createTrackAudioBlob,
  runDownloadSongAction,
  trackDownloadFileName,
} from "./track-audio";
import {
  createLatestRequestGate,
  createLazyTrackLibraryClient,
  markTrackPlayed,
  upsertCompletedTrack,
} from "./track-library";
import {
  musicGenerationWaitingTitle,
  type MusicGenerationWaitingState,
} from "./runtime-setup-presentation";
import {
  clearCategoryNewMusic,
  readNewCategoryMusic,
  recordGeneratedCategoryNewMusic,
  writeNewCategoryMusic,
} from "./new-category-music";
import { resolveLocomoMusicStationCardArtwork } from "./station-card-artwork";
import {
  beginOvernightAttempt,
  completeOvernightAttempt,
  failOvernightAttempt,
  overnightBatchCategory,
  OVERNIGHT_BATCH_STORAGE_KEY,
  planOvernightScheduling,
  prepareNextOvernightItem,
  readOvernightBatch,
  recoverInterruptedOvernightBatch,
  writeOvernightBatch,
} from "./overnight-batch";
import { createOneTimeWindowExpansionRequester } from "./window-reveal";

const TRACK_DETAILS_UI_ENABLED: boolean = false;

interface GenerationQueueEntryBase {
  readonly request: MusicGenerationRequest;
  readonly selectionEpoch: number;
}

type GenerationQueueEntry =
  | (GenerationQueueEntryBase & {
      readonly overnightBatchID: string;
      readonly source: "overnight";
    })
  | (GenerationQueueEntryBase & {
      readonly overnightBatchID?: never;
      readonly automaticGenerationRunID?: never;
      readonly source: "another-take";
    })
  | (GenerationQueueEntryBase & {
      readonly automaticGenerationRunID: number;
      readonly overnightBatchID?: never;
      readonly source: "continuous";
    });

function categoryArtworkMask(item: VisibleCategoryTile) {
  return resolveLocomoMusicStationCardArtwork(item.key);
}

function categoryArtworkMaskSize(item: VisibleCategoryTile) {
  if (item.key === "existing/progressive-metal") return "74%";
  if (item.key === "existing/cinematic-hip-hop") return "68%";
  if (item.key === "existing/latin-techno") return "70%";
  return "contain";
}

function categoryDisplayName(name: string) {
  return name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function LocomoMusicStudio(props: {
  readonly generationAvailable: boolean;
  readonly generationWaitingState?: MusicGenerationWaitingState;
  readonly setupSurface?: JSX.Element;
  readonly theme: LocomoMusicColorTheme;
}) {
  const music = window.locomoMusic;
  const trackLibrary = createLazyTrackLibraryClient(music);
  const playbackHistory = createPlaybackHistoryGate(
    (trackID) => {
      void music.trackPlaybackStarted(trackID).catch(() => undefined);
    },
  );
  const [viewportHeight, setViewportHeight] = createSignal(
    window.innerHeight,
  );
  const heightLayout = createMemo(() =>
    studioHeightLayout(viewportHeight()),
  );
  const paneLayout = createMemo(() =>
    studioPaneWidths(viewportHeight()),
  );
  const compactHeightStyle = createMemo<JSX.CSSProperties>(() => {
    const layout = heightLayout();
    if (layout.mode === "design") return {};

    return {
      "--studio-pane-top-rail": `${layout.pane.topRail}px`,
      "--studio-pane-bottom-rail": `${layout.pane.bottomRail}px`,
      "--studio-pane-heading-font-size": `${layout.pane.headingFontSize}px`,
      "--studio-pane-heading-line-height": `${layout.pane.headingLineHeight}px`,
      "--studio-pane-heading-gap": `${layout.pane.headingGap}px`,
      "--category-grid-width": `${layout.categoryGrid.width}px`,
      "--category-grid-height": `${layout.categoryGrid.height}px`,
      "--category-grid-featured-track-height": `${layout.categoryGrid.featuredTrackHeight}px`,
      "--category-grid-standard-track-height": `${layout.categoryGrid.standardTrackHeight}px`,
      "--category-grid-gap": `${layout.categoryGrid.gap}px`,
      "--category-grid-featured-label-size": `${layout.categoryGrid.featuredLabelSize}px`,
      "--category-grid-standard-label-size": `${layout.categoryGrid.standardLabelSize}px`,
      "--category-grid-label-inset": `${layout.categoryGrid.labelInset}px`,
      "--category-grid-border-radius": `${layout.categoryGrid.borderRadius}px`,
      "--category-pane-inline-padding": `${paneLayout().categoryInlinePadding}px`,
      "--right-now-playing-min-height": `${layout.rightPane.nowPlayingMinHeight}px`,
      "--right-now-playing-padding": `${layout.rightPane.nowPlayingPadding}px`,
      "--right-now-playing-action-inset": `${layout.rightPane.nowPlayingActionInset}px`,
      "--right-now-playing-title-size": `${layout.rightPane.nowPlayingTitleSize}px`,
      "--right-transport-button-size": `${layout.rightPane.transportButtonSize}px`,
      "--right-transport-gap": `${layout.rightPane.transportGap}px`,
      "--right-transport-offset": `${layout.rightPane.transportOffset}px`,
      "--right-playlist-heading-gap": `${layout.rightPane.playlistHeadingGap}px`,
      "--right-playlist-card-gap": `${layout.rightPane.playlistCardGap}px`,
      "--right-row-gap": `${layout.rightPane.rowGap}px`,
      "--right-row-padding": `${layout.rightPane.rowPadding}px`,
    } as JSX.CSSProperties;
  });
  const [categorySet] = createSignal<MusicCategorySet>("existing");
  const [selectionKey, setSelectionKey] =
    createSignal<MusicSelectionKey>();
  const [instrumental] = createSignal(false);
  const [autoCreate, setAutoCreate] = createSignal(true);
  const [continuousGenerationSuppressed, setContinuousGenerationSuppressed] =
    createSignal(false);
  const [categoryGenerationPending, setCategoryGenerationPending] =
    createSignal(false);
  const [automaticGenerationRun, setAutomaticGenerationRun] =
    createSignal<AutomaticGenerationRunSnapshot>();
  const [selectedMinutes] = createSignal(
    readSongDurationMinutes(window.localStorage),
  );
  const [generating, setGenerating] = createSignal(false);
  const [error, setError] = createSignal("");
  const [tracks, setTracks] = createSignal<MusicTrack[]>([]);
  const [playlist, setPlaylist] = createSignal<string[]>([]);
  const [selected, setSelected] = createSignal<string>();
  const [playing, setPlaying] = createSignal<string>();
  const [progress, setProgress] = createSignal(0);
  const [customCategoryDefinitions, setCustomCategoryDefinitions] =
    createSignal<CustomCategoryDefinition[]>(
      readCustomCategoryDefinitions(window.localStorage),
    );
  const [newMusicCategoryKeys, setNewMusicCategoryKeys] =
    createSignal<readonly MusicCategoryKey[]>(
      readNewCategoryMusic(window.localStorage),
    );
  const [addCategoryOpen, setAddCategoryOpen] = createSignal(false);
  const [customCategoryPrompt, setCustomCategoryPrompt] =
    createSignal("");
  const [trackDetails, setTrackDetails] =
    createSignal<MusicTrackGenerationDetails>();
  const [trackDetailsLoading, setTrackDetailsLoading] =
    createSignal(false);
  const [anotherTakeSubmitting, setAnotherTakeSubmitting] =
    createSignal(false);
  const [trackDetailsSelection, setTrackDetailsSelection] =
    createSignal<
      Pick<MusicTrack, "categoryKey" | "id" | "prompt" | "title">
    >();
  const visibleTrackDetailsSelection = () =>
    TRACK_DETAILS_UI_ENABLED ? trackDetailsSelection() : undefined;
  const [approvedPrompts, setApprovedPrompts] = createSignal(
    readApprovedPromptIndex(window.localStorage),
  );
  const generationQueue: GenerationQueueEntry[] = [];
  const categoryGenerationIntent = createCategoryGenerationIntentGate();
  const automaticGenerationRuns =
    createAutomaticGenerationRunController({
      onChange: setAutomaticGenerationRun,
    });
  const playbackID = crypto.randomUUID();
  const overnightSessionID = crypto.randomUUID();
  const playbackChannel = new BroadcastChannel("locomo-music-playback");
  const requestWindowExpansion =
    createOneTimeWindowExpansionRequester(() => music.expandWindow());
  let disposed = false;
  let initialLibraryLoaded = false;
  let lastRendererInteractionAt = 0;
  let overnightRecoveryChecked = false;
  let overnightScheduling = false;
  let metadataVersion = 0;
  let pendingJump: string | undefined;
  let refreshSequence = 0;
  let trackDetailsRequestSequence = 0;
  const playbackRequests = createLatestRequestGate();
  let audio: HTMLAudioElement | undefined;
  let waveformCanvas: HTMLCanvasElement | undefined;
  let activeAudioSource:
    | { readonly id: string; readonly src: string }
    | undefined;
  let anotherTakePlayOnComplete = false;
  let anotherTakeRequest: MusicGenerationRequest | undefined;
  let selectionEpoch = 0;
  const customCategories = createMemo(() =>
    customCategoryDefinitions().map(customCategoryDefinitionToCategory),
  );
  const categoryCatalog = createMemo(() => {
    const catalog = locomoMusicCategoryCatalogs[categorySet()];
    return categorySet() === "experimental"
      ? {
          ...catalog,
          categories: [...catalog.categories, ...customCategories()],
        }
      : catalog;
  });
  const categoryTiles = createMemo(() =>
    visibleCategoryTiles(categoryCatalog().categories, categorySet()),
  );
  const hasNewCategoryMusic = (categoryKey: MusicCategoryKey) =>
    newMusicCategoryKeys().includes(categoryKey);
  const generationCategoryKey = createMemo(() =>
    generationCategoryForSelection(selectionKey()),
  );
  const generationToggleActive = createMemo(
    () =>
      categoryGenerationPending() ||
      (props.generationAvailable && autoCreate()),
  );
  const automaticGenerationLimitReached = createMemo(
    () => automaticGenerationRun()?.status === "limit-reached",
  );
  const generationStatusTitleUsesCompactStyle = createMemo(
    () =>
      (!props.generationAvailable && categoryGenerationPending()) ||
      automaticGenerationLimitReached(),
  );
  const generationWaitingTitle = createMemo(
    () =>
      musicGenerationWaitingTitle(props.generationWaitingState) ??
      "Music generation needs setup",
  );
  const favoritesSelected = createMemo(
    () => selectionKey() === FAVORITES_COLLECTION_KEY,
  );
  const selectedPromptExampleApproved = createMemo(() => {
    const track = trackDetailsSelection();
    if (!track) return false;
    const prompt = trackDetails()?.prompt ?? track.prompt;
    return Boolean(
      approvedPrompts()[prompt]?.some(
        (example) => example.songID === track.id,
      ),
    );
  });
  const category = createMemo(() => {
    const key = generationCategoryKey();
    return key
      ? resolveLocomoMusicCategory(key, customCategories())
      : undefined;
  });
  const station = createMemo(() =>
    favoritesSelected()
      ? "Favorites"
      : category()?.name
        ? categoryDisplayName(category()!.name)
        : undefined,
  );
  const stationTracks = createMemo(() => {
    if (favoritesSelected()) return filterFavoriteTracks(tracks());
    const current = generationCategoryKey();
    if (!current) return [];
    return filterTracksForCategory(tracks(), current);
  });
  const featured = createMemo(
    () =>
      stationTracks().find((track) => track.id === selected()) ??
      stationTracks()[0],
  );

  createEffect(() => {
    const theme = props.theme;
    queueMicrotask(() => {
      if (props.theme === theme && waveformCanvas?.isConnected) {
        paintNowPlayingWaveform(waveformCanvas);
      }
    });
  });

  const releaseActiveAudioSource = (id?: string) => {
    if (!activeAudioSource || (id && activeAudioSource.id !== id)) {
      return;
    }
    audio?.pause();
    if (audio?.src === activeAudioSource.src) {
      audio.removeAttribute("src");
      audio.load();
    }
    URL.revokeObjectURL(activeAudioSource.src);
    playbackHistory.released(activeAudioSource.id);
    activeAudioSource = undefined;
  };

  const refresh = async () => {
    const requestSequence = ++refreshSequence;
    const requestMetadataVersion = metadataVersion;
    const items = await trackLibrary.listMetadata();
    if (
      disposed ||
      requestSequence !== refreshSequence ||
      requestMetadataVersion !== metadataVersion
    ) {
      return tracks();
    }
    const available = new Set(items.map((item) => item.id));
    const selectedTrackWasRemoved =
      selected() !== undefined && !available.has(selected() ?? "");
    const activeTrackWasRemoved =
      activeAudioSource !== undefined &&
      !available.has(activeAudioSource.id);
    if (selectedTrackWasRemoved || activeTrackWasRemoved) {
      playbackRequests.cancel();
      releaseActiveAudioSource();
      if (selectedTrackWasRemoved) setSelected(undefined);
      setPlaying(undefined);
      setProgress(0);
    }
    setTracks(items);
    if (favoritesSelected()) {
      setPlaylist(seedFavoritesPlaylist(items).playlist);
    }
    return items;
  };

  onMount(() => {
    const handleViewportResize = () =>
      setViewportHeight(window.innerHeight);
    const disposeWaveform = audio
      ? attachLiveAudioWaveform(audio, () => waveformCanvas)
      : undefined;
    playbackChannel.onmessage = (event) => {
      if (event.data === playbackID) return;
      setAutoCreate(false);
      automaticGenerationRuns.stop();
      playbackRequests.cancel();
      releaseActiveAudioSource();
      setPlaying(undefined);
      setProgress(0);
    };
    void refresh().then(
      () => {
        initialLibraryLoaded = true;
        void refreshOvernightScheduling();
      },
      () => setError("Could not load your music library"),
    );
    const interval = window.setInterval(
      () =>
        void refresh().then(
          () => {
            if (initialLibraryLoaded) return;
            initialLibraryLoaded = true;
            void refreshOvernightScheduling();
          },
          () => undefined,
        ),
      3_000,
    );
    const handledPlaybackKeyboardEvents = new WeakSet<Event>();
    const handleExplicitInteraction = (event: Event) => {
      if (handledPlaybackKeyboardEvents.has(event)) return;
      noteExplicitRendererInteraction();
    };
    const handlePlaybackKeyboard = (event: KeyboardEvent) => {
      const handled = handleMainPlaybackShortcut(event, {
        currentTrack: tracks().find(
          (track) => track.id === selected(),
        ),
        visibleTracks: stationTracks(),
        playTrack: (track) => void play(track),
        revealTrack: (trackID) =>
          queueMicrotask(() =>
            revealPlaylistTrack(
              document.querySelectorAll<HTMLElement>(
                "[data-playlist-track-id]",
              ),
              trackID,
            ),
          ),
      });
      if (handled) handledPlaybackKeyboardEvents.add(event);
    };
    const handleOvernightStorage = (event: StorageEvent) => {
      if (
        event.key === OVERNIGHT_BATCH_STORAGE_KEY ||
        event.key === null
      ) {
        void refreshOvernightScheduling();
      }
    };
    const unsubscribeOvernightConditions =
      music.onOvernightSystemStatus((conditions) => {
        void refreshOvernightScheduling(conditions);
      });
    document.addEventListener(
      "pointerdown",
      handleExplicitInteraction,
      true,
    );
    document.addEventListener(
      "keydown",
      handlePlaybackKeyboard,
      true,
    );
    document.addEventListener(
      "keydown",
      handleExplicitInteraction,
      true,
    );
    window.addEventListener("storage", handleOvernightStorage);
    window.addEventListener("resize", handleViewportResize);
    const overnightInterval = window.setInterval(
      () => void refreshOvernightScheduling(),
      5_000,
    );
    onCleanup(() => {
      window.clearInterval(interval);
      window.clearInterval(overnightInterval);
      unsubscribeOvernightConditions();
      document.removeEventListener(
        "pointerdown",
        handleExplicitInteraction,
        true,
      );
      document.removeEventListener(
        "keydown",
        handlePlaybackKeyboard,
        true,
      );
      document.removeEventListener(
        "keydown",
        handleExplicitInteraction,
        true,
      );
      window.removeEventListener("storage", handleOvernightStorage);
      window.removeEventListener("resize", handleViewportResize);
      disposeWaveform?.();
    });
  });
  onCleanup(() => {
    disposed = true;
    playbackRequests.cancel();
    playbackChannel.close();
    releaseActiveAudioSource();
    generationQueue.splice(0);
    categoryGenerationIntent.clear();
    automaticGenerationRuns.stop();
    void music
      .setOvernightGenerationActive(false)
      .catch(() => undefined);
  });

  const play = async (track: MusicTrack) => {
    if (!audio) return;
    const requestSequence = playbackRequests.begin();
    document.querySelectorAll("audio").forEach((element) => {
      if (element !== audio) element.pause();
    });
    playbackChannel.postMessage(playbackID);
    setSelected(track.id);
    if (playing() === track.id) {
      audio.pause();
      return;
    }
    if (TRACK_DETAILS_UI_ENABLED) {
      const openDetails = trackDetailsSelection();
      if (openDetails && openDetails.id !== track.id) {
        showTrackDetails(track);
      }
    }
    audio.pause();
    setPlaying(undefined);
    setProgress(0);
    try {
      let source = activeAudioSource?.id === track.id
        ? activeAudioSource.src
        : undefined;
      let createdSource = false;
      if (!source) {
        const file = await trackLibrary.readAudio(track.id);
        source = URL.createObjectURL(createTrackAudioBlob(file));
        createdSource = true;
      }
      if (disposed || !playbackRequests.isCurrent(requestSequence)) {
        if (createdSource) URL.revokeObjectURL(source);
        return;
      }
      if (activeAudioSource?.src !== source) {
        releaseActiveAudioSource();
      }
      activeAudioSource = { id: track.id, src: source };
      audio.src = source;
      setError("");
      await audio.play();
    } catch (cause) {
      if (!playbackRequests.isCurrent(requestSequence) || disposed) return;
      setPlaying(undefined);
      setError(readTrackError(cause, "Could not play this song"));
    }
  };

  const downloadTrack = async (track: MusicTrack) => {
    let temporarySource: string | undefined;
    try {
      const source =
        activeAudioSource?.id === track.id
          ? activeAudioSource.src
          : (temporarySource = URL.createObjectURL(
              createTrackAudioBlob(
                await trackLibrary.readAudio(track.id),
              ),
            ));
      const link = document.createElement("a");
      link.href = source;
      link.download = trackDownloadFileName(track);
      document.body.append(link);
      link.click();
      link.remove();
      setError("");
    } catch (cause) {
      setError(readTrackError(cause, "Could not download this song"));
    } finally {
      const sourceToRevoke = temporarySource;
      if (sourceToRevoke) {
        window.setTimeout(
          () => URL.revokeObjectURL(sourceToRevoke),
          0,
        );
      }
    }
  };

  const closeTrackDetailsPane = () => {
    trackDetailsRequestSequence += 1;
    setTrackDetailsSelection(undefined);
    setTrackDetails(undefined);
    setTrackDetailsLoading(false);
    void music.setTrackDetailsPaneOpen(false).catch(() => undefined);
  };

  function showTrackDetails(track: MusicTrack) {
    if (!TRACK_DETAILS_UI_ENABLED) {
      closeTrackDetailsPane();
      return;
    }
    const requestSequence = ++trackDetailsRequestSequence;
    setTrackDetailsSelection({
      categoryKey: track.categoryKey,
      id: track.id,
      prompt: track.prompt,
      title: track.title,
    });
    setTrackDetails(undefined);
    setTrackDetailsLoading(true);
    void music.setTrackDetailsPaneOpen(true).catch(() => undefined);
    void music.getTrackGenerationDetails(track.id).then(
      (details) => {
        if (disposed || requestSequence !== trackDetailsRequestSequence) {
          return;
        }
        setTrackDetails(details);
        setTrackDetailsLoading(false);
      },
      () => {
        if (disposed || requestSequence !== trackDetailsRequestSequence) {
          return;
        }
        setTrackDetails(undefined);
        setTrackDetailsLoading(false);
      },
    );
  }

  createEffect(() => {
    if (!TRACK_DETAILS_UI_ENABLED) {
      closeTrackDetailsPane();
      return;
    }
    const track = featured();
    if (!selectionKey() || !track) return;
    if (trackDetailsSelection()?.id === track.id) return;
    showTrackDetails(track);
  });

  const togglePromptApproval = () => {
    const track = trackDetailsSelection();
    if (!track || trackDetailsLoading()) return;
    const details = trackDetails();
    const prompt = details?.prompt ?? track.prompt;
    const category = track.categoryKey
      ? resolveLocomoMusicCategory(
          track.categoryKey,
          customCategories(),
        )
      : undefined;
    const next = toggleApprovedPromptExample(
      approvedPrompts(),
      prompt,
      {
        approvedAt: new Date().toISOString(),
        categoryKey: track.categoryKey,
        promptRecipeVersion: details?.promptRecipeVersion ?? null,
        songID: track.id,
        station: category?.name ?? null,
        title: track.title ?? locomoMusicTrackTitle(prompt),
      },
    );

    try {
      writeApprovedPromptIndex(window.localStorage, next);
      setApprovedPrompts(next);
    } catch (cause) {
      setError(readTrackError(cause, "Could not save prompt approval"));
    }
  };

  const deleteTrack = (track: MusicTrack) => {
    if (trackDetailsSelection()?.id === track.id) {
      closeTrackDetailsPane();
    }
    playbackRequests.cancel();
    audio?.pause();
    releaseActiveAudioSource(track.id);
    setPlaying(undefined);
    setPlaylist((current) =>
      current.filter((id) => id !== track.id),
    );
    if (pendingJump === track.id) pendingJump = undefined;
    metadataVersion += 1;
    void music
      .delete(track.id)
      .then(refresh)
      .catch((cause: unknown) => {
        setError(readTrackError(cause, "Could not delete this song"));
      });
  };

  const toggleFavorite = (track: MusicTrack) => {
    const nextFavorite = !track.isFavorite;
    metadataVersion += 1;
    setTracks((current) =>
      current.map((item) =>
        item.id === track.id
          ? { ...item, isFavorite: nextFavorite }
          : item,
      ),
    );
    if (favoritesSelected() && !nextFavorite) {
      setPlaylist((current) =>
        current.filter((id) => id !== track.id),
      );
      if (pendingJump === track.id) pendingJump = undefined;
    }
    void music
      .setFavorite(track.id, nextFavorite)
      .then(refresh)
      .catch((cause: unknown) => {
        metadataVersion += 1;
        setError(
          readTrackError(cause, "Could not update this favorite"),
        );
        void refresh().catch(() => undefined);
      });
  };

  const generateAnotherTake = () => {
    const track = trackDetailsSelection();
    const details = trackDetails();
    if (
      !props.generationAvailable ||
      !import.meta.env.DEV ||
      anotherTakeRequest ||
      trackDetailsLoading() ||
      !track?.categoryKey ||
      !details?.anotherTake
    ) {
      return;
    }
    const request: MusicGenerationRequest = {
      categoryKey: track.categoryKey,
      mode: "create",
      prompt: details.prompt,
      promptRecipeVersion:
        details.promptRecipeVersion ?? undefined,
      lyrics: details.anotherTake.instrumental ? "" : "__AUTO__",
      duration: details.anotherTake.duration,
      reusePlannerCaptionFromTrackID: track.id,
    };
    const playOnComplete = favoritesSelected();
    if (playOnComplete) selectStation(track.categoryKey);
    anotherTakePlayOnComplete = playOnComplete;
    anotherTakeRequest = request;
    setAnotherTakeSubmitting(true);
    generationQueue.push({
      request,
      selectionEpoch,
      source: "another-take",
    });
    void processQueue();
  };

  const generate = () => {
    if (!props.generationAvailable || continuousGenerationSuppressed()) {
      return;
    }
    const categoryKey = generationCategoryKey();
    const automaticRun = automaticGenerationRuns.snapshot();
    if (
      !categoryKey ||
      !automaticRun ||
      !automaticGenerationRuns.canEnqueue({
        categoryKey,
        runID: automaticRun.id,
      })
    ) {
      return;
    }
    const request = createGenerationForSelection(
      selectionKey(),
      (currentCategoryKey) =>
        createCategoryGenerationRequest(
          currentCategoryKey,
          instrumental(),
          countStationTrackVariations(stationTracks()),
          selectedMinutes() * 60,
          customCategories(),
        ),
    );
    if (!request) return;
    generationQueue.push({
      automaticGenerationRunID: automaticRun.id,
      request,
      selectionEpoch,
      source: "continuous",
    });
    void processQueue();
  };

  function noteExplicitRendererInteraction() {
    lastRendererInteractionAt = Date.now();
    const wasSuppressed = continuousGenerationSuppressed();
    setContinuousGenerationSuppressed(false);
    if (!wasSuppressed) return;
    queueMicrotask(() => {
      if (
        !disposed &&
        autoCreate() &&
        generationCategoryKey() &&
        !generating() &&
        generationQueue.length === 0
      ) {
        generate();
      }
    });
  }

  function effectiveOvernightConditions(
    conditions: OvernightSystemStatus,
  ): OvernightSystemStatus {
    if (lastRendererInteractionAt === 0) return conditions;
    const localIdleSeconds = Math.max(
      0,
      Math.floor((Date.now() - lastRendererInteractionAt) / 1_000),
    );
    return {
      ...conditions,
      idleSeconds: Math.min(conditions.idleSeconds, localIdleSeconds),
    };
  }

  function readRecoverableOvernightBatch() {
    let state = readOvernightBatch(window.localStorage);
    if (overnightRecoveryChecked) return state;
    overnightRecoveryChecked = true;
    if (!state) return state;
    const recovered = recoverInterruptedOvernightBatch(
      state,
      overnightSessionID,
      Date.now(),
    );
    if (recovered !== state) {
      writeOvernightBatch(window.localStorage, recovered);
      state = recovered;
    }
    return state;
  }

  function discardQueuedContinuousGeneration() {
    const retained = generationQueue.filter(
      (queued) => queued.source !== "continuous",
    );
    const discarded = generationQueue.length - retained.length;
    generationQueue.splice(0, generationQueue.length, ...retained);
    return discarded;
  }

  async function refreshOvernightScheduling(
    announcedConditions?: OvernightSystemStatus,
  ) {
    if (
      !props.generationAvailable ||
      disposed ||
      !initialLibraryLoaded ||
      overnightScheduling
    ) {
      return;
    }
    overnightScheduling = true;
    try {
      const measured =
        announcedConditions ??
        (await music.getOvernightSystemStatus());
      if (disposed || !props.generationAvailable) return;
      const conditions = effectiveOvernightConditions(measured);
      let state = readRecoverableOvernightBatch();
      const wasSuppressed = continuousGenerationSuppressed();
      const plan = planOvernightScheduling({
        batchStatus: state?.status ?? "none",
        conditions,
        generationActive: generating(),
        queuedSources: generationQueue.map((queued) => queued.source),
      });

      setContinuousGenerationSuppressed(plan.suppressContinuous);
      if (plan.discardQueuedContinuous) {
        discardQueuedContinuousGeneration();
      }

      if (!plan.suppressContinuous && wasSuppressed) {
        queueMicrotask(() => {
          if (
            !disposed &&
            autoCreate() &&
            generationCategoryKey() &&
            !generating() &&
            generationQueue.length === 0
          ) {
            generate();
          }
        });
      }
      if (!plan.admitOvernight || !state) return;

      state = prepareNextOvernightItem(state, Date.now());
      writeOvernightBatch(window.localStorage, state);
      const pending = state.pending;
      if (state.status !== "armed" || !pending || pending.inFlight) {
        return;
      }
      const category = overnightBatchCategory(
        state,
        pending.categoryKey,
      );
      state = beginOvernightAttempt(
        state,
        overnightSessionID,
        Date.now(),
      );
      writeOvernightBatch(window.localStorage, state);

      const categoryTracks = filterTracksForCategory(
        tracks(),
        pending.categoryKey,
      );
      const request = createCategoryGenerationRequest(
        pending.categoryKey,
        instrumental(),
        countStationTrackVariations(categoryTracks),
        selectedMinutes() * 60,
        customCategories(),
      );
      if (!request || !category) {
        const failed = failOvernightAttempt(
          state,
          pending.categoryKey,
          "Category is no longer available for generation",
          Date.now(),
        );
        writeOvernightBatch(window.localStorage, failed.state);
        queueMicrotask(() => void refreshOvernightScheduling());
        return;
      }

      generationQueue.push({
        overnightBatchID: state.id,
        request,
        selectionEpoch,
        source: "overnight",
      });
      void processQueue();
    } finally {
      overnightScheduling = false;
    }
  }

  function recordOvernightSuccess(queued: GenerationQueueEntry) {
    if (!queued.overnightBatchID) return;
    const current = readOvernightBatch(window.localStorage);
    if (
      !current ||
      current.id !== queued.overnightBatchID ||
      current.status !== "armed"
    ) {
      return;
    }
    writeOvernightBatch(
      window.localStorage,
      completeOvernightAttempt(
        current,
        queued.request.categoryKey,
        Date.now(),
      ),
    );
  }

  function recordOvernightFailure(
    queued: GenerationQueueEntry,
    cause: unknown,
  ) {
    if (!queued.overnightBatchID) return;
    const current = readOvernightBatch(window.localStorage);
    if (
      !current ||
      current.id !== queued.overnightBatchID ||
      current.status !== "armed"
    ) {
      return;
    }
    const failed = failOvernightAttempt(
      current,
      queued.request.categoryKey,
      cause instanceof Error ? cause.message : "Music generation failed",
      Date.now(),
    );
    writeOvernightBatch(window.localStorage, failed.state);
  }

  function recordGeneratedCategoryArrival(queued: GenerationQueueEntry) {
    const current = newMusicCategoryKeys();
    const next = recordGeneratedCategoryNewMusic(current, {
      categoryKey: queued.request.categoryKey,
      selectedCategoryKey: generationCategoryKey(),
      source: queued.source,
    });
    if (next === current) return;
    setNewMusicCategoryKeys(next);
    writeNewCategoryMusic(window.localStorage, next);
  }

  function recordAutomaticGenerationCompletion(
    queued: GenerationQueueEntry,
    succeeded: boolean,
  ) {
    return automaticGenerationRuns.recordCompletion({
      categoryKey: queued.request.categoryKey,
      runID:
        queued.source === "continuous"
          ? queued.automaticGenerationRunID
          : undefined,
      source: queued.source,
      succeeded,
    });
  }

  function clearNewMusicForCategory(categoryKey: MusicCategoryKey) {
    const current = newMusicCategoryKeys();
    const next = clearCategoryNewMusic(current, categoryKey);
    if (next === current) return;
    setNewMusicCategoryKeys(next);
    writeNewCategoryMusic(window.localStorage, next);
  }

  const generationResultMatchesCurrentSelection = (
    queued: GenerationQueueEntry,
  ) =>
    queued.source === "overnight"
      ? false
      : generationResultMatchesSelection(
          {
            categoryKey: queued.request.categoryKey,
            selectionEpoch: queued.selectionEpoch,
          },
          generationCategoryKey(),
          selectionEpoch,
        );

  async function processQueue() {
    if (!props.generationAvailable) {
      generationQueue.splice(0);
      return;
    }
    if (generating()) return;
    setGenerating(true);
    setError("");
    while (generationQueue.length > 0) {
      if (!props.generationAvailable) {
        generationQueue.splice(0);
        break;
      }
      const queued = generationQueue.shift();
      if (!queued) continue;
      const { request } = queued;
      const isAnotherTake = queued.source === "another-take";
      const isOvernight = queued.source === "overnight";
      const playAnotherTakeOnComplete =
        isAnotherTake && anotherTakePlayOnComplete;
      let completed = false;
      let overnightPowerActive = false;
      try {
        if (isOvernight) {
          await music.setOvernightGenerationActive(true);
          overnightPowerActive = true;
        }
        let item: MusicTrack;
        try {
          item = await music.generate(request);
        } finally {
          if (overnightPowerActive) {
            await music
              .setOvernightGenerationActive(false)
              .catch((cause: unknown) => {
                console.error(
                  "Could not release overnight power protection.",
                  cause,
                );
              });
            overnightPowerActive = false;
          }
        }
        metadataVersion += 1;
        setTracks((current) => upsertCompletedTrack(current, item));
        recordGeneratedCategoryArrival(queued);
        void refresh().catch(() => undefined);
        if (isOvernight) recordOvernightSuccess(queued);
        if (generationResultMatchesCurrentSelection(queued)) {
          const admission = admitGeneratedTrack({
            playlist: playlist(),
            trackID: item.id,
          });
          setPlaylist(admission.playlist);
          pendingJump ??= admission.pendingJump;
          if (
            playAnotherTakeOnComplete ||
            (admission.startImmediately && !playing())
          ) {
            await play(item);
          }
        }
        const automaticCompletion =
          recordAutomaticGenerationCompletion(queued, true);
        if (
          automaticCompletion.counted &&
          automaticCompletion.limitReached
        ) {
          setAutoCreate(false);
          categoryGenerationIntent.clear();
          setCategoryGenerationPending(false);
          discardQueuedContinuousGeneration();
        }
        completed = true;
      } catch (cause) {
        recordAutomaticGenerationCompletion(queued, false);
        if (isOvernight) recordOvernightFailure(queued, cause);
        if (generationResultMatchesCurrentSelection(queued)) {
          setError(
            (
              cause instanceof Error
                ? cause.message
                : "Music generation failed"
            )
              .replace(
                /^Error invoking remote method 'locomo-music:generate': Error:\s*/,
                "",
              )
              .split("\n")[0]
              ?.slice(0, 240) || "Music generation failed",
          );
          if (
            queued.source === "continuous" &&
            (request.lyrics.trim().length === 0) === instrumental()
          ) {
            setAutoCreate(false);
          }
        }
      }
      if (isAnotherTake) {
        anotherTakePlayOnComplete = false;
        anotherTakeRequest = undefined;
        setAnotherTakeSubmitting(false);
      }
      if (
        completed &&
        !disposed &&
        generationResultMatchesCurrentSelection(queued) &&
        autoCreate() &&
        !continuousGenerationSuppressed() &&
        generationQueue.length === 0
      ) {
        generate();
      }
    }
    setGenerating(false);
    if (
      shouldGenerateAfterQueueDrain({
        autoCreate:
          autoCreate() && !continuousGenerationSuppressed(),
        categoryKey: generationCategoryKey(),
        disposed,
        queuedRequests: generationQueue.length,
      })
    ) {
      generate();
    }
    if (
      readOvernightBatch(window.localStorage) ||
      continuousGenerationSuppressed()
    ) {
      void refreshOvernightScheduling();
    }
  }

  const retainPriorityGenerationWork = (
    discarded: readonly GenerationQueueEntry[],
  ) => {
    generationQueue.push(
      ...discarded.filter(
        (queued) => queued.source !== "continuous",
      ),
    );
  };

  const selectStation = (
    key: MusicCategoryKey,
    explicitCategorySelection = false,
  ) => {
    if (explicitCategorySelection) {
      setAutoCreate(true);
      automaticGenerationRuns.start(
        key,
        readAutomaticGenerationLimit(window.localStorage),
      );
    }
    playbackRequests.cancel();
    releaseActiveAudioSource();
    pendingJump = undefined;
    selectionEpoch += 1;
    setPlaying(undefined);
    setProgress(0);
    setSelected(undefined);
    setSelectionKey(key);
    const seed = seedCategoryPlaylist(tracks(), key);
    setPlaylist(seed.playlist);
    if (seed.startingTrack) void play(seed.startingTrack);
    retainPriorityGenerationWork(generationQueue.splice(0));
    const customCategorySelected = customCategories().some(
      (candidate) => candidate.key === key,
    );
    const shouldGenerate = shouldGenerateOnCategorySelection({
      autoCreate: explicitCategorySelection || autoCreate(),
      isCustomCategory: customCategorySelected,
      preloadedTrackCount: seed.preloaded.length,
    });
    const generateImmediately = categoryGenerationIntent.noteSelection({
      generationAvailable: props.generationAvailable,
      shouldGenerate,
    });
    setCategoryGenerationPending(
      shouldGenerate && !props.generationAvailable,
    );
    if (generateImmediately) {
      generate();
    }
    requestWindowExpansion();
  };

  const selectCategoryCard = (key: MusicCategoryKey) => {
    clearNewMusicForCategory(key);
    selectStation(key, true);
  };

  const selectFavorites = () => {
    automaticGenerationRuns.stop();
    categoryGenerationIntent.clear();
    setCategoryGenerationPending(false);
    playbackRequests.cancel();
    releaseActiveAudioSource();
    pendingJump = undefined;
    selectionEpoch += 1;
    setPlaying(undefined);
    setProgress(0);
    setSelected(undefined);
    setSelectionKey(FAVORITES_COLLECTION_KEY);
    const seed = seedFavoritesPlaylist(tracks());
    setPlaylist(seed.playlist);
    if (seed.startingTrack) void play(seed.startingTrack);
    retainPriorityGenerationWork(generationQueue.splice(0));
    requestWindowExpansion();
  };

  createEffect(() => {
    if (
      !categoryGenerationIntent.admitOnReadiness({
        categoryKey: generationCategoryKey(),
        generationAvailable: props.generationAvailable,
      })
    ) {
      return;
    }
    setCategoryGenerationPending(false);
    queueMicrotask(() => {
      if (!disposed && props.generationAvailable) generate();
    });
  });

  const toggleAutoCreate = () => {
    if (!props.generationAvailable) {
      if (!generationCategoryKey()) return;
      if (categoryGenerationPending()) {
        setAutoCreate(false);
        automaticGenerationRuns.stop();
        categoryGenerationIntent.clear();
        setCategoryGenerationPending(false);
        retainPriorityGenerationWork(generationQueue.splice(0));
        return;
      }
      const categoryKey = generationCategoryKey();
      if (!categoryKey) return;
      setAutoCreate(true);
      automaticGenerationRuns.start(
        categoryKey,
        readAutomaticGenerationLimit(window.localStorage),
      );
      categoryGenerationIntent.noteSelection({
        generationAvailable: false,
        shouldGenerate: true,
      });
      setCategoryGenerationPending(true);
      return;
    }
    if (autoCreate()) {
      setAutoCreate(false);
      automaticGenerationRuns.stop();
      categoryGenerationIntent.clear();
      setCategoryGenerationPending(false);
      retainPriorityGenerationWork(generationQueue.splice(0));
      return;
    }
    const categoryKey = generationCategoryKey();
    if (!categoryKey) return;
    automaticGenerationRuns.start(
      categoryKey,
      readAutomaticGenerationLimit(window.localStorage),
    );
    setAutoCreate(true);
    if (
      !generating() &&
      generationQueue.length === 0
    ) {
      generate();
    }
  };

  const closeAddCategory = () => {
    setAddCategoryOpen(false);
    setCustomCategoryPrompt("");
  };

  const addCustomCategory = () => {
    const prompt = customCategoryPrompt();
    if (prompt.trim().length === 0) return;

    try {
      const definition = createCustomCategoryDefinition(
        customCategoryDefinitions(),
        prompt,
        crypto.randomUUID(),
      );
      const nextDefinitions = [
        ...customCategoryDefinitions(),
        definition,
      ];
      writeCustomCategoryDefinitions(
        window.localStorage,
        nextDefinitions,
      );
      setCustomCategoryDefinitions(nextDefinitions);
      setError("");
      closeAddCategory();
    } catch (cause) {
      setError(readTrackError(cause, "Could not save this category"));
    }
  };

  return (
    <section
      class="locomo-studio fixed inset-0 z-30 flex min-h-0 flex-col overflow-hidden bg-locomo-surface text-locomo-foreground"
      data-height-layout={heightLayout().mode}
      data-height-scale={heightLayout().scale}
      data-continuous-generation={
        props.generationAvailable && autoCreate() ? "running" : "stopped"
      }
      data-generation-available={
        props.generationAvailable ? "true" : "false"
      }
      data-generation-intent-pending={
        categoryGenerationPending() ? "true" : "false"
      }
      data-automatic-generation-run={
        automaticGenerationRun()?.status ?? "inactive"
      }
      data-automatic-generation-successes={
        automaticGenerationRun()?.successfulSongs ?? 0
      }
      data-automatic-generation-limit={
        automaticGenerationRun()?.limit
      }
      data-generation-duration-seconds={selectedMinutes() * 60}
      style={compactHeightStyle()}
    >
      <audio
        ref={audio}
        onPlay={() => {
          const trackID = selected();
          if (playbackHistory.started(trackID) && trackID) {
            setTracks((current) => markTrackPlayed(current, trackID));
          }
          setPlaying(trackID);
        }}
        onPause={() => setPlaying(undefined)}
        onTimeUpdate={() => setProgress(audio?.currentTime ?? 0)}
        onEnded={() => {
          playbackHistory.ended(selected());
          setPlaying(undefined);
          setProgress(0);
          const available = new Set(tracks().map((track) => track.id));
          const ids = playlist().filter((id) => available.has(id));
          if (ids.length !== playlist().length) setPlaylist(ids);
          if (ids.length === 0) return;
          const nextID = nextTrackAtPlaybackBoundary(
            ids,
            selected(),
            pendingJump,
          );
          pendingJump = undefined;
          const next = tracks().find((track) => track.id === nextID);
          if (next) void play(next);
        }}
      />
      <div
        data-studio-panes
        class="flex min-h-0 flex-1"
        style={{
          width: `${
            visibleTrackDetailsSelection()
              ? paneLayout().trackDetails
              : paneLayout().revealed
          }px`,
          "min-width": `${
            visibleTrackDetailsSelection()
              ? paneLayout().trackDetails
              : paneLayout().revealed
          }px`,
        }}
      >
        <div
          data-category-pane
          class="studio-pane-vertical-rails flex shrink-0 flex-col px-6"
          style={{
            width: `${paneLayout().left}px`,
            "min-width": `${paneLayout().left}px`,
          }}
        >
          <h1
            data-category-grid-heading
            class="studio-pane-heading mb-6 shrink-0 text-pane-heading"
          >
            Tap to play
          </h1>
          <div
            data-category-grid
            class="grid min-h-0 flex-1 gap-2"
            classList={{
              "category-grid--existing": categorySet() === "existing",
              "grid-cols-3 auto-rows-[minmax(92px,1fr)] overflow-y-auto":
                categorySet() === "experimental",
              "grid-cols-[repeat(20,minmax(0,1fr))] grid-rows-[repeat(2,196px)_repeat(3,130.5px)] content-start overflow-hidden":
                categorySet() === "existing",
            }}
          >
            <For each={categoryTiles()}>
              {(item) => (
                <button
                  type="button"
                  data-station={item.name}
                  data-category-key={
                    item.kind === "category" ? item.key : undefined
                  }
                  data-collection-key={
                    item.kind === "favorites" ? item.key : undefined
                  }
                  data-category-card={
                    isFeaturedExistingCategoryTile(item)
                      ? "featured"
                      : "standard"
                  }
                  aria-label={`${categoryDisplayName(item.name)}, ${item.artist ?? item.group}`}
                  aria-pressed={selectionKey() === item.key}
                  class="category-card group/station relative min-h-0 overflow-hidden rounded-xl border text-left transition-all"
                  classList={{
                    "col-span-10":
                      categorySet() === "existing" &&
                      isFeaturedExistingCategoryTile(item),
                    "col-span-4":
                      categorySet() === "existing" &&
                      !isFeaturedExistingCategoryTile(item),
                    "border-locomo-surface/45 bg-locomo-foreground":
                      selectionKey() === item.key,
                    "border-locomo-contrast/45 hover:border-locomo-contrast":
                      selectionKey() !== item.key,
                    "bg-locomo-foreground": isCustomCategoryTile(item),
                  }}
                  onClick={() =>
                    item.kind === "favorites"
                      ? selectFavorites()
                      : selectCategoryCard(item.key)
                  }
                >
                  <Show when={categoryArtworkMask(item)}>
                    {(artwork) => (
                      <span
                        aria-hidden="true"
                        data-station-artwork={artwork()}
                        class="pointer-events-none absolute inset-0"
                        classList={{
                          "text-locomo-surface":
                            selectionKey() === item.key,
                          "text-locomo-foreground":
                            selectionKey() !== item.key,
                        }}
                        style={{
                          "background-color": "currentColor",
                          "-webkit-mask-image": `url('${artwork()}')`,
                          "mask-image": `url('${artwork()}')`,
                          "-webkit-mask-position": "center",
                          "mask-position": "center",
                          "-webkit-mask-repeat": "no-repeat",
                          "mask-repeat": "no-repeat",
                          "-webkit-mask-size": categoryArtworkMaskSize(item),
                          "mask-size": categoryArtworkMaskSize(item),
                        }}
                      />
                    )}
                  </Show>
                  <Show when={isCustomCategoryTile(item)}>
                    <span class="pointer-events-none absolute inset-x-2 top-2 z-10 line-clamp-3 whitespace-pre-wrap rounded-md bg-locomo-surface/95 p-2 pr-7 text-[9px] leading-snug text-locomo-foreground opacity-0 transition-opacity group-hover/station:opacity-100">
                      {item.kind === "category"
                        ? item.customPrompt
                        : undefined}
                    </span>
                  </Show>
                  <Show
                    when={
                      item.kind === "category" &&
                      hasNewCategoryMusic(item.key)
                    }
                  >
                    <span
                      data-new-category-music-badge
                      aria-label={`New music in ${categoryDisplayName(item.name)}`}
                      class="category-card__badge pointer-events-none absolute right-1.5 top-1.5 z-30 rounded-full px-1.5 py-1 text-[8px] font-black leading-none tracking-[0.08em] shadow-sm"
                      classList={{
                        "bg-locomo-surface text-locomo-foreground":
                          selectionKey() === item.key,
                        "bg-locomo-contrast text-locomo-surface":
                          selectionKey() !== item.key,
                      }}
                    >
                      NEW
                    </span>
                  </Show>
                  <span class="category-card__label absolute inset-x-2.5 bottom-2.5 pb-px">
                    <span
                      class="category-card__title block overflow-visible leading-[1.25]"
                      classList={{
                        "text-[31.2px] font-bold":
                          isFeaturedExistingCategoryTile(item),
                        "text-[12.1px] font-bold":
                          !isFeaturedExistingCategoryTile(item),
                        "text-locomo-surface":
                          isCustomCategoryTile(item) ||
                          selectionKey() === item.key,
                        "text-locomo-foreground":
                          !isCustomCategoryTile(item) &&
                          selectionKey() !== item.key,
                      }}
                    >
                      {categoryDisplayName(item.name)}
                    </span>
                  </span>
                </button>
              )}
            </For>
            <Show when={categorySet() === "experimental"}>
              <button
                type="button"
                data-add-category
                aria-label="Add category"
                class="min-h-0 rounded-xl border border-locomo-contrast/45 bg-transparent text-13-bold text-locomo-contrast transition-colors hover:border-locomo-contrast hover:bg-locomo-foreground hover:text-locomo-surface"
                onClick={() => {
                  setCustomCategoryPrompt("");
                  setAddCategoryOpen(true);
                }}
              >
                + Add category
              </button>
            </Show>
          </div>
          <Show when={error()}>
            <p class="shrink-0 pt-3 text-center text-12-regular text-locomo-danger">
              {error()}
            </p>
          </Show>
        </div>
        <div
          data-right-pane
          class="studio-pane-vertical-rails flex h-full min-h-0 min-w-0 shrink-0 flex-col overflow-hidden px-8"
          style={{
            width: `${RIGHT_PANE_WIDTH}px`,
            "min-width": `${RIGHT_PANE_WIDTH}px`,
          }}
        >
          <Show when={props.setupSurface}>
            <div class="mb-5 shrink-0" data-studio-setup-slot>
              {props.setupSurface}
            </div>
          </Show>
          <Show
            when={station() && stationTracks().length > 0}
            fallback={
              <div
                data-empty-state
                class="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center px-8 pb-10 text-center"
              >
                <Music2
                  aria-hidden="true"
                  size={112}
                  strokeWidth={1.25}
                  class="text-locomo-contrast/20"
                />
                <div aria-live="polite" class="mt-8 min-h-12">
                  <Show
                    when={
                      props.generationAvailable &&
                      autoCreate() &&
                      generating() &&
                      !favoritesSelected()
                    }
                    fallback={
                      <p class="text-14-regular text-locomo-contrast/70">
                        {favoritesSelected()
                          ? FAVORITES_EMPTY_STATE
                          : station()
                          ? !props.generationAvailable
                            ? categoryGenerationPending()
                              ? generationWaitingTitle()
                              : "Set up music generation to create songs for this station."
                            : automaticGenerationLimitReached()
                              ? `Automatic song limit reached for ${station()}.`
                              : autoCreate()
                                ? `Preparing ${station()} radio…`
                                : `Continuous generation is stopped for ${station()}.`
                          : "Choose a station to begin."}
                      </p>
                    }
                  >
                    <div class="flex flex-col items-center gap-2 text-locomo-contrast/75">
                      <span class="size-6 animate-spin rounded-full border-[3px] border-locomo-contrast/20 border-t-locomo-contrast" />
                      <span class="text-14-regular">
                        Generating your next {station()} song…
                      </span>
                      <span class="text-11-regular text-locomo-contrast/45">
                        Running locally on this Mac
                      </span>
                    </div>
                  </Show>
                  <Show when={station() && !favoritesSelected()}>
                    <button
                      type="button"
                      data-generation-toggle
                      aria-label={
                        generationToggleActive()
                          ? "Stop continuous generation"
                          : "Start continuous generation"
                      }
                      aria-pressed={generationToggleActive()}
                      class="mt-3 rounded-full border border-locomo-contrast/45 px-3 py-1.5 text-[12px] font-semibold text-locomo-contrast transition-colors hover:border-locomo-contrast hover:bg-locomo-contrast hover:text-locomo-surface disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={toggleAutoCreate}
                    >
                      {generationToggleActive() ? "Stop" : "Start"}
                    </button>
                  </Show>
                </div>
              </div>
            }
          >
            <h1
              data-selected-category-heading
              class="studio-pane-heading mb-6 shrink-0 text-pane-heading"
            >
              {station()}
            </h1>
            <Show when={featured()}>
              {(track) => (
                <>
                  <div class="now-playing-card relative flex min-h-[230px] shrink-0 flex-col rounded-xl border border-locomo-contrast/50 bg-locomo-contrast/[0.025] p-8 max-[1166px]:p-5">
                    <div
                      data-now-playing-actions
                      class="absolute right-6 top-6 flex items-center max-[1166px]:right-3 max-[1166px]:top-3"
                    >
                      <div
                        data-now-playing-secondary-actions
                        class="now-playing-secondary-actions flex items-center"
                      >
                        <button
                          type="button"
                          data-now-playing-download
                          aria-label="Download song"
                          title="Download song"
                          class="p-2 text-locomo-contrast/45 hover:text-locomo-contrast"
                          onClick={(event) => {
                            void runDownloadSongAction(event, () =>
                              downloadTrack(track()),
                            );
                          }}
                        >
                          <Download size={16} />
                        </button>
                        <button
                          type="button"
                          data-now-playing-delete
                          aria-label="Delete track"
                          class="p-2 text-locomo-contrast/45 hover:text-locomo-danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteTrack(track());
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <button
                        type="button"
                        data-now-playing-favorite
                        aria-label={favoriteActionLabel(track().isFavorite)}
                        aria-pressed={track().isFavorite}
                        title={favoriteActionLabel(track().isFavorite)}
                        class="p-2 transition-colors"
                        classList={{
                          "text-locomo-danger hover:text-locomo-danger":
                            track().isFavorite,
                          "text-locomo-contrast/45 hover:text-locomo-danger":
                            !track().isFavorite,
                        }}
                        onClick={(event) =>
                          runFavoriteToggleAction(event, () =>
                            toggleFavorite(track()),
                          )
                        }
                      >
                        <Heart
                          size={16}
                          fill={
                            track().isFavorite ? "currentColor" : "none"
                          }
                        />
                      </button>
                    </div>
                    <div class="now-playing-card__content flex min-w-0 flex-1">
                      <div class="now-playing-card__body flex min-w-0 flex-1 flex-col py-2 max-[1166px]:py-0">
                        <div class="flex items-center gap-3">
                          <p class="shrink-0 text-[12px] font-semibold uppercase tracking-[0.16em] text-locomo-contrast/60">
                            Now playing
                          </p>
                          <canvas
                            ref={(element) => {
                              waveformCanvas = element;
                              queueMicrotask(() => {
                                if (element.isConnected) {
                                  paintNowPlayingWaveform(element);
                                }
                              });
                            }}
                            data-now-playing-waveform
                            aria-hidden="true"
                            class="h-5 w-24 shrink-0 text-locomo-contrast/55"
                          />
                        </div>
                        <div class="now-playing-card__title-wrap mt-2 min-w-0 pr-10">
                          <h2 class="now-playing-card__title min-w-0 truncate text-[32px] font-semibold leading-tight text-locomo-foreground">
                            {track().title ??
                              locomoMusicTrackTitle(track().prompt)}
                          </h2>
                        </div>
                        <div class="now-playing-card__transport mt-auto flex translate-y-6 items-center gap-5 pb-3 max-[1166px]:translate-y-1">
                          <button
                            type="button"
                            aria-label={
                              playing() === track().id ? "Pause" : "Play"
                            }
                            class="now-playing-card__play flex size-16 shrink-0 items-center justify-center rounded-full border border-locomo-foreground bg-locomo-foreground text-locomo-surface transition-colors hover:bg-transparent hover:text-locomo-foreground"
                            onClick={() => void play(track())}
                          >
                            {playing() === track().id ? (
                              <Pause size={25} />
                            ) : (
                              <Play size={25} />
                            )}
                          </button>
                          <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-3 text-[14px] font-medium tabular-nums text-locomo-contrast/65">
                              <span>
                                {formatMusicTime(
                                  selected() === track().id ? progress() : 0,
                                )}
                              </span>
                              <input
                                aria-label="Playback position"
                                type="range"
                                min={0}
                                max={track().duration}
                                step={0.1}
                                value={
                                  selected() === track().id ? progress() : 0
                                }
                                class="h-1 min-w-0 flex-1 accent-locomo-foreground"
                                onInput={(event) => {
                                  if (
                                    !audio ||
                                    selected() !== track().id
                                  ) {
                                    return;
                                  }
                                  audio.currentTime = Number(
                                    event.currentTarget.value,
                                  );
                                  setProgress(audio.currentTime);
                                }}
                              />
                              <span>
                                {formatMusicTime(track().duration)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </Show>

            <div class="studio-playlist-heading mt-8 flex shrink-0 items-baseline justify-between gap-4">
              <h2
                data-playlist-heading
                class="text-[24px] font-semibold text-locomo-foreground"
              >
                Playlist
              </h2>
              <div class="flex items-center gap-2">
                <span
                  data-song-count-pill
                  class="rounded-full border border-locomo-contrast/30 bg-locomo-contrast/[0.04] px-3 py-1.5 text-[13px] font-medium text-locomo-contrast/70"
                >
                  {stationTracks().length}{" "}
                  {stationTracks().length === 1 ? "song" : "songs"}
                </span>
              </div>
            </div>
            <div class="studio-playlist-card mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-locomo-contrast/50">
              <Show when={!favoritesSelected()}>
                <div
                  data-generation-row
                  class="grid shrink-0 grid-cols-[44px_minmax(0,1fr)_60px] items-center gap-5 border-b border-locomo-contrast/25 bg-locomo-contrast/[0.045] p-4"
                >
                  <div class="flex size-11 shrink-0 items-center justify-center rounded-full border border-locomo-contrast/45 text-locomo-contrast/70">
                    <Show
                      when={
                        props.generationAvailable &&
                        autoCreate() &&
                        generating()
                      }
                    >
                      <span
                        aria-hidden="true"
                        class="size-5 animate-spin rounded-full border-2 border-locomo-contrast/20 border-t-locomo-contrast"
                      />
                    </Show>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p
                      data-generation-status-title
                      class="font-bold text-locomo-foreground"
                      classList={{
                        "truncate text-[22px]":
                          !generationStatusTitleUsesCompactStyle(),
                        "whitespace-normal text-pretty text-[14px] leading-4":
                          generationStatusTitleUsesCompactStyle(),
                      }}
                    >
                      {!props.generationAvailable
                        ? categoryGenerationPending()
                          ? generationWaitingTitle()
                          : "Music generation needs setup"
                        : automaticGenerationLimitReached()
                          ? "Automatic song limit reached"
                          : autoCreate()
                            ? "Making a new song"
                            : "Make a new song"}
                    </p>
                    <Show
                      when={
                        props.generationAvailable ||
                        !categoryGenerationPending()
                      }
                    >
                      <p class="mt-0.5 truncate text-[11px] text-locomo-contrast/55">
                        {props.generationAvailable
                          ? automaticGenerationLimitReached()
                            ? `${automaticGenerationRun()?.successfulSongs ?? 0} of ${automaticGenerationRun()?.limit ?? 0} automatic songs made`
                            : "On this Mac"
                          : "Your saved songs stay available to play"}
                      </p>
                    </Show>
                  </div>
                  <button
                    type="button"
                    data-generation-toggle
                    aria-label={
                      generationToggleActive()
                        ? "Stop continuous generation"
                        : "Start continuous generation"
                    }
                    aria-pressed={generationToggleActive()}
                    class="w-full rounded-full border border-locomo-contrast/45 px-3 py-1.5 text-[12px] font-semibold text-locomo-contrast transition-colors hover:border-locomo-contrast hover:bg-locomo-contrast hover:text-locomo-surface disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={toggleAutoCreate}
                  >
                    {generationToggleActive() ? "Stop" : "Start"}
                  </button>
                </div>
              </Show>
              <div class="min-h-0 flex-1 overflow-y-auto">
                <For each={stationTracks()}>
                  {(track) => (
                    <div
                      data-playlist-track-id={track.id}
                      aria-current={
                        isCurrentSongRow(track.id, selected())
                          ? "true"
                          : undefined
                      }
                      class="song-row group flex cursor-pointer items-center gap-5 border-b border-locomo-contrast/25 p-4 last:border-b-0 hover:bg-locomo-contrast/[0.045]"
                      onClick={() => void play(track)}
                    >
                      <button
                        type="button"
                        aria-label={
                          playing() === track.id ? "Pause" : "Play"
                        }
                        class="song-row__play flex size-11 shrink-0 items-center justify-center rounded-full border border-locomo-contrast/45 text-locomo-contrast/70 transition-colors hover:border-locomo-contrast hover:bg-locomo-contrast hover:text-locomo-surface"
                        onClick={(event) => {
                          event.stopPropagation();
                          void play(track);
                        }}
                      >
                        {playing() === track.id ? (
                          <Pause size={15} />
                        ) : (
                          <Play size={15} />
                        )}
                      </button>
                      <div class="min-w-0 flex-1">
                        <div class="song-row__label">
                          <span
                            data-unplayed-indicator-slot
                            aria-hidden="true"
                            class="flex w-1.5 shrink-0 items-center justify-center"
                          >
                            <Show when={!track.isPlayed}>
                              <span
                                data-unplayed-indicator
                                class="size-1.5 rounded-full bg-current opacity-60"
                              />
                            </Show>
                          </span>
                          <p class="song-row__title min-w-0 truncate text-[18px] font-semibold text-locomo-foreground">
                            {track.title ??
                              locomoMusicTrackTitle(track.prompt)}
                          </p>
                          <Show when={track.remakeSourceTrackID}>
                            <span
                              data-remake-tag
                              class="shrink-0 rounded-full border border-current px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-current opacity-50"
                            >
                              Remake
                            </span>
                          </Show>
                          <span class="song-row__duration text-11-regular shrink-0 tabular-nums text-locomo-contrast/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            {formatSongRowDuration(track.duration)}
                          </span>
                        </div>
                        <Show when={favoritesSelected()}>
                          <Show
                            when={favoriteSourceCategoryLabel(
                              track.categoryKey,
                              customCategories(),
                            )}
                          >
                            {(categoryLabel) => (
                              <p
                                data-favorite-source-category
                                class="song-row__subtext mt-1 truncate text-[11px] leading-tight"
                              >
                                {categoryLabel()}
                              </p>
                            )}
                          </Show>
                        </Show>
                      </div>
                      <div class="flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          type="button"
                          aria-label="Download song"
                          title="Download song"
                          class="p-2 text-locomo-contrast/45 hover:text-locomo-contrast"
                          onClick={(event) => {
                            void runDownloadSongAction(event, () =>
                              downloadTrack(track),
                            );
                          }}
                        >
                          <Download size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={favoriteActionLabel(
                            track.isFavorite,
                          )}
                          aria-pressed={track.isFavorite}
                          title={favoriteActionLabel(track.isFavorite)}
                          class="p-2"
                          classList={{
                            "text-locomo-danger hover:text-locomo-danger":
                              track.isFavorite,
                            "text-locomo-contrast/45 hover:text-locomo-danger":
                              !track.isFavorite,
                          }}
                          onClick={(event) =>
                            runFavoriteToggleAction(event, () =>
                              toggleFavorite(track),
                            )
                          }
                        >
                          <Heart
                            size={16}
                            fill={
                              track.isFavorite ? "currentColor" : "none"
                            }
                          />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete track"
                          class="p-2 text-locomo-contrast/45 hover:text-locomo-danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteTrack(track);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
        <Show when={visibleTrackDetailsSelection()}>
          {(track) => (
            <aside
              id="track-generation-details-pane"
              data-track-details-pane
              aria-label="Track generation details"
              class="flex h-full min-h-0 shrink-0 flex-col border-l border-locomo-contrast/35 bg-locomo-contrast/[0.025]"
              style={{
                width: `${TRACK_DETAILS_PANE_WIDTH}px`,
                "min-width": `${TRACK_DETAILS_PANE_WIDTH}px`,
              }}
            >
              <header class="flex shrink-0 items-start gap-4 border-b border-locomo-contrast/25 px-6 pb-5 pt-7">
                <div class="min-w-0">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-locomo-contrast/55">
                    Song details
                  </p>
                  <h2 class="mt-2 truncate text-[22px] font-semibold leading-tight text-locomo-foreground">
                    {track().title ??
                      locomoMusicTrackTitle(track().prompt)}
                  </h2>
                </div>
              </header>
              <div class="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                <section>
                  <div class="flex items-center justify-between gap-3">
                    <h3 class="text-[11px] font-semibold tracking-[0.16em] text-locomo-contrast/55">
                      Prompt ·{" "}
                      {trackDetailsLoading()
                        ? "Loading…"
                        : promptRecipeVersionLabel(
                            trackDetails()?.promptRecipeVersion,
                          )}
                    </h3>
                    <button
                      type="button"
                      data-toggle-prompt-approval
                      aria-label={
                        selectedPromptExampleApproved()
                          ? "Remove this approved prompt example"
                          : "Approve this prompt example"
                      }
                      aria-pressed={selectedPromptExampleApproved()}
                      title={
                        selectedPromptExampleApproved()
                          ? "Remove this approved prompt example"
                          : "Approve this prompt example"
                      }
                      disabled={trackDetailsLoading()}
                      class="shrink-0 rounded-full p-1.5 transition-colors disabled:cursor-wait disabled:opacity-40"
                      classList={{
                        "bg-locomo-foreground text-locomo-surface":
                          selectedPromptExampleApproved(),
                        "text-locomo-contrast/45 hover:bg-locomo-contrast/[0.08] hover:text-locomo-contrast":
                          !selectedPromptExampleApproved(),
                      }}
                      onClick={togglePromptApproval}
                    >
                      <ThumbsUp
                        size={15}
                        fill={
                          selectedPromptExampleApproved()
                            ? "currentColor"
                            : "none"
                        }
                      />
                    </button>
                  </div>
                  <p class="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-locomo-contrast/85">
                    {trackDetails()?.prompt ?? track().prompt}
                  </p>
                </section>
                <section class="mt-7 border-t border-locomo-contrast/25 pt-6">
                  <div class="flex items-center justify-between gap-3">
                    <h3 class="text-[11px] font-semibold tracking-[0.16em] text-locomo-contrast/55">
                      Planner Caption ·{" "}
                      {trackDetailsLoading()
                        ? "Loading…"
                        : plannerModelLabel(trackDetails())}
                    </h3>
                    <Show when={import.meta.env.DEV}>
                      <button
                        type="button"
                        data-generate-another-take
                        aria-label="Generate another take"
                        title="Generate another take"
                        disabled={
                          !props.generationAvailable ||
                          trackDetailsLoading() ||
                          anotherTakeSubmitting() ||
                          !track().categoryKey ||
                          !trackDetails()?.anotherTake
                        }
                        class="shrink-0 rounded-full p-1.5 text-locomo-contrast/45 transition-colors hover:bg-locomo-contrast/[0.08] hover:text-locomo-contrast disabled:cursor-not-allowed disabled:opacity-30"
                        onClick={generateAnotherTake}
                      >
                        <Recycle size={15} />
                      </button>
                    </Show>
                  </div>
                  <p
                    aria-live="polite"
                    class="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-locomo-contrast/85"
                  >
                    {trackDetailsLoading()
                      ? "Loading…"
                      : trackDetails()?.plannerCaption ??
                        "Unavailable for this track"}
                  </p>
                </section>
              </div>
            </aside>
          )}
        </Show>
      </div>
      <Show when={addCategoryOpen()}>
        <div
          data-add-category-modal
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6 backdrop-blur-[2px]"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            closeAddCategory();
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-category-title"
            class="w-[min(420px,calc(100vw-48px))] rounded-xl border border-locomo-foreground bg-locomo-surface p-5 text-locomo-foreground shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              addCustomCategory();
            }}
          >
            <h2 id="add-category-title" class="text-[18px] font-semibold">
              Add category
            </h2>
            <textarea
              ref={(element) => queueMicrotask(() => element.focus())}
              data-custom-category-prompt
              rows={6}
              value={customCategoryPrompt()}
              placeholder="Paste your prompt here…"
              class="mt-4 block w-full resize-none rounded-lg border border-locomo-foreground/45 bg-locomo-surface p-3 text-13-regular text-locomo-foreground placeholder:text-locomo-contrast/45"
              onInput={(event) =>
                setCustomCategoryPrompt(event.currentTarget.value)
              }
            />
            <div class="mt-4 flex justify-end gap-2">
              <button
                type="button"
                class="rounded-lg border border-locomo-foreground/45 px-4 py-2 text-12-bold text-locomo-foreground hover:border-locomo-foreground"
                onClick={closeAddCategory}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={customCategoryPrompt().trim().length === 0}
                class="rounded-lg border border-locomo-foreground bg-locomo-foreground px-4 py-2 text-12-bold text-locomo-surface disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </form>
        </div>
      </Show>
    </section>
  );
}

function formatMusicTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

function locomoMusicTrackTitle(prompt: string) {
  return prompt.split(".")[0] || prompt;
}

function isCustomCategoryTile(item: VisibleCategoryTile): boolean {
  return item.kind === "category" && item.customPrompt !== undefined;
}

function promptRecipeVersionLabel(
  version: MusicTrackGenerationDetails["promptRecipeVersion"] | undefined,
) {
  if (version === "v1") return "V1";
  if (version === "v2.3") return "V2.3";
  if (version === "custom") return "Custom";
  return "Unknown";
}

function plannerModelLabel(
  details: MusicTrackGenerationDetails | undefined,
) {
  if (!details) return "Unavailable";
  if (!details.plannerModel) {
    return details.plannerCaption === null ? "Unavailable" : "Unknown";
  }
  if (
    details.plannerModel.backend === "gguf-q8" &&
    details.plannerModel.fileName === "acestep-5Hz-lm-4B-Q8_0.gguf"
  ) {
    return "ACE-Step 4B Q8";
  }
  return details.plannerModel.fileName;
}

function readTrackError(cause: unknown, fallback: string): string {
  return (cause instanceof Error ? cause.message : fallback)
    .replace(
      /^Error invoking remote method 'locomo-music:(?:read|delete|set-favorite)': Error:\s*/,
      "",
    )
    .split("\n")[0]
    ?.slice(0, 240) || fallback;
}
