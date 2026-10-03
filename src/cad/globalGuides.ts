import { v, projectPointToInfiniteLine, lineLineIntersectionInfinite } from "./geometry";
import type { Vec2 } from "./geometry";
import { Defaults, SnapType } from "./constants";
import type { Camera } from "./Camera";

type Anchor = { key: string; point: Vec2 };
/** Parallele Hilfslinie (Rechtsklick auf eine Kante): unendliche Gerade. */
type GuideLine = { key: string; point: Vec2; dir: Vec2 };

/**
 * Globale Hilfslinien (Rechtsklick auf einen Fangpunkt).
 * Gelten werkzeugübergreifend: jeder Anker erzeugt eine horizontale und
 * eine vertikale Hilfslinie; Achsen und Schnittpunkte snappen.
 */
export class GlobalGuides {
  anchors: Anchor[] = [];
  lines: GuideLine[] = [];

  clear() { this.anchors = []; this.lines = []; }

  /** Setzt/entfernt eine Hilfslinie durch `p` parallel zu `dir`. */
  toggleLine(p: Vec2, dir: Vec2): void {
    const l = Math.hypot(dir.x, dir.y) || 1;
    let d = { x: dir.x / l, y: dir.y / l };
    if (d.x < -1e-9 || (Math.abs(d.x) <= 1e-9 && d.y < 0)) d = { x: -d.x, y: -d.y };
    // Schlüssel: Richtung + Abstand der Geraden vom Ursprung (eindeutig je Gerade).
    const off = p.x * -d.y + p.y * d.x;
    const key = `${d.x.toFixed(5)}_${d.y.toFixed(5)}_${off.toFixed(5)}`;
    const idx = this.lines.findIndex((g) => g.key === key);
    if (idx >= 0) this.lines.splice(idx, 1);
    else this.lines.push({ key, point: v(p.x, p.y), dir: v(d.x, d.y) });
  }

  /** Setzt/entfernt einen Anker an einem Weltpunkt. */
  toggleAt(p: Vec2): void {
    const key = `${p.x.toFixed(6)}_${p.y.toFixed(6)}`;
    const idx = this.anchors.findIndex((a) => a.key === key);
    if (idx >= 0) this.anchors.splice(idx, 1);
    else this.anchors.push({ key, point: v(p.x, p.y) });
  }

  private _defs(): { point: Vec2; dir: Vec2 }[] {
    const defs: { point: Vec2; dir: Vec2 }[] = [];
    for (const a of this.anchors) {
      defs.push({ point: a.point, dir: v(1, 0) });
      defs.push({ point: a.point, dir: v(0, 1) });
    }
    for (const l of this.lines) defs.push({ point: l.point, dir: l.dir });
    return defs;
  }

  /** Bester Snap auf Hilfslinien-Schnittpunkte / Achsen (oder null). */
  findSnap(mouseS: Vec2, mouseW: Vec2, cam: Camera): any | null {
    if (!this.anchors.length && !this.lines.length) return null;
    const defs = this._defs();
    let best: any = null;
    let bestPx = Infinity;

    // Anker selbst + Schnittpunkte zuerst (höhere Priorität)
    const pts: Vec2[] = this.anchors.map((a) => a.point);
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
        pointIndex: null, t: null, px,
      };
    }
    return best;
  }

  /** Zeichnet Hilfslinien + Anker (Screen-Space). */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, vw: number, vh: number): void {
    if (!this.anchors.length && !this.lines.length) return;
    ctx.save();
    ctx.strokeStyle = "rgba(77,163,255,0.38)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 6]);
    for (const a of this.anchors) {
      const s = cam.worldToScreen(a.point.x, a.point.y);
      ctx.beginPath();
      ctx.moveTo(0, s.y); ctx.lineTo(vw, s.y);
      ctx.moveTo(s.x, 0); ctx.lineTo(s.x, vh);
      ctx.stroke();
    }
    const far = 1e6;
    for (const l of this.lines) {
      const a = cam.worldToScreen(l.point.x - l.dir.x * far, l.point.y - l.dir.y * far);
      const b = cam.worldToScreen(l.point.x + l.dir.x * far, l.point.y + l.dir.y * far);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(77,163,255,0.95)";
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 1.5;
    for (const a of this.anchors) {
      const s = cam.worldToScreen(a.point.x, a.point.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
}
