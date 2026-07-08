## 01. Dokument-Inspektor: Layout vereinheitlichen

**Dateien:** `src/components/page/CadDocumentInspector.tsx`, `src/components/CadEditor.tsx` (die Dokument-Settings-Sektion), ggf. gemeinsame Buttons.

- Rahmen/Card um „Freie Skalierung" entfernen — keine Border/Background, nur linksbündige Reihe.
- Alle Aktions-Buttons werden linksbündig untereinander (oder in einheitlicher Flex-col mit gap-1) ausgerichtet:
  - `Skalieren (2 Punkte)`
  - `Skalieren (Maßkette)`
  - `Löschen`
  - `Anker +/−` (Label „Anker+" → „Anker +/−")
- Einheitliche Button-Optik (gleiche Größe/Variante, `justify-start`, `w-full` oder kompakt links).
- Beide Inspektoren (Projektmappe + CAD-Oberfläche) rendern exakt dieselbe Sektion — falls zwei Kopien existieren, in eine Shared-Komponente `DocumentActionsPanel` extrahieren und in beiden nutzen.

## 02. Reihenfolge/Umbenennung Filter ↔ Bildbearbeitung

**Datei:** `src/components/cad/DocumentFilterPanel.tsx`, `src/cad/documentFilters.ts` (Labels).

- Aktuelle Sektion „Filter" (bw/grayscale/tint/free) wird zu **„Bildbearbeitung"** umbenannt — nein, umgekehrt gemäß User: die bisherige Sektion **„Filter"** heißt jetzt **„Bildbearbeitung"**? Klarstellung: User sagt „Ändere Filter zu Bildbearbeitung und Bildbearbeitung unten drunter zu Filter" → Tausch der Überschriften. Also:
  - Obere Sektion (bisher „Filter") → Überschrift **„Bildbearbeitung"**
  - Untere Sektion (bisher „Bildbearbeitung"/adjust) → Überschrift **„Filter"**
- Reine Label-Änderung, Funktion bleibt gleich.

## 03. Bildbearbeitung: Regler-Set an Vorlage anpassen

**Datei:** `src/cad/documentFilters.ts` (`AdjustParams`, `DEFAULT_ADJUST`, `applyAdjustFilter`), `src/components/cad/DocumentFilterPanel.tsx` (UI-Regler + Presets).

Aktuelle 14 Regler werden durch die 30 Regler der Vorlage ersetzt, gruppiert wie im Original:

**Gruppe „Aquarell Basis"**: paper, wash, pigment, waterEdges, splatter, lift
**Gruppe „Vegetation Layer"**: trees, leaves, greenVar, treeDepth, twigs, grass
**Gruppe „Architektur"**: surface, linework, facade, plaza, ao, scalePeople
**Gruppe „Atmosphäre & Licht"**: depthFog, skyGlow, haze, sunBloom, warmth, palette
**Gruppe „Zeichnung & Finish"**: ink, softContrast, saturation, grain, vignette, detail

Alle 0..100, mit Slider + Zahlanzeige, Doppelklick-Reset auf Preset-Default.

**Presets** (Dropdown/Buttons): Wettbewerb, Archviz Warm, Vegetation Stark, Aquarell Landschaft, Nordic Soft, Tusche Skizze — Werte 1:1 aus Vorlage.

**Rendering-Pipeline** in `documentFilters.ts` (`applyAdjustFilter`) wird komplett neu implementiert nach `App.Renderer.*` der Vorlage:
1. Mask-Generator (green/sky/water/arch/ground/edge/dark/light/flat) via Luma/Chroma-Heuristik.
2. `applyBaseGrade` — Kontrast, Posterize, Sättigung, Wärme, Vegetation-/Fassade-/Boden-/Sky-Remap, Depth-Fog, Vignette.
3. Watercolor Washes (mehrfach `blurLayer` mit source-over/screen/multiply/overlay).
4. Pigment-Blobs, Tree-Layer, Leaf-Details, Grass/Twigs.
5. Architecture-Linework, Plaza-Linien, White-Lifts, Water-Edges.
6. Ink/AO, Depth-Fog, Sky-Glow, Sun-Bloom, Scale-People.
7. Paper & Grain, Detail-Recovery.

Utility-Helpers (`hash`, `noise`, `fractalNoise`, `luma`, `mix`, `clamp`) werden in neue Datei `src/cad/imageAdjustPipeline.ts` ausgelagert, damit `documentFilters.ts` nicht zu groß wird. `applyAdjustFilter` delegiert dorthin.

Signatur-Cache in `filterSignature` bleibt (nutzt bereits `JSON.stringify(adjust)`, deckt neue Felder automatisch ab).

**Kompatibilität**: `AdjustParams` erweitert; alte gespeicherte Dokumente ohne neue Felder werden mit `{ ...DEFAULT_ADJUST, ...saved }` gemerged, damit projectStore-State nicht bricht.

## Verifikation
- Typecheck läuft automatisch.
- Manuell: Dokument einfügen → Bildbearbeitung (obere Sektion) zeigt alle 30 Regler in 5 Gruppen; Preset „Wettbewerb" ergibt Aquarell-Archviz-Look wie Vorlage. Untere Sektion heißt „Filter" mit bw/grayscale/tint/free. Aktions-Buttons linksbündig, kein Rahmen.
