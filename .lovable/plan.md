# Plan: Tür-Hubbox + Fenster-Werkzeug

## 1) Hubbox beim Anklicken eines Tür-Fangpunkts

- Klick auf Endpunkt-Snap einer Tür öffnet eine kleine, moderne Box am Cursor (Stil wie LineHub: dezenter Schatten, kleine Pille).
- Inhalt:
  - Symbol **Bewegen** (lucide `Move`). Klick aktiviert Move-Modus: Tür folgt Maus entlang Wand. Erneuter Klick fixiert.
  - Nummerisches Feld **Position [m]** (Distanz vom Wandanfang) — Tippen + Enter setzt `posM` exakt.
- Position oberhalb der Tür. Schließt bei Tool-Wechsel/ESC/Klick außerhalb.
- Endpunkt-Handles bleiben für Resize per Drag erhalten (Drag startet ohne Hubbox-Interaktion).

## 2) Fenster-Werkzeug (vollwertig)

- Gleiches Datenmodell wie Tür (`Door`), neues Feld `kind: "door" | "window"` und `sashEnabled: boolean` (Flügel an/aus, default `false` für Fenster).
- `drawDoor` erweitern bzw. `drawWindow` einführen:
  - Identische Wandöffnung + Laibungs-Logik (Farbe/Breite/Dicke/Start-Kante exakt wie Tür).
  - Statt Türblatt + Schwung: **zwei parallele Linien** quer durch die Öffnung (Fensterprofil), Farbe wie Laibungsfarbe konfigurierbar (`glassColor`).
  - Bei `sashEnabled=true`: zusätzlich Flügel+Schwung wie Tür darüberlegen.
- Settings-Panel: identische Einstellungen wie Tür (Breite, Lichte Breite, Höhe, Start-Kante, Öffnungsseite, Öffnungsrichtung, Farbe, Laibung an/aus + Farbe/Breite/Dicke). Zusätzlich:
  - **Flügeltür ein/aus** (Toggle, default aus).
  - **Fensterfarbe** (Farbe der zwei Linien).
- Hit-Test, Selektion, Bearbeitung, Hubbox: identisch wie Tür (gleiche Wege).

## 3) Technische Hinweise

- `Scene.Door`: Felder `kind`, `sashEnabled`, `glassColor` ergänzen (default-kompatibel zu bestehenden Daten).
- `DoorTool.settings`: `mode` bleibt Switch; bei Platzierung wird `kind` aus `mode` gesetzt; restliche Einstellungen geteilt.
- `CadEditor.tsx`: Fenster-Panel sichtbar wenn `doorMode === "window"`, spiegelt Tür-Panel + Flügeltür-Toggle + Fensterfarbe.
- Neue React-Komponente `DoorHubBox` (klein, absolut positioniert, Tailwind-Styling im Stil bestehender Inspector-Boxen). Steuerung über `doorTool` (Methoden `beginMoveFromHub`, `setPosM`).
- ESC/Tool-Wechsel räumt Hubbox auf (`doorTool.cancel`).

## 4) Tests / Verifikation

- Manuelle Verifikation per Playwright-Screenshot:
  - Tür setzen → Endpunkt anklicken → Hubbox erscheint → Move-Icon → entlang Wand → Klick fixiert.
  - Fenster mit/ohne Flügeltür rendert mit zwei Linien bzw. Schwung.
