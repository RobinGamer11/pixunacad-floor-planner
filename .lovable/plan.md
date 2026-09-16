# Live-Zusammenarbeit vervollständigen: CAD + Projektmappe

Die bestehende Operationsschicht (`src/lib/cadCollab/*`, Migration `20260916120000_cad_collab.sql`) wird angebunden und um eine getrennte, schlanke Mappen-Schicht ergänzt. Keine neue Architektur, keine Umbauten an Zeichenwerkzeugen oder Datenformaten.

## Schritt A – Serverseitige Revision und Konfliktsicherheit

Heute zählt jeder Browser die Objektversion selbst hoch; zwei Personen können dieselbe Nummer erzeugen.

- Neue Migration: Tabelle `cad_object_state` (Projekt, Blatt, Objekt, `revision`, letzter Stand, letzter Bearbeiter) als eindeutige Wahrheit je Objekt.
- Eine Datenbankfunktion schreibt Änderung + Protokolleintrag atomar: Sie vergibt die nächste Revision selbst und meldet zurück, ob die mitgeschickte Ausgangsrevision noch aktuell war.
- Bei Kollision: nur dieses eine Objekt wird beim Verlierer neu geladen, alles andere bleibt unberührt. Beide Browser landen bei identischem Endstand.
- Rechte unverändert über die vorhandenen Funktionen `project_role_of` / `project_can_edit`; Betrachter können nicht schreiben.

## Schritt B – CAD: Live-Vorschau an Werkzeugaktionen

- Neuer, leichter Melder in `CadApp`, den die Werkzeuge während einer laufenden Geste aufrufen (kein neues Zustandsmodell).
- Angebunden in `SelectTool` (Verschieben `groupDragActive`, Drehen `groupRotateActive`, Fangpunkt-Aktionen `groupAnchorActive`), Bibliotheks-Transformation, Skalierung inkl. Referenzstrecke und Dokument-Transformation.
- Während der Bewegung: gedrosselter Broadcast (80 ms), keine Datenbankschreibung.
- Beim Loslassen: genau eine dauerhafte Objektoperation (über den vorhandenen `commitHistorySnapshot`-Weg), genau ein Undo-Schritt.
- Bei Escape: leere Vorschau senden, damit die Gegenseite sofort wieder den bestätigten Stand zeigt.

## Schritt C – CAD: weiche Sperren wirklich aktiv

- `lockObject(...)` beim Beginn einer Bearbeitung (Auswahl mit Editierabsicht bzw. Gestenstart), `unlockObject(...)` bei Bestätigen, Loslassen, Werkzeugwechsel, Abwählen, Escape, Blattwechsel und Verlassen der Seite.
- Abonnement auf `cad_object_locks` plus Präsenz, damit fremde Markierungen sofort erscheinen und nach Ablauf (30 s) wieder verschwinden; regelmäßiges Verlängern der eigenen Markierung.
- Darstellung: dezente farbige Kontur um das Objekt plus kleiner Name der bearbeitenden Person, gezeichnet als Überlagerung – Zeichenobjekte bleiben unverändert.
- Die Sperre warnt nur; andere Objekte und die Seite bleiben immer bearbeitbar.

## Schritt D – CAD: Präsenz vollständig

- `updatePresence(...)` bei Blattwechsel (Hook in `setActiveSheetId`), gedrosselt bei Cursorbewegung (aus `input.mouse.wx/wy`), bei Beginn und Ende einer Objektbearbeitung.
- Anzeige nur für Personen auf demselben Blatt; fremde Cursor dezent auf der Zeichenfläche.
- Cursorpositionen laufen ausschließlich flüchtig über Realtime und werden nie gespeichert.

## Schritt E – CAD: Bibliotheksdefinitionen und Ordner

- Über den vorhandenen `onLibraryChange`-Rückruf werden neue oder geänderte Definitionen und deren Ordnerzuordnung als eigene Operationsart mitsynchronisiert.
- Eingehende Definitionen werden vor zugehörigen Instanzen angewandt, damit eine platzierte Instanz bei der Gegenseite nie ohne Geometrie ankommt.

## Schritt F – Projektmappe: eigene, getrennte Schicht

Die Mappe hat ein eigenes Modell (`projectStore.ts`: `ProjectPage` → `PageElement`). Sie wird nicht in CAD-Objekte überführt.

- Neue Migration: Tabellen für Mappen-Element- und Seitenoperationen mit derselben serverseitigen Revisionslogik wie in Schritt A, gleiche Rechteprüfung.
- Neue Schicht `src/lib/mappeCollab/*` (Diff, Anwenden, Datenzugriff, Sitzung) nach demselben Muster wie `cadCollab`, aber am Mappen-Modell.
- Ankopplung am zentralen Punkt des Stores (`setState`/`emit` und `sealHistory`), ohne Werkzeuge oder Speicherformate anzufassen. Änderungen anderer werden über den vorhandenen Systemweg `applySharedProject`-Prinzip elementweise eingespielt, ohne Undo-Eintrag beim Empfänger.
- Einzeln synchronisiert: Seiten (erstellen, umbenennen, löschen, Reihenfolge), Zeichnungen/MiniCAD, Textfelder, Tabellen inkl. Zellen, Bilder, PDF-/Dokumentelemente, sowie Position, Größe, Drehung, Ebene und Sichtbarkeit je Element. Kommentare laufen bereits über eine eigene Live-Tabelle und bleiben unverändert.
- Live-Vorschau beim Verschieben, Drehen und Skalieren: Anbindung an die vorhandenen Zeigerhandler in `ProjectWorkspace.tsx`, die ohnehin erst beim Loslassen speichern. Nur Broadcast während der Bewegung, eine dauerhafte Operation beim Loslassen.
- Präsenz je geöffneter Mappen-Seite und weiche Sperre je Element, gleiche Darstellung wie in CAD.
- Text und Tabellenzellen: feldbezogene Konfliktbehandlung – gleichzeitig geänderte Zellen werden je Zelle zusammengeführt statt still überschrieben; bei echter Kollision auf derselben Zelle gewinnt der serverseitig bestätigte Stand und die verlierende Eingabe wird sichtbar gemeldet.
- Remote-Änderungen setzen weder Werkzeug noch Auswahl noch eine geöffnete Bearbeitung zurück. Betrachter sehen alles, schreiben nichts.

## Schritt G – Gesamtstand nur noch als Rückfallebene

- `sharedProjectSync.ts` speichert den kompletten Stand nur noch als Sicherung und Wiederherstellung (deutlich seltener, kein Überschreiben bei normaler Bearbeitung) – in CAD und Mappe gleichermaßen.

## Schritt H – Abnahme

Zwei Browser-Sitzungen mit zwei Projektmitgliedern:

- Gleiche CAD-Seite; Verschieben zeigt bei B Vorschau während des Ziehens und den Endstand nach Loslassen.
- Bearbeitung zeigt bei B Sperrhinweis mit Namen; parallele Arbeit an verschiedenen Objekten bleibt vollständig erhalten.
- Gleichzeitige Bearbeitung desselben Objekts ergibt in beiden Browsern denselben Endstand.
- Neue Bibliotheksdefinition samt Platzierung kommt bei B vollständig an.
- Betrachter sehen Präsenz und Änderungen, können weder Operationen noch Sperren schreiben.
- Gleiche Prüfungen in der Projektmappe, inklusive paralleler Arbeit auf verschiedenen Seiten und gleichzeitiger Tabellenzellen.
- Nach Neuladen bleibt alles erhalten. Zusätzlich Typprüfung, Tests und Produktions-Build.

## Hinweis

Die neuen Datenbanktabellen liegen im eigenen Supabase-Projekt dieses Repositorys. Die zugehörigen Migrationsdateien werden im Ordner `db/migrations` abgelegt und müssen einmalig im SQL-Editor ausgeführt werden; ich nenne dir am Ende den genauen Schritt.
