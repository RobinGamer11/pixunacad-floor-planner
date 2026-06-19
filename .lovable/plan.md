# Projektmappen-Architektur

Das bisherige CAD-Programm wird in eine dreistufige Anwendung eingebettet:

```
Startseite (Projektübersicht)
    └── Projektmappe (Seiten-/Layout-Editor)
            └── CAD-Zeichnen  ← bisheriges Programm, unverändert
```

## 1. Routing & App-Struktur

Neue Routes in `src/App.tsx`:
- `/` → `ProjectsHome` (Startseite, Projektübersicht)
- `/project/:projectId` → `ProjectWorkspace` (Projektmappe / Seiten-Editor)
- `/project/:projectId/cad/:sheetId?` → bisheriger `CadEditor` mit „Zurück"-Button oben

Zentraler Zustand in `src/store/projectStore.ts` (Zustand + localStorage):
- `projects[]` mit `{ id, name, ort, thumbnail, pages[], sheets[], tasks[], events[], info, updatedAt }`
- `pages[]` mit `{ id, title, format, orientation, margins, background, elements[], backgroundOverlay }`
- `sheets[]` = bisherige CAD-Zeichnungsblätter (Maßstab etc.) – Brücke zur bestehenden `SheetManager`-Logik
- `tasks[]`, `events[]` projektweit

Damit der bestehende CAD-Code unangetastet bleibt, lädt/speichert `CadEditor` weiterhin über seinen internen `SheetManager`; pro Projekt wird ein Storage-Key-Prefix verwendet.

## 2. Startseite `src/pages/ProjectsHome.tsx`

3-spaltiges Layout:
- **Links**: Projektkarten-Liste (`ProjectCard`) mit Thumbnail, Seiten-/Zeichnungsanzahl, letzter Änderung, „+ Neues Projekt".
- **Mitte**: Schnellansicht des ausgewählten Projekts (read-only): Tabs Übersicht / Seiten / Zeichnungen / Notizen / Varianten / Team, Konzept-Preview, Zeitstrahl.
- **Rechts**: Dashboard – Projektinfo, Aufgaben (projektübergreifend), Kalender, Termine.

Doppelklick auf eine Projektkarte → Navigation zu `/project/:id`.

## 3. Projektmappe `src/pages/ProjectWorkspace.tsx`

Ersetzt die Startansicht komplett (eigene Vollbild-Route).

**Linke Sidebar** (`PagesSidebar`):
- Schmale Werkzeugleiste ganz links: Seiten, Text, Linie, **CAD-Zeichnen**, PDF einfügen, Bild, Notiz, Formen, Tabelle, Zeitstrahl, unten Ebenen/Vorlagen.
- Seiten-Liste mit Thumbnails, Drag-Reorder, „+"-Button.
- Unten: **Hintergrund-Transparenz** – Auswahl einer anderen Seite + Slider (0–100 %), Sichtbar-Toggle. Rendert die gewählte Seite als halbtransparenter Hintergrund-Layer.

**Mittlere Canvas** (`PageCanvas`):
- Blatt im gewählten Format (A3 quer / A4 hoch / frei), Zoom-Pills unten.
- Freie Platzierung von Elementen: `text`, `image`, `pdf`, `table`, `note`, `timeline`, `cad-view`, `line`, `shape`.
- Element-Typ `cad-view` rendert einen statischen Snapshot eines Zeichnungsblatts (via bestehender Renderer-Export-Funktion, read-only auf dem Blatt).
- Klick auf „CAD-Zeichnen" in der Werkzeugleiste → Route zu `/project/:id/cad`.

**Rechte Sidebar** (`RightInspector`) mit 3 Tabs:
1. **Seiteneinstellungen** (Default, wenn nichts gewählt): Seitentitel, Format, Ausrichtung, Ränder, Hintergrund-Toggle, Layout (Spalten, Spaltenabstand, Hilfslinien), seitenbezogene Notizen.
2. **Werkzeug** (kontextabhängig, wenn Element gewählt):
   - Bild: Breite, Höhe, Position, Transparenz, Schatten, Rahmen.
   - Text: Schrift, Größe, Farbe, Ausrichtung.
   - CAD-Ansicht: Liste der Zeichnungsblätter mit Maßstab (aus bestehendem `SheetManager`); Klick = auswählen/platzieren, Doppelklick = wechselt in den CAD-Editor des Blatts.
   - Weitere Typen: minimaler Default-Inspector.
3. **Aufgaben**: Liste der Projektaufgaben mit Checkbox + Datum, Gruppierung „Heute / Diese Woche / Geplante Termine".

## 4. CAD-Bereich (bestehend)

`CadEditor` bleibt funktional 1:1 erhalten. Einzige Ergänzung: Header-Leiste mit „← Zurück zur Projektmappe"-Button, die nur erscheint, wenn `projectId` aus der Route vorhanden ist. Kein Eingriff in Tools/Renderer/Topology.

## 5. Persistenz

- `localStorage`-Key `pixuna.projects.v1` für Projektliste & Seiten/Tasks/Events.
- CAD-Daten pro Projekt unter `pixuna.cad.<projectId>.*` (Prefix-Erweiterung der bestehenden Storage-Keys in `SheetManager`/`PlanManager`).
- Auto-Save bei jeder Änderung (debounced).

## 6. Design

Helle, moderne Ästhetik analog zu den Mockups: warmes Off-White (`#FAF8F5`), feines Beige für Karten, Akzent Terrakotta/Gold (`#C9874C`), schwarze Primary-Buttons, Inter/Geometric Sans. Semantische Tokens in `src/index.css` ergänzen (`--surface`, `--surface-muted`, `--accent-gold`, `--ink`).

## 7. Umsetzung in Etappen (in dieser Reihenfolge)

1. Design-Tokens + Routing-Grundgerüst + Zustand-Store mit Demo-Projekten.
2. Startseite (Karten, Schnellansicht, Dashboard).
3. Projektmappe (Sidebar, Canvas mit Basis-Elementen Text/Bild/Notiz, Rechte Sidebar mit 3 Tabs).
4. CAD-Integration: „Zurück"-Button, CAD-Ansicht-Element + Doppelklick-Sprung, Sheet-Liste im Werkzeug-Tab.
5. Hintergrund-Transparenz-Layer.
6. Aufgaben/Kalender-Logik scharf schalten (CRUD).

## Offene Punkte / Annahmen

- Element-Editor ist bewusst MVP: Drag/Resize via einfacher Mouse-Handler (kein externes Lib), Inspector setzt Werte. Reicht für das geforderte „frei platzierbar".
- CAD-Ansicht im Blatt = Bild-Snapshot (PNG) des Zeichnungsblatts, generiert über bestehenden `Renderer`. Aktualisierung beim Öffnen der Seite.
- Keine Authentifizierung / kein Cloud-Backend in diesem Schritt – alles client-seitig (passt zur bisherigen Roadmap: Registrierung später).

Soll ich so umsetzen? Falls du Reihenfolge/Scope anpassen willst (z.B. zuerst nur Startseite + Projektmappe ohne CAD-Snapshots), sag kurz Bescheid.
