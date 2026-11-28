# Projektbild, Beitragsaktionen und Finanzübersicht

Ausgangsstand: `f283a77f`. Lokaler Stand und `origin/main` waren beim Start gleich; der Remoteabruf war über den Lovable-Repository-Endpunkt möglich. Eine unabhängige Prüfung des öffentlichen GitHub-Repositories wurde nicht behauptet.

## Änderungen

- Übersicht und Projektliste lösen alle Standardbilder und eigene Bildquellen über `projectThumbnailSrc` auf. Eine fehlende oder alte SVG-Platzhalterquelle verhindert die Bildanzeige nicht mehr. Die gemeinsame `thumbnail`-Speicherung bleibt erhalten.
- Beide Organisationsbereiche verwenden dieselben zusätzlichen Bearbeiten-/Löschenaktionen in Beitragsliste, Kalender, Ansichtstrahl, Projektnetz und Gantt. Symbolaktionen stoppen Pointer-/Maus-/Klickweitergabe. Bearbeiten über die zusätzlichen Symbole verändert die Auswahl nicht. Löschen fragt den Beitragsnamen ab und prüft das bestehende Schreibrecht vor und nach Bestätigung. Der Einstellungsdialog enthält „Beitrag löschen“.
- Löschen läuft über den vorhandenen Timeline-Store und ergibt einen Undo-Schritt. Beitragsanhänge, Arbeitszeiten und weitere Verknüpfungen werden bewusst nicht physisch gelöscht oder entkoppelt: so gehen weder gemeinsam referenzierte Dateien noch Informationen für Undo verloren. Bestehende separate Anhang-Entfernung bleibt unverändert.
- Die Finanz-Bereichsseitenleiste ist entfernt; Filter und Verwaltung liegen oberhalb des Inhalts. Bereichsknoten und Zuordnungen bleiben unverändert erhalten.
- Beide Perspektiven zeigen ihr projektweites Budget direkt unter der Perspektivenauswahl. Zahlungs-/Prognosedifferenzen und tatsächlicher/voraussichtlicher Geldstand sind getrennt bezeichnet. Bei Bereichsauswahl bleibt dieser obere Budgetvergleich ausdrücklich projektweit; die darunterliegenden Vorgänge und Vergleiche folgen dem Bereich.
- Auftraggeber: „Aufträge & Kosten“ und „Zahlungen“ zeigen dieselben Ausgabenvorgänge. Auftragnehmer: „Kundenaufträge & Einnahmen“ und „Eigene Kosten & Zahlungen“; `customerProcessId` ist eine stabile reine Auswertungszuordnung, keine zweite Hierarchie oder Kopie. Löschen eines Kundenauftrags löscht zugeordnete Kosten nicht.
- Nettozahlungen werden nur mit nachgewiesenem Steuersatz umgerechnet; fehlende Sätze bleiben als nicht vollständig umrechenbar markiert. Budgets ohne eigenen Steuersatz werden nicht willkürlich umgerechnet: ihr Vergleich erfolgt in der gespeicherten Budgetbasis und ist so beschriftet. Übrige Werte folgen der Anzeigeauswahl.
- Betragsfelder verwenden die verfügbare Inhaltsbreite statt allein die Fenstergröße. Belege sind aufklappbare Karten mit Bezeichnung, Betrag, Status und sichtbaren Aktionen; Erwartungsbetragänderung und Zahlungsformular sind umbruchfähig.

## Tatsächlich ausgeführte Prüfungen

- **42/42 Tests**, vier Dateien: `projectOverviewFinance.test.ts`, `financeMath.test.ts`, `cloudFixesRegression.test.ts`, `cloudCompletion.test.ts`; höchstens zwei Worker.
- Der optionale native Canvas-Baustein hat keine kompilierte Bindung. Wie bei der vorherigen Abnahme wurde nur dessen Installationsordner für diese nicht rasterabhängigen Tests temporär aus `node_modules` genommen und danach zurückgestellt. Keine Paket-/Lockdateiänderung. Die ersten Diagnoseversuche mit Bun bzw. fehlendem Happy DOM sind keine bestandenen Prüfungen.
- Gezielt ESLint: keine Fehler; zwei bestehende Fast-Refresh-Warnungen in `OpsOverview`/`OpsViews`.
- Automatische Typ-/Produktionsprüfung: neuestes Buildsignal **build OK**. Kein separater manueller Projektbuild.
- `git diff --check` erfolgreich; geänderte Quelltexte vor Commit auf Credential-Muster geprüft.
- Chromium mit isoliert montierten echten Komponenten: Desktop 1179×993, Tablet 820×1180, Handy 390×844 und 480 px schmale Inhaltsbreite. Erwartungsbetrag gespeichert, Kosten einem Kundenauftrag zugeordnet, Zahlung angelegt, Belegbetrag bearbeitet und wieder aus dem Store gelesen. Kein horizontaler Seiten-/Eingabeüberlauf in den geprüften Finanzansichten; keine Page Errors beim Finanzablauf. Beitragslöschung aus der Organisationsliste geprüft; Gantt-Bearbeiten öffnet den vorhandenen Dialog. Beitragsbuttons besitzen 44×44 px Touchflächen. Standardbild geladen (1672 px natürliche Breite). Screenshots von Finanzkarten und Diagrammansichten visuell geprüft.
- Diagrammpositionierung/Zoom bleibt die bestehende Implementierung; bei stark eingezoomtem Projektnetz können Knoten außerhalb des sichtbaren Ausschnitts liegen. Die weiterhin vorhandene Beitragsliste bietet alle Aktionen ohne Zoom oder Hover.

## Nicht live geprüft

- Anmeldung / echte Projektseite / Cloud-Abgleich / Zweitgerät: der reguläre Einstieg führte zu `/login`, und die Testsitzungsbereitstellung meldete keine mintbare Sitzung. Die isolierte Komponentenprüfung ist **keine angemeldete End-to-End-Abnahme**.
- Physische Handys/Tablets und deren native Touch-/Tastatureigenschaften: nur Chromium-Ansichtsgrößen geprüft.
- Kein neuer SQL-Anwendungsschritt für diesen Auftrag. Frühere offene Cloud-Migration bleibt ein separater Schritt.
- GitHub-Push und Vercel-Abnahme: kein manueller Push möglich; die Plattform überträgt Commits nach Abschluss. Öffentlicher GitHub-main-Stand danach nicht in diesem Turn verifiziert.

**WICHTIG: Die Änderungen wurden noch nicht nach GitHub main übertragen. Vor der Weiterarbeit in Lovable muss der Commit/Push bzw. die GitHub-Verbindung noch abgeschlossen werden.**

```powershell
git fetch origin; git log origin/main --oneline -5
```