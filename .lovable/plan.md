## Ziel

Der „Mehrfach"-Modus im Auswahlwerkzeug soll für alle Objekttypen (Linien, Hatches, Text, Sticker, Hilfslinien) tatsächlich funktionieren — inkl. Shift-Klick, Aufziehen eines Auswahlrahmens, gemeinsames Verschieben/Löschen/Duplizieren und Bulk-Edit gleicher Typen in den Einstellungen.

Heute hat `MiniCad` nur ein einzelnes `selection: Selection | null`. Alle Highlights, Tools und der Inspector hängen daran. Deshalb merkt man von dem React-Toggle nichts.

## Umfang

### 1. Datenmodell (`src/cad/embed/MiniCad.ts`)
- Neu: `selections: Selection[]` als „Source of Truth" (Reihenfolge = Selektionsreihenfolge, letztes Element = „primary").
- `selection` bleibt als Getter erhalten, der `selections.at(-1) ?? null` liefert (Rückwärtskompatibilität für ~60 Lesestellen).
- Neue API: `addToSelection(sel)`, `toggleSelection(sel)`, `clearSelection()`, `setSelections(list)`.
- `setSelection(sel)` setzt weiterhin Single-Select (ersetzt Liste).
- `_selectionInfo` liefert `{ primary, all }` damit der React-Layer beide kennt.

### 2. Renderer (`src/cad/Renderer.ts`)
- `setSelection` → `setSelections(list)`.
- Alle Highlight-Pfade (Linien-Endpunkte, Hatch-Polygon, TextBox-Rahmen, Sticker-Bbox) iterieren über die Liste.
- Nur das **primary** bekommt die volle Handle-Garnitur (Drehgriff, Resize, etc.); Sekundäre nur einen dezenten Auswahlrahmen, damit die UI nicht überladen wirkt.

### 3. SelectTool (`src/cad/SelectTool.ts`)
- Beim `pointerDown` auf Objekt:
  - ohne Shift + Multi-Mode aus → `setSelection(hit)` wie heute.
  - mit Shift **oder** Multi-Mode an → `toggleSelection(hit)`.
- Klick ins Leere (keine Treffer):
  - Multi-Mode aus → `clearSelection()`.
  - Multi-Mode an oder Shift gedrückt → **Drag-Rect** starten (Marquee).
- Marquee: rechteckiger Auswahlrahmen wird live als gestrichelte Hellblau-Box gerendert; beim Release alle Objekte deren Bbox vollständig (Links→Rechts) bzw. teilweise (Rechts→Links, CAD-Konvention) im Rect liegen, in `selections` aufnehmen.
- Verschieben: wenn primary gepackt & in `selections`, wandern alle Selektionen mit demselben Delta.
- Punkt-Editieren / Drehgriffe / Resize-Handles sind weiterhin nur am **primary** aktiv (sonst wird's mehrdeutig).
- Delete-Hotkey löscht alle.

### 4. React-Layer (`src/pages/ProjectWorkspace.tsx`, `CadOverlayLayer.tsx`)
- `MiniCadSelectionInfo` erweitern um `count` und `kinds`.
- `onCadSelectionChange` füllt einen neuen State `selectedCadInfos` (Array) statt nur den letzten Typ.
- Mode-Toggle „Einzel/Mehrfach" wird an MiniCad propagiert (neue Methode `setMultiSelectMode(bool)`), damit die Engine ohne Shift bereits togglet.
- Inspector („Einstellungen"-Panel):
  - Wenn alle Selektionen denselben `kind` haben → Multi-Edit (Patch wird auf alle angewandt, geometrie-spezifische Keys ausgenommen).
  - Wenn gemischt → nur Settings des **primary** anzeigen, Patch greift nur auf gleichartige Objekte (so wie vom User gefordert).
- Statuszeile „Aktuell ausgewählt: N" weiterhin sichtbar.

### 5. React-Layer-Elements (Sticker etc.)
- Bleibt wie in Phase 4 — die bestehende `selectedElementIds`-Logik bleibt funktionsfähig für reine React-Elemente, wird aber an den selben Mode-Toggle gekoppelt.

## Technische Details

- `Selection`-Equality über `(type, segmentId|hatchId|textBoxId|stickerInstanceId)`.
- Marquee-Hit-Test nutzt vorhandene Bbox-Helper aus `Scene` (Segment-Bbox, Hatch-Polygon-Bbox, TextBox-Rect, Sticker-Rect). Hilfslinien-Segmente werden bei `_guidesLocked === true` ignoriert (konsistent mit aktueller Single-Select-Sperre).
- Group-Move-Implementierung über `Scene.translateSegment / translateHatch / …` — eine neue Wrapper-Methode `translateSelections(dx, dy)` kapselt das pro Typ.
- Render-Reihenfolge im Marquee: Box wird oberhalb aller Objekte, unterhalb der Hub/Menüs gezeichnet.

## Was NICHT Teil dieses Schritts ist
- Gruppen als persistierte Entität (Group-Object speichern). Multi-Select bleibt sitzungsweit.
- Rotations-Handle für Mehrfachauswahl (technisch heikel: gemeinsamer Pivot). Wenn gewünscht, in eigenem Schritt.

## Reihenfolge der Umsetzung
1. Engine-Selection-Liste + Getter-Kompat (kleine, breite Änderung, sofort testen).
2. Renderer-Highlights auf Liste umstellen.
3. SelectTool: Shift-Klick + Multi-Mode-Toggle.
4. Marquee/Drag-Rect.
5. Group-Move + Group-Delete.
6. React-Inspector Bulk-Edit für CAD-Objekte.
