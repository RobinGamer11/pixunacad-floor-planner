export type LegalConfig = {
  providerName: string;
  legalForm?: string;
  address: string[];
  email: string;
  phone?: string;
  representatives?: string;
  register?: string;
  vatId?: string;
  supervisoryAuthority?: string;
  dataProtectionOfficer?: string;
  consumerDisputeStatement: string;
  privacyAuthority?: string;
};

/**
 * Öffentliche Anbieterangaben. Vor einem Produktions-Release vollständig
 * ersetzen; die Platzhalter sind absichtlich gut sichtbar.
 */
export const legalConfig: LegalConfig = {
  providerName: "[Vollständiger Name bzw. Firma ergänzen]",
  // Nur ausfüllen, wenn auf dich bzw. dein Unternehmen zutreffend.
  legalForm: undefined,
  address: ["[Straße und Hausnummer]", "[PLZ und Ort]", "Deutschland"],
  email: "[E-Mail-Adresse ergänzen]",
  phone: undefined,
  representatives: undefined,
  register: undefined,
  vatId: undefined,
  supervisoryAuthority: undefined,
  dataProtectionOfficer: undefined,
  consumerDisputeStatement: "[Erklärung zur Teilnahme an Verbraucherschlichtung gemäß § 36 VSBG ergänzen]",
  privacyAuthority: "[Zuständige Datenschutzaufsichtsbehörde am Sitz des Verantwortlichen ergänzen]",
};

export const legalConfigIsComplete = ![
  legalConfig.providerName,
  ...legalConfig.address,
  legalConfig.email,
  legalConfig.consumerDisputeStatement,
  legalConfig.privacyAuthority,
].some((value) => value.includes("["));
