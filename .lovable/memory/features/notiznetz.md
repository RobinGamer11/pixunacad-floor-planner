---
name: Notiznetz
description: Baumbasierte Projektverwaltung (Thema/Notiz/Aufgabe) mit radialem Graph, Verknüpfungen und Zeitstrahl
type: feature
---
- Route: `/project/:projectId/notes` (`NotesPage.tsx`). Mode-Button „Notiznetz" in `WorkspaceHeader`.
- Store `src/lib/notesStore.ts`: `NotesState { categories, statuses, nodes }`. Statuses als `{id,label,color}` (default open/wip/done, weitere per `addStatus`). Persistiert unter `pixuna.notes.<projectId>`.
- Nur 3 sichtbare Kinds: `topic | note | task` (file/photo im Typ vorhanden, UI ausgeblendet).
- Layout 3 Spalten (`280 / 1fr / 460`), links + rechts einklappbar via `PanelLeftClose`/`PanelRightClose` (wie Projektmappe).
- Linke Spalte: Suche, Kategorie-Filter + „+", Status-Filter + „+", „Neues Thema"; darunter hierarchische Baumliste (`TreeList`, rekursiv, Chevron zum Aufklappen). Auf ausgewähltem Knoten erscheinen inline `+ Unterthema/Notiz/Aufgabe` – Kinder werden dem Klick-Knoten untergeordnet.
- Drag&Drop: Listeneinträge sind draggable (`application/x-note-id`), Ziel = Drop-Zone „Verknüpfungen" im Editor. Verknüpfung ist bidirektional (`notesStore.linkNodes/unlinkNodes`).
- Editor: Titel/Beschreibung Pflicht. Grid: Datum/Uhrzeit/Fällig/Dringlichkeit/Status/Kategorie/Verantwortlich/Beteiligte (Verantwortlich + Beteiligte direkt unter Kategorie). Kommentare mit Trash-Icon löschbar.
- Rechte Spalte: 3 Modi via Chip-Toggle: `Projektnetz` (radialer Gesamtbaum, `layoutRadial` – Root Zentrum, Themen Ring 1, deren Kinder Ring 2 …), `Verknüpfungen` (nur ausgewählter Knoten + seine `linkedIds` kreisförmig), `Zeitstrahl` (Themen als Meilensteine, Kinder chronologisch darunter).
- Zoom/Pan via `useZoomPan`: Mausrad zoomt am Cursor, LMB/Finger pannt, 2-Finger-Pinch skaliert.

