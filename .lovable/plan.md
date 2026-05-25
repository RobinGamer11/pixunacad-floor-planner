## Ziel

Das Wand-Werkzeug auf das **2D-Verhalten von ArchiCAD** ausbauen — zwei Eingabemodi, vollwertige Bezugsseiten-Logik (inkl. nachträglichem Wechsel), Auto-Trim für neu gezeichnete UND für nachträglich verschobene Endpunkte, sowie ein vollständiges Verschneidungs- und Gehrungsmodell (Priorität AW > IW, echte Gehrung bei gleicher Priorität, sauberer T-Stoß).

Die in den letzten Iterationen aufgebaute Pipeline (Bezugslinie → parametrischer Wandkörper → Boolean-Union → Outer-Boundary) bleibt **das Fundament**. Wir ergänzen die fehlenden ArchiCAD-Bausteine darüber.

---

## 1. Eingabemodi

Zwei Methoden, umschaltbar in der Werkzeug-Seitenleiste (Radio-Toggle „Einzeln / Verkettet"):

| Modus | Verhalten |
|---|---|
| **Einzeln** (Default) | Klick → Klick erzeugt eine Wand, Werkzeug bleibt aktiv für die nächste. Aktuelles Verhalten. |
| **Verkettet** (Polywand) | 1. Klick = Start. Jeder weitere Klick erzeugt ein neues Wandsegment, dessen Start exakt am vorigen Endpunkt liegt. **Doppelklick / Enter / ESC** beendet. Jedes Segment ist eine eigenständige `Wall`, die Endpunkte werden topologisch verbunden (gemeinsamer Knoten → kein Trim nötig). |

Vorschau im verketteten Modus zeigt das aktuelle Segment + den fertigen Anschluss am vorigen Endpunkt (Live-Gehrung).

---

## 2. Bezugsseite — vollständige Logik

### a) Drei Seiten (`outer` / `center` / `inner`)
Bleibt im Settings-Panel.

### b) Live-Seitenwechsel beim Zeichnen
- Cursor zeigt die **vorgesehene Wandlage** als hellen Schatten, sobald die Richtung des ersten Segments definiert ist.
- **Leertaste während des Zeichnens** rotiert: `outer → center → inner → outer`. Die bereits gesetzten Bezugslinien-Punkte bleiben unverändert; nur die Offset-Seite ändert sich.

### c) Nachträgliches Umschalten ohne Geometrieverlust
- Im Wand-Hub (Selektion einer Wand) gibt es einen Button **„Bezugsseite wechseln"** mit drei Optionen.
- Beim Wechsel bleibt die **Bezugslinie (`wall.corners`) unverändert**; nur `referenceSide` wird gesetzt. Visuell wandert die Wand entsprechend.
- Sonderoption „Bezugsseite an aktuelle Sub-Linie binden": neue Bezugslinie = bisherige Sub-Linie, `referenceSide` invertiert → Wand bleibt visuell exakt am selben Ort, die Bezugslinie verschiebt sich aber auf die andere Wandkante. Wichtig für saubere Anschlussplanung.

---

## 3. Anschluss-Logik (Auto-Trim + Reference-Line-Cleanup)

### a) Beim Zeichnen (bereits umgesetzt — wird verfeinert)
- Reichweite = `max(8 cm, thickness * 1.2)` — wie bisher.
- Priorität der Trim-Ziele: **Endpunkt > interner Eckpunkt > Projektion aufs Segment** (T-Anschluss).
- **Neu:** Trim respektiert die ArchiCAD-Regel „Verbinde nie zwei AW-Bezugslinien rechtwinklig im Inneren einer dritten" — bei Mehrdeutigkeit gewinnt das Snap-Ziel mit der höheren Wand-Priorität (AW > IW).

### b) Beim Verschieben eines Wand-Endpunkts (NEU)
- Wird ein Eckpunkt-Snap einer bestehenden Wand per Hub/Drag bewegt, läuft am Drop dieselbe Trim-Pipeline:
  1. Endpunkt-Snap auf nahe Bezugslinien-Endpunkte/-Edges anderer Wände.
  2. Anschließend `runWallTopologyMaintenance` für Auto-Split & Auto-Merge.
- Damit dockt **auch Bestand** sauber an, sobald man einen Punkt schiebt.

### c) Reference-Line-Cleanup
Nach jedem Trim läuft ein deterministischer Cleanup-Pass über die im Knoten zusammenlaufenden Wand-Bezugslinien:
1. Knoten-Cluster (`NODE_TOL = 5 cm`) — alle Endpunkte exakt auf die Cluster-Position snappen.
2. Falls zwei kollineare Wände gleicher Eigenschaften zusammentreffen ohne dritte Nachbarschaft → Auto-Merge zu einer Wand (bereits implementiert, bleibt aktiv).
3. T-Stoß-Endpunkt im Inneren einer Bezugs-Edge → Auto-Split (bereits implementiert, bleibt aktiv).

---

## 4. Verschneidung & Gehrung (ArchiCAD-Verschneidungspriorität)

Die Boolean-Union allein verschmilzt heute alle gleichfarbigen Wandkörper. Das ist nicht ArchiCAD-konform — dort entscheidet die **Wand-Priorität**, was an einem Knoten durchläuft und was stumpf anstößt.

### a) Wandtyp-Priorität
- `outer` (AW) > `inner` (IW) > weitere künftige Typen (Stütze, Brüstung).
- An jedem Knoten wird die Wand mit höchster Priorität als **durchlaufend** behandelt, niedrigere Wände werden an deren Bezugslinie **getrimmt**.
- Umsetzung: pro Knoten wird die Bezugslinie der niedrigeren Wand auf die Innenkante der höheren Wand projiziert, bevor die Solids gebaut werden.

### b) Gehrung bei gleicher Priorität (Miter-Join)
- Zwei AW gleicher Dicke und gleichen Stils, die im Winkel ≠ 180° aufeinanderstoßen → **gemeinsame Gehrung am Winkelhalbierenden**.
- Implementiert als Vorab-Trim: pro Knotenpaar werden die zugewandten Offset-Linien gegeneinander geschnitten und die Wand-Enden auf diese Schnittpunkte gekürzt/verlängert. Erst danach läuft die Union.
- Bei extrem spitzem Winkel greift das vorhandene **Miter-Limit** (Bevel-Fallback in `offsetPolyline`).

### c) Echter T-Stoß
- Endet die Bezugslinie einer Wand auf der Bezugslinie einer durchgehenden Wand → die anstoßende Wand wird an die **innen liegende Offset-Kante** der durchgehenden Wand getrimmt, **nicht** an deren Bezugslinie.
- Die durchgehende Wand bleibt unverändert; nur das End-Solid der anstoßenden Wand wird vor der Union beschnitten.

### Reihenfolge der Knoten-Auflösung (deterministisch)
```text
für jeden Knoten n:
  1. Sortiere inzidente Wände nach (Priorität ↓, dicke ↓, id ↑)
  2. Markiere die höchstpriorisierte als "durchlaufend"
  3. Für jede niedrigere Wand:
       - falls gleiche Priorität wie ein Nachbar → Gehrung (winkelhalbierend)
       - sonst → Trim auf innere Offset-Kante des höher priorisierten Nachbarn
  4. Erst dann: Solid bauen + Union pro Stil-Gruppe
```

---

## 5. UI-Ergänzungen (Werkzeug-Seitenleiste & Wand-Hub)

| Ort | Element |
|---|---|
| Werkzeug-Seitenleiste | Toggle „Eingabemodus: Einzeln / Verkettet" |
| Werkzeug-Seitenleiste | Hinweis „Leertaste = Bezugsseite wechseln" während Zeichnen |
| Wand-Hub (Selektion) | Segmented Control „Bezugsseite: Außen / Mitte / Innen" |
| Wand-Hub (Selektion) | Sekundär-Button „Bezugsseite an gegenüberliegende Kante binden" |
| Wand-Hub (Selektion) | Priorität-Anzeige (AW/IW) als Badge, Wechselbar |

---

## 6. Technische Umsetzung (Dateien & Reihenfolge)

| # | Datei | Änderung |
|---|---|---|
| 1 | `WallTool.ts` | Mode-State (`single` / `chain`), Leertaste-Handler für Live-Seitenwechsel, Chain-Vorschau. |
| 2 | `components/CadEditor.tsx` (Wand-Panel) | UI-Toggle Eingabemodus + Hint. |
| 3 | `SelectTool.ts` / Wall-Hub | Endpunkt-Drag triggert `trimEndpointsToNeighbors` + Maintenance. |
| 4 | `Hub.ts` / Wand-Hub-Komponente | Bezugsseite-Switch + „auf gegenüberliegende Kante binden" + Prio-Badge. |
| 5 | `wallMiter.ts` (NEU) | `resolveNodeMiters(scene)` — sortiert Knoten-Inzidenzen, schreibt pro Wand-Endpunkt einen **Trim-Override** (verlängert/verkürzt corners ohne die topologische Bezugslinie zu verschieben → Override-Punkte werden NUR beim Solid-Bauen verwendet). |
| 6 | `wallSolid.ts` | Akzeptiert optionale Trim-Overrides pro Wand-Endpunkt. |
| 7 | `wallUnion.ts` | Nimmt die getrimmten Solids als Eingabe; Union wie gehabt. |
| 8 | `wallTopologyMaintenance.ts` | Bleibt; Cleanup-Pass ergänzt um Knoten-Cluster-Snap (alle Endpunkte exakt auf Cluster-Mittelpunkt). |

**Datenmodell-Erweiterung:**
- `Wall.priority?: number` (default 100 für `outer`, 200 für `inner` — niedriger = höher).
- Persistenz: rückwärtskompatibel (default fallback).

---

## 7. Auslieferungsreihenfolge

1. **UI + Polywand-Modus** (Schritt 1, 2) — sofort spürbarer ArchiCAD-Feeling.
2. **Bezugsseite Live-Wechsel + nachträglich** (Schritt 1, 4).
3. **Endpunkt-Drag-Auto-Trim** (Schritt 3) — fixt Bestand.
4. **`wallMiter` + Knoten-Auflösung** (Schritt 5, 6) — echte ArchiCAD-Verschneidungen.
5. **Prio-Badge & Wand-Hub-Feinschliff** (Schritt 4).

---

## 8. Bewusst NICHT enthalten (für später)

- 3D-Wandkörper / Höhen.
- Wandbibliothek mit mehrschichtigen Aufbauten (Verbundwand).
- Fenster-/Tür-Öffnungen.
- Wandprofile (geneigte/profilierte Wände).
- Mehrere Stockwerke.

Diese gehören in spätere Phasen, wenn der 2D-Editor stabil läuft.
