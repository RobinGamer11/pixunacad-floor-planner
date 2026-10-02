/**
 * StairTool — Platzieren und Bearbeiten semantischer Treppen.
 *
 * Phasen beim Platzieren:
 *   "start" → erster Kontakt setzt nur den Startpunkt der ersten Stufe
 *   "dir"   → Bewegung/Tipp bestimmt die Laufrichtung (Vorschau)
 *            → nur Häkchen/Enter bestätigt die erste Stufe
 *   "side"  → Bezug links/rechts wählen
 *   "path"  → Referenzlinie ab der gewählten Kante der ersten Stufe zeichnen;
 *            Tipps fügen Eckpunkte hinzu, nur Häkchen/Enter/Doppelklick schließt ab
 * Bearbeiten ("edit"): Griffe für Stufengrenzen, Laufbreite und Referenzpunkte.
 * Jede Änderung bleibt Vorschau, bis Häkchen/Enter sie als genau einen
 * Undo-Schritt speichert. Escape verwirft.
 */
import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import { v } from "./geometry";
import { drawSnapDot } from "./snapDraw";
import { drawStair } from "./stairDraw";
import {
  computeStairGeometry, moveStairBoundary, setStairWidth, riserFromRule,
  type P, type StairParams,
} from "./stairGeometry";
import { serializeStair } from "./Scene";

export type StairPhase = "start" | "dir" | "side" | "path" | "edit";

export interface StairToolSettings {
  treadDepthM: number;
  stairWidthM: number;
  riserHeightM: number;
  stepRuleCm: number;
  useStepRule: boolean;
  floorHeightM: number | null;
  referenceSide: "left" | "right";
  direction: "up" | "down";
  showArrow: boolean;
  showCircle: boolean;
  showLabel: boolean;
  showWidth: boolean;
  color: string;
  lineWidthPx: number;
}

type Handle =
  | { kind: "boundary"; treadIndex: number; pos: P; dir: P; a: P }
  | { kind: "width"; pos: P; base: P; normal: P }
  | { kind: "path"; index: number; pos: P };

const BTN_R = 18;

export class StairTool {
  app: CadApp;
  id = "stair";
  phase: StairPhase = "start";
  settings: StairToolSettings = {
    treadDepthM: 0.28, stairWidthM: 1.0, riserHeightM: 0.175, stepRuleCm: 63, useStepRule: true,
    floorHeightM: null, referenceSide: "left", direction: "up",
    showArrow: true, showCircle: true, showLabel: true, showWidth: false,
    color: "#111111", lineWidthPx: 1,
  };

  private _start: P | null = null;
  private _dir: P | null = null;
  private _path: P[] = [];
  private _cursor: P | null = null;
  private _snapScreen: { x: number; y: number } | null = null;
  private _btn: { x: number; y: number } | null = null;
  private _sideBtns: { left: { x: number; y: number }; right: { x: number; y: number } } | null = null;

  /** Bearbeiten einer bestehenden Treppe. */
  editId: string | null = null;
  private _draft: StairParams | null = null;
  private _dragHandle: Handle | null = null;
  private _dragBase: StairParams | null = null;
  lastWarnings: string[] = [];

  constructor(app: CadApp) { this.app = app; }

  activate() {
    this.app.renderer.overlay = { draw: (ctx: CanvasRenderingContext2D) => this._drawOverlay(ctx) };
    try { this.app.hub?.hide?.(); this.app.pointEditMenu?.hide?.(); } catch { /* optional */ }
    if (!this.editId) this._resetPlacement();
  }

  cancel() {
    this._resetPlacement();
    this._endEdit();
    this.app.renderer.overlay = null;
  }
  finish() { this.cancel(); }

  private _resetPlacement() {
    this.phase = this.editId ? "edit" : "start";
    this._start = null; this._dir = null; this._path = []; this._btn = null; this._sideBtns = null;
  }

  /* ------------------------------------------------------------ Parameter */

  /** Steigung aus Schrittmaßregel nachführen (Auftritt bleibt führend). */
  applyStepRule() {
    if (!this.settings.useStepRule) return;
    this.settings.riserHeightM = Math.max(0.05, riserFromRule(this.settings.treadDepthM, this.settings.stepRuleCm / 100));
  }

  paramsFromSettings(path: P[]): StairParams {
    const s = this.settings;
    return {
      mode: path.length > 2 ? "landing" : "straight", path, referenceSide: s.referenceSide,
      treadDepthM: s.treadDepthM, stairWidthM: s.stairWidthM, riserHeightM: s.riserHeightM,
      direction: s.direction, stepDistancesM: null, landingDepthM: null, riserExtra: 1,
    };
  }

  /* ----------------------------------------------------------- Bearbeiten */

  beginEdit(stairId: string): boolean {
    const st = (this.app.scene as any).getStairById?.(stairId);
    if (!st) return false;
    this.editId = stairId;
    this._draft = serializeStair(st);
    this.phase = "edit";
    this.app.renderer.stairHiddenIds = new Set([stairId]);
    return true;
  }

  private _endEdit() {
    this.editId = null;
    this._draft = null;
    this._dragHandle = null;
    this._dragBase = null;
    if (this.app.renderer) this.app.renderer.stairHiddenIds = new Set();
  }

  /** Häkchen/Enter. */
  confirm(): boolean {
    if (this.phase === "dir" && this._start && this._dir) {
      this.phase = "side";
      return true;
    }
    if (this.phase === "path") return this._finishPath();
    if (this.phase === "edit" && this.editId && this._draft) {
      const st = (this.app.scene as any).getStairById?.(this.editId);
      const g = computeStairGeometry(this._draft);
      if (!st || !g.valid) return false;
      const { id: _id, ...rest } = this._draft as any;
      Object.assign(st, rest, { path: this._draft.path.map((q) => v(q.x, q.y)) });
      st.stepDistancesM = this._draft.stepDistancesM ? [...this._draft.stepDistancesM] : null;
      st.mode = st.path.length > 2 ? "landing" : "straight";
      this.app.commitHistorySnapshot();
      const id = this.editId;
      this._endEdit();
      this.app.setTool("select");
      try { (this.app as any).selectTool.marqueeSelectedIds = [{ kind: "stair", id }]; } catch { /* optional */ }
      return true;
    }
    return false;
  }

  /** Escape: verwirft Vorschau/Bearbeitung ohne Änderung. Rückgabe: behandelt. */
  escape(): boolean {
    if (this.phase === "edit") {
      const id = this.editId;
      this._endEdit();
      this.app.setTool("select");
      if (id) try { (this.app as any).selectTool.marqueeSelectedIds = [{ kind: "stair", id }]; } catch { /* optional */ }
      return true;
    }
    if (this.phase !== "start") { this._resetPlacement(); return true; }
    return false;
  }

  /** Auswahl „Bezug links/rechts“ (Panel oder Canvas-Knöpfe). */
  chooseSide(side: "left" | "right") {
    if (this.phase !== "side" || !this._start || !this._dir) return;
    this.settings.referenceSide = side;
    const d = this._dir, w = this.settings.stairWidthM;
    const r = { x: d.y, y: -d.x };
    // Erste Stufe liegt mit Breite rechts der Laufrichtung vom Startpunkt.
    // Bezug links = Kante durch den Startpunkt; Bezug rechts = gegenüberliegende Kante.
    const p0 = side === "left" ? this._start : { x: this._start.x + r.x * w, y: this._start.y + r.y * w };
    this._path = [p0];
    this.phase = "path";
  }

  /** Bearbeitung: Podest hinzufügen (neuer Lauf um 90° am Ende). */
  addLandingRun(stairId: string, turn: "left" | "right" = "right"): boolean {
    const st = (this.app.scene as any).getStairById?.(stairId);
    if (!st || st.path.length < 2) return false;
    const a = st.path[st.path.length - 2], b = st.path[st.path.length - 1];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const sign = turn === "right" ? 1 : -1;
    const n = { x: d.y * sign, y: -d.x * sign };
    const lw = Math.max(st.landingDepthM || 0, st.stairWidthM);
    const ext = { x: b.x + d.x * lw, y: b.y + d.y * lw };
    const runLen = lw + st.treadDepthM * 3;
    const before = st.path.map((q: P) => ({ ...q }));
    st.path = [...st.path.slice(0, -1), v(ext.x, ext.y), v(ext.x + n.x * runLen, ext.y + n.y * runLen)];
    if (!computeStairGeometry(st).valid) { st.path = before.map((q: P) => v(q.x, q.y)); return false; }
    st.mode = "landing";
    st.stepDistancesM = null;
    this.app.commitHistorySnapshot();
    return true;
  }

  /** Bearbeitung: letztes Podest entfernen (Knick auflösen, Linie gerade). */
  removeLastLanding(stairId: string): boolean {
    const st = (this.app.scene as any).getStairById?.(stairId);
    if (!st || st.path.length < 3) return false;
    const before = st.path.map((q: P) => ({ ...q }));
    st.path = [...st.path.slice(0, -2)];
    // Letzten Lauf in seiner Richtung um die ursprüngliche Lauflänge verlängern.
    const a = before[before.length - 3], k = before[before.length - 2], e = before[before.length - 1];
    const L1 = Math.hypot(k.x - a.x, k.y - a.y) || 1;
    const add = Math.hypot(e.x - k.x, e.y - k.y);
    st.path.push(v(k.x + ((k.x - a.x) / L1) * add, k.y + ((k.y - a.y) / L1) * add));
    if (!computeStairGeometry(st).valid) { st.path = before.map((q: P) => v(q.x, q.y)); return false; }
    st.mode = st.path.length > 2 ? "landing" : "straight";
    st.stepDistancesM = null;
    this.app.commitHistorySnapshot();
    return true;
  }

  /* --------------------------------------------------------------- Update */

  private _snap(input: Input): P {
    const raw = { x: input.mouse.wx, y: input.mouse.wy };
    try {
      const ex = this.editId ? { stairIds: new Set([this.editId]) } : undefined;
      const snap = (this.app as any).topology?.findBestSnap?.({ x: input.mouse.sx, y: input.mouse.sy }, raw, ex);
      if (snap?.world) {
        this._snapScreen = this.app.camera.worldToScreen(snap.world.x, snap.world.y);
        return { x: snap.world.x, y: snap.world.y };
      }
    } catch { /* optional */ }
    this._snapScreen = null;
    return raw;
  }

  private _hitBtn(input: Input, b: { x: number; y: number } | null) {
    return !!b && Math.hypot(input.mouse.sx - b.x, input.mouse.sy - b.y) <= BTN_R + 4;
  }

  update(input: Input) {
    const pressed = input.clicked;
    // Häkchen VOR jeder Positionslogik: dessen Koordinaten nie als Ziel nutzen.
    if (this._hitBtn(input, this._btn)) {
      this.app.canvas.style.cursor = "pointer";
      if (pressed) { input.clicked = false; input.doubleClicked = false; this.confirm(); }
      return;
    }
    if (this.phase === "side" && this._sideBtns) {
      if (pressed && this._hitBtn(input, this._sideBtns.left)) { input.clicked = false; this.chooseSide("left"); return; }
      if (pressed && this._hitBtn(input, this._sideBtns.right)) { input.clicked = false; this.chooseSide("right"); return; }
      return;
    }
    this.app.canvas.style.cursor = "crosshair";
    if (this.phase === "edit") { this._updateEdit(input); return; }

    const w = this._snap(input);
    this._cursor = w;
    if (this.phase === "start") {
      if (pressed) { this._start = w; this.phase = "dir"; input.clicked = false; }
      return;
    }
    if (this.phase === "dir" && this._start) {
      const dx = w.x - this._start.x, dy = w.y - this._start.y;
      const L = Math.hypot(dx, dy);
      if (L > 1e-3) {
        let d = { x: dx / L, y: dy / L };
        if (input.keys?.shift) {
          const a = Math.round(Math.atan2(d.y, d.x) / (Math.PI / 4)) * (Math.PI / 4);
          d = { x: Math.cos(a), y: Math.sin(a) };
        }
        this._dir = d;
      }
      // Ein Tipp aktualisiert nur die Richtung — bestätigt wird über das Häkchen.
      if (pressed) input.clicked = false;
      return;
    }
    if (this.phase === "path" && this._path.length) {
      const target = this._constrainPathPoint(w, input);
      if (input.doubleClicked && this._path.length >= 2) {
        input.doubleClicked = false; input.clicked = false;
        this._finishPath();
        return;
      }
      if (pressed) {
        input.clicked = false;
        const last = this._path[this._path.length - 1];
        if (Math.hypot(target.x - last.x, target.y - last.y) > 1e-3) this._path.push(target);
      }
    }
  }

  /** Erster Lauf bleibt an die Richtung der ersten Stufe gebunden. */
  private _constrainPathPoint(w: P, input: Input): P {
    const last = this._path[this._path.length - 1];
    if (this._path.length === 1 && this._dir) {
      const t = Math.max(0, (w.x - last.x) * this._dir.x + (w.y - last.y) * this._dir.y);
      return { x: last.x + this._dir.x * t, y: last.y + this._dir.y * t };
    }
    if (input.keys?.shift) {
      const dx = w.x - last.x, dy = w.y - last.y, L = Math.hypot(dx, dy);
      const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 2)) * (Math.PI / 2);
      return { x: last.x + Math.cos(a) * L, y: last.y + Math.sin(a) * L };
    }
    return w;
  }

  private _previewPath(): P[] {
    if (!this._cursor || !this._path.length) return this._path;
    const fake = { keys: {} } as any;
    return [...this._path, this._constrainPathPoint(this._cursor, fake)];
  }

  private _finishPath(): boolean {
    const path = this._path.length >= 2 ? this._path : this._previewPath();
    const params = this.paramsFromSettings(path);
    const g = computeStairGeometry(params);
    this.lastWarnings = g.warnings;
    if (!g.valid) return false;
    const s = this.settings;
    const st = (this.app.scene as any).createStair({
      ...params, labelId: (this.app as any).activeDrawLabelId || undefined,
      stepRuleCm: s.stepRuleCm, useStepRule: s.useStepRule, floorHeightM: s.floorHeightM,
      showArrow: s.showArrow, showCircle: s.showCircle, showLabel: s.showLabel, showWidth: s.showWidth,
      color: s.color, lineWidthPx: s.lineWidthPx,
    });
    this.app.commitHistorySnapshot();
    this._resetPlacement();
    try { (this.app as any).onStairCreated?.(st.id); } catch { /* optional */ }
    return true;
  }

  /* ----------------------------------------------------------- Edit-Griffe */

  handlesFor(p: StairParams): Handle[] {
    const g = computeStairGeometry(p);
    const hs: Handle[] = [];
    for (const b of g.boundaries) {
      hs.push({ kind: "boundary", treadIndex: b.treadIndex, a: b.a, dir: b.dir, pos: { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 } });
    }
    if (g.treads.length) {
      const t = g.treads[0].poly;
      const far = { x: (t[2].x + t[3].x) / 2, y: (t[2].y + t[3].y) / 2 };
      const base = { x: (t[0].x + t[1].x) / 2, y: (t[0].y + t[1].y) / 2 };
      const L = Math.hypot(far.x - base.x, far.y - base.y) || 1;
      hs.push({ kind: "width", pos: far, base, normal: { x: (far.x - base.x) / L, y: (far.y - base.y) / L } });
    }
    p.path.forEach((q, i) => hs.push({ kind: "path", index: i, pos: q }));
    return hs;
  }

  private _updateEdit(input: Input) {
    if (!this._draft) return;
    if (this._dragHandle && this._dragBase) {
      if (!input.mouse.left) { this._dragHandle = null; this._dragBase = null; return; }
      const w = this._snap(input);
      const h = this._dragHandle;
      let next: StairParams | null = null;
      if (h.kind === "boundary") {
        const delta = (w.x - h.a.x) * h.dir.x + (w.y - h.a.y) * h.dir.y;
        next = moveStairBoundary(this._dragBase, h.treadIndex, delta);
      } else if (h.kind === "width") {
        const wd = (w.x - h.base.x) * h.normal.x + (w.y - h.base.y) * h.normal.y;
        next = setStairWidth(this._dragBase, Math.round(wd * 100) / 100);
      } else {
        const path = this._dragBase.path.map((q, i) => (i === h.index ? { x: w.x, y: w.y } : q));
        next = { ...this._dragBase, path };
      }
      if (next) {
        const g = computeStairGeometry(next);
        this.lastWarnings = g.warnings;
        if (g.valid) this._draft = next;
      }
      return;
    }
    if (input.mouse.left && input.clicked) {
      const hit = this.handlesFor(this._draft).find((h) => {
        const s = this.app.camera.worldToScreen(h.pos.x, h.pos.y);
        return Math.hypot(s.x - input.mouse.sx, s.y - input.mouse.sy) <= 12;
      });
      input.clicked = false;
      if (hit) {
        this._dragHandle = hit;
        this._dragBase = { ...this._draft, path: this._draft.path.map((q) => ({ ...q })) };
      }
    }
  }

  /* ---------------------------------------------------------------- Draw */

  private _drawBtn(ctx: CanvasRenderingContext2D, x: number, y: number, label?: string) {
    ctx.save();
    ctx.fillStyle = "rgba(37,120,235,0.95)";
    ctx.beginPath(); ctx.arc(x, y, BTN_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffffff"; ctx.fillStyle = "#ffffff"; ctx.lineWidth = 2.5;
    if (label) {
      ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, x, y + 1);
    } else {
      ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x - 2, y + 6); ctx.lineTo(x + 8, y - 6); ctx.stroke();
    }
    ctx.restore();
  }

  private _drawOverlay(ctx: CanvasRenderingContext2D) {
    const cam: any = this.app.camera;
    const S = (q: P) => cam.worldToScreen(q.x, q.y);
    this._btn = null;
    this._sideBtns = null;
    const s = this.settings;

    if ((this.phase === "dir" || this.phase === "side") && this._start && this._dir) {
      const d = this._dir, r = { x: d.y, y: -d.x };
      const a = this._start, b = { x: a.x + d.x * s.treadDepthM, y: a.y + d.y * s.treadDepthM };
      const c = { x: b.x + r.x * s.stairWidthM, y: b.y + r.y * s.stairWidthM };
      const e = { x: a.x + r.x * s.stairWidthM, y: a.y + r.y * s.stairWidthM };
      ctx.save();
      ctx.strokeStyle = "rgba(37,120,235,0.95)"; ctx.fillStyle = "rgba(37,120,235,0.12)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); [a, b, c, e].map(S).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (this.phase === "dir") {
        const cs = S(c);
        this._btn = { x: cs.x + 28, y: cs.y };
        this._drawBtn(ctx, this._btn.x, this._btn.y);
      } else {
        const ml = S({ x: (a.x + b.x) / 2 - r.x * 0.35, y: (a.y + b.y) / 2 - r.y * 0.35 });
        const mr = S({ x: (e.x + c.x) / 2 + r.x * 0.35, y: (e.y + c.y) / 2 + r.y * 0.35 });
        this._sideBtns = { left: ml, right: mr };
        this._drawBtn(ctx, ml.x, ml.y, "L");
        this._drawBtn(ctx, mr.x, mr.y, "R");
      }
    }

    if (this.phase === "path") {
      const path = this._previewPath();
      if (path.length >= 2) {
        const params = this.paramsFromSettings(path);
        const g = computeStairGeometry(params);
        this.lastWarnings = g.warnings;
        drawStair(ctx, cam, { ...params, ...s, path }, { geometry: g, alpha: 0.75, invalid: !g.valid });
        // Referenzlinie hervorheben.
        ctx.save(); ctx.strokeStyle = "rgba(37,120,235,0.9)"; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
        ctx.beginPath(); path.map(S).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
        ctx.restore();
        if (this._path.length >= 2 || g.valid) {
          const ls = S(path[path.length - 1]);
          this._btn = { x: ls.x + 30, y: ls.y - 30 };
          this._drawBtn(ctx, this._btn.x, this._btn.y);
        }
      }
    }

    if (this.phase === "edit" && this._draft) {
      const g = computeStairGeometry(this._draft);
      drawStair(ctx, cam, this._draft, { geometry: g, selected: true });
      ctx.save();
      for (const h of this.handlesFor(this._draft)) {
        const p = S(h.pos);
        ctx.fillStyle = h.kind === "boundary" ? "#ffffff" : h.kind === "width" ? "rgba(255,190,40,1)" : "rgba(37,120,235,1)";
        ctx.strokeStyle = "rgba(37,120,235,1)"; ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (h.kind === "path") ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); else ctx.rect(p.x - 5, p.y - 5, 10, 10);
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();
      let maxX = -Infinity, minY = Infinity;
      for (const t of [...g.treads.flatMap((t) => t.poly), ...g.landings.flatMap((l) => l.poly)]) {
        const p = S(t); if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y;
      }
      if (Number.isFinite(maxX)) {
        this._btn = { x: maxX + 30, y: minY - 10 };
        this._drawBtn(ctx, this._btn.x, this._btn.y);
      }
    }

    if (this._snapScreen && this.phase !== "side") drawSnapDot(ctx, this._snapScreen.x, this._snapScreen.y, { ring: true });
  }
}
