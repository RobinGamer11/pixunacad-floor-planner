/**
 * MiniSelectTool — Auswahl-Werkzeug für den eingebetteten MiniCad.
 *
 * Verhalten (Option B):
 *  • Plain-Left auf CAD-Objekt  → auswählen + verschieben (Drag)
 *  • Plain-Left auf leere Fläche → propagiert (Parent kümmert sich ums Pan)
 *
 * Unterstützte Objekte: Segments (Linien) und TextBoxes.
 * Für ausgewählte Segmente wird die LineHub-Box mit Länge/Winkel angezeigt
 * (Eingabe → Endpunkt b wird entsprechend angepasst, a bleibt fix).
 */
import { SelectionType } from "../constants";
import type { MiniCad } from "./MiniCad";
import type { Segment, TextBox } from "../Scene";

const HIT_TOL_PX = 6;

type Mode = "idle" | "moveSeg" | "moveText";

export class MiniSelectTool {
  private app: MiniCad;
  private canvas: HTMLCanvasElement;
  private mode: Mode = "idle";
  private active = false;
  private dragStartWorld = { x: 0, y: 0 };
  private startSegA = { x: 0, y: 0 };
  private startSegB = { x: 0, y: 0 };
  private startTextCenter = { x: 0, y: 0 };
  private dragSegId: string | null = null;
  private dragTextId: string | null = null;
  private cleanups: Array<() => void> = [];

  constructor(app: MiniCad) {
    this.app = app;
    this.canvas = app.dom.canvas;
  }

  activate() {
    if (this.active) return;
    this.active = true;
    const onDown = (e: MouseEvent) => this.onDown(e);
    const onMove = (e: MouseEvent) => this.onMove(e);
    const onUp = (e: MouseEvent) => this.onUp(e);
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    this.canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey);
    this.cleanups.push(() => this.canvas.removeEventListener("mousedown", onDown));
    this.cleanups.push(() => window.removeEventListener("mousemove", onMove));
    this.cleanups.push(() => window.removeEventListener("mouseup", onUp));
    this.cleanups.push(() => window.removeEventListener("keydown", onKey));
  }

  cancel() {
    if (!this.active) return;
    this.active = false;
    this.mode = "idle";
    this.dragSegId = null;
    this.dragTextId = null;
    try { this.app.clearSelection(); } catch {}
    try { this.app.hub.hide(); } catch {}
    try { this.app.hub.bindCommit(null); } catch {}
    for (const fn of this.cleanups) { try { fn(); } catch {} }
    this.cleanups = [];
  }

  update(_input: any) { /* tool ist DOM-eventbasiert */ }

  /* ===== Hit-Test ===== */

  private clientToWorld(clientX: number, clientY: number) {
    const c = this.canvas;
    const r = c.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return { x: 0, y: 0 };
    const sxScale = c.width / r.width;
    const syScale = c.height / r.height;
    const sx = (clientX - r.left) * sxScale;
    const sy = (clientY - r.top) * syScale;
    return this.app.camera.screenToWorld(sx, sy);
  }

  private hitTextBox(wp: { x: number; y: number }): TextBox | null {
    // Iteriere in umgekehrter Z-Reihenfolge (oben zuerst).
    const list = this.app.scene.textBoxes;
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i];
      const dx = wp.x - t.center.x;
      const dy = wp.y - t.center.y;
      const cos = Math.cos(-t.rotationRad), sin = Math.sin(-t.rotationRad);
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      if (Math.abs(lx) <= t.widthM / 2 && Math.abs(ly) <= t.heightM / 2) return t;
    }
    return null;
  }

  private hitSegment(wp: { x: number; y: number }): Segment | null {
    const tolW = HIT_TOL_PX / Math.max(1e-6, this.app.camera.scale);
    let best: Segment | null = null;
    let bestD = tolW;
    for (const s of this.app.scene.segments) {
      if (this.app.isFrameSegment(s)) continue;
      const d = distancePointToSegment(wp, s.a, s.b);
      if (d <= bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /* ===== Events ===== */

  private onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      this.mode = "idle";
      this.dragSegId = null; this.dragTextId = null;
      this.app.clearSelection();
      this.app.hub.hide();
      this.app.hub.bindCommit(null);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (this.dragSegId) {
        const s = this.app.scene.getSegmentById(this.dragSegId);
        if (s) this.app.scene.removeSegment(s);
        this.dragSegId = null;
        this.app.clearSelection(); this.app.hub.hide();
        this.app.refreshLabelUI();
      } else if (this.dragTextId) {
        const t = this.app.scene.getTextBoxById(this.dragTextId);
        if (t) this.app.scene.removeTextBox(t);
        this.dragTextId = null;
        this.app.clearSelection();
        this.app.refreshLabelUI();
      }
    }
  }

  private onDown(e: MouseEvent) {
    if (e.button !== 0 || e.altKey) return; // Mid/Alt → Parent-Pan
    const wp = this.clientToWorld(e.clientX, e.clientY);

    const tb = this.hitTextBox(wp);
    if (tb) {
      e.preventDefault();
      e.stopPropagation();
      this.mode = "moveText";
      this.dragTextId = tb.id;
      this.dragSegId = null;
      this.dragStartWorld = wp;
      this.startTextCenter = { x: tb.center.x, y: tb.center.y };
      this.app.setSelection({ type: SelectionType.TEXTBOX, textBoxId: tb.id } as any);
      this.app.hub.hide();
      return;
    }

    const seg = this.hitSegment(wp);
    if (seg) {
      e.preventDefault();
      e.stopPropagation();
      this.mode = "moveSeg";
      this.dragSegId = seg.id;
      this.dragTextId = null;
      this.dragStartWorld = wp;
      this.startSegA = { x: seg.a.x, y: seg.a.y };
      this.startSegB = { x: seg.b.x, y: seg.b.y };
      this.app.setSelection({ type: SelectionType.SEGMENT, segmentId: seg.id } as any);
      this.showHubForSegment(seg);
      return;
    }

    // Leere Fläche: nichts auswählen, durchreichen → Parent kann pannen.
    this.app.clearSelection();
    this.app.hub.hide();
    this.app.hub.bindCommit(null);
    this.dragSegId = null;
    this.dragTextId = null;
  }

  private onMove(e: MouseEvent) {
    if (this.mode === "idle") return;
    const wp = this.clientToWorld(e.clientX, e.clientY);
    const dx = wp.x - this.dragStartWorld.x;
    const dy = wp.y - this.dragStartWorld.y;
    if (this.mode === "moveSeg" && this.dragSegId) {
      const s = this.app.scene.getSegmentById(this.dragSegId);
      if (!s) return;
      s.a.x = this.startSegA.x + dx;
      s.a.y = this.startSegA.y + dy;
      s.b.x = this.startSegB.x + dx;
      s.b.y = this.startSegB.y + dy;
      this.updateHubForSegment(s);
    } else if (this.mode === "moveText" && this.dragTextId) {
      const t = this.app.scene.getTextBoxById(this.dragTextId);
      if (!t) return;
      t.center.x = this.startTextCenter.x + dx;
      t.center.y = this.startTextCenter.y + dy;
    }
  }

  private onUp(_e: MouseEvent) {
    if (this.mode === "idle") return;
    this.mode = "idle";
    this.app.refreshLabelUI();
  }

  /* ===== Hub ===== */

  private showHubForSegment(seg: Segment) {
    const sM = this.app.camera.worldToScreen((seg.a.x + seg.b.x) / 2, (seg.a.y + seg.b.y) / 2);
    const r = this.canvas.getBoundingClientRect();
    const scaleX = r.width / Math.max(1, this.canvas.width);
    const scaleY = r.height / Math.max(1, this.canvas.height);
    this.app.hub.showAt(sM.x * scaleX + 10, sM.y * scaleY + 10);
    this.updateHubForSegment(seg);
    this.app.hub.bindCommit((vals) => this.commitHub(vals));
  }

  private updateHubForSegment(seg: Segment) {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const len = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    try { this.app.hub.updateDisplay(len, angle); } catch {}
  }

  private commitHub(vals: { lengthM: number | null; angleDeg: number | null }) {
    if (!this.dragSegId) return;
    const s = this.app.scene.getSegmentById(this.dragSegId);
    if (!s) return;
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    const curLen = Math.hypot(dx, dy);
    const curAng = Math.atan2(dy, dx);
    const newLen = vals.lengthM != null && vals.lengthM > 0 ? vals.lengthM : curLen;
    const newAngRad = vals.angleDeg != null ? (vals.angleDeg * Math.PI) / 180 : curAng;
    s.b.x = s.a.x + Math.cos(newAngRad) * newLen;
    s.b.y = s.a.y + Math.sin(newAngRad) * newLen;
    this.updateHubForSegment(s);
    this.app.refreshLabelUI();
  }
}

function distancePointToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 <= 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
