## Plan

Ich fixe die Wand-Union so, dass eine neu andockende Wand die bestehende Wand nicht mehr ausschneidet, wenn beide Wände dieselbe Priorität haben.

### Änderungen

1. **Subtraktion in `wallUnion.ts` auf Prioritäts-Tiers umstellen**
   - Wände gleicher Priorität werden nicht mehr gegenseitig voneinander abgezogen.
   - Nur Wände mit strikt höherer Priorität schneiden niedrigere Prioritäten aus.

2. **Bestehende visuelle Union beibehalten**
   - Gleiche Wandtypen/-prioritäten bleiben optisch sauber verbunden.
   - Unterschiedliche Styles bleiben weiterhin getrennt renderbar, aber ohne falsche Löcher in der Bestandswand.

3. **Mittellinie bleibt separat**
   - Dieser Fix konzentriert sich auf das falsche Ausschneiden der Wandflächen.
   - Die gestrichelte Mittellinie kann danach gezielt gekürzt werden, falls sie noch störend tief hineinragt.

### Technische Details

Aktuell wird die Maskierung bucketweise akkumuliert. Dadurch kann eine gleich priorisierte Wand aus einer anderen gleich priorisierten Wand herausgeschnitten werden, wenn sie in einem anderen Style-Bucket landet.

Ich ändere das zu:

```text
Prioritäten absteigend sammeln
für jede Priorität:
  Maske = Union aller bereits höheren Prioritäten
  alle Buckets dieser Priorität nur gegen diese höhere Maske schneiden
  danach diese Priorität zur Maske hinzufügen
```

Ergebnis: Gleichrangige Wände docken sauber an, ohne sich gegenseitig Löcher auszuschneiden.