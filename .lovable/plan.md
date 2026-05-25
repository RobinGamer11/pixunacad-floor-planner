## Problem

Selektion einer Wand zeigt das eigene geheilte Solid abzüglich **aller** anderen Wand-Solids im selben Label (Renderer.ts, ~Zeile 867–880). Bei zwei gleich priorisierten Wänden (z. B. beide AW), die aneinander andocken, ragt das geheilte Solid der neuen Wand 1 in das Solid der bestehenden Wand 2 hinein (Gehrungs-/Andock-Spitze). Beim Selektieren von Wand 2 wird genau dieser Bereich abgezogen → sichtbare Kerbe, obwohl er optisch zur Vereinigung gehört.

Im Renderpfad der Wandfüllung wurde dies bereits durch die tier-basierte Subtraktion in `wallUnion.ts` gefixt (gleiche Priorität schneidet sich nicht). Die Selektions-Overlay-Logik in `Renderer.ts` macht jedoch noch das alte „gegen alles andere abziehen".

## Fix

In `src/cad/Renderer.ts` (Block ab ~Zeile 860, `if (isSelected) { ... }`) die `otherPolys`-Sammlung so einschränken, dass nur Wände mit **strikt höherer Priorität** als die selektierte Wand einbezogen werden:

```ts
for (const ow of this.scene.walls) {
  if (ow.id === wall.id) continue;
  if (ow.labelId !== labelId) continue;
  if (ow.corners.length < 2 || ow.thicknessM <= 0) continue;
  if ((ow.priority ?? 0) <= (wall.priority ?? 0)) continue; // NEU
  ...
}
```

Damit:
- Gleichrangige Nachbarwände (AW↔AW, IW↔IW) bleiben in der Selektionsdarstellung vollständig — das Andock-/Gehrungs-Solid der selektierten Wand wird nicht mehr fälschlich beschnitten.
- Höher priorisierte Wände schneiden niedrigere weiterhin korrekt aus (z. B. AW schneidet IW-Selektion an der AW-Kante).
- Verhalten ist konsistent mit der tier-basierten Logik in `wallUnion.ts`.

## Nicht geändert

- `wallUnion.ts` (Füllung), Heal-/Topologie-Pipeline, Hover, Mittellinien-Overlay.
