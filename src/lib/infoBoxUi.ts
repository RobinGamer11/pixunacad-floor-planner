/**
 * Flüchtiger UI-Zustand der Infoboxen: gewählte Box, Entwurf (noch nicht
 * gesetzt) und lokal ausgeblendete Boxen. Nie Cloud/Undo/Projekt – die Boxen
 * selbst liegen in der Szene.
 */
import { useSyncExternalStore } from "react";

export interface InfoBoxDraft { x: number; y: number; sheetId: string }
interface State { selectedId: string | null; draft: InfoBoxDraft | null; hiddenIds: string[]; openTick?: number }

let state: State = { selectedId: null, draft: null, hiddenIds: [], openTick: 0 };
const listeners = new Set<() => void>();

export const infoBoxUi = {
  get: () => state,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  set(patch: Partial<State>) {
    const next = { ...state, ...patch };
    if (next.selectedId === state.selectedId && next.draft === state.draft && next.hiddenIds === state.hiddenIds && next.openTick === state.openTick) return;
    state = next;
    listeners.forEach((fn) => fn());
  },
  /** Jede Auswahl (auch erneut dieselbe Box) öffnet rechts die Einstellungen. */
  select(id: string | null) { infoBoxUi.set({ selectedId: id, draft: null, openTick: (state.openTick || 0) + 1 }); },
  clear() { infoBoxUi.set({ selectedId: null, draft: null }); },
  hide(ids: string[]) { if (ids.length) infoBoxUi.set({ hiddenIds: [...new Set([...state.hiddenIds, ...ids])] }); },
  showAll() { if (state.hiddenIds.length) infoBoxUi.set({ hiddenIds: [] }); },
};

export function useInfoBoxUi(): State {
  return useSyncExternalStore(infoBoxUi.subscribe, infoBoxUi.get, infoBoxUi.get);
}

/** Standardbreite einer Infobox in Metern (maßstäblich auf dem Plan). */
export const INFOBOX_DEFAULT_WIDTH_M = 0.5;
/** Höhe/Breite einer Infobox. */
export const INFOBOX_ASPECT = 1;

/** Weltmaße einer Infobox (zentriert um x/y). */
export function infoBoxSizeWorld(b: { sizeM?: number }): { w: number; h: number } {
  const w = typeof b.sizeM === "number" && b.sizeM > 0 ? b.sizeM : INFOBOX_DEFAULT_WIDTH_M;
  return { w, h: w * INFOBOX_ASPECT };
}

/** Zusätzliche Breite (Zeichnungsmaß) für den Titel einer Informationsbox. */
export function infoBoxTitleExtraWorld(b: { kind?: string; title?: string; sizeM?: number }): number {
  if (b.kind === "task" || !b.title) return 0;
  const { w } = infoBoxSizeWorld(b);
  return Math.min(String(b.title).length, 28) * w * 0.2 + w * 0.25;
}

/** Eckpunkte einer Infobox in Weltkoordinaten (Spitze unten mittig auf x/y). */
export function infoBoxCornersWorld(b: { x: number; y: number; sizeM?: number; kind?: string; title?: string }): { x: number; y: number }[] {
  const { w, h } = infoBoxSizeWorld(b);
  const l = b.x - w / 2, r = b.x + w / 2 + infoBoxTitleExtraWorld(b);
  return [
    { x: l, y: b.y - h }, { x: r, y: b.y - h },
    { x: r, y: b.y }, { x: l, y: b.y },
  ];
}

/** Kürzel aus Anzeigename oder E-Mail (max. 2 Buchstaben). */
export function initialsOf(name: string | null | undefined): string {
  const s = String(name || "").trim();
  if (!s) return "?";
  const base = s.includes("@") ? s.split("@")[0] : s;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : base.slice(0, 2);
  return letters.toUpperCase();
}
