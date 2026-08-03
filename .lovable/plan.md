# Radiergummi-Smoothmodus + Finanzen-Oberfläche (Vollausbau)

## Teil 1: Smoothmodus nur bei PNG/JPG

- Der Smoothmodus wird kontextabhängig: sobald der Radierer über ein Objekt geführt wird, das kein Rasterbild (PNG/JPG) ist (Vektorlinien, Schraffuren, PDF-Vektorinhalt, CAD-Objekte), fällt die Radierung automatisch auf „Hart" zurück.
- Im Radiergummi-Panel (Projektmappe und CAD) wird der Smooth-Button deaktiviert (ausgegraut), wenn die aktuelle Auswahl bzw. das Zielobjekt kein Rasterbild ist, mit Hinweistext: „Weicher Modus ist nur für Bilder (PNG/JPG) verfügbar."
- Ist nichts ausgewählt, bleibt Smooth wählbar, greift aber nur auf Rasterbildern; die Weichheits-Optionen werden nur bei aktivem, nutzbarem Smoothmodus angezeigt.

## Teil 2: Finanzen-Oberfläche neu aufbauen

Die bestehende Finanzen-Seite (Budget/Einnahmen/Ausgaben-Liste) wird durch die gezeigte Struktur ersetzt. Kopfzeile und linkes Panel bleiben optisch identisch zu Board.

### Ordnerstruktur links
- Oberster Eintrag: das Projekt selbst als Hauptordner.
- Zwei Anlage-Buttons: „+ Übersicht" (Ordner, z. B. „01 Rohbau") und „+ Aktion" (Unterordner = Unternehmen/Gewerk).
- Übersichten können Aktionen enthalten; Baum ist auf-/zuklappbar, umbenennbar, löschbar, per Kontextmenü sortierbar.
- Suche + Filter oben, „+ Neuer Ordner"-Button unten, wie in den Bildern.

### Aktion (Unternehmen) – rechtes Fenster
- Titel (freier Text, inline editierbar) + Notizfeld darunter.
- Karte „Gesamt": Kostenschätzung (Eingabefeld), Angebote (Summe aller Angebote), Rechnungen (Summe aller Rechnungen, direkt darunter „Nachträge: + x €"), Kontrolle (Differenz + Prozent). Angebote und Rechnungen stehen auf gleicher Höhe.
- Kontrolle zeigt zwei Werte mit Prozent: Schätzung vs. Angebot und Schätzung vs. Rechnungen. Angebot = 100 %-Basis für die Rechnungs-Prozentanzeige.
- Kleines „i" neben Rechnungen: klappt die vollständige Rechnungsaufstellung inkl. Nachträge auf.
- Buttons „+ Angebot", „+ Rechnung", „+ Nachtrag" darunter.
- Positionstabelle mit Spalten: Typ | Datum | Nummer (Angebots-/Rechnungs-/Nachtrags-Nr.) | Betrag | Notiz | Löschen-Symbol. Ganz links Drag-Griff (drei Punkte) zum Umsortieren.
- Nachtrag-Zeilen haben vorne ein Dropdown: „Mehrnachtrag" (Betrag orange) oder „Mindernachtrag" (Betrag grün, negativ).
- Nachträge werden summiert (Mehr minus Minder) und zur Rechnungssumme addiert.
- Farben: orange ausschließlich für Mehrnachträge (und Angebotssumme wie im Bild), grün ausschließlich für Mindernachträge.

### Übersicht (Gewerk-Ordner) – rechtes Fenster
- Gleicher Aufbau wie Aktion, aber ohne Anlegen von Positionen.
- Oben „Gesamt" mit eingebbarer Kostenschätzung, automatisch summierten Angeboten, Rechnungen (inkl. Nachträge) und Kontrolle.
- Darunter Tabelle aller enthaltenen Aktionen (Unternehmen) mit deren Einzelsummen.

### Projekt-Hauptordner – rechtes Fenster
- Alle Übersichten untereinander gegliedert, jede Zeile auf-/zuklappbar zur Detailanzeige der enthaltenen Aktionen.
- Links neben dem Namen ein Schalter zum Ein-/Ausschalten einer Übersicht; ausgeschaltete Zeilen fließen nicht mehr in die Gesamtbeträge ein.
- Abschlusszeile mit Gesamtsumme („7 Gewerke / 14 Unternehmen").

## Technische Umsetzung

- `src/lib/financeStore.ts` wird neu modelliert: `FinanceNode` (Typ `overview` | `action`, `parentId`, `order`, `name`, `note`, `estimate`, `enabled`) und `FinancePosition` (`nodeId`, `type: offer|invoice|supplement`, `supplementKind: plus|minus`, `date`, `number`, `amount`, `note`, `order`). Persistenz weiterhin projektbezogen in localStorage, mit Migration/Reset des alten Formats.
- Reine Berechnungs-Helfer (Summen, Nachtragssaldo, Kontroll-Prozente, rekursive Aggregation entlang des Baums unter Beachtung von `enabled`) liegen im Store, nicht in der View.
- `src/pages/FinancePage.tsx` wird neu geschrieben und in Komponenten unter `src/components/finance/` zerlegt: `FinanceTree`, `FinanceSummaryCard`, `FinancePositionsTable`, `FinanceOverviewTable`, `FinanceProjectTable`.
- Sortierung per HTML5-Drag&Drop auf dem Zeilen-Griff; Zahlenformat über das bestehende `formatEur`.
- Nur Design-Tokens verwenden; orange/grün über bestehende Akzent-Tokens.

## Reihenfolge
1. Radiergummi-Smoothmodus.
2. Store-Neumodellierung + Ordnerbaum links.
3. Aktions-Ansicht mit Positionstabelle und Nachtragslogik.
4. Übersichts- und Projektansicht mit Aggregation und Ein-/Ausschaltern.
