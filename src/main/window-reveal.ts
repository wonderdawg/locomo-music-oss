import {
  DEFAULT_WINDOW_HEIGHT,
  REVEALED_WINDOW_WIDTH,
  studioPaneWidths,
} from "../shared/window-layout";

export interface WindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ExpandableWindow {
  getBounds(): WindowBounds;
  getMaximumSize(): number[];
  setBounds(bounds: WindowBounds, animate: boolean): void;
  setMaximumSize(width: number, height: number): void;
}

const expandedWindows = new WeakSet<ExpandableWindow>();
const trackDetailsPreviousState = new WeakMap<
  ExpandableWindow,
  {
    readonly bounds: WindowBounds;
    readonly maximumHeight: number;
    readonly maximumWidth: number;
  }
>();

export function collapsedWindowBounds(
  workArea: WindowBounds,
): WindowBounds {
  const height = Math.min(DEFAULT_WINDOW_HEIGHT, workArea.height);
  const responsiveWidths = studioPaneWidths(height);
  const revealedWidth = Math.min(
    responsiveWidths.revealed,
    workArea.width,
  );
  const width = Math.min(responsiveWidths.left, revealedWidth);

  return {
    x: workArea.x + Math.floor((workArea.width - revealedWidth) / 2),
    y: workArea.y + Math.floor((workArea.height - height) / 2),
    width,
    height,
  };
}

export function expandedWindowBounds(
  currentBounds: WindowBounds,
  workArea: WindowBounds,
): WindowBounds {
  const height = Math.min(currentBounds.height, workArea.height);
  const width = Math.min(
    studioPaneWidths(height).revealed,
    workArea.width,
  );

  return {
    x: clamp(
      currentBounds.x,
      workArea.x,
      workArea.x + workArea.width - width,
    ),
    y: clamp(
      currentBounds.y,
      workArea.y,
      workArea.y + workArea.height - height,
    ),
    width,
    height,
  };
}

export function trackDetailsWindowBounds(
  currentBounds: WindowBounds,
  workArea: WindowBounds,
): WindowBounds {
  const height = Math.min(currentBounds.height, workArea.height);
  const width = Math.min(
    studioPaneWidths(height).trackDetails,
    workArea.width,
  );

  return {
    x: clamp(
      currentBounds.x,
      workArea.x,
      workArea.x + workArea.width - width,
    ),
    y: clamp(
      currentBounds.y,
      workArea.y,
      workArea.y + workArea.height - height,
    ),
    width,
    height,
  };
}

export function responsiveWindowBounds(
  window: ExpandableWindow,
  proposedBounds: WindowBounds,
  workArea: WindowBounds,
): WindowBounds {
  const height = Math.min(proposedBounds.height, workArea.height);
  const responsiveWidths = studioPaneWidths(height);
  const targetWidth = trackDetailsPreviousState.has(window)
    ? responsiveWidths.trackDetails
    : expandedWindows.has(window)
      ? responsiveWidths.revealed
      : responsiveWidths.left;
  const width = Math.min(targetWidth, workArea.width);
  const currentBounds = window.getBounds();
  const currentCenterX = currentBounds.x + currentBounds.width / 2;

  return {
    x: clamp(
      Math.round(currentCenterX - width / 2),
      workArea.x,
      workArea.x + workArea.width - width,
    ),
    y: clamp(
      proposedBounds.y,
      workArea.y,
      workArea.y + workArea.height - height,
    ),
    width,
    height,
  };
}

export function expandWindowOnce(
  window: ExpandableWindow,
  workArea: WindowBounds,
): boolean {
  if (expandedWindows.has(window)) {
    return false;
  }

  expandedWindows.add(window);
  const bounds = expandedWindowBounds(window.getBounds(), workArea);
  const [, maximumHeight] = window.getMaximumSize();
  window.setMaximumSize(workArea.width, maximumHeight ?? 0);
  window.setBounds(bounds, true);
  return true;
}

export function setTrackDetailsPaneOpen(
  window: ExpandableWindow,
  workArea: WindowBounds,
  open: boolean,
): boolean {
  if (open) {
    if (trackDetailsPreviousState.has(window)) return false;

    const previousBounds = window.getBounds();
    const [maximumWidth = 0, maximumHeight = 0] =
      window.getMaximumSize();
    trackDetailsPreviousState.set(window, {
      bounds: previousBounds,
      maximumHeight,
      maximumWidth,
    });
    const bounds = trackDetailsWindowBounds(previousBounds, workArea);
    window.setMaximumSize(workArea.width, maximumHeight);
    window.setBounds(bounds, true);
    return true;
  }

  const previous = trackDetailsPreviousState.get(window);
  if (!previous) return false;
  trackDetailsPreviousState.delete(window);
  const width = Math.min(previous.bounds.width, workArea.width);
  const height = Math.min(previous.bounds.height, workArea.height);
  const bounds = {
    x: clamp(
      previous.bounds.x,
      workArea.x,
      workArea.x + workArea.width - width,
    ),
    y: clamp(
      previous.bounds.y,
      workArea.y,
      workArea.y + workArea.height - height,
    ),
    width,
    height,
  };
  window.setBounds(bounds, true);
  window.setMaximumSize(
    Math.min(
      previous.maximumWidth || REVEALED_WINDOW_WIDTH,
      workArea.width,
    ),
    previous.maximumHeight,
  );
  return true;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
