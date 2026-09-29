# Exportbereich – Architektur

- Export ist **derselbe CAD-Bereich** (`/project/:id/cad?view=export`): gleiche `CadApp`-Instanz, gleiche Werkzeuge, Auswahl, Fangpunkte, Zwischenablage und Verlauf. Wechsel CAD ↔ Export behält den Verlauf.
- Exportseiten = erweiterte `Plan`s (`PlanManager`), Ordner = `PlanFolder`; Baum/Reihenfolge/Auswahl in `src/cad/planTree.ts`.
- Jede Exportseite hat ihre Anmerkungs-Scene (`planScenesById`); Werkzeuge bearbeiten auf Exportseiten nur diese. Quell-CAD wird über „CAD-Blatt bearbeiten“ bewusst geöffnet.
- Ausschnitte (`Projection`) sind standardmäßig `linked` (keine Geometriekopie, Cache über `CadApp.contentRevision`), optional `frozen`; fehlende Quelle → Platzhalter.
- Alle Mutationen der Oberfläche laufen über `CadApp.mutatePlans` → genau ein Verlaufsschritt. Der globale Snapshot enthält Seiten, Ordner, Anmerkungs-Scenes, Transparenzpausen und Referenzen.
- Exportauswahl ist temporärer UI-Zustand (kein `includeInExport`). PDF: `CadApp.exportPlansByIds` in sichtbarer Baumreihenfolge, ohne Duplikate, inkl. Anmerkungen.
- Seitenrand und Lochung sind Hilfslinien, werden nie gedruckt.
- Freischaltung: bis Cloud-Objektsync + Zwei-Geräte-Test verborgen (`src/lib/exportFeature.ts`, `localStorage pixuna.exportPreview=1`).

## Cloud
- Seiten, Ordner und Transparenzpausen laufen als Strukturobjekte (`plans`, `planFolders`, `planOverlays` auf `__structure__`), Anmerkungs-Scenes als eigene Seiten `plan:<planId>` – einzeln, keine Gesamtstände.

## Offen
- Echter Zwei-Geräte-Test, danach Freischaltung des Reiters.

## Lokaler Bedienzustand (nie Projekt/Verlauf/Cloud)
- Geöffnete Exportseite: `localStorage pixuna.export.activePage.<projektId>` (`src/lib/exportLocalState.ts`). Undo/Redo und Cloud schalten die Seite nie um.
- Ordner auf-/zugeklappt: `pixuna.export.collapsed.<projektId>`.
- Häkchen der alten CAD-Druckplanliste: nur im Speicher von `PlanManager` (`isSelected`), nicht im Planmodell.
- Layout: Werkzeugleiste | Export-Seitenleiste | Papier | eine rechte Leiste (`Seiteneinstellungen | Werkzeug | Ebenen`), gesteuert über `CadEditor mode="export"`.
- Seitenrand und Lochung (`src/cad/pageGuides.ts`) sind nicht druckbare Fanggeometrie über `topology.planFrame.guides`.

## Lochungsmuster, Seitenverbund, Mindestseite
- `Plan.holePattern` ("none" | "din2" | "four" | "a5ring6") ersetzt `holePunch`; Altdaten `true` → `din2`. Renderer und Fangpunkte nutzen `holePunchPointsMm` – nie in der PDF.
- Verbund: je Seite `spreadOffset`, je Verbund `spreadLayouts[spreadId].layoutMode` (eigenes Strukturobjekt im Cloud-Abgleich). Nur die aktive Seite ist bearbeitbar; Nachbarn werden angezeigt und über Griffe verschoben (ein Verlaufsschritt beim Loslassen). PDF: ein Verbund = eine Seite.
- `deletePlan()` lehnt die letzte Seite ab.

## Verbund-Bedienung und Ausschnitte (Restkorrektur)
- Nachbarseiten zeigen schreibgeschützt ihre Ausschnitte und Anmerkungs-Scene (`CadApp.planScenesById`) über `Renderer.planNeighborDraw`; der Renderer greift nicht auf die App zu. Nur Papierkanten, Rand und Lochung der Nachbarn sind fangbar.
- Freie Anordnung: Eckpunkte an jeder Verbundseite (auch der aktiven); Vorschau über `CadApp.previewSpreadPage` (Gesamt-Layout, aktive Seite wandert mit), Fixieren über `commitSpreadPage` (ein Verlaufsschritt, nur der Versatz der bewegten Seite).
- Neue Seiten heißen „Seite N“ (`PlanManager.nextDefaultName`, aus vorhandenen Namen bestimmt).
- Ausschnittkanten: „Einschneiden / Kante verschieben“ folgt dem Zeiger, Setzen per Klick/Häkchen/Enter, Esc stellt zurück; Clip nie kleiner 0 (volle Größe). Freier Maßstab direkt im Hub (`applyProjectionScale`, Clip proportional).

## Seitenanordnung, Hub-Symbole, Transparenzpause (gezielte Korrektur)
- Verschiebe-Eckpunkte gibt es nur an der **aktiven** Exportseite und nur im flüchtigen Modus `CadApp.spreadLayoutEditing` (kein Cloud, kein Undo/Redo, kein Snapshot, kein localStorage – Seitenwechsel und Neuladen starten fixiert). Umschalter in `ExportPageSettings`; nach „✓ Fixieren“ endet der Modus.
- Eckpunkt antippen startet direkt den Verschiebe-Modus. Anheben von Finger/Stift beendet nur die Zeigerbewegung, die Vorschau bleibt; gespeichert wird allein über „✓ Fixieren“ oder Enter (ein Verlaufsschritt), Abbrechen/Esc stellt die Ausgangslage her.
- Nachbarseiten werden nur mit dem Auswahlwerkzeug per Tap aktiv (`SpreadHandles`: Werkzeug bei pointerdown und pointerup muss `selectTool` sein).
- Eckpunkte in der Optik der CAD-Fangpunkte (`--cad-snap-point`), 28-px-Touchfläche, kein Gold, keine Textbuttons.
- Ausschnitt-Hub rein symbolisch (`PlanController._icon`, 24er-Vektorraster wie IdPanel/SheetPanel); Text nur in `title`/`aria-label`, Maßstabswert als kleiner Wert neben dem Symbol (`.plan-hub-value`).
- Zeigerform der Ausschnitt-Bedienung läuft über `PlanController._setCursor`; `null` gibt nur den selbst gesetzten Zeiger frei (zurück auf `default`) und lässt andere CAD-Werkzeuge unberührt.
- Transparenzpause im Export: `TopologyEngine.tracingSnapScenes` ist eine klar getrennte, schreibgeschützte Fangquelle für die Export-Anmerkungen (Linien, Schraffuren, Wände, Texte, Maße, Dokumente, Freihand). Gefüllt in `CadApp._syncPlanTracingLayers`, nur solange die Hintergrundseite sichtbar eingeblendet ist. Keine Kopie in die aktive Scene, nicht auswählbar, nicht editierbar, nie in der PDF.
- Zusätzlich liefert `TopologyEngine.tracingSnapGeometry` die Fanggeometrie der sichtbaren CAD-Ausschnitte: `src/cad/tracingSnapGeometry.ts` sammelt alle im CAD fangbaren Objektarten (Segmente, Schraffuren inkl. Löcher/Kanten, Wände, Türen/Fenster, Text-/Tabellen-Ecken, Maßketten, Dokumente, Freihand, Bibliotheksinstanzen) und transformiert sie mit Maßstab, Position, Drehung und Clip in Plan-Weltmeter. Rein temporär, per Signatur gecacht, bei Deckkraft 0 oder ausgeblendeter Transparenzpause leer.
