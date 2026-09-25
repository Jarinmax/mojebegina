import { defineConfig } from "vitest/config";
import path from "node:path";

// Security Phase 16.5 — zrcadlí tsconfig.json "@/*": ["./*"]. Do teď test
// suite tenhle alias neměla a testy, které ho potřebovaly, se mu vyhýbaly
// relativními importy (viz CompanyMap.test.tsx). To přestalo stačit, jakmile
// testovaná komponenta (CallLogForm.tsx) sama za běhu importuje hodnotu
// (ne jen typ) přes "@/..." — typové importy se při transformaci smažou a
// nikdy se nesnaží reálně resolvovat, hodnotové ano.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
