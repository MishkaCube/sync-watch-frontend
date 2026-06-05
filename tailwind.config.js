/** @type {import('tailwindcss').Config} */
const c = (v) => `rgb(var(${v}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // grays (page / surfaces / text) — themed via CSS variables
        gray: {
          100: c('--g-100'), 200: c('--g-200'), 300: c('--g-300'),
          400: c('--g-400'), 500: c('--g-500'), 600: c('--g-600'),
          700: c('--g-700'), 800: c('--g-800'), 900: c('--g-900'),
          950: c('--g-950'),
        },
        // accent (brand) — reuses the violet utility names so existing classes work
        violet: {
          300: c('--v-300'), 400: c('--v-400'), 500: c('--v-500'),
          600: c('--v-600'), 700: c('--v-700'),
        },
        // secondary accent (amber) for highlights
        amber: {
          300: c('--a-300'), 400: c('--a-400'), 500: c('--a-500'),
        },
      },
    },
  },
  plugins: [],
}
