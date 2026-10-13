/**
 * Flüchtiger UI-Zustand der Infoboxen: gewählte Box, Entwurf (noch nicht
 * gesetzt) und lokal ausgeblendete Boxen. Nie Cloud/Undo/Projekt – die Boxen
 * selbst liegen in der Szene.
 */
import { useSyncExternalStore } from "react";

export interface InfoBoxDraft { x: number; y: number; sheetId: string }
interface State { selectedId: string | null; draft: InfoBoxDraft | null; hiddenIds: string[] }

let state: State = { selectedId: null, draft: null, hiddenIds: [] };
const listeners = new Set<() => void>();

export const infoBoxUi = {
  get: () => state,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  set(patch: Partial<State>) {
    const next = { ...state, ...patch };
    if (next.selectedId === state.selectedId && next.draft === state.draft && next.hiddenIds === state.hiddenIds) return;
    state = next;
    listeners.forEach((fn) => fn());
  },
  select(id: string | null) { infoBoxUi.set({ selectedId: id, draft: null }); },
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
export const INFOBOX_ASPECT = 0.3;

/** Weltmaße einer Infobox (zentriert um x/y). */
export function infoBoxSizeWorld(b: { sizeM?: number }): { w: number; h: number } {
  const w = typeof b.sizeM === "number" && b.sizeM > 0 ? b.sizeM : INFOBOX_DEFAULT_WIDTH_M;
  return { w, h: w * INFOBOX_ASPECT };
}

/** Eckpunkte (Fang-/Greifpunkte) einer Infobox in Weltkoordinaten. */
export function infoBoxCornersWorld(b: { x: number; y: number; sizeM?: number }): { x: number; y: number }[] {
  const { w, h } = infoBoxSizeWorld(b);
  const hw = w / 2, hh = h / 2;
  return [
    { x: b.x - hw, y: b.y - hh }, { x: b.x + hw, y: b.y - hh },
    { x: b.x + hw, y: b.y + hh }, { x: b.x - hw, y: b.y + hh },
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
