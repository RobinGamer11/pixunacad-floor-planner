/**
 * stairGeometry.ts — reine, testbare Treppengeometrie.
 *
 * Die Treppe speichert nur ihre Parameter (Referenzlinie, Maße, Stufen-
 * abstände). Alle sichtbaren Stufen, Podeste, Fangpunkte, Pfeil und
 * Beschriftung werden hier abgeleitet und nie als Scene-Objekte gespeichert.
 */

export type P = { x: number; y: number };

export type StairMode = "straight" | "landing" | "winder" | "arc";

export interface StairParams {
  mode: StairMode;
  path: P[];
  referenceSide: "left" | "right";
  treadDepthM: number;
  stairWidthM: number;
  riserHeightM: number;
  /** Individuelle Auftritte (global über alle Läufe); fehlende = treadDepthM. */
  stepDistancesM?: number[] | null;
  /** Alt: globale Podesttiefe (nur noch Rückfall beim Lesen alter Treppen). */
  landingDepthM?: number | null;
  /** Podesttiefe je Knick (Schlüssel = Knickindex der Referenzlinie); fehlend = Laufbreite. */
  landingDepthsM?: Record<number, number> | null;
  /** Zusätzliche Steigungen gegenüber den Auftritten (üblich: 1). */
  riserExtra?: number;
  direction: "up" | "down";
}

export const MIN_TREAD_M = 0.12;
const EPS = 1e-7;

/* ------------------------------------------------------------ Schrittmaß */

/** Steigung = (Schrittmaß − Auftritt) / 2  (alle Werte in Metern). */
export function riserFromRule(treadM: number, ruleM: number): number {
  return (ruleM - treadM) / 2;
}
/** Auftritt = Schrittmaß − 2 × Steigung. */
export function treadFromRule(riserM: number, ruleM: number): number {
  return ruleM - 2 * riserM;
}
/** Ganze Steigungszahl für eine Geschosshöhe (Zielsteigung ~17,5 cm). */
export function suggestFromFloorHeight(floorM: number, ruleM: number, targetRiserM = 0.175) {
  const riserCount = Math.max(1, Math.round(floorM / targetRiserM));
  const riserM = floorM / riserCount;
  return { riserCount, riserM, treadM: treadFromRule(riserM, ruleM) };
}

/* ------------------------------------------------------------- Vektoren */

const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: P, s: number): P => ({ x: a.x * s, y: a.y * s });
const len = (a: P) => Math.hypot(a.x, a.y);
const norm = (a: P): P => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const rightOf = (d: P): P => ({ x: d.y, y: -d.x });

function lineIntersect(p: P, d: P, q: P, e: P): P | null {
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / den;
  return add(p, mul(d, t));
}

/* ------------------------------------------------------------ Geometrie */

export interface StairTread { index: number; run: number; poly: P[]; depth: number; center: P; /** Abweichender, sehr tiefer Auftritt = Zwischenpodest im Lauf. */ isLanding?: boolean }
export interface StairLanding {
  /** Knickindex der Referenzlinie; -1 = Zwischenpodest im geraden Lauf. */
  knick: number;
  poly: P[];
  center: P;
  /** Tiefe in Laufrichtung (bei Eckpodest: Zulauf-Seite inkl. Ausgleich). */
  depthM: number;
  widthM: number;
  /** Globaler Auftrittsindex (nur Zwischenpodest). */
  treadIndex?: number;
}
export interface StairBoundary {
  /** Index des davorliegenden Auftritts (global). */
  treadIndex: number;
  run: number;
  a: P; b: P;
  dir: P;
}

export interface StairGeometry {
  valid: boolean;
  warnings: string[];
  treads: StairTread[];
  landings: StairLanding[];
  treadCount: number;
  riserCount: number;
  totalRunM: number;
  totalHeightM: number;
  remainderM: number;
  /** Innere Teilungskanten (bearbeitbare Griffe). */
  boundaries: StairBoundary[];
  /** Lauflinie (Pfeil): Start → Ende in Gehrichtung. */
  walkLine: P[];
  snapPoints: P[];
  snapLines: [P, P][];
  outline: [P, P][];
  /** Linke/rechte Seitenkante der ersten Stufe (Bezugspunkte). */
  firstTreadEdges: { left: [P, P]; right: [P, P] } | null;
}

/** Podesttiefe am Knick k (mindestens Laufbreite × Laufbreite). */
export function landingDepthOf(p: StairParams, k: number): number {
  const w = p.stairWidthM;
  const own = p.landingDepthsM?.[k];
  const legacy = p.landingDepthM;
  const v = own && own > 0 ? own : legacy && legacy > 0 ? legacy : w;
  return Math.max(v, w);
}

/** Setzt die Tiefe genau eines Podests; andere Podeste bleiben unverändert. */
export function setLandingDepth(p: StairParams, k: number, depthM: number): StairParams | null {
  if (!(depthM > 0) || k <= 0 || k >= (p.path?.length ?? 0) - 1) return null;
  const map: Record<number, number> = {};
  for (let i = 1; i < p.path.length - 1; i++) map[i] = landingDepthOf(p, i);
  map[k] = Math.max(depthM, p.stairWidthM);
  return { ...p, landingDepthsM: map, landingDepthM: null };
}

function depthAt(p: StairParams, i: number): number {
  const d = p.stepDistancesM?.[i];
  return d && d > 0 ? d : p.treadDepthM;
}

/** Hauptfunktion: leitet aus den Parametern die vollständige Geometrie ab. */
export function computeStairGeometry(p: StairParams): StairGeometry {
  const warnings: string[] = [];
  const out: StairGeometry = {
    valid: true, warnings, treads: [], landings: [], treadCount: 0, riserCount: 0,
    totalRunM: 0, totalHeightM: 0, remainderM: 0, boundaries: [], walkLine: [],
    snapPoints: [], snapLines: [], outline: [], firstTreadEdges: null,
  };
  const path = (p.path || []).filter((q, i, arr) => i === 0 || len(sub(q, arr[i - 1])) > EPS);
  const w = p.stairWidthM;
  if (path.length < 2 || !(w > 0) || !(p.treadDepthM > 0)) {
    out.valid = false;
    warnings.push("Referenzlinie oder Maße unvollständig.");
    return out;
  }
  const segCount = path.length - 1;
  const dirs: P[] = [];
  const lens: number[] = [];
  for (let i = 0; i < segCount; i++) {
    const d = sub(path[i + 1], path[i]);
    dirs.push(norm(d)); lens.push(len(d));
  }
  const sideSign = p.referenceSide === "left" ? 1 : -1;
  const offs = dirs.map((d) => mul(rightOf(d), w * sideSign));
  const landingDepthAt = (k: number) => landingDepthOf(p, k);

  let treadIdx = 0;
  let cum = 0;
  const restOf: number[] = [];
  for (let r = 0; r < segCount; r++) {
    const startCut = r > 0 ? landingDepthAt(r) : 0;
    const endCut = r < segCount - 1 ? landingDepthAt(r + 1) : 0;
    const usable = lens[r] - startCut - endCut;
    if (usable < -EPS) {
      out.valid = false;
      warnings.push(`Lauf ${r + 1}: Länge reicht nicht für das Podest (mindestens ${(startCut + endCut).toFixed(2)} m).`);
      continue;
    }
    const d = dirs[r], o = offs[r];
    const base = add(path[r], mul(d, startCut));
    // 1) Volle Auftritte bestimmen.
    const runStart = treadIdx;
    const depths: number[] = [];
    let s0 = 0;
    while (true) {
      const dep = depthAt(p, runStart + depths.length);
      if (s0 + dep > usable + 1e-6) break;
      depths.push(dep); s0 += dep;
    }
    let rest = Math.max(0, usable - s0);
    // 2) Läufe an einem Podest: kleine Restdifferenz gleichmäßig auf die
    //    Standardauftritte verteilen – lückenlos, keine Teilstufe, Podest bleibt Mindestmaß.
    if (segCount > 1 && rest > 1e-4 && depths.length) {
      const isFree = (j: number) => !((p.stepDistancesM?.[runStart + j] ?? 0) > 0);
      const free = depths.map((_, j) => isFree(j));
      const k = free.filter(Boolean).length;
      if (k > 0) {
        const up = rest / k;
        const down = !p.stepDistancesM ? (p.treadDepthM - rest) / (k + 1) : Infinity;
        if (down < up && down <= MAX_TREAD_ADJUST_M && p.treadDepthM - down >= MIN_TREAD_M) {
          depths.push(p.treadDepthM); free.push(true);
          for (let j = 0; j < depths.length; j++) if (free[j]) depths[j] -= down;
          rest = 0;
        } else if (up <= MAX_TREAD_ADJUST_M) {
          for (let j = 0; j < depths.length; j++) if (free[j]) depths[j] += up;
          rest = 0;
        }
      }
    }
    let s = 0;
    let runTreads = 0;
    for (const dep of depths) {
      const a = add(base, mul(d, s)), b = add(base, mul(d, s + dep));
      const poly = [a, b, add(b, o), add(a, o)];
      out.treads.push({
        index: treadIdx, run: r, poly, depth: dep,
        center: add(add(a, mul(d, dep / 2)), mul(o, 0.5)),
      });
      if (runTreads > 0) {
        out.boundaries.push({ treadIndex: treadIdx - 1, run: r, a, b: add(a, o), dir: d });
      }
      s += dep; cum += dep; treadIdx++; runTreads++;
    }
    restOf[r] = rest;
    out.remainderM += rest;
    if (segCount > 1 && rest > 1e-4) {
      out.valid = false;
      warnings.push(`Lauf ${r + 1}: Restlänge ${(rest * 100).toFixed(1)} cm lässt sich nicht regelkonform auf die Auftritte verteilen – Referenzlinie anpassen, Podest bewusst vergrößern oder Auftritt ändern.`);
    }

    if ((r === 0 || r === segCount - 1) && runTreads === 0) {
      out.valid = false;
      warnings.push(`Lauf ${r + 1}: kein voller Auftritt möglich.`);
    }
    if (r > 0) {
      // Podest am Knick r: Ende von Lauf r-1, Anfang von Lauf r.
      const k = path[r];
      const d1 = dirs[r - 1], d2 = dirs[r];
      const entryDepth = landingDepthAt(r);
      const refEnd = sub(k, mul(d1, entryDepth));
      const outEnd = add(refEnd, offs[r - 1]);
      const refStart = add(k, mul(d2, landingDepthAt(r)));
      const outStart = add(refStart, offs[r]);
      const x = lineIntersect(outEnd, d1, outStart, d2);
      const raw = [refEnd, k, refStart, outStart, ...(x ? [x] : []), outEnd];
      const poly = raw.filter((q, i) => len(sub(q, raw[(i + raw.length - 1) % raw.length])) > 1e-6);
      const c = poly.reduce((acc, q) => add(acc, q), { x: 0, y: 0 });
      out.landings.push({ knick: r, poly, center: mul(c, 1 / poly.length), depthM: entryDepth, widthM: w });
    }
  }
  if (segCount === 1 && out.remainderM > 1e-4) {
    warnings.push(`Restlänge ${(out.remainderM * 100).toFixed(1)} cm ergibt keine volle Stufe.`);
  }
  // Stark abweichende Auftritte werden automatisch zu Zwischenpodesten.
  for (const t of out.treads) {
    if (t.depth > p.treadDepthM * 1.5 + 1e-6) {
      t.isLanding = true;
      out.landings.push({ knick: -1, poly: t.poly, center: t.center, depthM: t.depth, widthM: w, treadIndex: t.index });
    }
  }
  out.treadCount = out.treads.filter((t) => !t.isLanding).length;
  // Jeder Lauf hat Auftritte + 1 Steigungen; ein Podest ist eine Stufenebene.
  out.riserCount = out.treadCount > 0 ? out.treadCount + out.landings.length + (p.riserExtra ?? 1) : 0;
  out.totalRunM = cum;
  out.totalHeightM = out.riserCount * (p.riserHeightM || 0);

  // Erste Stufe: linke/rechte Kante (Bezug der Referenzlinie).
  if (out.treads.length) {
    const t = out.treads[0].poly; // [a, b, b+o, a+o]
    const refEdge: [P, P] = [t[0], t[1]];
    const farEdge: [P, P] = [t[3], t[2]];
    out.firstTreadEdges = p.referenceSide === "left"
      ? { left: refEdge, right: farEdge }
      : { left: farEdge, right: refEdge };
  }

  // Lauflinie: Mitte erste Stufe → Mittellinien-Knicke → Mitte letzte Stufe.
  if (out.treads.length) {
    const first = out.treads[0].center;
    const last = out.treads[out.treads.length - 1].center;
    const mids: P[] = [];
    for (let r = 1; r < segCount; r++) {
      const m1 = add(path[r - 1], mul(offs[r - 1], 0.5));
      const m2 = add(path[r], mul(offs[r], 0.5));
      const x = lineIntersect(m1, dirs[r - 1], m2, dirs[r]);
      if (x) mids.push(x);
    }
    const line = [first, ...mids, last];
    out.walkLine = p.direction === "down" ? line.reverse() : line;
  }

  // Fangpunkte: eindeutige Ecken + Kantenmitten; gemeinsame Kanten nur einmal.
  const polys = [...out.treads.map((t) => t.poly), ...out.landings.filter((l) => l.knick >= 0).map((l) => l.poly)];
  const key = (q: P) => `${Math.round(q.x * 1e5)}:${Math.round(q.y * 1e5)}`;
  const pts = new Map<string, P>();
  const edges = new Map<string, [P, P]>();
  const edgeUse = new Map<string, number>();
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (!pts.has(key(a))) pts.set(key(a), a);
      const ka = key(a), kb = key(b);
      const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (!edges.has(ek)) edges.set(ek, [a, b]);
      edgeUse.set(ek, (edgeUse.get(ek) || 0) + 1);
    }
  }
  const mids = new Map<string, P>();
  for (const [a, b] of edges.values()) {
    const m = mul(add(a, b), 0.5);
    if (!pts.has(key(m))) mids.set(key(m), m);
  }
  out.snapPoints = [...pts.values(), ...mids.values()];
  for (const q of path) if (!pts.has(key(q)) && !mids.has(key(q))) out.snapPoints.push(q);
  if (out.treads.length) {
    out.snapPoints.push(out.treads[0].center);
    if (out.treads.length > 1) out.snapPoints.push(out.treads[out.treads.length - 1].center);
  }
  out.snapLines = [...edges.values()];
  out.outline = [...edges.entries()].filter(([k]) => edgeUse.get(k) === 1).map(([, e]) => e);
  return out;
}

/* ------------------------------------------------------ Grenze verschieben */

/**
 * Verschiebt eine innere Stufengrenze um `deltaM` (in Laufrichtung).
 * Nur der davorliegende Auftritt ändert sich; alle Folgestufen behalten ihren
 * Auftritt und wandern mit. Die Referenzlinie wird konsistent mitgeführt:
 * alle Pfadpunkte nach dem betroffenen Lauf verschieben sich um delta.
 * Gibt null zurück, wenn der Mindestauftritt unterschritten würde.
 */
export function moveStairBoundary(p: StairParams, treadIndex: number, deltaM: number): StairParams | null {
  const g = computeStairGeometry(p);
  const tread = g.treads[treadIndex];
  if (!tread) return null;
  const next = g.treads[treadIndex + 1];
  if (!next || next.run !== tread.run) return null;
  const newDepth = tread.depth + deltaM;
  if (newDepth < MIN_TREAD_M - 1e-9) return null;
  const dists = g.treads.map((t) => t.depth);
  dists[treadIndex] = newDepth;
  const r = tread.run;
  const d = norm(sub(p.path[r + 1], p.path[r]));
  const path = p.path.map((q, i) => (i > r ? add(q, mul(d, deltaM)) : { x: q.x, y: q.y }));
  const res: StairParams = { ...p, path, stepDistancesM: dists };
  const g2 = computeStairGeometry(res);
  if (!g2.valid || g2.treads.length !== g.treads.length) return null;
  return res;
}

/** Setzt einen Auftritt auf den Standard zurück; Folgestufen wandern mit. */
export function resetStairTread(p: StairParams, treadIndex: number): StairParams | null {
  const g = computeStairGeometry(p);
  const t = g.treads[treadIndex];
  if (!t) return null;
  const delta = p.treadDepthM - t.depth;
  if (Math.abs(delta) < 1e-9) return null;
  const dists = g.treads.map((x) => x.depth);
  dists[treadIndex] = p.treadDepthM;
  const r = t.run;
  const d = norm(sub(p.path[r + 1], p.path[r]));
  const path = p.path.map((q, i) => (i > r ? add(q, mul(d, delta)) : { x: q.x, y: q.y }));
  const allStd = dists.every((x) => Math.abs(x - p.treadDepthM) < 1e-9);
  const res: StairParams = { ...p, path, stepDistancesM: allStd ? null : dists };
  return computeStairGeometry(res).valid ? res : null;
}

/** Ändert die Laufbreite; die Referenzlinie bleibt die Bezugskante. */
export function setStairWidth(p: StairParams, widthM: number): StairParams | null {
  if (!(widthM >= 0.3)) return null;
  return { ...p, stairWidthM: widthM };
}

/* ------------------------------------------------------- Beschriftung */

const cm = (m: number) => (Math.round(m * 1000) / 10).toLocaleString("de-DE", { maximumFractionDigits: 1 });

export function stairLabelLines(p: StairParams, g: StairGeometry, showWidth: boolean): string[] {
  const lines = [`${g.riserCount} STG`, `${cm(p.riserHeightM)} / ${cm(p.treadDepthM)} cm`];
  if (showWidth) lines.push(`B = ${p.stairWidthM.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`);
  return lines;
}

export function stepRuleCheckText(treadM: number, riserM: number): string {
  return `2 × ${cm(riserM)} cm + ${cm(treadM)} cm = ${cm(2 * riserM + treadM)} cm`;
}

/* ------------------------------------------------------- Treffer/Transform */

export function pointInPoly(q: P, poly: P[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function hitStair(p: StairParams, q: P): boolean {
  const g = computeStairGeometry(p);
  return g.treads.some((t) => pointInPoly(q, t.poly)) || g.landings.some((l) => pointInPoly(q, l.poly));
}

export function stairBoundsPoints(p: StairParams): P[] {
  const g = computeStairGeometry(p);
  const pts = [...g.treads.flatMap((t) => t.poly), ...g.landings.flatMap((l) => l.poly)];
  return pts.length ? pts : p.path;
}

/* ------------------------------------------------- Ganze Treppe bewegen */

/** Verschiebt die ganze Treppe (nur die Referenzlinie trägt Lage). */
export function translateStair(p: StairParams, dx: number, dy: number): StairParams {
  return { ...p, path: p.path.map((q) => ({ x: q.x + dx, y: q.y + dy })) };
}

/** Dreht die ganze Treppe um `pivot` (Bogenmaß); Geometrie bleibt zusammenhängend. */
export function rotateStair(p: StairParams, pivot: P, angle: number): StairParams {
  const c = Math.cos(angle), s = Math.sin(angle);
  return {
    ...p,
    path: p.path.map((q) => {
      const x = q.x - pivot.x, y = q.y - pivot.y;
      return { x: pivot.x + x * c - y * s, y: pivot.y + x * s + y * c };
    }),
  };
}

/* ------------------------------------------------ Bearbeitbare Kanten */

export type StairEdgeKind = "boundary" | "width" | "landing" | "ref";
export interface StairEdge {
  key: string;
  kind: StairEdgeKind;
  a: P; b: P;
  /** Richtung, in die „Kante bewegen“ positiv wirkt (Einheitsvektor). */
  dir: P;
  treadIndex?: number;
  knick?: number;
}

/**
 * Alle bearbeitbaren Kanten einer Treppe: innere Stufengrenzen, Außenkanten
 * je Lauf (Bezugsseite fest, Gegenseite = Laufbreite) und Podestkanten.
 */
export function stairEditableEdges(p: StairParams, g: StairGeometry = computeStairGeometry(p)): StairEdge[] {
  const out: StairEdge[] = [];
  for (const b of g.boundaries) out.push({ key: `b${b.treadIndex}`, kind: "boundary", a: b.a, b: b.b, dir: b.dir, treadIndex: b.treadIndex });
  const runs = new Map<number, StairTread[]>();
  for (const t of g.treads) { if (!runs.has(t.run)) runs.set(t.run, []); runs.get(t.run)!.push(t); }
  for (const [r, ts] of runs) {
    const f = ts[0].poly, l = ts[ts.length - 1].poly; // [a, b, b+o, a+o]
    const nrm = norm(sub(f[3], f[0]));
    out.push({ key: `r${r}`, kind: "ref", a: f[0], b: l[1], dir: mul(nrm, -1) });
    out.push({ key: `w${r}`, kind: "width", a: f[3], b: l[2], dir: nrm });
  }
  for (const L of g.landings) {
    if (L.knick < 0) continue;
    const k = L.knick;
    const d1 = norm(sub(p.path[k], p.path[k - 1]));
    const d2 = norm(sub(p.path[k + 1], p.path[k]));
    const poly = L.poly;
    const kp = p.path[k];
    const near = (u: P, w: P) => len(sub(u, w)) < 1e-6;
    const refEnd = poly[0];
    const refStart = sub(kp, mul(d2, -landingDepthOf(p, k)));
    const perp = (e: P, d: P) => Math.abs(e.x * d.x + e.y * d.y) < 1e-6;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (near(a, kp) || near(b, kp)) continue; // Bezugsseiten am Knick
      const e = norm(sub(b, a));
      if ((near(a, refEnd) || near(b, refEnd)) && perp(e, d1)) {
        out.push({ key: `l${k}in`, kind: "landing", a, b, dir: mul(d1, -1), knick: k });
      } else if ((near(a, refStart) || near(b, refStart)) && perp(e, d2)) {
        out.push({ key: `l${k}out`, kind: "landing", a, b, dir: d2, knick: k });
      } else {
        // Außenseite: Normale vom Podestzentrum weg → Breite.
        let n = { x: -e.y, y: e.x };
        const m = mul(add(a, b), 0.5);
        if ((m.x - L.center.x) * n.x + (m.y - L.center.y) * n.y < 0) n = mul(n, -1);
        out.push({ key: `l${k}s${i}`, kind: "width", a, b, dir: n, knick: k });
      }
    }
  }
  return out;
}
