const colors = require("tailwindcss/colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  corePlugins: {
    preflight: false
  },
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "24px",
        lg: "32px"
      },
      screens: {
        "2xl": "1280px"
      }
    },
    extend: {
      colors: {
        black: colors.black,
        white: colors.white,
        zinc: colors.zinc
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
        "3xl": "24px"
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgba(0, 0, 0, 0.08)",
        md: "0 2px 6px rgba(0, 0, 0, 0.10)"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
