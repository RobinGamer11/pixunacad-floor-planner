Ich behebe den Selektions-Renderer so, dass beim Anklicken von Wand 2 die blaue Fläche von Wand 2 nicht mehr von Wand 1 übermalt wird, während der Fall „Wand 1 angeklickt dockt an Wand 2 an“ erhalten bleibt.

Plan:
1. Im Selektionsblock von `src/cad/Renderer.ts` die T-Stoß-Erkennung korrigieren:
   - Wenn die selektierte Wand am Knoten als `tjunction` auftaucht, ist sie die durchlaufende Host-Wand.
   - Alle anderen Wände mit `start`/`end` an diesem Knoten sind Branch-Wände und dürfen beim erneuten Zeichnen nicht über dem blauen Overlay liegen.
2. Branch-Wände nicht nur mit ihrem Einzel-Ring clippen, sondern gegen das tatsächliche selektierte Overlay so subtrahieren, dass die selektierte Host-Wand sichtbar oben bleibt.
3. Falls eine Gruppe mehrere Wand-IDs enthält, die selektierte Wand konsequent aus dem Re-Draw ausschließen und Branch-Wände einzeln geclippt zeichnen.
4. Danach per TypeScript/Test-Signal prüfen, dass der Code sauber ist.

Ergebnis:
- Wand 1 ausgewählt: Wand 2 bleibt grau oben, Wand 1 dockt optisch sauber an.
- Wand 2 ausgewählt: Wand 2 bleibt komplett blau, Wand 1 übermalt das blaue Overlay nicht mehr.