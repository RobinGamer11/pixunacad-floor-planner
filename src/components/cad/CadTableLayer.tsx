/**
 * CadTableLayer — Platzierung und Zellbearbeitung nativer CAD-Tabellenobjekte.
 *
 * Die Tabelle selbst ist ein echtes Szenenobjekt (`Scene.TableObject`):
 * Auswahl, HUB, Verschieben, Drehen, Skalieren, Fangpunkte, Ebenen, Undo/Redo
 * und Serialisierung laufen vollständig über die bestehende CAD-Engine.
 * Diese Komponente liefert nur zwei DOM-Aufgaben, die der Canvas nicht kann:
 *
 *  1. Platzierung: Klick mit aktivem Tabellenwerkzeug erzeugt das Szenenobjekt.
 *  2. Zellmodus: Doppelklick öffnet ein Eingabe-Overlay (wie `TextEditorOverlay`
 *     beim Textwerkzeug), das exakt die Tabellenansicht der Projektmappe nutzt.
 */
import React from "react";
import { TableElementView } from "@/components/page/TableElementView";
import { TableEditContext } from "@/components/page/TableElementView";
import { cadTableStore } from "@/lib/cadTableStore";
import { ANNOTATION_M_PER_MM } from "@/cad/textTypography";
import {
  createTableData,
  normalizeTable,
  tableHeightMm,
  tableWidthMm,
} from "@/lib/table/tableModel";

export function CadTableLayer({
  app,
  projectId,
  selectedId,
  setSelectedId,
}: {
  app: any;
  projectId: string;
  toolActive?: boolean;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const ctx = React.useContext(TableEditContext);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [editId, setEditId] = React.useState<string | null>(null);
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const sheetId: string = (app?.activeSheetId as string) || "default";

  // Zellmodus wird von der Engine gesteuert (Doppelklick im Auswahlwerkzeug).
  React.useEffect(() => {
    if (!app?.onTableEditChange) return;
    setEditId(app.tableEditId ?? null);
    return app.onTableEditChange((id: string | null) => {
      setEditId(id);
      ctx?.setEditId(id);
    });
  }, [app, ctx]);

  /** Aktuelle Zelle committen und den Zellmodus über die Engine beenden. */
  const exitEdit = React.useCallback(() => {
    try {
      const ae = document.activeElement as HTMLElement | null;
      if (ae && typeof ae.blur === "function") ae.blur();
    } catch { /* noop */ }
    app?.endTableEdit?.();
  }, [app]);

  // Zuverlässiger Außen-Exit: Ein Pointerdown irgendwo außerhalb des
  // Bearbeitungs-Overlays (freie CAD-Fläche, anderes Objekt, Werkzeugleiste)
  // beendet den Zellmodus sofort. Klicks INNERHALB der Tabelle bleiben
  // unberührt. ESC wird zusätzlich von der Engine behandelt.
  React.useEffect(() => {
    if (!editId) return;
    const onDown = (ev: PointerEvent) => {
      const host = hostRef.current;
      const t = ev.target as Node | null;
      if (host && t && host.contains(t)) return;
      exitEdit();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") exitEdit();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [editId, exitEdit]);


  // Auswahl/Kamera beobachten → Overlay-Position und Panel aktualisieren.
  React.useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      const cam = app?.camera;
      const sel: any = app?.selection;
      const selTable = sel?.textBoxId && app?.scene?.getTableById?.(sel.textBoxId)
        ? sel.textBoxId
        : null;
      const sig = `${cam?.scale}|${cam?.offsetX}|${cam?.offsetY}|${selTable}|${app?.tableEditId}`;
      if (sig !== last) {
        last = sig;
        setSelectedId(selTable);
        force();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [app, setSelectedId]);

  // Einmalige Migration alter Overlay-Tabellen in die Szene.
  React.useEffect(() => {
    if (!app?.scene?.createTable) return;
    const old = cadTableStore.list(projectId, sheetId);
    if (!old.length) return;
    for (const el of old) {
      const model = normalizeTable(el.tableData as any);
      const wM = tableWidthMm(model) * ANNOTATION_M_PER_MM;
      const hM = tableHeightMm(model) * ANNOTATION_M_PER_MM;
      app.scene.createTable(
        { x: (el as any).xM + wM / 2, y: (el as any).yM - hM / 2 },
        el.tableData,
        ANNOTATION_M_PER_MM,
        { rotationRad: ((el.rotation ?? 0) * Math.PI) / 180, labelId: app.activeDrawLabelId },
      );
      cadTableStore.remove(projectId, sheetId, el.id);
    }
    app.renderer?.render?.();
  }, [app, projectId, sheetId]);

  const cam = app?.camera;
  const table = editId ? app?.scene?.getTableById?.(editId) : null;
  if (!cam) return null;

  // Overlay-Geometrie der bearbeiteten Tabelle (Bildschirmpixel).
  let box: { left: number; top: number; w: number; h: number; deg: number } | null = null;
  if (table) {
    const model = normalizeTable(table.data);
    const pxPerMm = table.mPerMm * (table.scale || 1) * cam.scale;
    const wPx = tableWidthMm(model) * pxPerMm;
    const hPx = tableHeightMm(model) * pxPerMm;
    const cs = cam.worldToScreen(table.center.x, table.center.y);
    box = {
      left: cs.x - wPx / 2,
      top: cs.y - hPx / 2,
      w: Math.max(1, wPx),
      h: Math.max(1, hPx),
      deg: ((table.rotationRad || 0) * 180) / Math.PI,
    };
  }

  return (
    <div ref={hostRef} className="absolute inset-0" style={{ pointerEvents: "none", zIndex: 20 }}>


      {table && box && (
        <div
          className="absolute"
          style={{
            left: box.left,
            top: box.top,
            width: box.w,
            height: box.h,
            transform: `rotate(${box.deg}deg)`,
            transformOrigin: "50% 50%",
            pointerEvents: "auto",
            outline: "1px solid #4da3ff",
            background: "#ffffff",
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <TableElementView
            element={{
              id: table.id,
              kind: "table",
              wMm: tableWidthMm(normalizeTable(table.data)),
              hMm: tableHeightMm(normalizeTable(table.data)),
              tableData: table.data,
            } as any}
            editing
            onChange={(patch: any) => {
              if (patch?.tableData) table.setData(patch.tableData);
              app.renderer?.render?.();
              force();
            }}
            onExitEdit={() => app.endTableEdit?.()}
          />
        </div>
      )}
    </div>
  );
}
