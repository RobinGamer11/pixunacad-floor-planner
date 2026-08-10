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
  privacyAuthority?: {
    name: string;
    address: string[];
    email: string;
  };
};

/**
 * Öffentliche Anbieterangaben. Vor einem Produktions-Release vollständig
 * ersetzen; die Platzhalter sind absichtlich gut sichtbar.
 */
export const legalConfig: LegalConfig = {
  providerName: "Philipp Minnich",
  // Nur ausfüllen, wenn auf dich bzw. dein Unternehmen zutreffend.
  legalForm: undefined,
  address: ["Liebfrauenweg 1", "53125 Bonn", "Deutschland"],
  email: "p.minnich@msoftware-ag.de",
  phone: undefined,
  representatives: undefined,
  register: undefined,
  vatId: undefined,
  supervisoryAuthority: undefined,
  dataProtectionOfficer: undefined,
  consumerDisputeStatement: "[Erklärung zur Teilnahme an Verbraucherschlichtung gemäß § 36 VSBG ergänzen]",
  privacyAuthority: {
    name: "Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen (LDI NRW)",
    address: ["Kavalleriestraße 2–4", "40213 Düsseldorf", "Deutschland"],
    email: "poststelle@ldi.nrw.de",
  },
};

export const legalConfigIsComplete = ![
  legalConfig.providerName,
  ...legalConfig.address,
  legalConfig.email,
  legalConfig.consumerDisputeStatement,
  ...(legalConfig.privacyAuthority
    ? [legalConfig.privacyAuthority.name, ...legalConfig.privacyAuthority.address, legalConfig.privacyAuthority.email]
    : ["[Zuständige Datenschutzaufsichtsbehörde am Sitz des Verantwortlichen ergänzen]"]),
].some((value) => value.includes("["));
