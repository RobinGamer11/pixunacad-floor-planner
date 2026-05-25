# Überlappung beim Selektions-Overlay entfernen

## Beobachtung im Screenshot

Zwei AW (gleiche Priorität 200) treffen sich am weißen Knotenpunkt. Das hellblaue **Selektions-Overlay** der angeklickten Wand poked als Dreieck nach oben in die Nachbarwand hinein. In der eigentlichen Wand-Füllung (graue Union) ist die Überlappung bereits sauber: die Boolean-Union mischt beide Solids zu einer Fläche. Die sichtbare „Überlappung" ist nur der Selektions-Highlight, der das **rohe geheilte Solid** der Einzelwand zeichnet — die durch den Heal in die Nachbarwand hineinragende Gehrungs-Spitze inklusive.

## Ursache

`Renderer.ts` Z. 856 ff.: für die selektierte Wand wird `buildHealedWallSolidRing(wall, …)` direkt mit Füllung + Konturlinie auf das Endbild gelegt. Der Ring enthält per Definition Gehrungs-Spitzen, die in benachbarte Wand-Solids hineinreichen — bei gleichpriorisierten Nachbarn überlappen sich diese Spitzen, und das Overlay zeichnet die fremde Wand sichtbar blau ein.

## Plan

### `src/cad/Renderer.ts` — Selektions-Overlay gegen Nachbarn clippen
Im Zweig `if (isSelected) { … }` (Z. 856–874):

1. `selRing = buildHealedWallSolidRing(wall, scene.walls, graph)` wie bisher.
2. Union aller anderen healed Wand-Solids im **selben Label** bilden:
   ```
   others = scene.walls.filter(w => w.labelId === labelId && w.id !== wall.id && w.corners.length >= 2 && w.thicknessM > 0)
   otherRings = others.map(w => buildHealedWallSolidRing(w, scene.walls, graph)).filter(r => r.length >= 3)
   otherUnion = polygonClipping.union(...otherRings als MultiPolygon)
   ```
3. `displayMulti = polygonClipping.difference([ringToPCPolygon(selRing)], otherUnion)`.
   - Bei Fehler / leerem Ergebnis: Fallback auf rohen Ring (heute).
4. `displayMulti` per Standardroutine (Fill + Stroke wie heute) zeichnen — über alle Polygone und Rings iterieren.

Damit ist das Highlight exakt dort, wo die Wand im fertigen Plan tatsächlich zu sehen ist: gemittert an Knoten gleicher Priorität, abgeschnitten an Flanken höherer Priorität, ohne Eindringen in fremde Wand-Solids.

### Performance
Pro Frame nur bei selektierter Wand — Anzahl Wände im Label typischerweise klein. Keine Caching-Notwendigkeit; bei Bedarf später memoisieren.

### Nicht im Scope
- Hit-Test (`SelectTool`) bleibt auf rohem Rechteck — Klickfläche unverändert.
- Wand-Helper (Bezugs-/Mittellinie) bleiben unverändert.
- Union-/Subtraktionslogik der Hauptfüllung bleibt unverändert (funktioniert bereits korrekt).
