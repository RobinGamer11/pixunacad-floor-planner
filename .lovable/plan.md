## Ziel

Das Wandsystem auf eine echte **BIM-/CAD-Topologie-Pipeline** umstellen. Aktuell mischt der Code Topologie und Darstellung: `computeHealedWallLines` zieht die Offset-Linien (main/help/sub) jeder Wand bis zu den **gleichnamigen Offset-Linien** der Nachbarn — genau das, was laut Anforderung verboten ist. Künftig dürfen Anschlüsse ausschließlich über die **Bezugslinien** der Wände entstehen; alle übrigen Linien sind abgeleitete Geometrie und werden über parametrische Offsets + Boolean-Cleanup rekonstruiert.

---

## Bestand (was bleibt, was geht)

| Datei | Rolle heute | Künftig |
|---|---|---|
| `Scene.Wall` (`corners`, `thicknessM`, `referenceSide`, `kind`) | Datenmodell | **bleibt** — `corners` = Bezugslinie |
| `wallGeom.ts` `computeWallLines` | Offsets aus Bezugslinie | **bleibt** als parametrische Ableitung |
| `WallTopologyGraph.ts` | Knoten-Cluster aus Endpunkten + T-Stoß-Erkennung | **bleibt + erweitert** (nur Bezugslinien) |
| `wallHeal.ts` `computeHealedWallLines` | Heal über gleichnamige Offset-Linien | **entfällt vollständig** |
| `wallTopologyMaintenance.ts` | Auto-Merge/Split | **bleibt + verschärft** (Auto-Split T-Stoß wieder aktiv) |
| `WallTool.ts` Snap-Logik | snappt Endpunkte auf alle drei Linien | **nur Bezugslinie ↔ Bezugslinie** |
| `Renderer._drawWallsForLabel` | rendert jede Wand einzeln | **rendert Boolean-Union aller Wände eines Labels** |

---

## Neue Pipeline

```text
                  ┌────────────────────────────────────────┐
                  │ 1. Topologie (NUR Bezugslinien)        │
                  │    - Snap Bezug→Bezug                  │
                  │    - WallTopologyGraph                 │
                  │    - Auto-Split / Auto-Merge           │
                  └────────────────┬───────────────────────┘
                                   ▼
                  ┌────────────────────────────────────────┐
                  │ 2. Parametrische Wandkörper            │
                  │    Für jede Wand:                      │
                  │    body = offsetPolygon(corners,       │
                  │             thickness, side)           │
                  │    (geschlossenes Rechteck/Streifen)   │
                  └────────────────┬───────────────────────┘
                                   ▼
                  ┌────────────────────────────────────────┐
                  │ 3. Lokale Gehrung an Knoten            │
                  │    Pro Knoten: Wand-Enden im Winkel-   │
                  │    bisector beschneiden (Miter Limit)  │
                  └────────────────┬───────────────────────┘
                                   ▼
                  ┌────────────────────────────────────────┐
                  │ 4. Boolean-Union aller Wandkörper      │
                  │    pro Label/Layer                     │
                  │    → ein zusammenhängendes Polygon mit │
                  │    Löchern                             │
                  └────────────────┬───────────────────────┘
                                   ▼
                  ┌────────────────────────────────────────┐
                  │ 5. Rendering                           │
                  │    - Füllfläche = Union-Polygon        │
                  │    - Kontur     = Outer-Boundary       │
                  │    - Helplines (nur Tool aktiv)        │
                  └────────────────────────────────────────┘
```

---

## Implementierung in 5 Schritten

### Schritt 1 — `WallTool` Snap nur auf Bezugslinien
- Snap-Quellen reduzieren: bestehende Wände liefern nur noch **`corners`** (= Bezugslinie) als Snap-Ziel: Endpunkte + Edge-Mittelpunkte + freie Punkte auf der Edge.
- Kein Snap mehr auf Sub-/Hilfs-Linien (Offset-Geometrie).
- Visueller Hinweis: Beim Hover über eine fremde Wand wird die Bezugslinie hervorgehoben, nicht die Außen-/Innenkante.

### Schritt 2 — Neuer Wandkörper-Generator (`wallSolid.ts`, neu)
- Funktion `buildWallSolid(wall): Polygon` baut aus `corners` + `thickness` + `referenceSide` ein geschlossenes Polygon (Streifen mit korrekt orientierten Offset-Seiten).
- Innere Knicke der Wand selbst werden mit `lineLineIntersectionInfinite` gegeneinander gegehrt (existierende `offsetPolyline`-Logik wiederverwenden), inklusive **Miter-Limit** (Cap bei z. B. 4× Wanddicke → Bevel-Fallback).

### Schritt 3 — Lokale Knoten-Gehrung (`wallMiter.ts`, neu)
- Für jede Wand am Knoten `n`:
  - Tangente in Knoten = Richtung der angrenzenden Bezugs-Edge.
  - Schnittpunkt der eigenen Außen-/Innen-Offset-Linien mit denen der **direkt benachbarten** Wand (gleicher Knoten) → Wandende auf diese Schnittpunkte trimmen.
  - Bei `>2` Wänden am Knoten: Pro Wandpaar (nach Winkel sortiert) jeweils der dem Paar zugewandten Offset-Seite.
  - Miter-Limit verhindert „explodierende Spitzen" bei spitzen Winkeln.

### Schritt 4 — Boolean-Union pro Label (`wallUnion.ts`, neu)
- Dependency: **`polygon-clipping`** (npm, MIT) — robuste, getestete Boolean-Engine, ~30 kB.
- Pro Label-Layer: alle Wand-Solids einsammeln → `union(...)` → resultierendes MultiPolygon mit Außen-Boundary + Löchern.
- Cache auf `Scene._wallUnionCache[labelId]`; invalidiert via existierendem `scene.markWallsDirty()`.

### Schritt 5 — Renderer-Umbau
- `_drawWallsForLabel` zeichnet nicht mehr Wand-für-Wand, sondern:
  1. Füllfläche = Union-Polygon mit `evenodd`-Regel (Löcher).
  2. Kontur = Outer-Boundary + Holes-Boundary mit Wandfarbe.
  3. **Keine** Sub-/Help-Linien mehr im Render (interne Stoßkanten verschwinden automatisch).
- `showWallHelpers` (nur wenn Wand-Tool aktiv oder Wand selektiert): zusätzlich Bezugslinie + Mittellinie als dünne Hilfslinie über die Union darüber zeichnen.
- Selektion: Hover/Selected einer einzelnen Wand zeichnet **deren** Solid noch einmal mit Selektionsfarbe darüber.

---

## Topologie-Wartung (verschärft)

`wallTopologyMaintenance.ts`:
- **Auto-Split wieder aktivieren** (war auf `return false` deaktiviert): Endet eine Bezugslinie strikt im Inneren einer anderen Bezugs-Edge → die getroffene Wand wird am Treffpunkt gesplittet, sodass ein echter T-Knoten im Graph entsteht.
- **Auto-Merge** bleibt: zwei Endpunkte mit identischen Wandeigenschaften und kollinear verschmelzen zu einer Wand.

---

## Migration & Risiken

- **Datenmigration**: keine — `Wall.corners` bleibt unverändert.
- **Performance**: Boolean-Union pro Layer bei jedem Render-Frame ist teuer → Cache + Invalidierung über `markWallsDirty()` zwingend.
- **Edge-Cases**:
  - Selbstüberschneidende Bezugslinie einer Wand → Solid via `offsetPolyline` kann Self-Intersections produzieren; `polygon-clipping` toleriert das.
  - Wände mit `kind="inner"` und `kind="outer"` gleichzeitig auf einem Knoten: bisher Sonderbehandlung (`outer` ignoriert `inner`) → künftig kein Sonderfall mehr, die Union behandelt beide gleichwertig; **Optionale Regel**: pro Label getrennte Union, sodass AW und IW visuell unabhängig bleiben.
- **Backwards-Compat**: alte Szenen mit gleichen Eigenschaften → identisches Render-Ergebnis nach Cleanup, ggf. **leicht** veränderte Anschlussgehrungen.

---

## Reihenfolge der Auslieferung

1. Snap-Restriktion (Schritt 1) — kleinster, sofort spürbarer Fix.
2. `wallSolid` + Renderer-Umstellung (Schritt 2 + 5 ohne Boolean) — visuelle Verifikation pro Wand.
3. Boolean-Union via `polygon-clipping` (Schritt 4).
4. Lokale Gehrung & Miter-Limit (Schritt 3) — Feinschliff.
5. Auto-Split reaktivieren (Maintenance).

---

## Frage vor Start

- OK mit Dependency **`polygon-clipping`** (~30 kB, MIT)? Alternativ: eigene Sutherland-Hodgman/Greiner-Hormann-Implementierung (deutlich mehr Code, mehr Bugs).
- Sollen AW (Außenwand) und IW (Innenwand) im Union-Pass **getrennt** unioniert werden (zwei Layer, AW und IW behalten sichtbar eigene Kontur), oder **gemeinsam** (Kontur des kompletten Wandverbunds, keine Trennung zwischen AW und IW)?
