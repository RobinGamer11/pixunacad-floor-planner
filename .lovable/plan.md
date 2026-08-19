# CAD-Panels: warum nichts sichtbar ist – und was noch fehlt

## Befund (geprüft)

1. **Die Vorschau zeigt einen alten Stand.** Im Code stehen die Umbenennungen bereits (`Seiten-ID`, `+ Seite` in `src/components/CadEditor.tsx`), der Dev-Server liefert für dasselbe Modul aber weiterhin `Zeichnungs-ID` und `+ Blatt` aus. Auch das rechte Panel zeigt in der Vorschau noch die alte Reihenfolge (Werkzeug / Seiten / Ebenen) und den alten Feldnamen „Liniendicke (cm)“, obwohl im Code „Seiten“ zuerst steht und das Feld „Strichstärke (cm)“ heißt. Das ist ein hängender Build-/Modul-Cache, kein fehlender Code.
2. **Pipette und Auswahl sind im Code bereits umgestellt** (eigenes Pipetten-Statuspanel, keine „Hilfe & Kurzbefehle“ mehr bei Pipette/Auswahl/Radierer) – sie werden nur wegen Punkt 1 nicht angezeigt.
3. **Das Linien-Panel im CAD ist tatsächlich noch nicht fertig.** Es hat zwar jetzt den Fensterrahmen, aber verglichen mit der Mappe fehlen: Linienart über der Farbe, Farbwahl mit Farbnamen (ToolColorPicker-Optik), doppelte Maßeingabe für die Strichstärke, und die Transparenz-Eingabe hat noch die alte Optik.

## Umsetzung

### 1. Vorschau auf den aktuellen Stand bringen
- Vite-Modul-Cache leeren und Dev-Server neu starten, danach im Browser prüfen, dass „Seiten-ID“, „+ Seite“ und die getauschte Tab-Reihenfolge wirklich ankommen.
- Erst danach die restlichen Punkte beurteilen – vieles ist bereits vorhanden.

### 2. Linien-Panel im CAD vollständig an die Mappe angleichen
In `src/components/CadEditor.tsx` (Block „Line Settings“):
- Über dem Rahmen bleiben: Modus (Linie/Freihand), Ebene, Objektart (Vektor/Pixel).
- Im Rahmen in dieser Reihenfolge: **Linienart**, **Farbe** (gleiche Optik wie Mappe, inkl. Farbbezeichnung), **Strichstärke** als zwei Felder nebeneinander (cm und mm, gekoppelt), **Transparenz** (Regler + gerahmtes Zahlenfeld mit %), danach wie bisher Pfeilspitzen.
- Standardstärke bleibt 1 cm (`src/cad/constants.ts` ist bereits gesetzt).

### 3. Freihand-Panel im CAD
- `FreeDrawSettingsPanel` ist schon eingebunden; nach dem Cache-Reset gegenprüfen, dass Linienart oben, gerahmte Buttons („Bild laden“, „Auto-Form“, „Lineal hinzufügen“) und die Zeichenseite des Lineals sichtbar sind, und fehlende Punkte ergänzen.

### 4. Abschlussprüfung
- Im laufenden CAD nacheinander Auswahl, Pipette, Linie, Freihand öffnen und per Screenshot bestätigen, dass die Panels dem Mappen-Design entsprechen.

## Technische Details
- Betroffene Dateien: `src/components/CadEditor.tsx`, ggf. `src/components/cad/FreeDrawSettingsPanel.tsx`.
- Die CAD-Linieneingaben sind ref-/DOM-gesteuert (`thicknessInputRef`, `colorInputRef`), die Mappe nutzt React-State. Die neuen Felder werden auf denselben Refs aufgesetzt, damit die Engine-Anbindung unverändert bleibt.
- Umrechnung cm ↔ mm rein in der Anzeigeschicht; die Engine speichert weiter `thicknessM` in Metern.
