// Projde public/etikety a zapíše seznam souborů do lib/etikety/manifest.ts.
//   node scripts/etikety/build-manifest.mjs
// Test lib/etikety/__tests__/manifest.test.ts hlídá, že manifest = soubory.
import { readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const base = join(root, "public", "etikety");
const ALLOWED = /\.(png|jpe?g|pdf)$/i;

export function scan() {
  const out = {};
  const walk = (rel) => {
    const abs = join(base, rel);
    const files = [];
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (e.isDirectory()) walk(rel ? `${rel}/${e.name}` : e.name);
      else if (ALLOWED.test(e.name)) files.push(e.name);
    }
    if (rel && files.length) out[rel] = files.sort((a, b) => a.localeCompare(b, "cs"));
  };
  if (existsSync(base)) walk("");
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

export function render(manifest) {
  return `// GENEROVÁNO scripts/etikety/build-manifest.mjs — neupravovat ručně.\nexport const ETIKETY_MANIFEST: Record<string, string[]> = ${JSON.stringify(manifest, null, 2)};\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(root, "lib", "etikety", "manifest.ts"), render(scan()));
  console.log("manifest zapsán");
}
