/**
 * Flüchtiger UI-Zustand der Infoboxen: gewählte Box und Entwurf (noch nicht
 * gesetzt). Nie Cloud/Undo/Projekt – die Boxen selbst liegen in der Szene.
 */
import { useSyncExternalStore } from "react";

export interface InfoBoxDraft { x: number; y: number; sheetId: string }
interface State { selectedId: string | null; draft: InfoBoxDraft | null }

let state: State = { selectedId: null, draft: null };
const listeners = new Set<() => void>();

export const infoBoxUi = {
  get: () => state,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  set(patch: Partial<State>) {
    const next = { ...state, ...patch };
    if (next.selectedId === state.selectedId && next.draft === state.draft) return;
    state = next;
    listeners.forEach((fn) => fn());
  },
  select(id: string | null) { infoBoxUi.set({ selectedId: id, draft: null }); },
  clear() { infoBoxUi.set({ selectedId: null, draft: null }); },
};

export function useInfoBoxUi(): State {
  return useSyncExternalStore(infoBoxUi.subscribe, infoBoxUi.get, infoBoxUi.get);
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
