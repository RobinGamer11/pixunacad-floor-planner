## Ziel

Rechtsklick auf eine bestehende CAD-Linie/-Kante öffnet einen Mini-Hub mit einem Eingabefeld „Abstand (mm)". Nach Bestätigung wird parallel zur angeklickten Linie im eingegebenen Abstand eine Hilfslinie (page-level Guide) erzeugt.

## Verhalten

1. Rechtsklick wird auf der CAD-Oberfläche abgefangen.
2. Wird ein nicht-Frame-Segment getroffen, öffnet sich neben dem Klickpunkt ein kleiner Hub:
   - Inputfeld für Abstand (mm), default = 100
   - Vorschauseite zeigt die Linie live in zwei möglichen Parallel-Positionen (links/rechts der Quelllinie) — Klick auf die gewünschte Seite oder Enter platziert auf der dem Mauszeiger nähergelegenen Seite.
   - ESC bricht ab.
3. Nach Bestätigung wird der Hub geschlossen und die Hilfslinie in der Page-Guide-Liste angelegt — sie verhält sich wie alle bisherigen Hilfslinien (verschiebbar, löschbar, in „Hilfslinie"-Layer).
4. Wenn der Rechtsklick KEIN Segment trifft, ändert sich nichts (kein Standard-Browser-Kontextmenü, das ist bereits unterdrückt).

## Distanz-Referenz

Der eingegebene mm-Wert ist der senkrechte Abstand zur Quelllinie. Die Seite wird über die Mausposition relativ zur Linie bestimmt — die Hilfslinie erscheint auf der Seite des Mauszeigers. Damit ist „vom letzten ausgewählten Punkt" implizit: der Rechtsklick selbst definiert die Seite und Referenzlage. (Optional: Wenn vorher ein Snap-Punkt selektiert war und auf der Linie liegt, dient er als Referenz; sonst der Lotfußpunkt vom Mausklick auf die Linie.)

## Technik

```text
CadOverlayLayer (React)
   │  onCreateParallelGuide(p1Pct, p2Pct)  ← Callback
   ▼
MiniCad
   │  installt contextmenu-Listener auf canvas
   │  hit-test gegen Scene.segments (ohne Frame-Segmente)
   │  zeigt ParallelGuideHub (neues DOM-Element)
   │  bei Commit: berechnet Parallel-Endpunkte in Welt-m
   │             → konvertiert m → Page-% via pageWidthMm/pageHeightMm
   │             → ruft onCreateParallelGuide
   ▼
ProjectWorkspace
   │  fügt Element { kind:"guide", x1,y1,x2,y2 (in %) } zur Seite hinzu
```

### Neue Dateien
- `src/cad/ParallelGuideHub.ts`: kleines DOM-Widget mit `<input>` (mm) + OK/Cancel; `bindCommit((mm)=>void)`, `showAt(sx,sy, defaultMm)`, `hide()`. Selbe Visual-Styles wie LineHub.

### Geänderte Dateien
- `src/cad/embed/MiniCad.ts`
  - Konstruktor: `contextmenu` auf Canvas registrieren, `e.preventDefault()`, Segment-Hit per `topology.findBestSnap`/Segment-Loop.
  - Neue Methode `_handleSegmentRightClick(seg, mouseW, sx, sy)`: berechnet Lotfußpunkt + Side, öffnet Hub.
  - Auf Hub-Commit: rechnet Parallel-Linie, konvertiert mm-Welt-Endpunkte → Page-% (`xPct = (xM*1000)/pageWidthMm*100`), ruft `init.onCreateParallelGuide?.(p1, p2)`.
- `src/components/page/CadOverlayLayer.tsx`
  - neues ref `parallelHubRef` + Input
  - propagiert `onCreateParallelGuide(p1,p2)` an Parent
- `src/pages/ProjectWorkspace.tsx`
  - neuer Handler legt ein Guide-`PageElement` mit den beiden %-Punkten an, kind=`"guide"`, Farbe/Strichstärke aus `toolSettings.guide`.

### Edge-Cases
- Quelllinie ist sehr kurz / vertikal / horizontal: Berechnung über Normalenvektor (`nx = -dy/|d|, ny = dx/|d|`) deckt alle Winkel ab.
- Negativer / zu großer Abstand: clamp ≥ 0; wenn Linie außerhalb Seite landet → trotzdem erzeugen (User-Entscheidung).
- Rechtsklick auf Frame-Segment (unsichtbarer Page/Margin-Rahmen): ignorieren (`isFrameSegment`).

### Tests (manuell)
- Horizontale Linie + 50mm → parallele Hilfslinie 50mm darüber/darunter je nach Mausseite.
- 45°-Linie + 100mm → korrekt orthogonal versetzt.
- ESC bricht Hub ab, keine Guide erzeugt.

Implementierung umfasst ~250 Zeilen über 4 Dateien.