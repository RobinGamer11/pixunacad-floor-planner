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
import { setKnickMode, moveStairOuterPoint, setLandingSideDepth, landingExitDepthOf } from "./stairGeometry";
const landingSide = (e: { key: string }): "entry" | "exit" => (e.key.endsWith("out") ? "exit" : "entry");
const sideDepth = (p: StairParams, k: number, side: "entry" | "exit") => (side === "exit" ? landingExitDepthOf(p, k) : landingDepthOf(p, k));
import { drawStair } from "./stairDraw";
import {
  computeStairGeometry, moveStairBoundary, resetStairTread, setStairWidth, riserFromRule, hitStair,
  type P, type StairParams, setLandingDepth, landingDepthOf, translateStair, rotateStair, stairEditableEdges, MIN_TREAD_M, type StairEdge, extendStairPath, stairOuterPointIndex } from "./stairGeometry";
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

/**
 * Treppengriffe = normale CAD-Fangpunkte: je bearbeitbarer Kante zwei
 * Endpunkte + Kantenmitte; Referenzpunkte der Linie sind strukturell.
 */
export type StairHandle =
  | { kind: "edge"; key: string; pos: P; edge: StairEdge }
  | { kind: "point"; key: string; pos: P; pathIndex: number | null; assocIndex?: number | null };

/** Laufende Bearbeitung (über das kleine Punktmenü gestartet). */
export type StairEditAction = "edge" | "movePoint" | "translate" | "rotate" | "extend";

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
  moveAngle = 0;
  action: StairEditAction | null = null;
  private _pivot: P | null = null;
  private _rotStart: number | null = null;
  private _prevLeft = false;
  private _regrab = false;
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
      direction: s.direction, stepDistancesM: null, landingDepthM: null, landingDepthsM: null, landingExitDepthsM: null, riserExtra: 1,
      winderCount: (s as any).winderCount ?? null, minWinderInnerTreadM: (s as any).minWinderInnerTreadM ?? null,
    };
  }

  get pendingSide() { return this._pendingSide; }

  /* ----------------------------------------------------------- Bearbeiten */

  beginEdit(stairId: string): boolean {
    const st = (this.app.scene as any).getStairById?.(stairId);
    if (!st) return false;
    if (this.app.labelManager && !this.app.labelManager.isEditable(st.labelId)) return false;
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
  handleInfo(): null | {
    kind: "boundary" | "landing" | "width" | "ref" | "point";
    lines: [string, string][];
    canReset: boolean; resetHint?: string;
    /** Editierbare Werte (dieselben reinen Geometriefunktionen wie die Griffe). */
    fields: { id: "tread" | "diff" | "landing" | "width"; label: string; unit: "cm" | "m"; value: number; min: number; signed?: boolean }[];
  } {
    const h = this.selectedHandle();
    const p = this._draft;
    if (!h || !p) return null;
    const g = computeStairGeometry(p);
    const cm = (m: number) => `${(Math.round(m * 1000) / 10).toLocaleString("de-DE")} cm`;
    const m2 = (m: number) => `${m.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
    if (h.kind === "edge" && h.edge.kind === "boundary") {
      const t = g.treads.find((t) => t.index === h.edge.treadIndex)!;
      const diff = t.depth - p.treadDepthM;
      return {
        kind: "boundary",
        canReset: Math.abs(diff) > 1e-6,
        lines: [["Standardauftritt", cm(p.treadDepthM)]],
        fields: [
          { id: "tread", label: "Stufentiefe", unit: "cm", value: t.depth * 100, min: MIN_TREAD_M * 100 },
          { id: "diff", label: "Differenz", unit: "cm", value: diff * 100, min: (MIN_TREAD_M - p.treadDepthM) * 100, signed: true },
        ],
      };
    }
    if (h.kind === "edge" && h.edge.kind === "landing") {
      const k = h.edge.knick!;
      const prev = g.treads.filter((t) => t.run === k - 1 && !t.isWinder).pop();
      const next = g.treads.find((t) => t.run === k && !t.isWinder);
      return {
        kind: "landing",
        lines: [
          ["Mindestmaß", `${m2(p.stairWidthM)} × ${m2(p.stairWidthM)}`],
          ["Stufe davor", prev ? cm(prev.depth) : "—"], ["Stufe danach", next ? cm(next.depth) : "—"],
        ],
        canReset: sideDepth(p, k, landingSide(h.edge)) > p.stairWidthM + 1e-6,
        resetHint: "Podest hat bereits das Mindestmaß.",
        fields: [{ id: "landing", label: "Podesttiefe", unit: "m", value: sideDepth(p, k, landingSide(h.edge)), min: p.stairWidthM }],
      };
    }
    if (h.kind === "edge" && h.edge.kind === "width") {
      return { kind: "width", lines: [], canReset: false, fields: [{ id: "width", label: h.edge.knick ? "Podestbreite" : "Laufbreite", unit: "m", value: p.stairWidthM, min: 0.3 }] };
    }
    if (h.kind === "edge") {
      return { kind: "ref", lines: [["Bezugskante", "bleibt fest"], ["Länge", m2(Math.hypot(h.edge.b.x - h.edge.a.x, h.edge.b.y - h.edge.a.y))]], canReset: false, fields: [] };
    }
    const lines: [string, string][] = [];
    if (h.pathIndex != null) {
      const i = h.pathIndex;
      const seg = (a: number) => Math.hypot(p.path[a + 1].x - p.path[a].x, p.path[a + 1].y - p.path[a].y);
      if (i > 0) lines.push([`Lauf ${i} (davor)`, m2(seg(i - 1))]);
      if (i < p.path.length - 1) lines.push([`Lauf ${i + 1} (danach)`, m2(seg(i))]);
    } else {
      lines.push(["Gesamtlauflänge", m2(g.totalRunM)]);
    }
    return { kind: "point", lines, canReset: false, fields: [] };
  }

  /** Zahleneingabe rechts — nutzt dieselben Funktionen wie „Kante bewegen“. Ein Undo-Schritt. */
  setHandleValue(id: "tread" | "diff" | "landing" | "width", value: number): boolean {
    const h = this.selectedHandle();
    const p = this._draft;
    if (!h || !p || h.kind !== "edge" || this.moving) return false;
    let next: StairParams | null = null;
    if (id === "tread" && h.edge.treadIndex != null) {
      const t = computeStairGeometry(p).treads.find((t) => t.index === h.edge.treadIndex)!;
      next = t ? moveStairBoundary(p, h.edge.treadIndex, value / 100 - t.depth) : null;
    } else if (id === "diff" && h.edge.treadIndex != null) {
      // Neue Stufentiefe = Standardauftritt + Differenz (dieselbe Funktion wie „Kante bewegen“).
      const t = computeStairGeometry(p).treads.find((t) => t.index === h.edge.treadIndex)!;
      next = t ? moveStairBoundary(p, h.edge.treadIndex, p.treadDepthM + value / 100 - t.depth) : null;
    } else if (id === "landing" && h.edge.knick != null) {
      next = setLandingSideDepth(p, h.edge.knick, landingSide(h.edge), value);
    } else if (id === "width") {
      next = setStairWidth(p, value);
    }
    if (!next) { this.lastWarnings = ["Wert nicht zulässig (Mindestmaß)."]; return false; }
    const g = computeStairGeometry(next);
    this.lastWarnings = g.warnings;
    if (!g.valid) return false;
    this._draft = next;
    return this._applyDraftToScene();
  }

  /** Startet eine Bearbeitung des ausgewählten Griffs (aus dem Punktmenü). */
  startAction(action: StairEditAction): boolean {
    const h = this.selectedHandle();
    if (!this._draft || !h) return false;
    if (action === "edge" && h.kind !== "edge") return false;
    if (action === "movePoint" && !(h.kind === "point" && (h.pathIndex ?? h.assocIndex) != null)) return false;
    if (action === "extend" && !(h.kind === "point" && h.pathIndex === this._draft.path.length - 1)) return false;
    this._ext = [];
    this.moving = true;
    this.action = action;
    this._moveBase = { ...this._draft, path: this._draft.path.map((q) => ({ ...q })) };
    this._pivot = { ...h.pos };
    this._rotStart = null;
    this.moveDeltaM = 0;
    this.moveAngle = 0;
    // Desktop: der angeklickte Fangpunkt ist sofort Greifpunkt (wie übrige CAD-Fangpunkte).
    // Tablet: erst das nächste Aufsetzen greift — kein Sprung.
    this._grab = isTabletMode() ? null : { ...h.pos };
    this._prevLeft = !!this.app.input?.mouse?.left;
    try { this.app.pointEditMenu?.hide?.(); } catch { /* optional */ }
    return true;
  }

  /** Aktive Zeichenebene; gesperrt/ausgeblendet → erste sichtbare, entsperrte Ebene. */
  private _drawLabelId(): string | undefined {
    const lm: any = this.app.labelManager;
    const cur = (this.app as any).activeDrawLabelId as string | undefined;
    if (!lm || !cur || lm.isEditable(cur)) return cur || undefined;
    return lm.list().find((g: any) => lm.isEditable(g.id))?.id ?? cur;
  }

  /** Knick des ausgewählten Griffs (Podestkante oder innerer Referenzpunkt). */
  selectedKnick(): number | null {
    const h = this.selectedHandle();
    const p = this._draft;
    if (!h || !p) return null;
    if (h.kind === "edge" && h.edge.knick != null && h.edge.knick > 0) return h.edge.knick;
    const i = h.kind === "point" ? h.pathIndex : null;
    return i != null && i > 0 && i < p.path.length - 1 ? i : null;
  }

  /** Knickausbildung am ausgewählten Knick setzen (genau ein Undo-Schritt). */
  setKnickModeSelected(mode: "landing" | "winder"): boolean {
    const st = this.editStair();
    const k = this.selectedKnick();
    if (!st || k == null || !this._draft) return false;
    const next = setKnickMode(this._draft, k, mode);
    if (!next) return false;
    const g = computeStairGeometry(next);
    if (!g.valid) { this.lastWarnings = g.warnings; return false; }
    st.knickModes = next.knickModes ?? null;
    this._draft = serializeStair(st);
    this.lastWarnings = [];
    // Podestkante existiert bei „Gewendelt“ nicht mehr → auf den Knickpunkt umschalten.
    const ph = this.handlesFor(this._draft).find((h) => h.kind === "point" && h.pathIndex === k);
    this.selectedHandleKey = ph ? ph.key : null;
    this.app.commitHistorySnapshot();
    this.app.renderer?.render?.();
    return true;
  }

  /** Wendelvorgaben (Anzahl, Mindestauftritt innen) – genau ein Undo-Schritt. */
  setWinderSetting(patch: { winderCount?: number; minWinderInnerTreadM?: number }): boolean {
    const st = this.editStair();
    if (!st) { Object.assign(this.settings as any, patch); return true; }
    const next = { ...serializeStair(st), ...patch };
    const g = computeStairGeometry(next);
    Object.assign(st, patch);
    this._draft = serializeStair(st);
    this.lastWarnings = g.valid ? [] : g.warnings;
    this.app.commitHistorySnapshot();
    this.app.renderer?.render?.();
    return true;
  }

  /** Kompatibilität: „Verschieben“ = Treppe am Griff verschieben. */
  startMove(): boolean { return this.startAction("translate"); }

  /** Aktion aus dem kleinen CAD-Punktmenü. */
  onPointMenuAction(action: string): boolean {
    if (this.phase !== "edit") return false;
    if (action === "delete" && !this.selectedHandleKey) {
      const st = this.editStair();
      if (st) {
        (this.app.scene as any).removeStair?.(st);
        this.app.commitHistorySnapshot();
        try { this.app.pointEditMenu?.hide?.(); } catch { /* optional */ }
        this.exitEdit();
      }
      return true;
    }
    const map: Record<string, StairEditAction> = { offset: "edge", move: "movePoint", translate: "translate", rotate: "rotate", insertPoint: "extend" };
    const a = map[action];
    return a ? this.startAction(a) : false;
  }

  private _menuActionsFor(h: StairHandle): string[] {
    if (h.kind === "edge") return ["offset", "translate", "rotate"].filter((a) => a !== "offset" || h.edge.kind !== "ref");
    if (h.pathIndex != null) {
      const last = !!this._draft && h.pathIndex === this._draft.path.length - 1;
      // Einzelne Treppenpunkte bieten nie „Löschen“ – die Treppe wird nur als Ganzes gelöscht.
      return last ? ["move", "translate", "rotate", "insertPoint"] : ["move", "translate", "rotate"];
    }
    return h.assocIndex != null ? ["move", "translate", "rotate"] : ["translate", "rotate"];
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

  /** Reset des ausgewählten Griffs auf Standard (Auftritt bzw. Podest-Mindestmaß); ein Undo-Schritt. */
  resetSelected(): boolean {
    const h = this.selectedHandle();
    if (!h || !this._draft || h.kind !== "edge") return false;
    let next: StairParams | null = null;
    if (h.edge.kind === "boundary") next = resetStairTread(this._draft, h.edge.treadIndex!);
    else if (h.edge.kind === "landing") next = setLandingSideDepth(this._draft, h.edge.knick!, landingSide(h.edge), this._draft.stairWidthM);
    if (!next) return false;
    this._draft = next;
    return this._applyDraftToScene();
  }

  /** Laufende Ergänzung: bereits gesetzte neue Referenzpunkte. */
  private _ext: P[] = [];
  private _extCursor: P | null = null;

  private _extPreview(withCursor: boolean): StairParams | null {
    if (!this._moveBase) return null;
    const pts = [...this._ext];
    if (withCursor && this._extCursor) pts.push(this._extCursor);
    return extendStairPath(this._moveBase, pts);
  }

  /** Shift richtet den neuen Lauf gerade bzw. orthogonal zum vorherigen Abschnitt aus. */
  private _constrainExt(w: P): P {
    const path = this._extPreview(false)?.path ?? [];
    if (!this._shift || path.length < 2) return w;
    const last = path[path.length - 1], prev = path[path.length - 2];
    const L = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
    const u = { x: (last.x - prev.x) / L, y: (last.y - prev.y) / L }, n = { x: -u.y, y: u.x };
    const dx = w.x - last.x, dy = w.y - last.y;
    const a = dx * u.x + dy * u.y, b = dx * n.x + dy * n.y;
    return Math.abs(a) >= Math.abs(b) ? { x: last.x + u.x * a, y: last.y + u.y * a } : { x: last.x + n.x * b, y: last.y + n.y * b };
  }

  private _updateExtend(input: Input, pressed: boolean) {
    const target = this._constrainExt(this._snap(input));
    this._extCursor = target;
    if (input.doubleClicked) {
      input.doubleClicked = false; input.clicked = false;
      this._finishExtend();
      return;
    }
    // Klick/Tippen setzt einen Referenzpunkt; Fingerheben bestätigt nie.
    if (input.clicked || (isTabletMode() && pressed)) {
      input.clicked = false;
      const path = this._extPreview(false)?.path ?? [];
      const last = path[path.length - 1];
      if (!last || Math.hypot(target.x - last.x, target.y - last.y) > 1e-3) this._ext.push(target);
    }
    const next = this._extPreview(true);
    if (next) {
      const g = computeStairGeometry(next);
      this.lastWarnings = g.warnings;
      this._draft = next;
      this.moveDeltaM = this._extCursor && this._moveBase ? Math.hypot(target.x - this._moveBase.path[this._moveBase.path.length - 1].x, target.y - this._moveBase.path[this._moveBase.path.length - 1].y) : 0;
    }
  }

  /** Doppelklick/Enter/✓: gesamte Ergänzung als genau ein Undo-Schritt. */
  private _finishExtend(): boolean {
    const next = this._ext.length ? this._extPreview(false) : this._extPreview(true);
    if (!next || !this._moveBase || next.path.length === this._moveBase.path.length && next.path.every((q, i) => q.x === this._moveBase!.path[i].x && q.y === this._moveBase!.path[i].y)) {
      this._cancelMove();
      return true;
    }
    const g = computeStairGeometry(next);
    this.lastWarnings = g.warnings;
    if (!g.valid) { this._draft = next; return false; }
    this._draft = next;
    this._applyDraftToScene();
    this.moving = false; this._moveBase = null; this._grab = null; this.moveDeltaM = 0; this.moveAngle = 0; this.action = null; this._regrab = false;
    this._ext = []; this._extCursor = null;
    this.selectedHandleKey = null;
    return true;
  }

  private _cancelMove() {
    this._ext = []; this._extCursor = null;
    if (this._moveBase) this._draft = this._moveBase;
    this.moving = false; this._moveBase = null; this._grab = null; this.moveDeltaM = 0; this.moveAngle = 0; this.action = null; this._regrab = false;
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
    if (this.phase === "edit" && this.moving && this.action === "extend") return this._finishExtend();
    if (this.phase === "edit" && this.moving) {
      const ok = this._applyDraftToScene();
      if (!ok) { this._cancelMove(); return true; }
      this.moving = false; this._moveBase = null; this._grab = null; this.moveDeltaM = 0; this.moveAngle = 0; this.action = null; this._regrab = false;
      return true;
    }
    return false;
  }

  /** Escape: verwirft Vorschau/Bearbeitung ohne Änderung. Rückgabe: behandelt. */
  escape(): boolean {
    this._setCursor("default");
    if (this.phase === "edit") {
      if (this.moving) { this._cancelMove(); return true; }
      if (this.selectedHandleKey) { this.selectedHandleKey = null; try { this.app.pointEditMenu?.hide?.(); } catch { /* optional */ } return true; }
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

  /**
   * Rechtsklick in allen Treppenschritten: Fangpunkte setzt CadApp bereits als
   * globale Hilfslinie; hier kommt die parallele Hilfslinie zu einer Kante dazu
   * (bestehende GlobalGuides, keine eigene Treppen-Hilfslinienlogik).
   */
  private _handleRightClick(input: Input): boolean {
    if (!input.rightClicked) return false;
    const guides = (this.app as any).globalGuides;
    if (!guides?.toggleLine) return false;
    const mS = { x: input.mouse.sx, y: input.mouse.sy }, mW = { x: input.mouse.wx, y: input.mouse.wy };
    let edge: [P, P] | null = null;
    try {
      const snap = (this.app as any).topology?.findBestSnap?.(mS, mW);
      if (snap?.lineA && snap?.lineB) edge = [snap.lineA, snap.lineB];
    } catch { /* optional */ }
    if (!edge) {
      // Temporäre Kanten (Startkante, Vorschau/Entwurf) sind nicht in der Topologie.
      const cands: [P, P][] = [];
      const se = this._startEdge(); if (se) cands.push(se);
      if (this._draft) for (const e of stairEditableEdges(this._draft)) cands.push([e.a, e.b]);
      let bd = 10;
      for (const [a, b] of cands) {
        const sa = this.app.camera.worldToScreen(a.x, a.y), sb = this.app.camera.worldToScreen(b.x, b.y);
        const dx = sb.x - sa.x, dy = sb.y - sa.y, L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((mS.x - sa.x) * dx + (mS.y - sa.y) * dy) / L2));
        const d = Math.hypot(sa.x + dx * t - mS.x, sa.y + dy * t - mS.y);
        if (d < bd) { bd = d; edge = [a, b]; }
      }
    }
    if (!edge) return false;
    // Durch den aktuellen Bezugspunkt (letzter Referenzpunkt/Startpunkt/Griff), sonst durch die Kante selbst.
    const sel = this.selectedHandle();
    const through: P = (this.phase === "path" && this._path.length ? this._path[this._path.length - 1] : null)
      ?? (this.phase === "dir" || this.phase === "side" ? this._start : null)
      ?? (this.phase === "edit" && sel ? sel.pos : null)
      ?? edge[0];
    guides.toggleLine(through, { x: edge[1].x - edge[0].x, y: edge[1].y - edge[0].y });
    input.rightClicked = false;
    return true;
  }

  update(input: Input) {
    const pressed = input.clicked;
    this._shift = !!input.keys?.shift;
    this._handleRightClick(input);
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
      ...params, labelId: this._drawLabelId(),
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
    const key = (q: P) => `${Math.round(q.x * 1e4)}:${Math.round(q.y * 1e4)}`;
    const pts = new Map<string, StairHandle>();
    // Strukturelle Referenzpunkte zuerst (Vorrang bei gleicher Lage).
    p.path.forEach((q, i) => pts.set(key(q), { kind: "point", key: `p${i}`, pos: q, pathIndex: i }));
    const hs: StairHandle[] = [];
    for (const e of stairEditableEdges(p, g)) {
      hs.push({ kind: "edge", key: `e:${e.key}`, pos: { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }, edge: e });
      ([[e.a, "a"], [e.b, "b"]] as const).forEach(([q, end]) => {
        if (!pts.has(key(q))) pts.set(key(q), { kind: "point", key: `c:${e.key}:${end}`, pos: q, pathIndex: null, assocIndex: stairOuterPointIndex(p, q) });
      });
    }
    return [...pts.values(), ...hs];
  }

  private _hitHandle(input: Input): StairHandle | null {
    if (!this._draft) return null;
    let best: StairHandle | null = null, bd = HANDLE_HIT_PX;
    for (const h of this.handlesFor(this._draft)) {
      const s = this.app.camera.worldToScreen(h.pos.x, h.pos.y);
      const d = Math.hypot(s.x - input.mouse.sx, s.y - input.mouse.sy);
      if (d <= bd) { bd = d; best = h; }
    }
    return best;
  }

  /** Shift: Verschiebung gerade/orthogonal zur Laufrichtung des ersten Laufs. */
  private _constrainDelta(dx: number, dy: number, base: StairParams): P {
    if (!this._shift || base.path.length < 2) return { x: dx, y: dy };
    const a = base.path[0], b = base.path[1];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, n = { x: -u.y, y: u.x };
    const pu = dx * u.x + dy * u.y, pn = dx * n.x + dy * n.y;
    return Math.abs(pu) >= Math.abs(pn) ? { x: u.x * pu, y: u.y * pu } : { x: n.x * pn, y: n.y * pn };
  }

  private _updateEdit(input: Input) {
    const st = this.editStair();
    if (!st) { this.exitEdit(); return; }
    // Ebene ausgeblendet oder gesperrt: Bearbeitung sauber beenden (keine Griffe/Fangpunkte mehr).
    if (this.app.labelManager && !this.app.labelManager.isEditable(st.labelId)) { this.exitEdit(); return; }
    // Ohne laufende Sitzung immer vom gespeicherten Stand ausgehen (Undo/Cloud).
    if (!this.moving) this._draft = serializeStair(st);
    if (!this._draft) return;

    if (this.moving && this._moveBase) {
      const left = !!input.mouse.left;
      const pressed = left && !this._prevLeft;
      this._prevLeft = left;
      this._setCursor(this.action === "rotate" ? "crosshair" : this.action === "extend" ? "crosshair" : "move");
      if (this.action === "extend") { this._updateExtend(input, pressed); return; }
      const h = this.handlesFor(this._moveBase).find((x) => x.key === this.selectedHandleKey);
      const w = this._snap(input);
      // Tablet: erstes Aufsetzen legt nur den Greifpunkt fest.
      if (!this._grab) {
        if (pressed) { this._grab = w; input.clicked = false; }
        return;
      }
      if (isTabletMode() && !left && !pressed) {
        // Finger angehoben: Vorschau bleibt stehen; nächstes Aufsetzen greift neu.
        if (this._draft !== this._moveBase) { /* stehen lassen */ }
        input.clicked = false;
        this._regrab = true;
        return;
      }
      if (isTabletMode() && this._regrab && pressed) {
        // Neues Aufsetzen: von der aktuellen Vorschau aus weiter (kein Sprung).
        this._moveBase = { ...this._draft, path: this._draft.path.map((q) => ({ ...q })) };
        this._grab = w; this._regrab = false; this._rotStart = null;
        if (this.action !== "rotate" && h) this._pivot = { ...h.pos };
        input.clicked = false;
        return;
      }
      if (h) {
        const base = this._moveBase;
        const raw = { x: w.x - this._grab.x, y: w.y - this._grab.y };
        let next: StairParams | null = null;
        if (this.action === "edge" && h.kind === "edge") {
          const e = h.edge;
          this.moveDeltaM = raw.x * e.dir.x + raw.y * e.dir.y;
          if (e.kind === "boundary") next = moveStairBoundary(base, e.treadIndex!, this.moveDeltaM);
          else if (e.kind === "width") next = setStairWidth(base, Math.round((base.stairWidthM + this.moveDeltaM) * 1000) / 1000);
          else if (e.kind === "landing") next = setLandingSideDepth(base, e.knick!, landingSide(e), sideDepth(base, e.knick!, landingSide(e)) + this.moveDeltaM);
        } else if (this.action === "movePoint" && h.kind === "point" && (h.pathIndex ?? h.assocIndex) != null) {
          const idx = (h.pathIndex ?? h.assocIndex)!;
          const d = this._constrainDelta(raw.x, raw.y, base);
          this.moveDeltaM = Math.hypot(d.x, d.y);
          next = h.pathIndex == null
            ? moveStairOuterPoint(base, idx, h.pos, { x: h.pos.x + d.x, y: h.pos.y + d.y })
            : { ...base, path: base.path.map((q, i) => (i === idx ? { x: q.x + d.x, y: q.y + d.y } : q)) };
        } else if (this.action === "translate") {
          const d = this._constrainDelta(raw.x, raw.y, base);
          this.moveDeltaM = Math.hypot(d.x, d.y);
          next = translateStair(base, d.x, d.y);
        } else if (this.action === "rotate" && this._pivot) {
          const pv = this._pivot;
          const sp = this.app.camera.worldToScreen(pv.x, pv.y);
          if (Math.hypot(input.mouse.sx - sp.x, input.mouse.sy - sp.y) > 12) {
            const ang = Math.atan2(w.y - pv.y, w.x - pv.x);
            if (this._rotStart == null) this._rotStart = ang;
            let delta = ang - this._rotStart;
            if (this._shift) delta = Math.round(delta / (Math.PI / 12)) * (Math.PI / 12);
            this.moveAngle = delta;
            next = rotateStair(base, pv, delta);
          }
        }
        if (next) {
          const g = computeStairGeometry(next);
          this.lastWarnings = g.warnings;
          // Ungültig: letzte gültige Vorschau bleibt, Warnung erscheint.
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
      if (hover) {
        // Fangpunkt antippen = auswählen + kleines Punktmenü direkt am Punkt.
        this.selectedHandleKey = hover.key;
        const sp = this.app.camera.worldToScreen(hover.pos.x, hover.pos.y);
        try {
          const btn = (this.app.pointEditMenu as any).buttonsByAction?.insertPoint as HTMLButtonElement | undefined;
          if (btn) {
            if (btn.dataset.stairOrigTitle == null) btn.dataset.stairOrigTitle = btn.title || "";
            btn.title = "Podest / Lauf ergänzen"; btn.setAttribute("aria-label", "Podest / Lauf ergänzen");
          }
          this.app.pointEditMenu.showAt(sp.x, sp.y, this._menuActionsFor(hover));
        } catch { /* optional */ }
        return;
      }
      try { this.app.pointEditMenu?.hide?.(); } catch { /* optional */ }
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
      const handles = this.handlesFor(this._draft);
      const selH = handles.find((h) => h.key === this.selectedHandleKey);
      if (selH && selH.kind === "edge") line(selH.edge.a, selH.edge.b, 3);
      for (const h of handles) {
        const p = S(h.pos);
        const active = h.key === this.selectedHandleKey;
        drawSnapDot(ctx, p.x, p.y, { radius: active ? 5 : 3.5, ring: active });
      }
      if (this.moving) {
        const h = this.selectedHandle();
        if (h) {
          const p = S(h.pos);
          const txt = this.action === "rotate"
            ? `${(Math.round(this.moveAngle * 1800 / Math.PI) / 10).toLocaleString("de-DE")}°`
            : this._grab ? `Δ ${(Math.round(this.moveDeltaM * 1000) / 10).toLocaleString("de-DE")} cm` : "Aufsetzen zum Greifen";
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
