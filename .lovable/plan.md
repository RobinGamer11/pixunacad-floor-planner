# Plan: Supabase-Konfiguration dauerhaft einrichten

## Problem
`.env.local` mit `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` existiert nicht mehr — die Sandbox-Datei überlebt keinen Lovable-Sitzungsneustart. Die Vorschau zeigt wieder „Supabase-Konfiguration fehlt".

## Lösung
Beide Werte sind **öffentliche Publishable Keys** (laut `.env.example`: „Öffentliche Browser-Konfiguration — niemals service_role"). Sie werden als **Lovable-Projekt-Environment-Variablen** gespeichert — sitzungsübergreifend persistent, außerhalb des flüchtigen Dateisystems, ohne Änderung am Code.

## Schritte

1. **Werte als Projekt-Secrets speichern** via `secrets--set_secret`:
   - `VITE_SUPABASE_URL` = `https://xmuyyhhcmbueymyhgfkc.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_AtWUG-A42zXzMQk-HBx5nQ_1WxkV5GJ`
   - Diese werden als `process.env`-Variablen im Projekt gesetzt. Vite exponiert alle `VITE_*`-Präfix-Variablen automatisch an `import.meta.env` — die App liest sie bereits in `src/lib/supabase.ts` (Zeile 38–39).

2. **Dev-Server neu starten**, damit der Prozess die neuen Environment-Variablen lädt (kill + Port-Check).

3. **Verifizieren**: Playwright öffnet `http://localhost:8080/` → Weiterleitung nach `/login` → keine „Supabase-Konfiguration fehlt"-Meldung.

## Fallback (nur falls Schritt 1 die Vorschau nicht erreicht)
Falls die Projekt-Secrets nicht in den Vite-Dev-Server-Prozess injiziert werden: eine committed `.env`-Datei (nicht `.env.local`) im Repo anlegen — da die Werte öffentliche Publishable Keys sind, ist das sicher. `.gitignore` müsste dafür `.env` nicht mehr ignorieren. In jedem Fall **keine** `service_role`/Secret Keys.

## Was NICHT geändert wird
- Kein Code, keine bestehende Funktionalität, keine `.gitignore`-Anpassung (nur im Fallback).
- Nur die beiden öffentlichen Vite-Werte; keine geheimen Schlüssel.
