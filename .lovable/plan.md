
# Projektmappe: Zoom-Feinabstimmung, Seiten-Verbund (Spreads) & iPad-Kompatibilität

Drei zusammenhängende Ausbauten. Punkt 2 ist der große Block und wird bewusst in kleine, testbare Schritte zerlegt.

---

## 1) Zoom weiter verfeinern

Aktuell nutzt das Mausrad `factor = 1.0015^-deltaY` (wie CAD) und die Buttons `±10 %`.
Änderungen:

- Mausrad-Faktor auf `1.0010` reduzieren (~30 % feinere Stufen).
- Zusätzlich einen weichen Trackpad/High-Delta-Dämpfer: bei `|deltaY| > 60` wird der Effektiv-Delta logarithmisch begrenzt, damit ein einzelner „Kick" nicht 30 % Sprung macht.
- ZoomBar-Buttons: `±10 %` → **±5 %** relativ (`zoom * 1.05` / `zoom / 1.05`), damit Klick-Steps auf hohen Zooms nicht mehr als große Prozentpunkte wirken.
- Slider-Step 1 bleibt, aber Max in `ZoomBar` von 400 auf 1600 anheben (Wheel kann längst höher, Slider hinkte nach).
- Shift+Wheel = feineres Zoomen (Faktor · 0.4), Alt+Wheel = grobes Zoomen (Faktor · 2.5) — optional, aber sehr hilfreich für Präzisionsarbeit.

---

## 2) Seiten-Verbund („Spreads") — Doppelseiten & freie Anordnung

### Datenmodell (`src/lib/projectStore.ts`)

Neu auf `ProjectPage`:
```ts
spreadId?: string;              // Gruppen-ID (mehrere Pages = 1 Spread)
spreadIndex?: number;           // Reihenfolge innerhalb des Spreads (0 = links)
spreadLayoutMode?: "grid" | "free";  // grid = automatisch nebeneinander, free = manuell platziert
spreadOffset?: { x: number; y: number; rotationDeg?: number }; // nur bei "free"
spreadExcluded?: boolean;       // beim „Für alle übernehmen" überspringen
```

Ein Spread ist implizit definiert durch alle Pages mit derselben `spreadId`, sortiert nach `spreadIndex`. Eine Page ohne `spreadId` ist Einzelseite (Standard).

Neue Store-Actions:
- `createSpread(projectId, pageIds[])` — vergibt neue `spreadId`, setzt Indizes.
- `addPageToSpread(projectId, spreadId, pageId, atIndex?)`.
- `removePageFromSpread(projectId, pageId)`.
- `setSpreadLayoutMode(projectId, spreadId, mode)`.
- `setSpreadOffset(projectId, pageId, {x,y,rotationDeg})`.
- `applySpreadPatternToRest(projectId, spreadId)` — nimmt die Größe (N Seiten) des Spreads und wendet sie fortlaufend auf alle danach folgenden Pages ohne `spreadId` an, überspringt `spreadExcluded`.

### Seiten-Panel links (`ProjectWorkspace.tsx` ~L550–710)

- Jede Page bekommt links einen 4 px breiten vertikalen Balken. Pages desselben Spreads sind durch einen durchgehenden gold-akzentuierten Balken verbunden; Einzelseiten haben keinen Balken.
- Klick auf den Balken → toggelt „Spread geöffnet/geschlossen". Geschlossen: nur erste Page sichtbar, Rest eingeklappt mit Badge `+N`.
- Kontextmenü/Icon-Reihe (Duplizieren/Umbenennen/Löschen) erweitert um:
  - **„Mit nächster Seite verbinden"** (Link-Icon) — startet Spread bzw. hängt Page an bestehenden an.
  - **„Aus Verbund lösen"** (Unlink-Icon) — nur wenn Page in Spread.
- Beim Klick auf eine beliebige Page des Spreads wird der **ganze Spread** die aktive Bearbeitungsfläche (siehe Canvas).

### Seiteneinstellungen rechts (`ABHEFTUNG`-Block)

Neuer Unterblock **SEITENANSICHT**:
- Dropdown **Modus**: `Einzelseite` / `Doppelseite (Buch)` / `Freie Anordnung`.
- Bei `Doppelseite`:
  - Button **„Mit vorheriger verbinden"** / **„Mit nächster verbinden"**.
  - Umschalter **Bindung**: `Links` (rechte Seite ist Recto) / `Rechts` (arabisch).
- Bei `Freie Anordnung`:
  - Button **„Seiten frei verschieben"** aktiviert einen Drag-Modus auf dem Canvas (Snap an Ecken/Kanten anderer Pages im Spread).
  - Anzeige der aktuellen Offsets (Δx/Δy/Winkel) mit Reset-Button.
- **Von Verbund ausschließen** (Checkbox) — setzt `spreadExcluded`, verhindert Übernahme durch „Für alle übernehmen".
- Button **„Für alle übernehmen"** — ruft `applySpreadPatternToRest` auf; zeigt Toast „Muster auf X weitere Seiten angewendet".

### Canvas (`PageCanvas` ~L1160)

- Neuer Wrapper `SpreadCanvas`: rendert alle Pages des aktiven Spreads. 
  - `grid`-Modus: Pages werden bündig nebeneinander gelegt (in `spreadIndex`-Reihenfolge), zwischen ihnen 0 px Gap für „aufgeklapptes Buch"-Optik (optional 1 px Trennlinie).
  - `free`-Modus: Pages sind absolut per `spreadOffset` positioniert, Container-Bounds wachsen dynamisch.
- Jede Page bleibt ein eigenes `PageCanvas` mit eigener CAD-Engine — kein Umbau der CAD-Engine nötig. Selektion, Zoom und Pan gelten für den gesamten Spread.
- **Freies Verschieben & Verbinden**: Wenn Free-Move-Button aktiv, werden Page-Ecken/Kanten als Snap-Punkte gezeichnet (identisch zum bestehenden CAD-Snap-Stil). Ziehen einer Page snap't ihre Ecken an Ecken/Kanten anderer Pages (Schwelle 6 px). Beim Loslassen wird `spreadOffset` gespeichert.
- Wenn eine Page in `free`-Modus über den Sichtbereich hinausragt, bleibt der Container scrollbar (Nutzung des existierenden Zoom-Containers).

### Export (`PrintPanel`)

- Neue Option **„Verbund übernehmen (Doppelseiten nebeneinander)"** (Checkbox, Default: an, wenn Spreads existieren).
- Wenn aktiv: PDF-Seiten werden pro Spread zusammengefasst; Seitenbreite = Summe der Page-Breiten, Höhe = max(Page-Höhen). `free`-Layouts werden mit dem berechneten Bounding-Box exportiert.
- Wenn inaktiv: unverändert eine Page pro PDF-Seite.

---

## 3) iPad-Kompatibilität

Das UI ist heute reines Maus/Trackpad. iPad braucht:

### Viewport & Basics
- `index.html` `<meta name="viewport">` auf `width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no` (verhindert Pinch auf ganzer Seite, wir liefern eigenes Pinch für Canvas).
- CSS `touch-action: none` auf Canvas-Viewport-Container, damit iOS-Gesten uns nicht abfangen.

### Gesten in `ProjectWorkspace` und CAD-Overlay
- Umstellung der `onMouseDown/Move/Up`-Handler auf **Pointer Events** (`onPointerDown/Move/Up` + `setPointerCapture`) — funktionieren für Maus, Touch und Pencil identisch.
- **Zwei-Finger Pinch-Zoom** implementieren: bei 2 aktiven Pointern werden Mittelpunkt und Distanz getrackt, Zoom-Factor = `newDist / oldDist`, Pivot = Mittelpunkt. Nutzt die existierende `zoomPivotRef`-Logik.
- **Zwei-Finger Pan**: gleiche 2-Pointer-Session → Delta-Translation des Mittelpunkts wird auf `scrollLeft/Top` addiert.
- **Ein-Finger im Auswahl-/Werkzeug-Modus**: verhält sich wie linke Maustaste (Zeichnen/Auswählen).
- Für die eingebettete CAD-Engine (`src/cad/Input.ts`): Pointer-Events statt Mouse-Events registrieren, damit Freihand/Linie mit dem Finger und Apple Pencil funktioniert.

### Layout
- Aktuell fixe Panel-Breiten (240/… px). Auf schmalen iPads (≤ 1024 px Landscape, 768 px Portrait):
  - Links- und Rechts-Panel werden zu **Off-Canvas-Drawern** (per Icon toggelbar), Canvas nimmt volle Breite.
  - `WorkspaceHeader`-Buttons zu Icon-only zusammenklappen.
  - Toolbar-Rail bleibt schmal, aber Buttons min. 44×44 px (Apple HIG).
- Rechte Einstellungen: Slider/Number-Inputs bekommen `inputMode="decimal"` und größere Hit-Areas (`h-9` statt `h-7`) unterhalb `min-width: 1024px`.

### iOS-Quirks
- `overscroll-behavior: none` global.
- `-webkit-user-select: none` auf Toolbars, aber `text` auf Text-Editor-Overlay behalten.
- iOS Safari 100vh-Bug: `h-screen` → `h-[100dvh]` in den Layout-Wurzeln.
- File-Input-Import (`.pdf`, `.jpg`, `.png`) funktioniert auf iPad nativ — keine Änderung nötig, außer `accept`-Werte prüfen (schon korrekt).

### Testabdeckung
- Manuelle Verifikation über die Preview auf iPad-Viewport (`preview_ui--set_preview_device_viewport` → `tablet`) und Playwright-Skript, das Pointer-Events emuliert.

---

## Technische Details

**Betroffene Dateien**
- `src/lib/projectStore.ts` — Datenmodell + Spread-Actions.
- `src/pages/ProjectWorkspace.tsx` — Seiten-Panel-Balken, Spread-Canvas-Wrapper, Seitenansicht-Einstellungen, Zoom-Feintuning, Pointer/Touch-Umbau, responsive Drawer.
- `src/pages/ProjectWorkspace.tsx` → `PrintPanel` — Export-Option „Verbund übernehmen".
- `src/cad/Input.ts` — Pointer-Events statt Mouse-Events.
- `src/components/page/CadOverlayLayer.tsx` — Pointer-Events + `touch-action: none`.
- `index.html` — Viewport-Meta.
- `src/index.css` — `overscroll-behavior`, `dvh`, iOS-User-Select-Regeln.

**Nicht angefasst**
- CAD-Engine-Rendering (jede Page behält ihr eigenes MiniCad, kein Multi-Canvas-Umbau).
- Bestehendes Snap/Fangpunkt-System — Spread-Snap nutzt es visuell wieder, aber Berechnung ist eigenständig auf Page-Ebene.

**Migration**
- Alle neuen Felder sind optional; alte Projekte laden unverändert als lauter Einzelseiten.

**Reihenfolge der Umsetzung (nach Freigabe)**
1. Zoom-Feintuning (klein, isoliert).
2. Datenmodell + Store-Actions für Spreads.
3. Seiten-Panel-Balken + Verbinden/Lösen.
4. Spread-Canvas im Grid-Modus + doppelseitige Bearbeitung.
5. „Für alle übernehmen" + Export-Option.
6. Free-Move-Modus mit Snap.
7. iPad-Pass (Pointer-Events, Drawer, dvh, Pinch-Zoom).

**Offene Punkte, die ich beim Bauen entscheide, wenn du nichts sagst**
- Balken-Farbe = `accent-gold` (Projekt-Akzent).
- Doppelseite ordnet in `spreadIndex`-Reihenfolge; Umschalten „links/rechts" ändert nur die Anzeigereihenfolge, nicht die Datenreihenfolge.
- Free-Move-Snap-Schwelle 6 px (Bildschirm), identisch zum CAD-Snap.
