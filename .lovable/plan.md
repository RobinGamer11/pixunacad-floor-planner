# Export-Layout korrigieren (bestehende Teile richtig zusammenfügen)

Ziel-Layout im Export:
```text
CAD-Werkzeugleiste | Export-Seitenleiste | Papierfläche | eine rechte Leiste (Seiteneinstellungen | Werkzeug | Ebenen)
```
CAD-Modus bleibt optisch und funktional unverändert (`Seiten | Werkzeug | Ebenen`, inkl. „Druckpläne“).

## 1. Aufbau
- `CadPage.tsx`: `ExportSidebar` und das eigenständige `ExportPageSettings`-Aside entfallen dort. Stattdessen erhält `CadEditor` die Props `mode="cad" | "export"` und `onOpenSourceSheet`.
- `CadEditor.tsx`: rendert im Export-Modus `ExportSidebar` direkt nach der linken Werkzeugleiste (im selben Flex-Layout). Die rechte Leiste zeigt statt „Seiten“ den Reiter „Seiteneinstellungen“; Inhalt = `ExportPageSettings` als eingebetteter Inhalt (kein eigenes Aside, kein eigener Rahmen). „Werkzeug“/„Ebenen“ bleiben die vorhandenen Panels.
- Automatische Reiterwechsel auf `"sheets"` (Auswahlwerkzeug usw.) zeigen im Export auf „Seiteneinstellungen“.

## 2. „Druckpläne“ im Export ausblenden
- Sektion „Druckpläne“ (Liste, Knöpfe, PDF-Druck) und das schwebende PlanPanel werden bei `mode="export"` nicht gerendert. Im CAD-Modus unverändert.

## 3. Tab „Seiteneinstellungen“
- Oben „CAD-Blätter“: nur `sheetManager.list()`, Antippen = verknüpften Ausschnitt auf aktiver Seite platzieren.
- Darunter, im Stil der früheren Mappen-Seiteneinstellungen: Titel, Format A5/A4/A3/A2/Frei, Hoch/Quer, freie Maße, Seitenrand (mm), Lochung an/aus, Lochungsposition (links/oben/rechts/unten, neues Feld `holePunchSide`, Standard links), Seitenverbund mit vorheriger bzw. nächster Seite.
- „Diese Seite berücksichtigen“ wird nicht als gespeichertes Feld eingeführt (vereinbart: keine `includeInExport`-Option); die Auswahl bleibt der Exportmodus der linken Leiste.
- Ausgewählter Ausschnitt (Maßstab, Einfrieren, „CAD-Blatt bearbeiten“) bleibt darunter erhalten.

## 4. Fangpunkte für Rand und Lochung
- Im Export-Modus liefert die bestehende Fang-Topologie zusätzliche, nicht druckbare Punkte: Papierecken und -kantenmitten, Randlinien-Ecken und -Mitten, Lochungsmittelpunkte (plus Mitte zwischen den Löchern). Linien-Fang auf Rand- und Papierkanten.
- Nur aktiv, wenn eine Exportseite aktiv ist; keine Scene-Objekte, daher nie in PDF oder CAD.

## 5. Ordner-Aufklappzustand lokal
- `collapsed` wird aus Serialisierung, Verlauf und Cloud-Struktur entfernt und pro Gerät lokal gespeichert (localStorage je Projekt). Alte Daten mit `collapsed` werden beim Lesen ignoriert.

## Prüfung
- Typprüfung, Build, bestehende Tests; Unit-Tests für Fangpunkte (Rand/Lochung je Seite) und dafür, dass `collapsed` nicht serialisiert wird.
- Browser-Test nur ohne Anmeldung möglich (bekannte Einschränkung), sonst Sichtprüfung durch dich: CAD unverändert, Export-Reihenfolge links, genau eine rechte Leiste, keine Druckpläne im Export, Randfang funktioniert und fehlt in der PDF.

## Technische Details
- Geändert: `CadPage.tsx`, `CadEditor.tsx`, `ExportPageSettings.tsx` (ohne Aside-Hülle, neue Felder), `ExportSidebar.tsx` (Klappzustand lokal), `PlanManager.ts` (`holePunchSide`, `collapsed` raus aus toJSON), `Renderer.ts` (Lochung je Seite), `TopologyEngine.ts`/Snap-Anbindung (Papier-Fangpunkte über `CadApp`), `sceneDiff.ts` falls `collapsed` dort landet.
- Nicht angefasst: Werkzeuge, Mappe, Cloud-Regeln, Verlauf.
