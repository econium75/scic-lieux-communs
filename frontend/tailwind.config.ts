import type { Config } from "tailwindcss";

// Couleurs pilotées par des variables CSS (globals.css) : la barre latérale sombre (.rail-sombre)
// les redéfinit, et .theme-clair rétablit les valeurs claires pour ses fenêtres et menus déroulants.
const v = (nom: string) => `rgb(var(--${nom}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: v("ink-900"),
          700: v("ink-700"),
          500: v("ink-500"),
          300: v("ink-300"),
        },
        paper: {
          50: v("paper-50"),
          100: v("paper-100"),
          200: v("paper-200"),
        },
        brand: {
          50: v("brand-50"),
          500: v("brand-500"),
          700: v("brand-700"),
          900: v("brand-900"),
        },
        surface: v("surface"),
        warn: {
          500: "#d97706",
          50: "#fef3e2",
        },
        danger: {
          500: "#d0342c",
          50: "#fdecea",
        },
        ok: {
          500: "#16803c",
          50: "#e8f6ed",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        serif: ["var(--font-serif)", "ui-sans-serif", "system-ui"],
      },
      borderRadius: {
        sm: "6px",
      },
    },
  },
  plugins: [],
};
export default config;
