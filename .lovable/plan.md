# Selektion: V-Ausschnitt am Stoß zur Nachbarwand schließen

## Beobachtung

Vorherige Korrektur clippt das Selektions-Overlay gegen alle Nachbarwände. Folge: Greift der **Heal-Zipfel der Nachbarwand** in den Körper der selektierten Wand hinein (Bild: V-förmiger Ausschnitt unten), wird dieser Bereich aus dem blauen Highlight weggeschnitten — die graue Nachbar-Spitze ragt sichtbar in die selektierte Wand hinein, statt zu „verschmelzen".

## Ursache

`Renderer.ts` Z. 856 ff. zieht die volle `nbrHealed`-Union von `selHealed` ab. Das entfernt zwei Dinge zugleich:

- **Zipfel A** — Teil der selektierten Wand, der per Heal in den Nachbar hineinragt (war Ziel der letzten Korrektur, soll weiterhin entfernt werden).
- **Zipfel B** — Teil des Nachbarn, der per Heal in den **Rohkörper** der selektierten Wand hineinragt (soll erhalten bleiben, da er innerhalb des „echten" Wand-Rechtecks der Selektion liegt).

Aktuell wird auch Zipfel B subtrahiert → V-Notch.

## Plan

### `src/cad/Renderer.ts` — Subtrahieren nur außerhalb des Rohrechtecks
Im `isSelected`-Block:

1. `selHealed` (wie bisher) per `buildHealedWallSolidRing`.
2. **Neu:** `selRaw` per `buildWallSolidRing(wall)` — das ungeheilte Wand-Rechteck der selektierten Wand.
3. `nbrUnion` (wie bisher) Union aller anderen Healed-Solids im selben Label.
4. **Maske:** `subtractMask = polygonClipping.difference(nbrUnion, [selRawPC])` — Nachbar-Anteile, die OUTSIDE des selektierten Rohkörpers liegen (= Zipfel A der selektierten Wand und Reste der Nachbarwände, nicht Zipfel B).
5. `displayMulti = polygonClipping.difference([selHealedPC], subtractMask)`.
6. Fallback bei Fehler: rohe `selHealed`-Darstellung wie heute.

### Effekt
- Zipfel A (Selektion ragt in Nachbar): liegt außerhalb `selRaw` → in `subtractMask` enthalten → wird entfernt. ✓
- Zipfel B (Nachbar ragt in selektiertes Rohrechteck): liegt innerhalb `selRaw` → NICHT in `subtractMask` → bleibt im Display erhalten, der V-Notch verschwindet. ✓
- An gleichpriorisierten Stößen wirkt die Selektion damit wie ArchiCAD: die Wand „verschmilzt" optisch mit dem Nachbarn, ohne in dessen Außenbereich überzuragen.

### Nicht im Scope
- Hit-Test, Helper, Union-Pipeline unverändert.
