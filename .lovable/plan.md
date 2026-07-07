## Ziel
Einheitliche Kopf- und Werkzeugleisten für **Projektmappenbearbeitung** (`ProjectWorkspace`) und **CAD-Oberfläche** (`CadPage`/`CadEditor`) — schnelles Wechseln zwischen beiden Modi. Kleinere Aufräumarbeiten in der Projektübersicht.

## 1. Projektübersicht (`src/pages/ProjectsHome.tsx`)

- **Default-Tab**: `useState<Tab>("uebersicht")` statt `"seiten"`.
- **Reiter umbenennen**: `["seiten", "Seiten"]` → `["seiten", "Mappen"]` (Key bleibt intern `"seiten"`, damit nichts anderes bricht).
- **Reiter „Mappen"**: Button `+ Seite in Mappe` wird zu `Bearbeiten` (Pencil-Icon). Klick öffnet `ProjectWorkspace` der aktiven Mappe — also `navigate(/project/:id)` mit gesetzter `activeMappeId`. Ein Klick auf eine einzelne Mappenkarte macht dasselbe wie bisher.
- **Übersicht → „Projektinfo"-Panel**: kompakter — kleinere vertikale Abstände (`space-y-2` → `space-y-1.5`), kleinere Label-Zeile (10 → 9 px), enger padding (`p-5` → `p-4`), Werte weiterhin gestapelt aber dichter.

## 2. Gemeinsamer Kopf (Projektmappenbearbeitung + CAD-Oberfläche)

Neue Komponente `src/components/workspace/WorkspaceHeader.tsx` — identisches Layout, unterscheidet nur den aktiven Modus:

```
[ ‹ Zurück ]  Projektmappenname   [ Projektmappe ] [ CAD-Oberfläche ]   ...   [ ↶ ] [ ↷ ]  100%  [ Präsentieren ] [ Teilen ] [ Exportieren ]
```

Props: `projectId`, `mappeName`, `mode: "workspace"|"cad"`, Undo/Redo-Callbacks + canUndo/canRedo, Zoom-Wert, Handler für Präsentieren/Teilen/Exportieren.

- Zurück → `navigate('/')` (Projektübersicht).
- Zwei Mode-Buttons: aktiver Modus gold-hinterlegt, inaktiver als Outline. Klick wechselt Route (`/project/:id` ↔ `/project/:id/cad`).
- **Undo/Redo, Zoom-%, Vollbild/Präsentieren, Teilen, Exportieren** immer im Kopf rechts — in beiden Modi.

## 3. CAD-Oberfläche (`src/pages/CadPage.tsx`, `src/components/CadEditor.tsx`)

- `CadPage`-Header durch `WorkspaceHeader` (`mode="cad"`) ersetzen.
- `CadEditor` gibt Undo/Redo-State und Zoom nach oben (Callback-Props oder ref), damit der Header sie steuern kann.
- Aus dem linken CAD-Rail (`CadEditor.tsx` ~Z. 862–879) werden **Undo- und Redo-Buttons entfernt**. „Raster" und „Pipette" bleiben. Der Export-Button im linken/unteren Panel bleibt bestehen — der neue Header-Export ruft dieselbe Aktion.

## 4. Projektmappenbearbeitung (`src/pages/ProjectWorkspace.tsx`)

- Bestehenden `<header>` (Z. 282–332) und den bisherigen kleinen Zurück/Titel/Aktionen-Block durch `WorkspaceHeader` (`mode="workspace"`) ersetzen. Bestehende Handler (Undo/Redo/Zoom/Teilen/Präsentieren/Exportieren) werden an den neuen Kopf verdrahtet.
- **Linke Werkzeugleiste**: `CAD öffnen`-Button (Z. 200–205) entfernen (Wechsel läuft jetzt über den Header).
- **CAD-Blatt-Werkzeug** (Z. 206–211): Anzeige anpassen. → siehe Klärungsfrage unten.
- Optische Angleichung an CAD-Rail: gleiche Breite (56 px statt 14/w-14 → 14 = 56 px passt bereits), gleiche Button-Klasse (`cad-rail-btn`), gleicher Divider-Stil, gleiches Padding, gleiche Icon-Größe (18 px). `ToolRailButton` wird auf `cad-rail-btn`-Optik umgestellt, damit beide Rails visuell identisch wirken.

## 5. Routing

- Keine neuen Routen. Beide Modi teilen sich `projectId`; Wechsel per `navigate('/project/:id')` bzw. `.../cad`.

## Technische Details

- Neue Datei: `src/components/workspace/WorkspaceHeader.tsx`.
- `CadEditor` bekommt optionale Props `onUndoState?(canUndo,canRedo)`, `onZoomChange?(n)`; alternativ Ref-API auf `appRef` freigeben. Wahrscheinlich sauberer: Kontext-loses Callback-Interface via `useImperativeHandle` auf einem forwarded ref.
- `ProjectWorkspace`: bestehender `zoom`-State und Header-Buttons wandern in Props für `WorkspaceHeader`.
- Keine Änderungen an `projectStore` nötig.

## Klärungsfrage
Der letzte Satz „In der Projektmappe soll das Werkzeug-Symbol 'CAD-Blatt' **besch** angezeigt werden." wirkt abgeschnitten. Ich lese das als **„beschriftet"** (also Icon + Text-Label wie im CAD-Rail bei „Raster/Pipette"), damit das Werkzeug klar erkennbar ist — passend zur Angleichung der Rails. Falls anders gemeint (z. B. „bescheiden/kleiner", „bezeichnet als …", „besser hervorgehoben"), bitte kurz korrigieren; sonst setze ich es als „beschriftet" um.
