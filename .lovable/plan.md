## Ziel

1. PDF-/Bild-Hub-Box visuell und funktional an das Referenzbild angleichen: 4 Icon-Buttons (Anker · Verschieben · Drehen · Skalieren).
2. Schraffur-Kanten-Offset-Hub als kompakter Icon-Button mit klappbarem Eingabefeld.
3. Default-Ebene löschbar machen, solange mindestens eine Ebene übrig bleibt.

---

## 1. PDF-/Bild-Hub-Box (CAD-Hauptseite + Projektmappe)

**Dateien:** `src/components/CadEditor.tsx`, `src/components/page/CadOverlayLayer.tsx`

Bisher: zwei Buttons (Move, Rotate) mit Inline-Inputs.
Neu: vier Icon-Buttons in einer schmalen weißen Pill-Toolbar (analog Referenzbild), gleiche Höhe/Padding wie heute.

Buttons (links nach rechts):
- **Anker** (`Crosshair`-Icon): nur Anzeige, zeigt aktuell aktiven Eckpunkt; Klick wechselt zyklisch zwischen den 4 Ecken (setzt `documentHubState.cornerIndex`). Kein Eingabefeld.
- **Verschieben** (`Move`-Icon): klappt Δx/Δy-Inputs auf (wie heute), Enter commit, Escape schließt.
- **Drehen** (`RotateCw`-Icon): klappt Winkel-Input auf (wie heute), absoluter Winkel in °.
- **Skalieren** (`Maximize2`- oder `Scaling`-Icon): klappt einen Faktor-Input (`× 1.000`) auf; Enter ruft `scaleDocumentAroundCenter(doc, factor)` aus `documentGeometry.ts` und schließt die Box.

Verhalten:
- Nur ein Modus zur Zeit ist „aktiv"; Klick auf anderen Button wechselt Eingabefeld.
- Buttons rendern grundsätzlich immer; Inputs nur im aktiven Modus.
- Identische Implementierung in `CadOverlayLayer.tsx` (Projektmappe) für Konsistenz.

State-Erweiterung in `CadEditor.tsx` / `CadOverlayLayer.tsx`:
- `docHub.mode: "move" | "rotate" | "scale" | null`
- Neuer Local-State `docHubScale` (String, Default „1.000").

Keine Änderungen an `documentHubState` in `CadApp.ts`/`MiniCad.ts` außer dem bestehenden `cornerIndex`-Feld, das jetzt für den Anker-Cycle verwendet wird.

---

## 2. Schraffur-Kanten-Hub (Offset-Eingabe)

**Dateien:** `src/cad/LineHub.ts` (oder neue kleine Hub-Komponente), `src/cad/SelectTool.ts`

Heute: beim Klick auf Hatch-Kante mit OFFSET-Aktion öffnet sich der Standard-`LineHub` mit zwei Inputs (Länge + Winkel).

Neu: kompakter Icon-Button (z.B. `Scissors`/`MoveHorizontal`-Icon) als kleine weiße Pill an Mausposition. Klick auf Icon → Eingabefeld (nur Offset in m) klappt rechts daneben auf. Enter commit (wie heute via `_applyHatchEdgeHubValues`), Escape schließt.

Umsetzung:
- Neue minimale Klasse `EdgeOffsetHub` in `src/cad/EdgeOffsetHub.ts` (analog `LineHub`, aber nur ein Wert + Icon-Button-State). Eigenes DOM-Element, fixed positioniert, draggable via `hubDrag.ts`.
- Instanziieren in `CadApp.ts` und `MiniCad.ts`, parallel zum bestehenden `hub`.
- `SelectTool._beginHatchEdgeOffsetAction` und `beginWallEdgeAction(... OFFSET)` schalten von `this.app.hub` auf `this.app.edgeHub` um.
- Updates während Maus-Drag (`updateDisplay`) gehen weiterhin durchs neue Hub.

Funktion bleibt 1:1 (gleiche Commit-Logik in SelectTool).

---

## 3. Default-Ebene löschbar

**Dateien:** `src/cad/LabelManager.ts`, `src/cad/IdPanel.ts`

- `LabelManager.deleteGroup(id)`: Lock-Prüfung entfernen; stattdessen verweigern, wenn `this.groups.length <= 1`. Nach erfolgreichem Löschen: keine automatische Neuanlage.
- Falls die gelöschte Gruppe die `activeDrawLabelId` war: auf erste verbleibende Gruppe umschalten (`groups[0].id`).
- `IdPanel`-Reassign-Aufrufe nutzen weiterhin `Defaults.defaultLabelId` — bei Löschen einer beliebigen Gruppe wird auf die erste verbleibende Gruppe umgehängt (nicht zwingend Default). Falls Default selbst gelöscht wird, vorher Objekte auf erste andere Gruppe migrieren.
- Im IdPanel-UI Lösch-Button auch für die Default-Gruppe sichtbar/aktiv schalten; deaktivieren wenn nur eine Gruppe existiert.
- `LabelManager.restore`: weiterhin defensiv — falls leeres Array, behalte mindestens Default.

---

## Technische Notizen

- Keine Änderungen am Snap-/Topology-System.
- Skalierung nutzt vorhandene `scaleDocumentAroundCenter` (zentrumserhaltend, ohne Rotation neu zu berechnen).
- Icon-Set bleibt `lucide-react`: `Crosshair`, `Move`, `RotateCw`, `Scaling`, `Scissors`.
- Pill-Stil identisch zur aktuellen Hub-Box (`bg white`, `border hsl(var(--border))`, Schatten).
