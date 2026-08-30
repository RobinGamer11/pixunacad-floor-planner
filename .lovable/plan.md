# Stifte (Pinsel-Linienarten) grundlegend stabilisieren – CAD und Projektmappe

Ziel: Linie, Freihand, Polygon und Schraffur nutzen in CAD **und** Projektmappe dieselbe zentrale Stiftpipeline. Ein Stift sieht am Objekt aus wie in seiner Vorschau, bleibt nach Zoom, Seitenwechsel, Neuladen und Radieren identisch und bleibt auch mit vielen Objekten flüssig. Keine Buttons entfernen, keine Stiftnamen ändern, keine neuen Dropdowns.

## Belegter Befund

- `CadApp.ts:3405` und `MiniCad.ts:3088` rendern dauerhaft per `requestAnimationFrame` – die gesamte Szene läuft ~60-mal pro Sekunde durch, auch im Stillstand.
- `brushStrokes.ts`: globaler `brushCache` mit `MAX_CACHE = 24`. Ab mehr Pinselobjekten bzw. Konturringen verdrängen sich die Einträge gegenseitig (Thrashing).
- Der Cache-Schlüssel enthält Bildschirm-Pfadsignatur und Puffergröße → wird bei Zoom und meist auch bei Pan ungültig.
- `Renderer.ts:3128–3178`: Beim Freihandstrich greifen die alten `lineStyle`-Sonderwege (`brush`, `spray`, `marker`, `ink`, `chalk`, …) **vor** dem gemeinsamen Stiftaufruf in Zeile 3205 – ein neuer Stift wird bei Bestandsobjekten abgefangen.
- Stempeldichte skaliert mit Referenzgröße/Strichbreite: bei sehr dünnen realen Linien entstehen sehr viele Stempel und Borstenprüfungen, und die Details fallen zu Subpixelbreiten zusammen (wirkt solid).

## Vorgehen

### 1. Renderschleife entkoppeln
- Rendern nur noch bei Bedarf: `requestRender()`-Invalidierung bei Eingabe, Kameraänderung, Szenen-/Auswahländerung, Animationen; im Stillstand keine Frames.
- Gilt für CAD (`CadApp`) und Projektmappe (`MiniCad`) gleichermaßen; bestehende Aufrufer bleiben kompatibel.

### 2. Geometriecache und Rastercache trennen
- **Geometriecache (Weltkoordinaten):** deterministische Stempel-/Borstenliste in Objekt-/Weltkoordinaten, Schlüssel ausschließlich aus Objekt-ID, Geometrie-Revision, Stiftparametern und Seed. Kamera, Pan und exakte Bildschirmkoordinaten machen ihn nie ungültig.
- **Rastercache:** gerendertes Bild pro Objekt und Zoom-Bucket (wenige Stufen). Während Zoom/Pan wird ein vorhandenes Raster übergangsweise skaliert weiterverwendet; die hochauflösende Neuberechnung erfolgt nach Ende der Interaktion oder beim Bucketwechsel.
- Verwaltung nach Pixel-/Speicherbudget und pro Objekt statt globalem Limit von 24. Gezielte Invalidierung bei Geometrie-, Stift- und Farbänderung sowie beim Löschen.
- **Nur RAM, nie Persistenz:** Stempel- und Borsteninformationen werden bei Bedarf aus Originalpfad, Stiftparametern und Seed neu erzeugt und ausschließlich in einem begrenzten Arbeitsspeicher-Cache gehalten. Sie werden weder am Objekt noch im Projekt, in Local Storage oder in der Datenbank gespeichert. Dauerhaft bleiben nur Originalgeometrie, Stiftparameter und Seed. Der Cache lässt sich jederzeit verlustfrei verwerfen und identisch neu aufbauen.

### 3. LOD und Arbeitsbudget
- Skalierungsabhängiges Level-of-Detail: Stempelabstand, Partikelzahl und Borstenzahl richten sich nach der **sichtbaren** Pfadlänge und Strichbreite, mit festem Arbeitslimit pro sichtbarer Länge. Der Aufwand darf nicht umgekehrt proportional zur Strichbreite wachsen.
- Eigene LOD-Darstellungen für kleine Darstellungsgrößen: charakteristische Lücken, Borstenspuren und Partikel bleiben sichtbar, statt viele Subpixeldetails übereinanderzuzeichnen. Mindestbreiten so wählen, dass sich Elemente nicht zu einer Vollfläche addieren.
- Sichtbarkeits-Culling: Objekte außerhalb des Viewports werden nicht gestempelt.

### 4. Vorschau = Objekt
- Die Button-Vorschau nutzt exakt dieselbe Pipeline und dieselben LOD-Regeln wie das Objekt und rendert in einer repräsentativen Größe, sodass Vorschau und reale dünne Linie zusammenpassen. Kein Sonderpfad mehr, bei dem die Vorschau gut aussieht und das Objekt solid wird.

### 5. Freihand: alte lineStyle-Logik entschärfen
- Ist `strokePattern.kind === "brush"` gesetzt, hat die gemeinsame Stiftpipeline immer Vorrang; die Legacy-Zweige (`brush`, `spray`, `marker`, `ink`, `chalk`, `crayon`, `pencil`, `calligraphy`) werden dann übersprungen.
- Bestandsobjekte bleiben migrationssicher: ohne aktiven Stift verhalten sie sich unverändert.

### 6. Persistenz Freihand in der Projektmappe
- `sourceStartDistanceM`, `sourceStrokeId`, `pressures`, `autoShape`, `autoShapeSource` werden in der Mappe dauerhaft mitgespeichert und wiederhergestellt (zusätzlich zu Stift, Charakter, Winkel und Seed), durchgängig mit `??`-Absicherung.

### 7. Radierer
- Startdistanz des Schnittpunkts exakt entlang des ursprünglichen Pfades berechnen statt den nächstgelegenen Altpunkt zu verwenden.
- Stempel- und Borstenraster an der globalen ursprünglichen Pfaddistanz ausrichten; nach dem Teilen kein lokaler Rasterneustart bei Distanz 0.
- Seed, Druck, Charakter, Musterphase und Farbverbrauch stimmen vor und nach dem Radieren überein.

### 8. Abnahme
- Ein einzelner Stift sieht am Objekt erkennbar wie seine Vorschau aus, nicht wie „Durchgezogen“.
- 50 Pinselobjekte: im Stillstand kein dauerhaftes Neuberechnen; Zoom und Pan bleiben flüssig.
- Nach Zoom, Seitenwechsel und Neuladen bleiben Stift, Seed und Darstellung gleich.
- Eine radierte Freihandlinie verändert die nicht radierten Bereiche optisch nicht.
- Bestands-Freihandlinien mit alten `lineStyle`-Werten nutzen nach Auswahl eines neuen Stifts zuverlässig die neue Pipeline.
- TypeScript/Lint, Produktionsbuild, Regressionstests für Cache-Invalidierung, LOD-Budget und Radierer-Phase.

## Technische Dateien

`src/cad/brushStrokes.ts` (Geometrie-/Rastercache, LOD, Budget), `src/cad/strokeEffects.ts` (Stiftparameter, `strokeWithBrushIfActive`), `src/cad/Renderer.ts` (vier Aufrufstellen, Freihand-Legacy-Zweige, Cache-Schlüssel), `src/cad/CadApp.ts` und `src/cad/embed/MiniCad.ts` (bedarfsgesteuertes Rendern, Persistenz), `src/cad/Scene.ts`/`src/cad/sceneSerde.ts` (Freihandfelder), `src/cad/EraserTool.ts` und `src/cad/FreeDrawTool.ts` (Phase/Teilung), `src/components/cad/StrokeEffectsSettings.tsx` (Vorschau über dieselbe Pipeline).

Verhalten ohne Stift (durchgezogen, gestrichelt, Strich-Punkt, gepunktet, Aufrauen) bleibt unverändert.
