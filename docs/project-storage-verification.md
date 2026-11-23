# Kontogetrennte Speicherung und Projektöffnung

## Änderungen
- Alle lokalen Pixuna-Projektschlüssel, offene Änderungen, Cloud-Baselines und CAD-IndexedDB-Einträge werden kontogetrennt gespeichert. Kontoänderungen starten das Dokument neu, um sämtliche alten In-Memory-Stores und Antworten zu verwerfen.
- Normales Abmelden beendet lokale Schreibvorgänge, ohne Cloud-Upload oder Löschung. Fehler halten das Abmelden an und werden angezeigt.
- Unzugeordnete alte Browser- und IndexedDB-Daten bleiben unverändert erhalten und werden nicht dem nächsten Konto zugewiesen.
- Alte authentifizierte Workspace-Sicherungen werden zuerst lokal archiviert; nur fehlende Projekt-IDs und fehlende CAD-Träger werden einmalig übernommen. Aktuelle Projektlisten werden nicht ersetzt. Bei vollem Speicher oder ungeklärtem Papierkorb bleibt die Übernahme unbestätigt.
- Namensänderungen verwenden eine dauerhaft gespeicherte Ausgangsbasis und atomare Bedingungen auf `name` und `updated_at`. Registrierung aktualisiert bestehende Namen nicht. Namenskonflikte können ausdrücklich zugunsten des lokalen oder Cloudnamens entschieden werden.
- Die Startseite lädt nur den Cloudindex; alte Gesamtstände werden erst im geöffneten Projekt geprüft. Ladefehler bleiben sichtbar, vorhandene Listen bleiben erhalten.
- Cloud-Sicherung setzt lokale Bestätigung, Registrierung, Metadaten und verfügbare bestätigte Inhaltsquellen voraus. Fehlende Quellen und Konflikte liefern Fehler statt Erfolg.
- Projektöffnung wartet auf lokales Laden, Cloudentscheidung, Bilddekodierung und ersten Renderer-Aufbau. Keine timerbasierte Prozentanzeige oder Ersatz-Exportseite während des Ladens. Das bereitgestellte Bild wird als statisches WebP ausgeliefert.

## Tatsächlich geprüft
- 57 relevante Tests bestanden (Kontotrennung, Namensschutz, Ladephasen, Cloud-Sicherungsresultate, bestehende Dokumente/Blätter/Papierkorb).
- Die vorhandene optionale Canvas-Native-Bindung fehlt in der Sandbox. Nach temporärem Entfernen dieses ungebauten optionalen Moduls liefen die Tests durch; keine Paket- oder Lockdatei geändert.
- Gezieltes ESLint: keine Fehler, eine vorhandene Fast-Refresh-Warnung beim AuthProvider.
- Vorschau-Build meldet `build OK`.
- Chromium: echte IndexedDB-Schreibung während Konto A → B, ausschließlich in A wieder lesbar; Projektverzeichnis und Baselines getrennt.
- Ladefehleransicht auf 1280×900 und 390×844 geprüft: Illustration, 35 %, Wiederholen/lokal öffnen/Projektübersicht sichtbar, kein horizontaler Überlauf.
- Loginseite ohne Laufzeitfehler geprüft.

## Nicht verifiziert / externe Abnahme
- Kein nutzbarer angemeldeter Testaccount für die externe Anwendung verfügbar. Erstellung → Umbenennung → reale Cloud-Sicherung → Logout/Login → zweites Gerät wurde nicht gegen echte Cloud-Daten geprüft.
- Registrierung, Passwortreset und die gehosteten Auth-Einstellungen wurden nicht geprüft.
- Kein separat ausgeführter Typecheck oder Produktionsbuild; diese Sandbox führt den Vorschau-Build automatisch aus.
- Keine Datenbank- oder Vercel-Änderung ausgeführt. Keine neue SQL-Migration nötig: die Änderung verwendet die vorhandenen Namens-/Zeitstempelfelder und bestehenden RLS-Regeln. Deren gehosteter Stand bleibt unbestätigt.
- Der konkrete Verbleib von „Mustervorlage“ bleibt ungeklärt; kein Projekt wurde anhand seines Namens gelöscht, umbenannt oder zusammengeführt.

## Repository-Übertragung
Die Sandbox darf nicht selbst pushen; nach dem abschließenden Commit übernimmt die Plattform die Übertragung. GitHub main muss anschließend geprüft werden.

```powershell
git fetch origin; git log origin/main --oneline -5
```