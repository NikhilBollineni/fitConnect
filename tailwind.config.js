/** @type {import('tailwindcss').Config} */
const { COLORS } = require('./src/constants/theme');

module.exports = {
  presets: [require("nativewind/preset")],
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#19e65e", // Hardcoded for now due to require vs import in standard tailwind config, but matches theme.ts
          foreground: "#000000",
        },
        background: "#112116",
        "background-light": "#162b1d",
      },
    },
  },
  plugins: [],
}
