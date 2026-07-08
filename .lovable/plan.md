## 01. Karte + Hintergrundfarbe im Raster-Popover (CAD-Oberfläche)

**Datei:** `src/components/CadEditor.tsx`, `src/cad/Renderer.ts`, neu: `src/cad/MapBackground.ts`

Erweiterung des bestehenden Raster-Popovers um zwei neue Sektionen:

**A) Hintergrundfarbe der CAD-Oberfläche**
- Farbwähler + Hex-Feld, wirkt auf `renderer.backgroundColor` (neues Feld) → im Renderer statt `#fff` wird dieser Wert für den Clear genutzt.
- Reset-Button auf Standard.

**B) Kartenhintergrund (Sitemap-Overlay)**
- Toggle „Karte anzeigen".
- Adressfeld (Text) + „Suchen"-Button → Geocoding via **Lovable Google Maps Connector** (Gateway-Route `/maps/api/geocode/json`). Falls Connector nicht verknüpft, fordert der Button die Verbindung an (`standard_connectors--connect google_maps`) — erklärt, dass Cloud + Maps-Connector benötigt werden.
- Distanz-Slider (10 m – 2000 m, Meter-Radius).
- Nach Ergebnis: Lade Static Map-Kachel via Gateway `/maps/api/staticmap` mit Center `lat,lng`, `zoom` passend zum Radius, Größe `640x640`, `scale=2`. Das Bild wird als `HTMLImageElement` an den Renderer übergeben (`renderer.setMapBackground({image, centerLatLng, radiusM})`).
- **Rendering (`Renderer.ts`)**: Vor dem Zeichnen der CAD-Objekte in Weltkoordinaten: `ctx.save()` → runde Clipping-Maske Radius=`radiusM` in Weltmetern um Weltursprung (0,0 = Adress-Mittelpunkt) → Karte gezeichnet mit korrekter m/px-Skalierung (Static Map: `metersPerPixel = 156543.03392 * cos(lat) / 2^zoom / scale`) → `restore()`. Außerhalb des Kreises bleibt `backgroundColor` sichtbar. Grid wird über die Karte gezeichnet.
- Karte ist reine Hintergrund-Layer, nicht selektierbar / nicht gefangen — Werkzeuge arbeiten normal weiter.
- Persistenz im projectStore als Teil des CAD-State (Adresse, Radius, LatLng, Farbe).

## 02. Bildbearbeitung in Dokument-Inspektor (Projektmappe + CAD)

**Dateien:** `src/components/page/CadDocumentInspector.tsx`, `src/components/CadEditor.tsx` (identisches UI), neu: `src/cad/imageAdjust.ts` (WebGL/Canvas Pipeline), Erweiterung `DocumentTool.ts`.

Neue Sektion „Bildbearbeitung" unten in beiden Inspektoren, nur aktiv wenn selektiertes Dokument ein Bild oder gerastertes PDF ist:

**Regler (0–100, Default 0/50):**
- Belichtung, Kontrast, Sättigung, Wärme, Tint
- Klarheit (lokaler Kontrast), Struktur, Dunst entfernen
- Schatten, Lichter, Weiß, Schwarz
- Vignette, Körnung
- Aquarell-Preset (aus Upload adaptiert: Pigment-Blur + Kanten-Bloom + Papiertextur), Stärke-Slider
- Preset-Dropdown: Original, Aquarell weich, Aquarell Landschaft, Skizze, Grauwert

**Umsetzung:**
- Neuer Utility `imageAdjust.ts`: nimmt Source-`HTMLImageElement`+Params → rendert auf Off-screen-Canvas mit Filter-Pipeline (verbessert gegenüber Upload: einzelne unabhängige Regler statt Sammel-Presets, Live-Debounce 80 ms, Web-Worker-fähige `OffscreenCanvas` wenn verfügbar). Ergebnis als `ImageBitmap`/DataURL an das Dokument.
- `DocumentTool.setImageAdjust(docId, params)` speichert Params im Doc-State und triggert Re-Render.
- Renderer zeichnet Dokument mit dem angepassten Bitmap (Cache pro Params-Hash).
- „Zurücksetzen"-Button und „Anwenden & speichern"-Button (persistent in projectStore).

## Verifikation
- Typecheck läuft automatisch.
- Manueller Playwright-Check: Raster-Popover öffnen, Farbe ändern, Karte togglen (nur wenn Connector vorhanden), Dokument selektieren → Bildbearbeitung erscheint, Regler verändert Preview.

Wenn genehmigt, verknüpfe ich zunächst den Google-Maps-Connector (Punkt 01B braucht ihn) und liefere anschließend beide Features.