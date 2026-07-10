## Ziel

Im Projektmappen-Werkzeug „CAD-Blatt als PDF einfügen" soll der Ausgabemaßstab (A4/A3/A2-tauglich) direkt beim Einfügen gewählt werden — genau dort, wo aktuell der statische Text `1:50` neben dem Blattnamen steht. Modellbereich bleibt 1:1 (Archicad/AutoCAD-Verhalten).

Der bereits vorhandene Maßstabs-Dropdown im Inspector des platzierten Blattes (blauer Rahmen, Fangpunkte, Icons) bleibt unverändert.

## Änderungen

### 1) `src/pages/ProjectWorkspace.tsx` — `CadToolSection` (um Zeile 4093–4130)

- Neue lokale State-Map `pickScale: Record<sheetId, string>` mit Default `sheet.scale ?? "1:100"`.
- Das `<span className="text-muted-foreground">{s.scale}</span>` in der Blatt-Zeile durch ein kompaktes `<select>` ersetzen mit Optionen: `1:1, 1:20, 1:50, 1:100, 1:200, 1:1000, 1:2000, frei…` (Konstante `PAGE_PLAN_SCALES` wiederverwenden).
  - `onClick`/`onMouseDown`: `stopPropagation`, damit der Zeilen-Toggle nicht auslöst.
  - `frei…` öffnet `askPlanScale(...)` und übernimmt das Ergebnis.
  - Falls der aktuelle Wert nicht in der Liste ist (z.B. `1:75`), wird er als zusätzliche Option gerendert (analog Inspector).
- `goCadForSheetPdf(sheetId, mode)` erhält den gewählten Maßstab und hängt ihn als Query-Param an:
  `…/cad?sheetPdf=<id>&mode=<view|frame>&scale=<gewählt>`.

### 2) `src/pages/CadPage.tsx` — Query-Param `scale` verwenden

- `const sheetPdfScale = params.get("scale") ?? undefined;`
- In `confirmSheetPdf`:
  - `const effectiveScale = sheetPdfScale ?? sheet?.scale;`
  - `parseSheetScale(effectiveScale)` statt `sheet?.scale`.
  - `stashPendingSheetPdf({ …, sheetScale: effectiveScale })` — so übernimmt die Projektmappen-Import-Pipeline den gewählten Maßstab.

### 3) Nicht anfassen

- Inspector-Panel für platzierte `cad-view`-Elemente (ab Zeile 4189): schon vorhandener Maßstabs-Dropdown, blauer Rahmen, Fangpunkte, Icons — bleibt.
- CAD-Oberfläche (Modellbereich immer 1:1) und `SheetPanel` — unverändert.

## Ergebnis

Beim Einfügen eines CAD-Blatts wählt der Nutzer den Ausgabemaßstab direkt am Blatt in der Auswahlliste. Der Rahmen-/Ansicht-Export erzeugt daraus ein maßstabsgetreues PDF in mm (A4/A3/A2), das mit Maßstabslineal messbar ist. Nachträglich ist der Maßstab weiterhin rechts im Inspector änderbar.
