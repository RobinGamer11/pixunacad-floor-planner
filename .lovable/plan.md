# Plan: Sticker entfernen, Raster-Standard, objektbasierte CAD-Live-Zusammenarbeit

Umsetzung in klar getrennten Arbeitsschritten. Jeder Schritt ist für sich lauffähig, wird einzeln geprüft (Typprüfung, Tests, Build) und einzeln nach GitHub `main` übertragen. Erst danach beginnt der nächste Schritt.

## Schritt 1 – Sticker-Werkzeug aus CAD entfernen

- Werkzeug, Bedienfelder und Tastenkürzel für Sticker entfernen (`StickerTool.ts`, `StickerManager.ts`, Sticker-Bereiche in `CadEditor.tsx`, Eintrag in `constants.ts`).
- Sticker-Objekte aus Szene, Zeichnen, Auswahl, Radierer, Gruppentransformation und Zwischenablage entfernen.
- Bestehende Projektdaten bleiben lesbar: Beim Laden werden alte Sticker-Daten still verworfen, kein Ladefehler, keine Migration nötig. Bereits gezeichnete Sticker verschwinden dadurch aus alten Zeichnungen – das ist die gewünschte Folge der Löschung.
- Bibliotheksobjekte, Tabellen und alle anderen Werkzeuge bleiben unverändert.
- Prüfung: Tests, Produktionsbuild, manueller Durchlauf aller Werkzeuge in der CAD-Oberfläche.

## Schritt 2 – Raster-Standard auf 85 % Transparenz

- Standardwert der Rasterdeckkraft auf 15 % (= 85 % Transparenz) setzen; gilt für neue Projekte und für Projekte ohne gespeicherten Wert.
- Vorhandene, bewusst eingestellte Werte bleiben erhalten; der Regler in den Einstellungen bleibt unverändert bedienbar.

## Schritt 3 – Fundament der Zusammenarbeit (Datenbank und Rechte)

- Neue Tabelle für einzelne CAD-Objektänderungen: Operations-ID, Projekt, CAD-Seite, Objekt-ID, Objektart, Änderungstyp, Objektdaten, Bearbeiter, Zeitstempel, laufende Objektversion.
- Zusätzliche Tabelle für kurzlebige Bearbeitungsmarkierungen (wer bearbeitet gerade welches Objekt, mit Ablaufzeit).
- Zeilenschutz (RLS) über die bestehende Projektmitgliedschaft: Lesen für alle Mitglieder mit Zugriff, Schreiben nur mit Bearbeitungsrecht (Besitzer, Administrator, Mitglied); Betrachter bleiben schreibgeschützt. Zugriffsrechte, Rollen und das bestehende Team-System bleiben unverändert.
- Migrationsdatei unter `db/migrations/` mit Rechtevergabe wie in den bestehenden Dateien. Keine geheimen Schlüssel im Browser.
- Der bisherige gemeinsame Gesamtstand (`project_documents`) bleibt vollständig erhalten – als Erststand, Wiederherstellung und Sicherheitskopie.

## Schritt 4 – Änderungen erkennen und senden

- Neue, isolierte Schicht neben dem bestehenden CAD-Kern; die Zeichenlogik selbst wird nicht angefasst.
- Nach jeder bestätigten Änderung wird der bisherige mit dem neuen Zeichnungsstand je Objekt verglichen; daraus entstehen einzelne Operationen (erstellt, geändert, gelöscht) je Objekt und Seite. Es wird nie mehr die komplette Zeichnung bei jeder Änderung übertragen.
- Gebündelt und verzögert gesendet, damit Datenverkehr und Kosten klein bleiben.
- Gilt für alle Zeichenobjekte einschließlich Bibliotheksinstanzen sowie für Ebenen- und Seitenangaben, soweit sie die sichtbare Zeichnung betreffen.

## Schritt 5 – Änderungen anderer empfangen und anwenden

- Live-Verbindung je Projekt; eingehende Operationen werden objektweise in die lokale Zeichnung eingespielt.
- Fremde Änderungen lösen keinen erneuten Versand aus (keine Endlosschleife), landen nicht im eigenen Rückgängig-Verlauf, setzen die Ansicht nicht zurück und wechseln das aktive Werkzeug nicht.
- Beim Öffnen und nach Verbindungsabbruch: zuerst gespeicherter Gesamtstand, danach die fehlenden Objektänderungen.
- Ohne Verbindung arbeitet CAD unverändert lokal weiter; nach Wiederverbindung wird sauber abgeglichen.
- Der bisherige Gesamtstand wird für geteilte Projekte nur noch deutlich seltener und ohne stilles Überschreiben geschrieben (Sicherungsstand), nicht mehr als Weg für normale Objektänderungen.

## Schritt 6 – Live-Vorschau beim Verschieben, Drehen, Skalieren

- Während des Ziehens wird nur eine flüchtige, gedrosselte Vorschau übertragen – nichts gespeichert.
- Erst beim Loslassen entsteht genau eine dauerhafte Objektänderung und genau ein eigener Rückgängig-Schritt.
- Abbruch mit Escape hinterlässt keine dauerhafte Änderung; die Vorschau bei den anderen wird zurückgenommen.

## Schritt 7 – Gleichzeitige Bearbeitung desselben Objekts

- Ein gerade bearbeitetes Objekt erhält bei den anderen eine dezente farbige Umrandung mit Namen (weicher Hinweis, kurzlebige Markierung).
- Die Seite wird nie gesperrt; verschiedene Objekte bleiben jederzeit parallel bearbeitbar.
- Bei einer dennoch kollidierenden Änderung ist höchstens dieses eine Objekt betroffen – niemals die komplette Zeichnung –, und es bleibt nachvollziehbar, welcher Stand übernommen wurde.

## Schritt 8 – Präsenzanzeige

- Dezente Leiste mit Initialen/Avatar und Namen der Personen, die gerade auf derselben CAD-Seite sind; optional deren Cursorposition.
- Cursorbewegungen werden nicht gespeichert. Keine neuen großen Panels oder Hilfebereiche; Gestaltung im bestehenden PixunaCAD-Stil (dunkelblau, Gold nur als Akzent).

## Schritt 9 – Abschlussprüfung

- Zwei parallele Sitzungen im selben Projekt: Objekt anlegen, verschieben, drehen, löschen, Bibliotheksinstanz platzieren – beide Seiten bleiben vollständig erhalten.
- Betrachterrolle kann nicht schreiben; Verbindungsabbruch und Wiederverbindung geprüft.
- Zeichnen, Auswahl, Fangpunkte, Transformationen, Rückgängig/Wiederholen, Bibliothek, Import/Export und Projektmappe unverändert.
- Tests, Typprüfung und Produktionsbuild; Übertragung nach GitHub `main`.

## Technische Hinweise

- Änderungserkennung baut auf dem vorhandenen Serialisierungsstand (`_serializeScene` / `scenesById`) auf: Objektvergleich je `id` statt neues Zeichenmodell. Dadurch bleiben Objektmodell, Undo-Verlauf und alle Werkzeuge unberührt.
- Live-Übertragung über Supabase Realtime mit dem bestehenden Client aus `src/lib/networkClient.ts` (öffentlicher Publishable Key, Zugriff über die bestehende Sitzung, RLS greift unverändert). Ein zusätzliches Paket ist voraussichtlich nicht nötig; falls doch, feste Version plus vollständige Aktualisierung von `package.json` und Lockfile.
- Vorschau und Präsenz laufen ausschließlich über flüchtige Realtime-Kanäle, nicht über die Datenbank.
- Neue Dateien bündeln die Schicht (z. B. `src/lib/cadCollab/*`); `sharedProjectSync.ts` wird nur als Fallback-Pfad angepasst, nicht ersetzt.

## Nicht Teil dieses Vorhabens

Projektmappe, Board, Finanzen und andere Bereiche bleiben bei der bisherigen Synchronisierung. Keine Neugestaltung der Oberfläche, keine Entfernung bestehender Team-, Netzwerk-, Bibliotheks- oder Import-/Export-Funktionen.
