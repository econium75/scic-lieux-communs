import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#1a1f2e",
          700: "#3b445c",
          500: "#6b7390",
          300: "#a8adc1",
        },
        paper: {
          50: "#fafaf7",
          100: "#f3f2ec",
          200: "#e8e6dc",
        },
        brand: {
          50: "#eef3f8",
          500: "#2a5aa0",
          700: "#1f3a68",
          900: "#162a4d",
        },
        warn: {
          500: "#d97706",
          50: "#fef3e7",
        },
        danger: {
          500: "#c53030",
          50: "#fde8e8",
        },
        ok: {
          500: "#2e7d32",
          50: "#eaf5eb",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
