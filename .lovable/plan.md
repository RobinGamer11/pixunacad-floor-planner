## Plan: 3 CAD-Verbesserungen

### 01 — Rechtsklick auf Anfangspunkt erzeugt Hilfslinie
**Tools:** `LineTool` (für Linien + Hilfslinien-Modus).

- In `LineTool.update`, vor dem bestehenden `if (input.rightClicked)`-Block: prüfen, ob `state === "drawing"` und der Cursor (oder aktueller Snap-Punkt) sehr nah an `this.currentPoint` liegt (Pixel-Toleranz wie bei normalen Snaps, ~8 px).
- Wenn ja: behandeln wie `_toggleGuideAnchorFromSnap` mit einem synthetischen Punkt-Snap, der `point = this.currentPoint` setzt — d. h. eine Anker-Hilfslinie wird durch den ersten gesetzten Punkt gezogen (gleiche horizontale/vertikale Standardrichtung, gleiche Toggle-Semantik).
- Keine Geometrie-Änderung im Scene-Graph; Guide-Definition läuft über denselben Definitions-Speicher (`_buildGuideDefinitions`).

### 02 — Auswahl auf Seitenrand/Rahmen wieder ermöglichen
**Tools:** `SelectTool`, evtl. `Renderer`/Margin-Frame-Layer.

- Untersuchung: Aktuell vermutlich blockiert die Margin-/Rahmen-DOM-Schicht Klicks (oder ihr Hit-Test läuft vor dem Objekt-Hit-Test). Sie soll nur als Snap-Quelle (Punkte/Kanten) dienen, **nicht** als auswählbares Objekt und auch keine darüberliegenden Objekte verdecken.
- Fix:
  - DOM-Layer: `pointer-events: none` für die Margin-Frame-Visuals sicherstellen.
  - Im SelectTool-Hit-Test: Objekt-Hits (Segmente, Hatches, Texte, Sticker, Documents) gewinnen **immer** gegenüber Rahmen-/Seitenrand-Snap-Geometrie. Rahmen/Seitenränder werden im normalen Hit-Test gar nicht erst geprüft.
- Layer-Panel: prüfen, ob Rahmen/Seitenränder dort als pseudo-Ebene auftauchen — falls ja, aus der Liste entfernen (sie haben keine ID-Ebene).

### 03 — „Mittelpunkt"- & „Teilungs"-Snaps für Linien/Hilfslinien
**Datenmodell (`Scene`/`Segment`):**
- Neue optionale Felder pro Segment:
  - `midpointSnap?: boolean`  → Standard `false`.
  - `divisionSnap?: number`   → ganze Zahl ≥ 2; Standard `undefined`. Wert 2 ist identisch zu `midpointSnap=true` (UI behandelt sie als getrennte Toggles wie vom User beschrieben).

**Snap-Engine:**
- Beim Aufbau der Snap-Punktliste pro sichtbarem Segment zusätzlich generieren:
  - Falls `midpointSnap`: 1 Punkt auf 50 %.
  - Falls `divisionSnap = N`: `N-1` interne Punkte auf `k/N` (1 ≤ k ≤ N-1).
- Diese Punkte werden wie reguläre `SnapType.POINT` behandelt (Snap-Glow, Hub-Snap, Hilfslinien-Snap, Anker).

**Renderer:**
- Wenn das Segment ausgewählt oder gehovert ist, kleine Snap-Markierungen (helle Punkte mit dünnem Rahmen) an Mittelpunkt/Teilungspunkten zeichnen, damit sie sichtbar sind. Andernfalls unsichtbar (nur Snap aktiv).

**UI (Inspector / Linien-Settings-Panel):**
- Zwei neue Reihen im Linien-Inspector und im Hilfslinien-Inspector:
  - „Mittelpunkt" – Toggle (Schalter).
  - „Teilung" – Number-Input (leer = aus, ≥ 2). Setzt `divisionSnap`.
- Werte werden direkt auf das aktuell selektierte Segment geschrieben (bzw. bulk bei Multi-Select gleicher Art).

### Reihenfolge & Aufwand
1. **01** Anfangspunkt-Guide (klein, isoliert in LineTool).
2. **02** Rahmen-Blocker fixen (Hit-Test + DOM pointer-events) — auch klein.
3. **03** Mittelpunkt/Teilung — größer (Datenmodell + Snap + Renderer + Inspector); Migration ist abwärtskompatibel (optionale Felder).

Soll ich genau so umsetzen, oder einzelne Punkte zuerst (z. B. nur 01 + 02, 03 separat)?
