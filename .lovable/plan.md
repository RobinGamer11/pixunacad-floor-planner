# Vektorbasiertes PDF + "Auflösen"-Feature

## Was umgesetzt wird

### 1. Vektor-PDF auf Seite (`ProjectWorkspace`)
- **"PDF einfügen"**-Button wird verkabelt (File-Picker, Multi-Page-Auswahl).
- Neues Element `kind: "pdf"` speichert die Rohdaten der PDF-Seite (Base64) zusätzlich zur Rendervorschau.
- Neue Komponente `PdfPageView` rendert die PDF-Seite über `pdfjs-dist` auf ein `<canvas>` und **re-rendert automatisch bei Zoom-/Größenänderung** (DevicePixelRatio × Zoom × Elementgröße). Cache pro Größe; debounced.
- Element bekommt vollwertiges Verhalten: Hub-Box (vorhanden), Edge-Drag (vorhanden), Snap-Integration (vorhanden), Hilfslinien per Rechtsklick (vorhanden).

### 2. Vektor-PDF in CAD-Oberfläche
- `ImportedPage` und `DocumentObject` bekommen neues Feld `pdfSourceB64?: string` (Rohdaten der gesamten PDF-Datei, einmal pro Datei, alle Seiten teilen sich die Quelle via Modul-Cache).
- Bei `kind === "pdf-page"`-Dokumenten ersetzt der Renderer den statischen `<img>`-Pfad durch einen **adaptiven Render-Canvas**:
  - Ziel-Pixelgröße = `widthM × camera.scale × DPR`
  - Wenn aktuelle Cache-Größe < 0.8× oder > 2× der Zielgröße → asynchrones Re-Render via pdfjs.
  - Während des Re-Renders bleibt das alte Canvas sichtbar (kein Flackern).
- Erase-Maske bleibt vollständig kompatibel (wird in Pixelraum der aktuellen Cache-Größe geführt).
- Scene-Serialisierung erweitert: `pdfSourceB64` wird mit gespeichert.

### 3. PDF "Auflösen" in CAD-Oberfläche
- Neuer Eintrag im Document-Kontextmenü (Rechtsklick auf selektiertes PDF) und im Hub: **"Auflösen → CAD-Objekte"**.
- Mit `pdfjs`:
  - `page.getOperatorList()` → Pfade extrahieren (Move/Line/Curve/Close, Stroke/Fill-Marker).
  - Bézier-Kurven werden via adaptiver Subdivision in Polylinien zerlegt (max-Fehler ≈ 0.1 mm im Plan-Maßstab).
  - `page.getTextContent()` → Texte mit Position + Größe.
- Mapping in CAD-Objekte (alle in neuen Layer `"PDF-Import-<dateiname>"`):
  - Stroke-only Pfade → **Linien** (`scene.lines`), Polylinien als Segmentketten.
  - Fill-Pfade → **Schraffuren** (`scene.hatches`) mit Original-Füllfarbe.
  - Texte → **Text-Objekte** (`scene.texts`) mit Position, Schriftgröße, Inhalt.
- Welt-Koordinaten: PDF-Punkte → Meter (`metersPerPdfPt`) × `importScaleDenom` × Dokument-Skalierungsfaktor; danach Rotation + Translation des Dokuments anwenden.
- Nach erfolgreichem Auflösen: Original-Dokument wird gelöscht und Auswahl auf die neu erzeugten Objekte gesetzt.
- Toast: "X Linien, Y Schraffuren, Z Texte erzeugt."

## Technische Details

### Geänderte/neue Dateien
- `src/cad/documentImport.ts` — `pdfSourceB64` zurückliefern, pdfjs-Modul-Cache exportieren.
- `src/cad/pdfVectorExtract.ts` *(neu)* — Extraktion via OperatorList + TextContent → Linien/Schraffuren/Texte.
- `src/cad/Scene.ts` — `DocumentObject.pdfSourceB64`, serialize/deserialize.
- `src/cad/Renderer.ts` — adaptiver PDF-Render-Pfad (`_getDocAdaptiveCanvas`).
- `src/cad/DocumentTool.ts` oder `SelectTool.ts` — Kontextmenü-Eintrag "Auflösen".
- `src/components/page/PdfPageView.tsx` *(neu)* — adaptive React-Komponente.
- `src/pages/ProjectWorkspace.tsx` — "PDF einfügen"-Button verkabeln, `PdfPageView` für `kind === "pdf"` einbinden, Element-Inspector für PDF.
- `src/lib/projectStore.ts` — `pdfSourceB64`, `pdfPageIndex`, `pdfPixelWidth/Height` an `PageElement`.

### Out-of-Scope (in dieser Iteration)
- Echtes SVG-DOM-Rendering (Re-Render-Strategie liefert visuell dasselbe Ergebnis).
- Schrift-Embedding 1:1 (Texte werden mit nächster passender System-Schrift gerendert; das ist konsistent mit anderem CAD-Text).
- Komplexe PDF-Features (Pattern-Fills, Transparenz-Gruppen, Bilder im PDF-Inhalt) — werden beim Auflösen übersprungen.

## Reihenfolge in einem Commit
1. `documentImport.ts` + `pdfSourceB64`-Propagation.
2. Adaptiver Renderer + Scene-Serialisierung.
3. `PdfPageView` + Page-Verkabelung.
4. `pdfVectorExtract.ts` + "Auflösen"-Eintrag.
