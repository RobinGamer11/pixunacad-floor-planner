# Stifte (Pinsel-Linienarten) stabilisieren – CAD und Projektmappe

Ziel: Die acht Stifte sind in allen vier Werkzeugen (Linie, Freihand, Polygon, Schraffur) in CAD **und** Projektmappe dauerhaft sichtbar, wirken zuverlässig, bleiben nach Zoom/Seitenwechsel/Neuladen erhalten und laggen nicht mehr.

## Bestandsaufnahme (geprüft)

- Die acht Stifte sind in `StrokeEffectsSettings.tsx` als Button-Grid fest angelegt und werden in allen vier Panels eingebunden (CAD: `CadEditor.tsx`, `PolygonSettingsPanel`, `HatchSettingsPanel`, `FreeDrawSettingsPanel`; Mappe: `ProjectWorkspace.tsx` + dieselben Panels). Warum sie zeitweise nicht erscheinen, ist damit **nicht** erklärt – das muss zuerst reproduziert werden, bevor daran etwas geändert wird.
- Der Cache-Schlüssel in `brushStrokes.ts` enthält die **Bildschirm**-Pfadsignatur (`pathSignature`) und die Puffergröße. Beim Zoomen und Verschieben ändert sich dieser Schlüssel jedes Bild neu, der Cache (max. 24 Einträge) greift praktisch nie, und jeder Frame stempelt alle Pinselobjekte komplett neu. Das ist die belegbare Hauptursache für das Ruckeln.
- Persistenz: `strokePattern` inkl. Pinselfeldern wird für Segment, Hatch/Polygon und Freihand serialisiert und beim Laden über `normalizeStrokePattern` wiederhergestellt. Ob das auf allen Wegen (Mappe-Serialisierung, Copy/Paste, geteilte Freihandlinien nach Radieren) vollständig ist, wird im Rahmen des Audits geprüft.

## Vorgehen

### 1. Reproduzieren und belegen (zuerst)
- Fehlerfall „Buttons fehlen“ live nachstellen (CAD und Mappe, alle vier Werkzeuge) und feststellen, ob das Panel gar nicht rendert, ein Laufzeitfehler auftritt oder nur die Vorschau-Canvas leer bleibt.
- Fehlerfall „Wirkung verschwindet“ nachstellen: nach Zeichnen, nach Zoom, nach Werkzeugwechsel, nach Seiten-/Blattwechsel und nach Neuladen jeweils prüfen, ob `strokePattern.kind === "brush"` am Objekt noch gesetzt ist.
- Ergebnis entscheidet, welche der folgenden Schritte in welcher Tiefe nötig sind. Keine Änderung ohne belegte Ursache.

### 2. Performance: Pinsel in Weltkoordinaten cachen
- Stempelrasterung nicht mehr an Bildschirmkoordinaten koppeln: Cache-Schlüssel aus Objekt-ID, **Welt**-Geometriesignatur, Stil, Seed, Phase und einem gerundeten Zoom-Bucket bilden.
- Gecachte Kachel bei reinem Verschieben nur versetzt blitten, bei kleinen Zoomschritten innerhalb des Buckets wiederverwenden; Neuaufbau nur beim Bucketwechsel oder bei Geometrie-/Stiländerung.
- Cache-Budget pro Objekt statt global 24 Einträge, plus Freigabe beim Löschen des Objekts.
- Live-Puffer beim Zeichnen bleibt bestehen; Marker-Sonderweg (Vollrender) prüfen und nur behalten, wenn er messbar schneller ist.
- Sichtbarkeits-Culling: Objekte außerhalb des Viewports werden nicht gestempelt.

### 3. Wirkung darf nicht verschwinden
- Alle Renderpfade, über die Linie, Polygon, Schraffurkontur und Freihand gezeichnet werden, auf den gemeinsamen Pinselaufruf prüfen (auch Miniaturen, Live-Viewport der Mappe, Druck-/PDF-Export).
- Pinselfelder (`brushPreset`, `brushCharacter`, `brushAngleDeg`, `brushSeed`) durchgängig in Serialisierung, Wiederherstellung, Copy/Paste, Gruppen-Transformation und Radiergummi-Teilung mitführen; überall `??` statt `||`.
- Seed dauerhaft am Objekt verankern, damit sich ein bereits gezeichneter Strich nie neu verwürfelt.

### 4. Bedienoberfläche
- Sicherstellen, dass das Stift-Grid in allen vier Werkzeugen in CAD und Mappe identisch gerendert wird, inklusive Vorschau (Canvas-Größe robust setzen, damit die Vorschau nie leer bleibt).
- Aktiver Stift wird eindeutig markiert; erneutes Klicken schaltet zurück auf „Durchgezogen“, ohne die Pinselparameter am Objekt zu verlieren.

### 5. Prüfen
- TypeScript- und Lint-Prüfung, Produktionsbuild.
- Manuelle Durchsicht je Werkzeug in CAD und Mappe: Zeichnen, Zoomen, Verschieben, Radieren, Kopieren/Einfügen, Seitenwechsel, Neuladen.
- Kurzer Regressionstest für die Weltkoordinaten-Cache-Logik.

## Technische Dateien

`src/cad/brushStrokes.ts` (Cache/Live-Puffer), `src/cad/strokeEffects.ts` (Pinselparameter, `strokeWithBrushIfActive`), `src/cad/Renderer.ts` (vier Aufrufstellen + Cache-Schlüssel), `src/cad/Scene.ts` und `src/cad/sceneSerde.ts` sowie `src/cad/CadApp.ts`/`src/cad/embed/MiniCad.ts` (Persistenz und Standards), `src/components/cad/StrokeEffectsSettings.tsx` und die vier Werkzeugpanels.

Bestehendes Verhalten ohne Pinsel (durchgezogen, gestrichelt, Strich-Punkt, gepunktet, Aufrauen) bleibt unverändert.
