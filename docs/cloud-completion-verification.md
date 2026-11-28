# Cloud-Abschluss – Prüfbericht

Basis: `69cde11aa2f40e0e038a8bff18f486739b8e3ef5`.
Das Hauptpaket wurde während der Vorschauunterbrechung als `9e6a518d` gespeichert; dieser Abschluss ergänzt die letzten Korrekturen und Ablaufprüfungen.

**Nicht vollständig freigegeben:** Die SQL-Datei ist noch nicht in der bestehenden Cloud angewendet. Eine angemeldete End-to-End-/Zweigeräte-Abnahme und die Vercel-Prüfung des Abschlusscommits sind nicht erfolgt.

## Sieben Auftragsbereiche

| Bereich | Ergebnis | Verbleibender Schritt |
| --- | --- | --- |
| 1. Dokumente | Blob zuerst mit abgewartetem IndexedDB-Abschluss; kontogetrennte Schlüssel, Base64-Erhalt bis Blob-Bestätigung, lokale Referenzen, getrennte Upload-/Offlinebestätigung, Offline-Download und Vorschauadressen-Freigabe implementiert. Referenzierte lokale Blobs bleiben für Undo erhalten. | Angemeldeten Cloud-Upload und Download im echten zweiten Profil prüfen. |
| 2. Cloud-Dateibereinigung | Exakter bestätigter Snapshot und Revision, serverseitige Home-/CAD-/Export-Referenzen, Schutz gegen neue Referenzen nach Löschfreigabe, kontrolliertes Claim/Remove/Finalize und Wiederaufnahme verlorener Bestätigungen implementiert. Ordnerdateien werden vorgemerkt. | **Neue SQL-Datei anwenden. Ohne diesen Schritt ist der Bereinigungsweg nicht aktiviert.** |
| 3. Persönliche Struktur | Initialisierungsreihenfolge korrigiert; Kontoeinstellungen werden auf den aktiven Store und spätere Cloudplatzhalter angewendet; leere Ordner und entfernte Zuordnungen übernommen. Persönliche Werte bleiben außerhalb des gemeinsamen Home-Payloads. | Einstellungswiederherstellung in einem angemeldeten leeren Profil prüfen. |
| 4. Laden/Aktualisieren | Prüfung bei Projektwahl und späterer Berechtigung, Anfragezusammenfassung, Kontoschutz und sichtbare Ladefehler; globales Aktualisieren meldet Konflikte/Teilfehler. Allgemeine Organisationsansicht reagiert wieder auf tatsächliche Beitragsänderungen. | Angemeldeten globalen Aktualisierungsablauf prüfen. |
| 5. Änderungen/Gesamtstatus | Bereichsweise Dirty-/Fehlerzustände außerhalb geöffneter Ansichten, In-Memory-Erhalt bei vollem Speicher, erneut versuchbare lokale Finanz-/Organisationsschreibvorgänge, Gesamtstatus aus abgemeldeten Quellen, vollständiges manuelles Sichern. Allgemeine Organisation zeigt Speicherstatus je Projekt in ihrer Projektliste. | Statusanzeigen im angemeldeten CAD-/Organisationsablauf prüfen. |
| 6. CAD-Schutz/Wiederherstellung | Strikte Baseline-Prüfung für Hintergrundsicherung und Editor; keine Wiederbelebung gelöschter Cloudobjekte ohne gemeinsame Baseline. Teiloperationen werden einzeln bestätigt. Änderungen während einer Sicherung bleiben ausstehend. Cloud-Blattvorschau schützt lokale Löschungen und verspätete Kontoantworten. Bibliothek, Blatt-/Ebenenstruktur, Infobox-Kategorien und Export wurden über die echte CAD-Sitzung mit simulierten Serverantworten wiederhergestellt. | Gesamtes Produktionsprojekt mit tatsächlichen Bild-/Anlagenzugriffen im zweiten Profil öffnen. |
| 7. Nachweise | 83 Tests in 15 Dateien bestanden; saubere Installation, gezieltes Lint, automatische Typ-/Produktionsprüfung, isolierte SQL-Abnahme und echte IndexedDB-Browserprüfung erfolgreich. | SQL-Anwendung, angemeldete End-to-End-Abnahme und finaler Vercel-Status fehlen. |

## Tatsächlich ausgeführte Prüfungen

- `npm ci`: erfolgreich, unveränderte Paket-/Lockdateien. Meldet **30 vorhandene Sicherheitsbefunde: 7 moderate, 20 hohe, 3 kritische**. Kein automatisches Upgrade oder `audit fix` durchgeführt.
- Vitest: **83/83** betroffene Tests, **15/15** Dateien erfolgreich, maximal zwei Worker.
- Der optionale native `canvas`-Baustein hatte in dieser Umgebung keine kompilierte Bindung. Für die nicht rasterabhängigen Tests wurde nur sein lokaler Installationsordner vorübergehend aus `node_modules` genommen; keine Änderung an Paketdefinitionen oder Lockdatei. Die echte IndexedDB-Abnahme lief in Chromium.
- Gezielt ESLint für die neuen Ablaufprüfungen und zentralen Home-/Dokument-/CAD-Hintergrund-/Statusdateien: **keine Fehler**. Kein vollständiger Repository-Lint behauptet.
- `git diff --check`: erfolgreich.
- Lovable-Prüfprotokoll: automatische Typ-/Produktionsprüfung **build OK**. Kein separater manueller Projektbuild.
- SQL: finale Migration in einer isolierten lokalen PostgreSQL-Testdatenbank **zweimal** angewendet; Backfill, Datenbestand, anonyme/unberechtigte Zugriffe, veraltete Revisionen, Home-/CAD-/Fremdprojekt-Referenzen, neue Referenzen nach Löschfreigabe und Quotenfreigabe nach physischer Entfernung geprüft. Die bestehenden Claim-/Finalize-Funktionen wurden unverändert aus der bisherigen Quotenmigration in die Testdatenbank geladen.
- Echter Chromium-Test: Import ohne Base64, bestätigter Blob, Kontotrennung, abgebrochene IndexedDB-Transaktion ohne neue Metadaten, Neuladen und Offlineöffnen bestanden; **0 Page Errors**. `/login` zeigt Inhalt. Dies ist **keine angemeldete Projekt-End-to-End-Abnahme**.

## Neun verlangte Szenarien

1. Vollständige Home-Wiederherstellung und echte CAD-Sitzungswiederherstellung mit Bibliothek/Export: simulierte Serverbestätigungen und getrennte lokale Zustände bestanden; Produktions-Gesamtabnahme offen.
2. Organisation eines nicht ausgewählten Projekts: Mutationserfassung und anschließende Wiederherstellung bestanden.
3. CAD-Konflikt zweier Geräte und gelöschte Cloudobjekte: geschützt, keine ungeschützten Schreibvorgänge.
4. Dokumentimport, lokale Ablage, Reload, Offlinezugriff, Upload und zweiter Download: Browserprüfung für lokale Abläufe und simulierte Cloud-Ablaufprüfung bestanden.
5. Dokumentlöschung: ohne Bestätigung keine Entfernung; Snapshot-/Referenz-/Quotenablauf geprüft.
6. Speicherfehler: fehlende/abgebrochene IndexedDB-Ablage und volle Browserablage erzeugen Fehler, erhalten die einzige Kopie und verhindern falschen Cloud-Erfolg.
7. Kontowechsel: verspätete Home-/Dokumentantworten verworfen; echte Blob-Kontotrennung bestanden.
8. Persönliche Struktur: spätere Platzhalter und bewusst leere Ordner/entfernte Zuordnungen geprüft.
9. Sitzung/Verbindung: einmalige Token-Erneuerung bei 401, abgelaufene Sitzung, Offlinefehler und erneuter Leseversuch nach Verbindung geprüft.

## SQL-Anwendung – erforderlich

**Genau diese vollständige Datei im SQL-Editor der bestehenden Projekt-Cloud ausführen:**

`db/migrations/20261127195500_document_references.sql`

Voraussetzungen sind die bereits vorhandenen Migrationen `20261124120000_project_home_state.sql` und `20261010120000_storage_quotas_v2.sql`. Nicht die Test-Fixture ausführen. Die neue Migration legt zusätzliche Trigger/Referenzprüfungen an, bewahrt bestehende Nutzdaten und überschreibt keine bestehenden Berechtigungsfunktionen.

Die vollständige SQL-Datei wird zusätzlich als Download bereitgestellt. Nach Anwendung ein Testprojekt sichern, eine Datei auf dem zweiten Profil öffnen, dann die bestätigte Löschung und Quotenanzeige prüfen. Bei einem Fehler nicht zurücksetzen oder Daten löschen; Fehlermeldung und angewendete Datei abgleichen.

## GitHub/Vercel

Der Zwischencommit `9e6a518d` wurde über den bestehenden Remote-main-Abgleich gesehen. Der Abschlusscommit wird lokal gespeichert; seine Übertragung erfolgt über die Plattform nach Abschluss dieser Antwort und konnte vorher nicht auf GitHub oder Vercel bestätigt werden. Kein manueller Push, Force-Push, Reset oder Branchwechsel.
