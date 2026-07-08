
## 01 — Rechtes Panel: kompakter + CAD-Stil-Reiter

**In `src/pages/ProjectWorkspace.tsx` (`RightInspector` + `TabButton`, ca. 2610–2740):**
- Reiter-Design vom CAD-Sidebar übernehmen (`src/components/CadEditor.tsx` Zeile 1519–1535):
  - Aktiver Tab: 2px `hsl(var(--accent-gold))` Underline, weißer Hintergrund; inaktiver Tab: `surface-muted`, `ink-soft`.
  - Kein Icon mehr in den Reitern, nur der Label-Text (11px, `truncate`) — wie im CAD.
- Panel-Breite bleibt 280px, aber:
  - Content-Padding auf `p-2 space-y-2` (statt `p-3 space-y-3`).
  - Basis-Schriftgröße im Panel auf `text-[11px]`, Row-Label auf `text-[10px]`.
  - Buttons/Selects auf Höhe `h-7` (statt `h-8/h-9`), Slider kompakter.
- Auch das kompakte Styling für `CadDocumentInspector` (`p-2 space-y-2`, Buttons `h-7`, Label `text-[10px]`) übernehmen.

## 02 — Dokument: Slider für freies Skalieren

**In `src/components/page/CadDocumentInspector.tsx` unter „Skalieren (2 Punkte)":**
- Neue Zeile „Freie Skalierung" mit `<input type="range" min={10} max={400} step={1}>` (%-Wert).
- Anfangswert = 100 % relativ zur aktuellen `widthM/heightM` (in Ref merken).
- `onChange` ruft eine neue Engine-API `documentTool.scaleUniform(docId, factor)` auf, die `widthM`, `heightM` proportional multipliziert und über `_emitExternalDocChanges` an den Host meldet (damit auch die letzte Sitzung persistiert wird).
- Zusätzlich Zahlenfeld (%) mit Enter zum präzisen Eintippen.
- Gleiche Slider-Zeile auch in `CadEditor` (Dokument-Panel) einbauen, damit CAD-Oberfläche und Projektmappe identisch bleiben.

## 03 — CAD-Blatt Hub im Dokument-Look

**Ziel:** In der Projektmappe soll der Rahmen um ein platziertes CAD-Blatt (Bild 52) wie ein PDF/Dokument im CAD-Look aussehen: blau-gestrichelte Umrandung, blaue quadratische Corner-Handles, Aktions-Toolbar mit **Move / Rotate / Detach (öffnen)**.

**In `src/pages/ProjectWorkspace.tsx` (`ElementView`, ca. 2270–2515):**
- Neue Farb-/Style-Variante, aktiv wenn `el.kind === "cad-view"` (und optional `pdf`):
  - Outline: `2px dashed hsl(217 91% 60%)` (Blau) statt Gold-Solid.
  - Corner-Handles: 10×10 px **Quadrate**, weißer Kern, 2px blaue Border (statt goldene Kreise).
  - Edge-Handles: dünne blaue Linie statt gold.
  - Rotations-Stem oberhalb entfernt (Rotation wandert in die Toolbar).
- Neue Toolbar-Buttons (statt Rotate/Duplicate/Delete):
  1. **Move** (`Move` Icon): rein visueller Hinweis-Button (Cursor bleibt sowieso „move").
  2. **Rotate** (`RotateCw`): +15° pro Klick (bestehend).
  3. **Detach/Open** (`ExternalLink`): springt via `onJumpCad(el.sheetId)` in die CAD-Oberfläche.
  Delete/Duplicate wandert in ein „⋯"-Overflow-Menü, damit die Kern-Toolbar zu Bild 52 passt.
- Für `kind === "pdf"` bleibt die bisherige Gold-Optik erhalten (User-Konsistenz mit früherem Verhalten).

## 04 — Transparenzpause: Originalfarbe zeigen

**In `src/pages/ProjectWorkspace.tsx`:**
- `bgOverlay`-State um `tintEnabled: boolean` erweitern (Default `true`).
- Neuer Toggle-Button neben dem Farbwähler: „Originalfarbe" (Kontrast-Icon). Wenn aktiv:
  - `tintEnabled = false` → im Overlay-Render (Zeile 1866–1900) wird der `<div style={{background: tint, mixBlendMode: multiply}}>` weggelassen, sodass die Hintergrundseite in ihren Originalfarben durchscheint.
  - Farbwähler wird disabled/ausgegraut.
- Persistenz in `bgOverlay` via bestehender useState (kein Store-Schema-Change nötig).

## Technische Details

- Slider-Kommunikation zur CAD-Engine läuft über `documentTool` (analog zu `beginScaleTwoPoints`). Neue Methode `scaleUniform(docId, factor)` skaliert `widthM/heightM` (Position bleibt fixiert an der linken oberen Ecke oder Bounding-Center — Center bevorzugt).
- Der CAD-Blatt-Hub bleibt vollständig in React (kein Wechsel zur Engine-basierten Renderung nötig); nur Styling + Toolbar-Icons ändern sich.
- Keine Änderungen an Persistenz-/Datenmodellen außer dem Slider-Emit-Pfad (nutzt bereits `_emitExternalDocChanges` bzw. `updateElement`).

**Betroffene Dateien:**
- `src/pages/ProjectWorkspace.tsx`
- `src/components/page/CadDocumentInspector.tsx`
- `src/components/CadEditor.tsx`
- `src/cad/DocumentTool.ts` (neue `scaleUniform`)
