/**
 * TableTool — Platzierung nativer CAD-Tabellenobjekte über die normale
 * Werkzeug-/Input-Logik der Engine (kein DOM-Overlay).
 *
 * Zoom, Pan und alle übrigen Canvas-Interaktionen bleiben dadurch aktiv.
 * Die Tabellengröße im Modellraum folgt der zentralen Annotationsskalierung
 * (`ANNOTATION_M_PER_MM`) und ist damit unabhängig vom späteren Druckmaßstab.
 */
import { SelectionType, ToolIds } from "./constants";
import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import { ANNOTATION_M_PER_MM } from "./textTypography";
import { createTableData, normalizeTable, tableWidthMm, tableHeightMm } from "@/lib/table/tableModel";

export class TableTool {
  app: CadApp;
  id = "table";
  cols = 3;
  rows = 4;

  constructor(app: CadApp) {
    this.app = app;
  }

  activate() {
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    (this.app.renderer as any).overlay = null;
  }

  cancel() {}
  finish() {}
  getCursor() { return "crosshair"; }

  update(input: Input) {
    try { this.app.canvas.style.cursor = "crosshair"; } catch { /* noop */ }
    if (!input.clicked) return;

    const data = createTableData(Math.max(1, this.cols), Math.max(1, this.rows));
    const model = normalizeTable(data);
    const wM = tableWidthMm(model) * ANNOTATION_M_PER_MM;
    const hM = tableHeightMm(model) * ANNOTATION_M_PER_MM;
    const table = (this.app.scene as any).createTable(
      { x: input.mouse.wx + wM / 2, y: input.mouse.wy - hM / 2 },
      data,
      ANNOTATION_M_PER_MM,
      { labelId: this.app.activeDrawLabelId },
    );
    this.app.setSelection({ type: SelectionType.TEXTBOX, textBoxId: table.id, handleIndex: null } as any);
    (this.app as any).pushHistory?.();
    // Nach dem Setzen zurück ins Auswahlwerkzeug — Tabelle bleibt ausgewählt.
    this.app.setTool(ToolIds.SELECT);
    this.app.renderer.render();
  }
}
