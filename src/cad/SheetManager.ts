import { clamp } from "./geometry";

/** Darstellung eines Overlay-Blattes (Transparentpause). */
export const OverlayMode = {
  NONE: "none",
  STAMP: "stamp",   // Originalfarben
  TINT: "tint",     // Eingefärbt
} as const;
export type OverlayModeT = typeof OverlayMode[keyof typeof OverlayMode];

export interface OverlayState {
  mode: OverlayModeT;
  color: string | null; // nur relevant für TINT
  opacity: number;       // 0..1
}

/** Verfügbare Tint-Farben (analog Referenzcode). */
export const OverlayColors: { key: string; hex: string }[] = [
  { key: "black",  hex: "#111111" },
  { key: "gray",   hex: "#7a7f87" },
  { key: "orange", hex: "#d88832" },
  { key: "green",  hex: "#4f9d5d" },
  { key: "red",    hex: "#c94a4a" },
  { key: "yellow", hex: "#d6c248" },
];

/** Vordefinierte Maßstäbe für Blätter (Wert = Welt-Einheiten pro 1 Plan-Einheit). */
export const SheetScales: { key: string; label: string; value: number }[] = [
  { key: "1:20",  label: "1:20",  value: 20 },
  { key: "1:50",  label: "1:50",  value: 50 },
  { key: "1:100", label: "1:100", value: 100 },
  { key: "1:200", label: "1:200", value: 200 },
  { key: "1:500", label: "1:500", value: 500 },
];

export interface Sheet {
  id: string;
  name: string;
  locked?: boolean; // Default-Sheet ist gesperrt (nicht löschbar/umbenennbar)
  /** Maßstab-Schlüssel (z.B. "1:100") oder "free" für freien Wert. */
  scaleKey?: string;
  /** Numerischer Wert (Welt-Einheiten pro Plan-Einheit). Nur relevant wenn scaleKey === "free". */
  scaleValue?: number;
}

export const SheetDefaults = {
  defaultSheetId: "default-sheet",
  defaultSheetName: "Default",
  defaultOpacity: 0.72,
  defaultScaleKey: "1:100",
  defaultScaleValue: 100,
};

/** Hilfsfunktion: numerischer Maßstabswert eines Blatts. */
export function getSheetScaleValue(sheet: Sheet | null | undefined): number {
  if (!sheet) return SheetDefaults.defaultScaleValue;
  if (sheet.scaleKey === "free") {
    return typeof sheet.scaleValue === "number" && sheet.scaleValue > 0
      ? sheet.scaleValue
      : SheetDefaults.defaultScaleValue;
  }
  const found = SheetScales.find(s => s.key === (sheet.scaleKey || SheetDefaults.defaultScaleKey));
  return found ? found.value : SheetDefaults.defaultScaleValue;
}

/** Verwaltet Liste der Zeichnungs-IDs (Blätter) inkl. Reihenfolge. */
export class SheetManager {
  private sheets: Sheet[] = [];
  private _counter = 1;

  constructor() {
    this.sheets = [
      { id: SheetDefaults.defaultSheetId, name: SheetDefaults.defaultSheetName, locked: true },
    ];
  }

  list(): Sheet[] {
    return [...this.sheets];
  }

  getById(id: string): Sheet | null {
    return this.sheets.find(s => s.id === id) || null;
  }

  getIndex(id: string): number {
    return this.sheets.findIndex(s => s.id === id);
  }

  createSheet(): Sheet {
    const id = `sheet-${Date.now()}-${this._counter++}`;
    const name = `Blatt ${this._counter - 1}`;
    const sheet: Sheet = { id, name, locked: false };
    // Neue Blätter oben einfügen → höchster Vordergrund
    this.sheets.unshift(sheet);
    return sheet;
  }

  renameSheet(id: string, newName: string): Sheet | null {
    const s = this.getById(id);
    if (!s) return null;
    const clean = (newName || "").trim();
    if (!clean) return null;
    s.name = clean;
    return s;
  }

  deleteSheet(id: string): boolean {
    const s = this.getById(id);
    if (!s || s.locked) return false;
    this.sheets = this.sheets.filter(x => x.id !== id);
    return true;
  }

  moveToIndex(id: string, targetIndex: number): boolean {
    const from = this.getIndex(id);
    if (from < 0) return false;
    const clamped = clamp(targetIndex, 0, this.sheets.length - 1);
    if (from === clamped) return false;
    const [item] = this.sheets.splice(from, 1);
    this.sheets.splice(clamped, 0, item);
    return true;
  }

  /** Serialisierung für History/Save. */
  toJSON(): Sheet[] {
    return this.sheets.map(s => ({ id: s.id, name: s.name, locked: !!s.locked }));
  }

  /** Wiederherstellung aus Snapshot. Default-Sheet wird immer garantiert. */
  restore(data: Sheet[]) {
    if (!Array.isArray(data) || data.length === 0) {
      this.sheets = [{ id: SheetDefaults.defaultSheetId, name: SheetDefaults.defaultSheetName, locked: true }];
      return;
    }
    const cleaned = data.map(s => ({
      id: String(s.id),
      name: String(s.name || "Blatt"),
      locked: s.id === SheetDefaults.defaultSheetId ? true : !!s.locked,
    }));
    if (!cleaned.some(s => s.id === SheetDefaults.defaultSheetId)) {
      cleaned.push({ id: SheetDefaults.defaultSheetId, name: SheetDefaults.defaultSheetName, locked: true });
    }
    this.sheets = cleaned;
  }
}

/** Verwaltet Overlay-State (Transparentpause) pro Blatt. */
export class SheetOverlayStore {
  private states = new Map<string, OverlayState>();

  ensure(sheetId: string): OverlayState {
    if (!this.states.has(sheetId)) {
      this.states.set(sheetId, { mode: OverlayMode.NONE, color: null, opacity: SheetDefaults.defaultOpacity });
    }
    return this.states.get(sheetId)!;
  }

  get(sheetId: string): OverlayState {
    return this.ensure(sheetId);
  }

  setNone(sheetId: string) {
    const prev = this.ensure(sheetId);
    this.states.set(sheetId, { mode: OverlayMode.NONE, color: null, opacity: prev.opacity });
  }

  setStamp(sheetId: string) {
    const prev = this.ensure(sheetId);
    this.states.set(sheetId, { mode: OverlayMode.STAMP, color: null, opacity: prev.opacity });
  }

  setTint(sheetId: string, color: string) {
    const prev = this.ensure(sheetId);
    this.states.set(sheetId, { mode: OverlayMode.TINT, color, opacity: prev.opacity });
  }

  setOpacity(sheetId: string, opacity: number) {
    const prev = this.ensure(sheetId);
    this.states.set(sheetId, { mode: prev.mode, color: prev.color, opacity: clamp(opacity, 0, 1) });
  }

  delete(sheetId: string) {
    this.states.delete(sheetId);
  }

  toJSON(): Record<string, OverlayState> {
    const out: Record<string, OverlayState> = {};
    for (const [k, v] of this.states.entries()) out[k] = { ...v };
    return out;
  }

  restore(data: Record<string, OverlayState>) {
    this.states.clear();
    if (!data || typeof data !== "object") return;
    for (const k of Object.keys(data)) {
      const v = data[k];
      if (!v) continue;
      this.states.set(k, {
        mode: (v.mode as OverlayModeT) || OverlayMode.NONE,
        color: v.color || null,
        opacity: clamp(typeof v.opacity === "number" ? v.opacity : SheetDefaults.defaultOpacity, 0, 1),
      });
    }
  }
}
