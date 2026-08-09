import { Link } from "react-router-dom";
import { legalConfig } from "@/config/legal";
import { setExternalContentConsent, useExternalContentConsent } from "@/lib/externalContent";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";

export default function Datenschutz() {
  const externalContentEnabled = useExternalContentConsent();

  return (
    <LegalLayout title="Datenschutzhinweise">
      <p>Stand: 9. August 2026</p>

      <LegalSection title="1. Verantwortliche Stelle">
        <p>
          <strong>{legalConfig.providerName}</strong><br />
          {legalConfig.address.map((line) => <span key={line}>{line}<br /></span>)}
          E-Mail: <a className="underline underline-offset-4" href={`mailto:${legalConfig.email}`}>{legalConfig.email}</a>
        </p>
        {legalConfig.dataProtectionOfficer && <p>Datenschutzbeauftragte:r: {legalConfig.dataProtectionOfficer}</p>}
      </LegalSection>

      <LegalSection title="2. Bereitstellung der Web-App und Hosting">
        <p>Beim Aufruf der App verarbeitet der Hosting-Anbieter Vercel technisch erforderliche Verbindungsdaten, insbesondere IP-Adresse, Datum und Uhrzeit, angeforderte Ressource, User-Agent sowie Sicherheits- und Fehlerprotokolle. Die Verarbeitung erfolgt zur sicheren und zuverlässigen Bereitstellung der App (Art. 6 Abs. 1 lit. f DSGVO) und, soweit ein Nutzungsvertrag besteht, zur Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).</p>
        <p>Vercel wird als Auftragsverarbeiter eingesetzt. Vor dem Produktionsstart sind der aktuelle Auftragsverarbeitungsvertrag, die tatsächlich gewählte Region, Unterauftragsverarbeiter und etwaige Drittlandtransfers zu prüfen und hier konkret zu ergänzen.</p>
      </LegalSection>

      <LegalSection title="3. Konto, Anmeldung und Cloud-Arbeitsmappe">
        <p>Für Registrierung, Anmeldung und die Speicherung der Arbeitsmappe verarbeitet die App E-Mail-Adresse, Authentifizierungsdaten, Sitzungsdaten sowie die von dir in Projekten, CAD-Zeichnungen, Notizen, Finanzen und Dateien gespeicherten Inhalte. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.</p>
        <p>Diese Daten werden über Supabase verarbeitet. Das Supabase-Projekt ist in der Region EU Central (Frankfurt) eingerichtet. Supabase wird als Auftragsverarbeiter eingesetzt; vor dem Go-live sind DPA/AVV, Speicherfristen, Backups, Subprozessoren und etwaige Drittlandtransfers anhand der tatsächlich gebuchten Konfiguration zu prüfen und zu dokumentieren.</p>
        <p>Die Daten bleiben gespeichert, solange das Nutzerkonto oder die jeweilige Arbeitsmappe besteht, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen. Ein Lösch- und Backup-Konzept ist vor dem Produktivbetrieb festzulegen.</p>
      </LegalSection>

      <LegalSection title="4. Lokal erforderliche Speicherungen">
        <p>Die App nutzt Local Storage und Session Storage für die Anmeldesitzung, die lokale Arbeitskopie, Funktions- und Darstellungseinstellungen sowie die Synchronisierung. Diese Speicherungen sind für die Bereitstellung der angeforderten Funktionen erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG; Art. 6 Abs. 1 lit. b bzw. lit. f DSGVO). Es werden derzeit keine Werbe- oder Analyse-Cookies eingesetzt.</p>
      </LegalSection>

      <LegalSection title="5. Optionale Karten-, Orts- und Wetterdienste">
        <p>Nach deiner freiwilligen Aktivierung können Ortsanfragen an Open-Meteo (Geocoding/Wetter) sowie Karteninhalte und Geocoding an OpenStreetMap/Nominatim übermittelt werden. Dabei können insbesondere IP-Adresse und die von dir eingegebene Orts- oder Adressangabe verarbeitet werden. Die Aktivierung erfolgt auf Grundlage deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO; § 25 Abs. 1 TDDDG, soweit einschlägig).</p>
        <p>Aktueller Status: <strong>{externalContentEnabled ? "aktiviert" : "nicht aktiviert"}</strong>.</p>
        <button
          type="button"
          onClick={() => setExternalContentConsent(!externalContentEnabled)}
          className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          {externalContentEnabled ? "Optionale Karten- und Wetterdienste deaktivieren" : "Optionale Karten- und Wetterdienste aktivieren"}
        </button>
        <p className="text-sm text-muted-foreground">Die Einwilligung kann hier jederzeit mit Wirkung für die Zukunft widerrufen werden.</p>
      </LegalSection>

      <LegalSection title="6. Empfänger und Drittlandtransfers">
        <p>Empfänger sind nur Dienstleister, die für Betrieb und Bereitstellung erforderlich sind, insbesondere Vercel, Supabase sowie – nach Aktivierung – Open-Meteo und OpenStreetMap/Nominatim. Soweit Daten außerhalb des EWR verarbeitet oder von dort aus zugänglich werden, erfolgt dies nur unter den Voraussetzungen der Art. 44 ff. DSGVO. Die konkreten Transfermechanismen sind vor dem Go-live anhand der aktuellen Verträge der eingesetzten Anbieter zu ergänzen.</p>
      </LegalSection>

      <LegalSection title="7. Deine Rechte">
        <p>Du hast – soweit die gesetzlichen Voraussetzungen vorliegen – das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit sowie Widerspruch gegen Verarbeitungen auf Grundlage von Art. 6 Abs. 1 lit. e oder f DSGVO. Erteilte Einwilligungen kannst du jederzeit mit Wirkung für die Zukunft widerrufen.</p>
        <p>Außerdem hast du das Recht, dich bei einer Datenschutzaufsichtsbehörde zu beschweren. Zuständige Aufsicht: {legalConfig.privacyAuthority}</p>
      </LegalSection>

      <LegalSection title="8. Keine automatisierten Einzelfallentscheidungen">
        <p>Die App verwendet keine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne von Art. 22 DSGVO.</p>
      </LegalSection>

      <p className="border-t pt-6 text-sm text-muted-foreground">Ergänzende Anbieterangaben findest du im <Link className="underline underline-offset-4" to="/impressum">Impressum</Link>.</p>
    </LegalLayout>
  );
}
