/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#F0FAFA', 100: '#D0F0F1', 200: '#A3E0E2', 300: '#6BC9CC',
          400: '#33AEB2', 500: '#007577', 600: '#006062', 700: '#004F51',
          800: '#003C3D', 900: '#002A2B',
        },
        secondary: {
          50: '#EFF6FF', 100: '#DBEAFE', 200: '#BFDBFE', 300: '#93C5FD',
          400: '#60A5FA', 500: '#1E3A5F', 600: '#1E3A5F', 700: '#1D3557',
          800: '#152A45', 900: '#0D1B2A',
        },
      },
    },
  },
  plugins: [],
};
