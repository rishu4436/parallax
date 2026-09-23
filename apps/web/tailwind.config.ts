import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#07080A",
        raised: "#0E1014",
        line: "#1A1D24",
        ink: "#F4F1EA",
        dim: "#8B909A",
        gold: "#F0B90B",
        goldDim: "#C9A227",
        up: "#3DDC97",
        down: "#E85D6C",
      },
      fontFamily: {
        sans: ["var(--font-geist)", "Inter", "ui-sans-serif", "system-ui"],
        display: ["var(--font-display)", "Times New Roman", "serif"],
      },
      transitionDuration: {
        parallax: "150ms",
      },
    },
  },
  plugins: [],
};

export default config;
