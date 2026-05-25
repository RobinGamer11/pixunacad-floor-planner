## Problem

Im neuen Render-Code wird die selektierte Wand als volles blaues Solid gezeichnet und ALLE anderen Wände werden danach komplett darüber gerendert. Das funktioniert für Wand 1 selektiert (Branch dockt an Wand 2 an), erzeugt aber bei Wand 2 selektiert eine sichtbare Kerbe: die geheilte Form von Wand 1 reicht in den Körper von Wand 2 hinein und übermalt einen Teil der blauen Selektion.

## Ursache

T-Stöße sind asymmetrisch: eine Wand ist „Host" (durchgehend), die andere „Branch" (endet an der Host-Wand). Die Topologie kennt diese Rolle bereits über `node.incidents[].kind === "tjunction"` (die T-Junctionende Wand ist die Branch, die andere die Host).

Der aktuelle Renderer ignoriert das beim Übermalen.

## Lösung

Beim Neuzeichnen der anderen Wände über das blaue Overlay die Rolle pro Wand auswerten:

- **Host gegenüber der selektierten Wand** (selektierte Wand T-junctioniert in diese Wand): unverändert vollständig drüber zeichnen → selektierte Branch endet optisch an der Host-Wand.
- **Branch gegenüber der selektierten Wand** (diese Wand T-junctioniert in die selektierte Wand): vor dem Zeichnen das Solid der selektierten Wand abziehen → Branch endet an der blauen Kante, selektierte Host bleibt komplett blau.
- **Sonst** (kein T-Stoß zur Selektion): unverändert übermalen.

Konkret in `src/cad/Renderer.ts` im Selektionsblock (Zeilen 868–899):

1. Aus dem Topologie-Graph zwei Sets der Wand-IDs am Selektionsknoten bestimmen:
   - `branchesIntoSelected` – andere Wände, deren T-Junction-Inzidenz zur selektierten Wand zeigt.
   - `hostsOfSelected` – Wände, in die die Selektion selbst T-junctioniert (Endpunkt-Knoten der Selektion, andere Inzidenz mit `kind === "tjunction"`).
2. Beim Re-Draw-Loop pro „andere Wand"-Ring:
   - Wenn `wid ∈ branchesIntoSelected` → Solid mit `polygonClipping.difference` gegen das Selektions-Solid clippen und das Ergebnis zeichnen.
   - Sonst (inkl. `hostsOfSelected`) → unverändert zeichnen.

Damit:

- Wand 1 selektiert (Branch in Wand 2): Wand 2 ist Host → bleibt komplett → blaue Wand 1 dockt sauber an. ✓
- Wand 2 selektiert (Host für Wand 1): Wand 1 ist Branch → wird gegen Wand 2 geclippt → blaue Wand 2 bleibt komplett, Wand 1 endet an Wand 2's Kante. ✓

Keine Änderungen außerhalb des Selektionsblocks; `wallUnion.ts` und die Heilung bleiben unangetastet.
