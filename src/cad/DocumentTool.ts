import { Defaults, SelectionType, SnapType } from "./constants";
import { v, Vec2, dist } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import type { Snap } from "./TopologyEngine";
import { DocumentObject } from "./Scene";
import { documentCenterWorld, documentCornersWorld, scaleDocumentAroundCenter } from "./documentGeometry";

type Phase =
  | "idle"
  | "placing"          // gerade importiertes Dokument folgt der Maus, Klick setzt es ab
  | "scale-pick-1"     // Dokument selektiert, wartet auf 1. Skalier-Punkt
  | "scale-pick-2"     // 1. Punkt gesetzt, wartet auf 2. Punkt
  | "scale-await-input"; // beide Punkte gesetzt, Hub eingeblendet

/**
 * DocumentTool: PDF/JPG/PNG-Import & Maßstabs-Skalierung.
 *
 * Workflows:
 *  - Datei importieren -> Phase "placing", Klick setzt das Dokument ab
 *  - Skalier-Modus 'two-points': Klick auf Doc -> 2 Snap-Punkte -> Soll-Länge im Hub -> Enter
 *  - Skalier-Modus 'measure-line': nutzt zuletzt erstellte Maßkette als Referenz (per externem Aufruf)
 */
export class DocumentTool {
  app: CadApp;
  id = "document";

  phase: Phase = "idle";

  /** Pending Dokument (während "placing"), wird beim Klick in die Scene committet. */
  pendingDoc: { src: string; widthM: number; heightM: number; pixelWidth: number; pixelHeight: number; name: string; kind: "image" | "pdf-page"; pageIndex: number } | null = null;

  /** Aktueller Maßstabs-Workflow-State. */
  scaleTargetDocId: string | null = null;
  scalePoint1: Vec2 | null = null;
  scalePoint2: Vec2 | null = null;
  scaleSnap: Snap | null = null;

  onPhaseChange?: () => void;

  constructor(app: CadApp) { this.app = app; }

  activate() {
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    if (this.phase === "scale-await-input") this.app.hub.hide();
    this.phase = "idle";
    this.pendingDoc = null;
    this.scaleTargetDocId = null;
    this.scalePoint1 = null;
    this.scalePoint2 = null;
    this.scaleSnap = null;
    this.app.hub.bindCommit(null);
    this.onPhaseChange?.();
  }

  finish() { this.cancel(); }

  /** Externe API: nach erfolgreichem Datei-Import wird das Dokument zur Maus-Platzierung übergeben. */
  beginPlacement(opts: { src: string; widthM: number; heightM: number; pixelWidth: number; pixelHeight: number; name: string; kind: "image" | "pdf-page"; pageIndex: number }) {
    this.pendingDoc = opts;
    this.phase = "placing";
    this.app.clearSelection();
    this.onPhaseChange?.();
  }

  /** Externe API: leitet den 2-Punkt-Skaliervorgang für ein bestimmtes Dokument ein. */
  beginScaleTwoPoints(docId: string) {
    const doc = this.app.scene.getDocumentById(docId);
    if (!doc) return;
    this.scaleTargetDocId = docId;
    this.scalePoint1 = null;
    this.scalePoint2 = null;
    this.scaleSnap = null;
    this.phase = "scale-pick-1";
    this.app.hub.hide();
    this.onPhaseChange?.();
  }

  /** Externe API: skaliere ein Dokument anhand der zuletzt erstellten Maßkette. */
  beginScaleFromLastDimension(docId: string) {
    const doc = this.app.scene.getDocumentById(docId);
    if (!doc) return;
    const dims = this.app.scene.dimensions;
    if (dims.length === 0) {
      alert("Keine Maßkette vorhanden. Erstelle zuerst eine Maßkette über das Dokument.");
      return;
    }
    const lastDim = dims[dims.length - 1];
    this.scaleTargetDocId = docId;
    this.scalePoint1 = v(lastDim.p1.x, lastDim.p1.y);
    this.scalePoint2 = v(lastDim.p2.x, lastDim.p2.y);
    this.phase = "scale-await-input";
    this._showScaleHub();
    this.onPhaseChange?.();
  }

  isPlacing() { return this.phase === "placing"; }
  isScaling() { return this.phase === "scale-pick-1" || this.phase === "scale-pick-2" || this.phase === "scale-await-input"; }

  update(input: Input) {
    if (this.phase === "placing") {
      // Snap auf vorhandene Geometrie für saubere Platzierung
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

    if (this.phase === "scale-pick-1" || this.phase === "scale-pick-2") {
      // Snap auf alle Punkte (inkl. Doc-Ecken/Mid-Edge); freie Punkte sind erlaubt
      this.scaleSnap = this.app.topology.findBestSnap(v(input.mouse.sx, input.mouse.sy), v(input.mouse.wx, input.mouse.wy));
      if (input.clicked) {
        const p = this.scaleSnap ? v(this.scaleSnap.world.x, this.scaleSnap.world.y) : v(input.mouse.wx, input.mouse.wy);
        if (this.phase === "scale-pick-1") {
          this.scalePoint1 = p;
          this.phase = "scale-pick-2";
          this.onPhaseChange?.();
        } else {
          this.scalePoint2 = p;
          this.phase = "scale-await-input";
          this._showScaleHub();
          this.onPhaseChange?.();
        }
      }
      return;
    }

    if (this.phase === "scale-await-input") {
      // Hub übernimmt Eingabe — keine Klick-Logik nötig (Klick außerhalb beendet via Esc)
      return;
    }
  }

  private _showScaleHub() {
    if (!this.scalePoint1 || !this.scalePoint2 || !this.scaleTargetDocId) return;
    const measured = dist(this.scalePoint1, this.scalePoint2);
    // Hub mittig zwischen den Punkten anzeigen
    const mid = v((this.scalePoint1.x + this.scalePoint2.x) / 2, (this.scalePoint1.y + this.scalePoint2.y) / 2);
    const ms = this.app.camera.worldToScreen(mid.x, mid.y);
    this.app.hub.showAt(ms.x, ms.y);
    this.app.hub.enterEditMode();
    this.app.hub.lenInputEl.value = `${measured.toFixed(3)} m`;
    this.app.hub.angInputEl.value = "Soll-Länge eingeben";
    this.app.hub.angInputEl.readOnly = true;
    // Kurz warten und dann fokussieren+selektieren
    requestAnimationFrame(() => {
      this.app.hub.lenInputEl.focus();
      this.app.hub.lenInputEl.select();
    });
    this.app.hub.bindCommit((vals) => {
      const target = vals.lengthM;
      if (!target || target <= 0) return;
      const doc = this.scaleTargetDocId ? this.app.scene.getDocumentById(this.scaleTargetDocId) : null;
      if (!doc || !this.scalePoint1 || !this.scalePoint2) return;
      const measured = dist(this.scalePoint1, this.scalePoint2);
      if (measured < 1e-6) return;
      const factor = target / measured;
      scaleDocumentAroundCenter(doc, factor);
      this.app.hub.hide();
      this.app.hub.bindCommit(null);
      this.scaleTargetDocId = null;
      this.scalePoint1 = null;
      this.scalePoint2 = null;
      this.phase = "idle";
      this.onPhaseChange?.();
    });
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
    if ((this.phase === "placing" || this.phase === "scale-pick-1" || this.phase === "scale-pick-2") && this.scaleSnap) {
      const sp = cam.worldToScreen(this.scaleSnap.world.x, this.scaleSnap.world.y);
      ctx.save();
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(77,163,255,0.45)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Skalier-Punkt 1
    if ((this.phase === "scale-pick-2" || this.phase === "scale-await-input") && this.scalePoint1) {
      const sp = cam.worldToScreen(this.scalePoint1.x, this.scalePoint1.y);
      ctx.save();
      ctx.fillStyle = "rgba(255,140,0,0.95)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // Linie zwischen Punkt 1 und Cursor (oder Punkt 2)
    if (this.scalePoint1 && (this.phase === "scale-pick-2" || this.phase === "scale-await-input")) {
      const p2 = this.phase === "scale-await-input" && this.scalePoint2
        ? this.scalePoint2
        : (this.scaleSnap ? this.scaleSnap.world : v(this.app.input.mouse.wx, this.app.input.mouse.wy));
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
      // Live-Längenanzeige
      const measured = dist(this.scalePoint1, p2);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      ctx.fillStyle = "rgba(255,140,0,0.95)";
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${measured.toFixed(3)} m`, mx, my - 6);
      ctx.restore();
    }

    // Punkt 2 markiert
    if (this.phase === "scale-await-input" && this.scalePoint2) {
      const sp = cam.worldToScreen(this.scalePoint2.x, this.scalePoint2.y);
      ctx.save();
      ctx.fillStyle = "rgba(255,140,0,0.95)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
}
