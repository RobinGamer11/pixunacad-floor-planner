# Wandanschlüsse für Wölbung und Aufschneiden stabilisieren

## Ziel
Gewölbte und aufgeschnittene Wände bilden an gemeinsamen Fangpunkten einen durchgehenden Wandkörper mit korrekter Gehrung. Die sichtbare Wand endet exakt am gewählten Fangpunkt beziehungsweise am geometrisch korrekten Anschluss – ohne Keil, Spalt oder zurückgezogene Kante.

## Umsetzung

### 1. Exakte Endtangenten für gewölbte Wände
- Für jede gewölbte Wandkante die echte Kreisbogen-Tangente am Start- und Endpunkt berechnen.
- Wandkanten, Mittellinie, Gehrung und Anschluss-Healing verwenden dieselbe Tangente statt der geraden Sehne oder des letzten Tessellierungssegments.
- Offsets am Bogenende werden dadurch geometrisch korrekt bis zum Fangpunkt geführt.

### 2. Symmetrische Gehrung am Wandknoten
- Endpunkt-zu-Endpunkt-Verbindungen anhand der räumlichen Wandseiten paaren, nicht nur anhand der Bezeichnungen `main`/`sub`.
- Für beide beteiligten Wände dieselben Schnittpunkte der jeweiligen Endtangenten bestimmen, sodass die Wandkörper überlappen/vereinigen und keine gegensätzlichen Einzelresultate entstehen.
- Bestehende Prioritätslogik für Außen-/Innenwand und T-Anschlüsse beibehalten; unrealistisch lange Gehrungen bleiben begrenzt.

### 3. Wölbung bei Split und Topologie vollständig erhalten
- Manuelles Aufschneiden behält beide Teilbögen exakt und führt danach die Anschluss-/Topologiepflege aus.
- Automatische T-Splits werden bogenbewusst: Trefferprojektion auf den Bogen, Aufteilung des Bulge-Werts auf beide Teilkanten und konsistente Indizes für versteckte Knoten/Anker.
- Cleanup und Auto-Merge dürfen `bulges` nicht verlieren oder einen Bogen unbemerkt begradigen.

### 4. Darstellung und Interaktion angleichen
- Bezugslinie und Auswahlhilfe einer Wand entlang der tatsächlichen Wölbung zeichnen.
- Hit-Test, Fangpunkte, sichtbarer Wandkörper und blaue Auswahl verwenden dieselbe Kurve und dieselben geheilten Enden.

### 5. Regressionstests
- Gewölbte Einzelwand: beide Wandkanten reichen geometrisch bis zur Endkappe am Fangpunkt.
- Gewölbte Wand an gerader Wand: gemeinsame Gehrung ohne getrennte Union-Polygone oder sichtbaren Spalt.
- Aufgeschnittener Bogen: beide Teile ergeben zusammen exakt den ursprünglichen Bogen und bleiben am Splitpunkt lückenlos verbunden.
- Bogen-T-Anschluss: Auto-Split erhält Krümmung und Wandattribute.
- Gezielte CAD-Tests, TypeScript-Prüfung, Produktions-Build und visueller Canvas-Test im Browser.

## Technische Details
Betroffen sind voraussichtlich `geometry.ts`, `wallGeom.ts`, `wallHeal.ts`, `wallTopologyMaintenance.ts`, `WallTopologyGraph.ts`, `SelectTool.ts`, `Renderer.ts` sowie neue fokussierte Wandgeometrie-Tests. Die Boolean-Union bleibt bestehen; korrigiert werden ihre Eingabepolygone und die gemeinsame Knotenauflösung.
