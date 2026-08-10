import { Link } from "react-router-dom";
import { legalConfig } from "@/config/legal";
import { setExternalContentConsent, useExternalContentConsent } from "@/lib/externalContent";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";

function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-6">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

export default function Datenschutz() {
  const externalContentEnabled = useExternalContentConsent();

  return (
    <LegalLayout title="Datenschutzhinweise">
      <p>Stand: 10. August 2026</p>

      <LegalSection title="1. Verantwortlicher">
        <p>Verantwortlicher für die Verarbeitung personenbezogener Daten im Rahmen von PixunaCAD ist:</p>
        <p>
          <strong>{legalConfig.providerName}</strong><br />
          {legalConfig.address.map((line) => <span key={line}>{line}<br /></span>)}
          E-Mail: <a className="underline underline-offset-4" href={`mailto:${legalConfig.email}`}>{legalConfig.email}</a>
        </p>
        {legalConfig.dataProtectionOfficer && <p>Datenschutzbeauftragte:r: {legalConfig.dataProtectionOfficer}</p>}
      </LegalSection>

      <LegalSection title="2. Bereitstellung der Web-App und Hosting">
        <p>Beim Aufruf und bei der Nutzung von PixunaCAD werden technisch erforderliche Verbindungs- und Protokolldaten verarbeitet.</p>
        <p>Hierzu können insbesondere gehören:</p>
        <LegalList items={[
          "IP-Adresse",
          "Datum und Uhrzeit des Zugriffs",
          "aufgerufene Seiten und Ressourcen",
          "Browser- und Geräteinformationen (User-Agent)",
          "technische Fehler- und Sicherheitsprotokolle",
        ]} />
        <p>Die Verarbeitung dieser Daten ist erforderlich, um PixunaCAD technisch bereitzustellen, die Stabilität und Sicherheit der Anwendung zu gewährleisten und technische Fehler erkennen und beheben zu können.</p>
        <p>Soweit die Verarbeitung zur Bereitstellung und sicheren Nutzung von PixunaCAD erforderlich ist, erfolgt sie auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO. Soweit die Verarbeitung zur Durchführung des mit dem Nutzer bestehenden Nutzungsverhältnisses erforderlich ist, erfolgt sie auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO.</p>
        <p>Für Hosting und Bereitstellung der Web-App wird Vercel eingesetzt. Dabei können personenbezogene Daten durch Vercel im Rahmen der technischen Bereitstellung verarbeitet werden.</p>
      </LegalSection>

      <LegalSection title="3. Nutzerkonto, Anmeldung und Projektdaten">
        <p>Für die Registrierung, Anmeldung und Nutzung von PixunaCAD werden personenbezogene Daten verarbeitet.</p>
        <p>Hierzu gehören insbesondere:</p>
        <LegalList items={[
          "E-Mail-Adresse",
          "Authentifizierungsdaten",
          "Sitzungsdaten",
          "Kontoinformationen",
          "vom Nutzer angelegte Projekte und Projektinformationen",
          "CAD-Zeichnungen und Planungsdaten",
          "Notizen",
          "Finanz- und Kosteninformationen, soweit diese vom Nutzer eingegeben werden",
          "hochgeladene Dateien und Bilder",
          "sonstige vom Nutzer innerhalb von PixunaCAD gespeicherte Inhalte",
        ]} />
        <p>Die Verarbeitung erfolgt, um das Nutzerkonto sowie die vom Nutzer gewünschten Funktionen von PixunaCAD bereitzustellen.</p>
        <p>Rechtsgrundlage hierfür ist Art. 6 Abs. 1 lit. b DSGVO.</p>
        <p>Für Authentifizierung, Datenbank und Speicherung wird Supabase eingesetzt. Das für PixunaCAD verwendete Supabase-Projekt wird nach derzeitiger Konfiguration in der Region EU Central (Frankfurt) betrieben.</p>
      </LegalSection>

      <LegalSection title="4. Speicherdauer und Löschung">
        <p>Personenbezogene Daten und Projektinhalte werden grundsätzlich gespeichert, solange das jeweilige Nutzerkonto oder das betreffende Projekt besteht und die Speicherung für die Bereitstellung von PixunaCAD erforderlich ist.</p>
        <p>Löscht ein Nutzer ein Projekt oder sein Nutzerkonto, werden die betreffenden Daten gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten, berechtigten Gründe für eine weitere Speicherung oder technisch notwendige Sicherungs- und Backup-Zeiträume entgegenstehen.</p>
        <p>Daten in technischen Sicherungskopien können für einen begrenzten Zeitraum weiterhin vorhanden sein und werden im Rahmen der regulären Backup-Zyklen überschrieben oder gelöscht.</p>
      </LegalSection>

      <LegalSection title="5. Lokale Speicherung auf dem Endgerät">
        <p>PixunaCAD verwendet Local Storage und Session Storage des Browsers, soweit dies für die technische Bereitstellung und Nutzung der Anwendung erforderlich ist.</p>
        <p>Diese lokalen Speicherungen können insbesondere verwendet werden für:</p>
        <LegalList items={[
          "die Anmeldesitzung",
          "lokale Arbeitsstände",
          "Synchronisierungsinformationen",
          "Funktions- und Darstellungseinstellungen",
          "technisch erforderliche Zustandsinformationen",
        ]} />
        <p>Soweit die Speicherung oder der Zugriff unbedingt erforderlich ist, um einen vom Nutzer ausdrücklich gewünschten digitalen Dienst bereitzustellen, erfolgt dies gemäß § 25 Abs. 2 Nr. 2 TDDDG.</p>
        <p>PixunaCAD verwendet derzeit keine Werbe- oder Analyse-Cookies.</p>
      </LegalSection>

      <LegalSection title="6. Optionale Karten-, Orts- und Wetterdienste">
        <p>PixunaCAD kann optionale Funktionen für Karten-, Orts- und Wetterinformationen bereitstellen.</p>
        <p>Diese Funktionen werden nur verwendet, wenn der Nutzer sie freiwillig aktiviert oder ausdrücklich aufruft.</p>
        <p>Hierbei können Anfragen an Open-Meteo für Geocoding und Wetterinformationen sowie an OpenStreetMap/Nominatim für Karten- und Geocoding-Funktionen übermittelt werden.</p>
        <p>Dabei können insbesondere folgende Daten verarbeitet bzw. an den jeweiligen Dienst übermittelt werden:</p>
        <LegalList items={[
          "IP-Adresse",
          "eingegebene Orts- oder Adressinformationen",
          "für die jeweilige Anfrage erforderliche Standortinformationen",
        ]} />
        <p>Soweit für eine solche Verarbeitung eine Einwilligung erforderlich ist, erfolgt sie auf Grundlage von Art. 6 Abs. 1 lit. a DSGVO sowie § 25 Abs. 1 TDDDG, soweit dieser anwendbar ist.</p>
        <p>Aktueller Status: <strong>{externalContentEnabled ? "aktiviert" : "nicht aktiviert"}</strong>.</p>
        <button
          type="button"
          onClick={() => setExternalContentConsent(!externalContentEnabled)}
          className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          {externalContentEnabled ? "Optionale Karten- und Wetterdienste deaktivieren" : "Optionale Karten- und Wetterdienste aktivieren"}
        </button>
        <p className="text-sm text-muted-foreground">Eine erteilte Einwilligung kann hier jederzeit mit Wirkung für die Zukunft widerrufen werden.</p>
      </LegalSection>

      <LegalSection title="7. Empfänger personenbezogener Daten">
        <p>Personenbezogene Daten werden nur an externe Dienstleister übermittelt, soweit dies für den Betrieb und die Bereitstellung von PixunaCAD erforderlich ist, eine entsprechende Einwilligung vorliegt oder eine andere gesetzliche Grundlage die Übermittlung erlaubt.</p>
        <p>Zu den für PixunaCAD eingesetzten Diensten können insbesondere gehören:</p>
        <LegalList items={[
          "Vercel für Hosting und Bereitstellung der Web-App",
          "Supabase für Authentifizierung, Datenbank und Speicherung",
          "Open-Meteo für optionale Orts- und Wetterfunktionen",
          "OpenStreetMap/Nominatim für optionale Karten- und Geocoding-Funktionen",
        ]} />
        <p>Soweit Dienstleister personenbezogene Daten im Auftrag verarbeiten, werden sie im Rahmen der datenschutzrechtlichen Anforderungen eingesetzt.</p>
      </LegalSection>

      <LegalSection title="8. Übermittlung in Drittländer">
        <p>Bei der Nutzung externer Dienstleister kann nicht ausgeschlossen werden, dass personenbezogene Daten außerhalb der Europäischen Union bzw. des Europäischen Wirtschaftsraums verarbeitet werden oder dass ein Zugriff aus einem Drittland erfolgt.</p>
        <p>Soweit eine solche Übermittlung stattfindet, erfolgt sie nur unter Beachtung der Voraussetzungen der Art. 44 ff. DSGVO und auf Grundlage eines hierfür vorgesehenen Übermittlungsmechanismus, soweit ein solcher erforderlich ist.</p>
      </LegalSection>

      <LegalSection title="9. Datensicherheit und Eigenverantwortung für Projektinhalte">
        <p>PixunaCAD setzt angemessene technische und organisatorische Maßnahmen ein, um personenbezogene Daten vor Verlust, unbefugtem Zugriff, Veränderung und Offenlegung zu schützen.</p>
        <p>Trotz angemessener Sicherheitsmaßnahmen kann bei internetbasierten Diensten keine absolute Sicherheit oder dauerhafte Verfügbarkeit von Daten garantiert werden.</p>
        <p>Nutzer sollten daher von wichtigen Projekt-, Planungs- und Arbeitsdaten, soweit technisch möglich, eigene Sicherungskopien anfertigen.</p>
        <p>PixunaCAD ist nicht als alleinige Archivierungs- oder Datensicherungslösung bestimmt.</p>
        <p>Die gesetzlichen datenschutzrechtlichen Pflichten sowie zwingende gesetzliche Haftungsregelungen bleiben hiervon unberührt.</p>
      </LegalSection>

      <LegalSection title="10. Keine Weitergabe oder Nutzung zu Werbezwecken">
        <p>Personenbezogene Projekt- und Nutzerdaten werden nicht an Dritte verkauft.</p>
        <p>Die vom Nutzer in PixunaCAD gespeicherten Projektinhalte werden nicht für personalisierte Werbung verwendet.</p>
        <p>Derzeit werden keine Werbe- oder Analyse-Tracking-Dienste eingesetzt.</p>
      </LegalSection>

      <LegalSection title="11. Rechte der betroffenen Personen">
        <p>Betroffene Personen haben nach Maßgabe der gesetzlichen Voraussetzungen insbesondere folgende Rechte:</p>
        <LegalList items={[
          "Recht auf Auskunft über die verarbeiteten personenbezogenen Daten (Art. 15 DSGVO)",
          "Recht auf Berichtigung unrichtiger Daten (Art. 16 DSGVO)",
          "Recht auf Löschung personenbezogener Daten (Art. 17 DSGVO)",
          "Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)",
          "Recht auf Datenübertragbarkeit (Art. 20 DSGVO)",
          "Recht auf Widerspruch gegen bestimmte Verarbeitungen (Art. 21 DSGVO)",
        ]} />
        <p>Soweit eine Verarbeitung auf einer Einwilligung beruht, kann die Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen werden.</p>
        <p>Die Rechtmäßigkeit der bis zum Widerruf erfolgten Verarbeitung wird durch den Widerruf nicht berührt.</p>
        <p>
          Zur Ausübung der Rechte genügt eine Nachricht an:<br />
          <a className="underline underline-offset-4" href={`mailto:${legalConfig.email}`}>{legalConfig.email}</a>
        </p>
      </LegalSection>

      <LegalSection title="12. Beschwerderecht bei einer Datenschutzaufsichtsbehörde">
        <p>Betroffene Personen haben gemäß Art. 77 DSGVO das Recht, sich bei einer Datenschutzaufsichtsbehörde zu beschweren.</p>
        <p>Für den Verantwortlichen in Nordrhein-Westfalen ist insbesondere folgende Aufsichtsbehörde zuständig:</p>
        {legalConfig.privacyAuthority && (
          <p>
            <strong>{legalConfig.privacyAuthority.name}</strong><br />
            {legalConfig.privacyAuthority.address.map((line) => <span key={line}>{line}<br /></span>)}
            E-Mail: <a className="underline underline-offset-4" href={`mailto:${legalConfig.privacyAuthority.email}`}>{legalConfig.privacyAuthority.email}</a>
          </p>
        )}
      </LegalSection>

      <LegalSection title="13. Keine automatisierte Entscheidungsfindung">
        <p>PixunaCAD verwendet derzeit keine ausschließlich auf einer automatisierten Verarbeitung beruhende Entscheidungsfindung einschließlich Profiling im Sinne von Art. 22 DSGVO.</p>
      </LegalSection>

      <LegalSection title="14. Änderungen dieser Datenschutzhinweise">
        <p>Diese Datenschutzhinweise können angepasst werden, wenn sich Funktionen von PixunaCAD, eingesetzte Dienstleister oder gesetzliche Anforderungen ändern.</p>
        <p>Es gilt die jeweils auf dieser Website veröffentlichte aktuelle Fassung.</p>
      </LegalSection>

      <p className="border-t pt-6 text-sm text-muted-foreground">Ergänzende Anbieterangaben findest du im <Link className="underline underline-offset-4" to="/impressum">Impressum</Link>.</p>
    </LegalLayout>
  );
}
