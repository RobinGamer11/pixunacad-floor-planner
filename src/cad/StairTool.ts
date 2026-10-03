/**
 * StairTool — Platzieren und Bearbeiten semantischer Treppen.
 *
 * Platzieren:
 *   "start" → erster Punkt legt die Startkante (untere Kante der ersten Stufe) fest
 *   "dir"   → Laufrichtung relativ zur Startkante (Vorschau mit Pfeil);
 *             Desktop: Klick/Enter bestätigt. Tablet: nur Häkchen/Enter.
 *   "side"  → Bezug A/B (intern left/right: A = left, B = right). Desktop: Klick legt fest. Tablet: markiert,
 *             Häkchen/Enter legt fest.
 *   "path"  → Referenzlinie zeichnen; Enter/Doppelklick (Tablet: Häkchen) schließt ab.
 * Bearbeiten ("edit"): Griff antippen wählt ihn nur aus. „Verschieben“ startet
 * eine Sitzung mit Vorschau; Häkchen/Enter speichert genau einen Undo-Schritt,
 * Escape verwirft. Kein direktes Ziehen.
 *
 * Bedienknöpfe (Häkchen, A/B) sind DOM-Elemente über der Zeichenfläche; ihre
 * Bildschirmposition wird nie als Geometrie- oder Fangpunkt verwendet.
 */
import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import { v } from "./geometry";
import { drawSnapDot } from "./snapDraw";
import { drawStair } from "./stairDraw";
import {
  computeStairGeometry, moveStairBoundary, resetStairTread, setStairWidth, riserFromRule, hitStair,
  type P, type StairParams, setLandingDepth, landingDepthOf } from "./stairGeometry";
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

export type StairHandle =
  | { kind: "boundary"; key: string; treadIndex: number; pos: P; dir: P }
  | { kind: "width"; key: string; pos: P; normal: P }
  | { kind: "path"; key: string; index: number; pos: P }
  | { kind: "landing"; key: string; knick: number; pos: P; dir: P };

export interface StairCanvasButtons {
  confirm: { x: number; y: number } | null;
  left: { x: number; y: number; active: boolean } | null;
  right: { x: number; y: number; active: boolean } | null;
}

const BLUE = "rgba(77,163,255,0.95)";
const HANDLE_HIT_PX = 12;

export function isTabletMode(): boolean {
  return typeof window !== "undefined" && !!(window as any).__pixunaTabletCommit;
}

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
  private _pendingSide: "left" | "right" | null = null;
  private _path: P[] = [];
  private _cursor: P | null = null;
  private _shift = false;
  private _snapScreen: { x: number; y: number } | null = null;
  /** Bildschirmpositionen der DOM-Bedienknöpfe (nur Anzeige). */
  buttons: StairCanvasButtons = { confirm: null, left: null, right: null };

  /** Bearbeiten einer bestehenden Treppe. */
  editId: string | null = null;
  private _draft: StairParams | null = null;
  selectedHandleKey: string | null = null;
  moving = false;
  private _moveBase: StairParams | null = null;
  private _grab: P | null = null;
  moveDeltaM = 0;
  lastWarnings: string[] = [];

  constructor(app: CadApp) { this.app = app; }

  private _setCursor(c: string) {
    try { if (this.app.canvas.style.cursor !== c) this.app.canvas.style.cursor = c; } catch { /* optional */ }
  }

  activate() {
    this.app.renderer.overlay = { draw: (ctx: CanvasRenderingContext2D) => this._drawOverlay(ctx) };
    try { this.app.hub?.hide?.(); this.app.pointEditMenu?.hide?.(); } catch { /* optional */ }
    if (!this.editId) this._resetPlacement();
    this._setCursor("default");
  }

  cancel() {
    this._resetPlacement();
    this._endEdit();
    this.app.renderer.overlay = null;
    this.buttons = { confirm: null, left: null, right: null };
    this._setCursor("default");
  }
  finish() { this.cancel(); }

  private _resetPlacement() {
    this.phase = this.editId ? "edit" : "start";
    this._start = null; this._dir = null; this._path = []; this._pendingSide = null;
  }

  /* ------------------------------------------------------------ Parameter */

  applyStepRule() {
    if (!this.settings.useStepRule) return;
    this.settings.riserHeightM = Math.max(0.05, riserFromRule(this.settings.treadDepthM, this.settings.stepRuleCm / 100));
  }

  paramsFromSettings(path: P[]): StairParams {
    const s = this.settings;
    return {
      mode: path.length > 2 ? "landing" : "straight", path, referenceSide: s.referenceSide,
      treadDepthM: s.treadDepthM, stairWidthM: s.stairWidthM, riserHeightM: s.riserHeightM,
      direction: s.direction, stepDistancesM: null, landingDepthM: null, landingDepthsM: null, riserExtra: 1,
    };
  }

  get pendingSide() { return this._pendingSide; }

  /* ----------------------------------------------------------- Bearbeiten */

  beginEdit(stairId: string): boolean {
    const st = (this.app.scene as any).getStairById?.(stairId);
    if (!st) return false;
    this.editId = stairId;
    this._draft = serializeStair(st);
    this.phase = "edit";
    this.selectedHandleKey = null;
    this.moving = false;
    this.app.renderer.stairHiddenIds = new Set([stairId]);
    return true;
  }

  private _endEdit() {
    this.editId = null;
    this._draft = null;
    this.selectedHandleKey = null;
    this.moving = false;
    this._moveBase = null;
    this._grab = null;
    if (this.app.renderer) this.app.renderer.stairHiddenIds = new Set();
  }

  /** Verlässt die Bearbeitung zurück zum Auswahlwerkzeug. */
  exitEdit() {
    this._endEdit();
    this.app.setTool("select");
  }

  editStair(): any | null {
    return this.editId ? (this.app.scene as any).getStairById?.(this.editId) ?? null : null;
  }

  selectedHandle(): StairHandle | null {
    if (!this._draft || !this.selectedHandleKey) return null;
    return this.handlesFor(this._draft).find((h) => h.key === this.selectedHandleKey) ?? null;
  }

  /** Infos zum ausgewählten Griff für das Einstellungsfenster. */
  handleInfo(): null | { kind: StairHandle["kind"]; lines: [string, string][]; canReset: boolean; resetHint?: string } {
    const h = this.selectedHandle();
    const p = this._draft;
    if (!h || !p) return null;
    const g = computeStairGeometry(p);
    const cm = (m: number) => `${(Math.round(m * 1000) / 10).toLocaleString("de-DE")} cm`;
    if (h.kind === "boundary") {
      const t = g.treads[h.treadIndex];
      const diff = t.depth - p.treadDepthM;
      return {
        kind: h.kind,
        lines: [["Stufentiefe", cm(t.depth)], ["Standardauftritt", cm(p.treadDepthM)], ["Differenz", `${diff >= 0 ? "+" : ""}${cm(diff)}`]],
        canReset: Math.abs(diff) > 1e-6,
      };
    }
    if (h.kind === "landing") {
      const l = g.landings.find((x) => x.knick === h.knick);
      const prev = g.treads.filter((t) => t.run === h.knick - 1).pop();
      const next = g.treads.find((t) => t.run === h.knick);
      return {
        kind: h.kind,
        lines: [
          ["Podesttiefe", l ? cm(l.depthM) : "—"], ["Podestbreite", l ? cm(l.widthM) : "—"],
          ["Stufe davor", prev ? cm(prev.depth) : "—"], ["Stufe danach", next ? cm(next.depth) : "—"],
        ],
        canReset: false,
        resetHint: "Eckpodest ist durch den Knick der Referenzlinie nötig.",
      };
    }
    if (h.kind === "width") return { kind: h.kind, lines: [["Laufbreite", `${p.stairWidthM.toLocaleString("de-DE", { minimumFractionDigits: 2 })} m`]], canReset: false };
    return { kind: h.kind, lines: [["Referenzpunkt", `${h.index + 1} von ${p.path.length}`]], canReset: false };
  }

  startMove(): boolean {
    if (!this._draft || !this.selectedHandle()) return false;
    this.moving = true;
    this._moveBase = { ...this._draft, path: this._draft.path.map((q) => ({ ...q })) };
    this._grab = null;
    this.moveDeltaM = 0;
    return true;
  }

  private _applyDraftToScene(): boolean {
    const st = this.editStair();
    if (!st || !this._draft) return false;
    if (!computeStairGeometry(this._draft).valid) return false;
    const { id: _id, labelId: _l, ...rest } = this._draft as any;
    Object.assign(st, rest, { path: this._draft.path.map((q) => v(q.x, q.y)) });
    st.stepDistancesM = this._draft.stepDistancesM ? [...this._draft.stepDistancesM] : null;
    st.mode = st.path.length > 2 ? "landing" : "straight";
    this.app.commitHistorySnapshot();
    return true;
  }

  /** Reset des ausgewählten Auftritts auf den Standard (ein Undo-Schritt). */
  resetSelected(): boolean {
    const h = this.selectedHandle();
    if (!h || !this._draft || h.kind !== "boundary") return false;
    const next = resetStairTread(this._draft, h.treadIndex);
    if (!next) return false;
    this._draft = next;
    return this._applyDraftToScene();
  }

  private _cancelMove() {
    if (this._moveBase) this._draft = this._moveBase;
    this.moving = false; this._moveBase = null; this._grab = null; this.moveDeltaM = 0;
  }

  /** Häkchen/Enter. */
  confirm(): boolean {
    if (this.phase === "dir" && this._start && this._dir) { this.phase = "side"; this._pendingSide = null; return true; }
    if (this.phase === "side") {
      if (!this._pendingSide) return false;
      this._commitSide(this._pendingSide);
      return true;
    }
    if (this.phase === "path") return this._finishPath();
    if (this.phase === "edit" && this.moving) {
      const ok = this._applyDraftToScene();
      if (!ok) { this._cancelMove(); return true; }
      this.moving = false; this._moveBase = null; this._grab = null; this.moveDeltaM = 0;
      return true;
    }
    return false;
  }

  /** Escape: verwirft Vorschau/Bearbeitung ohne Änderung. Rückgabe: behandelt. */
  escape(): boolean {
    this._setCursor("default");
    if (this.phase === "edit") {
      if (this.moving) { this._cancelMove(); return true; }
      if (this.selectedHandleKey) { this.selectedHandleKey = null; return true; }
      this.exitEdit();
      return true;
    }
    if (this.phase !== "start") { this._resetPlacement(); return true; }
    return false;
  }

  /** Auswahl Bezug A/B. Desktop legt direkt fest; Tablet markiert nur. */
  chooseSide(side: "left" | "right") {
    if (this.phase !== "side" || !this._start || !this._dir) return;
    this._pendingSide = side;
    this.settings.referenceSide = side;
    if (!isTabletMode()) this._commitSide(side);
  }

  private _commitSide(side: "left" | "right") {
    if (!this._start || !this._dir) return;
    this.settings.referenceSide = side;
    const d = this._dir, w = this.settings.stairWidthM;
    const r = { x: d.y, y: -d.x };
    // Startkante: vom Startpunkt nach rechts der Laufrichtung (Breite w).
    const p0 = side === "left" ? this._start : { x: this._start.x + r.x * w, y: this._start.y + r.y * w };
    this._path = [p0];
    this._pendingSide = null;
    this.phase = "path";
  }

  /* --------------------------------------------------------------- Update */

  private _snap(input: Input, extra: P[] = []): P {
    const raw = { x: input.mouse.wx, y: input.mouse.wy };
    // Zusätzliche, temporäre Fangpunkte (Startkante) mit Vorrang.
    for (const q of extra) {
      const s = this.app.camera.worldToScreen(q.x, q.y);
      if (Math.hypot(s.x - input.mouse.sx, s.y - input.mouse.sy) <= 10) { this._snapScreen = s; return { ...q }; }
    }
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

  /** Startkante (untere Kante der ersten Stufe) bei gegebener Richtung. */
  private _startEdge(): [P, P] | null {
    if (!this._start || !this._dir) return null;
    const r = { x: this._dir.y, y: -this._dir.x }, w = this.settings.stairWidthM;
    return [this._start, { x: this._start.x + r.x * w, y: this._start.y + r.y * w }];
  }

  update(input: Input) {
    const pressed = input.clicked;
    this._shift = !!input.keys?.shift;
    if (this.phase === "edit") { this._updateEdit(input); return; }
    this._setCursor("default");

    const edge = this._startEdge();
    const extra = edge ? [edge[0], edge[1], { x: (edge[0].x + edge[1].x) / 2, y: (edge[0].y + edge[1].y) / 2 }] : [];
    const w = this._snap(input, this.phase === "dir" ? [] : extra);
    this._cursor = w;
    if (this.phase === "start") {
      if (pressed) {
        input.clicked = false;
        this._start = w;
        this._dir = this._dir ?? { x: 0, y: -1 };
        this.phase = "dir";
      }
      return;
    }
    if (this.phase === "dir" && this._start) {
      const dx = w.x - this._start.x, dy = w.y - this._start.y;
      const L = Math.hypot(dx, dy);
      if (L > 1e-3) {
        let d = { x: dx / L, y: dy / L };
        if (this._shift) {
          const a = Math.round(Math.atan2(d.y, d.x) / (Math.PI / 4)) * (Math.PI / 4);
          d = { x: Math.cos(a), y: Math.sin(a) };
        }
        this._dir = d;
      }
      if (pressed) {
        input.clicked = false;
        // Desktop: Klick bestätigt die Richtung. Tablet: nur Häkchen/Enter.
        if (!isTabletMode()) this.confirm();
      }
      return;
    }
    if (this.phase === "side") {
      if (pressed) input.clicked = false;
      return;
    }
    if (this.phase === "path" && this._path.length) {
      const target = this._constrainPathPoint(w);
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

  /** Erster Lauf bleibt an die Richtung gebunden; Shift = orthogonal je Abschnitt. */
  private _constrainPathPoint(w: P): P {
    const last = this._path[this._path.length - 1];
    if (this._path.length === 1 && this._dir) {
      const t = Math.max(0, (w.x - last.x) * this._dir.x + (w.y - last.y) * this._dir.y);
      return { x: last.x + this._dir.x * t, y: last.y + this._dir.y * t };
    }
    if (this._shift && this._path.length >= 2) {
      // Orthogonal/gerade zum vorherigen Abschnitt (auch nach Podest/Ecke).
      const prev = this._path[this._path.length - 2];
      const pd = { x: last.x - prev.x, y: last.y - prev.y };
      const pl = Math.hypot(pd.x, pd.y) || 1;
      const u = { x: pd.x / pl, y: pd.y / pl }, n = { x: -u.y, y: u.x };
      const dx = w.x - last.x, dy = w.y - last.y;
      const a = dx * u.x + dy * u.y, b = dx * n.x + dy * n.y;
      return Math.abs(a) >= Math.abs(b)
        ? { x: last.x + u.x * a, y: last.y + u.y * a }
        : { x: last.x + n.x * b, y: last.y + n.y * b };
    }
    return w;
  }

  /**
   * Reine Vorschau für die Einstellungsleiste: Parameter aus Startkante,
   * Richtung, Bezugsseite, gesetzten Referenzpunkten und Zeiger. Verändert nichts.
   * null, solange die Referenzlinie noch nicht bestimmt werden kann.
   */
  getPreviewParams(): StairParams | null {
    if (this.phase === "path") {
      const path = this._previewPath();
      return path.length >= 2 ? this.paramsFromSettings(path) : null;
    }
    return null;
  }

  private _previewPath(): P[] {
    if (!this._cursor || !this._path.length) return this._path;
    return [...this._path, this._constrainPathPoint(this._cursor)];
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
    this._setCursor("default");
    try { (this.app as any).onStairCreated?.(st.id); } catch { /* optional */ }
    return true;
  }

  /* ----------------------------------------------------------- Edit-Griffe */

  handlesFor(p: StairParams): StairHandle[] {
    const g = computeStairGeometry(p);
    const hs: StairHandle[] = [];
    for (const b of g.boundaries) {
      hs.push({ kind: "boundary", key: `b${b.treadIndex}`, treadIndex: b.treadIndex, dir: b.dir, pos: { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 } });
    }
    if (g.treads.length) {
      const t = g.treads[0].poly;
      const far = { x: (t[2].x + t[3].x) / 2, y: (t[2].y + t[3].y) / 2 };
      const base = { x: (t[0].x + t[1].x) / 2, y: (t[0].y + t[1].y) / 2 };
      const L = Math.hypot(far.x - base.x, far.y - base.y) || 1;
      hs.push({ kind: "width", key: "w", pos: far, normal: { x: (far.x - base.x) / L, y: (far.y - base.y) / L } });
    }
    for (const l of g.landings) {
      if (l.knick < 0) continue;
      const a = p.path[l.knick - 1], k = p.path[l.knick];
      const L = Math.hypot(k.x - a.x, k.y - a.y) || 1;
      hs.push({ kind: "landing", key: `l${l.knick}`, knick: l.knick, pos: l.center, dir: { x: (k.x - a.x) / L, y: (k.y - a.y) / L } });
    }
    p.path.forEach((q, i) => hs.push({ kind: "path", key: `p${i}`, index: i, pos: q }));
    return hs;
  }

  private _hitHandle(input: Input): StairHandle | null {
    if (!this._draft) return null;
    return this.handlesFor(this._draft).find((h) => {
      const s = this.app.camera.worldToScreen(h.pos.x, h.pos.y);
      return Math.hypot(s.x - input.mouse.sx, s.y - input.mouse.sy) <= HANDLE_HIT_PX;
    }) ?? null;
  }

  private _updateEdit(input: Input) {
    const st = this.editStair();
    if (!st) { this.exitEdit(); return; }
    // Ohne laufende Sitzung immer vom gespeicherten Stand ausgehen (Undo/Cloud).
    if (!this.moving) this._draft = serializeStair(st);
    if (!this._draft) return;

    if (this.moving && this._moveBase) {
      this._setCursor("move");
      const h = this.handlesFor(this._moveBase).find((x) => x.key === this.selectedHandleKey);
      const w = this._snap(input);
      if (!this._grab) this._grab = w; // erster Kontakt setzt nur den Greifpunkt
      if (h) {
        const dx = w.x - this._grab.x, dy = w.y - this._grab.y;
        let next: StairParams | null = null;
        const base = this._moveBase;
        if (h.kind === "boundary") {
          this.moveDeltaM = dx * h.dir.x + dy * h.dir.y;
          next = moveStairBoundary(base, h.treadIndex, this.moveDeltaM);
        } else if (h.kind === "width") {
          this.moveDeltaM = dx * h.normal.x + dy * h.normal.y;
          next = setStairWidth(base, Math.round((base.stairWidthM + this.moveDeltaM) * 100) / 100);
        } else if (h.kind === "landing") {
          this.moveDeltaM = dx * h.dir.x + dy * h.dir.y;
          // Nur dieses eine Podest; Mindestmaß Laufbreite × Laufbreite.
          next = setLandingDepth(base, h.knick, landingDepthOf(base, h.knick) + this.moveDeltaM);
        } else {
          this.moveDeltaM = Math.hypot(dx, dy);
          const path = base.path.map((q, i) => (i === h.index ? { x: q.x + dx, y: q.y + dy } : q));
          next = { ...base, path };
        }
        if (next) {
          const g = computeStairGeometry(next);
          this.lastWarnings = g.warnings;
          if (g.valid) this._draft = next;
        }
      }
      if (input.clicked) {
        input.clicked = false;
        // Desktop: Klick bestätigt die Sitzung; Tablet: nur Häkchen/Enter.
        if (!isTabletMode()) this.confirm();
      }
      return;
    }

    const hover = this._hitHandle(input);
    this._setCursor(hover ? "pointer" : "default");
    if (input.clicked) {
      input.clicked = false;
      if (hover) { this.selectedHandleKey = hover.key; return; }
      if (hitStair(this._draft, { x: input.mouse.wx, y: input.mouse.wy })) { this.selectedHandleKey = null; return; }
      this.exitEdit();
    }
  }

  /* ---------------------------------------------------------------- Draw */

  private _drawOverlay(ctx: CanvasRenderingContext2D) {
    const cam: any = this.app.camera;
    const S = (q: P) => cam.worldToScreen(q.x, q.y);
    const tablet = isTabletMode();
    const btns: StairCanvasButtons = { confirm: null, left: null, right: null };
    const s = this.settings;
    const line = (a: P, b: P, width: number, color = BLUE, dash: number[] = []) => {
      const sa = S(a), sb = S(b);
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke(); ctx.restore();
    };

    if ((this.phase === "dir" || this.phase === "side") && this._start && this._dir) {
      const d = this._dir, r = { x: d.y, y: -d.x };
      const a = this._start, b = { x: a.x + d.x * s.treadDepthM, y: a.y + d.y * s.treadDepthM };
      const c = { x: b.x + r.x * s.stairWidthM, y: b.y + r.y * s.stairWidthM };
      const e = { x: a.x + r.x * s.stairWidthM, y: a.y + r.y * s.stairWidthM };
      ctx.save();
      ctx.strokeStyle = s.color; ctx.fillStyle = "rgba(77,163,255,0.08)"; ctx.lineWidth = 1;
      ctx.beginPath(); [a, b, c, e].map(S).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      // Startkante mit Endpunkten und Mitte.
      line(a, e, 2);
      const mid = { x: (a.x + e.x) / 2, y: (a.y + e.y) / 2 };
      for (const q of [a, e, mid]) { const sq = S(q); drawSnapDot(ctx, sq.x, sq.y, { radius: 3 }); }
      // Mittiger Laufpfeil.
      const from = S(mid), to = S({ x: mid.x + d.x * Math.max(s.treadDepthM * 2, 0.6), y: mid.y + d.y * Math.max(s.treadDepthM * 2, 0.6) });
      ctx.save(); ctx.strokeStyle = BLUE; ctx.fillStyle = BLUE; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      const ang = Math.atan2(to.y - from.y, to.x - from.x);
      ctx.beginPath(); ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - 10 * Math.cos(ang - 0.4), to.y - 10 * Math.sin(ang - 0.4));
      ctx.lineTo(to.x - 10 * Math.cos(ang + 0.4), to.y - 10 * Math.sin(ang + 0.4));
      ctx.closePath(); ctx.fill(); ctx.restore();
      if (this.phase === "dir") {
        if (tablet) { const cs = S(c); btns.confirm = { x: cs.x + 28, y: cs.y }; }
      } else {
        const sel = this._pendingSide;
        if (sel === "left") line(a, b, 3.5); else if (sel === "right") line(e, c, 3.5);
        else { line(a, b, 1.5, BLUE, [4, 3]); line(e, c, 1.5, BLUE, [4, 3]); }
        const ml = S({ x: (a.x + b.x) / 2 - r.x * 0.3, y: (a.y + b.y) / 2 - r.y * 0.3 });
        const mr = S({ x: (e.x + c.x) / 2 + r.x * 0.3, y: (e.y + c.y) / 2 + r.y * 0.3 });
        btns.left = { ...ml, active: sel === "left" };
        btns.right = { ...mr, active: sel === "right" };
        if (tablet && sel) { const cs = S(c); btns.confirm = { x: cs.x + 28, y: cs.y - 28 }; }
      }
    }

    if (this.phase === "path") {
      const path = this._previewPath();
      if (path.length >= 2) {
        const params = this.paramsFromSettings(path);
        const g = computeStairGeometry(params);
        this.lastWarnings = g.warnings;
        drawStair(ctx, cam, { ...params, ...s, path }, { geometry: g, alpha: 0.75, invalid: !g.valid });
        ctx.save(); ctx.strokeStyle = BLUE; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
        ctx.beginPath(); path.map(S).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
        ctx.restore();
        if (tablet && (this._path.length >= 2 || g.valid)) {
          const ls = S(path[path.length - 1]);
          btns.confirm = { x: ls.x + 30, y: ls.y - 30 };
        }
      }
    }

    if (this.phase === "edit" && this._draft) {
      const g = computeStairGeometry(this._draft);
      drawStair(ctx, cam, this._draft, { geometry: g, selected: true, invalid: !g.valid });
      // Fangpunkte der Treppe sichtbar.
      for (const q of g.snapPoints) {
        const sq = S(q);
        ctx.save(); ctx.fillStyle = "rgba(77,163,255,0.55)";
        ctx.beginPath(); ctx.arc(sq.x, sq.y, 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      // Referenzlinie.
      ctx.save(); ctx.strokeStyle = BLUE; ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); this._draft.path.map(S).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
      ctx.restore();
      for (const h of this.handlesFor(this._draft)) {
        const p = S(h.pos);
        const active = h.key === this.selectedHandleKey;
        drawSnapDot(ctx, p.x, p.y, { radius: active ? 5 : 3.5, ring: active });
      }
      if (this.moving) {
        const h = this.selectedHandle();
        if (h) {
          const p = S(h.pos);
          const txt = `Δ ${(Math.round(this.moveDeltaM * 1000) / 10).toLocaleString("de-DE")} cm`;
          ctx.save(); ctx.font = "12px sans-serif"; ctx.textBaseline = "bottom";
          const tw = ctx.measureText(txt).width;
          ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.fillRect(p.x + 10, p.y - 26, tw + 10, 18);
          ctx.fillStyle = "#1f2937"; ctx.fillText(txt, p.x + 15, p.y - 11); ctx.restore();
          if (tablet) btns.confirm = { x: p.x + 40, y: p.y + 30 };
        }
      }
    }

    if (this._snapScreen && this.phase !== "side") drawSnapDot(ctx, this._snapScreen.x, this._snapScreen.y, { ring: true });
    this.buttons = btns;
  }
}
