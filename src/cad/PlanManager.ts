import { clamp } from "./geometry";
import { normalizeScaleDen } from "@/lib/scale";
import type { PlanFolder } from "./planTree";
import { normalizeHolePunchSide, normalizeHolePattern, type HolePunchSide, type HolePattern } from "./pageGuides";

/**
 * Druckpläne: Layout-Blätter mit Papierformat, auf denen Projektionen
 * (Snapshots von Zeichenblättern) platziert werden können.
 *
 * Hinweis: Reines Datenmodell. UI im Exportbereich (ExportSidebar), Rendering im Renderer.
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
  /** Kanonischer Ausgabemaßstab dieser Projektion (Nenner: 100 ⇒ 1:100). */
  scaleDen: number;
  /** @deprecated Altfeld, wird nur noch gespiegelt geschrieben/gelesen. */
  scale?: number;
  /** Position auf dem Plan in mm (Mittelpunkt). */
  x: number;
  y: number;
  /** Rotation in Radiant. */
  rotation: number;
  /** Clip-Rechteck im LOKALEN Plan-mm-Koordinatensystem der Projektion (relativ zum Mittelpunkt). */
  clip: { left: number; right: number; top: number; bottom: number };
  /** "linked" = liest live aus dem CAD-Blatt (Standard), "frozen" = sceneSnapshot. */
  mode?: "linked" | "frozen";
}

export type SpreadLayoutMode = "grid" | "free";
export interface SpreadLayout { layoutMode: SpreadLayoutMode }

/** Rechteck einer Seite innerhalb ihres Verbunds (mm, oben links). */
export interface SpreadRect { id: string; x: number; y: number; width: number; height: number }

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
  /** Seitenrand in mm (Hilfslinie, nicht gedruckt). */
  marginsMm: number;
  /** Lochungsmuster (Hilfsanzeige, nie in der PDF). */
  holePattern: HolePattern;
  /** Seite der Lochung (Standard links). */
  holePunchSide: HolePunchSide;
  /** Seitenverbund-ID (gleiche ID = zusammengehörige Seiten). */
  spreadId: string | null;
  /** Position (oben links, mm) innerhalb des Verbunds bei freier Anordnung; null = automatisch. */
  spreadOffset: { xMm: number; yMm: number } | null;
  /** Ordner im Exportbaum (null = Wurzel). */
  parentFolderId: string | null;
  /** Reihenfolge innerhalb des Elternordners. */
  order: number;
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

  /** Nächster freier Standardname „Seite N“ (aus den vorhandenen Seiten bestimmt, stabil nach Laden/Cloud). */
  nextDefaultName(): string {
    let max = 0;
    for (const p of this.plans) {
      const m = /^Seite\s+(\d+)$/.exec((p.name || "").trim());
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `Seite ${max + 1}`;
  }

  getIndex(id: string): number {
    return this.plans.findIndex(p => p.id === id);
  }

  createPlan(opts: {
    formatKey?: string;
    landscape?: boolean;
    freeWidth?: number;
    freeHeight?: number;
    name?: string;
    parentFolderId?: string | null;
  } = {}): Plan {
    const id = `plan-${Date.now()}-${this._counter++}`;
    const name = (opts.name || "").trim() || this.nextDefaultName();
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
      marginsMm: 10,
      holePattern: "none",
      holePunchSide: "left",
      spreadId: null,
      spreadOffset: null,
      parentFolderId: opts.parentFolderId ?? null,
      order: this._nextOrder(opts.parentFolderId ?? null),
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

  // ---------- Exportbaum (Ordner) ----------
  private folders: PlanFolder[] = [];

  listFolders(): PlanFolder[] { return [...this.folders]; }
  getFolder(id: string): PlanFolder | null { return this.folders.find(f => f.id === id) || null; }

  private _nextOrder(parentId: string | null): number {
    let max = -1;
    for (const p of this.plans) if ((p.parentFolderId ?? null) === parentId) max = Math.max(max, p.order ?? 0);
    for (const f of this.folders) if (f.parentId === parentId) max = Math.max(max, f.order);
    return max + 1;
  }

  createFolder(name: string, parentId: string | null = null): PlanFolder {
    const f: PlanFolder = {
      id: `pfolder-${Date.now()}-${this._counter++}`,
      name: (name || "").trim() || "Ordner",
      parentId,
      order: this._nextOrder(parentId),
    };
    this.folders.push(f);
    return f;
  }

  renameFolder(id: string, name: string): boolean {
    const f = this.getFolder(id); const clean = (name || "").trim();
    if (!f || !clean) return false;
    f.name = clean; return true;
  }

  /** Löscht einen Ordner; Inhalt rutscht in den Elternordner (nie stilles Löschen von Seiten). */
  deleteFolder(id: string): boolean {
    const f = this.getFolder(id); if (!f) return false;
    for (const p of this.plans) if (p.parentFolderId === id) { p.parentFolderId = f.parentId; p.order = this._nextOrder(f.parentId); }
    for (const c of this.folders) if (c.parentId === id) { c.parentId = f.parentId; c.order = this._nextOrder(f.parentId); }
    this.folders = this.folders.filter(x => x.id !== id);
    return true;
  }

  private _isDescendant(folderId: string, ancestorId: string): boolean {
    let cur = this.getFolder(folderId);
    const guard = new Set<string>();
    while (cur && cur.parentId && !guard.has(cur.id)) {
      if (cur.parentId === ancestorId) return true;
      guard.add(cur.id);
      cur = this.getFolder(cur.parentId);
    }
    return false;
  }

  /** Geschwister (Seiten+Ordner) eines Elternordners in Reihenfolge. */
  private _siblings(parentId: string | null): { kind: "page" | "folder"; id: string; order: number }[] {
    const out = [
      ...this.plans.filter(p => (p.parentFolderId ?? null) === parentId).map(p => ({ kind: "page" as const, id: p.id, order: p.order ?? 0 })),
      ...this.folders.filter(f => f.parentId === parentId).map(f => ({ kind: "folder" as const, id: f.id, order: f.order })),
    ];
    return out.sort((a, b) => a.order - b.order);
  }

  private _reinsert(kind: "page" | "folder", id: string, parentId: string | null, index: number) {
    const sibs = this._siblings(parentId).filter(s => !(s.kind === kind && s.id === id));
    const at = clamp(Math.round(index), 0, sibs.length);
    sibs.splice(at, 0, { kind, id, order: 0 });
    sibs.forEach((s, i) => {
      if (s.kind === "page") { const p = this.getById(s.id); if (p) { p.parentFolderId = parentId; p.order = i; } }
      else { const f = this.getFolder(s.id); if (f) { f.parentId = parentId; f.order = i; } }
    });
  }

  movePage(pageId: string, parentId: string | null, index: number): boolean {
    if (!this.getById(pageId)) return false;
    if (parentId && !this.getFolder(parentId)) return false;
    this._reinsert("page", pageId, parentId, index);
    return true;
  }

  moveFolder(folderId: string, parentId: string | null, index: number): boolean {
    if (!this.getFolder(folderId)) return false;
    if (parentId && (parentId === folderId || this._isDescendant(parentId, folderId))) return false;
    this._reinsert("folder", folderId, parentId, index);
    return true;
  }

  setPageSettings(id: string, patch: Partial<Pick<Plan, "marginsMm" | "holePattern" | "holePunchSide">>): Plan | null {
    const p = this.getById(id); if (!p) return null;
    if (typeof patch.marginsMm === "number" && patch.marginsMm >= 0) p.marginsMm = patch.marginsMm;
    if (patch.holePattern !== undefined) p.holePattern = normalizeHolePattern(patch.holePattern);
    if (patch.holePunchSide !== undefined) p.holePunchSide = normalizeHolePunchSide(patch.holePunchSide);
    return p;
  }

  // ---------- Seitenverbund ----------
  /** Verbund-Layout je spreadId (einmal pro Verbund, nicht je Seite). */
  private spreadLayouts = new Map<string, SpreadLayout>();

  /** Alle Seiten in sichtbarer Baumreihenfolge (Tiefensuche nach `order`). */
  flatOrder(): Plan[] {
    const out: Plan[] = [];
    const walk = (parentId: string | null) => {
      for (const s of this._siblings(parentId)) {
        if (s.kind === "page") { const p = this.getById(s.id); if (p) out.push(p); }
        else walk(s.id);
      }
    };
    walk(null);
    // Seiten mit ungültigem Elternordner nicht verlieren.
    for (const p of this.plans) if (!out.includes(p)) out.push(p);
    return out;
  }

  spreadMembers(spreadId: string | null): Plan[] {
    if (!spreadId) return [];
    return this.flatOrder().filter(p => p.spreadId === spreadId);
  }

  getSpreadLayoutMode(spreadId: string | null): SpreadLayoutMode {
    return (spreadId && this.spreadLayouts.get(spreadId)?.layoutMode) || "grid";
  }

  setSpreadLayoutMode(spreadId: string, mode: SpreadLayoutMode): boolean {
    if (this.spreadMembers(spreadId).length < 2) return false;
    this.spreadLayouts.set(spreadId, { layoutMode: mode === "free" ? "free" : "grid" });
    return true;
  }

  /** Verbindet zwei Seiten (oder hängt eine Seite an einen bestehenden Verbund an). */
  linkSpread(aId: string, bId: string): string | null {
    const a = this.getById(aId), b = this.getById(bId);
    if (!a || !b || a === b) return null;
    if (a.spreadId && b.spreadId && a.spreadId !== b.spreadId) return null;
    const sid = a.spreadId || b.spreadId || `spread-${Date.now()}-${this._counter++}`;
    a.spreadId = sid; b.spreadId = sid;
    if (!this.spreadLayouts.has(sid)) this.spreadLayouts.set(sid, { layoutMode: "grid" });
    return sid;
  }

  /** Löst eine Seite aus ihrem Verbund; ein Rest-Verbund mit nur einer Seite wird aufgelöst. */
  unlinkFromSpread(id: string): boolean {
    const p = this.getById(id); if (!p || !p.spreadId) return false;
    const sid = p.spreadId;
    p.spreadId = null; p.spreadOffset = null;
    this._cleanupSpread(sid);
    return true;
  }

  /** Setzt die Anordnung auf „nebeneinander" zurück (Versätze verworfen). */
  resetSpreadLayout(spreadId: string): boolean {
    const members = this.spreadMembers(spreadId);
    if (members.length < 2) return false;
    for (const m of members) m.spreadOffset = null;
    this.spreadLayouts.set(spreadId, { layoutMode: "grid" });
    return true;
  }

  setSpreadOffset(id: string, xMm: number, yMm: number): boolean {
    const p = this.getById(id); if (!p || !p.spreadId) return false;
    if (!Number.isFinite(xMm) || !Number.isFinite(yMm)) return false;
    // Aktuelle (normierte) Anordnung aller Mitglieder fixieren – die übergebene
    // Position bezieht sich auf genau diese normierten Koordinaten, sonst springen Seiten.
    for (const r of this.spreadRects(p.spreadId)) {
      const m = this.getById(r.id);
      if (m) m.spreadOffset = { xMm: r.x, yMm: r.y };
    }
    p.spreadOffset = { xMm, yMm };
    return true;
  }

  /** Rechtecke aller Verbundseiten; normiert, sodass die Box bei (0,0) beginnt. */
  spreadRects(spreadId: string | null): SpreadRect[] {
    const members = this.spreadMembers(spreadId);
    if (members.length === 0) return [];
    const free = this.getSpreadLayoutMode(spreadId) === "free";
    let cx = 0;
    const rects = members.map(m => {
      const s = getPlanPaperSize(m);
      const grid = { x: cx, y: 0 };
      cx += s.width;
      const pos = free && m.spreadOffset ? { x: m.spreadOffset.xMm, y: m.spreadOffset.yMm } : grid;
      return { id: m.id, x: pos.x, y: pos.y, width: s.width, height: s.height };
    });
    const minX = Math.min(...rects.map(r => r.x));
    const minY = Math.min(...rects.map(r => r.y));
    return rects.map(r => ({ ...r, x: r.x - minX, y: r.y - minY }));
  }

  private _cleanupSpread(spreadId: string) {
    const rest = this.plans.filter(p => p.spreadId === spreadId);
    if (rest.length < 2) {
      for (const r of rest) { r.spreadId = null; r.spreadOffset = null; }
      this.spreadLayouts.delete(spreadId);
    }
  }

  spreadLayoutsToJSON(): Record<string, SpreadLayout> {
    const out: Record<string, SpreadLayout> = {};
    const used = new Set(this.plans.map(p => p.spreadId).filter(Boolean) as string[]);
    for (const [id, l] of this.spreadLayouts) if (used.has(id)) out[id] = { layoutMode: l.layoutMode };
    return out;
  }

  restoreSpreadLayouts(data: unknown) {
    this.spreadLayouts.clear();
    if (!data || typeof data !== "object") return;
    for (const [id, l] of Object.entries(data as Record<string, any>)) {
      if (!id) continue;
      this.spreadLayouts.set(id, { layoutMode: l?.layoutMode === "free" ? "free" : "grid" });
    }
  }

  foldersToJSON(): PlanFolder[] {
    return this.folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId, order: f.order }));
  }

  /** Löscht eine Seite. Die letzte verbleibende Seite ist nie löschbar. */
  canDeletePlan(id: string): boolean {
    return !!this.getById(id) && this.plans.length > 1;
  }

  deletePlan(id: string): boolean {
    if (!this.canDeletePlan(id)) return false;
    const sid = this.getById(id)?.spreadId ?? null;
    this.plans = this.plans.filter(p => p.id !== id);
    if (sid) this._cleanupSpread(sid);
    return true;
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
      marginsMm: p.marginsMm,
      holePattern: normalizeHolePattern(p.holePattern),
      holePunchSide: normalizeHolePunchSide(p.holePunchSide),
      spreadId: p.spreadId ?? null,
      spreadOffset: p.spreadOffset ? { xMm: p.spreadOffset.xMm, yMm: p.spreadOffset.yMm } : null,
      parentFolderId: p.parentFolderId ?? null,
      order: p.order ?? 0,
      projections: p.projections.map(pr => ({
        id: pr.id,
        sourceSheetId: pr.sourceSheetId,
        sceneSnapshot: pr.sceneSnapshot,
        scaleDen: pr.scaleDen,
        scale: pr.scaleDen,
        x: pr.x,
        y: pr.y,
        rotation: pr.rotation,
        clip: { ...pr.clip },
        mode: pr.mode === "linked" ? "linked" : "frozen",
      })),
    }));
  }

  restore(data: Plan[], folders?: PlanFolder[] | null) {
    this.folders = Array.isArray(folders) ? folders.map((f, i) => ({
      id: String(f.id),
      name: String(f.name || "Ordner"),
      parentId: typeof f.parentId === "string" ? f.parentId : null,
      order: typeof f.order === "number" ? f.order : i,
    })) : [];
    if (!Array.isArray(data)) {
      this.plans = [];
      return;
    }
    const folderIds = new Set(this.folders.map(f => f.id));
    this.plans = data.map((p, idx) => ({
      id: String(p.id),
      name: String(p.name || "Plan"),
      formatKey: typeof p.formatKey === "string" ? p.formatKey : PlanDefaults.defaultFormatKey,
      landscape: !!p.landscape,
      freeWidth: typeof p.freeWidth === "number" && p.freeWidth > 0 ? p.freeWidth : PlanDefaults.defaultFreeWidth,
      freeHeight: typeof p.freeHeight === "number" && p.freeHeight > 0 ? p.freeHeight : PlanDefaults.defaultFreeHeight,
      marginsMm: typeof p.marginsMm === "number" && p.marginsMm >= 0 ? p.marginsMm : 10,
      holePattern: normalizeHolePattern((p as any).holePattern, (p as any).holePunch),
      holePunchSide: normalizeHolePunchSide((p as any).holePunchSide),
      spreadId: typeof p.spreadId === "string" ? p.spreadId : null,
      spreadOffset: (() => {
        const o = (p as any).spreadOffset;
        return o && Number.isFinite(o.xMm) && Number.isFinite(o.yMm) ? { xMm: Number(o.xMm), yMm: Number(o.yMm) } : null;
      })(),
      parentFolderId: typeof p.parentFolderId === "string" && folderIds.has(p.parentFolderId) ? p.parentFolderId : null,
      order: typeof p.order === "number" ? p.order : idx,
      projections: Array.isArray(p.projections) ? p.projections.map(pr => ({
        id: String(pr.id),
        sourceSheetId: String(pr.sourceSheetId),
        sceneSnapshot: pr.sceneSnapshot ?? null,
        scaleDen: normalizeScaleDen(
          (typeof pr.scaleDen === "number" && pr.scaleDen > 0)
            ? pr.scaleDen
            : (typeof pr.scale === "number" && pr.scale > 0 ? pr.scale : 100),
        ),
        x: typeof pr.x === "number" ? pr.x : 0,
        y: typeof pr.y === "number" ? pr.y : 0,
        rotation: typeof pr.rotation === "number" ? pr.rotation : 0,
        clip: pr.clip && typeof pr.clip === "object" ? {
          left: Number(pr.clip.left) || 0,
          right: Number(pr.clip.right) || 0,
          top: Number(pr.clip.top) || 0,
          bottom: Number(pr.clip.bottom) || 0,
        } : { left: 0, right: 0, top: 0, bottom: 0 },
        // Altdaten ohne mode sind eingefrorene Snapshots.
        mode: (pr.mode === "linked" ? "linked" : "frozen") as "linked" | "frozen",
      })) : [],
    }));
  }
}
