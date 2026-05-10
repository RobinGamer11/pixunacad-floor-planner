## Problem

Bei einer T-Kreuzung (neue Wand stößt mit Endpunkt ins Innere einer bestehenden Wand) passieren aktuell zwei Dinge:

1. **Kein Auto-Split** der getroffenen Wand. `runAutoSplit` in `wallTopologyMaintenance.ts` verlangt zusätzlich, dass die getroffene Wand hinter dem Treffpunkt noch in eine *dritte* Wand übergeht (`continuesToThirdWall`). Ein reiner T-Stoß (nur 2 Wände am Knoten) erfüllt die Bedingung nicht → kein Split.
2. **Überlappung** zwischen den Wänden. Ohne Split bleibt die getroffene Wand am Treffpunkt ein durchgehendes Segment ohne Knoten. Im Topologie-Graph entsteht nur eine T-Inzidenz, kein Endpunkt-Knoten. Sub-/Hilfslinien der bestehenden Wand laufen ungehindert weiter und überlagern den Wandkörper der schräg eintreffenden neuen Wand. Der Heal-Code geht davon aus, dass am Treffpunkt ein echter Knoten existiert.

Sobald die getroffene Wand am Treffpunkt gesplittet wird, entstehen dort zwei echte Endpunkte. Heal + Cleanup mitern dann alle drei Wand-Endpunkte am gemeinsamen Knoten — die bestehende Logik (die bei "echten" T-Kreuzungen mit dritter Wand bereits sauber funktioniert) greift identisch.

## Forward-Look: Mehrschichtige Wandaufbauten

Wichtige Voraussetzung für künftige mehrschichtige Wände (ArchiCAD-Stil, Schichten mit Prioritäten): T-Stöße müssen *immer* einen echten Knoten erzeugen, sonst kann später keine Schicht-Priorisierung am T-Punkt entscheiden, welche Schicht durchläuft und welche stoppt. Der jetzige Fix ist also Pflicht-Grundlage und bleibt für mehrschichtige Wände unverändert nützlich — nur die Heal-/Mitering-Logik wird später um pro-Schicht-Prioritäten erweitert.

## Lösung

In `runAutoSplit` die `continuesToThirdWall`-Bedingung entfernen. Jeder Endpunkt-im-Inneren-Treffer splittet die getroffene Wand am Treffpunkt.

Bestehende Sicherheitsnetze verhindern Falsch-Splits:

- `findInteriorHit` mit `t ∈ (0.02, 0.98)` schließt Treffer nahe der Endpunkte aus.
- `splitWallAt` lehnt mit `MIN_SEG_LEN_M` zu kurze Segmente ab.
- `runAutoMerge` läuft im selben Pass: bei reiner Berührung ohne echten Driver-Knoten würde es die zwei kollinearen Hälften wieder verschmelzen. Bei einem echten T-Stoß ist die Driver-Wand am Knoten präsent, `anyOtherWallPassesNear` blockt das Re-Mergen → korrekt.

## Änderungen

**`src/cad/wallTopologyMaintenance.ts`**
- In `runAutoSplit`: die Zeile `if (!continuesToThirdWall(scene, ow, hit, driver)) continue;` entfernen.
- Funktion `continuesToThirdWall` (jetzt ungenutzt) löschen.

## Verifikation im Preview

1. Horizontale Wand zeichnen.
2. Schräge Wand von oben-links zur Mitte der ersten zeichnen → Erwartung: getroffene Wand wird an Treffpunkt geteilt, alle drei Endpunkte mitern sauber, keine Überlappung.
3. Gegentest: Bestehende echte T-Kreuzungen (mit dritter Wand) und reine Endpunkt-an-Endpunkt-Verbindungen weiterhin korrekt — keine Regression.
