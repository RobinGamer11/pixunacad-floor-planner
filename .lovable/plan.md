## Ziel

Eingefügte PDFs **und Bilder** erhalten überall (CAD-Seite + Projektmappe-Overlay) Fangpunkte und Fanglinien — analog zur Schraffur. Klick auf eine Kante blendet eine Hilfslinie ein/aus, Klick auf einen Eckpunkt öffnet eine Hub-Box mit "Verschieben"/"Drehen"-Icons. Verschieben/Drehen ist ausschließlich über die Hub-Box möglich (Drag mit der Maus auf dem Dokument bewegt es nicht mehr).

## Umfang

### 1. Datenmodell (`src/cad/Scene.ts`, `documentGeometry.ts`)
- `DocumentObject` bekommt zwei neue Felder:
  - `rotationDeg: number` (Default 0, Drehung um Dokument-Mittelpunkt)
  - `guideEdges: { top: boolean; right: boolean; bottom: boolean; left: boolean }` (welche Kanten als unendliche Hilfslinien sichtbar sind)
- Helper `documentCornersWorld` / `documentEdgeMidpointsWorld` werden um Rotation erweitert. Neue Helfer:
  - `documentEdgesWorld(doc)` → 4 Kanten-Segmente (für Hit-Test der Kanten)
  - `documentGuideLinesWorld(doc)` → unendliche Hilfslinien für aktive Kanten
- Snapshot/Restore + History berücksichtigen die neuen Felder.

### 2. CAD-Editor (`src/cad/SelectTool.ts`, neuer `DocumentHub`)
- Wenn ein Dokument selektiert ist (SelectTool):
  - **Klick auf Eckpunkt** (innerhalb Snap-Toleranz) → öffnet `DocumentHub` an Bildschirmposition.
  - **Klick auf Kante** (innerhalb Toleranz) → toggelt `guideEdges[seite]` und re-rendert.
  - **Klick auf Dokumentfläche** (nicht Punkt/Kante) → reine Auswahl, **kein** Drag-Move mehr.
- `DocumentHub` (neue React-Komponente in `CadEditor.tsx`, im Stil der Tür-Hub-Box):
  - Zwei Icon-Buttons: `Move` (Δx/Δy in m), `RotateCw` (Winkel in °).
  - Live-Inputs daneben (wie Tür-Hub). Enter übernimmt, Esc schließt.
  - Position: über/neben dem geklickten Eckpunkt, follow-camera.

### 3. Renderer (`src/cad/Renderer.ts`)
- Bei jedem Dokument zusätzlich zeichnen:
  - 4 Eckpunkte als kleine quadratische Snap-Marker (nur wenn Dokument selektiert oder gehovert).
  - Kanten leicht hervorgehoben bei Hover.
  - Aktive `guideEdges` als gestrichelte unendliche Linien (klein, neutralfarbig).
- Drehung wird via Canvas-Transform auf Bild/PDF angewandt.

### 4. TopologyEngine (`src/cad/TopologyEngine.ts`)
- `findBestSnap` muss Eck-/Kanten-Snaps für rotierte Dokumente liefern (geometrische Anpassung in `documentCornersWorld`).
- Neue Snap-Quelle "Kantenmittel" bleibt; zusätzlich werden aktive Guide-Lines wie normale Hilfslinien für Achsen-Snap genutzt.

### 5. Projektmappe-Overlay (`src/components/page/CadOverlayLayer.tsx`)
- Identisches Verhalten für eingefügte PDFs/Bilder:
  - Fangpunkte an Ecken + Fanglinien an Kanten
  - Klick-Toggle für Hilfslinien
  - Hub-Box zum Verschieben/Drehen
- Logik wird in ein gemeinsames Hook/Modul `useDocumentSnapHub` ausgelagert, das beide Stellen nutzen.

### 6. Hub-UX-Details
- Hub-Box optisch identisch zur bestehenden Door-Hub (kleine Buttons + tabular-nums-Inputs, weißes Card-Hintergrund).
- "Verschieben"-Modus: Eingabewerte bewegen Dokument relativ zum letzten Eckpunkt. Mauszieh-Bewegung im Plan ändert NICHTS am Dokument.
- "Drehen"-Modus: absoluter Winkel um Dokument-Center.
- Klick außerhalb des Hubs / Esc → schließt Hub.

### Out-of-Scope (nicht in diesem Schritt)
- Snap an gedrehten Kanten anderer Dokumente (TopologyEngine).
- Multi-Select-Move via Hub.
- Persistente Guide-Lines über Sitzungen (sind in Scene-Snapshot, also automatisch dabei).

## Technische Notizen
- `DocumentObject.rotationDeg` muss in `BoundingCorners`, Renderer-Image-Draw, PDF-Vector-Resolve, Hover/Hit-Test einheitlich respektiert werden.
- Hit-Test Punkt: Screen-Pixel-Toleranz (z. B. 8 px).
- Hit-Test Kante: Distanz von Mauspunkt zum Liniensegment ≤ 6 px.
- Verhindern, dass das bisherige Document-Drag in SelectTool weiterhin aktiv ist → Drag-Branch früh abbrechen, falls Selection-Typ `document` und Klick nicht auf Eckpunkt/Kante.

## Geschätzter Aufwand
~7 Dateien, ~600 LoC. Liefere alles in einem Rutsch, danach kurzer Sichttest im Preview.
