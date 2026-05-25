## Ziel

Beim Zeichnen einer Wand sollen Sub-Linien-Snaps an bestehenden Wänden die **tatsächliche, gehealte Kantengeometrie** (mit Gehrungen, T-Stößen, Verlängerungen/Kürzungen) widerspiegeln — nicht nur den rohen Offset bis zur Bezugslinie. Aktuell endet die Sub-Linie im Snap an der unverlängerten Bezugslinien-Senkrechten, wodurch Gehrungen die echte Kantenlänge nicht abbilden.

Wichtig: Die Preview-Sub-/Hilfslinie der *eigenen, gerade gezeichneten* Wand bleibt unverändert „roh" (kein Auto-Verlängern), wie zuvor festgelegt. Geändert wird ausschließlich die Snap-Quelle für **bestehende Nachbarwände**.

## Änderung

### `src/cad/TopologyEngine.ts` — `computeSnap`, Block `if (this.includeWallOffsetSnaps)`

- Statt `computeWallLines(ref, wall.thicknessM, wall.referenceSide)` die gehealten Linien verwenden:
  `computeHealedWallLines(wall, otherVisibleWalls, this.scene.getWallTopology())`
  - `otherVisibleWalls` = `visibleWalls.filter(w => w !== wall && w.corners.length >= 2)` (einmal vor der Schleife berechnen).
  - `computeHealedWallLines` ist bereits importiert in `Renderer.ts`; Import hier ergänzen aus `./wallHeal`.
- Aus dem Heal-Ergebnis weiterhin `subCorners` (jetzt verlängert/gekürzt) als Snap-Kandidaten verwenden — Punkte und Segmente, identisch zur bisherigen Logik (gleicher Score, gleiche Strafe gegenüber Bezugslinie, gleiche `wallLine: "sub"`-Markierung).
- Optional: Heal-Ergebnis pro Tick cachen (`Map<Wall, WallLines>`), um Mehrfachberechnung zu vermeiden, falls Performance auffällt.

### Keine weiteren Dateien betroffen

- `WallTool.ts` Preview bleibt wie ist (rohe Sub-Linie für Orientierung).
- Renderer, Heal-Logik selbst unverändert.

## Resultat

Hovert man beim Wand-Zeichnen über die gegenüberliegende Kante einer bestehenden Wand, deckt die snapbare Sub-Linie nun die volle gehealte Länge ab (inkl. der durch Gehrung verlängerten Ecke). Der End-Eckpunkt der Sub-Linie liegt exakt dort, wo sich die Wand im fertigen Bild mit Nachbarn verbindet — also fangbar bis zur echten Ecke.
