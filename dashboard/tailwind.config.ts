import type { Config } from "tailwindcss";

/**
 * Barvy vycházejí z oficiálního loga Beginy (public/logo-begina-mark.png):
 * černá barva písma B a čtvercového rámečku, červená barva tečky pod B
 * (nasnímáno přímo z loga: rgb(240, 0, 1)). Žádná zelená ani modrá —
 * jen černá, bílá, velmi světlá šedá a střídmý červený akcent.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "begina-primary": {
          50: "#F7F7F7",
          100: "#EDEDED",
          200: "#D4D4D4",
          // 300 chyběl — hover:border-begina-primary-300 (a další utility
          // s "300") se používá na 10 místech v appce (OrderCard, NodeCard,
          // CompanyOverviewCard, teď i CompanyMap...), ale bez definované
          // barvy Tailwind pro ně nevygeneroval žádné CSS — hover efekt byl
          // všude neviditelný, ne rozbitý navigačně. Zjištěno při vyšetřování
          // hlášené chyby s neklikacími dlaždicemi, oprava je samostatná.
          300: "#BFBFBF",
          700: "#404040",
          800: "#1A1A1A",
          900: "#000000",
        },
        "begina-accent": {
          100: "#FCE2E1",
          700: "#F00001",
          900: "#B40001",
        },
      },
    },
  },
};

export default config;
