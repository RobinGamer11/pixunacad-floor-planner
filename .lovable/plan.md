# CAD-Blatt in Projektmappe: Ebene, einheitliche Snaps, Commit & Guides

Anpassungen ausschließlich für platzierte CAD-Blatt-Objekte (`kind: "cad-view" | "cad-viewport"`) in der Projektmappe. Die CAD-Oberfläche bleibt unverändert.

## 1) Bezeichnungs-ID (Ebene)
- CAD-Blätter werden 1:1 in das bestehende **Bezeichnungs-ID**-System integriert — genauso wie Linien, Text, Bilder.
- Im „CAD-Blatt"-Werkzeug-Panel unterhalb des Maßstabs ein Dropdown „Bezeichnungs-ID" (`labelId`) mit den Labels aus `project.settings.labels`.
- Zusatz-Ebenenfelder / eigene „Ebene"-Eingaben aus früheren Iterationen werden entfernt — es gibt nur noch dieses eine Feld, das direkt auf `element.labelId` schreibt.

## 2) Einheitliche Fangpunkte (blau, mit Gold-Verhalten)
- Die goldenen Ecken-/Kanten-Handles am CAD-Blatt-Rahmen werden **durch die blauen Snap-Marker ersetzt** (Look wie in der CAD-Engine: `#4da3ff`, weißer Halo, dunkler Kontrastring — siehe `snapDraw.ts`).
- Die zugehörige Interaktions-Engine (Anker-Setzen, Hover-Glow, HUB-Auslösung, Kanten-Trim) wird auf diese blauen Marker übertragen — die Funktionalität der bisherigen goldenen Punkte bleibt komplett erhalten, nur die Optik wechselt.
- Trefferzonen deutlich vergrößern: Punkt-Hitbox ~14 px, Kanten-Hitzone ~10 px, damit sie gut greifbar sind (Zeichen-Radius bleibt kleiner).
- Ergebnis: Nur EIN Satz Fangpunkte pro CAD-Blatt, sowohl für die eigenen HUB-Funktionen als auch für andere Werkzeuge (Linie, Freihand …), die über `pageSnap` fangen.

## 3) Rechtsklick-Hilfslinien
- Während `hubMode === "move" | "rotate"` öffnet Rechtsklick KEIN Kontextmenü, sondern legt eine Hilfslinie (horizontal + vertikal) durch den geklickten Punkt.
- Vor dem Setzen fragt der Rechtsklick zunächst `getPageSnapRegistry().queryNearest(...)` ab: liegt der Klick nahe einem Fangpunkt eines beliebigen anderen Elements (Linie, Text, CAD-Blatt, Bild, …), wird die Hilfslinie exakt durch dieses Snap-Ziel gelegt — genauso wie beim CAD-Linien-Werkzeug.
- Beliebig viele Guides gleichzeitig; ESC oder Commit/Cancel des aktuellen Modus löscht alle Guides der Aktion.

## 4) Linksklick = Aufnehmen/Ablegen, ENTER/Häkchen = Setzen
- Neuer Preview-Sub-Zustand: `carrying: boolean`.
  - Bei Modus-Start ist `carrying = true` → Objekt folgt der Maus.
  - **Linksklick** togglet `carrying`:
    - `true → false`: Objekt bleibt an aktueller Preview-Position „liegen" (Preview-Rahmen bleibt sichtbar, Maus kann sich frei bewegen).
    - `false → true`: Objekt wird wieder aufgenommen und folgt erneut der Maus, ausgehend vom Klickpunkt (Anker springt auf den Klick, falls dieser nahe einer Kante/Ecke liegt).
  - Es wird bei Linksklick **nie** endgültig committed.
- **ENTER** oder **Häkchen-Symbol (Tablet)** commited endgültig — schreibt Preview via `updateElement` in den Store.
- ESC / X bricht ab und stellt den Ausgangszustand wieder her.
- Enter-Handler wird mit `capture: true` registriert, damit Inspector-Inputs den Tastendruck nicht schlucken.

## Technische Details

**Betroffene Dateien**
- `src/pages/ProjectWorkspace.tsx`
  - `ElementView`: Ecken-/Kanten-Handles auf Blau umstellen (Halo + Core), Trefferzonen vergrößern.
  - `carrying`-State + Linksklick-Toggle-Logik im `hubMode`-Effect.
  - Rechtsklick-Handler (`contextmenu`) mit Snap-Query und Guide-Rendering (dünne gold-transparente Linien, absolut positioniert im `parent`-Rect).
  - Enter-Keydown mit `{ capture: true }`.
  - CAD-Blatt-Inspector: neues `<select>` „Bezeichnungs-ID"; frühere „Ebene"-/„CAD-Viewpoint"-Felder entfernen.
- `src/components/page/CadOverlayLayer.tsx`
  - CAD-Views nicht mehr als `externalDocs`-Snap-Ziele an die Engine übergeben (verhindert doppelte Snap-Quellen).

**Preview-Persistenz**
- `carrying`, `preview`, `guides[]` leben lokal in `ElementView` — kein Store-Write bis Commit.

**Tablet-Integration**
- Bei aktivem `window.__pixunaTabletCommit` bleibt der HUB im „nur Häkchen"-Modus; Häkchen ruft dieselbe Commit-Funktion wie ENTER.
