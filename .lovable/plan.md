## Plan: Auswahl in der Projektmappen-Seite reparieren

1. **MiniCad-Auswahlfehler beheben**
   - In der eingebetteten CAD-Engine (`MiniCad`) fehlt dem vom normalen CAD-Editor wiederverwendeten `SelectTool` ein `doorTool`.
   - Dadurch bricht `SelectTool.update()` bei jedem Auswahl-Tick mit `Cannot read properties of undefined (reading 'hitDoorAt')` ab.
   - Fix: Den Tür/Fenster-Hit-Test im Auswahlwerkzeug nur ausführen, wenn `doorTool.hitDoorAt` in der jeweiligen App-Umgebung existiert.

2. **Leere-Fläche-Pan blockiert Klicks vermeiden**
   - Auf der Projektmappen-Seite startet aktuell ein Links-Maus-Drag/Pan bereits im Auswahlmodus auf dem Canvas-Viewport.
   - Das kann normale Auswahlklicks abfangen, bevor die eingebettete Auswahl aktiv greifen kann.
   - Fix: Im Auswahlmodus keine normale Links-Klick-Pan-Aktion mehr starten; Pan bleibt über Mittelmaus bzw. Alt+Links erhalten.

3. **Verhalten prüfen**
   - In der Projektmappen-Seite testen, dass Objekte beim Hover weiterhin blau werden und nach Klick aktiv selektiert bleiben.
   - Prüfen, dass die rechte Einstellungs-/Bearbeitungsanzeige nach Auswahl wieder aktualisiert wird und keine `MiniCad tick error`-Meldungen mehr auftreten.