/**
 * Zentrale Transaktion für Eigenschafts-Controls (Farbe, Dicke, Aufrauen …).
 * Eine zusammenhängende Bedienaktion = genau ein Undo-Schritt, egal wie viele
 * Objekte der Mehrfachauswahl betroffen sind. Nutzt ausschließlich
 * beginAction/commitAction/cancelAction der CadApp.
 */
export interface ActionHost {
  beginAction(): void;
  commitAction(): void;
  cancelAction(): void;
}

export class PropertyEditSession {
  private open: string | null = null;
  constructor(private host: ActionHost) {}

  get activeControl() { return this.open; }

  begin(controlId: string) {
    if (this.open === controlId) return;
    if (this.open) this.commit(this.open);
    this.open = controlId;
    this.host.beginAction();
  }

  update(controlId: string, apply: () => void) {
    this.begin(controlId);
    apply();
  }

  commit(controlId?: string) {
    if (!this.open || (controlId && controlId !== this.open)) return;
    this.open = null;
    this.host.commitAction();
  }

  cancel() {
    if (!this.open) return;
    this.open = null;
    this.host.cancelAction();
  }

  /** Werkzeug-/Auswahlwechsel, Unmount: offene Aktion nie zurücklassen. */
  flush() { this.commit(); }
}

const TRACKED = new Set(["color", "range", "number"]);

function trackedInput(t: EventTarget | null): HTMLInputElement | null {
  const el = t as HTMLInputElement | null;
  if (!el || el.tagName !== "INPUT" || !TRACKED.has(el.type)) return null;
  if (el.closest("[data-no-property-edit]")) return null;
  return el;
}

let autoId = 0;
function idOf(el: HTMLInputElement): string {
  if (!(el as any).__propEditId) (el as any).__propEditId = `pe${++autoId}`;
  return (el as any).__propEditId;
}

/**
 * Bindet alle Farb-, Regler- und Zahlenfelder der Oberfläche an die Session:
 * pointerdown/focus → begin, input → nur Vorschau, change/pointerup/blur/Enter
 * → commit, Escape → cancel (Ausgangszustand, kein Undo-Schritt).
 */
export function installPropertyEditListeners(session: PropertyEditSession, doc: Document = document): () => void {
  const begin = (e: Event) => {
    const el = trackedInput(e.target);
    if (el) session.begin(idOf(el));
    // Klick außerhalb (z. B. Zeichenfläche = Auswahlwechsel): offene Aktion abschließen.
    else if (e.type === "pointerdown" && session.activeControl) session.flush();
  };
  const commit = (e: Event) => {
    const el = trackedInput(e.target);
    if (!el) return;
    // Zahlenfelder bleiben bis Enter/Blur offen; change committet dort nicht.
    if (e.type === "change" && el.type === "number" && doc.activeElement === el) return;
    if (e.type === "pointerup" && el.type !== "range") return;
    session.commit(idOf(el));
  };
  const key = (e: KeyboardEvent) => {
    const el = trackedInput(e.target);
    if (!el || !session.activeControl) return;
    if (e.key === "Escape") { session.cancel(); e.stopPropagation(); }
    else if (e.key === "Enter") session.commit(idOf(el));
  };
  const opts = true;
  doc.addEventListener("pointerdown", begin, opts);
  doc.addEventListener("focusin", begin, opts);
  doc.addEventListener("change", commit, opts);
  doc.addEventListener("pointerup", commit, opts);
  doc.addEventListener("focusout", commit, opts);
  doc.addEventListener("keydown", key, opts);
  return () => {
    session.flush();
    doc.removeEventListener("pointerdown", begin, opts);
    doc.removeEventListener("focusin", begin, opts);
    doc.removeEventListener("change", commit, opts);
    doc.removeEventListener("pointerup", commit, opts);
    doc.removeEventListener("focusout", commit, opts);
    doc.removeEventListener("keydown", key, opts);
  };
}
