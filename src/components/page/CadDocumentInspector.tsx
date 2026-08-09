/**
 * CadDocumentInspector — Dokument-Eigenschaften Panel für die Projektmappe.
 *
 * Spiegelt 1:1 das "Dokument-Eigenschaften"-Panel aus der CAD-Oberfläche
 * (siehe CadEditor.tsx). Wird im rechten Inspector der Projektmappe
 * eingeblendet, sobald ein CAD-Dokument (scene.documents) im Auswahl-Tool
 * selektiert ist.
 */
import { useEffect, useRef, useState } from "react";
import { Maximize2, Ruler as RulerIcon } from "lucide-react";

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


      {scaling && (
        <div
          className="rounded-md p-2 text-[11px]"
          style={{
            background: "hsl(var(--primary) / 0.12)",
            border: "1px solid hsl(var(--primary) / 0.4)",
          }}
        >
          {phase === "scale-pick-1" && <span>1. Skalier-Punkt anklicken (Snap aktiv)</span>}
          {phase === "scale-pick-2" && <span>2. Punkt setzen · Shift: Ortho · Klick auf m-Anzeige: Distanz tippen</span>}
          {phase === "scale-await-input" && <span>Soll-Länge im Hub eingeben + Enter</span>}
        </div>
      )}

      <button
        type="button"
        onClick={() => (engine as any).documentTool?.beginScaleTwoPoints?.(sel.id)}
        className="w-full h-9 rounded-md border text-xs flex items-center justify-start gap-2 px-2 hover:bg-muted"
        style={{ borderColor: "hsl(var(--hairline))" }}
        title="Über zwei Snap-Punkte und eine Soll-Länge skalieren"
      >
        <Maximize2 className="h-4 w-4" />
        <span>Skalieren (2 Punkte)</span>
      </button>

      <button
        type="button"
        onClick={() => (engine as any).documentTool?.beginScaleFromLastDimension?.(sel.id)}
        className="w-full h-9 rounded-md border text-xs flex items-center justify-start gap-2 px-2 hover:bg-muted"
        style={{ borderColor: "hsl(var(--hairline))" }}
        title="Skaliere mit der zuletzt erstellten Maßkette als Referenz"
      >
        <RulerIcon className="h-4 w-4" />
        <span>Skalieren (Maßkette)</span>
      </button>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] px-0.5 text-muted-foreground">
          <span>Freie Skalierung</span>
          <button
            type="button"
            className="hover:underline"
            title="Zurück auf 100%"
            onClick={() => applyScale(100)}
          >
            Reset
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="range"
            min={1}
            max={2000}
            step={1}
            value={Math.round(scalePct)}
            onChange={(e) => applyScale(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="text-[10px] tabular-nums w-10 text-right text-muted-foreground">
            {Math.round(scalePct)}%
          </span>
        </div>
      </div>

      <DocumentPixelModeToggle app={engine as any} docId={sel.id} />

      <WarpSection engine={engine} docId={sel.id} />


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

/** Bild verzerren + Spiegeln (identisch in Projektmappe & CAD-Oberfläche). */
export function WarpSection({ engine, docId }: { engine: MiniCad | any; docId: string }) {
  const [, force] = useState(0);
  const app: any = engine as any;
  const doc: any = app.scene?.getDocumentById?.(docId);
  const tool: any = app.documentTool;
  const active: boolean = !!tool && tool.phase === "warp" && tool.warpTargetDocId === docId;
  const axis: "free" | "x" | "y" = (tool?.warpAxis ?? "free") as any;
  const hasWarp: boolean = Array.isArray(doc?.warpCorners) && doc.warpCorners.length === 4;

  const flipValue = doc?.flipX && doc?.flipY ? "both" : doc?.flipX ? "x" : doc?.flipY ? "y" : "none";

  const setAxis = (a: "free" | "x" | "y") => {
    if (tool) tool.warpAxis = a;
    force((n) => n + 1);
  };
  const toggle = () => {
    if (!tool) return;
    if (active) {
      tool.cancel?.();
      app.setTool?.("select");
      app.setSelection?.({ type: SelectionType.DOCUMENT, documentId: docId });
    } else {
      tool.beginWarp?.(docId);
    }
    force((n) => n + 1);
  };
  const reset = () => {
    tool?.resetWarp?.(docId);
    force((n) => n + 1);
  };
  const setFlip = (val: string) => {
    tool?.setDocFlip?.(docId, val === "x" || val === "both", val === "y" || val === "both");
    force((n) => n + 1);
  };

  return (
    <div
      className="rounded-md border p-2 space-y-1.5"
      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Bild verzerren
      </div>

      <button
        type="button"
        onClick={toggle}
        className="w-full h-8 rounded-md text-[11px] border flex items-center justify-center gap-2"
        style={{
          borderColor: active ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
          background: active ? "hsl(var(--accent-gold-soft))" : "transparent",
        }}
        title="Vier Eckpunkte frei ziehen (perspektivische Verzerrung)"
      >
        {active ? "Verzerren beenden" : "Verzerren"}
      </button>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground w-14">Achse</span>
        <select
          value={axis}
          onChange={(e) => setAxis(e.target.value as any)}
          className="flex-1 h-8 px-2 rounded bg-transparent border text-[11px]"
          style={{ borderColor: "hsl(var(--hairline))" }}
          title="Beschränkt die Ziehrichtung der Verzerr-Handles"
        >
          <option value="free">Frei (X + Y)</option>
          <option value="x">Nur X (horizontal)</option>
          <option value="y">Nur Y (vertikal)</option>
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground w-14">Spiegeln</span>
        <select
          value={flipValue}
          onChange={(e) => setFlip(e.target.value)}
          className="flex-1 h-8 px-2 rounded bg-transparent border text-[11px]"
          style={{ borderColor: "hsl(var(--hairline))" }}
          title="Dokument spiegeln"
        >
          <option value="none">Keine</option>
          <option value="x">Links ↔ Rechts</option>
          <option value="y">Oben ↔ Unten</option>
          <option value="both">Beides</option>
        </select>
      </div>

      {active && (
        <div className="text-[10px] text-muted-foreground leading-relaxed">
          Eckpunkte am Dokument ziehen · Snap aktiv · Fertig über „Verzerren beenden“.
        </div>
      )}

      {hasWarp && (
        <button
          type="button"
          onClick={reset}
          className="w-full h-7 rounded-md text-[11px] border text-muted-foreground hover:text-foreground"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          Verzerrung zurücksetzen
        </button>
      )}
    </div>
  );
}
