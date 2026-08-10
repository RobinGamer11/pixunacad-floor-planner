export type WheelZoomDirection = -1 | 1;

export type WheelZoomBurst = {
  direction: WheelZoomDirection | 0;
  count: number;
  lastAt: number;
};

export const EMPTY_WHEEL_ZOOM_BURST: WheelZoomBurst = {
  direction: 0,
  count: 0,
  lastAt: 0,
};

const WHEEL_ZOOM_BURST_GAP_MS = 300;

/**
 * Behält einzelne Mausrad-Rasten präzise, beschleunigt aber eine bewusst
 * fortgesetzte Zoom-Serie ab dem vierten Impuls.
 */
export function nextSmartWheelZoom(
  current: WheelZoomBurst,
  direction: WheelZoomDirection,
  now: number,
): { burst: WheelZoomBurst; step: number } {
  const continuesBurst =
    current.direction === direction
    && now - current.lastAt >= 0
    && now - current.lastAt <= WHEEL_ZOOM_BURST_GAP_MS;
  const count = continuesBurst ? current.count + 1 : 1;

  return {
    burst: { direction, count, lastAt: now },
    step: direction * (count > 3 ? 2 : 1),
  };
}
