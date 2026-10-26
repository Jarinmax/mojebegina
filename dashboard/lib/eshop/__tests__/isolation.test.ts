// Kontrola oprávnění pro tlačítka „E-shop“ v MojeBegina: odkaz vede na
// veřejnou část (/eshop, později begina.cz). Ta nesmí sahat na přihlášení
// ani na interní datovou vrstvu MojeBegina — jinak by veřejná stránka
// mohla ukázat interní data. Hlídá se na úrovni importů.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.join(__dirname, "../../..");

function files(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (name === "__tests__") return [];
    return statSync(path.join(root, rel)).isDirectory() ? files(rel) : [rel];
  });
}

// Kód bez komentářů (komentáře o přihlášení zmiňovat smí).
const code = (file: string) =>
  readFileSync(path.join(root, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const IMPORT = /^\s*import[^;]*from\s+["']([^"']+)["']/gm;

describe("e-shop je veřejný a izolovaný od MojeBegina", () => {
  const eshopFiles = ["app/eshop", "components/eshop", "lib/eshop"].flatMap(files).filter((f) => /\.tsx?$/.test(f));

  it("nic v e-shopu neimportuje přihlášení ani interní datovou vrstvu", () => {
    const offenders = eshopFiles.flatMap((file) =>
      [...readFileSync(path.join(root, file), "utf8").matchAll(IMPORT)]
        .map((m) => m[1])
        .filter((spec) => /(^|\/)lib\/(data|auth)(\/|$)|^\.\.\/(data|auth)\//.test(spec))
        .map((spec) => `${file} → ${spec}`)
    );
    expect(offenders).toEqual([]);
  });

  it("e-shop nemá vlastní kontrolu přihlášení a proxy.ts /eshop nezamyká", () => {
    for (const file of eshopFiles) {
      expect(code(file), file).not.toMatch(/getAuthContext|requireCustomerContext/);
    }
    // Starý middleware.ts nesmí existovat (Next 16 = proxy.ts). proxy.ts jen
    // směruje podle domény — nečte přihlášení ani cookies a nic nezamyká.
    expect(statSync(path.join(root, "middleware.ts"), { throwIfNoEntry: false })).toBeUndefined();
    for (const file of ["proxy.ts", "lib/site/routing.ts", "lib/site/hosts.ts", "lib/site/flags.ts"]) {
      expect(code(file), file).not.toMatch(/getAuthContext|requireCustomerContext|cookies|session|lib\/auth|lib\/data/);
    }
  });
});
