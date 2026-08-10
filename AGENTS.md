# AGENTS.md

## Projekt

Projektname: PixunaCAD Floor Planner

GitHub-Repository:
`RobinGamer11/pixunacad-floor-planner`

Hauptbranch:
`main`

Dieses Projekt wird mit mehreren Werkzeugen bearbeitet:

- Lovable
- Codex
- GitHub
- Supabase
- Vercel

GitHub `main` ist die zentrale und verbindliche Codebasis.

Der gewünschte Workflow ist:

Lovable ↔ GitHub `main` ↔ Codex

Änderungen aus Lovable und Codex müssen über GitHub `main` zusammengeführt werden.


## 1. Git- und GitHub-Workflow

Vor jeder Aufgabe:

1. Prüfe, ob die Arbeitsumgebung mit
   `RobinGamer11/pixunacad-floor-planner`
   verbunden ist.

2. Prüfe den aktuellen Stand von `origin/main`.

3. Arbeite immer auf Basis des neuesten verfügbaren `main`.

4. Überschreibe keine neueren Änderungen auf GitHub.

5. Falls die aktuelle Arbeitsumgebung nur ein Export ohne Git-Metadaten ist,
   behandle sie nicht als vollständig synchronisierte Arbeitskopie.


Nach erfolgreicher Umsetzung:

1. Prüfe alle beabsichtigten Änderungen.

2. Führe die vorgesehenen Tests und Build-Prüfungen aus.

3. Committe die Änderungen mit einer aussagekräftigen Commit-Nachricht.

4. Pushe die fertigen Änderungen auf `main`.

5. Verwende niemals Force-Push.

6. Prüfe nach dem Push, ob der Commit tatsächlich auf GitHub `main` vorhanden ist.

7. Nenne in der Abschlussmeldung:
   - kurze Zusammenfassung der Änderungen,
   - wichtigste geänderte Dateien,
   - durchgeführte Tests,
   - Commit-Hash,
   - Status des Pushs auf `main`.


## 2. Falls GitHub-Synchronisierung nicht möglich ist

Falls Codex die Änderungen nicht selbst nach GitHub übertragen kann:

- Die fertige Arbeit darf nicht verworfen werden.
- Weise ausdrücklich darauf hin, dass GitHub noch nicht synchronisiert wurde.
- Nenne den technischen Grund, soweit bekannt.
- Erkläre kurz, welcher nächste Schritt nötig ist.

Verwende in diesem Fall am Ende deutlich:

`WICHTIG: Die Änderungen wurden noch nicht nach GitHub main übertragen. Vor der Weiterarbeit in Lovable muss der Commit/Push bzw. die GitHub-Verbindung noch abgeschlossen werden.`

Eine Aufgabe darf nicht den Eindruck erwecken, vollständig ausgeliefert zu sein,
wenn die Änderungen nur lokal vorliegen.


## 3. Lovable-Kompatibilität

Das Repository ist mit Lovable bidirektional verbunden.

Daher gilt:

- Bestehende Lovable-Funktionalität nicht unnötig entfernen.
- Keine Lovable-spezifischen Strukturen ohne technischen Grund zerstören.
- Externe Änderungen so implementieren, dass Lovable den Code weiterhin laden kann.
- Nach einem erfolgreichen Push auf `main` davon ausgehen, dass Lovable den neuen Stand synchronisieren soll.
- Keine dauerhaft separate Codex-Version des Projekts führen.
- Vor größeren Architekturänderungen prüfen, ob sie die Lovable-Vorschau oder Synchronisierung beeinträchtigen könnten.


## 4. Supabase

Das Projekt verwendet ein eigenes Supabase-Projekt.

Frontend-Konfiguration:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Diese Werte dürfen im Browser verwendet werden.

Niemals im Frontend, Repository oder in öffentlich zugänglichen Dateien verwenden:

- `service_role`
- Secret Keys
- private API-Schlüssel
- Datenbankpasswörter
- persönliche Access Tokens
- sonstige privilegierte Zugangsdaten


### Supabase-Sicherheit

- Row Level Security darf nicht ohne ausdrücklichen Grund deaktiviert werden.
- Neue Tabellen mit nutzerbezogenen Daten müssen auf sinnvolle RLS-Regeln geprüft werden.
- Ein Nutzer darf standardmäßig nur auf seine eigenen Daten zugreifen.
- Änderungen an Auth, Policies, Datenbanktabellen oder Storage müssen auf Sicherheitsfolgen geprüft werden.
- Keine privilegierten Supabase-Schlüssel in Vite-Variablen speichern.


## 5. Umgebungsvariablen und Secrets

- `.env.local` darf nicht committed werden.
- Geheimnisse gehören niemals in GitHub.
- `.gitignore` muss `.env`, `.env.*` und lokale Secret-Dateien schützen, sofern sinnvoll.
- `.env.example` darf nur Platzhalter enthalten.
- Vor jedem Commit prüfen, ob versehentlich Zugangsdaten, Tokens oder Secrets enthalten sind.
- Publishable-/öffentliche Browser-Werte nicht mit echten Secrets verwechseln.


## 6. Tests vor Abschluss

Vor dem Abschluss einer Aufgabe möglichst:

1. TypeScript-/Lint-Prüfung ausführen, sofern vorhanden.
2. Produktions-Build ausführen.
3. Relevante geänderte Funktionen testen.
4. Bei UI-Änderungen mindestens den betroffenen Nutzerfluss prüfen.
5. Bei Auth-Änderungen insbesondere prüfen:
   - Registrierung,
   - Login,
   - Logout,
   - Session-Wiederherstellung,
   - Passwort-Reset,
   - geschützte Routen.

Wenn ein Test nicht durchgeführt werden konnte, dies ausdrücklich angeben.


## 7. Bestehende Funktionalität schützen

- Keine funktionierenden Features ohne ausdrückliche Anforderung entfernen.
- Keine großen Refactorings durchführen, wenn sie für die Aufgabe nicht erforderlich sind.
- Änderungen möglichst auf die tatsächlich betroffenen Bereiche beschränken.
- Vor Änderungen bestehende Implementierung verstehen.
- Bei Unsicherheit lieber bestehendes Verhalten erhalten.
- Kritische Nutzerfunktionen nicht stillschweigend ändern.


### Schutz bei komplexen Änderungen

Bei Änderungen an bestehender Funktionalität niemals nur die unmittelbar
betroffene Datei isoliert betrachten.

Vor der Implementierung:

- relevante Abhängigkeiten, Imports und Aufrufer untersuchen,
- nach allen Verwendungen der zu ändernden Funktionen, Typen und Datenstrukturen suchen,
- betroffene Stores, Hooks, Komponenten und Persistenz berücksichtigen,
- mögliche Auswirkungen auf andere Bereiche des Projekts prüfen.

Bei größeren oder architekturübergreifenden Änderungen zuerst den bestehenden
Daten- und Kontrollfluss analysieren und erst danach implementieren.

Keine Annahmen über nicht gelesenen Code treffen, wenn dieser über Repository-
Suche überprüft werden kann.

Nach der Änderung:

- Git-Diff vollständig auf unbeabsichtigte Änderungen prüfen,
- TypeScript/Lint ausführen, soweit vorhanden,
- Produktions-Build ausführen,
- relevante bestehende Nutzerabläufe auf Regressionen prüfen.

Eine Aufgabe gilt nicht allein deshalb als erfolgreich, weil der geänderte
Code kompiliert.


## 8. Daten und Migrationen

Bei Änderungen am Datenmodell:

- Bestehende Nutzerdaten berücksichtigen.
- Keine destruktiven Migrationen ohne ausdrückliche Notwendigkeit.
- Wenn möglich migrationsfähig und rückwärtskompatibel arbeiten.
- Datenbankänderungen reproduzierbar dokumentieren.
- Wenn Supabase-Schemaänderungen vorgenommen werden, nach Möglichkeit passende Migrationen im Repository hinterlegen.
- Niemals Produktionsdaten ohne ausdrückliche Freigabe löschen.


## 9. Vercel und Deployment

Das Projekt ist für Vercel vorgesehen.

Bei Änderungen, die Deployment betreffen:

- Vite-Kompatibilität erhalten.
- SPA-Routing berücksichtigen.
- benötigte Umgebungsvariablen dokumentieren.
- keine lokalen Pfade oder Rechner-spezifische Konfiguration committen.
- Produktions-Build vor Abschluss prüfen.
- keine Secrets in `vercel.json` oder Sourcecode hinterlegen.


## 10. Rechtliche Seiten

Das Projekt enthält:

- Impressum
- Datenschutz

Diese Inhalte dürfen technisch verbessert werden, aber rechtliche Aussagen nicht frei erfunden werden.

Wenn Angaben fehlen:

- Platzhalter klar kennzeichnen.
- nicht so tun, als seien rechtliche Texte abschließend geprüft.
- keine erfundenen Firmen-, Register-, Steuer- oder Kontaktdaten eintragen.


## 11. Codex-Nutzung effizient halten

Bei Änderungen den Prüf- und Analyseaufwand an Risiko und Umfang der Aufgabe anpassen.

Bei kleinen oder rein visuellen UI-/UX-Änderungen zielgerichtet arbeiten und nur die unmittelbar betroffenen Dateien und Abhängigkeiten prüfen.

Keine unnötigen repositoryweiten Analysen, Subagenten, umfangreichen Browser-Testreihen oder wiederholten Builds durchführen, wenn eine kleinere Prüfung die Änderung ausreichend absichert.

Bestehende Tests bevorzugt gezielt für die betroffenen Bereiche ausführen.

Umfangreiche Repository-Analysen und vollständige Prüfungen hauptsächlich bei größeren, architektonischen oder riskanten Änderungen einsetzen.

**Keine Prüfungen auslassen, wenn dadurch ein relevantes Risiko für bestehende Funktionen oder Daten entstehen könnte.**

Besonders bei CAD-Logik, Persistenz/Datenmodell, Supabase/Auth/RLS, Dateispeicherung sowie Nutzer- und Projektdaten weiterhin gründlich prüfen.

Wenn eine Aufgabe unnötig viel Analyse- oder Testaufwand zu verursachen droht, zunächst den effizienteren sicheren Weg wählen.


### Allgemeine Arbeitsweise

Bei jeder Aufgabe:

- erst bestehenden Code prüfen,
- dann gezielt ändern,
- anschließend angemessen testen,
- danach GitHub synchronisieren.

Keine unnötigen Abhängigkeiten hinzufügen.

Neue Pakete nur verwenden, wenn sie einen klaren technischen Nutzen haben.

Bestehenden Stil, Komponentenstruktur und Namenskonventionen möglichst beibehalten.


## 12. Abschlussmeldung

Jede größere Aufgabe soll mit einer kurzen strukturierten Abschlussmeldung enden:

- Was wurde geändert?
- Welche wichtigen Dateien wurden geändert?
- Welche Tests wurden durchgeführt?
- War der Build erfolgreich?
- Wurde auf GitHub `main` gepusht?
- Wie lautet der Commit-Hash?

Falls der Push nicht erfolgreich war, muss dies deutlich hervorgehoben werden.

Jede Abschlussmeldung endet mit einem vollständigen PowerShell-Befehl für den
jeweils nächsten sinnvollen Schritt.
