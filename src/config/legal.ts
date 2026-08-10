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
  privacyAuthority?: {
    name: string;
    address: string[];
    email: string;
  };
};

/** Zentrale öffentliche Anbieter- und Datenschutzangaben. */
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
  privacyAuthority: {
    name: "Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen (LDI NRW)",
    address: ["Kavalleriestraße 2–4", "40213 Düsseldorf", "Deutschland"],
    email: "poststelle@ldi.nrw.de",
  },
};
