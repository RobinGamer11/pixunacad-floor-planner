/**
 * CadDocumentInspector — Dokument-Eigenschaften Panel für die Projektmappe.
 *
 * Spiegelt 1:1 das "Dokument-Eigenschaften"-Panel aus der CAD-Oberfläche
 * (siehe CadEditor.tsx). Wird im rechten Inspector der Projektmappe
 * eingeblendet, sobald ein CAD-Dokument (scene.documents) im Auswahl-Tool
 * selektiert ist.
 */
import { useEffect, useRef, useState } from "react";
import { Anchor as AnchorIcon } from "lucide-react";
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
  // Basis-Größe für den Free-Scale-Slider — wird beim Auswechseln des
  // Dokuments neu gesetzt, damit 100% immer die Ausgangsgröße meint.
  const scaleBaseRef = useRef<{ id: string; w: number; h: number } | null>(null);
  const [scalePct, setScalePct] = useState<number>(100);

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

  // Slider-Basis initialisieren, wenn das Dokument wechselt.
  useEffect(() => {
    if (!sel) {
      scaleBaseRef.current = null;
      return;
    }
    if (!scaleBaseRef.current || scaleBaseRef.current.id !== sel.id) {
      scaleBaseRef.current = { id: sel.id, w: sel.widthM, h: sel.heightM };
      setScalePct(100);
    } else {
      // Externe Größenänderung (z.B. via 2-Punkt-Scale) → Slider zurückfahren.
      const base = scaleBaseRef.current;
      const cur = base.w > 0 ? (sel.widthM / base.w) * 100 : 100;
      setScalePct((prev) => (Math.abs(prev - cur) > 0.5 ? Math.round(cur) : prev));
    }
  }, [sel?.id, sel?.widthM, sel?.heightM]);

  if (!engine || !sel) return null;
  const scaling =
    phase === "scale-pick-1" || phase === "scale-pick-2" || phase === "scale-await-input";

  const applyScale = (pct: number) => {
    const base = scaleBaseRef.current;
    if (!base) return;
    setScalePct(pct);
    const factor = Math.max(0.05, pct / 100);
    (engine as any).documentTool?.scaleUniformAbsolute?.(sel.id, factor, base.w, base.h);
  };

  return (
    <div
      className="rounded-md border p-2 space-y-2"
      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Dokument-Eigenschaften
      </div>

      <div className="text-[11px]">
        <div className="font-medium truncate" title={sel.name}>
          {sel.name}
        </div>
        <div className="text-muted-foreground">
          {sel.widthM.toFixed(3)} × {sel.heightM.toFixed(3)} m
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          const app: any = engine;
          const tool: any = app?.documentTool;
          if (tool?.isAnchorEditing?.() && tool.anchorTargetDocId === sel.id) {
            tool.cancel?.();
          } else {
            tool?.beginAnchorEdit?.(sel.id);
          }
        }}
        className="w-full h-7 rounded-md border text-[11px] flex items-center justify-start gap-1.5 px-2 hover:bg-muted"
        style={{
          borderColor: phase === "anchor-edit" ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
          background: phase === "anchor-edit" ? "hsl(var(--accent-gold) / 0.12)" : undefined,
        }}
        title="Anker (Fangpunkte) am Dokument setzen — Klick platziert (mit Snap), erneuter Klick auf einen Anker entfernt ihn."
      >
        <AnchorIcon size={12} /> {phase === "anchor-edit" ? "Anker beenden" : "Anker +/−"}
      </button>

      <DocumentFilterPanel app={engine as any} docId={sel.id} sig={filterSig} showBgRemove={false} />

      <div
        className="text-[10px] leading-relaxed pt-1.5 text-muted-foreground"
        style={{ borderTop: "1px solid hsl(var(--hairline))" }}
      >
        Drag: verschieben (Snap aktiv) · Entf: löschen
      </div>
    </div>
  );
}
