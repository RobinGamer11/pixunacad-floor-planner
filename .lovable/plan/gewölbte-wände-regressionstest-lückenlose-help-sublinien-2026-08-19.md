# Gewölbte Wände: Regressionstest + lückenlose Help-/Sublinien

## Ziel

1. Ein automatisierter Test, der gewölbte Wände mit Nachbarwänden über einen ganzen Wölbungsbereich prüft: Fangpunkte exakt getroffen, Wandkörper ohne Lücke verbunden.
2. Die verbleibende Ursache beheben, dass Help- und Sublinien sich ab einer bestimmten Wölbung nicht mehr treffen.

## Zur grauen Linie

Die graue Linie ist nur die Bezugs-Sehne (gerade Verbindung der beiden Fangpunkte) und wird ausschließlich zur Anzeige/Auswahl gezeichnet — sie ist nicht die Ursache. Die Ursache liegt in der Wandheilung: die Verlängerung der Help-/Sublinie wird aus der geraden End-Tangente berechnet und seit der letzten Änderung zusätzlich auf ein dickenabhängiges Maß gekürzt. Bei starker Wölbung laufen die Tangenten der beiden Nachbarwände stark auseinander, der echte Gehrungspunkt liegt weit außerhalb dieses Maßes, die Linie wird abgeschnitten → Lücke. Die Hauptlinie hat diesen Effekt nicht, weil sie zusätzlich über den Cleanup-Pass auf den gemeinsamen Knotenpunkt gesnappt wird — Help/Sub sind vom Cleanup ausgenommen.

## Umsetzung

### 1. Heilung für Help-/Sublinien bei Wölbung

- In `src/cad/wallHeal.ts`: Wenn der ideale Gehrungspunkt einer Help-/Sublinie das Kürzungsmaß überschreitet oder gar kein Schnitt gefunden wird, nicht mehr stumpf abschneiden, sondern den Endpunkt auf den gleichnamigen Linien-Endpunkt der Nachbarwand am selben Knoten führen (bzw. auf den Mittelwert bei gleichrangigen Wänden). Damit schließen Help- und Sublinie auch bei starker Krümmung.
- Cleanup-Pass (`cleanupAtNodes`) so erweitern, dass er `help` und `sub` einbezieht, aber nur dann, wenn die reguläre Gehrung nicht zustande kam — bereits korrekt geheilte Gehrungen bleiben unangetastet.
- Kürzungsmaß krümmungsabhängig machen: Wölbung der End-Kante geht in das erlaubte Gehrungsmaß ein, statt nur Wanddicken.

### 2. Regressionstest

Neue Datei `src/cad/wallBulgeHeal.test.ts` (Vitest, ohne DOM):

- Testszenarien: gerade Wand + gewölbte Nachbarwand am gemeinsamen Endpunkt, zwei gewölbte Wände am Knoten, T-Stoß mit gewölbter Wand, jeweils für Bezugsseite außen/mittig/innen.
- Wölbungen als Parameterreihe (z. B. 0, ±0.2, ±0.5, ±0.9, ±1.5), damit der bisher fehlerhafte Bereich abgedeckt ist.
- Geprüft wird pro Szenario:
  - Der Wandkörper (`buildHealedWallSolidRing`) enthält die Bezugs-Endpunkte exakt (Fangpunkt-Treue, Toleranz 1e-9).
  - Die Help-/Sub-Endpunkte beider Wände am gemeinsamen Knoten liegen innerhalb einer engen Toleranz aufeinander (kein Auseinanderlaufen).
  - Die Boolean-Union (`getWallUnionGroups`) liefert für den Wandzug genau ein zusammenhängendes Polygon (keine zwei getrennten Flächen = keine Lücke).
  - Die Ringfläche bleibt plausibel (keine explodierende Gehrung): Fläche im Bereich Länge × Dicke mit Sicherheitsfaktor.

### 3. Prüfung

- `vitest run src/cad` (der neue Test plus bestehende Wandtests), Typecheck und Produktions-Build.

## Betroffene Dateien

- `src/cad/wallHeal.ts` (Heilungslogik Help/Sub, Cleanup-Erweiterung)
- `src/cad/wallBulgeHeal.test.ts` (neu)
- ggf. `src/cad/wallSolid.ts` nur, falls der Test eine Ringschwäche aufdeckt
