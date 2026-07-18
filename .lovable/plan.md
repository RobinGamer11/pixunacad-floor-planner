## 1. Freihand-Live-Vorschau

Im `FreeDrawSettingsPanel` (rechte Einstellungsleiste) direkt unter dem Titel eine kleine Canvas-Vorschau (Breite 100 %, Höhe ~64 px) einfügen. Die Vorschau zeichnet einen leicht geschwungenen Beispielpfad mit derselben Renderlogik wie das echte Werkzeug (Wiederverwendung der Stroke-Renderer aus `Renderer.ts`, um 1:1-Parität zu wahren). Sie aktualisiert sich live bei Änderungen von Farbe, Dicke, Transparenz, Linienart, Lücke sowie Bildstempel-Parametern.

## 2. Startseite: „Dateien" + „Fotos" unter „Dokumente"

- In `ProjectsHome` / `UebersichtView` die beiden Reiter entfernen und durch einen einzigen Reiter „Dokumente" ersetzen.
- Innerhalb von „Dokumente" ein Sub-Tabs-Wechsler „Dateien | Fotos" (Segmented Control) einbauen. Bestehende Bereiche werden jeweils darunter gerendert – keine Logikänderung, nur Umgruppierung.

## 3. Neues Modul „Notiznetz"

### 3.1 Navigation und Kopf
- `WorkspaceHeader` bekommt einen dritten Mode-Button „Notiznetz" (Icon `Network`) neben Projektmappe/CAD-Oberfläche.
- Neue Route `/project/:id/notes`, gerendert von `NotesPage.tsx`. Kopf bleibt identisch (Undo/Redo, Trash, Präsentieren, Exportieren, Tablet-Toggle).
- Optik greift die CAD-Farbwelt auf (dunkle Sidebar-Töne, Gold-Akzente, `hsl(var(--cad-*))`-Variablen), Body bleibt hell wie Projektmappe.

### 3.2 Layout (nach Referenzbild)
Drei Spalten, 24/40/36 Aufteilung:
```text
┌─────────────┬──────────────────────┬─────────────────────┐
│ Notizliste  │ Detail-/Edit-Panel   │ Interaktives Netz   │
│ + Filter    │ (Titel, Beschr., …)  │ (Zoom / Navigation) │
└─────────────┴──────────────────────┴─────────────────────┘
```
Oben rechts im Netzbereich die Tabs „Netz-Ansicht / Liste / Kalender / Kanban".

### 3.3 Datenmodell (in `projectStore.ts`)
- `NoteCategory` – frei definierbar, Farbe + Name.
- `NoteStatus` – `offen | in_bearbeitung | erledigt` (Ampel).
- `NotePriority` – `niedrig | normal | hoch | info`.
- `Person` – Name, optional Farbe.
- `NoteEntry` – Pflicht: id, title, description. Optional: date, time, categoryId, status, priority, ownerId, participantIds[], dueDate, comments[], attachmentIds[], linkedNodeIds[], linkedEntryIds[].
- `NoteNode` – Hierarchie-Knoten: id, parentId (null=Projekt), label, color, kind (`root|topic|subtopic|leaf`), children implizit über parentId. Notizen hängen per `nodeId` an einem Blatt.

Alles im bestehenden Project-Snapshot mitgespeichert (nutzt existierendes Undo/Redo automatisch).

### 3.4 Funktionen
- Schnellerfassung: „+ Neu" öffnet Detail-Panel mit nur Titel/Beschreibung (Pflicht), Rest optional.
- Filterchips oben in der Liste (Alle / Offen / In Bearbeitung / Erledigt) + Filter-Icon für Kategorie/Person/Dringlichkeit/Freitextsuche.
- Detail-Panel mit allen Feldern des Referenzbilds inkl. Verknüpfungs-Chips („Verknüpfungen im Netz").
- Ansichten: Netz (interaktiv), Liste (Tabelle), Kalender (Monatsraster nach `date`), Kanban (Spalten nach Status).

### 3.5 Netz-Visualisierung
- Eigenkomponente `NoteGraph` mit SVG + Zoom/Pan (Wheel + Pinch, wiederverwendet Muster aus `Camera.ts`).
- Radiales Layout: Projekt = Zentrum, Hauptthemen im ersten Ring, Unterthemen im zweiten, Blätter (Notizen/Dateien/Fotos) am Rand. Farben pro Kategorie.
- Klick auf Knoten = „hineinzoomen" (Fokus wechselt, Kinder werden zum neuen Ring). Breadcrumb-Zurück oben links.
- Kanten gestrichelt für gleiche Ebene, durchgezogen für Eltern-Kind.

### 3.6 Verknüpfungen zu Dateien / Fotos
- Ein Notiz-Knoten kann `attachmentIds` referenzieren, die aus dem bestehenden Dokumenten-Store gelesen werden – keine Duplikate.

### 3.7 Tablet-Kompatibilität
- Alle Interaktionen mit Pointer Events; das bestehende Tablet-Hilfsrad funktioniert automatisch (Header bleibt identisch).

## Technische Notizen
- Neue Dateien: `src/pages/NotesPage.tsx`, `src/components/notes/NoteList.tsx`, `src/components/notes/NoteDetail.tsx`, `src/components/notes/NoteGraph.tsx`, `src/components/notes/NoteViewTabs.tsx`, `src/lib/notesStore.ts` (Selektoren, dünner Wrapper um `projectStore`).
- `projectStore.ts` bekommt `notes: { entries, nodes, categories, people }`.
- Routing in `App.tsx` ergänzen.
- `WorkspaceHeader` erhält neuen Mode; Mode-Enum wird auf `"workspace" | "cad" | "notes"` erweitert (alle bestehenden Aufrufer bekommen den neuen Button automatisch).

Umfang: rund 1.500 Zeilen neuer Code, keine Änderung an bestehendem CAD-Verhalten.
