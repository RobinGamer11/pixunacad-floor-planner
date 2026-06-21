## Plan: Raster-Toggle kompakter + neues Werkzeug "Türen/Fenster"

### Teil 1 — Raster: kompakter Toggle, Einstellungen nur on-demand

**Aktuell:** Großer Raster-Button (volle Toolbar-Breite) über "Auswahl" + Einstellungspanel ist permanent sichtbar, solange `gridEnabled` true ist (egal welches Werkzeug aktiv ist).

**Neu:**
- Raster-Button schrumpft auf ein kleines Icon-Quadrat (40×40, wie ein Header-Icon) in der oberen Toolbar-Zeile neben Undo/Redo/Pipette — nimmt keine eigene Zeile mehr ein.
- Klick auf das Icon:
  - schaltet `gridEnabled` an/aus (Hebel)
  - markiert intern "Raster ist aktives Panel" → Einstellungspanel erscheint im Inspector
  - der bisherige `activeTool`-State (Linie, Wand etc.) bleibt unverändert, das Werkzeug ist weiter aktiv für Maus-Interaktion
- Klick auf ein anderes Werkzeug ⇒ Raster-Panel wird ausgeblendet (Grid bleibt sichtbar, falls aktiviert)
- Neuer State `gridPanelOpen: boolean` (true, wenn der User zuletzt das Raster-Icon angeklickt hat; false, sobald irgendein anderes Werkzeug angeklickt wird)
- Panel-Anzeige-Bedingung wird von `gridEnabled` auf `gridPanelOpen` umgestellt
- `handleToolClick` setzt `gridPanelOpen=false`

### Teil 2 — Neues Werkzeug "Türen/Fenster"

#### UI / Toolbar
- Neuer Eintrag in `CAD_TOOLS` mit Icon (`DoorOpen` aus lucide), Label "Türen/Fenster", Hotkey "T"
- Einstellungspanel mit zwei großen Symbol-Buttons oben: **Tür** | **Fenster** (Mode-Switch)
- Gemeinsame Felder: Breite (m), Höhe (m, nur Metadaten/Eintrag), Wandstärke folgt automatisch der Trägerwand
- Tür-spezifisch: Öffnungsseite (innen/außen), Öffnungsrichtung (links/rechts), Farbe
- Fenster-spezifisch (Phase 2 — Platzhalter-UI vorgesehen, ohne Funktion, da heute nur Türen umzusetzen sind): Rahmenfarbe, Sprossen-Anzahl. *(Falls nur Tür für jetzt ausreicht, Fenster-Sub-Modus zeigt "Demnächst".)*

#### Datenmodell (in `Scene.ts`)
```
type Opening = {
  id: string;
  kind: "door" | "window";
  wallId: string;        // Trägerwand
  tAlong: number;        // Parameter 0..1 entlang Wand-Mittelachse (Position des Tür-Mittelpunkts)
  widthM: number;        // Öffnungsbreite
  heightM: number;       // Türhöhe (Meta)
  side: "inner" | "outer"; // Öffnung schwingt nach innen/außen
  hand: "left" | "right";  // Drehrichtung (Angel links/rechts)
  color: string;
  labelId: string;       // Layer, vererbt von Wand
};
scene.openings: Opening[];
```
- Persistenz in Projektstore und Plan-Export, Undo/Redo via bestehendem History-Mechanismus
- Boolean-Wandausschnitt: in `wallUnion.ts`/Renderer wird pro Wand-Polygon ein Loch (Rechteck quer zur Wand, volle Wandstärke × `widthM`) abgezogen, bevor das Wand-Polygon gefüllt/strichbar gerendert wird

#### Rendering (in `Renderer.ts`)
Für jede Tür:
1. Mittelpunkt + Wand-Tangente/Normale aus Wand-Geometrie (Mittelachse)
2. Wand wird an dieser Stelle "geöffnet" (Loch im Unionspolygon)
3. Zwei kurze Querstriche (Laibung) an den Tür-Endpunkten quer zur Wand
4. Türblatt: dünnes Rechteck (Länge = `widthM`, Dicke ≈ 4 px / 0.04 m) am Angelpunkt befestigt, Drehwinkel 90° entsprechend `side` × `hand`
5. Öffnungs-Bogen (Viertelkreis, Radius = `widthM`) vom Türblatt-Ende zur Wandflucht, Farbe = `color` (siehe Referenzbild)

#### Interaktion (`DoorTool.ts`, neu, + `SelectTool.ts`-Erweiterung)
**Setzen (DoorTool):**
- Hover über Wand → Vorschau der Tür snappt entlang der Wand-Mittelachse
- Klick fixiert Position (`tAlong` so, dass Mittelpunkt unter Cursor liegt; mit Min-Abstand zu Wand-Enden)
- ESC/Rechtsklick beendet

**Bearbeiten (SelectTool):**
- Tür anklickbar wie andere Objekte; zeigt zwei kleine **Hub-Boxen** an beiden Endpunkten (wie bestehende Linien-Hubs in `hubDrag.ts`)
- Ziehen einer Hub-Box ändert `widthM` (und verschiebt `tAlong` so, dass die gegenüberliegende Seite fix bleibt) — Snapping auf Raster/Wand-Enden
- Inspector-Panel zeigt für ausgewählte Tür: Breite, Höhe, Öffnungsseite (Toggle innen/außen), Öffnungsrichtung (Toggle links/rechts), Farbe — alle Live-bearbeitbar

#### Out-of-scope für diesen Schritt
- Fenster-Geometrie (Glas/Rahmen-Linien) — nur UI-Switch vorbereitet, Implementierung später
- 3D-Höhe (heightM ist nur Metadaten)
- Eckwand-Türen über zwei Wände hinweg
- Drag der Position via Mitte der Tür (Phase 2; Position fix nach Setzen, neu setzen via Neuzeichnen)

### Geänderte/neue Dateien
- `src/components/CadEditor.tsx` — Raster-Icon kompakt, `gridPanelOpen`-State, Tür/Fenster-Tool-Eintrag + Inspector
- `src/cad/CadApp.ts` — DoorTool registrieren, Selection-Inspector-API erweitern
- `src/cad/DoorTool.ts` *(neu)* — Setzen, Hover-Preview, Wand-Snap
- `src/cad/SelectTool.ts` — Auswahl + Hub-Boxen für Türen, Resize-Logik
- `src/cad/Scene.ts` — `Opening`-Typ, `openings`-Array, Serialisierung
- `src/cad/Renderer.ts` — Türen rendern (Bogen, Blatt, Laibung), Wand-Loch
- `src/cad/wallUnion.ts` — Öffnungen aus Wand-Unionspolygon ausschneiden
- `src/lib/projectStore.ts` — Persistenz für `openings`

### Reihenfolge der Umsetzung
1. Raster-Toggle kompakt + Panel-Sichtbarkeit (klein, isoliert)
2. Door-Datenmodell + Renderer + DoorTool (Setzen)
3. SelectTool: Auswahl + Hub-Boxen + Inspector-Bearbeitung
4. Fenster-Sub-Modus (UI-Stub)

### Offene Frage
Soll Tür **nur in Wänden** platzierbar sein (Setzen ist nur möglich, wenn Cursor über einer Wand hovert), oder auch freistehend? Empfehlung: **nur in Wänden** (so wie AutoCAD/ArchiCAD).
