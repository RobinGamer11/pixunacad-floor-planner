import { clamp } from "./geometry";

/**
 * Druckpläne: Layout-Blätter mit Papierformat, auf denen Projektionen
 * (Snapshots von Zeichenblättern) platziert werden können.
 *
 * Hinweis: Reines Datenmodell. UI in PlanPanel, Rendering in Renderer (Step 3+).
 */

/** Papierformat in Millimeter (Hochformat: width<=height by convention). */
export interface PaperFormat {
  key: string;       // "a4", "a3", ... oder "free"
  label: string;     // Anzeigetext
  width: number;     // mm
  height: number;    // mm
}

/** Standardformate (Hochformat). Querformat über `landscape`-Flag im Plan. */
export const PaperFormats: PaperFormat[] = [
  { key: "a5", label: "A5", width: 148, height: 210 },
  { key: "a4", label: "A4", width: 210, height: 297 },
  { key: "a3", label: "A3", width: 297, height: 420 },
  { key: "a2", label: "A2", width: 420, height: 594 },
  { key: "a1", label: "A1", width: 594, height: 841 },
  { key: "a0", label: "A0", width: 841, height: 1189 },
];

export const PlanDefaults = {
  defaultFormatKey: "a4",
  defaultLandscape: false,
  defaultFreeWidth: 297,
  defaultFreeHeight: 210,
};

/**
 * Eine Projektion = Snapshot der Zeichnung eines Blattes auf einem Plan.
 * Snapshot-Geometrie wird hier NICHT gehalten — wird in Step 4 ergänzt.
 */
export interface Projection {
  id: string;
  /** Quelle: Zeichnungsblatt-ID (zum Zeitpunkt des Drops). */
  sourceSheetId: string;
  /** Snapshot der Sheet-Geometrie als JSON (eingefroren beim Drop). */
  sceneSnapshot: unknown | null;
  /** Maßstab beim Drop (Welt-Einheiten pro Plan-Einheit). */
  scale: number;
  /** Position auf dem Plan in mm (Mittelpunkt). */
  x: number;
  y: number;
  /** Rotation in Radiant. */
  rotation: number;
  /** Clip-Rechteck im LOKALEN Plan-mm-Koordinatensystem der Projektion (relativ zum Mittelpunkt). */
  clip: { left: number; right: number; top: number; bottom: number };
}

export interface Plan {
  id: string;
  name: string;
  /** Format-Key ("a4", "a3", ..., "free"). */
  formatKey: string;
  /** Querformat-Flag (drehen Width/Height). */
  landscape: boolean;
  /** Bei "free" verwendeter Wert in mm. */
  freeWidth: number;
  freeHeight: number;
  /** Projektionen auf diesem Plan. */
  projections: Projection[];
  /** Auswahl-Status für PDF-Sammelexport. */
  selected: boolean;
}

/** Liefert effektive Papiergröße in mm (berücksichtigt landscape und free). */
export function getPlanPaperSize(plan: Plan): { width: number; height: number } {
  let w: number;
  let h: number;
  if (plan.formatKey === "free") {
    w = plan.freeWidth;
    h = plan.freeHeight;
  } else {
    const f = PaperFormats.find(p => p.key === plan.formatKey);
    if (f) {
      w = f.width;
      h = f.height;
    } else {
      w = 210;
      h = 297;
    }
  }
  if (plan.landscape) {
    return { width: Math.max(w, h), height: Math.min(w, h) };
  }
  return { width: Math.min(w, h), height: Math.max(w, h) };
}

/** Verwaltet die Liste aller Druckpläne (Reihenfolge wie SheetManager). */
export class PlanManager {
  private plans: Plan[] = [];
  private _counter = 1;

  list(): Plan[] {
    return [...this.plans];
  }

  getById(id: string): Plan | null {
    return this.plans.find(p => p.id === id) || null;
  }

  getIndex(id: string): number {
    return this.plans.findIndex(p => p.id === id);
  }

  createPlan(opts: {
    formatKey?: string;
    landscape?: boolean;
    freeWidth?: number;
    freeHeight?: number;
  } = {}): Plan {
    const id = `plan-${Date.now()}-${this._counter++}`;
    const name = `Plan ${this._counter - 1}`;
    const plan: Plan = {
      id,
      name,
      formatKey: opts.formatKey || PlanDefaults.defaultFormatKey,
      landscape: !!opts.landscape,
      freeWidth: typeof opts.freeWidth === "number" && opts.freeWidth > 0
        ? opts.freeWidth
        : PlanDefaults.defaultFreeWidth,
      freeHeight: typeof opts.freeHeight === "number" && opts.freeHeight > 0
        ? opts.freeHeight
        : PlanDefaults.defaultFreeHeight,
      projections: [],
      selected: false,
    };
    this.plans.unshift(plan);
    return plan;
  }

  renamePlan(id: string, newName: string): Plan | null {
    const p = this.getById(id);
    if (!p) return null;
    const clean = (newName || "").trim();
    if (!clean) return null;
    p.name = clean;
    return p;
  }

  setFormat(id: string, opts: {
    formatKey?: string;
    landscape?: boolean;
    freeWidth?: number;
    freeHeight?: number;
  }): Plan | null {
    const p = this.getById(id);
    if (!p) return null;
    if (typeof opts.formatKey === "string") p.formatKey = opts.formatKey;
    if (typeof opts.landscape === "boolean") p.landscape = opts.landscape;
    if (typeof opts.freeWidth === "number" && opts.freeWidth > 0) p.freeWidth = opts.freeWidth;
    if (typeof opts.freeHeight === "number" && opts.freeHeight > 0) p.freeHeight = opts.freeHeight;
    return p;
  }

  deletePlan(id: string): boolean {
    const before = this.plans.length;
    this.plans = this.plans.filter(p => p.id !== id);
    return this.plans.length !== before;
  }

  moveToIndex(id: string, targetIndex: number): boolean {
    const from = this.getIndex(id);
    if (from < 0) return false;
    const clamped = clamp(targetIndex, 0, this.plans.length - 1);
    if (from === clamped) return false;
    const [item] = this.plans.splice(from, 1);
    this.plans.splice(clamped, 0, item);
    return true;
  }

  setSelected(id: string, selected: boolean): boolean {
    const p = this.getById(id);
    if (!p) return false;
    p.selected = !!selected;
    return true;
  }

  getSelected(): Plan[] {
    return this.plans.filter(p => p.selected);
  }

  /** Fügt eine Projektion an. Daten werden 1:1 übernommen (Caller liefert sceneSnapshot). */
  addProjection(planId: string, projection: Projection): Projection | null {
    const p = this.getById(planId);
    if (!p) return null;
    p.projections.push(projection);
    return projection;
  }

  removeProjection(planId: string, projectionId: string): boolean {
    const p = this.getById(planId);
    if (!p) return false;
    const before = p.projections.length;
    p.projections = p.projections.filter(pr => pr.id !== projectionId);
    return p.projections.length !== before;
  }

  updateProjection(planId: string, projectionId: string, patch: Partial<Projection>): Projection | null {
    const p = this.getById(planId);
    if (!p) return null;
    const pr = p.projections.find(x => x.id === projectionId);
    if (!pr) return null;
    Object.assign(pr, patch);
    return pr;
  }

  /** Serialisierung für History/Save. */
  toJSON(): Plan[] {
    return this.plans.map(p => ({
      id: p.id,
      name: p.name,
      formatKey: p.formatKey,
      landscape: !!p.landscape,
      freeWidth: p.freeWidth,
      freeHeight: p.freeHeight,
      selected: !!p.selected,
      projections: p.projections.map(pr => ({
        id: pr.id,
        sourceSheetId: pr.sourceSheetId,
        sceneSnapshot: pr.sceneSnapshot,
        scale: pr.scale,
        x: pr.x,
        y: pr.y,
        rotation: pr.rotation,
        clip: { ...pr.clip },
      })),
    }));
  }

  restore(data: Plan[]) {
    if (!Array.isArray(data)) {
      this.plans = [];
      return;
    }
    this.plans = data.map(p => ({
      id: String(p.id),
      name: String(p.name || "Plan"),
      formatKey: typeof p.formatKey === "string" ? p.formatKey : PlanDefaults.defaultFormatKey,
      landscape: !!p.landscape,
      freeWidth: typeof p.freeWidth === "number" && p.freeWidth > 0 ? p.freeWidth : PlanDefaults.defaultFreeWidth,
      freeHeight: typeof p.freeHeight === "number" && p.freeHeight > 0 ? p.freeHeight : PlanDefaults.defaultFreeHeight,
      selected: !!p.selected,
      projections: Array.isArray(p.projections) ? p.projections.map(pr => ({
        id: String(pr.id),
        sourceSheetId: String(pr.sourceSheetId),
        sceneSnapshot: pr.sceneSnapshot ?? null,
        scale: typeof pr.scale === "number" && pr.scale > 0 ? pr.scale : 100,
        x: typeof pr.x === "number" ? pr.x : 0,
        y: typeof pr.y === "number" ? pr.y : 0,
        rotation: typeof pr.rotation === "number" ? pr.rotation : 0,
        clip: pr.clip && typeof pr.clip === "object" ? {
          left: Number(pr.clip.left) || 0,
          right: Number(pr.clip.right) || 0,
          top: Number(pr.clip.top) || 0,
          bottom: Number(pr.clip.bottom) || 0,
        } : { left: 0, right: 0, top: 0, bottom: 0 },
      })) : [],
    }));
  }
}
