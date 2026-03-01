/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2D9B8A',
          light: '#E8F5F3',
          dark: '#1e7a6b',
        },
        coral: '#E8694A',
      },
    },
  },
  plugins: [],
};
