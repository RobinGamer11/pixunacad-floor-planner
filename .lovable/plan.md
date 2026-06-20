## Ziel
Drei größere Änderungen am CAD-Editor:

1. Rechtsklick-Hilfslinien-Hub („Abstand 100 mm OK ✕") **entfernen**, stattdessen den **LineHub-Stil (Länge m / Winkel °)** wie im Linienwerkzeug auch für **alle anderen Werkzeuge** beim Setzen/Bearbeiten von Punkten anzeigen.
2. Hilfslinien-Werkzeug überarbeiten: identisches Verhalten wie Linienwerkzeug, aber hellblau gestrichelt, nicht druckbar, fixierbar per Schloss.
3. Auswahlwerkzeug: Single- vs. Multi-Select-Modus, gemeinsame Bearbeitung gleichartiger Objekte, gemeinsames Verschieben/Drehen/Duplizieren beliebiger Objekte.

---

## 1. Distanz-Hub-Vereinheitlichung

**Entfernen:**
- `ParallelGuideHub.ts` und sein Aufruf via Rechtsklick in `MiniCad.ts` werden komplett deaktiviert/gelöscht.
- Rechtsklick erzeugt keine Hilfslinie mehr (bleibt erstmal ohne Funktion).

**Hinzufügen (LineHub-Stil, Screenshot 2: `0.131 m | 122.1°`):**
- `LineHub` wird zu generischem „PointPlacementHub" erweitert und beim Setzen jedes neuen Punkts angezeigt für:
  - **WallTool** (Wand-Stützpunkte)
  - **HatchTool** (Polygon-Stützpunkte)
  - **FreeDrawTool** (Endpunkt, falls geradlinig)
  - **MeasureTool** (Messpunkte)
  - **GuideTool** (neu, siehe Punkt 2)
- Werte: Länge in m und Winkel ° vom **letzten gesetzten Punkt** zum aktuellen Cursor. Enter/Tab/Eingabe wie bei Linie.

## 2. Hilfslinien-Werkzeug

- Werkzeug verhält sich **1:1 wie LineTool** (Snapping, Ortho, Hub, Mehrfachsegmente).
- Erzeugte `PageElement.kind = "guide"`:
  - Render: gestrichelt, Standardfarbe `#7DD3FC` (hellblau), im Hintergrund (z-Index niedriger als Linien/Text).
  - Farbe in Werkzeugeinstellungen wählbar (Color-Picker, default hellblau).
  - Strichmuster fest (z. B. `4 4`).
- **Einstellungen** (neuer/erweiterter `GuideSettingsPanel`):
  - Farbe
  - Schloss-Toggle „Fixiert" → wenn aktiv, sind alle Hilfslinien nicht mehr selektierbar/verschiebbar/löschbar.
- **Druck/Export**: `PlanPdfExport` und alle Render-Pfade filtern `kind === "guide"` heraus.
- **Snapping**: Hilfslinien bleiben Snap-Targets (`SnapType.GUIDE`).

## 3. Auswahlwerkzeug — Multi-Select

**Werkzeugeinstellungen (SelectSettingsPanel):**
- Toggle `Auswahlmodus`: „Einzel" / „Mehrfach".

**Mehrfachmodus:**
- Klick auf Objekt → zur Auswahl hinzufügen (bestehendes bleibt). Klick auf leeren Bereich → Auswahl leeren. Shift-Klick entfernt aus Auswahl.
- Marquee (Rechteck-Auswahl per Drag) bleibt erhalten.

**Einstellungs-Anzeige bei Mehrfachauswahl:**
- Es wird immer das Settings-Panel des **zuletzt angeklickten Objekts** angezeigt (Linie, Text, Wand, …).
- Änderungen werden auf **alle gewählten Objekte vom selben Typ** angewendet (z. B. Strichstärke ändert alle Linien, andere Typen bleiben unverändert).

**Sammel-Aktionen für ALLE gewählten Objekte (unabhängig vom Typ):**
- Verschieben (Drag der Auswahl)
- Drehen (Rotations-Handle um den Auswahl-Mittelpunkt)
- Duplizieren (Hub-Icon „Duplizieren", neue Kopien wieder gesetzt werden)
- Löschen (Entf / Backspace)

---

## Technische Hinweise (für Entwickler)

- `LineHub.ts` umbenennen/öffnen für generische Nutzung; `showAt(sx,sy,{lastPointW, currentW})` → berechnet selbst Länge/Winkel. Bestehende `LineTool`-Integration bleibt unverändert.
- `MiniCad.ts`: zentrale Methode `_showPlacementHub(toolId, lastP, currentP)`; wird von Wall/Hatch/FreeDraw/Measure/Guide aufgerufen.
- `ParallelGuideHub.ts` löschen, `contextmenu`-Handler entfernen.
- `PageElement` Typ-Erweiterung für `guide`: `locked: boolean`, `color: string`.
- `projectStore`: neuer Toolsettings-Slice `select.multi: boolean`.
- `SelectTool.ts`: interner State `selection: SelectionItem[]` + `lastSelected` für Settings-Panel.
- `CadOverlayLayer`/`ProjectWorkspace`: Settings-Panel rendert dynamisch nach `lastSelected.kind`, Änderungen werden auf `selection.filter(s => s.kind === lastSelected.kind)` gemapped.
- Render-Reihenfolge: `guide` zuerst, danach reguläre Elemente.
- `PlanPdfExport` & Druck-Pfade: `elements.filter(e => e.kind !== "guide")`.

---

## Offen / Rückfragen

Bevor ich starte, eine Frage zum Auswahlmodus:
- Soll **Shift-Klick im Einzelmodus** trotzdem temporär Mehrfachauswahl ermöglichen (Standard in CAD-Programmen), oder strikt nur das, was der Modus-Toggle sagt?
- Drehen mehrerer Objekte: gemeinsamer Drehmittelpunkt = **geometrischer Mittelpunkt der Auswahl** ok?
