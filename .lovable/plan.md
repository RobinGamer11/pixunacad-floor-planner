## Ziel

Das Werkzeug „CAD-Blatt" in der Projektmappe bekommt beim nachträglichen Bearbeiten dasselbe Verhalten wie das Werkzeug „Dokument" — also identische Handles (Verschieben, Skalieren an den vier Ecken, Rotate-Griff oben) sowie identisches Snap-/Rasten-Verhalten. Kein Crop, keine zusätzliche Bearbeitungs-Ebene.

## Ist-Zustand

- CAD-Blätter werden in `ProjectWorkspace` als `element.kind === "cad-view"` platziert.
- Im `ElementDom`-Renderer (ca. Zeile 1442) ist `cad-view` bereits im `hubKinds`-Set → es zeichnet einen einfachen Rotate-Griff (`rotateRef`), aber **keine Ecken-Skalier-Handles**.
- Verschieben läuft über generisches `handleMouseDown` auf dem Element-Wrapper.
- Dokumente aus dem neuen „Dokument"-Werkzeug leben dagegen in `scene.documents` und benutzen den vollwertigen `documentHub` aus MiniCad (Ecken + Rotate + Snap).

Diskrepanz: CAD-Blatt hat aktuell nur Rotate, keine Ecken-Skalierung mit visuellem Handle. Verhalten und Optik weichen vom Dokument-Hub ab.

## Umsetzung

### 1. Ecken-Handles am CAD-Blatt

- In `ElementDom` (in `ProjectWorkspace.tsx`) bei `showHub && el.kind === "cad-view"` vier Ecken-Handles rendern (TL, TR, BL, BR), Style identisch zum Dokument-Hub in `CadOverlayLayer` (kleine Kreise mit Gold-Rahmen, `data-hub-control`).
- Drag an einer Ecke skaliert `el.w` / `el.h` in Prozent (Seiten-Aspekt frei; Shift = proportional). Ankerpunkt = gegenüberliegende Ecke, damit sich die feste Ecke visuell nicht bewegt.
- Wie beim Dokument-Hub: während Drag `onScale(w, h, x, y, /*live*/ true)`, am Ende `false` → persistiert via `projectStore.updateElement`.

### 2. Rotate-Griff optisch angleichen

- Position und Größe des vorhandenen Rotate-Handles (`rotateRef`) an den Dokument-Hub anpassen: kleiner Kreis mit `RotateCw`-Icon zentriert oberhalb, Offset ca. 28 px, dieselbe Gold-Umrandung.
- Snap: alle 15° einrasten wenn Shift gedrückt (analog Dokument-Hub).

### 3. Move-Verhalten

- Bestehendes `handleMouseDown` bleibt (Drag verschiebt das Element per Prozent).
- Erweiterung: `data-hub-control`-Kinder dürfen Move nicht triggern (ist schon so für Rotate, wird für die neuen Ecken übernommen).
- Optional: Snap ans Seitenraster / Ränder wie beim Dokument-Hub (mm-basiertes Snapping), falls schon Hilfslinien vorhanden.

### 4. Auswahl-Feedback

- Bei ausgewähltem CAD-Blatt bleibt der Gold-Outline; zusätzlich ein dezenter Rahmen im Dokument-Hub-Stil (dünn, halbtransparent) für Konsistenz.

## Betroffene Dateien

- `src/pages/ProjectWorkspace.tsx` — `ElementDom`-Komponente: neue Ecken-Handles, Rotate-Griff aufhübschen, Scale-Drag-Logik.
- Keine Änderungen an `MiniCad` oder `CadOverlayLayer` nötig (CAD-Blatt bleibt ein Projektmappen-Element, kein CAD-`DocumentObject`).

## Nicht enthalten

- Kein Crop / kein Beschnitt.
- Keine Migration bestehender CAD-Blätter in CAD-`DocumentObject`s (der CAD-Blatt-Referenz-Charakter zu einem anderen Sheet bleibt erhalten).
- Kein Skalier-mit-2-Punkten-Modus (der ergibt bei CAD-Blättern konzeptionell keinen Sinn, da der Maßstab am Blatt selbst hängt).

## Verifikation

1. CAD-Blatt platzieren → auswählen → vier Ecken-Handles + Rotate-Griff sichtbar, gleicher Look wie Dokument-Hub.
2. An einer Ecke ziehen → Blatt skaliert relativ zur gegenüberliegenden Ecke, Shift hält Seitenverhältnis.
3. Rotate-Griff ziehen → Rotation, mit Shift 15°-Rasterung.
4. Move per Drag im Element-Body → verschiebt wie bisher.
5. Reload → alle Änderungen persistent.
