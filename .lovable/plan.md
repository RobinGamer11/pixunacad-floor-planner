## Ziel

Drei Baustellen in der Projektmappe angleichen an die CAD-Oberfläche:

1. **Werkzeug "Dokument"** — PDF-einfügen + Bild zu einem Werkzeug zusammenlegen, das intern die **echte CAD-`DocumentTool`-Pipeline** verwendet (nicht die Projektmappen-`kind: pdf/image`-Elemente).
2. **Werkzeug "CAD-Blatt"** — nach Platzierung identisches Verschieben/Skalieren/Drehen-Verhalten wie beim Dokument (nur diese drei Aktionen, kein Crop).
3. **Schraffur-Highlight** — beim Auswählen mit dem Auswahl-Tool muss die Schraffur wie im CAD blau aufleuchten.

## Umsetzung

### 1. „Dokument"-Werkzeug 1:1 aus CAD

**Toolbar / UI**
- Rail-Buttons „PDF einfügen" und „Bild" entfernen, ersetzt durch einen einzelnen Button **„Dokument"** (Icon `FileImage`, wie in `CadEditor`).
- Ein gemeinsames `<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp">`.
- Neuer `PageTool`-Wert `"document"`. Wenn aktiv, wird Datei-Dialog geöffnet; nach Import wechselt das Werkzeug in den **Platzierungs-Modus**.

**Engine-Integration (`MiniCad`)**
- `DocumentTool` aus `src/cad/DocumentTool.ts` in `MiniCad` einhängen (`this.documentTool = new DocumentTool(this as any)`), analog zu `LineTool`/`HatchTool`.
- `setActiveTool("document")` erweitert; ruft `documentTool.activate()`.
- `beginPlacement({ src, widthM, heightM, pdfSourceB64?, pdfPageIndex? })` genau wie in `CadEditor.tsx`.
- Import läuft weiterhin über `importFile()`; für PDFs mit mehreren Seiten wird pro Seite eine Platzierung angeboten (wie CAD).

**Persistenz**
- CAD-`DocumentObject`s werden bereits über `MiniCad._serialize`/`_restore` und `scene.documents` persistiert (bestehende Pipeline, wie Segments/Hatches).
- Alte Projektmappen-Elemente vom Typ `pdf`/`image` bleiben lesbar (Backwards-Compat), können aber nicht mehr neu angelegt werden.

**Nachträgliche Bearbeitung**
- SelectTool erkennt Dokumente bereits (`SelectionType.DOCUMENT`) und aktiviert den Dokument-Hub (Verschieben/Skalieren/Drehen). Der Hub wird ins Settings-Panel der Projektmappe gespiegelt.

### 2. „CAD-Blatt"-Werkzeug nachträgliche Bearbeitung

- CAD-Blatt bleibt Projektmappen-Element (`kind: "cad-view"`), da es Referenz auf ein anderes Sheet enthält.
- Bei Auswahl wird derselbe **Dokument-Hub-Style** (Ecken-Handles + Rotate) über dem Element gezeichnet — konsistente Ecken-, Kanten- und Rotations-Handles wie beim Dokument-Element. **Kein Crop**.
- Verschieben/Skalieren/Drehen wandern in die bestehende Hub-Logik (`hubKinds`-Set enthält bereits `cad-view`).

### 3. Schraffur-Highlight blau

- Root Cause: in der Projektmappe wird nach Zeichnen der Schraffur zwar `SelectionType.HATCH` gesetzt, aber `renderer.selection` wird durch die parallele Multi-Select-Liste evtl. zurückgesetzt. Fix in `MiniCad._applyPrimary`: sicherstellen, dass `renderer.setSelection(primary)` **auch bei Hatch** einen frischen Render triggert.
- Zusätzlich: bei Klick mit Auswahl-Tool auf eine Schraffur einen Render-Tick erzwingen (`this.renderer.render()`), falls kein anderes Event Repaint auslöst.

## Technische Details

- **Betroffene Dateien:**
  - `src/pages/ProjectWorkspace.tsx` — Rail-Buttons, `PageTool`-Typ, State für Placement, Settings-Panel „Dokument".
  - `src/cad/embed/MiniCad.ts` — `documentTool` einhängen, `setActiveTool("document")`, `beginPlacement`-API, Serialisierung Dokumente.
  - `src/components/page/CadOverlayLayer.tsx` — `activeTool="document"` durchreichen.
  - Neu: `src/components/cad/DocumentSettingsPanel.tsx` — spiegelt CAD-Dokument-Panel (Scale-Two-Points, Maßstab, Sperren, Alpha, Rotation reset).
- **Nicht enthalten (bewusst):** PDF-Auflösen, Hintergrund entfernen, Filter, Crop — wenn erwünscht separat als Folgeschritt.
- **Migration:** Alte `pdf`/`image`-Elemente bleiben angezeigt (Legacy-Renderpfad in `PageCanvas`), neue Importe laufen ausschließlich über die CAD-Pipeline.

## Verifikation

Playwright-Skript:
1. In Projektmappe eine PDF und ein PNG per „Dokument" importieren → Platzierungs-Cursor sichtbar → Klick → Element ist CAD-`DocumentObject`.
2. Mit Auswahl-Tool anklicken → Hub mit Ecken/Rotate erscheint, Verschieben/Skalieren/Drehen funktioniert.
3. CAD-Blatt platzieren, auswählen → identischer Hub, kein Crop-Griff.
4. Schraffur zeichnen, Auswahl-Tool → Schraffur ist blau gefüllt.
5. Reload → Zustand aller drei Elementtypen persistent.
