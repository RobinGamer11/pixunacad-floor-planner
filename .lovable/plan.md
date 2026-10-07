# Speicherschonender Pixelmodus und kontrollierter Projektspeicher

Ausgangsstand: GitHub `main` = `155d077b` (identisch mit dem im Auftrag geprüften Stand, keine zwischenzeitlichen Änderungen).

Der Auftrag ist zu groß für einen einzigen Schritt. Er wird in den neun Phasen aus Abschnitt 16 umgesetzt, jede Phase mit eigenem Commit, Typprüfung, Tests und Build. Keine Phase wird als Erfüllung des Gesamtauftrags gemeldet. Bedienung (Vektor/Pixel-Schalter, Tablet-Regeln, Undo-Größe 20) bleibt unverändert; die DPI-/Supersampling-Regler im Pixel-Bereich entfallen (Abschnitt 2.1).

## Phasen

1. **Ablehnungen und Aktionsabschluss eindeutig** – `rasterizeIntoLayer` liefert `ok | cancelled | rejected | failed`; Bildobjekt-Fallback in `maybeRasterize` entfernt; `strokeCount` einmal je Aktion; 4096-Kachel-Wache meldet Ablehnung statt stillem Abbruch; neues `runActionAsync` mit Action-/Generations-ID, `settleHistoryState`/Werkzeugwechsel bestätigen nie laufende Jobs; 250-ms-Prüfung vergleicht nur noch Revisionsmarker.
2. **Sparse, begrenzte Arbeitsbilder + RasterPolicy** – neues `src/cad/raster/RasterPolicy.ts` (einzige Stelle für Auflösung/Budget, Halbierungsstufen, Mindestdetail, sonst Ablehnung); kachelweise Verarbeitung mit Randbereich, Kandidaten gegen echte Strich-/Flächengeometrie, leere Kacheln verworfen, kein `alphaTrimBox` auf Großbildern; Fortschritt + Abbrechen.
3. **Lokale Ablage auf IndexedDB** – Manifeste, Blob-Kacheln, Outbox, temporäre Aktionen; `CadEditor.persist()` schreibt keine Base64-Pixel mehr in localStorage, revisionsgesteuert und gebündelt; sichtbarer Speicherstatus (lokal vs. Cloud), Quota-Fehler sichtbar.
4. **Manifestmodell** – `solidFill`, `patternFill`, `paint`, `erase`, `checkpoint` je Ebene mit stabiler ID/Revision/Reihenfolge; korrekte Komposition (Radierung wirkt nicht auf spätere Striche), Checkpoints in ruhigen Phasen; Bildschraffuren referenzieren ihr Muster einmal.
5. **Gemischte Auflösungen + gemeinsames RAM-Budget** – Kacheln mit eigener Auflösung je Aktion; ein Ressourcenmanager (Start 64 MiB Cache / 16 MiB Jobs) mit räumlichem Index, LRU, Vorschaustufen, bedarfsweisem Laden; Cache-Miss ≠ transparent ≠ beschädigt.
6. **Alle Rasterkonsumenten anbinden** – Renderer, Radierer, `isOpaqueAt`/`drawIntoMask`, Flächenerkennung, Pipette, MiniCad, Blattvorschauen, Ausschnitte, Transparentpause, `PlanProjections`, `PlanPdfExport` (portionsweise).
7. **Cloud-Sync der Manifeste** – Manifeste als eigene Strukturobjekte über `cad_write_object` mit Revisionsprüfung und Paginierung; Kacheln als Assets; Solo/Geteilt bleiben getrennt; `decideOpen` unverändert.
8. **Serverseitige Quoten** – SQL-Migration im Repo: Konto-/Projekt-/globale Budgets (Zuordnung über `owner_id`), atomare Upload-Reservierungen, Assetmetadaten/Referenzen, Löschstatus, Prüffunktionen mit sicherem `search_path`; `project-attachments` und große JSON-Schreibwege angebunden. Ohne eingetragene Betreiberwerte werden nur speichervergrößernde Cloud-Schreibvorgänge blockiert.
9. **Migration und Bereinigung** – neue Formatversion in `schemas.ts`; alte `rasterLayersByKey` und eigene Muster resumierbar übernehmen; alte aktive Data-URL-Wege entfernen; `AGENTS.md`-Regel „nie verkleinern“ gezielt ersetzen.

## Wichtige Hinweise

- Das Projekt hat in Lovable keine verbundene Cloud; die SQL-Migrationen aus Phase 8 werden nur im Repo bereitgestellt und müssen von euch angewendet werden. Bis dahin bleiben neue Cloud-Assetuploads gesperrt.
- Betreiberwerte (Konto-, Projekt-, Dateilimit, globale Reserve) erfinde ich nicht; sie werden als Platzhalter dokumentiert.
- Geräte-, Last- und Mehrgerätetests übernehmt ihr.

## Vorgehen

Nach Freigabe starte ich mit Phase 1 und 2 im selben Durchgang und melde danach den Stand mit Commit und offenen Phasen.
