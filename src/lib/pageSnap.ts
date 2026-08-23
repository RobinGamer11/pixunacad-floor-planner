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
  /**
   * Alle Fangpunkte in einem Bildschirmradius um den Cursor — Pendant zu
   * `TopologyEngine.nearbySnapPoints()` der CAD-Oberfläche. Wird ausschließlich
   * für die dezente Fangpunkt-Vorschau während Verschieben/Drehen genutzt.
   */
  queryNearby(clientX: number, clientY: number, pageRect: DOMRect, radiusPx?: number, max?: number, excludeIds?: string[]): Array<{ x: number; y: number; type: SnapPointType }>;
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
    queryNearby(cx, cy, pageRect, radiusPx = 140, max = 60, exclude) {
      const excludeSet = new Set(exclude ?? []);
      const pxPerPctX = pageRect.width / 100;
      const pxPerPctY = pageRect.height / 100;
      const out: Array<{ x: number; y: number; type: SnapPointType; d: number }> = [];
      for (const [elementId, e] of entries) {
        if (excludeSet.has(elementId)) continue;
        for (const p of e.points) {
          const dx = (p.x * pxPerPctX + pageRect.left) - cx;
          const dy = (p.y * pxPerPctY + pageRect.top) - cy;
          const d = Math.hypot(dx, dy);
          if (d > radiusPx) continue;
          out.push({ x: p.x, y: p.y, type: p.type, d });
        }
      }
      out.sort((a, b) => a.d - b.d);
      return out.slice(0, max).map(({ x, y, type }) => ({ x, y, type }));
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

/**
 * Wie `buildRectSnapEntry`, berücksichtigt aber die Rotation des Elements.
 *
 * Die Punkte werden zunächst lokal am ungedrehten Rechteck bestimmt, dann um
 * den Elementmittelpunkt gedreht und erst danach in Seiten-Prozent abgelegt.
 * Weil Prozent-X und Prozent-Y unterschiedliche physische Längen haben,
 * erfolgt die Drehung in einem längentreuen Raum (`aspect` = Seitenbreite /
 * Seitenhöhe in Pixeln).
 *
 * `edgeMids`/`edges` steuern, ob neben den vier Ecken weitere Fangziele
 * veröffentlicht werden. Objekte, die nur vier Eckpunkte anzeigen (z. B.
 * Tabellen), dürfen keine unsichtbaren Ziele publizieren.
 */
export function buildRotatedRectSnapEntry(
  kind: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rotationDeg: number,
  aspect: number,
  opts: { edgeMids?: boolean; edges?: boolean } = {},
): SnapEntry {
  const { edgeMids = true, edges = true } = opts;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rad = ((rotationDeg || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const tp = (px: number, py: number) => {
    // in längentreuen Raum (X skaliert mit aspect), drehen, zurück
    const dx = (px - cx) * a;
    const dy = py - cy;
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return { x: cx + rx / a, y: cy + ry };
  };
  const tl = tp(x, y);
  const tr = tp(x + w, y);
  const bl = tp(x, y + h);
  const br = tp(x + w, y + h);
  const mid = (p: { x: number; y: number }, q: { x: number; y: number }) => ({
    x: (p.x + q.x) / 2, y: (p.y + q.y) / 2,
  });
  const points: SnapEntry["points"] = [
    { ...tl, type: "corner", key: "corner-tl" },
    { ...tr, type: "corner", key: "corner-tr" },
    { ...bl, type: "corner", key: "corner-bl" },
    { ...br, type: "corner", key: "corner-br" },
  ];
  if (edgeMids) {
    points.push(
      { ...mid(tl, tr), type: "edge-mid", key: "edge-mid-top" },
      { ...mid(bl, br), type: "edge-mid", key: "edge-mid-bottom" },
      { ...mid(tl, bl), type: "edge-mid", key: "edge-mid-left" },
      { ...mid(tr, br), type: "edge-mid", key: "edge-mid-right" },
    );
  }
  return {
    kind,
    points,
    edges: edges
      ? [
          { key: "edge-line-top", a: tl, b: tr },
          { key: "edge-line-right", a: tr, b: br },
          { key: "edge-line-bottom", a: bl, b: br },
          { key: "edge-line-left", a: tl, b: bl },
        ]
      : undefined,
  };
}
