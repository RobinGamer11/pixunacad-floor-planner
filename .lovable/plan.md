## Ziel

„CAD-Blatt einfügen" komplett aus dem Dokument-Werkzeug ins CAD-Blatt-Werkzeug verschieben, dessen rechtes Einstellungsfenster auf „Darstellung" reduzieren und den Maßstab prüfen.

## 1) CAD-Blatt einfügen verschieben

**Aus `DocumentToolSettings` entfernen** (`src/pages/ProjectWorkspace.tsx`, Zeilen 3612–3671):
- gesamten Block „CAD-Blatt einfügen" (Dropdown mit Blattliste + Buttons „Ansicht"/„Rahmen") löschen
- Dokument-Werkzeug bleibt sonst 1:1 unverändert (nur „Datei importieren" + Hinweistext)

**In `CadToolSection` einbauen** (Zeilen 4075–4237, linker Panel wenn Werkzeug „CAD-Blatt" aktiv):
- neuer Abschnitt „CAD-BLATT ALS PDF EINFÜGEN" (oder als zweite Aktion neben „ZEICHENBLATT WÄHLEN")
- gleiche Bedienung wie bisher: Blatt auswählen → Buttons `Ansicht` / `Rahmen` → `navigate('/project/:id/cad?sheetPdf=<id>&mode=<...>')`
- die vorhandenen Aufnehmer-Logik in `CadPage.tsx` + `sessionStorage`-Pickup in `ProjectWorkspace` bleiben unverändert

**Import-Cleanup:** `Compass`-Import in `DocumentToolSettings` entfernen falls dort nicht mehr benötigt.

## 2) Rechtes Einstellungsfenster für CAD-Blatt-Werkzeug auf „Darstellung" reduzieren

Betrifft den `ElementInspector` (Zeilen ~4239–4430) im Fall `element.kind === "cad-view"`:
- **behalten:** Zeile „Transparenz" (= Darstellung), plus Titel/Thumbnail
- **entfernen:** Position (X/Y), Größe (B/H), Maßstab-Eingabe, „Im CAD öffnen"-Button, „Element löschen"-Button (Löschen läuft ohnehin über den Papierkorb im Kopf + Entf-Taste)
- Rotation-/Ebene-/Snap-Rows (falls für cad-view sichtbar) ebenfalls raus

Der linke `CadToolSection`-Panel („Zeichenblatt wählen" + Liste „Auf dieser Seite") bleibt, weil er die eigentliche Werkzeug-Bedienung ist.

## 3) Maßstab prüfen

Aktuelle Rechnung in `CadPage.confirmSheetPdf`:

```text
worldMeter = cssPixel / cameraScale        // camScale = CSS-px pro Welt-m
paperMm    = worldMeter * 1000 / scaleZahl // z.B. 5 m @ 1:100 → 50 mm
```

Für 1:100 → 1 cm Papier = 1 m real ✓ (deckt sich mit deiner Erläuterung).

Zu verifizieren / ggf. korrigieren:
- **PDF-Import-Pipeline in Projektmappe:** sicherstellen, dass das erzeugte PDF mit seiner physischen Seitengröße (mm über `MM_TO_PT` in `canvasRegionToPdfBytes`) importiert wird — nicht mit 96 DPI-Bitmap-Interpretation. Falls `importFile` PDFs generell mit 72 pt = 1 pt/px behandelt, greifen wir für den Sheet-PDF-Pfad direkt auf `paperWmm`/`paperHmm` zurück und setzen die Element-Breite/Höhe des importierten Elements explizit (`w = paperWmm/10 cm`, `h = paperHmm/10 cm`) über `projectStore.updateElement` beim Pickup in `ProjectWorkspace`.
- **Testfall:** 1:100-Blatt, Rahmen um bekannte 5 m-Wand → im Projektsheet soll die eingefügte PDF exakt 5,0 cm breit sein. Falls die Messung abweicht, wird die Elementgröße beim Pickup korrigiert.

## Betroffene Dateien

- `src/pages/ProjectWorkspace.tsx` (nur Umbau der beiden Panels + optional Größenkorrektur beim Pickup)

Keine Änderungen an `sheetPdfExport.ts`, `CadPage.tsx` oder `WorkspaceHeader.tsx` nötig.
