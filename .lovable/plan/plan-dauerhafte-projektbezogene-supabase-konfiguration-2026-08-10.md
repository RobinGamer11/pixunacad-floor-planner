# Plan: Dauerhafte projektbezogene Supabase-Konfiguration

## Problem
`.env.local` überlebt keinen Lovable-Sitzungsneustart — die Werte verschwinden, die Vorschau zeigt „Supabase-Konfiguration fehlt". Workspace-Build-Secrets scheiden aus, weil künftige Projekte im selben Workspace andere Supabase-Projekte verwenden. Die Runtime-Secret-Verwaltung (`set_secret`) lehnt das `VITE_`-Präfix ab.

## Lösung
Eine **committede `.env`-Datei im Projektroot** mit ausschließlich den beiden öffentlichen Publishable-Werten. Vite liest `.env` automatisch beim Dev-Server- und Build-Start ein und exponiert alle `VITE_*`-Variablen an `import.meta.env`. Da die Datei im Git-Repository liegt, überlebt sie jeden Neustart und jede neue Sitzung — projektabgeschlossen, ohne Workspace-Abhängigkeit.

## Warum das sicher ist
Beide Werte sind ausdrücklich **öffentlich** (Publishable/`anon` Key, keine Geheimnisse). Supabase selbst dokumentiert, dass der Publishable Key für die Verwendung im Browser bestimmt ist; die Sicherheit wird über Row Level Security in der Datenbank durchgesetzt, nicht über Geheimhaltung des Keys. `service_role` oder andere geheime Schlüssel werden **nicht** verwendet und landen auch nicht in der Datei.

## Schritte

1. **`.gitignore` anpassen** — die aktuelle Datei (Zeile 15–18) ignoriert `.env` und `.env.*` pauschal. Ersetzen durch:
   ```gitignore
   # Nur .env.local und modusspezifische lokale Dateien ignorieren (können Secrets enthalten).
   .env.local
   .env.*.local
   ```
   Damit wird die neue `.env` committbar, während `.env.local` und alle `*.local`-Dateien weiterhin geschützt bleiben. `.env.example` bleibt unangetastet.

2. **`.env` erstellen** (neu, im Projektroot) mit ausschließlich:
   ```dotenv
   VITE_SUPABASE_URL=https://xmuyyhhcmbueymyhgfkc.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_AtWUG-A42zXzMQk-HBx5nQ_1WxkV5GJ
   ```
   Kein `service_role`, kein Secret Key, keine weiteren Werte.

3. **Dev-Server neu starten** (kill + Port-Check), damit der Prozess `.env` neu einliest.

4. **Verifizieren**: Playwright öffnet `http://localhost:8080/` → Weiterleitung nach `/login` → Login-Seite sichtbar, keine „Supabase-Konfiguration fehlt"-Meldung.

## Was NICHT geändert wird
- Kein Code (`src/lib/supabase.ts` liest die Werte bereits über `import.meta.env`, keine Anpassung nötig).
- Keine bestehende Funktionalität.
- Keine Workspace-Einstellung, kein projektexterner Secret-Safe.
- `.env.example` und `.env.local` (falls noch vorhanden) bleiben unangetastet.
- Keine geheimen Schlüssel jeglicher Art.
