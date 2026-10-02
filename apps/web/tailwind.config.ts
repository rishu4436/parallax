import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        raised: "rgb(var(--raised) / <alpha-value>)",
        raised2: "rgb(var(--raised-2) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        lineStrong: "rgb(var(--line-strong) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        dim: "rgb(var(--dim) / <alpha-value>)",
        gold: "rgb(var(--gold) / <alpha-value>)",
        goldDim: "rgb(var(--gold-dim) / <alpha-value>)",
        up: "rgb(var(--up) / <alpha-value>)",
        down: "rgb(var(--down) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-geist)", "Inter", "ui-sans-serif", "system-ui"],
        display: ["var(--font-display)", "Times New Roman", "serif"],
      },
      screens: {
        desk: "900px",
      },
      borderRadius: {
        none: "0px",
      },
      boxShadow: {
        menu: "var(--shadow-menu)",
      },
      transitionDuration: {
        micro: "80ms",
        parallax: "150ms",
        overlay: "220ms",
      },
      zIndex: {
        menu: "30",
        drawer: "40",
        modal: "50",
      },
    },
  },
  plugins: [],
};

export default config;
