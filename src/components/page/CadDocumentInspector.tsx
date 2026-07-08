/**
 * CadDocumentInspector — Dokument-Eigenschaften Panel für die Projektmappe.
 *
 * Spiegelt 1:1 das "Dokument-Eigenschaften"-Panel aus der CAD-Oberfläche
 * (siehe CadEditor.tsx, ~Zeile 2517 ff.). Wird im rechten Inspector der
 * Projektmappe eingeblendet, sobald ein CAD-Dokument (scene.documents)
 * im Auswahl-Tool selektiert ist.
 *
 * Aktionen: Skalieren (2 Punkte), Skalieren (Maßkette), PDF auflösen,
 * Löschen, plus DocumentFilterPanel (Alpha, Farb-Filter, Presets).
 */
import { useEffect, useRef, useState } from "react";
import { Maximize2, Ruler as RulerIcon, Trash2, FileText, Anchor as AnchorIcon } from "lucide-react";
import type { MiniCad } from "@/cad/embed/MiniCad";
import { SelectionType } from "@/cad/constants";
import { DocumentFilterPanel } from "@/components/cad/DocumentFilterPanel";

interface Props {
  engine: MiniCad | null;
}

type DocSelSnap = {
  id: string;
  name: string;
  widthM: number;
  heightM: number;
  kind: string;
  pdfSourceB64: string | null;
};

export function CadDocumentInspector({ engine }: Props) {
  const [sel, setSel] = useState<DocSelSnap | null>(null);
  const [filterSig, setFilterSig] = useState<string>("");
  const [phase, setPhase] = useState<string>("idle");
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!engine) return;
    const tick = () => {
      const app: any = engine;
      const s: any = app.selection;
      if (s && s.type === SelectionType.DOCUMENT) {
        const doc: any = app.scene.getDocumentById(s.documentId);
        if (doc) {
          setSel((prev) => {
            if (
              prev &&
              prev.id === doc.id &&
              prev.name === doc.name &&
              prev.widthM === doc.widthM &&
              prev.heightM === doc.heightM
            )
              return prev;
            return {
              id: doc.id,
              name: doc.name,
              widthM: doc.widthM,
              heightM: doc.heightM,
              kind: doc.kind,
              pdfSourceB64: doc.pdfSourceB64 || null,
            };
          });
          const sig = `${doc.activeFilterId || ""}|${doc.opacity ?? 1}|${JSON.stringify(
            (doc.filters || []).map((f: any) => [f.id, f.name, f.mode, f.tintColor, f.bwThreshold]),
          )}`;
          setFilterSig((prev) => (prev === sig ? prev : sig));
        } else {
          setSel((p) => (p ? null : p));
        }
      } else {
        setSel((p) => (p ? null : p));
      }
      const p = app.documentTool?.phase ?? "idle";
      setPhase((prev) => (prev === p ? prev : p));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [engine]);

  if (!engine || !sel) return null;
  const scaling =
    phase === "scale-pick-1" || phase === "scale-pick-2" || phase === "scale-await-input";

  return (
    <div
      className="rounded-md border p-3 space-y-3"
      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Dokument-Eigenschaften
      </div>

      <div className="text-xs">
        <div className="font-medium truncate" title={sel.name}>
          {sel.name}
        </div>
        <div className="text-muted-foreground">
          {sel.widthM.toFixed(3)} × {sel.heightM.toFixed(3)} m
        </div>
      </div>

      {scaling && (
        <div
          className="rounded-md p-2 text-xs"
          style={{
            background: "hsl(var(--primary) / 0.12)",
            border: "1px solid hsl(var(--primary) / 0.4)",
          }}
        >
          {phase === "scale-pick-1" && <span>1. Skalier-Punkt anklicken (Snap aktiv)</span>}
          {phase === "scale-pick-2" && (
            <span>2. Punkt setzen · Shift: Ortho · Klick auf m-Anzeige: Distanz tippen</span>
          )}
          {phase === "scale-await-input" && <span>Soll-Länge im Hub eingeben + Enter</span>}
        </div>
      )}

      <button
        type="button"
        onClick={() => (engine as any).documentTool?.beginScaleTwoPoints(sel.id)}
        className="w-full h-9 rounded-md border text-xs flex items-center justify-center gap-2 hover:bg-muted"
        style={{ borderColor: "hsl(var(--hairline))" }}
        title="Über zwei Snap-Punkte und eine Soll-Länge skalieren"
      >
        <Maximize2 size={14} /> Skalieren (2 Punkte)
      </button>
      <button
        type="button"
        onClick={() => (engine as any).documentTool?.beginScaleFromLastDimension?.(sel.id)}
        className="w-full h-9 rounded-md border text-xs flex items-center justify-center gap-2 hover:bg-muted"
        style={{ borderColor: "hsl(var(--hairline))" }}
        title="Skaliere mit der zuletzt erstellten Maßkette als Referenz"
      >
        <RulerIcon size={14} /> Skalieren (Maßkette)
      </button>

      {sel.kind === "pdf-page" && !!sel.pdfSourceB64 && (
        <button
          type="button"
          onClick={async () => {
            const app: any = engine;
            if (
              !window.confirm(
                `PDF "${sel.name}" in CAD-Objekte auflösen?\n\nLinien, Schraffuren und Texte werden extrahiert; das Original wird entfernt.`,
              )
            )
              return;
            const res = await app.documentTool?.dissolvePdf(sel.id);
            if (res) {
              window.alert(
                `Auflösen erfolgreich:\n${res.segments} Linien · ${res.hatches} Schraffuren · ${res.texts} Texte`,
              );
            }
          }}
          className="w-full h-9 rounded-md border text-xs flex items-center justify-center gap-2 hover:bg-muted"
          style={{ borderColor: "hsl(var(--hairline))" }}
          title="PDF-Vektoren extrahieren und in Linien/Schraffuren/Texte konvertieren"
        >
          <FileText size={14} /> Auflösen → CAD-Objekte
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          const app: any = engine;
          const doc = app.scene.getDocumentById(sel.id);
          if (doc && window.confirm(`Dokument "${doc.name}" löschen?`)) {
            app.scene.removeDocument(doc);
            app.clearSelection?.();
            app.refreshLabelUI?.();
          }
        }}
        className="w-full h-9 rounded-md border text-xs flex items-center justify-center gap-2 hover:bg-muted"
        style={{ borderColor: "hsl(var(--hairline))" }}
        title="Dokument löschen"
      >
        <Trash2 size={14} /> Löschen
      </button>

      <DocumentFilterPanel app={engine as any} docId={sel.id} sig={filterSig} />

      <div
        className="text-[11px] leading-relaxed pt-2 text-muted-foreground"
        style={{ borderTop: "1px solid hsl(var(--hairline))" }}
      >
        Drag: verschieben (Snap aktiv) · Entf: löschen
      </div>
    </div>
  );
}
