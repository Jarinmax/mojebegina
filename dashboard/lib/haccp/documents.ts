// Úložiště HACCP (13. 11. 2026) — platná příručka HACCP a související dokumenty
// pro provozovnu Zahradní Bistro Begina, Vitice 119.
// Soubory leží v public/haccp/. Novou verzi přidej nahoru a starší označ current: false.
export type HaccpDocument = {
  file: string;
  title: string;
  version: string;
  issued: string;
  note?: string;
  current: boolean;
};

export const HACCP_DOCUMENTS: HaccpDocument[] = [
  {
    file: "HACCP_Zahradni_Bistro_Begina_v1.1.pdf",
    title: "Příručka HACCP – Zahradní Bistro Begina",
    version: "1.1",
    issued: "listopad 2026",
    note: "Po auditu paní Dlouhé: 2 CCP (skladování, pasterace polévek), pitná voda přes reverzní osmózu, úsek MASO, přílohy 1–6.",
    current: true,
  },
];
