import { useEffect, useRef, useState } from "react";
import type { PageElement, ProjectPage } from "@/lib/projectStore";
import { getPageSizeMm } from "@/lib/paper";

/**
 * Leichtgewichtige Live-Vorschau einer Projektmappen-Seite.
 *
 * Rendert die Seitenelemente rein lesend (kein Editing, keine CAD-Engine) in
 * Prozent-Koordinaten des Blatts. Wird auf der Startseite im Reiter „Mappe“
 * für Miniaturen und die große Vorschau verwendet, damit sofort sichtbar ist,
 * was auf der Seite liegt.
 */
export function PageThumb({ page, className }: { page: ProjectPage; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const size = getPageSizeMm(page.format, page.customWMm, page.customHMm);
  const aspect = size.wMm / size.hMm;
  // Die Projektmappe rendert eine Referenzseite mit 1100 px Breite bei 100 %
  // Zoom — daraus leitet sich der Maßstabsfaktor für Schrift-/Strichgrößen ab.
  const k = width > 0 ? width / 1100 : 0;

  const elements = (page.elements ?? []).filter((e) => e.kind !== "guide" && !e.nonPrinting);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        background: page.background || "#ffffff",
        aspectRatio: `${aspect}`,
      }}
    >
      {k > 0 && elements.map((el) => <ThumbElement key={el.id} el={el} k={k} />)}
    </div>
  );
}

function ThumbElement({ el, k }: { el: PageElement; k: number }) {
  const box: React.CSSProperties = {
    position: "absolute",
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.w}%`,
    height: `${el.h}%`,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    opacity: el.opacity ?? 1,
    pointerEvents: "none",
  };

  if (el.kind === "line") {
    const pts = el.points ?? [];
    if (pts.length < 2) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX || 0.001;
    const h = Math.max(...ys) - minY || 0.001;
    return (
      <svg
        style={{ position: "absolute", left: `${minX}%`, top: `${minY}%`, width: `${w}%`, height: `${h}%`, overflow: "visible", pointerEvents: "none" }}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
      >
        <polyline
          points={pts.map((p) => `${p.x - minX},${p.y - minY}`).join(" ")}
          fill="none"
          stroke={el.color ?? "#111"}
          strokeWidth={Math.max(0.05, (el.strokeWidth ?? 1) * 0.05)}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  if (el.kind === "text") {
    return (
      <div
        style={{
          ...box,
          fontSize: Math.max(1, (el.fontSize ?? 16) * k),
          lineHeight: 1.2,
          color: el.color ?? "#111",
          fontWeight: el.bold ? 700 : 400,
          fontStyle: el.italic ? "italic" : "normal",
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        {el.text || ""}
      </div>
    );
  }

  const src = el.imageUrl || el.viewSnapshot;
  if ((el.kind === "image" || el.kind === "pdf" || el.kind === "cad-view" || el.kind === "cad-viewport") && src) {
    return <img src={src} alt="" style={{ ...box, objectFit: "fill" }} draggable={false} />;
  }

  if (el.kind === "cad-view" || el.kind === "cad-viewport" || el.kind === "pdf" || el.kind === "image") {
    // Kein Snapshot vorhanden → nur Platzhalterrahmen zeigen.
    return <div style={{ ...box, border: "1px solid rgba(0,0,0,0.25)", background: "rgba(0,0,0,0.03)" }} />;
  }

  if (el.kind === "table") {
    const rows = el.tableData?.cells?.length ?? 0;
    const cols = el.tableData?.cells?.[0]?.length ?? 0;
    return (
      <div style={{ ...box, border: "1px solid rgba(0,0,0,0.4)", display: "grid", gridTemplateRows: `repeat(${Math.max(1, rows)},1fr)`, gridTemplateColumns: `repeat(${Math.max(1, cols)},1fr)` }}>
        {(el.tableData?.cells ?? []).flatMap((row, r) =>
          row.map((cell, c) => (
            <div
              key={`${r}-${c}`}
              style={{ border: "0.5px solid rgba(0,0,0,0.25)", fontSize: Math.max(1, 9 * k), padding: 1, overflow: "hidden", whiteSpace: "nowrap" }}
            >
              {cell}
            </div>
          ))
        )}
      </div>
    );
  }

  if (el.kind === "shape") {
    return <div style={{ ...box, background: el.color ?? "rgba(0,0,0,0.1)", border: el.border ? "1px solid rgba(0,0,0,0.4)" : undefined }} />;
  }

  return null;
}
