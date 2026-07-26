# CAD-Blatt-Objekt: Rahmen, Snapping, HUB & Kanten-Trim

Diese Änderungen betreffen nur das in der **Projektmappe** platzierte CAD-Blatt-Objekt (`kind: "cad-view" | "cad-viewport"`). Die CAD-Oberfläche bleibt unverändert.

## 1) Optik: schlichter Rahmen wie andere Werkzeuge
- In `CadViewportView` den Border zu `1px solid hsl(var(--border))` vereinheitlichen, dezenter Shadow im Selected-Zustand (analog Text/Bild).
- Auswahlrahmen im Selected-Zustand: gestrichelte Akzentlinie außenherum (wie bei anderen Elementen).

## 2) Fangpunkte an Ecken + fangbare Kanten
- In `ElementView`/Wrapper für `cad-view` beim Selected-Zustand vier Corner-Handles (kleine gefüllte Punkte, ~8px) rendern.
- Snap-Registry pro Seite erweitern: `page.elements` iterieren, für jedes CAD-Blatt vier Corner-Points und vier Edge-Segments in eine gemeinsame Snap-Quelle einspeisen, die von anderen Werkzeugen im Seiteneditor (Linie, Freihand, Text, Tabelle-Placement) beim Ziehen abgefragt wird.
- Snap-Toleranz: 8 px auf Bildschirm; Prioritäten: Corner > Edge-Midpoint > Edge-Line.
- Umgekehrt: beim HUB-Move/Rotate/Edge-Trim des CAD-Blatts die vorhandenen Snap-Quellen aller anderen Elemente konsumieren (Corners, Kanten, Guide-Linien).

## 3) HUB-Box am Klickpunkt
- Neue Komponente `CadViewportHub.tsx` (fixed positioniert am Klickpunkt in Viewport-Koordinaten), draggable via `makeHubDraggable`.
- Öffnet nur bei aktivem Klick INS Innere eines bereits ausgewählten CAD-Blatts (nicht auf Kante/Corner).
- Symbole:
  - **Verschieben** (Move-Icon): startet Move-Preview-Modus. Maus bewegt Ghost-Rahmen mit Snapping. Ein weiterer Klick commited an aktuelle Position. Bei aktivem Tablet-Hilfsrad (`window.__pixunaTabletCommit`) erscheint zusätzlich Häkchen-Symbol in HUB, das den Commit auslöst.
  - **Drehen** (Rotate-Icon): startet Rotate-Preview um Objekt-Center. Freies Drehen; mit Shift Fang auf 0/90/180/270 (Toleranz ±3°). Commit wie bei Move.
- Funktionen greifen nur, wenn ihr Symbol vorher explizit angeklickt wurde (Modus-Flag `hubMode: "move" | "rotate" | null`). Ohne Modus tut Mausbewegung nichts.
- ESC bricht Preview ab (Reset auf Ausgangszustand).

## 4) Kanten-Trim (Rein/Rausziehen)
- Klick auf eine der vier Kanten (Toleranz 6 px) → kleines Doppelpfeil-Symbol an der Kante.
- Ziehen an der Kante ändert die Papier-Ausschnittsgröße dieser Seite:
  - Nach INNEN ziehen = Ausschnitt verkleinern (schneidet Papierbereich weg, Modell-Center-Verschiebung bleibt, Rahmen wird kleiner).
  - Nach AUSSEN ziehen = mehr Papier zeigen (Rahmen wird größer, mehr Modell sichtbar).
- Umsetzung: Kante links/rechts/oben/unten passt `w` bzw. `h` in Papier-mm an; um den Modell-Inhalt an seiner Weltposition zu belassen, wird `x` bzw. `y` gegenläufig verschoben und `modelCenterM` entsprechend kompensiert.
- Snapping wirkt auch hier auf andere Objekt-Kanten/Corners.
- Commit bei Loslassen; im Tablet-Modus mit Häkchen bestätigen.

## Technische Details

**Betroffene Dateien**
- `src/components/page/CadViewportView.tsx` — Rahmen-Look, Corner-Handles, Edge-Hitzones.
- `src/components/page/CadViewportHub.tsx` — neu, HUB-Box mit Modi und Preview-State.
- `src/pages/ProjectWorkspace.tsx` — Integration in `ElementView` (Klick-Analyse Corner/Edge/Interior), Snap-Provider für Seiten-Objekte, Preview-Overlay, Commit über `projectStore.updateElement`.
- `src/lib/pageSnap.ts` — neu, gemeinsame Snap-Quelle (Corners/Edges aller Seiten-Elemente inkl. CAD-Blätter, Text, Bilder, Tabellen) für Move/Rotate/Trim des CAD-Blatts.

**Preview-Modell**
- Preview-State lebt lokal in `CadViewportHub` bzw. auf dem `ElementView`-Wrapper; erst Commit schreibt in den Store (History-freundlich).
- Beim Trim wird `w`, `h`, `x`, `y`, `modelCenterM` in einem einzigen `updateElement`-Call gesetzt.

**Tablet-Integration**
- Präsenz von `window.__pixunaTabletCommit` schaltet Häkchen-Icon frei; Klick auf Häkchen ruft dieselbe Commit-Funktion wie ein regulärer Zweitklick.
