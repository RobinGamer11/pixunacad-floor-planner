/**
 * CadTableLayer — Tabellenwerkzeug der CAD-Oberfläche.
 *
 * Nutzt exakt dieselbe Tabellen-Engine wie die Projektmappe
 * (`TableElementView` + `tableModel`/`tableLayout`/`tableFormula`) und dieselbe
 * Bedienlogik: dünner blauer Auswahlrahmen, blaue Fangpunkte an den Ecken,
 * Verschieben/Drehen ausschließlich über die HUB-Symbole am gewählten
 * Fangpunkt (Linksklick setzt), Doppelklick öffnet den Tabellenmodus.
 */
import React from "react";
import { Move, RotateCw } from "lucide-react";
import { TableElementView, TableEditContext } from "@/components/page/TableElementView";
import { cadTableStore, type CadTableElement } from "@/lib/cadTableStore";
import { createTableData, tableWidthMm, tableHeightMm, normalizeTable } from "@/lib/table/tableModel";

const HUB_BLUE = "#4da3ff";

type Anchor = { fx: number; fy: number; key: string };

const CORNERS: Anchor[] = [
  { fx: 0, fy: 0, key: "tl" },
  { fx: 1, fy: 0, key: "tr" },
  { fx: 0, fy: 1, key: "bl" },
  { fx: 1, fy: 1, key: "br" },
];

export function CadTableLayer({
  app,
  projectId,
  toolActive,
  selectedId,
  setSelectedId,
}: {
  app: any;
  projectId: string;
  toolActive: boolean;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const ctx = React.useContext(TableEditContext);
  const editId = ctx?.editId ?? null;
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [sheetId, setSheetId] = React.useState<string>(() => (app?.activeSheetId as string) || "default");
  const [anchor, setAnchor] = React.useState<Anchor | null>(null);
  const [hubMode, setHubMode] = React.useState<null | "move" | "rotate">(null);
  const [preview, setPreview] = React.useState<{ dx: number; dy: number; deg: number }>({ dx: 0, dy: 0, deg: 0 });
  const hostRef = React.useRef<HTMLDivElement | null>(null);

  // Store-Änderungen + Kamera-Bewegung (Pan/Zoom) → Overlay neu positionieren.
  React.useEffect(() => cadTableStore.subscribe(force), []);
  React.useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      const cam = app?.camera;
      const sid = (app?.activeSheetId as string) || "default";
      if (cam) {
        const sig = `${cam.scale}|${cam.offsetX}|${cam.offsetY}|${sid}`;
        if (sig !== last) { last = sig; force(); }
      }
      if (sid !== sheetId) setSheetId(sid);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [app, sheetId]);

  /** Maßstabsnenner des aktiven Blatts (Papier-mm ↔ Welt-Meter). */
  const scaleDen = React.useMemo(() => {
    try {
      const sheets = app?.sheetManager?.toJSON?.() ?? [];
      const s = sheets.find((x: any) => x.id === sheetId);
      const v = typeof s?.scaleValue === "number" ? s.scaleValue : parseFloat(String(s?.scaleKey ?? "").split(":")[1]);
      return Number.isFinite(v) && v > 0 ? v : 100;
    } catch { return 100; }
  }, [app, sheetId]);

  const tables = cadTableStore.list(projectId, sheetId);
  const cam = app?.camera;
  const pxPerMm = cam ? (cam.scale * scaleDen) / 1000 : 0;

  const patch = React.useCallback((id: string, p: Partial<CadTableElement>) => {
    cadTableStore.patch(projectId, sheetId, id, p);
  }, [projectId, sheetId]);

  // ── Tabelle anlegen ──────────────────────────────────────────────────────
  const createAt = (clientX: number, clientY: number) => {
    const host = hostRef.current;
    if (!host || !cam) return;
    const r = host.getBoundingClientRect();
    const w = cam.screenToWorld(clientX - r.left, clientY - r.top);
    const data = createTableData(ctx?.newCols ?? 3, ctx?.newRows ?? 4);
    const model = normalizeTable(data);
    const id = `ctab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    cadTableStore.add(projectId, sheetId, {
      id, kind: "table" as any,
      x: 0, y: 0, w: 0, h: 0,
      xM: w.x, yM: w.y,
      rotation: 0,
      wMm: tableWidthMm(model),
      hMm: tableHeightMm(model),
      tableData: data as any,
    } as CadTableElement);
    setSelectedId(id);
    setAnchor(null);
  };

  // ── HUB: Verschieben / Drehen ────────────────────────────────────────────
  React.useEffect(() => {
    if (!hubMode || !selectedId) return;
    const el = tables.find((t) => t.id === selectedId);
    const host = hostRef.current;
    if (!el || !host || !cam) return;
    const a = anchor ?? { fx: 0, fy: 0, key: "tl" };
    const wPx = (el.wMm ?? 0) * pxPerMm;
    const hPx = (el.hMm ?? 0) * pxPerMm;
    const base = cam.worldToScreen(el.xM, el.yM);
    const pivot = { x: base.x + a.fx * wPx, y: base.y + a.fy * hPx };
    let start: { x: number; y: number } | null = null;
    const startRot = el.rotation ?? 0;

    const rectOf = () => host.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => {
      const r = rectOf();
      const px = ev.clientX - r.left;
      const py = ev.clientY - r.top;
      if (!start) start = { x: px, y: py };
      if (hubMode === "move") {
        setPreview({ dx: px - start.x, dy: py - start.y, deg: 0 });
      } else {
        const a0 = Math.atan2(start.y - pivot.y, start.x - pivot.x);
        const a1 = Math.atan2(py - pivot.y, px - pivot.x);
        let deg = ((a1 - a0) * 180) / Math.PI;
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
        setPreview({ dx: 0, dy: 0, deg });
      }
    };
    const commit = () => {
      if (hubMode === "move") {
        const p0 = cam.screenToWorld(0, 0);
        const p1 = cam.screenToWorld(preview.dx, preview.dy);
        patch(el.id, { xM: el.xM + (p1.x - p0.x), yM: el.yM + (p1.y - p0.y) });
      } else if (preview.deg) {
        patch(el.id, { rotation: startRot + preview.deg });
      }
      setHubMode(null);
      setPreview({ dx: 0, dy: 0, deg: 0 });
    };
    const onDown = (ev: PointerEvent) => { ev.preventDefault(); ev.stopPropagation(); commit(); };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Enter") { ev.preventDefault(); commit(); }
      else if (ev.key === "Escape" || ev.key === "Delete") {
        ev.preventDefault();
        setHubMode(null);
        setPreview({ dx: 0, dy: 0, deg: 0 });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [hubMode, selectedId, anchor, preview.dx, preview.dy, preview.deg, tables, cam, pxPerMm, patch]);

  // Entf löscht die ausgewählte Tabelle (nicht im Tabellenmodus).
  React.useEffect(() => {
    if (!selectedId || editId) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Delete") return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (hubMode) return;
      ev.preventDefault();
      cadTableStore.remove(projectId, sheetId, selectedId);
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, editId, hubMode, projectId, sheetId, setSelectedId]);

  if (!cam) return null;

  return (
    <div ref={hostRef} className="absolute inset-0" style={{ pointerEvents: "none", zIndex: 20 }}>
      {/* Aufnahmefläche für neue Tabellen (nur bei aktivem Werkzeug). */}
      {toolActive && !editId && !hubMode && (
        <div
          className="absolute inset-0"
          style={{ pointerEvents: "auto", cursor: "crosshair" }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            if (selectedId) { setSelectedId(null); setAnchor(null); return; }
            createAt(e.clientX, e.clientY);
          }}
        />
      )}

      {tables.map((el) => {
        const selected = el.id === selectedId;
        const editing = el.id === editId;
        const p = cam.worldToScreen(el.xM, el.yM);
        const wPx = Math.max(1, (el.wMm ?? 0) * pxPerMm);
        const hPx = Math.max(1, (el.hMm ?? 0) * pxPerMm);
        const a = anchor ?? { fx: 0, fy: 0, key: "tl" };
        const previewTransform = hubMode === "move"
          ? `translate(${preview.dx}px, ${preview.dy}px)`
          : hubMode === "rotate"
            ? `rotate(${preview.deg}deg)`
            : "";
        const originX = hubMode === "rotate" ? `${a.fx * 100}%` : "0 0";
        return (
          <div
            key={el.id}
            className="absolute"
            style={{
              left: p.x,
              top: p.y,
              width: wPx,
              height: hPx,
              transform: `rotate(${el.rotation ?? 0}deg) ${selected ? previewTransform : ""}`,
              transformOrigin: hubMode === "rotate" && selected ? `${a.fx * 100}% ${a.fy * 100}%` : "0 0",
              pointerEvents: (toolActive || selected || editing) ? "auto" : "none",
              outline: selected || editing ? `1px solid ${HUB_BLUE}` : "none",
              background: "#ffffff",
              opacity: hubMode && selected ? 0.85 : 1,
            }}
            onPointerDown={(e) => {
              if (editing || hubMode) return;
              e.stopPropagation();
              setSelectedId(el.id);
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const fx = (e.clientX - r.left) / Math.max(1, r.width);
              const fy = (e.clientY - r.top) / Math.max(1, r.height);
              let best = CORNERS[0]; let bd = Infinity;
              for (const c of CORNERS) {
                const d = (c.fx - fx) ** 2 + (c.fy - fy) ** 2;
                if (d < bd) { bd = d; best = c; }
              }
              // Fangpunkt nur übernehmen, wenn nahe genug an der Ecke.
              setAnchor(Math.sqrt(bd) < 0.25 ? best : null);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setSelectedId(el.id);
              ctx?.setEditId(el.id);
              ctx?.setSelection({ r1: 0, c1: 0, r2: 0, c2: 0 });
            }}
          >
            <div style={{ width: "100%", height: "100%", pointerEvents: editing ? "auto" : "none" }}>
              <TableElementView
                element={el as any}
                editing={editing}
                onChange={(pp) => patch(el.id, pp as any)}
                onExitEdit={() => ctx?.setEditId(null)}
              />
            </div>

            {/* Fangpunkte — im Tabellenmodus sichtbar, aber nicht bedienbar. */}
            {(selected || editing) && CORNERS.map((c) => (
              <div
                key={c.key}
                className="absolute"
                style={{
                  left: `calc(${c.fx * 100}% - 4px)`,
                  top: `calc(${c.fy * 100}% - 4px)`,
                  width: 8, height: 8,
                  background: anchor?.key === c.key && !editing ? HUB_BLUE : "#fff",
                  border: `1.5px solid ${HUB_BLUE}`,
                  borderRadius: 2,
                  pointerEvents: editing || hubMode ? "none" : "auto",
                  cursor: "pointer",
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSelectedId(el.id);
                  setAnchor(c);
                }}
              />
            ))}

            {/* HUB: Verschieben / Drehen am gewählten Fangpunkt. */}
            {selected && !editing && anchor && !hubMode && (
              <div
                data-hub-control="true"
                className="absolute flex items-center gap-1 rounded-md shadow-md"
                style={{
                  left: `calc(${anchor.fx * 100}% + 10px)`,
                  top: `calc(${anchor.fy * 100}% + 10px)`,
                  background: "hsl(var(--surface-card))",
                  border: "1px solid hsl(var(--hairline))",
                  padding: 3,
                  pointerEvents: "auto",
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  title="Verschieben"
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted"
                  onClick={() => { setPreview({ dx: 0, dy: 0, deg: 0 }); setHubMode("move"); }}
                ><Move size={13} /></button>
                <button
                  type="button"
                  title="Drehen"
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted"
                  onClick={() => { setPreview({ dx: 0, dy: 0, deg: 0 }); setHubMode("rotate"); }}
                ><RotateCw size={13} /></button>
              </div>
            )}
            {void originX}
          </div>
        );
      })}
    </div>
  );
}

export default CadTableLayer;
