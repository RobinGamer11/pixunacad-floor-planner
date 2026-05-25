# Korrektur: Gehrung der Innenkante und Mittellinien-Verbindung

## Problem

Im Screenshot (zwei AW im stumpfen Winkel) ist sichtbar:

1. **Außenkante (Bezugsseite=Außen, „main"):** verbindet sich am Knoten – korrekt.
2. **Innenkante („sub", gegenüberliegende Seite):** bleibt rechteckig, die beiden Wand-Solids überlappen nur stumpf statt einen Gehrungspunkt zu bilden → die in Heal berechnete Verlängerung wird wieder kassiert.
3. **Gestrichelte Mittellinie:** läuft sowohl im Renderer-Helper (selektierte / Wand-Tool-aktive Wände) als auch im **Live-Preview** der gerade gezeichneten Wand nicht in die vorhandene Nachbarwand hinein – jede Wand zeigt nur ihre eigene Offset-Strecke.

## Ursachen

### a) Sub-Linie wird am Knoten zurückgesnappt
In `wallHeal.ts` → `healEnd` läuft nach der „idealen" Schnittsuche eine **Phase-5-Klemmung** (Zeilen 117–135) für `T !== "main"`:

```
für jeden Nachbarn: nimm den nächsten Schnitt mit dessen main- ODER sub-Linie
und klemme darauf, wenn er näher als das Ideal liegt.
```

Bei einer **echten Endpunkt-zu-Endpunkt-Verbindung** (beide Wände teilen den Knoten als Startpunkt/Endpunkt) liegt der Nachbar-`main`-Endpunkt **= geteilte Ecke** zwangsläufig näher am Origin als der korrekte Sub-Miter-Punkt. Die Sub-Verlängerung wird damit auf die Ecke zurückgezogen → keine Gehrung der gegenüberliegenden Kante.

Phase-5 ist nur für **T-Stöße** sinnvoll (Wand-Endpunkt liegt auf der Flanke einer durchgehenden Nachbarwand): dort soll die Wand an der Flanke des Nachbarn stoppen.

### b) Mittellinie verbindet sich nicht
- **Renderer-Helper** (`Renderer.ts`, Z. 876–906) zeichnet `lines.helpCorners` aus rohem `computeWallLines(wall.corners, …)` – keinerlei Heal-Aufruf, daher nur die Offset-Strecke der Einzelwand.
- **WallTool-Live-Preview** (`WallTool.ts`, Z. 235–248) berechnet `computeWallLines(allCorners, …)` für die im Bau befindliche Polylinie – ohne Heal gegen die bereits existierenden Scene-Wände.

## Plan

### 1) `src/cad/wallHeal.ts` – Phase-5-Klemmung knoten-aware
In `healEnd`, vor dem Phase-5-Block (Z. 117):

- Aus dem Graph für diesen Endpunkt-Knoten ermitteln, ob es **mindestens einen** Nachbarn mit `kind === "tjunction"` oder mit echtem Flanken-Hit auf der Eigenwand gibt.
- Wenn **alle** anderen Inzidenzen am Knoten reine Endpunkte sind („start"/„end") → Klemmung **überspringen** (true endpoint-to-endpoint join → Gehrung des Sub muss bestehen bleiben).
- Wenn mindestens eine T-Stoß-Inzidenz vorliegt → bisherige Klemmung beibehalten, aber den Nachbarn-Kandidatensatz auf die T-Stoß-Wände einschränken (verhindert, dass eine zusätzliche endpunktig verbundene Wand das Ergebnis stört).

Fallback ohne Graph: vorhandenes Verhalten unverändert.

### 2) `src/cad/wallHeal.ts` – `help` (Mittellinie) ebenfalls heilen am Endpunkt-Knoten
`computeHealedWallLines` heilt heute `main/help/sub` über `intersectRayWithPoly`. Der `cleanupAtNodes`-Pass bügelt aber nur `main`. Sicherstellen, dass:
- `helpCorners[idx]` an einem echten Endpunkt-zu-Endpunkt-Knoten auf den Schnitt mit der Nachbarn-`help`-Linie gesetzt wird (passiert heute schon, wird aber durch Phase-5-Klemmung mit Nachbar-`main` ggf. wieder zerstört → durch Fix in (1) gelöst).

Kein zusätzlicher `cleanupAtNodes`-Eintrag nötig.

### 3) `src/cad/Renderer.ts` – Helper-Mittellinie aus geheilter Geometrie
In `_drawWallsForLabel` (Z. 876–906) statt `computeWallLines(wall.corners, …)` auf `computeHealedWallLines(wall, this.scene.walls, this.scene.getWallTopology())` umstellen.
- Bezugslinie weiterhin direkt aus `wall.corners` (das ist und bleibt die unveränderte Referenz).
- `helpCorners` und (falls für künftige Helper relevant) `subCorners` aus der geheilten Variante → Mittellinien laufen an Knoten zusammen.

### 4) `src/cad/WallTool.ts` – Live-Preview gegen Scene heilen
In `_drawOverlay` (ab Z. 240):
- Eine temporäre Pseudo-Wand bauen (`corners = allCorners`, `thicknessM`, `referenceSide`, `kind`, `priority` aus den aktuellen Settings; `labelId` wie der aktuelle Tool-Default).
- Heal-Eingabe: `others = scene.walls.filter(labelId == aktueller Layer && id !== preview)`; Graph ad-hoc aus `[…others, pseudo]` via `WallTopologyGraph.fromWalls` aufbauen (es existiert bereits ein Builder; falls nicht öffentlich, kleinen Wrapper exportieren).
- `computeHealedWallLines(pseudo, others, graph)` zeichnen statt rohes `computeWallLines`.
- Ergebnis: `main`, `help` (gestrichelte Mitte) und `sub` der Vorschau verbinden sich sichtbar mit der existierenden Wand am Snap-Endpunkt.

Performance: Nur ein Heal-Aufruf pro Mousemove des Wand-Tools – akzeptabel.

### 5) Keine Änderung an
- `wallUnion.ts` / Solid-Pipeline (profitiert automatisch von (1)).
- `SelectTool` Hit-Test (weiter `buildWallSolidRing` ohne Heal).
- Topologie-/Cache-Invalidierung.

## Erwartetes Ergebnis

- Stumpfer/spitzer Außenknoten zweier AW: Sub-Linie beider Wände läuft in einen gemeinsamen Gehrungspunkt → das blaue Solid hat keinen rechteckigen „Stumpf" mehr neben dem geteilten Eckpunkt.
- Beim Zeichnen einer neuen Wand, die mit ihrem Startpunkt auf einer vorhandenen Wand snappt, läuft die gestrichelte Mittellinie der Vorschau bis in die Nachbarwand hinein (kein Versatz mehr).
- T-Stöße (IW endet auf AW-Flanke) bleiben unverändert sauber (Phase-5 weiterhin aktiv, wenn T-Inzidenz vorhanden).

## Nicht im Scope

- 3D, Profil-/Mehrschichtwände, manuelle Override-Winkel, X-Knoten mit mehr als 2 Wänden gleicher Priorität (funktioniert bereits über Union).
