import type { Config } from "tailwindcss";

/**
 * Barvy begina-primary / begina-accent jsou zatím PLACEHOLDER.
 * Až budou známé skutečné brand barvy Beginy, stačí přepsat hodnoty
 * v tomto jednom souboru — zbytek komponent na to reaguje automaticky.
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
          50: "#F0F5F3",
          100: "#D9E7E1",
          200: "#B3CFC3",
          700: "#1F4D42",
          800: "#163B32",
          900: "#0F2A23",
        },
        "begina-accent": {
          100: "#FBE9D2",
          700: "#B4791F",
          900: "#7A4A12",
        },
      },
    },
  },
};

export default config;
