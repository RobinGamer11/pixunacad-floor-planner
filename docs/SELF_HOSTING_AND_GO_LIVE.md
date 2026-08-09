# Eigenes Supabase und Vercel-Deployment

Diese Anwendung verwendet nicht mehr die bisherige Browser-"Anmeldung". Sie
meldet sich mit Supabase Auth an und speichert die Arbeitsmappe pro Konto im
eigenen Supabase-Projekt. Die Vite-Client-App erhält dabei ausschließlich die
Projekt-URL und den **Publishable Key**. Ein `service_role`- oder sonstiger
geheimer Schlüssel darf nie in `.env.local`, Vercel oder Browser-Code stehen.

## Was bereits eingerichtet ist

- Im eigenen Supabase-Projekt wurde die Tabelle `public.user_workspaces`
  angelegt. Sie enthält eine Arbeitsmappe pro `auth.users`-Konto.
- Row Level Security ist aktiv. Ein angemeldetes Konto kann ausschließlich die
  Zeile mit der eigenen `user_id` lesen, anlegen, ändern oder löschen.
- Die App verwendet Supabase Auth für Registrierung, Anmeldung,
  Passwort-Reset und Abmeldung.
- Bestehende lokale Pixuna-Daten werden beim ersten Anmelden eines Kontos als
  dessen Startstand übernommen. Wenn bereits ein Cloud-Stand existiert, hat
  dieser Vorrang und wird vor dem Laden der Stores wiederhergestellt.
- `vercel.json` liefert bei direkten Aufrufen einer SPA-Route wie
  `/project/<id>/cad` korrekt die Vite-App aus.

Der Datenbankstand wurde im Supabase-Projekt angelegt. Für eine dauerhaft
reproduzierbare Infrastruktur sollte die dortige Migration vor dem nächsten
Schemawechsel mit der Supabase CLI in das Repository übernommen werden (z. B.
per `supabase db pull`).

## Lokale Entwicklung

1. Kopiere `.env.example` nach `.env.local`.
2. Trage die beiden Werte aus **Supabase Dashboard → Project Settings → API**
   ein:

   ```dotenv
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
   ```

3. Starte die App mit dem Paketmanager des Projekts, zum Beispiel
   `npm run dev`.

`.env.local` ist ignoriert und darf nicht eingecheckt werden. Werte mit dem
Präfix `VITE_` werden beim Build in den Browser eingebettet; sie sind deshalb
keine Geheimnisse.

## Supabase vor dem Go-live prüfen

1. **Auth → URL Configuration**

   - Setze die spätere produktive Domain als **Site URL**.
   - Hinterlege mindestens diese Redirect-URLs:

     ```text
     http://localhost:8080/password-reset
     https://<produktionsdomain>/password-reset
     ```

   - Wenn Vercel-Preview-Deployments für Passwort-Reset genutzt werden,
     ergänze nach Supabase-Dokumentation außerdem ein passendes Preview-Muster,
     etwa `https://*-<team-oder-account-slug>.vercel.app/**`.

2. **Auth → Providers → Email**

   - E-Mail/Passwort aktivieren.
   - Entscheiden, ob E-Mail-Bestätigung erforderlich ist. Die App unterstützt
     beide Varianten.
   - Für echte Nutzerkonten ein eigenes SMTP einrichten. Der Standardversand
     ist nicht für den Produktivbetrieb gedacht.

3. **Data API / API Settings**

   - Prüfe, dass das Schema `public` über die Data API erreichbar ist und die
     Tabelle `user_workspaces` nicht versehentlich ausgeschlossen wurde.
   - RLS darf nicht deaktiviert werden. Die vorhandenen Policies sind Teil der
     Zugriffssicherheit, nicht nur eine Komfortfunktion.

4. **Betrieb**

   - Backups, Aufbewahrungs- und Löschfristen definieren.
   - DPA/AVV mit Supabase abschließen bzw. wirksam akzeptieren und die
     Subprozessoren sowie tatsächliche Datenregion prüfen.
   - Admin-Zugriffe auf das Supabase-Projekt auf die notwendigen Personen
     beschränken und MFA aktivieren.

## Vercel bereitstellen

1. Die Änderungen in den GitHub-Repository-Branch übernehmen.
2. In Vercel **Add New → Project** wählen und das GitHub-Repository
   importieren.
3. Framework: Vite; Root Directory: Repository-Wurzel. Das Build-Ergebnis ist
   `dist`.
4. Unter **Settings → Environment Variables** in **Production**, **Preview**
   und bei Bedarf **Development** setzen:

   | Name | Wert |
   | --- | --- |
   | `VITE_SUPABASE_URL` | URL des eigenen Supabase-Projekts |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable Key des eigenen Projekts |

5. Deploy auslösen. Danach eigene Domain hinzufügen und erst dann die
   Supabase Site URL und Redirect-URLs auf die endgültige Domain setzen.

Im Repository existieren mehrere Lockfiles. `vercel.json` legt deshalb den
Install-Befehl auf `npm ci` fest, damit Vercel reproduzierbar den vorhandenen
`package-lock.json` verwendet. Vor späteren Abhängigkeitsupdates sollte auf
einen einzigen Paketmanager konsolidiert werden.

## Datenmodell: aktueller Übergangsstand

Die bestehende Anwendung speichert Projekte, Notizen, Finanzen und CAD-Daten
seit jeher synchron im Browser-Local-Storage. Um die vorhandenen umfangreichen
Stores nicht auf einmal zu brechen, wird dieser Arbeitsstand zunächst als
JSONB-Arbeitsmappe pro Nutzerkonto synchronisiert.

Das ist sinnvoll für die Konto-Entkopplung und geräteübergreifende Nutzung,
aber noch keine Kollaborationsarchitektur:

- Letzter erfolgreicher Schreibstand gewinnt; gleichzeitiges Bearbeiten auf
  mehreren Geräten wird nicht zusammengeführt.
- Große Base64-Dateien, PDFs, Bilder und Vorschaubilder können JSONB-Requests
  unnötig groß machen.
- Für Teams und große Dateien sollten Dateien nach Supabase Storage wandern
  und Projekte, Sheets, Notizen und Finanzpositionen in eigene Tabellen mit
  `owner_id` bzw. Mitgliedschaften überführt werden.

Vor einem offenen Produktivbetrieb mit vielen oder großen Projekten ist diese
nächste Ausbaustufe empfohlen.

## Rechtlicher Go-live

Die Routen `/impressum` und `/datenschutz` sind global verlinkt. Die Texte
sind ein technischer Entwurf und müssen vor Veröffentlichung mit den
tatsächlichen Unternehmens- und Betriebsdaten ergänzt und fachlich geprüft
werden. Insbesondere sind in `src/config/legal.ts` einzutragen bzw. zu
entscheiden:

- vollständiger Name/Firma, ladungsfähige Anschrift und Kontakt;
- Rechtsform, Vertretung, Register und USt-IdNr./W-IdNr., soweit zutreffend;
- zuständige Datenschutzaufsicht, Datenschutzbeauftragte:r (falls bestellt)
  und Erklärung zur Verbraucherschlichtung;
- tatsächliche Vercel- und Supabase-Konfiguration, Auftragsverarbeitung,
  Unterauftragsverarbeiter, Speicherfristen und Drittlandtransfers;
- ob die App nur B2B oder auch für Verbraucher, kostenlos oder zahlungspflichtig
  angeboten wird;
- ob öffentliche Nutzerinhalte, Blog/News, Analyse, Marketing, Fehlertracking,
  Zahlungs- oder E-Mail-Dienste hinzukommen.

Karten-, Orts- und Wetterdienste sind in der App standardmäßig deaktiviert und
werden erst nach einer Einwilligung geladen. Bei weiteren nicht notwendigen
Cookies, Analytics oder Marketing ist zusätzlich ein rechtskonformer
Einwilligungsmechanismus erforderlich.

Dies ist keine Rechtsberatung. Für einen öffentlichen Deutschland-/EU-Launch
sollte ein Rechtsanwalt oder Datenschutzprofi den finalen Text und das
tatsächliche Setup prüfen.
