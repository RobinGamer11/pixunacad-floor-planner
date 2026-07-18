# Umsetzung – 3 Punkte

## 1. Auswahl-Werkzeug: Dritter Modus „Klick" (ohne Rahmen)

**Ziel:** Standard nach Aktivierung = reines Einzelklicken. Rahmen (Berühren / Umschließen) nur wenn bewusst gewählt.

- `SelectTool.marqueeMode` erweitert um `"click" | "touch" | "enclose"`. Default = `"click"`.
- Im `"click"`-Modus: Rahmen-Logik komplett aus (kein Marquee-Aufziehen, kein Marquee-Highlight), nur bisheriger Einzelklick-Pfad.
- CAD-Toolbar (`CadEditor.tsx`) und Projektmappe (`ProjectWorkspace.tsx`): Flyout links am Auswahl-Symbol bekommt drittes Icon **Klick** (MousePointer2) neben Berühren (SquareDashed) und Umschließen (BoxSelect). Aktiver Modus visuell hervorgehoben wie heute.
- Gleiche Logik in `MiniCad._marqueePick`: bei `"click"` wird `_marqueeStart` gar nicht erst gesetzt.

## 2. Enter-Commit für alle Zeichenwerkzeuge im Tablet-Modus

**Ziel:** Wenn Hilfsrad aktiv ist, setzt Stift/Finger keinen Punkt beim Aufsetzen/Loslassen. Punkt wird erst gesetzt, wenn im Rad **Enter** oder **LMB** gedrückt wird. Cursor/Vorschau folgt weiter der Bewegung.

**Ansatz** (minimal-invasiv statt jedes Tool umzuschreiben):

- Neues globales Flag `window.__pixunaTabletCommit` (gesetzt vom `TabletAidWheel`, wenn das Rad sichtbar ist).
- Input-Layer (`src/cad/Input.ts` + Seiteneditor-Pointer-Handler): Wenn Flag aktiv, werden echte Pointer-Down/Up-Events **nicht** in `mouse.left`/`clicked`/`doubleClicked` übersetzt. Sie aktualisieren nur Position (Vorschau).
- `TabletAidWheel` LMB-Button und Enter-Button feuern eine synthetische Sequenz `mouse.left=true; clicked=true` für einen Frame an den aktiven Canvas. Über bereits vorhandenes `virtualInput.ts` ausbauen zu `virtualCommitClick(target)`.
- Doppelklick-Commit (z.B. Line/Wall Polyline abschließen): Zweimal kurz Enter = doppelter Commit → wir setzen `doubleClicked=true` wenn Enter zweimal innerhalb 260 ms.
- Rechtsklick-Äquivalent im Rad (RMB) bleibt wie heute.

Dadurch funktionieren **alle** Werkzeuge (Line, Wall, Door, Window, Hatch, Measure, Text-Anker, Sticker, Document-Anker, FreeDraw-Startpunkt) automatisch mit Enter/LMB-Commit, ohne dass jedes einzelne Tool angefasst werden muss. FreeDraw: „Zeichenzustand" wird durch LMB-Down im Rad gestartet und mit LMB-Up (erneuter Klick) beendet — für Tablet-Nutzung praktikabel.

Gleiche Injektion in Projektmappe: `MiniCad`-Instanzen nutzen denselben `Input`, also automatisch abgedeckt. Seiteneditor-eigene Pointer-Handler (Element-Verschieben etc.) werden **nicht** blockiert — Flag greift nur für Zeichen-Canvas.

## 3. Exakte Pointer-Koordinaten überall

**Ursache heute:** In `Input.ts` wird bei `pointerdown` `mouse.sx/sy` nicht neu berechnet — es wird der Wert vom letzten `pointermove` genutzt. Beim ersten Touch/Pen-Kontakt gibt es keinen vorherigen Move → Startpunkt landet auf der letzten Maus-Position.

**Fix:**
- In `Input._onPointerDown`: `mouse.sx/sy` **vor** dem Setzen von `_clickQueued` aus `e.clientX/Y - rect.left/top` neu berechnen. Auch `wx/wy` sofort via `camera.screenToWorld` aktualisieren (dazu Kamera-Referenz an Input reichen oder Recompute im nächsten `update()` sicherstellen, indem `clicked` erst nach dem nächsten `update` freigegeben wird — bevorzugt: Recompute direkt hier).
- Gleicher Fix im Projektmappe-Pointer-Handler (`ProjectWorkspace.tsx` Marquee/Move-Start).
- `getBoundingClientRect()` wird pro Down-Event neu geholt (Scroll/Layout-Änderungen).
- Zusätzlich: kein initialer `panLast`-Sync aus altem `mouse.sx`, sondern aus dem frischen Wert.

## Änderungen (Dateien)

```text
src/cad/SelectTool.ts              +Modus "click", Marquee gate
src/cad/embed/MiniCad.ts           +Modus "click" in _marqueePick
src/components/CadEditor.tsx       Flyout: 3. Button "Klick"
src/pages/ProjectWorkspace.tsx     Flyout: 3. Button, Marquee-Gate, Pointer-Down Recompute
src/cad/Input.ts                   pointerdown → sx/sy neu, tablet-commit gate
src/components/TabletAidWheel.tsx  window.__pixunaTabletCommit setzen; LMB/Enter → virtualCommitClick
src/lib/virtualInput.ts            virtualCommitClick(target) neu
```

## Risiken

- Enter-Commit-Gate darf Auswahl-Klicks nicht blockieren, sonst wird das Programm mit aktivem Rad unbenutzbar. Gate greift nur wenn Rad aktiv **und** ein Zeichenwerkzeug aktiv ist — SelectTool bleibt Klick-normal.
- Recompute in `pointerdown` darf `_panning`-Init nicht brechen.
- Alles hinter einem Feature-Flag → falls es hakt, sofort ausschaltbar.
