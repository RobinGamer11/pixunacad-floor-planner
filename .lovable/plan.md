## Übersicht
Vier Themen — zwei kleine Korrekturen, zwei größere Umbauten (Area-Box, Kreis-HUB).

---

## 1. Snap-Punkte über Kanten rendern (klein)

**Problem:** Snap-Indikatoren (blaue Punkte/Kreise) werden teilweise von Kanten/Linien überdeckt.

**Lösung:** In allen Tool-Overlays (`LineTool`, `WallTool`, `HatchTool`, `TextTool`, `MeasureTool`, `FreeDrawTool`, `EraserTool`, `SelectTool`) den Snap-Indikator immer als letzten Schritt im `_drawOverlay` zeichnen. Aktuell zeichnen einige Tools Guides + Hover-Highlights nach dem Snap. Reihenfolge angleichen: Guides → Hover → **Snap zuletzt**.

---

## 2. Textwerkzeug — Wrap-Verhalten + Lesbarkeit

**Problem:** Wrap-Toggle ändert visuell nichts. Text verschwindet bei zu kleiner Box am Rand.

**Lösung in `textRichRenderer.ts` + `Scene.ts` + `TextEditorOverlay.ts`:**

- **Wrap = ON:** Text wird in der festen Box-Breite umgebrochen (aktuelles Verhalten). Wenn Inhalt höher als Box → Box-Höhe wächst automatisch nach unten (auto-grow height).
- **Wrap = OFF:** Box-Breite und -Höhe wachsen automatisch entsprechend dem längsten Wort/Zeile. Kein Umbruch.
- **Auto-resize:** Nach jedem Edit-Commit (und beim Live-Eingeben im Overlay) Box-Maße via `measureText` neu berechnen und in `box.widthM`/`heightM` schreiben (falls Auto-Modus aktiv).
- Min-Padding garantieren, sodass Text nie geclippt wird.

---

## 3. Kreis-Schraffur — HUB-Box + Punktbearbeitung

**Problem:** Kreis-Hatches haben aktuell viele Punkte (96 Segmente), kein dedizierter Mittelpunkt/Radius-HUB wie Rechtecke/Polygone.

**Lösung:**
- Neue Hatch-Eigenschaft `circleMeta?: { center: Vec2; radius: number; startDeg?: number; endDeg?: number }` in `Scene.ts`. Wenn gesetzt, wird die Hatch als Kreis behandelt.
- Beim Commit im `HatchTool` wird `circleMeta` gespeichert, Punkte bleiben als Polygon-Approximation (für Render/Hit/Boolean-Ops).
- Im `SelectTool`: wenn `circleMeta` vorhanden → HUB-Box rund um Bounding-Box mit Move/Rotate/Scale-Handles (gleiche UX wie TextBox/Rectangle-HUB). Drag = Mittelpunkt verschieben, Rotate = `startDeg/endDeg` ändern, Edge-Handles = Radius. Punkte werden nach jedem Update aus `buildCircleOrSectorPoints` neu generiert.

---

## 4. Flächenanzeige (m²) — funktional + als Textbox-ähnliche Box

**Problem:** Toggle "Flächenanzeige" zeigt nichts an; Position nicht frei verschiebbar; kein Rotation/Resize-HUB.

**Lösung:**

**a) Bug-Fix Toggle:** In `CadApp.ts` Event-Bindings für `areaShowInput` prüfen und ggf. fehlende Bindung ergänzen (Verdacht: `areaLabel.show` wird beim Erstellen, aber nicht beim Toggle eines vorhandenen Hatches geupdatet).

**b) AreaLabel-Erweiterung in `Scene.ts`:**
```
interface AreaLabel {
  show, textColor, fontSizePx, bgColor, bgAlphaPct,
  offsetX, offsetY,           // bleibt
  rotationRad: number,        // neu
  widthM: number | null,      // neu, null = auto
  heightM: number | null,     // neu, null = auto
  wrap: boolean,              // neu
  align: "left"|"center"|"right",  // neu
  borderEnabled, borderColor, borderWidthPx,  // neu (wie TextBox)
  customText: string | null,  // neu, null = "X.XX m²" auto
}
```

**c) Renderer:** `_drawAreaLabel` ruft jetzt `drawRichTextBox` aus `textRichRenderer.ts` auf — gleiche Engine wie TextBox.

**d) SelectTool:** Area-Label wird selektierbar (eigener `SelectionType.AREA_LABEL` mit `hatchId`). HUB-Box identisch zu TextBox: Move/Rotate/Resize. Snap an Fangpunkte beim Verschieben.

**e) UI-Panel:** Bestehende Area-Sektion in `CadEditor.tsx` bleibt; zusätzlich erscheinen beim Selektieren des Labels die TextBox-ähnlichen Editor-Optionen (Wrap, Align, Border, Schriftgröße).

---

## Technische Details

- Keine Änderung an Wand-Logik/Topologie.
- Bestehende Hatches ohne `circleMeta` verhalten sich unverändert.
- Bestehende AreaLabels (alte Format) werden mit Defaults migriert (rotationRad=0, widthM=null, etc.).
- ClipboardManager und PipetteTool kopieren neue Felder mit.

## Reihenfolge

1. Snap z-order (klein, kein Risiko)
2. Textbox Wrap + Auto-grow
3. AreaLabel Toggle-Fix + Erweiterung + Render via drawRichTextBox
4. AreaLabel HUB im SelectTool
5. Kreis-HUB

Soll ich starten oder Reihenfolge/Scope anpassen?