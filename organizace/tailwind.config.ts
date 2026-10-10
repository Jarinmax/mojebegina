import type { Config } from "tailwindcss";

/**
 * Klidná, řádná paleta pro externí mozek Lucie Königsbergové: bílá plocha,
 * téměř černý text, jemně teplá šedá na linky a plochy, tlumený
 * zelenošedý (šalvějový) akcent — bez syté zeleně, gradientů a jasných barev.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        lucie: {
          50: "#FAFAF9",
          100: "#F3F2F0",
          200: "#E7E5E1",
          500: "#8C887F",
          600: "#6B675E",
          700: "#504C45",
          900: "#1C1B19",
        },
        "lucie-accent": {
          100: "#E6EAE5",
          200: "#CDD5CB",
          400: "#8C9C8A",
          600: "#5B6D5C",
          700: "#48594A",
        },
      },
    },
  },
};

export default config;
