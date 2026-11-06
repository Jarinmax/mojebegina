// DOČASNÉ (smaže se před sloučením): PDF pro vizuální kontrolu z CI.
import { mkdirSync, writeFileSync } from "node:fs";
import { CURRENT_TERMS } from "@/lib/eshop/content/termsVersions";
import { termsPdf, withdrawalFormPdf } from "@/lib/eshop/legal/termsPdf";

mkdirSync("out", { recursive: true });
writeFileSync("out/formular.pdf", (await withdrawalFormPdf(CURRENT_TERMS)).bytes);
writeFileSync("out/podminky.pdf", (await termsPdf(CURRENT_TERMS)).bytes);
console.log("ok");
