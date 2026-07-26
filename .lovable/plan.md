## Ziel
Bezeichnungs-ID-Panel identisch zur CAD-Oberfläche in der Projektmappe wiederherstellen. **CAD-Blätter UND Dokumente (PDF/Bild)** darüber zuordbar machen. Andere Werkzeuge (Linie, Schraffur, Text) bleiben nachweislich weiter angebunden.

## Bestandsaufnahme (bereits geprüft)
- `engine.activeDrawLabelId` existiert und wird bereits beim Import gesetzt: `handleDocumentFileChange` → `engine.scene.createDocument({ …, labelId: engine.activeDrawLabelId })` (`ProjectWorkspace.tsx:591`). Neue Linien / Text / Schraffuren aus dem CAD-Overlay verwenden denselben Default — die Anbindung ist bereits vorhanden.
- `CadIdPanelHost` mountet das imperative Engine-`IdPanel` (Anlegen / Umbenennen / Sichtbarkeit / Reihenfolge / Löschen). In der aktuellen Version wurde es aus dem Layers-Tab entfernt — das ist der eigentliche Regress.
- `PageElement` (workspace-native, u. a. `cad-viewport`) hat kein `labelId`; das zuletzt eingeführte `layerName`-Freitextfeld ersetzt die Panel-Integration nicht.

## Umsetzung

### 1. Panel wiederherstellen (identisch zur CAD-Oberfläche)
- Import und Mount von `<CadIdPanelHost engine={engine} />` im Layers-Tab / `RightInspector` von `src/pages/ProjectWorkspace.tsx` reaktivieren. Dieselben imperativen Handles wie im CAD-Editor — keine parallele UI, keine Duplikation.

### 2. „Bez.-ID"-Freitextfeld entfernen
- Das kürzlich hinzugefügte Text-Input im CAD-Blatt-Inspector (~Zeile 5407) wird ersatzlos entfernt. `layerName` wird nicht mehr geschrieben (bleibt lesbarer Legacy-Fallback für ältere Projekte).

### 3. CAD-Blatt einer Bezeichnungs-ID zuordnen
- `PageElement` erhält Feld `labelId?: string` in `src/lib/projectStore.ts`.
- Im CAD-Blatt-Inspector unterhalb der Maßstabs-Zeile: **Dropdown „ID"**, Quelle `engine.labelManager.list()`. Auswahl → `projectStore.updateElement(..., { labelId })`. Default beim Anlegen: `Defaults.defaultLabelId`.
- `ElementView` blendet CAD-Blatt aus, wenn `!engine.labelManager.isVisible(el.labelId)` — konsistent mit Engine-Sichtbarkeit.

### 4. Dokumente (PDF / JPG / PNG) einer Bezeichnungs-ID zuordnen
- **Neuimporte**: bleiben wie bisher an `activeDrawLabelId` gebunden (`createDocument({ labelId })`) — kein Codepfad-Wechsel nötig.
- **Nachträgliche Zuordnung**: gleiches Dropdown „ID" wird im **Dokumenten-Werkzeug-Inspector** unter dem Maßstabsfeld ergänzt. Auswahl ruft eine Engine-API auf, die `labelId` auf dem existierenden `DocElement` in der Engine-Szene setzt (`engine.scene.setDocumentLabel(docId, labelId)` — falls nicht vorhanden, minimaler Wrapper hinzufügen, der die vorhandene `labelId`-Property des DocElements schreibt und `engine.refreshLabelUI()` / Redraw auslöst). Sichtbarkeit ergibt sich automatisch aus der Engine-Layer-Logik.

### 5. Linie / Schraffur / Text — Verifikation (kein Codeeingriff geplant)
- Diese Werkzeuge erzeugen Engine-Primitive. Vor Abschluss wird per Suche (`rg -n "createSegment|createHatch|createTextBox" src/cad`) und Blick in die jeweiligen Create-Pfade bestätigt, dass sie weiterhin `labelId: this.activeDrawLabelId ?? Defaults.defaultLabelId` setzen und `engine.refreshLabelUI()` triggern. Falls ein Pfad das nicht tut → in derselben Runde nachziehen (kleiner, gezielter Fix, keine breite Refaktorierung).

## Nicht enthalten
- Workspace-native Elemente ohne Engine-Repräsentation (z. B. `note`, `table`, `shape`, `timeline`) — diese hängen nicht am Engine-Layer-System und werden hier nicht angefasst.

## Technische Details
- Dateien:
  - `src/pages/ProjectWorkspace.tsx`: `CadIdPanelHost`-Mount, CAD-Blatt-Inspector-Block (Freitext raus, Dropdown rein), Dokument-Inspector-Block (Dropdown rein), Render-Filter in `ElementView` für Sichtbarkeit.
  - `src/lib/projectStore.ts`: optionales Feld `labelId?: string` auf `PageElement`.
  - ggf. `src/cad/embed/MiniCad.ts` (oder Scene-API): kleiner Setter für Dokument-`labelId` inkl. UI-Refresh, falls noch nicht vorhanden.
