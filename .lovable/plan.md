## 1) CAD-Oberfläche: Druckmodus wieder in Reiter „Zeichenblätter" + Export öffnet ihn

**`src/components/CadEditor.tsx`**
- Den heute separaten „Druckmodus"-`<aside>` (~Z. 2998–3055) auflösen. Sein Inhalt (Panel „Druckpläne" mit `planPanelRef`/`planListRef`/`planAddBtnRef`/`planPrintBtnRef`) unter das bestehende Blatt-Panel im `rightTab === "sheets"`-Container einhängen (dort wo aktuell der Kommentar „Druckpläne wurden in den Druckmodus verschoben" steht, Z. ~2962).
- `printOpen`-State + zugehörige `display: none`-Trickserei entfernen; damit rendern die Refs weiter stabil im DOM des Sheets-Tabs.
- `openExportPanel` (Z. 202) so ändern, dass es (a) das rechte Panel öffnet (`setRightOpen(true)`), (b) auf `rightTab = "sheets"` schaltet und (c) das Druckpläne-Panel im Sheets-Tab öffnet — z.B. per programmatischem Klick auf `planToggleBtnRef` falls es zugeklappt ist, plus Autoscroll dorthin.

Ergebnis: Sheets-Tab enthält oben „Zeichenblätter" (unverändert) und darunter wieder „Druckpläne"; der Kopf-Button „Exportieren" springt genau in diese Sektion.

## 2) Maßstab strikt 1:1 außer im Druckmodus

**a) CAD-Oberfläche unten links („M 1:x")** — `src/components/CadEditor.tsx`
- Den kompletten „Drawing Scale Drop-Up"-Block (Z. ~1594–1673) entfernen inkl. States `drawingScale`, `drawingScaleOpen`, `drawingScaleCustom` und ihrer Effects (Z. 289–291, 757–775, 878–894).
- `app.drawingScale = 1` fix setzen (einmalig nach App-Init).
- Wo `drawingScale` heute Defaults für den PDF-Import-Dialog liefert (Z. 878/880/894), stattdessen `"1"` verwenden.

**b) Import-Maßstab-Dialog beim PDF-Import** — `src/components/CadEditor.tsx` (Z. 285–288, 917–947, 1096–1140) und `src/pages/ProjectWorkspace.tsx` (Z. 1595–1626, 428–…)
- Dialog bleibt bestehen — Maßstab beschreibt hier den *Quellplan*, nicht die Zeichenoberfläche. Kein UI-Text mehr, der den Eindruck erweckt, die CAD-Oberfläche habe einen Maßstab. Nur Beschriftung „In welchem Maßstab liegt der Plan vor?" (bereits vorhanden) beibehalten.

**c) „Zeichnungs-ID"-Panel** — `src/cad/IdPanel.ts`
- Falls dort ein Maßstabs-Eingabefeld existiert (im JSX-artigen DOM-Aufbau), entfernen und intern konstant 1:1 verwenden. (Aus der Suche kein Treffer — wenn kein Feld vorhanden ist, nichts zu tun; ID bleibt implizit 1:1.)

**d) CAD-Blatt-Werkzeug in Projektmappe: Anker raus, Maßstab nachträglich einstellbar**
- `src/components/page/CadDocumentInspector.tsx`: „Anker +/−"-Zeile aus dem Inspector entfernen; nur Darstellung (Filter ohne Hintergrund entfernen) bleibt.
- `src/cad/DocumentTool.ts`: Anker-Bearbeitungsphasen bleiben aufrufbar für Alt-Codepfade, werden aber aus der UI nicht mehr angetriggert.
- `ElementInspector` für `element.kind === "cad-view"` in `src/pages/ProjectWorkspace.tsx` (rechte Einstellungen, Z. ~4200–4260): Feld „Maßstab" hier wieder anzeigen (Auswahl `1:1, 1:20, 1:50, 1:100, 1:200, 1:1000, 1:2000, frei…`) statt einfacher Text-Input. Änderung schreibt weiter `el.scale` und triggert Re-Skalierung des `cad-view`-Elements auf der Seite anhand des ursprünglichen Papiermaßes.

**e) Maßstab-Abfrage beim Absetzen im „Plan"/Druckmodus**
- Beim Reinziehen eines Zeichenblatts in einen Plan (`CadToolSection` `handleInsert` in `src/pages/ProjectWorkspace.tsx` Z. ~4047–4060 bzw. Pickup in `useEffect` Z. ~428) einen kleinen Dialog vorschalten mit den Optionen `1:1, 1:20, 1:50, 1:100, 1:200, 1:1000, 1:2000, frei…`. Ergebnis wird als `el.scale` gespeichert und beeinflusst die Elementgröße auf der Seite (`w/h`-Berechnung analog vorhandener `paperWmm * scale`-Logik).
- Gleiche Abfrage im Druckmodus (`WorkspaceHeader → Exportieren` / `PrintPlan`-Overlay Z. ~1414) beim Ablegen eines Blatts in den Plan.

## 3) Projektmappe: Freihand nachträglich bearbeiten wie Linie

Freihand-Striche liegen aktuell in der eingebetteten CAD-Overlay-Szene (`CadOverlayLayer` → `FreeDrawTool.createFreeStroke`), Linien dagegen als `PageElement { kind: "line", points[] }` in der React-Schicht — deshalb funktioniert „nachträglich bearbeiten" (Verschieben, Punkte ziehen, Löschen per Inspector) nur bei Linien.

Vorgehen:
- `SelectTool` im Overlay so erweitern, dass FreeStrokes anklickbar sind → Selektion sichtbar (Bounding-Box + Punkt-Handles), Drag verschiebt den ganzen Stroke, Punkt-Handles verschieben einzelne Kontrollpunkte, Entf/Backspace löscht.
- Das bestehende Muster von `LineTool`-Selektion (Punkt-Editor `PointEditMenu`, Hub) analog auf FreeStrokes anwenden. Betroffen: `src/cad/SelectTool.ts`, `src/cad/Scene.ts` (Update-/Move-API für FreeStroke wie bei Line), `src/cad/PointEditMenu.ts` (Freischalten für FreeStroke-Selektion), `src/cad/Renderer.ts` (Handles zeichnen).
- Rechte Einstellungsspalte: `settingsTool === "free"` (Z. 3496) wird beim Selektieren einer Freihand-Linie so bedient wie bei Linien — d.h. der bestehende `FreeDrawSettingsPanel` zeigt/ändert die Attribute (Farbe, Stärke, Transparenz, Stil) *der Selektion* statt nur der Default-Werkzeugwerte.
- Delete-Verhalten am Kopf (`onCanDeleteChange`) auch für Freihand-Selektion melden.

### Technische Details

- **Druckmodus-Umzug:** IDs der bestehenden Refs (`planPanelRef` etc.) und die native DOM-Erzeugung durch `PlanPanel.ts` bleiben unverändert; nur der umgebende Container wechselt.
- **Maßstab-Auswahl-Set:** `["1:1","1:20","1:50","1:100","1:200","1:1000","1:2000","frei"]` mit `frei` → Freitext `1 : n`. Zentral in einer Konstante `PAGE_PLAN_SCALES` unter `src/lib/projectStore.ts` oder neuer Datei.
- **Freihand-Editing:** FreeStroke besitzt bereits `points[]`; Move/Update-API in `Scene.ts` einführen (`moveFreeStrokeBy`, `updateFreeStrokePoint`, `deleteFreeStroke`, `updateFreeStrokeStyle`). Undo/Redo läuft über bestehendes `HistoryManager`-Muster.

## Betroffene Dateien

- `src/components/CadEditor.tsx` (Druckmodus-Umzug, Drawing-Scale-Entfernung, Export-Sprung)
- `src/cad/IdPanel.ts` (falls Maßstabs-Feld vorhanden)
- `src/pages/ProjectWorkspace.tsx` (cad-view Inspector, Scale-Dialog beim Ablegen, Druckmodus-Drop)
- `src/components/page/CadDocumentInspector.tsx` (Anker raus)
- `src/cad/DocumentTool.ts` (Anker-Trigger)
- `src/cad/SelectTool.ts`, `src/cad/Scene.ts`, `src/cad/Renderer.ts`, `src/cad/PointEditMenu.ts` (Freihand-Editing)
- ggf. `src/components/cad/FreeDrawSettingsPanel.tsx` (Anbindung an Selektion)
