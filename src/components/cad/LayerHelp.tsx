import { useEffect, useState } from "react";
import { Layers, Lock, Eye, Pencil, Trash2, ChevronDown } from "lucide-react";

const HELP_ROWS: { icon: React.ReactNode; text: string }[] = [
  { icon: <Lock size={14} />, text: "Ebene bearbeitbar / nicht bearbeitbar" },
  { icon: <Eye size={14} />, text: "Ebene sichtbar / nicht sichtbar" },
  { icon: <Pencil size={14} />, text: "Ebene umbenennen" },
  { icon: <Trash2 size={14} />, text: "Ebene löschen" },
];

/**
 * Gemeinsame Ebenen-Legende (Hilfe-Modus) für CAD-Oberfläche und Projektmappe.
 * Jede Zeile: Symbol + Bedeutung, jeweils als eigener Absatz.
 */
export function LayerHelpLegend() {
  return (
    <div className="space-y-2.5 text-[11.5px]">
      {HELP_ROWS.map((r, i) => (
        <div key={i} className="flex items-center gap-2.5 text-muted-foreground">
          <span className="shrink-0 flex items-center justify-center h-7 w-7 rounded-lg"
            style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}>
            {r.icon}
          </span>
          <span>{r.text}</span>
        </div>
      ))}
      <div className="pt-1 text-[11.5px] font-semibold" style={{ color: "hsl(var(--foreground))" }}>
        Höchste Ebene = im Vordergrund
      </div>
    </div>
  );
}

/** Titelzeile des Ebenen-Panels (Kopfbereich innerhalb der Karte). */
export function LayersPanelTitle() {
  return (
    <div className="cad-sheet-tab-head">
      <div className="cad-sheet-tab-title">Ebenen</div>
      <div className="cad-sheet-tab-subtitle">Zeicheninhalte organisieren</div>
    </div>
  );
}

/**
 * Eigene Karte unterhalb der Ebenenliste: aufklappbarer Block
 * „Symbole &amp; Bedienung“. Rein visuell — keine Funktionsänderung.
 */
export function LayersHelpCard({ helpOn }: { helpOn?: boolean }) {
  const [open, setOpen] = useState(!!helpOn);
  useEffect(() => { if (helpOn) setOpen(true); }, [helpOn]);
  return (
    <div className="cad-id-panel w-full px-3 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-[12.5px] font-semibold"
      >
        <span className="flex-1 text-left">Symbole &amp; Bedienung</span>
        <ChevronDown
          size={14}
          className="text-muted-foreground transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>
      {open && <div className="mt-3">{<LayerHelpLegend />}</div>}
    </div>
  );
}

/** Rückwärtskompatibler Kopfbereich (Titel + Hilfe in einem Block). */
export function LayersPanelHeader({ helpOn }: { helpOn?: boolean }) {
  return (
    <div className="space-y-2">
      <LayersPanelTitle />
      <LayersHelpCard helpOn={helpOn} />
    </div>
  );
}

/**
 * Werkzeugleiste über der Zeichenfläche (oben links): Ebenen, Kommentare …
 * Alle Schalter liegen in derselben Leiste und haben dieselbe Größe.
 */
export function CanvasFabBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute z-30 left-3 top-3 flex items-center gap-2">
      {children}
    </div>
  );
}

/** Runder, gut sichtbarer Ebenen-Button für die Werkzeugleiste. */
export function LayerFab({
  count,
  onClick,
  bare,
}: {
  count: number;
  onClick: () => void;
  /** true = ohne eigene Positionierung (innerhalb von `CanvasFabBar`). */
  bare?: boolean;
}) {
  return (
    <button
      type="button"
      title="Ebenen öffnen"
      onClick={onClick}
      className={`${bare ? "" : "absolute z-30 left-3 top-3 "}h-12 w-12 rounded-full flex flex-col items-center justify-center gap-0.5 shadow-lg transition-transform hover:scale-105`}
      style={{
        background: "hsl(var(--surface-card))",
        color: "hsl(var(--ink))",
        border: "2px solid hsl(var(--primary) / 0.75)",
      }}
    >
      <Layers size={18} />
      <span className="text-[10px] font-semibold leading-none">{count}</span>
    </button>
  );
}

