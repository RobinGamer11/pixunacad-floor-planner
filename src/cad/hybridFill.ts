/**
 * hybridFill.ts — gemeinsame Bereichserkennung aus Vektor- UND Rasterkanten.
 *
 * Grundregel (identisch zum reinen Vektorpfad):
 *   Schnittpunkte teilen jede Boundary in Segmente. Aus diesen Segmenten wird
 *   ein planarer Graph (DCEL) gebaut und daraus das kleinste Face gewählt, das
 *   den Klickpunkt enthält. Linienanteile hinter einem Schnittpunkt sind eigene
 *   Segmente und gehören dem Face damit nie an — eine Füllung kann sich niemals
 *   über weiterlaufende Linien zu anderen Objekten „hangeln“.
 *
 * Pixelobjekte sind dabei ausschließlich eine zusätzliche Quelle für
 * Boundary-Geometrie:
 *
 *   Rastermaske → Skelettierung/Vektorisierung (`rasterVectorize.ts`)
 *     → Kanten mit den Vektorkanten zusammenführen
 *     → Schnittpunkte bestimmen und Kanten splitten (`hatchFill.ts`)
 *     → gemeinsamer Boundary-Graph → Face am Klickpunkt
 *
 * Es gibt bewusst KEINEN Bitmap-Flood-Fill mehr: dieser hat die Face-Ermittlung
 * global gemacht und Ausläufer entlang weiterlaufender Linien erzeugt, die dann
 * nur noch morphologisch kaschiert werden konnten.
 *
 * Damit der O(n²)-Schnittpunkttest und die Skelettierung bezahlbar bleiben,
 * wird die Analyse in einem Fenster um den Klick durchgeführt, das so lange
 * wächst, bis ein Face gefunden wird, das vollständig im Fenster liegt.
 */
import { Vec2, v, polygonSignedArea } from "./geometry";
import type { Scene } from "./Scene";
import { collectBoundaryEdges, findEnclosingFaceFromEdges, type RawEdge } from "./hatchFill";
import { vectorizeRasterBoundary } from "./rasterVectorize";
import { buildRasterBoundaryMask, type RasterScope } from "./rasterBoundary";
import type { RasterLayers } from "./RasterLayers";

/** Analyseauflösung der Vektorisierung (Skelett) — bewusst moderat. */
const VEC_TARGET_PIXELS = 1_500_000;
const VEC_MIN_PX_PER_M = 150;
const VEC_MAX_PX_PER_M = 1500;
/** Maximal überbrückte Anschlusslücke in Analysepixeln (Antialiasing/Subpixel). */
const GAP_PX = 3;
/** Sicherheitsgrenze für die O(n²)-Schnittpunktberechnung des Planargraphen. */
const MAX_GRAPH_EDGES = 6000;
/** Fenstergrößen (Halbkante in Metern), in denen das Face gesucht wird. */
const WINDOW_STEPS_M = [0.75, 2, 6, 18, 60, 200];
/** Sicherheitsabstand zum Fensterrand: Faces müssen echt innen liegen. */
const WINDOW_MARGIN = 1e-4;

export interface HybridFillOptions {
  scope?: RasterScope;
  activeLabelId?: string | null;
  /** Sichtbarkeitsfilter für Ebenen (Vektor wie Raster). */
  isVisible?: (labelId: string) => boolean;
}

interface Rect { x: number; y: number; w: number; h: number }

/* ------------------------------ Hilfsfunktionen ------------------------- */

/** Lotfußpunkt von p auf Strecke a→b (auf die Strecke begrenzt). */
function projectOnSegment(p: Vec2, a: Vec2, b: Vec2): { q: Vec2; d: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 <= 1e-18 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  const q = v(a.x + dx * t, a.y + dy * t);
  return { q, d: Math.hypot(p.x - q.x, p.y - q.y) };
}

/**
 * Verbindet freie Enden der Pixelkurven mit nahe liegender Geometrie.
 * Damit schließen Antialiasing-/Subpixel-Lücken zwischen Pixel- und
 * Vektorkanten, ohne dass Morphologie die Face-Geometrie bestimmt.
 * Die Brücke ist eine echte Kante und wird deshalb ebenfalls an allen
 * Schnittpunkten gesplittet.
 */
function bridgeOpenEnds(openEnds: Vec2[], edges: RawEdge[], tol: number): RawEdge[] {
  const bridges: RawEdge[] = [];
  for (const end of openEnds) {
    let best: Vec2 | null = null;
    let bestD = tol;
    for (const e of edges) {
      const { q, d } = projectOnSegment(end, e.a, e.b);
      if (d < 1e-9) { best = null; bestD = 0; break; } // Ende liegt bereits auf der Kante
      if (d < bestD) { bestD = d; best = q; }
    }
    if (best) bridges.push({ a: v(end.x, end.y), b: best });
  }
  return bridges;
}

/** Liang-Barsky: Strecke auf ein Rechteck zuschneiden (null = außerhalb). */
function clipSegment(a: Vec2, b: Vec2, r: Rect): RawEdge | null {
  const x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-15) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  if (!clip(-dx, a.x - x0)) return null;
  if (!clip(dx, x1 - a.x)) return null;
  if (!clip(-dy, a.y - y0)) return null;
  if (!clip(dy, y1 - a.y)) return null;
  const p = v(a.x + dx * t0, a.y + dy * t0);
  const q = v(a.x + dx * t1, a.y + dy * t1);
  if (Math.hypot(q.x - p.x, q.y - p.y) < 1e-9) return null;
  return { a: p, b: q };
}

/** Liegt das Face vollständig (mit Sicherheitsabstand) im Analysefenster? */
function faceInsideWindow(face: Vec2[], r: Rect): boolean {
  for (const p of face) {
    if (p.x <= r.x + WINDOW_MARGIN || p.x >= r.x + r.w - WINDOW_MARGIN) return false;
    if (p.y <= r.y + WINDOW_MARGIN || p.y >= r.y + r.h - WINDOW_MARGIN) return false;
  }
  return true;
}

/** Boundary-Kanten aus dem Rasterinhalt eines Fensters gewinnen. */
function rasterEdgesInWindow(
  rasterLayers: RasterLayers | null | undefined,
  rect: Rect,
  options: HybridFillOptions,
): { edges: RawEdge[]; openEnds: Vec2[]; pxPerM: number } {
  if (!rasterLayers) return { edges: [], openEnds: [], pxPerM: VEC_MIN_PX_PER_M };
  let pxPerM = Math.sqrt(VEC_TARGET_PIXELS / Math.max(1e-6, rect.w * rect.h));
  pxPerM = Math.max(VEC_MIN_PX_PER_M, Math.min(VEC_MAX_PX_PER_M, pxPerM));

  // Nur Rasterinhalt in die Maske — Vektorkanten bleiben exakt und werden
  // nicht über den Umweg Rasterung/Skelett verfälscht.
  const mask = buildRasterBoundaryMask(rasterLayers, rect.x, rect.y, rect.w, rect.h, {
    scope: options.scope ?? "all",
    activeLabelId: options.activeLabelId,
    isVisible: options.isVisible,
    pxPerM,
    alphaThreshold: 16,
  });
  if (!mask) return { edges: [], openEnds: [], pxPerM };

  const { edges, openEnds } = vectorizeRasterBoundary(
    mask.alpha, mask.threshold, mask.wPx, mask.hPx, mask.x, mask.y, mask.pxPerM,
  );
  return { edges, openEnds, pxPerM: mask.pxPerM };
}

/* ------------------------------- Hauptpfad ------------------------------ */

/**
 * Hybride Bereichserkennung — rein topologisch.
 *
 * Liefert die Kontur des kleinsten geschlossenen Faces, das den Klickpunkt
 * enthält, aus der Vereinigung von Vektorkanten und vektorisierten
 * Pixelgrenzen. Gibt null zurück, wenn der Bereich nicht geschlossen ist.
 */
export function findHybridEnclosingFace(
  scene: Scene,
  rasterLayers: RasterLayers | null | undefined,
  click: Vec2,
  options: HybridFillOptions = {},
): Vec2[] | null {
  const vectorEdges = collectBoundaryEdges(scene);

  for (const half of WINDOW_STEPS_M) {
    const rect: Rect = { x: click.x - half, y: click.y - half, w: half * 2, h: half * 2 };

    // 1) Vektorkanten auf das Fenster zuschneiden. Der Zuschnitt erzeugt keine
    //    künstlichen Ringe: eine am Fensterrand endende Kante gehört zu keinem
    //    geschlossenen Face, deshalb wird ein Face, das den Rand berührt, unten
    //    verworfen und das Fenster vergrößert.
    const clipped: RawEdge[] = [];
    for (const e of vectorEdges) {
      const c = clipSegment(e.a, e.b, rect);
      if (c) clipped.push(c);
    }

    // 2) Pixelgrenzen desselben Fensters als zusätzliche Boundary-Geometrie.
    const ras = rasterEdgesInWindow(rasterLayers, rect, options);

    const all: RawEdge[] = [...clipped, ...ras.edges];
    if (all.length === 0) continue;
    if (all.length > MAX_GRAPH_EDGES) {
      // Fenster ist zu dicht besetzt — ein noch größeres bringt nichts mehr.
      break;
    }

    // 3) Lücken zwischen Pixel- und Vektorkanten schließen (nur Subpixel).
    const bridges = ras.openEnds.length
      ? bridgeOpenEnds(ras.openEnds, all, GAP_PX / ras.pxPerM)
      : [];

    // 4) Gemeinsamer Boundary-Graph: Schnittpunkte splitten alle Kanten,
    //    anschließend wird das kleinste Face am Klickpunkt gewählt.
    const face = findEnclosingFaceFromEdges([...all, ...bridges], click);
    if (face && face.length >= 3 && faceInsideWindow(face, rect)) {
      return polygonSignedArea(face) < 0 ? [...face].reverse() : face;
    }
  }

  return null;
}
