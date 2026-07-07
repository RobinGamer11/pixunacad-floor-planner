## Problem

In der CAD-Oberfläche ist der Einklappen-Button (`PanelRightClose`) im rechten Panel unsichtbar, obwohl er im Code existiert (`src/components/CadEditor.tsx` Z. 1537–1545).

Ursache: Die drei Tab-Labels „Werkzeugeinstellung / Zeichenblätter / Ebenen" liegen in einem `flex` mit `flex-1` (Default `min-width: auto`) und schrumpfen nicht unter ihre Textbreite. Zusammen sind sie breiter als das 280 px breite Panel → der `w-8 shrink-0` Close-Button wird nach rechts aus dem sichtbaren Bereich geschoben.

Die Projektmappe hat dasselbe Muster funktionierend, weil sie ein `grid-cols-[1fr_1fr_1fr_auto]` bei 340 px Panelbreite nutzt (Z. 1663 in `src/pages/ProjectWorkspace.tsx`).

## Fix (nur CAD-Panel-Header, keine Verhaltensänderung)

Datei: `src/components/CadEditor.tsx`, Z. 1519–1546.

- Container von `flex … items-stretch` auf `grid grid-cols-[1fr_1fr_1fr_auto] items-stretch` umstellen — analog zur Projektmappe.
- Bei den drei Tab-Buttons `flex-1` entfernen und `min-w-0` + `truncate` ergänzen, damit lange Labels innerhalb ihrer Grid-Zelle abgeschnitten werden statt zu überlaufen.
- Close-Button bleibt `w-8` (`auto`-Spalte), Styling und Icon (`PanelRightClose size={14} className="text-muted-foreground"`) unverändert — damit ist er zwangsläufig sichtbar.
- Tooltip auf „Einklappen" vereinheitlichen (wie Projektmappe).

Alle übrigen CAD-Verhaltensweisen (Tabs-Umschaltung, `rightOpen`-State, Druckmodus-Aside, eingeklappter `PanelRightOpen`-Griff) bleiben identisch.

## Verifikation

Playwright-Screenshot der CAD-Oberfläche nach dem Edit → sichtbarer Einklappen-Button rechts neben „Ebenen", so wie in der Projektmappe (siehe user-uploads Bild).
