import { legalConfig } from "@/config/legal";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";

export default function Impressum() {
  const address = legalConfig.address.filter(Boolean);

  return (
    <LegalLayout title="Impressum">
      <LegalSection title="Angaben gemäß § 5 DDG">
        <p>
          <strong>{legalConfig.providerName}</strong>
          {legalConfig.legalForm && <><br />{legalConfig.legalForm}</>}
          {address.map((line) => <span key={line}><br />{line}</span>)}
        </p>
      </LegalSection>

      <LegalSection title="Kontakt">
        <p>
          E-Mail: <a className="underline underline-offset-4" href={`mailto:${legalConfig.email}`}>{legalConfig.email}</a>
          {legalConfig.phone && <><br />Telefon: <a className="underline underline-offset-4" href={`tel:${legalConfig.phone.replace(/\s/g, "")}`}>{legalConfig.phone}</a></>}
        </p>
      </LegalSection>

      {legalConfig.representatives && (
        <LegalSection title="Vertretungsberechtigte Person(en)">
          <p>{legalConfig.representatives}</p>
        </LegalSection>
      )}

      {legalConfig.register && (
        <LegalSection title="Registereintrag">
          <p>{legalConfig.register}</p>
        </LegalSection>
      )}

      {legalConfig.vatId && (
        <LegalSection title="Umsatzsteuer">
          <p>{legalConfig.vatId}</p>
        </LegalSection>
      )}

      {legalConfig.supervisoryAuthority && (
        <LegalSection title="Zuständige Aufsichtsbehörde">
          <p>{legalConfig.supervisoryAuthority}</p>
        </LegalSection>
      )}
    </LegalLayout>
  );
}
