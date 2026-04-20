import { Defaults, SelectionType, SnapType } from "./constants";
import { v, Vec2, dist, orthoSnapFromA } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import type { Snap } from "./TopologyEngine";
import { DocumentObject } from "./Scene";
import { documentCenterWorld, documentCornersWorld, scaleDocumentAroundCenter } from "./documentGeometry";

type Phase =
  | "idle"
  | "placing"          // gerade importiertes Dokument folgt der Maus, Klick setzt es ab
  | "scale-pick-1"     // wartet auf 1. Punkt (Start Ist-Strecke)
  | "scale-pick-2"     // wartet auf 2. Punkt (Ende Ist-Strecke; definiert auch Richtung)
  | "scale-pick-3";    // Ist-Strecke fix, wartet auf 3. Punkt entlang derselben Richtung (= Soll-Länge ab P1)

/**
 * DocumentTool: PDF/JPG/PNG-Import & Maßstabs-Skalierung.
 *
 * Workflow Skalierung (3 Punkte):
 *  P1 → P2 (Ist-Strecke; Shift = Ortho, Distanz im Hub eingebbar)
 *  P2 → P3 entlang der Richtung P1→P2 (Soll-Länge ab P1; Distanz im Hub eingebbar)
 *  Skalierungsfaktor = |P1 P3| / |P1 P2|
 */
export class DocumentTool {
  app: CadApp;
  id = "document";

  phase: Phase = "idle";

  /** Pending Dokument (während "placing"), wird beim Klick in die Scene committet. */
  pendingDoc: { src: string; widthM: number; heightM: number; pixelWidth: number; pixelHeight: number; name: string; kind: "image" | "pdf-page"; pageIndex: number; importScaleDenom: number } | null = null;

  /** Aktueller Maßstabs-Workflow-State. */
  scaleTargetDocId: string | null = null;
  scalePoint1: Vec2 | null = null;
  scalePoint2: Vec2 | null = null;
  scalePoint3: Vec2 | null = null;
  scaleSnap: Snap | null = null;

  onPhaseChange?: () => void;

  constructor(app: CadApp) { this.app = app; }

  activate() {
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    if (this.phase === "scale-pick-2" || this.phase === "scale-pick-3") this.app.hub.hide();
    this.phase = "idle";
    this.pendingDoc = null;
    this.scaleTargetDocId = null;
    this.scalePoint1 = null;
    this.scalePoint2 = null;
    this.scalePoint3 = null;
    this.scaleSnap = null;
    this.app.hub.bindCommit(null);
    this.app.hub.angInputEl.readOnly = true;
    this.onPhaseChange?.();
  }

  finish() { this.cancel(); }

  /** Externe API: nach erfolgreichem Datei-Import wird das Dokument zur Maus-Platzierung übergeben. */
  beginPlacement(opts: { src: string; widthM: number; heightM: number; pixelWidth: number; pixelHeight: number; name: string; kind: "image" | "pdf-page"; pageIndex: number; importScaleDenom: number }) {
    this.pendingDoc = opts;
    this.phase = "placing";
    this.app.clearSelection();
    this.onPhaseChange?.();
  }

  /** Externe API: leitet den 3-Punkt-Skaliervorgang für ein bestimmtes Dokument ein. */
  beginScaleTwoPoints(docId: string) {
    const doc = this.app.scene.getDocumentById(docId);
    if (!doc) return;
    if (this.app.activeTool !== this) {
      this.app.setTool("document");
    }
    this.scaleTargetDocId = docId;
    this.scalePoint1 = null;
    this.scalePoint2 = null;
    this.scalePoint3 = null;
    this.scaleSnap = null;
    this.phase = "scale-pick-1";
    this.app.hub.hide();
    this.app.setSelection({ type: "document", documentId: docId } as any);
    this.onPhaseChange?.();
  }

  /** Externe API: skaliere ein Dokument anhand der zuletzt erstellten Maßkette (überspringt P1/P2). */
  beginScaleFromLastDimension(docId: string) {
    const doc = this.app.scene.getDocumentById(docId);
    if (!doc) return;
    const dims = this.app.scene.dimensions;
    if (dims.length === 0) {
      alert("Keine Maßkette vorhanden. Erstelle zuerst eine Maßkette über das Dokument.");
      return;
    }
    if (this.app.activeTool !== this) {
      this.app.setTool("document");
    }
    const lastDim = dims[dims.length - 1];
    this.scaleTargetDocId = docId;
    this.scalePoint1 = v(lastDim.p1.x, lastDim.p1.y);
    this.scalePoint2 = v(lastDim.p2.x, lastDim.p2.y);
    this.scalePoint3 = null;
    this.phase = "scale-pick-3";
    this.app.setSelection({ type: "document", documentId: docId } as any);
    this._showPick3Hub();
    this.onPhaseChange?.();
  }

  isPlacing() { return this.phase === "placing"; }
  isScaling() { return this.phase === "scale-pick-1" || this.phase === "scale-pick-2" || this.phase === "scale-pick-3"; }

  update(input: Input) {
    if (this.phase === "placing") {
      const snap = this.app.topology.findBestSnap(v(input.mouse.sx, input.mouse.sy), v(input.mouse.wx, input.mouse.wy));
      this.scaleSnap = snap;
      if (input.clicked && this.pendingDoc) {
        const target = snap ? snap.world : v(input.mouse.wx, input.mouse.wy);
        const doc = this.app.scene.createDocument({
          name: this.pendingDoc.name,
          kind: this.pendingDoc.kind,
          src: this.pendingDoc.src,
          pageIndex: this.pendingDoc.pageIndex,
          position: v(target.x - this.pendingDoc.widthM / 2, target.y - this.pendingDoc.heightM / 2),
          widthM: this.pendingDoc.widthM,
          heightM: this.pendingDoc.heightM,
          pixelWidth: this.pendingDoc.pixelWidth,
          pixelHeight: this.pendingDoc.pixelHeight,
          labelId: this.app.activeDrawLabelId,
          importScaleDenom: this.pendingDoc.importScaleDenom,
        });
        this.pendingDoc = null;
        this.phase = "idle";
        this.scaleSnap = null;
        this.app.setSelection({ type: SelectionType.DOCUMENT, documentId: doc.id } as any);
        this.app.refreshLabelUI();
        this.onPhaseChange?.();
      }
      return;
    }

    if (this.phase === "scale-pick-1") {
      this.scaleSnap = this.app.topology.findBestSnap(v(input.mouse.sx, input.mouse.sy), v(input.mouse.wx, input.mouse.wy));
      if (input.clicked) {
        const p = this.scaleSnap ? v(this.scaleSnap.world.x, this.scaleSnap.world.y) : v(input.mouse.wx, input.mouse.wy);
        this.scalePoint1 = p;
        this.phase = "scale-pick-2";
        this._showPick2Hub();
        this.onPhaseChange?.();
      }
      return;
    }

    if (this.phase === "scale-pick-2") {
      this.scaleSnap = this.app.topology.findBestSnap(v(input.mouse.sx, input.mouse.sy), v(input.mouse.wx, input.mouse.wy));
      let raw = this.scaleSnap ? v(this.scaleSnap.world.x, this.scaleSnap.world.y) : v(input.mouse.wx, input.mouse.wy);
      if (input.keys.shift && this.scalePoint1) {
        raw = orthoSnapFromA(this.scalePoint1, raw);
      }
      if (this.scalePoint1) {
        const measured = dist(this.scalePoint1, raw);
        const ms = this.app.camera.worldToScreen((this.scalePoint1.x + raw.x) / 2, (this.scalePoint1.y + raw.y) / 2);
        this.app.hub.showAt(ms.x, ms.y);
        if (document.activeElement !== this.app.hub.lenInputEl) {
          this.app.hub.lenInputEl.value = `${measured.toFixed(3)} m`;
        }
      }
      if (input.clicked) {
        this.scalePoint2 = raw;
        this.phase = "scale-pick-3";
        this.app.hub.bindCommit(null);
        this._showPick3Hub();
        this.onPhaseChange?.();
      }
      return;
    }

    if (this.phase === "scale-pick-3") {
      // Richtung fix von P1→P2; P3 wird auf diese Linie projiziert.
      if (!this.scalePoint1 || !this.scalePoint2) return;
      this.scaleSnap = this.app.topology.findBestSnap(v(input.mouse.sx, input.mouse.sy), v(input.mouse.wx, input.mouse.wy));
      const mouseW = this.scaleSnap ? this.scaleSnap.world : v(input.mouse.wx, input.mouse.wy);
      const projected = this._projectOnAxis(this.scalePoint1, this.scalePoint2, mouseW);
      // Live-Anzeige Soll-Länge ab P1
      const sollLen = dist(this.scalePoint1, projected);
      const ms = this.app.camera.worldToScreen((this.scalePoint1.x + projected.x) / 2, (this.scalePoint1.y + projected.y) / 2);
      this.app.hub.showAt(ms.x, ms.y);
      if (document.activeElement !== this.app.hub.lenInputEl) {
        this.app.hub.lenInputEl.value = `${sollLen.toFixed(3)} m`;
      }
      if (input.clicked) {
        this.scalePoint3 = projected;
        this._commitScale();
      }
      return;
    }
  }

  /** Projektion eines Weltpunkts auf die Achse durch a→b (verlängert). */
  private _projectOnAxis(a: Vec2, b: Vec2, p: Vec2): Vec2 {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-12) return v(b.x, b.y);
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    return v(a.x + dx * t, a.y + dy * t);
  }

  /**
   * Hub während scale-pick-2: User kann Distanz für Punkt-2 selbst tippen + Enter
   * → Punkt 2 wird entlang der aktuellen Maus-Richtung in der getippten Distanz gesetzt.
   */
  private _showPick2Hub() {
    if (!this.scalePoint1) return;
    const ms = this.app.camera.worldToScreen(this.scalePoint1.x, this.scalePoint1.y);
    this.app.hub.showAt(ms.x + 20, ms.y + 20);
    this.app.hub.enterEditMode();
    this.app.hub.lenInputEl.value = "0.000 m";
    this.app.hub.angInputEl.value = "Ist-Strecke";
    this.app.hub.angInputEl.readOnly = true;
    this.app.hub.bindCommit((vals) => {
      const d = vals.lengthM;
      if (!d || d <= 0 || !this.scalePoint1) return;
      let dirTo = v(this.app.input.mouse.wx, this.app.input.mouse.wy);
      if (this.app.input.keys.shift) dirTo = orthoSnapFromA(this.scalePoint1, dirTo);
      const dx = dirTo.x - this.scalePoint1.x, dy = dirTo.y - this.scalePoint1.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) return;
      const ux = dx / len, uy = dy / len;
      this.scalePoint2 = v(this.scalePoint1.x + ux * d, this.scalePoint1.y + uy * d);
      this.phase = "scale-pick-3";
      this.app.hub.bindCommit(null);
      this._showPick3Hub();
      this.onPhaseChange?.();
    });
  }

  /**
   * Hub während scale-pick-3: User kann Soll-Länge ab P1 tippen + Enter
   * → P3 wird auf die Achse P1→P2 in der getippten Distanz gesetzt, dann committen.
   */
  private _showPick3Hub() {
    if (!this.scalePoint1 || !this.scalePoint2 || !this.scaleTargetDocId) return;
    const measured = dist(this.scalePoint1, this.scalePoint2);
    const ms = this.app.camera.worldToScreen((this.scalePoint1.x + this.scalePoint2.x) / 2, (this.scalePoint1.y + this.scalePoint2.y) / 2);
    this.app.hub.showAt(ms.x, ms.y);
    this.app.hub.enterEditMode();
    this.app.hub.lenInputEl.value = `${measured.toFixed(3)} m`;
    this.app.hub.angInputEl.value = "Soll-Länge";
    this.app.hub.angInputEl.readOnly = true;
    this.app.hub.bindCommit((vals) => {
      const target = vals.lengthM;
      if (!target || target <= 0 || !this.scalePoint1 || !this.scalePoint2) return;
      const dx = this.scalePoint2.x - this.scalePoint1.x, dy = this.scalePoint2.y - this.scalePoint1.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) return;
      const ux = dx / len, uy = dy / len;
      this.scalePoint3 = v(this.scalePoint1.x + ux * target, this.scalePoint1.y + uy * target);
      this._commitScale();
    });
  }

  private _commitScale() {
    if (!this.scaleTargetDocId || !this.scalePoint1 || !this.scalePoint2 || !this.scalePoint3) return;
    const doc = this.app.scene.getDocumentById(this.scaleTargetDocId);
    if (!doc) return;
    const istLen = dist(this.scalePoint1, this.scalePoint2);
    const sollLen = dist(this.scalePoint1, this.scalePoint3);
    if (istLen < 1e-6 || sollLen < 1e-6) return;
    const factor = sollLen / istLen;
    scaleDocumentAroundCenter(doc, factor);
    const finishedDocId = this.scaleTargetDocId;
    this.app.hub.hide();
    this.app.hub.bindCommit(null);
    this.scaleTargetDocId = null;
    this.scalePoint1 = null;
    this.scalePoint2 = null;
    this.scalePoint3 = null;
    this.phase = "idle";
    this.onPhaseChange?.();
    this.app.setTool("select");
    if (finishedDocId) this.app.setSelection({ type: "document", documentId: finishedDocId } as any);
  }

  private _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    // Pending Dokument als halbtransparentes Rechteck unter dem Cursor zeigen
    if (this.phase === "placing" && this.pendingDoc) {
      const center = this.scaleSnap ? this.scaleSnap.world : v(this.app.input.mouse.wx, this.app.input.mouse.wy);
      const x = center.x - this.pendingDoc.widthM / 2;
      const y = center.y - this.pendingDoc.heightM / 2;
      const tl = cam.worldToScreen(x, y);
      const br = cam.worldToScreen(x + this.pendingDoc.widthM, y + this.pendingDoc.heightM);
      ctx.save();
      ctx.fillStyle = "rgba(77,163,255,0.15)";
      ctx.strokeStyle = "rgba(77,163,255,0.85)";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.font = "12px system-ui";
      ctx.textBaseline = "bottom";
      ctx.fillText(this.pendingDoc.name, tl.x + 6, tl.y - 4);
      ctx.restore();
    }

    // Snap-Indikator
    if ((this.phase === "placing" || this.phase === "scale-pick-1" || this.phase === "scale-pick-2" || this.phase === "scale-pick-3") && this.scaleSnap) {
      const sp = cam.worldToScreen(this.scaleSnap.world.x, this.scaleSnap.world.y);
      ctx.save();
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(77,163,255,0.45)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // P1 Marker
    if (this.scalePoint1 && (this.phase === "scale-pick-2" || this.phase === "scale-pick-3")) {
      const sp = cam.worldToScreen(this.scalePoint1.x, this.scalePoint1.y);
      ctx.save();
      ctx.fillStyle = "rgba(255,140,0,0.95)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // Linie P1 → P2 (Ist-Strecke)
    if (this.scalePoint1 && (this.phase === "scale-pick-2" || this.phase === "scale-pick-3")) {
      let p2: Vec2;
      if (this.phase === "scale-pick-3" && this.scalePoint2) {
        p2 = this.scalePoint2;
      } else {
        p2 = this.scaleSnap ? this.scaleSnap.world : v(this.app.input.mouse.wx, this.app.input.mouse.wy);
        if (this.app.input.keys.shift) p2 = orthoSnapFromA(this.scalePoint1, p2);
      }
      const a = cam.worldToScreen(this.scalePoint1.x, this.scalePoint1.y);
      const b = cam.worldToScreen(p2.x, p2.y);
      ctx.save();
      ctx.strokeStyle = "rgba(255,140,0,0.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const measured = dist(this.scalePoint1, p2);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      ctx.fillStyle = "rgba(255,140,0,0.95)";
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`Ist: ${measured.toFixed(3)} m`, mx, my - 6);
      ctx.restore();
    }

    // P2 Marker
    if (this.scalePoint2 && this.phase === "scale-pick-3") {
      const sp = cam.worldToScreen(this.scalePoint2.x, this.scalePoint2.y);
      ctx.save();
      ctx.fillStyle = "rgba(255,140,0,0.95)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // Achsen-Verlängerung + Soll-Linie P1 → P3 (Cursor projiziert)
    if (this.phase === "scale-pick-3" && this.scalePoint1 && this.scalePoint2) {
      const mouseW = this.scaleSnap ? this.scaleSnap.world : v(this.app.input.mouse.wx, this.app.input.mouse.wy);
      const p3 = this._projectOnAxis(this.scalePoint1, this.scalePoint2, mouseW);
      const a = cam.worldToScreen(this.scalePoint1.x, this.scalePoint1.y);
      const c = cam.worldToScreen(p3.x, p3.y);
      // dünne Achsen-Hilfslinie (durch P1 in Richtung P2, lang)
      const dx = this.scalePoint2.x - this.scalePoint1.x, dy = this.scalePoint2.y - this.scalePoint1.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const farLen = 10000;
      const axisA = cam.worldToScreen(this.scalePoint1.x - ux * farLen, this.scalePoint1.y - uy * farLen);
      const axisB = cam.worldToScreen(this.scalePoint1.x + ux * farLen, this.scalePoint1.y + uy * farLen);
      ctx.save();
      ctx.strokeStyle = "rgba(120,180,255,0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(axisA.x, axisA.y); ctx.lineTo(axisB.x, axisB.y); ctx.stroke();
      ctx.setLineDash([]);
      // Soll-Strecke P1 → P3 (kräftig grün)
      ctx.strokeStyle = "rgba(72,201,124,0.95)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y);
      ctx.stroke();
      // P3-Punkt
      ctx.fillStyle = "rgba(72,201,124,0.95)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Soll-Label
      const sollLen = dist(this.scalePoint1, p3);
      const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
      ctx.fillStyle = "rgba(72,201,124,1)";
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`Soll: ${sollLen.toFixed(3)} m`, mx, my + 16);
      ctx.restore();
    }
  }
}
