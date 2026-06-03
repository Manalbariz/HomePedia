/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#080C1E",
        foreground: "#E8ECFF",
        card: "#0E1428",
        primary: "#FF4B5C",
        secondary: "#151C35",
        muted: {
          DEFAULT: "#151C35",
          foreground: "#6B7599",
        },
        accent: "#4F58E8",
        border: "rgba(255, 255, 255, 0.07)",
      },
      fontFamily: {
        display: ["'Barlow Condensed'", "sans-serif"],
        sans: ["'DM Sans'", "sans-serif"],
        mono: ["'DM Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
