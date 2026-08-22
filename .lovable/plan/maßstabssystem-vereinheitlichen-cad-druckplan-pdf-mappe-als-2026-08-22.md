# Maßstabssystem vereinheitlichen (CAD → Druckplan → PDF, Mappe als Referenz)

## Ursachenanalyse (Ist-Zustand)

**1. Doppelte Maßstabs-Semantik am CAD-Blatt**
- `SheetManager.ts` hält weiterhin `scaleKey: "1:100"` / `scaleValue: 100` als Default für jedes Blatt (Konstruktor, `createSheet`, `toJSON`, `restore`), inklusive `SheetScales`-Liste und `setScale()`.
- `SheetPanel.ts` zeigt dagegen bereits korrekt „Blatt · 1:1“ und hat die Maßstabs-Auswahl entfernt.
- `PlanController._sheetScaleValue()` liest genau diese Altfelder und schreibt sie in `projection.scale`. Ein als 1:1 angezeigtes Blatt landet daher faktisch als 1:100 auf dem Druckplan.

**2. Kein Maßstab beim Einfügen wählbar**
- `createProjectionFromSheet()` setzt den Maßstab still aus dem Sheet, ohne Abfrage. Es gibt keinen Dialog beim Drop.

**3. Maßstab nachträglich nicht änderbar**
- `PlanPanel.ts` enthält keinerlei Maßstabsfeld; `Projection.scale` ist nur über den Export-Dialog erreichbar.

**4. PDF-Export verändert das Dokumentmodell**
- `CadApp.printSelectedPlans()` fragt über `PlanExportScaleDialog.askExportScale()` einen globalen Maßstab ab und **überschreibt** damit `pr.scale` aller Projektionen, inkl. History-Snapshot. Damit sind gemischte Maßstäbe (Grundriss 1:100 + Detail 1:10) auf einem Plan unmöglich, und Export ist eine Modelländerung.
- Die reine mm→pt-Rechnung in `PlanPdfExport.ts` (`MM_TO_PT = 72/25.4`, Seitengröße = Papierformat) ist bereits korrekt und bleibt.

**5. Verstreute Umrechnung**
- `sheetToPlanFactor()` (PlanProjections), `parseScaleDen`/`formatScale` (lib/paper.ts), `parseSheetScale` (CadPage), Inline-Rechnungen in `ProjectWorkspace.tsx` (`* scaleDen / 1000`), `CadTableLayer.tsx` — alle rechnen dasselbe unterschiedlich nach.

**6. Projektmappe (Referenz)** — mathematisch bereits korrekt:
`SceneRegionRenderer`/`CadViewportView` verwenden `modelWmm = paperWmm × scaleDen`, d. h. `paperMm = modelM × 1000 / scaleDen`. 10 m → 1:100 = 100 mm, 1:50 = 200 mm, 1:200 = 50 mm, 1:125 = 80 mm. Wird durch Tests verifiziert; **keine Architekturänderung**, nur ggf. Umstellung der Umrechnung auf die gemeinsame Utility.

## Umsetzung

### A. Kanonische Utility (`src/lib/scale.ts`)
- `normalizeScaleDen(input: string | number | null): number` (akzeptiert `100`, `"1:100"`, `"1/75"`, Komma, Fallback 100)
- `modelMetersToPaperMm(modelM, scaleDen)` = `modelM * 1000 / scaleDen`
- `paperMmToModelMeters(paperMm, scaleDen)` = `paperMm * scaleDen / 1000`
- `formatScaleLabel(den)` → `"1:100"`, `SCALE_PRESETS = [1,2,5,10,20,25,50,100,200,250,500,1000]`, `MM_TO_PT = 72/25.4`
- `paper.ts`/`parseSheetScale`/`sheetToPlanFactor` delegieren an diese Utility (keine Verhaltensänderung in der Mappe).

### B. CAD-Blatt = reiner Modellbereich
- `SheetManager`: `scaleKey`/`scaleValue` als `@deprecated` markieren, nicht mehr neu setzen; `restore()` liest Altwerte weiterhin verlustfrei (Rückwärtskompatibilität), `toJSON()` schreibt sie nur durch, wenn vorhanden. `setScale()`/`SheetScales` entfallen als Quelle für Projektionen.
- `PlanController._sheetScaleValue()` wird entfernt.

### C. Maßstab beim Einfügen wählen
- Neuer Dialog `src/cad/ScaleSelectDialog.ts` (Presets 1:1 … 1:1000 + freie Eingabe 1:N), im Pixuna-Stil des vorhandenen Dialogs.
- `createProjectionFromSheet()` wird `async` bzw. bekommt einen vorab gewählten `scaleDen`; ohne Auswahl (Abbruch) wird keine Projektion erzeugt.
- `Projection` erhält `scaleDen: number` als kanonisches Feld; `PlanManager.restore()` migriert Altdaten (`scale` → `scaleDen`), `toJSON()` schreibt beide (`scale` gespiegelt) für Abwärtskompatibilität.

### D. Maßstab nachträglich ändern
- Im Einstellungsbereich der selektierten Projektion (PlanPanel/rechtes Panel): Feld `Maßstab 1 : [100]` mit Preset-Dropdown und freier Eingabe.
- Bei Änderung: Mittelpunkt (`proj.x/y`) bleibt erhalten, Clip-Werte werden proportional mit `oldDen/newDen` mitskaliert, damit der Ausschnitt inhaltlich gleich bleibt; anschließend `invalidateCache()` + History-Snapshot.

### E. PDF-Export ohne Nebenwirkung
- `askExportScale`-Aufruf und die `pr.scale`-Überschreibung in `CadApp.printSelectedPlans()` entfallen ersatzlos; `PlanExportScaleDialog.ts` wird gelöscht.
- `exportPlansToPdf` bleibt read-only: Seite = Papierformat in mm × 72/25.4, jede Projektion mit ihrem eigenen `scaleDen`.

### F. Projektmappe
- Nur Verifikation + Anbindung an die gemeinsame Utility. Einfügen eines CAD-Blatts übernimmt weiterhin den gewählten `scaleDen`, der Maßstab bleibt im Inspector frei änderbar.

## Tests (mathematisch, nicht optisch)
Neue Datei `src/lib/scale.test.ts` und `src/cad/planScale.test.ts`:
- 10,000 m Linie → `modelMetersToPaperMm`: 1:50 = 200 mm, 1:100 = 100 mm, 1:200 = 50 mm, 1:500 = 20 mm, 1:125 = 80 mm
- Round-Trip `paperMmToModelMeters(modelMetersToPaperMm(x, d), d) === x`
- Projektionslayout: BBox-Breite einer 10-m-Linie in Plan-mm entspricht bei 1:100 exakt 100 mm (+ Padding separat geprüft)
- PDF-Punkte: 297 mm → 841,89 pt (A3-Breite), 420 mm → 1190,55 pt
- Mappe-Referenz: `SceneRegionRenderer`-Formel `modelWm = paperWmm × scaleDen / 1000` für dieselben Werte
- Migration: alte Projektion mit `scale: 100` und ohne `scaleDen` lädt als `scaleDen: 100`; Export verändert `scaleDen` nicht (Snapshot-Vergleich vor/nach `exportPlansToPdf`)

Zusätzlich: TypeScript-Check und Produktions-Build.

## Nicht betroffen
Kamera-Zoom, Bildschirm-DPI, Rendering-Auflösung (`RENDER_PX_PER_MM`) bleiben reine Darstellungsgrößen ohne Einfluss auf den Maßstab. Modellgeometrie wird nirgends verändert.
