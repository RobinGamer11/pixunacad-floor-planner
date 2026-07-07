## 1. Übersicht → Projektmappen-Feld (`src/components/project/UebersichtView.tsx`)

- **Symbol „Projektmappe bearbeiten" (Zahnrad `Settings2`) je Zeile entfernen** (Z. 179–185 im `MappenPanel`). Der oben rechts sitzende Button „Bearbeiten" reicht; ein Doppelklick auf die Zeile öffnet weiterhin die Bearbeitung. Umbenennen (Stift) und Löschen (Papierkorb) bleiben.
- **Panel präsenter machen** — das Mappen-Feld ist das wichtigste Element der Übersicht:
  - Höhe erhöhen: `height: 260` → `height: 360`.
  - Panel-Padding: `p-4` → `p-5`, Kopfabstand `mb-3` → `mb-4`.
  - Kopfzeile (Label „PROJEKTMAPPEN") in Akzentgold statt Muted, Größe `text-[11px]` → `text-xs`, damit es visuell dem Wichtigkeitsgrad entspricht.
  - Mappen-Zeilen etwas großzügiger: Padding `p-2` → `p-2.5`, Vorschau-Kachel `w-8 h-8` → `w-10 h-10` mit Seitenzahl in `text-xs`, Name in `text-[13px]` → `text-sm font-medium`.
  - Grid-Verhältnis in `UebersichtView` (Z. 27) leicht zugunsten links: `[minmax(0,320px)_minmax(0,1fr)]` → `[minmax(0,360px)_minmax(0,1fr)]`.
- Keine Änderungen an Drag & Drop, Store oder Routing.

## 2. Einklappbares rechtes Panel — Symbol links vom Fenster

Ziel: In **Projektmappe** und **CAD-Oberfläche** wird das rechte Panel wie in der Projektmappe eingeklappt/aufgeklappt, und der Toggle-Button sitzt in beiden Modi **an der linken Kante des rechten Panels** (nicht mehr in der Tab-Leiste rechts).

### 2a. CAD (`src/components/CadEditor.tsx`)

- Bestehenden Ausblenden-Button aus der Tab-Reihe entfernen (Z. 1537–1545 — `PanelRightClose` neben den Tab-Buttons).
- Neuen schmalen Rand (`w-6`, volle Höhe, `border-l`) am **linken Rand des Panels** einführen (innerhalb des `<aside>` bei Z. 1518, als erstes Child in einem neuen `flex-row`-Wrapper). Darin ein Button mit `PanelRightClose` oben, der `setRightOpen(false)` ausführt.
- Der bestehende eingeklappte Zustand (Z. 2641–2655) bleibt unverändert und dient als „Öffnen"-Griff.
- Kein Verhalten des Druckmodus ändern (der behält sein eigenes ✕ oben rechts).

### 2b. Projektmappe (`src/pages/ProjectWorkspace.tsx` + `RightInspector`)

- Aktuelle `onCollapse`-Übergabe (Z. 696) bleibt vom API her erhalten, wird aber **nicht mehr im Inspector-Header** angezeigt.
- In `RightInspector` den bisherigen Collapse-Trigger (im Kopf des Panels) entfernen und stattdessen — analog zum CAD — eine schmale linke Griffleiste (`w-6`, volle Höhe, `border-l`) mit `PanelRightClose`-Button ganz oben rendern, die `onCollapse()` aufruft.
- Auch für den `PrintPanel`-Pfad: Die linke Griffleiste wird als Wrapper um den rechten Bereich gerendert, damit Einklappen aus jedem Modus gleich funktioniert. `PrintPanel` selbst behält sein ✕ zum Verlassen des Druckmodus.
- Der eingeklappte Zustand (Z. 702–715) bleibt gleich (kleiner `PanelRightOpen`-Griff).

### Ergebnis

- Beide Kopfzeilen/Panels sind identisch bedienbar: **linker Rand des rechten Panels = Einklappen**, **schmaler Griff nach dem Einklappen = Ausklappen**.
- Keine Änderungen an Store, Routing oder Business-Logik.

## Technische Details

- Nur Frontend/Presentation. Keine neuen Dateien; drei bestehende werden bearbeitet:
  - `src/components/project/UebersichtView.tsx`
  - `src/components/CadEditor.tsx`
  - `src/pages/ProjectWorkspace.tsx` (inkl. `RightInspector`-Block darin)
- Kein Umbau der Tab-Logik, keine neuen Props außer der Wiederverwendung von `onCollapse`.
