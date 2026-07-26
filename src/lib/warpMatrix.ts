// Photoshop-artige 4-Punkt-Verzerrung (Perspektive) für PDF/JPG/PNG.
// `corners` sind Fraktionen 0..1 in Reihenfolge TL, TR, BR, BL — sie
// beschreiben, wohin die vier Ecken des Elements gezogen wurden.

export type WarpCorners = { x: number; y: number }[];

export const IDENTITY_WARP: WarpCorners = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export function isWarped(corners?: WarpCorners): boolean {
  if (!corners || corners.length !== 4) return false;
  const id = IDENTITY_WARP;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(corners[i].x - id[i].x) > 1e-6) return true;
    if (Math.abs(corners[i].y - id[i].y) > 1e-6) return true;
  }
  return false;
}

/** Berechnet die CSS-matrix3d, die die Rechteck-Punkte (0,0)-(w,0)-(w,h)-(0,h)
 *  auf die vier Zielpunkte (corners × w,h) projiziert.
 *  Bei Rechenproblemen wird ein leerer String zurückgegeben. */
export function computeWarpMatrix3d(w: number, h: number, corners: WarpCorners): string {
  if (w <= 0 || h <= 0) return "";
  const from: [number, number][] = [[0, 0], [w, 0], [w, h], [0, h]];
  const to: [number, number][] = corners.map((c) => [c.x * w, c.y * h]);
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = from[i];
    const [tx, ty] = to[i];
    A.push([sx, sy, 1, 0, 0, 0, -sx * tx, -sy * tx]); b.push(tx);
    A.push([0, 0, 0, sx, sy, 1, -sx * ty, -sy * ty]); b.push(ty);
  }
  const n = 8;
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
    }
    if (piv !== i) { [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]]; }
    if (Math.abs(A[i][i]) < 1e-12) return "";
    for (let k = i + 1; k < n; k++) {
      const f = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) A[k][j] -= f * A[i][j];
      b[k] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0) as number[];
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  const [a, b1, c, d, e, f, g, hh] = x;
  // CSS matrix3d ist spaltenweise.
  return `matrix3d(${a},${d},0,${g},${b1},${e},0,${hh},0,0,1,0,${c},${f},0,1)`;
}

/** Gibt die Positionen der 4 Kanten-Mittelpunkte in Fraktionen zurück. */
export function edgeMidpoints(corners: WarpCorners): WarpCorners {
  return [
    { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 }, // top
    { x: (corners[1].x + corners[2].x) / 2, y: (corners[1].y + corners[2].y) / 2 }, // right
    { x: (corners[2].x + corners[3].x) / 2, y: (corners[2].y + corners[3].y) / 2 }, // bottom
    { x: (corners[3].x + corners[0].x) / 2, y: (corners[3].y + corners[0].y) / 2 }, // left
  ];
}

// -----------------------------------------------------------------------------
// Kleiner externer Store, um zu tracken, welches Element gerade im
// „Verzerren"-Modus ist. So bleibt der ElementInspector-Button ohne globales
// Context-Provider-Setup mit dem ElementView synchronisiert.

import { useSyncExternalStore } from "react";

let _warpTargetId: string | null = null;
const _listeners = new Set<() => void>();
export function setWarpTarget(id: string | null) {
  _warpTargetId = id;
  _listeners.forEach((l) => l());
}
export function useWarpTarget(): string | null {
  return useSyncExternalStore(
    (cb) => { _listeners.add(cb); return () => { _listeners.delete(cb); }; },
    () => _warpTargetId,
    () => _warpTargetId,
  );
}
