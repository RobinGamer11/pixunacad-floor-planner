import { Layers, Lock, Eye, Pencil, Trash2 } from "lucide-react";

/**
 * Gemeinsame Ebenen-Legende (Hilfe-Modus) für CAD-Oberfläche und Projektmappe.
 * Jede Zeile: Symbol + Bedeutung, jeweils als eigener Absatz.
 */
export function LayerHelpLegend() {
  const rows: { icon: React.ReactNode; text: string }[] = [
    { icon: <Lock size={13} />, text: "= Ebene bearbeitbar / nicht bearbeitbar" },
    { icon: <Eye size={13} />, text: "= Ebene sichtbar / nicht sichtbar" },
    { icon: <Pencil size={13} />, text: "= Ebene umbenennen" },
    { icon: <Trash2 size={13} />, text: "= Ebene löschen" },
  ];
  return (
    <div
      className="rounded-lg px-3 py-2 text-[11px] font-medium"
      style={{ background: "hsl(220 18% 16%)", color: "hsl(0 0% 100% / 0.92)" }}
    >
      Höchste Ebene = Im Vordergrund
      <div className="mt-2 space-y-1.5 font-normal" style={{ opacity: 0.9 }}>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="shrink-0 flex items-center justify-center h-5 w-5 rounded-md"
              style={{ background: "hsl(0 0% 100% / 0.12)" }}>
              {r.icon}
            </span>
            <span>{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Runder, gut sichtbarer Ebenen-Button oben links auf der Zeichenfläche. */
export function LayerFab({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      title="Ebenen öffnen"
      onClick={onClick}
      className="absolute z-30 left-3 top-3 h-12 w-12 rounded-full flex flex-col items-center justify-center gap-0.5 shadow-lg transition-transform hover:scale-105"
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
