/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        leaf: {
          25: '#f7fcf6',
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        soil: {
          50: '#fbf7ef',
          100: '#f4ead8',
          200: '#ead6b8',
          300: '#d6b37b',
          600: '#8a5a22',
          800: '#4f3414',
        },
        harvest: {
          50: '#fff8e6',
          100: '#fdecc0',
          500: '#d9931e',
          700: '#9a5f12',
        },
        water: {
          50: '#eef9fb',
          100: '#d8f0f4',
          600: '#16879a',
          700: '#116f7f',
        },
        skyfield: '#e8f4f8',
      },
      boxShadow: {
        soft: '0 16px 40px rgba(15, 23, 42, 0.08)',
        panel: '0 10px 30px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
        elevated: '0 20px 55px rgba(15, 23, 42, 0.14), 0 8px 22px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
};
