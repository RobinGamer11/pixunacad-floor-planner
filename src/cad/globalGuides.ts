import { v, projectPointToInfiniteLine, lineLineIntersectionInfinite } from "./geometry";
import type { Vec2 } from "./geometry";
import { Defaults, SnapType } from "./constants";
import type { Camera } from "./Camera";

/** Eine unendliche Hilfsgerade (dedupliziert über `key`). */
export type GuideAxis = { key: string; point: Vec2; dir: Vec2 };
/** Ein Rechtsklick erzeugt genau eine Gruppe; Gruppen referenzieren Achsen. */
export type GuideGroup = { key: string; axisKeys: string[]; anchors: Vec2[] };

type ContextState = { groups: GuideGroup[]; axes: Map<string, GuideAxis>; refs: Map<string, number> };

const emptyState = (): ContextState => ({ groups: [], axes: new Map(), refs: new Map() });

/** Normierte, vorzeichen-eindeutige Richtung. */
export function canonicalDir(dir: Vec2): Vec2 {
  const l = Math.hypot(dir.x, dir.y) || 1;
  let d = { x: dir.x / l, y: dir.y / l };
  if (d.x < -1e-9 || (Math.abs(d.x) <= 1e-9 && d.y < 0)) d = { x: -d.x, y: -d.y };
  return d;
}

/** Eindeutiger Schlüssel einer unendlichen Geraden (Richtung + Abstand). */
export function axisKey(p: Vec2, dir: Vec2): string {
  const d = canonicalDir(dir);
  const off = p.x * -d.y + p.y * d.x;
  const r = (n: number) => (Math.abs(n) < 5e-6 ? 0 : n).toFixed(5);
  return `${r(d.x)}_${r(d.y)}_${r(off)}`;
}

/**
 * Globale, werkzeug- und objektübergreifende Hilfslinien.
 *
 * - Einzige Hilfslinien-Instanz der CAD-Oberfläche (kein zweites System).
 * - Flüchtig: nie Cloud, Undo, Snapshot, Export/PDF.
 * - Strikt je Kontext (CAD-Blatt, Plan, Exportseite): `setContext` wechselt
 *   den Speicher, Hilfslinien gehen nie zwischen Blatt und Exportseite über.
 * - Gruppen mit Referenzzählung: identische Achsen werden dedupliziert und
 *   bleiben, solange eine andere Gruppe sie noch nutzt.
 */
export class GlobalGuides {
  private _ctx = "default";
  private _states = new Map<string, ContextState>();

  private get _s(): ContextState {
    let s = this._states.get(this._ctx);
    if (!s) { s = emptyState(); this._states.set(this._ctx, s); }
    return s;
  }

  get contextKey() { return this._ctx; }

  /** Wechselt den Geltungsbereich (z. B. `sheet:…`, `plan:…`, `export:…`). */
  setContext(key: string) { if (key && key !== this._ctx) this._ctx = key; }

  /** Kompatibilität: Achsen aus Ankern (H/V) — nur zum Lesen. */
  get anchors(): { key: string; point: Vec2 }[] {
    const out: { key: string; point: Vec2 }[] = [];
    for (const g of this._s.groups) for (const a of g.anchors) out.push({ key: `${g.key}@${a.x},${a.y}`, point: a });
    return out;
  }

  get lines(): GuideAxis[] { return [...this._s.axes.values()]; }

  get groups(): readonly GuideGroup[] { return this._s.groups; }

  hasGroup(key: string) { return this._s.groups.some((g) => g.key === key); }

  /** Leert die Hilfslinien des aktiven Kontexts. */
  clear() { this._states.set(this._ctx, emptyState()); }

  /** Alle Kontexte leeren (z. B. Projektwechsel). */
  clearAll() { this._states.clear(); }

  /**
   * Schaltet eine Gruppe um: existiert `key`, wird sie entfernt (Toggle),
   * sonst mit den gegebenen Achsen angelegt. Rückgabe: true = jetzt aktiv.
   */
  toggleGroup(key: string, axes: { point: Vec2; dir: Vec2 }[], anchors: Vec2[] = []): boolean {
    const s = this._s;
    const idx = s.groups.findIndex((g) => g.key === key);
    if (idx >= 0) {
      const g = s.groups[idx];
      s.groups.splice(idx, 1);
      for (const k of g.axisKeys) {
        const n = (s.refs.get(k) || 0) - 1;
        if (n <= 0) { s.refs.delete(k); s.axes.delete(k); } else s.refs.set(k, n);
      }
      return false;
    }
    const keys: string[] = [];
    for (const a of axes) {
      if (!Number.isFinite(a.point.x) || !Number.isFinite(a.point.y)) continue;
      if (Math.hypot(a.dir.x, a.dir.y) < 1e-12) continue;
      const k = axisKey(a.point, a.dir);
      if (keys.includes(k)) continue;
      keys.push(k);
      if (!s.axes.has(k)) s.axes.set(k, { key: k, point: v(a.point.x, a.point.y), dir: canonicalDir(a.dir) });
      s.refs.set(k, (s.refs.get(k) || 0) + 1);
    }
    if (!keys.length) return false;
    s.groups.push({ key, axisKeys: keys, anchors: anchors.map((p) => v(p.x, p.y)) });
    return true;
  }

  /** Setzt/entfernt eine Hilfslinie durch `p` parallel zu `dir`. */
  toggleLine(p: Vec2, dir: Vec2): void {
    this.toggleGroup(`line:${axisKey(p, dir)}`, [{ point: p, dir }]);
  }

  /** Setzt/entfernt H+V-Achsen an einem Weltpunkt. */
  toggleAt(p: Vec2): void {
    this.toggleGroup(`pt:${p.x.toFixed(6)}_${p.y.toFixed(6)}`, [{ point: p, dir: v(1, 0) }, { point: p, dir: v(0, 1) }], [p]);
  }

  /** Bester Snap auf Hilfslinien-Schnittpunkte / Achsen (oder null). */
  findSnap(mouseS: Vec2, mouseW: Vec2, cam: Camera): any | null {
    const s = this._s;
    if (!s.axes.size) return null;
    const defs = [...s.axes.values()];
    let best: any = null;
    let bestPx = Infinity;

    const pts: Vec2[] = [];
    for (const g of s.groups) pts.push(...g.anchors);
    for (let i = 0; i < defs.length; i++) {
      for (let j = i + 1; j < defs.length; j++) {
        const ip = lineLineIntersectionInfinite(defs[i].point, defs[i].dir, defs[j].point, defs[j].dir);
        if (ip) pts.push(ip);
      }
    }
    for (const p of pts) {
      const sp = cam.worldToScreen(p.x, p.y);
      const px = Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
      if (px <= Defaults.snapPx && px < bestPx) {
        bestPx = px;
        best = { type: SnapType.GUIDE_POINT, world: v(p.x, p.y), segment: null, hatch: null, pointIndex: null, t: null, px };
      }
    }
    if (best) return best;

    for (const def of defs) {
      const proj = projectPointToInfiniteLine(mouseW, def.point, def.dir);
      const sp = cam.worldToScreen(proj.q.x, proj.q.y);
      const px = Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
      if (px > Defaults.snapPx || px >= bestPx) continue;
      bestPx = px;
      best = {
        type: SnapType.GUIDE, world: v(proj.q.x, proj.q.y), segment: null, hatch: null,
        pointIndex: null, t: null, px, lineA: def.point, lineB: v(def.point.x + def.dir.x, def.point.y + def.dir.y),
      };
    }
    return best;
  }

  /** Zeichnet Hilfslinien + Anker (Screen-Space). */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, _vw: number, _vh: number): void {
    const s = this._s;
    if (!s.axes.size) return;
    ctx.save();
    // Sichtbar auf hellem und dunklem Grund (vorher 0.38 → teils unsichtbar)
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(30,136,255,0.85)";
    ctx.lineWidth = 1.25;
    ctx.setLineDash([5, 6]);
    for (const l of s.axes.values()) {
      const seg = clipInfiniteLineToRect(cam, l.point, l.dir, _vw, _vh);
      if (!seg) continue;
      ctx.beginPath(); ctx.moveTo(seg[0].x, seg[0].y); ctx.lineTo(seg[1].x, seg[1].y); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(77,163,255,0.95)";
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 1.5;
    for (const g of s.groups) for (const p of g.anchors) {
      const sp = cam.worldToScreen(p.x, p.y);
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * Unendliche Gerade `point + t·dir` auf die sichtbare Fläche (0..vw, 0..vh) clippen.
 * Gilt für jede Richtung (H, V, schräg) – keine verkürzten Strecken.
 */
export function clipInfiniteLineToRect(
  cam: { worldToScreen(x: number, y: number): { x: number; y: number } },
  point: Vec2, dir: Vec2, vw: number, vh: number,
): [{ x: number; y: number }, { x: number; y: number }] | null {
  const p = cam.worldToScreen(point.x, point.y);
  const q = cam.worldToScreen(point.x + dir.x, point.y + dir.y);
  const dx = q.x - p.x, dy = q.y - p.y;
  if (Math.hypot(dx, dy) < 1e-12) return null;
  const pad = 2, x0 = -pad, y0 = -pad, x1 = vw + pad, y1 = vh + pad;
  let tMin = -Infinity, tMax = Infinity;
  const clip = (d: number, lo: number, hi: number, o: number) => {
    if (Math.abs(d) < 1e-12) return o >= lo && o <= hi;
    let a = (lo - o) / d, b = (hi - o) / d; if (a > b) [a, b] = [b, a];
    tMin = Math.max(tMin, a); tMax = Math.min(tMax, b); return tMin <= tMax;
  };
  if (!clip(dx, x0, x1, p.x) || !clip(dy, y0, y1, p.y)) return null;
  return [{ x: p.x + dx * tMin, y: p.y + dy * tMin }, { x: p.x + dx * tMax, y: p.y + dy * tMax }];
}
