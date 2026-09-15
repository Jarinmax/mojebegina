// Mock data pro obrazovku "Partnerský program".
// Konkrétní pravidla, slevy a odměny zatím NEJSOU definovaná — čekáme na
// existující partnerský program od Lucky. Vše, co se týká výše odměn,
// je proto jen placeholder ("—" / textová poznámka), ne vymyšlené číslo.

export const referralProfile = {
  code: "JANA-BEGINA",
  link: "begina.cz/r/JANA-BEGINA",
};

export type ReferralStatus = "invited" | "purchased";

export type ReferredCustomer = {
  id: string;
  name: string;
  initials: string;
  invitedAt: string;
  status: ReferralStatus;
};

export const referredCustomers: ReferredCustomer[] = [
  { id: "1", name: "Petr Novák", initials: "PN", invitedAt: "12. 8. 2026", status: "purchased" },
  { id: "2", name: "Tereza Dvořáková", initials: "TD", invitedAt: "20. 8. 2026", status: "purchased" },
  { id: "3", name: "Karel Beneš", initials: "KB", invitedAt: "2. 9. 2026", status: "invited" },
];

export const referralStats = {
  invitedCount: referredCustomers.length,
  purchasedCount: referredCustomers.filter((c) => c.status === "purchased").length,
};

export type ReferralHistoryEntry = {
  id: string;
  date: string;
  description: string;
};

export const referralHistory: ReferralHistoryEntry[] = [
  { id: "h1", date: "2. 9. 2026", description: "Pozvala jsi Karla Beneše" },
  { id: "h2", date: "20. 8. 2026", description: "Tereza Dvořáková nakoupila – odměna bude doplněna" },
  { id: "h3", date: "20. 8. 2026", description: "Pozvala jsi Terezu Dvořákovou" },
  { id: "h4", date: "15. 8. 2026", description: "Petr Novák nakoupil – odměna bude doplněna" },
  { id: "h5", date: "12. 8. 2026", description: "Pozvala jsi Petra Nováka" },
];
