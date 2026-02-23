/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        nexus: {
          50: "var(--color-nexus-50)",
          100: "var(--color-nexus-100)",
          200: "var(--color-nexus-200)",
          300: "var(--color-nexus-300)",
          400: "var(--color-nexus-400)",
          500: "var(--color-nexus-500)",
          600: "var(--color-nexus-600)",
          700: "var(--color-nexus-700)",
          800: "var(--color-nexus-800)",
          900: "var(--color-nexus-900)",
          950: "var(--color-nexus-950)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          light: "var(--color-success-light)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          light: "var(--color-warning-light)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          light: "var(--color-danger-light)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "Noto Sans JP",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
