/**
 * pageSnap.ts — gemeinsame Snap-Registry für Seiten-Elemente in der Projektmappe.
 *
 * Elemente publizieren ihre Snap-Ziele (Ecken, Kanten-Mittelpunkte, ggf. Kanten-
 * Segmente) über `publish(elementId, targets)`. Werkzeuge (Linie, CAD-HUB-Move/
 * Rotate, Kanten-Trim usw.) konsumieren mit `queryNearest(clientX, clientY, pageRect, tol)`.
 *
 * Priorität bei Überlappung (kleinere Zahl = höher):
 *   1) corner
 *   2) edge-mid
 *   3) edge-line (nächster Punkt auf Segment)
 *
 * Hover-Highlight: `setHover(match | null)` speichert das aktuell gefangene Ziel
 * und feuert ein `pixuna:page-snap-hover`-Event. Elemente hören darauf und
 * lassen den passenden Handle „aufleuchten".
 *
 * Koordinaten der publizierten Punkte sind in PROZENT der Seite (0..100).
 * `queryNearest` erwartet clientX/Y in Bildschirm-Pixeln und ein aktuelles
 * `pageRect` der Seiten-Fläche, um die Toleranz sauber zu vergleichen.
 */

export type SnapPointType = "corner" | "edge-mid";
export type SnapEdge = { a: { x: number; y: number }; b: { x: number; y: number } };

export interface SnapEntry {
  kind: string;
  points: Array<{ x: number; y: number; type: SnapPointType; key: string }>;
  edges?: Array<SnapEdge & { key: string }>;
}

export interface SnapMatch {
  elementId: string;
  key: string;              // z. B. "corner-tl", "edge-mid-top", "edge-line-left"
  type: "corner" | "edge-mid" | "edge-line";
  x: number;                // Prozent der Seite
  y: number;                // Prozent der Seite
  distPx: number;           // Distanz in Bildschirm-Pixeln
}

interface Registry {
  entries: Map<string, SnapEntry>;
  hover: SnapMatch | null;
  publish(elementId: string, entry: SnapEntry): void;
  unpublish(elementId: string): void;
  queryNearest(clientX: number, clientY: number, pageRect: DOMRect, tolerancePx?: number, excludeIds?: string[]): SnapMatch | null;
  setHover(m: SnapMatch | null): void;
}

function ensure(): Registry {
  const w = window as any;
  if (w.__pixunaPageSnap && typeof w.__pixunaPageSnap.publish === "function") {
    return w.__pixunaPageSnap as Registry;
  }
  const entries = new Map<string, SnapEntry>();
  let hover: SnapMatch | null = null;
  const reg: Registry = {
    entries,
    get hover() { return hover; },
    set hover(v: SnapMatch | null) { hover = v; },
    publish(id, e) { entries.set(id, e); },
    unpublish(id) { entries.delete(id); },
    queryNearest(cx, cy, pageRect, tol = 10, exclude) {
      const excludeSet = new Set(exclude ?? []);
      const pxPerPctX = pageRect.width / 100;
      const pxPerPctY = pageRect.height / 100;
      let best: SnapMatch | null = null;
      const consider = (candidate: SnapMatch) => {
        if (candidate.distPx > tol) return;
        if (!best) { best = candidate; return; }
        const prio = { corner: 0, "edge-mid": 1, "edge-line": 2 } as const;
        if (prio[candidate.type] < prio[best.type]) { best = candidate; return; }
        if (prio[candidate.type] === prio[best.type] && candidate.distPx < best.distPx) best = candidate;
      };
      for (const [elementId, e] of entries) {
        if (excludeSet.has(elementId)) continue;
        for (const p of e.points) {
          const dx = (p.x * pxPerPctX + pageRect.left) - cx;
          const dy = (p.y * pxPerPctY + pageRect.top) - cy;
          consider({ elementId, key: p.key, type: p.type, x: p.x, y: p.y, distPx: Math.hypot(dx, dy) });
        }
        if (e.edges) for (const eg of e.edges) {
          // Nächster Punkt auf Segment im Bildschirmraum berechnen.
          const ax = eg.a.x * pxPerPctX + pageRect.left;
          const ay = eg.a.y * pxPerPctY + pageRect.top;
          const bx = eg.b.x * pxPerPctX + pageRect.left;
          const by = eg.b.y * pxPerPctY + pageRect.top;
          const vx = bx - ax, vy = by - ay;
          const wx = cx - ax, wy = cy - ay;
          const len2 = vx * vx + vy * vy || 1;
          const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
          const px = ax + t * vx, py = ay + t * vy;
          const dist = Math.hypot(cx - px, cy - py);
          consider({
            elementId, key: eg.key, type: "edge-line",
            x: (eg.a.x + t * (eg.b.x - eg.a.x)),
            y: (eg.a.y + t * (eg.b.y - eg.a.y)),
            distPx: dist,
          });
        }
      }
      return best;
    },
    setHover(m) {
      const prev = hover;
      const same = prev && m && prev.elementId === m.elementId && prev.key === m.key;
      if (same) return;
      hover = m;
      try {
        window.dispatchEvent(new CustomEvent("pixuna:page-snap-hover", { detail: m }));
      } catch {}
    },
  };
  w.__pixunaPageSnap = reg;
  return reg;
}

export function getPageSnapRegistry(): Registry { return ensure(); }

/** Baut Punkt-/Edge-Liste für ein Rechteck-Element (Prozent-Koordinaten). */
export function buildRectSnapEntry(
  kind: string,
  x: number,
  y: number,
  w: number,
  h: number,
  includeEdgeMids = true,
): SnapEntry {
  return {
    kind,
    points: [
      { x, y, type: "corner", key: "corner-tl" },
      { x: x + w, y, type: "corner", key: "corner-tr" },
      { x, y: y + h, type: "corner", key: "corner-bl" },
      { x: x + w, y: y + h, type: "corner", key: "corner-br" },
      ...(includeEdgeMids
        ? ([
            { x: x + w / 2, y, type: "edge-mid", key: "edge-mid-top" },
            { x: x + w / 2, y: y + h, type: "edge-mid", key: "edge-mid-bottom" },
            { x, y: y + h / 2, type: "edge-mid", key: "edge-mid-left" },
            { x: x + w, y: y + h / 2, type: "edge-mid", key: "edge-mid-right" },
          ] as SnapEntry["points"])
        : []),
    ],
    edges: [
      { key: "edge-line-top",    a: { x, y }, b: { x: x + w, y } },
      { key: "edge-line-right",  a: { x: x + w, y }, b: { x: x + w, y: y + h } },
      { key: "edge-line-bottom", a: { x, y: y + h }, b: { x: x + w, y: y + h } },
      { key: "edge-line-left",   a: { x, y }, b: { x, y: y + h } },
    ],
  };
}
