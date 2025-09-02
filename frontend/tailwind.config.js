export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        siregoBlue: { 600: "#1351B4", 700: "#0F4394" },
        siregoGray: { 100: "#F5F7FA", 500: "#6B7380" },
      },
      borderRadius: { "2xl": "1rem" },
      boxShadow: { soft: "0 10px 25px rgba(0,0,0,0.05)" },
    },
  },
  plugins: [],
};