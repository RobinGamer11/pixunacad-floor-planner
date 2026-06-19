## Ziel
Die vier Punkte in der Seitenansicht (`ProjectWorkspace`) umsetzen — schrittweise, mit klaren Etappen, damit keine bestehende Funktion (Linien-Tool, Hilfslinie, Layers, Pan/Zoom) bricht.

---

### 1. „Seiten" → „Auswahl" (oberster Tab) + Pan überall

- Tab umbenennen: erstes Tab im rechten Inspector heißt **„Auswahl"** (bisher „Seiten"). Inhalt = aktuelle Seitenliste **plus** oben eine kompakte Auswahl-Sektion (selektiertes Objekt, „Alles auswählen", Mehrfachauswahl-Info). Wenn nichts aktiv ist, ist „Auswahl" der Default-Tab.
- Aktives Werkzeug `select` wird automatisch gesetzt, wenn der User ein anderes Werkzeug per „Beenden" verlässt.
- Auf der weißen Fläche **außerhalb des Blattes** und auf dem Blatt (wenn `select`/kein Tool aktiv ist) gilt: **Linksklick + Ziehen = Pan**. Mittlere Maustaste / Alt+Links bleibt zusätzlich erhalten.
- Scroll-Bereich wird vergrößert (großzügiges Padding um das Blatt herum, z. B. `min(100vw, 100vh)` zusätzlich auf jeder Seite), sodass auch bei starkem Zoom in alle Ecken gepannt werden kann.

### 2. Text 1:1 aus CAD-Oberfläche

Statt das bestehende einfache HTML-Text-Element zu erweitern, wird der CAD-`TextTool` analog zum bereits eingebauten `LineTool` in `MiniCad` exponiert:

- `MiniCad` bekommt: `textTool` (Instanz von `TextTool`), `textEditor` (`TextEditorOverlay`), `selection`, `setSelection`, `beginTextEdit`, `getCurrentTextStyle`, `defaultTextStyle`, plus Serialisierung der `scene.textBoxes`.
- `setActiveTool("text")` wird unterstützt; Tool-Schaltzustand wechselt zwischen `line` / `text` / `null`.
- `CadOverlayLayer` mountet zusätzlich den DOM-Host für `TextEditorOverlay` (contenteditable Layer) und die Toolbar-Hooks, die `TextEditorOverlay` erwartet.
- `ProjectWorkspace`-Tool-Panel „Werkzeugeinstellung → Text" liefert: Schriftgröße, Farbe, Fett, Kursiv, Unterstrichen, Ausrichtung — Werte werden in `MiniCad.setTextDefaults({...})` synchronisiert (analog `setLineDefaults`).
- Das bestehende generische `text`-PageElement entfällt für neu gesetzte Texte; alte Elemente bleiben rückwärtskompatibel renderbar.

### 3. Übergreifende Snap-Interaktion + Ränder snapbar

- Da Text & Linie jetzt beide in derselben `MiniCad`-Scene leben, snappen sie automatisch aufeinander (Topologie-Engine kennt Segment-, TextBox-Ecken und Hatch-Snaps).
- **Seitenränder als Snap-Quelle**: In `MiniCad` wird beim Mount ein unsichtbares „Page-Frame"-Objekt als 4 Segmente registriert (links/oben/rechts/unten) mit `labelId: "__frame__"`, das:
  - **nicht** gerendert wird (Renderer-Patch filtert die Frame-`labelId` heraus),
  - **nicht** selektierbar / verschiebbar ist (LineTool/SelectTool ignorieren es per Label-Check),
  - aber von `TopologyEngine.findBestSnap` ganz normal als Snap- und Hover-Quelle behandelt wird → blaue Hover-Linie + Fangpunkt wie bei normalen Linien.
- Die Frame-Segmente werden bei Änderung der Seiten-Maße (Seiteneinstellung) neu erzeugt.

### 4. Transparenz

- Werkzeugeinstellung für **Linie** und **Text** bekommt einen `Transparenz`-Slider (0–100 %).
- Wird auf `defaultLineAlpha` / `defaultTextAlpha` in `MiniCad` geschrieben.
- Renderer-Patch in `MiniCad._patchRendererTransparent` setzt `ctx.globalAlpha` pro Objekt anhand eines neuen optionalen `alpha`-Felds auf `Segment` / `TextBox`. Default 1.0 ⇒ visuell identisch zum CAD.
- Serialisierung speichert `alpha` mit; Restore liest es.

---

### Technik-Details

```text
src/cad/embed/MiniCad.ts
  + setActiveTool("text")
  + textTool, textEditor, selection state
  + setTextDefaults({fontSize,color,bold,italic,...,alphaPercent})
  + setLineDefaults({..., alphaPercent})
  + registerPageFrame(widthMm, heightMm) → 4 protected segments
  + serialize/restore: textBoxes[], alpha
  + renderer patch: globalAlpha pro Objekt, Frame-Label überspringen

src/components/page/CadOverlayLayer.tsx
  + DOM-Host für TextEditorOverlay (contenteditable div + toolbar-Stubs)
  + Props: activeTool: "line"|"text"|null, textDefaults, lineAlpha, textAlpha
  + ruft registerPageFrame initial + bei Seitenänderung

src/pages/ProjectWorkspace.tsx
  + Tab „Seiten" → „Auswahl" inkl. Auswahl-Sektion
  + activeTool default = "select"
  + Pan-Handler: Linksklick auf Hintergrund & auf Blatt (wenn select)
  + größeres Padding im Scroll-Container
  + Werkzeugeinstellung „Text": volle CAD-Optionen + Transparenz
  + Werkzeugeinstellung „Linie": + Transparenz
  + Text-Tool aktiviert MiniCad("text") statt PageElement-Insert
```

### Reihenfolge (jede Etappe einzeln verifizierbar)

1. **Etappe A** — Tab-Rename + Pan auf weißer Fläche & Blatt + erweitertes Scroll-Padding.
2. **Etappe B** — Page-Frame als unsichtbares Snap-Ziel (Punkt 3, Teil 1).
3. **Etappe C** — Transparenz für Linie (Punkt 4, Teil 1) — kleine, isolierte Änderung.
4. **Etappe D** — Text 1:1 aus CAD in MiniCad + Werkzeugeinstellung Text (Punkt 2).
5. **Etappe E** — Transparenz auch für Text (Punkt 4, Teil 2) + finaler Snap-Test Text↔Linie↔Frame.

### Offene Punkte
- Sollen vorhandene „alte" Text-Elemente (vor dieser Änderung) automatisch in CAD-TextBoxes migriert werden, oder nebeneinander bestehen bleiben (rückwärtskompatibel)?
- Soll der Auswahl-Tab auch Bulk-Aktionen (Löschen, Gruppieren) für seitenweite Mehrfachauswahl bekommen, oder reicht Anzeige + „Alle auswählen"?
