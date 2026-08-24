/**
 * mappeClipboard.ts — gemeinsame In-Memory-Zwischenablage der Projektmappe.
 *
 * Die Ablage lebt außerhalb der ProjectWorkspace-Instanz und außerhalb der
 * MiniCad-Engine. Dadurch übersteht eine Kopie den Seitenwechsel, den Wechsel
 * zwischen Projektmappen-/Finanz-Büchern desselben Projekts und die
 * Neu-Erzeugung einer Engine. Geleert wird sie ausschließlich beim Wechsel in
 * eine andere Hauptoberfläche (CAD, Orga), beim Projektwechsel oder beim
 * Verlassen des Projekts. Kein persistenter Browser-Clipboard.
 */

export interface MappeClipboardSnapshot {
  projectId: string;
  sourcePageId: string | null;
  sourceBookKey: string | null;
  copiedAt: number;
  /** Serialisierte page.elements (Tabellen, Textboxen, Bilder, PDFs, CAD-Blätter …). */
  pageElements: any[];
  /** Serialisierte MiniCad-Objekte (Linien, Schraffuren, Freihand, Dokumente …). */
  cadObjects: { kind: string; data: any }[];
}

let current: MappeClipboardSnapshot | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of Array.from(listeners)) {
    try { l(); } catch { /* ignorieren */ }
  }
}

export function subscribeMappeClipboard(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setMappeClipboard(snap: MappeClipboardSnapshot | null): void {
  current = snap;
  emit();
}

/** Snapshot nur zurückgeben, wenn er zum aktuellen Projekt gehört. */
export function getMappeClipboard(projectId: string | null | undefined): MappeClipboardSnapshot | null {
  if (!current || !projectId) return null;
  return current.projectId === projectId ? current : null;
}

export function hasMappeClipboard(projectId: string | null | undefined): boolean {
  return !!getMappeClipboard(projectId);
}

export function clearMappeClipboard(): void {
  if (!current) return;
  current = null;
  emit();
}

/** Leert die Ablage, wenn ein anderes Projekt aktiv wird. */
export function clearMappeClipboardIfOtherProject(projectId: string | null | undefined): void {
  if (current && current.projectId !== projectId) clearMappeClipboard();
}
