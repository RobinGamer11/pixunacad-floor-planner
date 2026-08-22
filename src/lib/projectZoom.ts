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
 * Progressive Beschleunigung: einzelne Rasten bleiben exakt (1 %), eine bewusst
 * fortgesetzte Serie wird schrittweise schneller — gedeckelt bei 8 %, damit der
 * Zoom nicht „explodiert“.
 */
export function wheelZoomBurstFactor(count: number): number {
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 10) return 4;
  return 8;
}

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
    step: direction * wheelZoomBurstFactor(count),
  };
}
