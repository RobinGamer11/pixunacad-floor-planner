## Ziel

„Auswahl" und „Linie" (inkl. Freihand/Radiergummi + Einstellungen + Hub-Boxen) in der Projektmappe verhalten sich 1:1 wie in der CAD-Oberfläche. Realisiert durch Wiederverwendung derselben CAD-Engine-Klassen (`SelectTool`, `LineTool`, `FreeDrawTool`, `EraserTool`, `LineHub`, `PointEditMenu`) über die bereits bestehende `MiniCad`-Hülle und Extraktion der CAD-Settings-Panels zu geteilten Komponenten. Die CAD-Oberfläche bleibt in Verhalten/Optik/Persistenz unverändert (rein additive/strukturelle Änderungen).

## Ist-Stand

- `MiniCad` (`src/cad/embed/MiniCad.ts`) bindet bereits `SelectTool`, `LineTool`, `LineHub`, `PointEditMenu`, `TextTool`. „Linie" und „Auswahl" laufen in der Projektmappe schon über dieselbe Engine — aber ohne Freihand/Radiergummi und mit stark reduzierten React-Settings (nur Farbe/Stärke/Transparenz und Einzel/Mehrfach).
- Fehlt für Parität mit CAD:
  1. Werkzeug-Varianten **Freihand** und **Radiergummi** (Tool-IDs, Instanzen, Persistenz).
  2. Zeichenweisen-Einstellungen: Bezeichnungs-ID, Pfeilspitzen (Anfang/Ende + Größe) für Linie; komplette Freihand-Optionen; Radiergummi-Optionen; Lineal-Guide.
  3. Line-Hub-Editing für Linie (schon da) und Radiergummi-Vorschauring (schon in `EraserTool` – braucht nur Wiring).
  4. Selection-Panel-Parität (Bezeichnungs-ID-Übernahme, Snap-Optionen sind bereits da).

## Umsetzung

### Phase A — CAD-Engine für die Projektmappe erweitern (`src/cad/embed/MiniCad.ts`)

1. **`MiniTool`** erweitern: `"line" | "text" | "select" | "guide" | "free" | "eraser" | null`.
2. Default-Felder für Freihand/Radiergummi analog `CadApp` ergänzen (`defaultFreeColor`, `defaultFreeThicknessM`, `defaultFreeOpacity`, `defaultFreeLineStyle`, `defaultFreeGapM`, `defaultFreeImageSrc`, `defaultFreeImageSizeM`, `defaultFreeImageSpacingM`, `defaultFreeImageRotate`, `defaultFreeAutoShape`, `defaultEraserRadiusM`, `defaultEraserStrength`).
3. Tools instanzieren: `freeDrawTool = new FreeDrawTool(this as any)`, `eraserTool = new EraserTool(this as any)`.
4. `setActiveTool(tool)` erweitert um Cancel/Activate für die neuen Tools.
5. Tick-Loop (`update`) an die neuen Tools weiterreichen.
6. Kompatibilitäts-Methoden für die geteilten Panels: `setActiveDrawLabelId(id)`, `getSelectedFreeStroke()`, `onLabelsChange?: () => void` (bereits vorhandene `refreshLabelUI` triggert diesen Callback).
7. Serialisierung: `freeStrokes` in `_serialize`/`_restore` (spiegelt `CadApp._serialize`/`_restore`) — dadurch überleben Freihand-Striche das Speichern in der Projektmappe.
8. Löschen per `Delete`/`Backspace`, Undo/Redo, Copy/Paste bleiben unverändert (nutzen bereits die vorhandene Selection-/ClipboardManager-Infrastruktur).

Kein CAD-Verhalten wird angefasst. Alle neuen Felder/Methoden sind additiv.

### Phase B — Settings-Panels zu geteilten Komponenten machen

- **`src/components/cad/FreeDrawSettingsPanel.tsx`** und **`src/components/cad/EraserSettingsPanel.tsx`**: Prop-Typ von `CadApp | null` → geteilter Interface-Typ `CadLikeApp` (im gleichen File definiert), der die tatsächlich benutzten Felder/Methoden beschreibt. `CadApp` und `MiniCad` erfüllen dieses Interface — kein Verhaltenswechsel für CAD.
- **Neu:** `src/components/cad/shared/LineSettingsPanel.tsx` — extrahiert aus `CadEditor.tsx` (Farbe, Stärke, Pfeilspitzen, ID). Nutzt denselben `CadLikeApp`-Typ. `CadEditor.tsx` mountet ihn statt der Inline-Refs (Verhalten/DOM-Ausgabe unverändert; Refs werden intern gebunden).
- **Neu:** `src/components/cad/shared/LineVariantSwitcher.tsx` — die drei Buttons Linie/Freihand/Radiergummi als eine Komponente, verwendet in CadEditor und Projektmappe.

Änderungen an CadEditor sind rein strukturell (gleiche Komponentenausgabe, gleiche Refs/Callbacks, dieselben CSS-Klassen). Nach jeder Extraktion Sichtkontrolle: Linien-/Freihand-/Radiergummi-Panels sehen identisch aus.

### Phase C — Projektmappe verdrahten (`src/pages/ProjectWorkspace.tsx`)

1. `PageTool` erweitern: `"guide" | "line" | "free" | "eraser" | "text" | "cad" | "pipette" | null`.
2. Tool-Rail: Unter „Linie" die Icons Freihand (`Pencil`) und Radiergummi (`Eraser`) hinzufügen, gleiche Reihenfolge/Optik wie im CAD-Rail.
3. `CadOverlayLayer` bekommt `activeTool`-Werte `"free"` und `"eraser"` durchgereicht und ruft `miniCad.setActiveTool(...)` auf. `enabled` erweitert.
4. `RightInspector`/`ToolsTab` — bei `settingsTool === "line" | "free" | "eraser"`:
   - `LineVariantSwitcher` einblenden (setzt aktives Tool).
   - Für „line" wird die neue `LineSettingsPanel`-Komponente gerendert, gespeist mit `miniCadRef.current` — ersetzt die reduzierte React-`LineSettings`.
   - Für „free" `FreeDrawSettingsPanel` mit `miniCadRef.current`.
   - Für „eraser" `EraserSettingsPanel` mit `miniCadRef.current`.
5. Bestehende Sekundär-Panels bleiben: `LineSnapSettings` (Mittelpunkt/Teilung) wird weiter aus `cadSelectedLineSnap` gefüttert.

### Phase D — Verifikation

- CAD-Oberfläche: manuelle Sichtkontrolle Linien-Panel, Freihand-Panel, Radiergummi-Panel, Hub-Box, Punkt-Edit — muss visuell/funktional identisch zu vorher sein.
- Projektmappe: Auswahl-Tool klickt Segmente/Freistriche/Textboxen an, Hub-Box öffnet beim Zeichnen, Freihand mit Auto-Form/Lineal funktioniert, Radiergummi entfernt Segmente/Freistriche/Dokumentteile. Persistenz nach Reload prüfen.
- Playwright-Screenshot Projektmappe: rechtes Panel zeigt bei aktivem Linien-Tool alle CAD-Optionen (Farbe, Stärke, Pfeilspitzen, ID).

## Technische Details

- Neue Dateien: `src/components/cad/shared/LineSettingsPanel.tsx`, `src/components/cad/shared/LineVariantSwitcher.tsx`.
- Angefasste Dateien: `src/cad/embed/MiniCad.ts`, `src/components/cad/FreeDrawSettingsPanel.tsx` (Prop-Typ), `src/components/cad/EraserSettingsPanel.tsx` (Prop-Typ), `src/components/CadEditor.tsx` (Panels + Variant-Switcher auf shared Komponenten umstellen), `src/pages/ProjectWorkspace.tsx` (PageTool, Rail, ToolsTab), `src/components/page/CadOverlayLayer.tsx` (neue Tool-Werte weiterleiten).
- Keine Änderung am `projectStore`-Schema. `MiniCad`-Serialisierung fügt `freeStrokes` additiv hinzu; alte Seiten bleiben lesbar (kein Feld → keine Striche).
- Keine Änderung an CAD-Persistenz/Sheet-Manager.
- Keine neuen Abhängigkeiten.
